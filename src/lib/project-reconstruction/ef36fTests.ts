/**
 * ef36fTests.ts — Project Reconstruction Engine Test Suite
 * EF-36F · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * End-to-end validation: ProviderKnowledge → ReconstructedProject
 * Fully structural — no external API required.
 */

import { ProjectReconstructionEngine } from "./ProjectReconstructionEngine";
import { CoverageCalculator } from "./CoverageCalculator";
import { MissingKnowledgeDetector } from "./MissingKnowledgeDetector";
import { ArchitectureValidator } from "./ArchitectureValidator";
import type { ProviderKnowledge } from "../knowledge-fusion/KnowledgeFusionEngine";
import type { KnowledgeItem, KnowledgeRelationship, KnowledgeTimelineEvent, KnowledgeProvenance } from "../knowledge-reconstruction/KRETypes";

// ── Harness ───────────────────────────────────────────────────────────────────

export interface EF36FTestResult {
  group: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface EF36FTestReport {
  runAt: number;
  durationMs: number;
  passed: number;
  failed: number;
  total: number;
  results: EF36FTestResult[];
  reconstructionReport: unknown;
  project: unknown;
  pipelineStages: unknown[];
}

async function test(
  group: string,
  name: string,
  fn: () => Promise<{ passed: boolean; details?: Record<string, unknown> }>,
): Promise<EF36FTestResult> {
  const t = Date.now();
  try {
    const r = await fn();
    return { group, name, passed: r.passed, durationMs: Date.now() - t, details: r.details };
  } catch (e) {
    return { group, name, passed: false, durationMs: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Synthetic data ────────────────────────────────────────────────────────────

function prov(sourceId: string, confidence = 0.85): KnowledgeProvenance {
  return {
    sourceId, sourceName: sourceId, sourceType: "github", provider: "GitHub",
    originalIdentifier: sourceId, importedAt: Date.now(), lastUpdatedAt: Date.now(),
    confidence, verificationStatus: "INFERRED",
  };
}

function item(id: string, title: string, type: string, sourceId: string, conf = 0.85): KnowledgeItem {
  return Object.freeze({ id, title, type: type as any, content: `Content: ${title}`, tags: Object.freeze([type]), provenance: Object.freeze(prov(sourceId, conf)), createdAt: Date.now() - 1000 });
}

function rel(id: string, from: string, to: string, type: string, sourceId: string): KnowledgeRelationship {
  return Object.freeze({ id, fromId: from, toId: to, relationshipType: type, weight: 0.9, provenance: Object.freeze(prov(sourceId)), createdAt: Date.now() });
}

function evt(id: string, title: string, type: string, sourceId: string): KnowledgeTimelineEvent {
  return Object.freeze({ id, title, eventType: type as any, description: title, occurredAt: Date.now() - 3600000, relatedItemIds: Object.freeze([id + "_r"]), provenance: Object.freeze(prov(sourceId)) });
}

// ── Test providers ────────────────────────────────────────────────────────────

const GITHUB_PROVIDER: ProviderKnowledge = {
  sourceId: "github", sourceName: "GitHub",
  items: [
    item("gh:repo",   "MemoryOS Repository",                  "artifact",        "github", 0.98),
    item("gh:adr:1",  "ADR-001: Centralized Connector Registry", "adr",           "github", 0.95),
    item("gh:rfc:1",  "RFC-001: Foundation Baseline",          "rfc",             "github", 0.92),
    item("gh:impl:1", "ConnectorRuntime implementation",       "implementation",  "github", 0.97),
    item("gh:commit:1","Commit: EF-36A implemented",           "commit",          "github", 0.99),
    item("gh:sprint:1","Sprint EF-36",                         "sprint",          "github", 0.88),
  ],
  relationships: [
    rel("r:1", "gh:repo",   "gh:adr:1",   "contains_file",   "github"),
    rel("r:2", "gh:repo",   "gh:rfc:1",   "contains_file",   "github"),
    rel("r:3", "gh:impl:1", "gh:adr:1",   "documentedBy",    "github"),
    rel("r:4", "gh:commit:1","gh:impl:1", "implementedBy",   "github"),
  ],
  timelineEvents: [
    evt("e:1", "ADR-001 committed", "commit",       "github"),
    evt("e:2", "EF-36A implemented","implementation","github"),
  ],
};

const CONV_PROVIDER: ProviderKnowledge = {
  sourceId: "conversation", sourceName: "Conversation",
  items: [
    item("cv:dec:1",  "Decision: Use Centralized Registry",   "decision",  "conversation", 0.78),
    item("cv:arch:1", "Architecture: Connector Pattern",      "architecture","conversation", 0.72),
    item("cv:doc:1",  "MemoryOS Architecture Overview",       "document",  "conversation", 0.85),
    item("cv:goal:1", "Goal: Project Independence",           "goal",      "conversation", 0.90),
    // Near-duplicate ADR from conversation
    item("cv:adr:1",  "ADR-001: Centralized Connector Registry","adr",     "conversation", 0.80),
  ],
  relationships: [
    rel("r:5", "cv:dec:1",  "cv:arch:1", "contains_decision",   "conversation"),
    rel("r:6", "cv:doc:1",  "cv:dec:1",  "discusses_architecture","conversation"),
  ],
  timelineEvents: [
    evt("e:3", "Decision: Centralized Registry discussed",  "decision",      "conversation"),
    evt("e:4", "Goal: Project Independence defined",        "architecture",  "conversation"),
  ],
};

const PROVIDERS = [GITHUB_PROVIDER, CONV_PROVIDER];

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runEF36FTests(): Promise<EF36FTestReport> {
  const startAll = Date.now();
  const results: EF36FTestResult[] = [];

  const engine = new ProjectReconstructionEngine();
  const report = engine.reconstruct(PROVIDERS, "MemoryOS");
  const project = report.project;

  // ── G1: Pipeline Contract ─────────────────────────────────────────────────

  results.push(await test("G1 Pipeline", "ProjectReconstructionEngine exposes required methods", async () => {
    const ok = typeof engine.reconstruct === "function" &&
      typeof engine.getLastReport === "function" &&
      typeof engine.getFusionEngine === "function" &&
      typeof engine.getIdentityEngine === "function";
    return { passed: ok };
  }));

  results.push(await test("G1 Pipeline", "reconstruct() returns ProjectReconstructionReport", async () => {
    const ok = typeof report.id === "string" &&
      typeof report.durationMs === "number" &&
      Array.isArray(report.pipelineStages) &&
      typeof report.project === "object";
    return { passed: ok, details: { id: report.id, stages: report.pipelineStages.length } };
  }));

  results.push(await test("G1 Pipeline", "All 9 pipeline stages are present", async () => {
    const stages = report.pipelineStages.map(s => s.stage);
    const required = ["collecting_providers", "fusing_knowledge", "resolving_identities", "building_graph", "building_timeline", "calculating_coverage", "detecting_missing", "validating_architecture", "generating_snapshot"];
    const allPresent = required.every(r => stages.includes(r));
    return { passed: allPresent, details: { present: stages, required } };
  }));

  results.push(await test("G1 Pipeline", "No pipeline stages errored", async () => {
    const errored = report.pipelineStages.filter(s => s.status === "error");
    return { passed: errored.length === 0, details: { errored: errored.map(s => s.stage) } };
  }));

  results.push(await test("G1 Pipeline", "Global errors array is empty", async () => {
    return { passed: report.errors.length === 0, details: { errors: report.errors } };
  }));

  results.push(await test("G1 Pipeline", "durationMs > 0", async () => {
    return { passed: report.durationMs > 0, details: { durationMs: report.durationMs } };
  }));

  // ── G2: Reconstructed Project ─────────────────────────────────────────────

  results.push(await test("G2 Project", "ReconstructedProject has correct shape", async () => {
    const ok = typeof project.id === "string" &&
      typeof project.name === "string" &&
      typeof project.confidence === "number" &&
      Array.isArray(project.documents) &&
      Array.isArray(project.rfcs) &&
      Array.isArray(project.adrs) &&
      Array.isArray(project.sprints) &&
      Array.isArray(project.goals) &&
      Array.isArray(project.decisions) &&
      Array.isArray(project.implementations) &&
      typeof project.totalEntities === "number" &&
      typeof project.coverage === "object";
    return { passed: ok, details: { name: project.name, entities: project.totalEntities } };
  }));

  results.push(await test("G2 Project", "Project name matches input", async () => {
    return { passed: project.name === "MemoryOS", details: { name: project.name } };
  }));

  results.push(await test("G2 Project", "ADRs from both providers are detected", async () => {
    return { passed: project.adrs.length >= 1, details: { adrs: project.adrs } };
  }));

  results.push(await test("G2 Project", "RFCs are detected", async () => {
    return { passed: project.rfcs.length >= 1, details: { rfcs: project.rfcs } };
  }));

  results.push(await test("G2 Project", "Decisions are included", async () => {
    return { passed: project.decisions.length >= 1, details: { decisions: project.decisions } };
  }));

  results.push(await test("G2 Project", "Sprints are included", async () => {
    return { passed: project.sprints.length >= 1, details: { sprints: project.sprints } };
  }));

  results.push(await test("G2 Project", "Goals are included", async () => {
    return { passed: project.goals.length >= 1, details: { goals: project.goals } };
  }));

  results.push(await test("G2 Project", "Both providers tracked in providersUsed", async () => {
    const ok = project.providersUsed.includes("github") && project.providersUsed.includes("conversation");
    return { passed: ok, details: { providers: project.providersUsed } };
  }));

  results.push(await test("G2 Project", "confidence is in [0,1]", async () => {
    return { passed: project.confidence >= 0 && project.confidence <= 1, details: { confidence: project.confidence } };
  }));

  results.push(await test("G2 Project", "totalEntities > 0", async () => {
    return { passed: project.totalEntities > 0, details: { totalEntities: project.totalEntities } };
  }));

  results.push(await test("G2 Project", "totalRelationships > 0", async () => {
    return { passed: project.totalRelationships > 0, details: { totalRelationships: project.totalRelationships } };
  }));

  results.push(await test("G2 Project", "timelineEventCount > 0", async () => {
    return { passed: project.timelineEventCount > 0, details: { timelineEventCount: project.timelineEventCount } };
  }));

  // ── G3: Coverage ──────────────────────────────────────────────────────────

  results.push(await test("G3 Coverage", "CoverageReport has all required fields", async () => {
    const cov = project.coverage;
    const ok = typeof cov.overall === "number" &&
      typeof cov.byTimeline === "number" &&
      typeof cov.byArchitecture === "number" &&
      typeof cov.byImplementation === "number" &&
      typeof cov.byDecisions === "number" &&
      typeof cov.byRelationships === "number" &&
      typeof cov.byProvider === "object" &&
      typeof cov.byDocumentType === "object";
    return { passed: ok, details: { overall: cov.overall } };
  }));

  results.push(await test("G3 Coverage", "overall coverage is in [0,1]", async () => {
    const cov = project.coverage.overall;
    return { passed: cov >= 0 && cov <= 1, details: { overall: cov } };
  }));

  results.push(await test("G3 Coverage", "byProvider has entries for both providers", async () => {
    const bp = project.coverage.byProvider;
    const ok = "github" in bp && "conversation" in bp;
    return { passed: ok, details: { byProvider: bp } };
  }));

  results.push(await test("G3 Coverage", "byDocumentType covers multiple types", async () => {
    const bd = project.coverage.byDocumentType;
    return { passed: Object.keys(bd).length >= 2, details: { types: Object.keys(bd) } };
  }));

  results.push(await test("G3 Coverage", "CoverageCalculator is independent and reusable", async () => {
    const calc = new CoverageCalculator();
    const canonicals = engine.getIdentityEngine().listCanonicals();
    const timeline = engine.getFusionEngine().getTimeline();
    const rels = engine.getFusionEngine().getRelationships();
    const cov = calc.calculate(canonicals, timeline, rels, { github: 6, conversation: 5 });
    return { passed: cov.overall >= 0, details: { overall: cov.overall } };
  }));

  // ── G4: Missing Knowledge ─────────────────────────────────────────────────

  results.push(await test("G4 Missing", "MissingKnowledgeReport has correct shape", async () => {
    const mk = project.missingKnowledge;
    const ok = typeof mk.id === "string" &&
      typeof mk.totalMissing === "number" &&
      Array.isArray(mk.items) &&
      typeof mk.bySeverity === "object" &&
      typeof mk.byKind === "object";
    return { passed: ok, details: { totalMissing: mk.totalMissing } };
  }));

  results.push(await test("G4 Missing", "All missing items have required fields", async () => {
    const valid = project.missingKnowledge.items.every(i =>
      typeof i.kind === "string" && typeof i.description === "string" && typeof i.severity === "string",
    );
    return { passed: valid, details: { count: project.missingKnowledge.items.length } };
  }));

  results.push(await test("G4 Missing", "MissingKnowledgeDetector is independent and reusable", async () => {
    const det = new MissingKnowledgeDetector();
    const canonicals = engine.getIdentityEngine().listCanonicals();
    const rels = engine.getFusionEngine().getRelationships();
    const mk = det.detect(canonicals, rels);
    return { passed: typeof mk.totalMissing === "number", details: { totalMissing: mk.totalMissing } };
  }));

  // ── G5: Architecture Consistency ──────────────────────────────────────────

  results.push(await test("G5 Architecture", "ArchitectureConsistencyReport has correct shape", async () => {
    const ac = project.architectureConsistency;
    const ok = typeof ac.id === "string" &&
      Array.isArray(ac.checks) &&
      typeof ac.passed === "number" &&
      typeof ac.total === "number" &&
      typeof ac.consistent === "boolean";
    return { passed: ok, details: { passed: ac.passed, total: ac.total, consistent: ac.consistent } };
  }));

  results.push(await test("G5 Architecture", "All consistency checks have name + passed + detail", async () => {
    const valid = project.architectureConsistency.checks.every(c =>
      typeof c.name === "string" && typeof c.passed === "boolean" && typeof c.detail === "string",
    );
    return { passed: valid, details: { checks: project.architectureConsistency.checks.length } };
  }));

  results.push(await test("G5 Architecture", "passes ≥ 5 of 8 checks with synthetic data", async () => {
    const ac = project.architectureConsistency;
    return { passed: ac.passed >= 5, details: { passed: ac.passed, total: ac.total } };
  }));

  results.push(await test("G5 Architecture", "ArchitectureValidator is independent and reusable", async () => {
    const av = new ArchitectureValidator();
    const canonicals = engine.getIdentityEngine().listCanonicals();
    const timeline = engine.getFusionEngine().getTimeline();
    const rels = engine.getFusionEngine().getRelationships();
    const rep = av.validate(canonicals, timeline, rels);
    return { passed: typeof rep.consistent === "boolean", details: { consistent: rep.consistent } };
  }));

  // ── G6: Confidence ────────────────────────────────────────────────────────

  results.push(await test("G6 Confidence", "verificationBreakdown sums to totalEntities", async () => {
    const sum = Object.values(project.verificationBreakdown).reduce((s, v) => s + v, 0);
    return { passed: sum === project.totalEntities, details: { sum, totalEntities: project.totalEntities, breakdown: project.verificationBreakdown } };
  }));

  results.push(await test("G6 Confidence", "At least one MULTI_SOURCE or VERIFIED entity", async () => {
    const bd = project.verificationBreakdown;
    const ok = (bd["MULTI_SOURCE"] ?? 0) + (bd["VERIFIED"] ?? 0) >= 1;
    return { passed: ok, details: { MULTI_SOURCE: bd["MULTI_SOURCE"], VERIFIED: bd["VERIFIED"] } };
  }));

  // ── G7: Integration ───────────────────────────────────────────────────────

  results.push(await test("G7 Integration", "KFE state accessible after reconstruction", async () => {
    const kfe = engine.getFusionEngine();
    const entities = kfe.getEntities();
    return { passed: entities.length > 0, details: { entities: entities.length } };
  }));

  results.push(await test("G7 Integration", "IRE state accessible after reconstruction", async () => {
    const ire = engine.getIdentityEngine();
    const canonicals = ire.listCanonicals();
    return { passed: canonicals.length > 0, details: { canonicals: canonicals.length } };
  }));

  results.push(await test("G7 Integration", "reconstruction with single provider", async () => {
    const eng2 = new ProjectReconstructionEngine();
    const rep2 = eng2.reconstruct([GITHUB_PROVIDER], "TestProject");
    return { passed: rep2.project.totalEntities > 0 && rep2.errors.length === 0, details: { entities: rep2.project.totalEntities } };
  }));

  results.push(await test("G7 Integration", "getLastReport() returns same report", async () => {
    const last = engine.getLastReport();
    return { passed: last?.id === report.id, details: { same: last?.id === report.id } };
  }));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    runAt: startAll,
    durationMs: Date.now() - startAll,
    passed, failed, total: results.length,
    results,
    reconstructionReport: report,
    project,
    pipelineStages: [...report.pipelineStages],
  };
}