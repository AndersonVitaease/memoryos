/**
 * ArchitectureBaselineBuilder.ts — Sprint EF-42.9
 *
 * SRP: build a deterministic, versioned ArchitectureBaseline from a
 *      CertificationReport. The baseline captures the structural
 *      snapshot of the Official Library at the time of certification.
 *
 * Produces:
 *   - ArchitectureBaseline object (in-memory, frozen)
 *   - A structural hash (deterministic fingerprint)
 *   - A certification ID (uuid-like from hash + timestamp)
 *
 * This does NOT persist to disk (browser runtime).
 * It DOES expose exportAsJson() for display/download.
 */

import type { CertificationReport } from "./CertificationEngine";

export interface BaselineComponent {
  readonly id:         string;
  readonly file:       string;
  readonly sprint:     string;
  readonly role:       string;
  readonly layer:      string;
  readonly isSingleton: boolean;
  readonly globalKey:  string | null;
}

export interface BaselineEdge {
  readonly from: string;
  readonly to:   string;
  readonly type: string;
}

export interface ArchitectureBaseline {
  readonly version:          string;
  readonly certificationId:  string;
  readonly structuralHash:   string;
  readonly frozenAt:         string;
  readonly status:           string;
  readonly score:            number;
  readonly components:       readonly BaselineComponent[];
  readonly totalComponents:  number;
  readonly totalSingletons:  number;
  readonly pipelineStages:   number;
  readonly pipelineComplete: boolean;
  readonly graphEdges:       number;
  readonly graphIsAcyclic:   boolean;
  readonly evidenceTotal:    number;
  readonly evidencePassed:   number;
  readonly nonConformities:  number;
  readonly observations:     number;
  readonly adrReference:     string;
}

// ── Deterministic hash ────────────────────────────────────────────────────────

function deterministicHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash.toString(16).toUpperCase().padStart(8, "0");
}

function buildStructuralHash(report: CertificationReport): string {
  // Hash is derived from structural facts — not timestamps
  const structuralFacts = [
    report.scan.totalFound,
    report.scan.singletons,
    report.graph.edges.length,
    report.graph.nodes.length,
    report.graph.isAcyclic ? 1 : 0,
    report.pipeline.totalStages,
    report.pipeline.operationalStages,
    report.evidence.total,
    report.evidence.passed,
    report.evidence.failed,
    report.score,
    report.scan.components.map(c => c.id).sort().join("|"),
  ].join(":");

  const h1 = deterministicHash(structuralFacts);
  const h2 = deterministicHash(report.scan.components.map(c => c.file).sort().join(","));
  const h3 = deterministicHash(report.graph.edges.map(e => `${e.from}-${e.type}-${e.to}`).sort().join(";"));

  return `OL-${h1}-${h2}-${h3}`;
}

// ── Builder implementation ────────────────────────────────────────────────────

class ArchitectureBaselineBuilderImpl {

  build(report: CertificationReport): ArchitectureBaseline {
    const structuralHash  = buildStructuralHash(report);
    const frozenAt        = report.certifiedAt;
    const tsFragment      = new Date(frozenAt).getTime().toString(16).toUpperCase().slice(-6);
    const certificationId = `CERT-OL-${tsFragment}-${structuralHash.slice(3, 11)}`;

    const components: BaselineComponent[] = report.scan.components.map(c =>
      Object.freeze({
        id:          c.id,
        file:        c.file,
        sprint:      c.sprint,
        role:        c.role,
        layer:       c.layer,
        isSingleton: c.isSingleton,
        globalKey:   c.globalKey,
      })
    );

    return Object.freeze({
      version:          "1.0",
      certificationId,
      structuralHash,
      frozenAt,
      status:           report.status,
      score:            report.score,
      components:       Object.freeze(components),
      totalComponents:  components.length,
      totalSingletons:  components.filter(c => c.isSingleton).length,
      pipelineStages:   report.pipeline.totalStages,
      pipelineComplete: report.pipeline.isComplete,
      graphEdges:       report.graph.edges.length,
      graphIsAcyclic:   report.graph.isAcyclic,
      evidenceTotal:    report.evidence.total,
      evidencePassed:   report.evidence.passed,
      nonConformities:  report.nonConformities.length,
      observations:     report.observations.length,
      adrReference:     "ADR-Official-Library-Freeze-v1.0",
    });
  }

  exportAsJson(baseline: ArchitectureBaseline): string {
    return JSON.stringify(baseline, null, 2);
  }
}

const G = globalThis as typeof globalThis & { __EF429_BASELINE__?: ArchitectureBaselineBuilderImpl };
if (!G.__EF429_BASELINE__) G.__EF429_BASELINE__ = new ArchitectureBaselineBuilderImpl();
export const ArchitectureBaselineBuilder: ArchitectureBaselineBuilderImpl = G.__EF429_BASELINE__;