/**
 * CertificationEngine.ts — Sprint EF-42.8
 *
 * SRP: orchestrate ArchitectureScanner + DependencyGraphBuilder +
 *      PipelineInspector + EvidenceCollector into a single, authoritative
 *      CertificationReport.
 *
 * All conclusions are derived from evidence — nothing is hardcoded.
 */

import { ArchitectureScanner }    from "./ArchitectureScanner";
import type { ScanResult }         from "./ArchitectureScanner";
import { DependencyGraphBuilder }  from "./DependencyGraphBuilder";
import type { DependencyGraph }    from "./DependencyGraphBuilder";
import { PipelineInspector }       from "./PipelineInspector";
import type { PipelineInspectionResult } from "./PipelineInspector";
import { EvidenceCollector }       from "./EvidenceCollector";
import type { EvidenceCollection } from "./EvidenceCollector";

export type CertificationStatus =
  | "CERTIFIED"
  | "CERTIFIED_WITH_OBSERVATIONS"
  | "NOT_CERTIFIED";

export interface CertificationReport {
  // Executive summary
  readonly status:          CertificationStatus;
  readonly score:           number;                // 0–100
  readonly certifiedAt:     string;
  readonly durationMs:      number;

  // Detailed results
  readonly scan:            ScanResult;
  readonly graph:           DependencyGraph;
  readonly pipeline:        PipelineInspectionResult;
  readonly evidence:        EvidenceCollection;

  // Derived fields
  readonly isFrozen:        boolean;               // true when CERTIFIED
  readonly nonConformities: readonly string[];     // evidence FAIL items
  readonly observations:    readonly string[];     // evidence OBS items
  readonly risks:           readonly string[];
  readonly recommendations: readonly string[];

  // Certification matrix (one row per architectural domain)
  readonly matrix:          readonly CertMatrixRow[];
}

export interface CertMatrixRow {
  readonly domain:    string;
  readonly status:    "PASS" | "FAIL" | "OBS";
  readonly passCount: number;
  readonly total:     number;
  readonly notes:     string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function matrixRow(
  domain: string,
  evidenceItems: EvidenceCollection["items"],
  tag: string,
): CertMatrixRow {
  const relevant  = [...evidenceItems].filter(i => i.rule.toLowerCase().includes(tag.toLowerCase()) || i.component.toLowerCase().includes(tag.toLowerCase()));
  if (relevant.length === 0) {
    return Object.freeze({ domain, status: "PASS" as const, passCount: 0, total: 0, notes: "No evidence collected for domain" });
  }
  const passCount = relevant.filter(i => i.result === "PASS").length;
  const failCount = relevant.filter(i => i.result === "FAIL").length;
  const obsCount  = relevant.filter(i => i.result === "OBS").length;
  const status: CertMatrixRow["status"] = failCount > 0 ? "FAIL" : obsCount > 0 ? "OBS" : "PASS";
  return Object.freeze({ domain, status, passCount, total: relevant.length, notes: `${passCount}P ${failCount}F ${obsCount}O` });
}

// ── Engine implementation ─────────────────────────────────────────────────────

class CertificationEngineImpl {

  async certify(): Promise<CertificationReport> {
    const t0 = Date.now();

    // Phase 1: Collect all evidence
    const scan     = await ArchitectureScanner.scan();
    const graph    = DependencyGraphBuilder.build();
    const pipeline = PipelineInspector.inspect();
    const evidence = EvidenceCollector.collect(scan, graph, pipeline);

    // Phase 2: Determine status
    const hasCritical = evidence.criticalFailures > 0;
    const hasFails    = evidence.failed > 0;
    const hasObs      = evidence.observed > 0;

    const status: CertificationStatus =
      hasCritical || hasFails ? "NOT_CERTIFIED" :
      hasObs                  ? "CERTIFIED_WITH_OBSERVATIONS" :
      "CERTIFIED";

    const score = Math.round(
      ((evidence.passed + evidence.observed * 0.5) / Math.max(evidence.total, 1)) * 100,
    );

    // Phase 3: Derive non-conformities, observations, risks, recommendations
    const nonConformities = [...evidence.items]
      .filter(i => i.result === "FAIL")
      .map(i => `[${i.component}] ${i.rule}: ${i.finding}`);

    const observations = [...evidence.items]
      .filter(i => i.result === "OBS")
      .map(i => `[${i.component}] ${i.finding}`);

    const risks: string[] = [];
    if (hasCritical) risks.push("Critical architectural violations detected — pipeline integrity at risk");
    if (!pipeline.isComplete) risks.push(`${pipeline.missingStages.length} pipeline stage(s) not operational`);
    if (graph.hasCircular) risks.push("Circular dependency detected — HMR and tree-shaking at risk");
    if (observations.length > 0) risks.push("Orphan or legacy components detected — dead code accumulation risk");

    const recommendations: string[] = [];
    if (status === "CERTIFIED") {
      recommendations.push("Architecture is certified — proceed with EF-43 Authority Engine.");
      recommendations.push("No structural changes to Official Library without formal ADR.");
    } else if (status === "CERTIFIED_WITH_OBSERVATIONS") {
      recommendations.push("Archive legacy files identified as orphans before EF-43.");
      recommendations.push("Open ADR to formally deprecate identified legacy modules.");
    } else {
      recommendations.push("Resolve all FAIL evidence before retrying certification.");
      recommendations.push("Do not proceed to EF-43 until CERTIFIED is achieved.");
    }

    // Phase 4: Build certification matrix
    const matrix: CertMatrixRow[] = [
      matrixRow("Bootstrap",       evidence.items, "Bootstrap"),
      matrixRow("Discovery",       evidence.items, "Discovery"),
      matrixRow("Loader",          evidence.items, "Loader"),
      matrixRow("Parser",          evidence.items, "Parser"),
      matrixRow("ChunkBuilder",    evidence.items, "ChunkBuilder"),
      matrixRow("MetadataBuilder", evidence.items, "MetadataBuilder"),
      matrixRow("ChunkIndex",      evidence.items, "ChunkIndex"),
      matrixRow("ContentIndexer",  evidence.items, "ContentIndexer"),
      matrixRow("LibraryIndex",    evidence.items, "OfficialLibraryIndex"),
      matrixRow("Retrieval",       evidence.items, "Retrieval"),
      matrixRow("Status",          evidence.items, "Status"),
      matrixRow("Pipeline",        evidence.items, "pipeline"),
      matrixRow("Singletons",      evidence.items, "singleton"),
      matrixRow("Dependencies",    evidence.items, "dependency"),
    ];

    return Object.freeze({
      status,
      score,
      certifiedAt:     new Date().toISOString(),
      durationMs:      Date.now() - t0,
      scan:            Object.freeze(scan),
      graph:           Object.freeze(graph),
      pipeline:        Object.freeze(pipeline),
      evidence:        Object.freeze(evidence),
      isFrozen:        status === "CERTIFIED",
      nonConformities: Object.freeze(nonConformities),
      observations:    Object.freeze(observations),
      risks:           Object.freeze(risks),
      recommendations: Object.freeze(recommendations),
      matrix:          Object.freeze(matrix),
    });
  }
}

const G = globalThis as typeof globalThis & { __EF428_CERT_ENGINE__?: CertificationEngineImpl };
if (!G.__EF428_CERT_ENGINE__) G.__EF428_CERT_ENGINE__ = new CertificationEngineImpl();
export const CertificationEngine: CertificationEngineImpl = G.__EF428_CERT_ENGINE__;