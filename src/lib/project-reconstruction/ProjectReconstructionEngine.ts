/**
 * ProjectReconstructionEngine.ts — End-to-End Project Reconstruction
 * EF-36F · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * PIPELINE:
 *   ProviderKnowledge[]
 *   → KnowledgeFusionEngine  (EF-36D)
 *   → IdentityResolutionEngine (EF-36E)
 *   → CoverageCalculator
 *   → MissingKnowledgeDetector
 *   → ArchitectureValidator
 *   → ReconstructedProject
 *
 * RULES:
 *   - Orchestrates existing engines only — no new reconstruction algorithms
 *   - Provider-agnostic: accepts ProviderKnowledge[] from any source
 *   - Does not modify KRE, KFE, or IRE
 */

import { KnowledgeFusionEngine } from "../knowledge-fusion/KnowledgeFusionEngine";
import type { ProviderKnowledge } from "../knowledge-fusion/KnowledgeFusionEngine";
import { IdentityResolutionEngine } from "../identity-resolution/IdentityResolutionEngine";
import { CoverageCalculator } from "./CoverageCalculator";
import { MissingKnowledgeDetector } from "./MissingKnowledgeDetector";
import { ArchitectureValidator } from "./ArchitectureValidator";
import type {
  ReconstructedProject, ProjectReconstructionReport,
  PipelineStage, PipelineStageDiagnostic,
} from "./PRTypes";
import { makePRId } from "./PRTypes";
import type { IRVerificationStatus } from "../identity-resolution/IRTypes";

// ── Engine ────────────────────────────────────────────────────────────────────

export class ProjectReconstructionEngine {
  private readonly fusionEngine = new KnowledgeFusionEngine();
  private readonly identityEngine = new IdentityResolutionEngine();
  private readonly coverageCalc = new CoverageCalculator();
  private readonly missingDetector = new MissingKnowledgeDetector();
  private readonly archValidator = new ArchitectureValidator();

  private lastReport: ProjectReconstructionReport | null = null;

  // ── Main Reconstruction ────────────────────────────────────────────────────

  reconstruct(providers: ProviderKnowledge[], projectName = "MemoryOS"): ProjectReconstructionReport {
    const startAll = Date.now();
    const stageDiags: PipelineStageDiagnostic[] = [];
    const errors: string[] = [];

    // ── Stage 1: Collect Providers ─────────────────────────────────────────
    stageDiags.push(this._stage("collecting_providers", () => ({
      itemsProcessed: providers.length,
    })));

    // ── Stage 2: Knowledge Fusion ──────────────────────────────────────────
    let fusionReport: ReturnType<typeof this.fusionEngine.getLastReport> = null;
    stageDiags.push(this._stage("fusing_knowledge", () => {
      fusionReport = this.fusionEngine.fuse(providers);
      return { itemsProcessed: fusionReport?.totalItemsReceived ?? 0 };
    }, errors));

    const fusedEntities = this.fusionEngine.getEntities();
    const fusedRelationships = this.fusionEngine.getRelationships();
    const fusedTimeline = this.fusionEngine.getTimeline();
    const fusionSnapshot = this.fusionEngine.getLatestSnapshot();

    // ── Stage 3: Identity Resolution ───────────────────────────────────────
    let identityReport: ReturnType<typeof this.identityEngine.getLastReport> = null;
    stageDiags.push(this._stage("resolving_identities", () => {
      identityReport = this.identityEngine.resolve({
        entities: fusedEntities,
        relationships: fusedRelationships,
        timelineEvents: fusedTimeline,
      });
      return { itemsProcessed: identityReport?.canonicalEntitiesCreated ?? 0 };
    }, errors));

    const canonicals = this.identityEngine.listCanonicals();
    const identityConflicts = this.identityEngine.getConflicts();
    const identityGraph = this.identityEngine.graph;

    // ── Stage 4: Build Graph / Timeline ───────────────────────────────────
    stageDiags.push(this._stage("building_graph", () => ({
      itemsProcessed: identityGraph.nodeCount,
    })));

    stageDiags.push(this._stage("building_timeline", () => ({
      itemsProcessed: fusedTimeline.length,
    })));

    // ── Stage 5: Coverage ──────────────────────────────────────────────────
    let coverageReport = this.coverageCalc.calculate(canonicals, fusedTimeline, fusedRelationships, fusionReport?.providerBreakdown ?? {});
    stageDiags.push(this._stage("calculating_coverage", () => ({
      itemsProcessed: canonicals.length,
    })));

    // ── Stage 6: Missing Knowledge ─────────────────────────────────────────
    let missingReport = this.missingDetector.detect(canonicals, fusedRelationships);
    stageDiags.push(this._stage("detecting_missing", () => ({
      itemsProcessed: missingReport.totalMissing,
    })));

    // ── Stage 7: Architecture Validation ──────────────────────────────────
    let archReport = this.archValidator.validate(canonicals, fusedTimeline, fusedRelationships);
    stageDiags.push(this._stage("validating_architecture", () => ({
      itemsProcessed: archReport.total,
    })));

    // ── Stage 8: Snapshot + Project assembly ──────────────────────────────
    let project: ReconstructedProject;
    stageDiags.push(this._stage("generating_snapshot", () => {
      project = this._assembleProject(
        projectName, providers, canonicals, fusedRelationships,
        fusedTimeline, coverageReport, missingReport, archReport,
        identityReport, fusionReport,
      );
      return { itemsProcessed: 1 };
    }, errors));

    stageDiags.push(this._stage("complete", () => ({ itemsProcessed: 0 })));

    const report: ProjectReconstructionReport = Object.freeze({
      id: makePRId("prr"),
      generatedAt: Date.now(),
      durationMs: Date.now() - startAll,
      pipelineStages: Object.freeze(stageDiags),
      project: project!,
      fusionReport,
      identityReport,
      errors: Object.freeze(errors),
    });

    this.lastReport = report;
    return report;
  }

  // ── Project Assembly ───────────────────────────────────────────────────────

  private _assembleProject(
    name: string,
    providers: ProviderKnowledge[],
    canonicals: ReturnType<typeof this.identityEngine.listCanonicals>,
    relationships: ReturnType<typeof this.fusionEngine.getRelationships>,
    timeline: ReturnType<typeof this.fusionEngine.getTimeline>,
    coverage: ReturnType<typeof this.coverageCalc.calculate>,
    missing: ReturnType<typeof this.missingDetector.detect>,
    arch: ReturnType<typeof this.archValidator.validate>,
    identityReport: ReturnType<typeof this.identityEngine.getLastReport>,
    fusionReport: ReturnType<typeof this.fusionEngine.getLastReport>,
  ): ReconstructedProject {
    const byType = (type: string) => canonicals.filter(e => e.entityType === type).map(e => e.canonicalName);

    const avgConf = canonicals.length > 0
      ? canonicals.reduce((s, e) => s + e.confidence, 0) / canonicals.length : 0;

    const verBreakdown: Record<IRVerificationStatus, number> = {
      VERIFIED: 0, MULTI_SOURCE: 0, SINGLE_SOURCE: 0, INFERRED: 0, CONFLICT: 0, UNKNOWN: 0,
    };
    for (const e of canonicals) verBreakdown[e.verificationStatus]++;

    // Risks from conflicts
    const fusionConflicts = this.fusionEngine.getConflicts();
    const identityConflicts = this.identityEngine.getConflicts();
    const risks = [
      ...fusionConflicts.filter(c => c.severity === "high" || c.severity === "critical").map(c => c.description),
      ...identityConflicts.filter(c => c.severity === "high" || c.severity === "critical").map(c => c.description),
    ];

    // Dependencies from relationships
    const dependencies = relationships
      .filter(r => r.relationshipType === "depends_on" || r.relationshipType === "referencedBy")
      .map(r => `${r.fromId} → ${r.toId}`);

    return Object.freeze({
      id: makePRId("proj"),
      name,
      reconstructedAt: Date.now(),
      documents: Object.freeze(byType("document")),
      rfcs: Object.freeze(byType("rfc")),
      adrs: Object.freeze(byType("adr")),
      sprints: Object.freeze(byType("sprint")),
      goals: Object.freeze(byType("goal")),
      connectors: Object.freeze(byType("connector")),
      components: Object.freeze([...byType("implementation"), ...byType("artifact")]),
      decisions: Object.freeze(byType("decision")),
      implementations: Object.freeze(byType("implementation")),
      totalEntities: canonicals.length,
      totalRelationships: relationships.length,
      timelineEventCount: timeline.length,
      snapshotCount: 1,
      risks: Object.freeze(risks),
      dependencies: Object.freeze(dependencies),
      confidence: parseFloat(avgConf.toFixed(4)),
      coverage,
      verificationBreakdown: Object.freeze(verBreakdown),
      missingKnowledge: missing,
      architectureConsistency: arch,
      providersUsed: Object.freeze(providers.map(p => p.sourceId)),
    });
  }

  // ── Stage helper ───────────────────────────────────────────────────────────

  private _stage(
    stage: PipelineStage,
    fn: () => { itemsProcessed: number },
    errors?: string[],
  ): PipelineStageDiagnostic {
    const t = Date.now();
    try {
      const { itemsProcessed } = fn();
      return Object.freeze({ stage, status: "complete", durationMs: Date.now() - t, itemsProcessed, errors: Object.freeze([]) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors?.push(`Stage "${stage}" failed: ${msg}`);
      return Object.freeze({ stage, status: "error", durationMs: Date.now() - t, itemsProcessed: 0, errors: Object.freeze([msg]) });
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getLastReport(): ProjectReconstructionReport | null { return this.lastReport; }
  getFusionEngine(): KnowledgeFusionEngine { return this.fusionEngine; }
  getIdentityEngine(): IdentityResolutionEngine { return this.identityEngine; }
}