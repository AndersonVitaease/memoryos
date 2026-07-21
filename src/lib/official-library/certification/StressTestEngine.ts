/**
 * StressTestEngine.ts — Sprint EF-42.10
 *
 * SRP: generate synthetic architectures, run them through the
 *      CertificationEngine pipeline via mock data, and verify
 *      the engine's diagnostic accuracy under adversarial conditions.
 *
 * This does NOT modify any production component.
 * All architectures are built in-memory as plain objects
 * matching the types from ArchitectureScanner, DependencyGraphBuilder,
 * PipelineInspector, and EvidenceCollector.
 *
 * Tests:
 *   Stress     — synthetic broken architectures (must → NOT_CERTIFIED)
 *   FalsePos   — correct architectures (must never → FAIL)
 *   FalseNeg   — broken architectures (must never → CERTIFIED)
 *   Consistency — 100 runs on same input, identical output
 *   Performance — 10 / 50 / 100 / 500 components
 *   Chaos      — random mutations, correct diagnosis expected
 */

import type { ScannedComponent, ScanResult, ComponentRole } from "./ArchitectureScanner";
import type { DependencyEdge, GraphNode, DependencyGraph, DependencyType } from "./DependencyGraphBuilder";
import type { PipelineStageResult, PipelineInspectionResult } from "./PipelineInspector";
import { EvidenceCollector } from "./EvidenceCollector";
import { ArchitectureBaselineBuilder } from "./ArchitectureBaselineBuilder";
import type { CertificationStatus } from "./CertificationEngine";

// ── Synthetic types ───────────────────────────────────────────────────────────

export type StressCategory =
  | "duplicate_component" | "incomplete_pipeline" | "inverted_pipeline"
  | "multiple_bootstraps" | "multiple_chunk_indexes" | "multiple_retrievals"
  | "circular_dependency" | "orphan_components" | "layer_inversion"
  | "role_duplication" | "missing_singleton" | "correct_architecture"
  | "chaos_mutation" | "performance";

export interface StressScenario {
  readonly id:            string;
  readonly category:      StressCategory;
  readonly description:   string;
  readonly faultInserted: string;
  readonly expectedStatus: CertificationStatus | "NOT_CERTIFIED_OR_OBS";
}

export interface StressResult {
  readonly scenario:       StressScenario;
  readonly actualStatus:   CertificationStatus;
  readonly actualScore:    number;
  readonly passed:         boolean;        // scenario expectation met
  readonly isFalsePositive: boolean;       // correct arch got FAIL
  readonly isFalseNegative: boolean;       // broken arch got CERTIFIED
  readonly evidenceTotal:  number;
  readonly evidenceFailed: number;
  readonly durationMs:     number;
  readonly finding:        string;
}

export interface ConsistencyResult {
  readonly runs:         number;
  readonly allIdentical: boolean;
  readonly uniqueScores: number[];
  readonly uniqueHashes: string[];
  readonly uniqueStatuses: string[];
  readonly durationMs:   number;
}

export interface PerformanceResult {
  readonly componentCount: number;
  readonly durationMs:     number;
  readonly scoreComputed:  number;
  readonly evidenceCount:  number;
}

export interface RobustnessReport {
  readonly totalScenarios:     number;
  readonly passed:             number;
  readonly failed:             number;
  readonly falsePositives:     number;
  readonly falseNegatives:     number;
  readonly detectionRate:      number;   // 0-100
  readonly consistency:        ConsistencyResult;
  readonly performance:        PerformanceResult[];
  readonly stressResults:      StressResult[];
  readonly totalDurationMs:    number;
  readonly generatedAt:        string;
  readonly finalVerdict:       "RESILIENT" | "FLAWED";
  readonly certifications:     string[];  // earned certification labels
}

// ── Synthetic architecture factory ────────────────────────────────────────────

function makeComponent(
  overrides: Partial<ScannedComponent> & { id: string }
): ScannedComponent {
  return Object.freeze({
    file:          `synthetic/${overrides.id}.ts`,
    sprint:        "EF-STRESS",
    role:          "unknown" as ComponentRole,
    isSingleton:   true,
    globalKey:     `__STRESS_${overrides.id.toUpperCase()}__`,
    hasFreeze:     true,
    exportShape:   Object.freeze([]),
    layer:         "bootstrap" as const,
    ...overrides,
  } as ScannedComponent);
}

function makeScanResult(components: ScannedComponent[]): ScanResult {
  const byRole: Record<string, number> = {};
  const byLayer: Record<string, number> = {};
  for (const c of components) {
    byRole[c.role]   = (byRole[c.role]   ?? 0) + 1;
    byLayer[c.layer] = (byLayer[c.layer] ?? 0) + 1;
  }
  return Object.freeze({
    components:  Object.freeze(components),
    totalFound:  components.length,
    singletons:  components.filter(c => c.isSingleton).length,
    byRole:      Object.freeze(byRole) as ScanResult["byRole"],
    byLayer:     Object.freeze(byLayer),
    scannedAt:   new Date().toISOString(),
    durationMs:  1,
  });
}

function makeEdge(from: string, to: string, type: DependencyType = "calls",
  fromLayer = "bootstrap", toLayer = "content", isViolation = false): DependencyEdge {
  return Object.freeze({ from, to, type, fromLayer, toLayer, isViolation,
    violation: isViolation ? ("layer_inversion" as const) : undefined });
}

function makeGraph(edges: DependencyEdge[], forceCircular = false): DependencyGraph {
  const allIds = new Set([...edges.map(e => e.from), ...edges.map(e => e.to)]);
  const nodes: GraphNode[] = [...allIds].map(id => {
    const inDeg  = edges.filter(e => e.to === id).length;
    const outDeg = edges.filter(e => e.from === id).length;
    return Object.freeze({ id, layer: "content", role: "unknown", file: `${id}.ts`, inDegree: inDeg, outDegree: outDeg, isOrphan: inDeg === 0 && id !== "Bootstrap" });
  });
  const violations = edges.filter(e => e.isViolation);
  return Object.freeze({ nodes: Object.freeze(nodes), edges: Object.freeze(edges), violations: Object.freeze(violations), hasCircular: forceCircular, isAcyclic: !forceCircular, builtAt: new Date().toISOString(), durationMs: 1 });
}

function makeStage(stage: string, operational: boolean, globalKey: string | null = null): PipelineStageResult {
  return Object.freeze({ stage, responsible: `globalThis.${globalKey}`, file: `${stage}.ts`, input: "void", output: "Result", isOperational: operational, globalKey, methodsFound: Object.freeze(operational ? ["run","stats"] : []), durationMs: 1 });
}

function makePipeline(stages: PipelineStageResult[]): PipelineInspectionResult {
  const operational = stages.filter(s => s.isOperational).length;
  const missing = stages.filter(s => !s.isOperational).map(s => s.stage);
  return Object.freeze({ stages: Object.freeze(stages), totalStages: stages.length, operationalStages: operational, isComplete: missing.length === 0, missingStages: Object.freeze(missing), inspectedAt: new Date().toISOString(), durationMs: 1 });
}

// ── Correct (golden) architecture ─────────────────────────────────────────────

function buildGoldenScan(): ScanResult {
  return makeScanResult([
    makeComponent({ id: "OfficialLibraryAutoBootstrap", role: "bootstrap",       layer: "bootstrap", isSingleton: true }),
    makeComponent({ id: "OfficialDocumentDiscovery",    role: "discovery",       layer: "bootstrap", isSingleton: true }),
    makeComponent({ id: "OfficialDocumentLoader",       role: "loader",          layer: "bootstrap", isSingleton: true }),
    makeComponent({ id: "OfficialLibraryStatus",        role: "status",          layer: "status",    isSingleton: true }),
    makeComponent({ id: "OfficialDocumentParser",       role: "parser",          layer: "content",   isSingleton: true }),
    makeComponent({ id: "ChunkBuilder",                 role: "chunk_builder",   layer: "content",   isSingleton: true }),
    makeComponent({ id: "ChunkMetadataBuilder",         role: "metadata_builder",layer: "content",   isSingleton: true }),
    makeComponent({ id: "ChunkIndex",                   role: "chunk_index",     layer: "content",   isSingleton: true }),
    makeComponent({ id: "ContentIndexer",               role: "content_indexer", layer: "content",   isSingleton: true }),
    makeComponent({ id: "OfficialLibraryIndex",         role: "library_index",   layer: "index",     isSingleton: true }),
    makeComponent({ id: "OfficialRetrievalEngine",      role: "retrieval",       layer: "retrieval", isSingleton: true }),
  ]);
}

function buildGoldenGraph(): DependencyGraph {
  return makeGraph([
    makeEdge("OfficialLibraryAutoBootstrap", "OfficialDocumentDiscovery",  "calls",      "bootstrap", "bootstrap"),
    makeEdge("OfficialLibraryAutoBootstrap", "OfficialDocumentLoader",     "calls",      "bootstrap", "bootstrap"),
    makeEdge("OfficialLibraryAutoBootstrap", "ContentIndexer",             "orchestrates","bootstrap","content"),
    makeEdge("OfficialLibraryAutoBootstrap", "ChunkIndex",                 "writes",     "bootstrap", "content"),
    makeEdge("OfficialLibraryAutoBootstrap", "OfficialLibraryIndex",       "writes",     "bootstrap", "index"),
    makeEdge("ContentIndexer",              "OfficialDocumentParser",      "calls",      "content",   "content"),
    makeEdge("ContentIndexer",              "ChunkBuilder",                "calls",      "content",   "content"),
    makeEdge("ContentIndexer",              "ChunkIndex",                  "writes",     "content",   "content"),
    makeEdge("ChunkBuilder",               "ChunkMetadataBuilder",         "calls",      "content",   "content"),
    makeEdge("OfficialRetrievalEngine",    "OfficialLibraryIndex",         "reads_meta", "retrieval", "index"),
    makeEdge("OfficialRetrievalEngine",    "ChunkIndex",                   "reads_content","retrieval","content"),
    makeEdge("OfficialLibraryStatus",      "ChunkIndex",                   "reads_stats","status",    "content"),
  ]);
}

function buildGoldenPipeline(): PipelineInspectionResult {
  return makePipeline([
    makeStage("Bootstrap",     true,  "__EF426_AUTOBOOTSTRAP__"),
    makeStage("Discovery",     true,  "__EF426_DISCOVERY__"),
    makeStage("Loader",        true,  "__EF426_LOADER__"),
    makeStage("Parser",        true,  "__OL_DOC_PARSER__"),
    makeStage("ChunkBuilder",  true,  "__OL_CHUNK_BUILDER__"),
    makeStage("MetadataBuilder",true, "__OL_CHUNK_META_BUILDER__"),
    makeStage("ChunkIndex",    true,  "__OL_CHUNK_INDEX__"),
    makeStage("ContentIndexer",true,  "__OL_CONTENT_INDEXER__"),
    makeStage("LibraryIndex",  true,  "__OL_INDEX__"),
    makeStage("Retrieval",     true,  "__OL_RETRIEVAL_ENGINE__"),
    makeStage("Status",        true,  "__EF426_STATUS__"),
  ]);
}

// ── Derive status from evidence (same logic as CertificationEngine) ───────────

function deriveStatus(ev: ReturnType<typeof EvidenceCollector.collect>): CertificationStatus {
  if (ev.criticalFailures > 0 || ev.failed > 0) return "NOT_CERTIFIED";
  if (ev.observed > 0) return "CERTIFIED_WITH_OBSERVATIONS";
  return "CERTIFIED";
}

function deriveScore(ev: ReturnType<typeof EvidenceCollector.collect>): number {
  return Math.round(((ev.passed + ev.observed * 0.5) / Math.max(ev.total, 1)) * 100);
}

// ── Scenario definitions ──────────────────────────────────────────────────────

function buildScenarios(): StressScenario[] {
  return [
    { id: "S001", category: "correct_architecture",   description: "Golden architecture — all correct",                    faultInserted: "none",                   expectedStatus: "CERTIFIED" },
    { id: "S002", category: "duplicate_component",    description: "Duplicate ChunkIndex singleton",                       faultInserted: "chunk_index x2",         expectedStatus: "NOT_CERTIFIED_OR_OBS" },
    { id: "S003", category: "duplicate_component",    description: "Duplicate OfficialLibraryIndex singleton",             faultInserted: "library_index x2",       expectedStatus: "NOT_CERTIFIED_OR_OBS" },
    { id: "S004", category: "duplicate_component",    description: "Duplicate OfficialRetrievalEngine singleton",          faultInserted: "retrieval x2",           expectedStatus: "NOT_CERTIFIED_OR_OBS" },
    { id: "S005", category: "multiple_bootstraps",    description: "Two bootstrap singletons",                             faultInserted: "bootstrap x2",           expectedStatus: "NOT_CERTIFIED" },
    { id: "S006", category: "incomplete_pipeline",    description: "Parser stage missing",                                 faultInserted: "parser stage removed",   expectedStatus: "NOT_CERTIFIED" },
    { id: "S007", category: "incomplete_pipeline",    description: "ChunkIndex stage missing",                             faultInserted: "chunk_index stage removed",expectedStatus: "NOT_CERTIFIED" },
    { id: "S008", category: "incomplete_pipeline",    description: "Retrieval stage missing",                              faultInserted: "retrieval stage removed",  expectedStatus: "NOT_CERTIFIED" },
    { id: "S009", category: "incomplete_pipeline",    description: "All stages missing",                                   faultInserted: "all stages removed",     expectedStatus: "NOT_CERTIFIED" },
    { id: "S010", category: "circular_dependency",    description: "Circular dependency: A→B→C→A",                        faultInserted: "cycle A→B→C→A",          expectedStatus: "NOT_CERTIFIED" },
    { id: "S011", category: "circular_dependency",    description: "Self-loop: A→A",                                      faultInserted: "self loop",              expectedStatus: "NOT_CERTIFIED" },
    { id: "S012", category: "layer_inversion",        description: "Retrieval writes to content",                         faultInserted: "retrieval writes content", expectedStatus: "NOT_CERTIFIED" },
    { id: "S013", category: "orphan_components",      description: "3 orphan components",                                  faultInserted: "3 orphans",              expectedStatus: "NOT_CERTIFIED_OR_OBS" },
    { id: "S014", category: "missing_singleton",      description: "Bootstrap is not a singleton",                        faultInserted: "bootstrap non-singleton", expectedStatus: "NOT_CERTIFIED" },
    { id: "S015", category: "missing_singleton",      description: "5 components not singletons",                         faultInserted: "5 missing singletons",   expectedStatus: "NOT_CERTIFIED" },
    { id: "S016", category: "role_duplication",       description: "Two components with role=retrieval",                  faultInserted: "role_duplication retrieval",expectedStatus: "NOT_CERTIFIED_OR_OBS" },
    { id: "S017", category: "inverted_pipeline",      description: "Pipeline order inverted (Retrieval before Bootstrap)", faultInserted: "pipeline inverted",      expectedStatus: "NOT_CERTIFIED_OR_OBS" },
    { id: "S018", category: "multiple_chunk_indexes", description: "Three ChunkIndex singletons",                         faultInserted: "chunk_index x3",         expectedStatus: "NOT_CERTIFIED_OR_OBS" },
    { id: "S019", category: "multiple_retrievals",    description: "Two retrieval engines",                                faultInserted: "retrieval x2",           expectedStatus: "NOT_CERTIFIED_OR_OBS" },
    { id: "S020", category: "correct_architecture",   description: "Golden architecture — second run (no regression)",    faultInserted: "none",                   expectedStatus: "CERTIFIED" },
    { id: "S021", category: "chaos_mutation",         description: "Random single component removal",                     faultInserted: "random component removed",expectedStatus: "NOT_CERTIFIED_OR_OBS" },
    { id: "S022", category: "chaos_mutation",         description: "Random layer reassignment",                           faultInserted: "layer chaos",            expectedStatus: "NOT_CERTIFIED" },
    { id: "S023", category: "chaos_mutation",         description: "All components non-singleton",                        faultInserted: "all non-singleton",      expectedStatus: "NOT_CERTIFIED" },
    { id: "S024", category: "correct_architecture",   description: "Golden architecture — third run (determinism check)", faultInserted: "none",                   expectedStatus: "CERTIFIED" },
    { id: "S025", category: "duplicate_component",    description: "All core components duplicated",                      faultInserted: "all duplicated",         expectedStatus: "NOT_CERTIFIED_OR_OBS" },
  ];
}

// ── Build synthetic ScanResult/Graph/Pipeline per scenario ────────────────────

function buildScanForScenario(s: StressScenario): ScanResult {
  const golden = buildGoldenScan().components;
  switch (s.id) {
    case "S002": return makeScanResult([...golden, makeComponent({ id: "ChunkIndex2", role: "chunk_index", layer: "content", isSingleton: true })]);
    case "S003": return makeScanResult([...golden, makeComponent({ id: "OfficialLibraryIndex2", role: "library_index", layer: "index", isSingleton: true })]);
    case "S004": return makeScanResult([...golden, makeComponent({ id: "OfficialRetrievalEngine2", role: "retrieval", layer: "retrieval", isSingleton: true })]);
    case "S005": return makeScanResult([...golden, makeComponent({ id: "Bootstrap2", role: "bootstrap", layer: "bootstrap", isSingleton: true })]);
    case "S014": return makeScanResult(golden.map(c => c.id === "OfficialLibraryAutoBootstrap" ? makeComponent({ ...c, isSingleton: false, globalKey: null }) : c));
    case "S015": return makeScanResult(golden.map((c, i) => i < 5 ? makeComponent({ ...c, isSingleton: false, globalKey: null }) : c));
    case "S016": return makeScanResult([...golden, makeComponent({ id: "AltRetrieval", role: "retrieval", layer: "retrieval", isSingleton: true })]);
    case "S018": return makeScanResult([...golden, makeComponent({ id: "ChunkIdx2", role: "chunk_index", layer: "content" }), makeComponent({ id: "ChunkIdx3", role: "chunk_index", layer: "content" })]);
    case "S019": return makeScanResult([...golden, makeComponent({ id: "Retrieval2", role: "retrieval", layer: "retrieval" })]);
    case "S023": return makeScanResult(golden.map(c => makeComponent({ ...c, isSingleton: false, globalKey: null })));
    case "S025": return makeScanResult([...golden, ...golden.map(c => makeComponent({ ...c, id: c.id + "_DUP" }))]);
    case "S021": { const reduced = [...golden]; reduced.splice(Math.floor(Math.random() * reduced.length), 1); return makeScanResult(reduced); }
    case "S022": return makeScanResult(golden.map(c => makeComponent({ ...c, layer: c.layer === "retrieval" ? "bootstrap" : c.layer })));
    default:     return makeScanResult([...golden]);
  }
}

function buildGraphForScenario(s: StressScenario): DependencyGraph {
  const golden = buildGoldenGraph();
  switch (s.id) {
    case "S010": return makeGraph([...golden.edges, makeEdge("NodeA","NodeB","calls","content","content"), makeEdge("NodeB","NodeC","calls","content","content"), makeEdge("NodeC","NodeA","calls","content","content")], true);
    case "S011": return makeGraph([...golden.edges, makeEdge("NodeA","NodeA","calls","content","content")], true);
    case "S012": return makeGraph([...golden.edges, makeEdge("OfficialRetrievalEngine","ChunkIndex","writes","retrieval","content",true)]);
    case "S013": {
      const g = makeGraph(golden.edges);
      // orphans: nodes with inDegree=0 and not bootstrap
      const nodes = [...g.nodes, Object.freeze({ id:"Orphan1",layer:"content",role:"unknown",file:"o1.ts",inDegree:0,outDegree:0,isOrphan:true }),
        Object.freeze({ id:"Orphan2",layer:"content",role:"unknown",file:"o2.ts",inDegree:0,outDegree:0,isOrphan:true }),
        Object.freeze({ id:"Orphan3",layer:"content",role:"unknown",file:"o3.ts",inDegree:0,outDegree:0,isOrphan:true })];
      return Object.freeze({ ...g, nodes: Object.freeze(nodes) });
    }
    default: return golden;
  }
}

function buildPipelineForScenario(s: StressScenario): PipelineInspectionResult {
  const goldenStages = buildGoldenPipeline().stages;
  switch (s.id) {
    case "S006": return makePipeline(goldenStages.map(st => st.stage === "Parser"      ? makeStage("Parser",      false, null) : st));
    case "S007": return makePipeline(goldenStages.map(st => st.stage === "ChunkIndex"  ? makeStage("ChunkIndex",  false, null) : st));
    case "S008": return makePipeline(goldenStages.map(st => st.stage === "Retrieval"   ? makeStage("Retrieval",   false, null) : st));
    case "S009": return makePipeline(goldenStages.map(st => makeStage(st.stage, false, null)));
    case "S017": return makePipeline([...goldenStages].reverse());
    default:     return makePipeline([...goldenStages]);
  }
}

// ── Scenario runner ───────────────────────────────────────────────────────────

function runScenario(scenario: StressScenario): StressResult {
  const t0 = Date.now();
  const scan     = buildScanForScenario(scenario);
  const graph    = buildGraphForScenario(scenario);
  const pipeline = buildPipelineForScenario(scenario);
  const evidence = EvidenceCollector.collect(scan, graph, pipeline);

  const actualStatus = deriveStatus(evidence);
  const actualScore  = deriveScore(evidence);

  const isFalsePositive = scenario.category === "correct_architecture" && evidence.failed > 0;
  const isFalseNegative = scenario.category !== "correct_architecture"
    && scenario.expectedStatus === "NOT_CERTIFIED"
    && actualStatus === "CERTIFIED";

  let passed: boolean;
  if (scenario.expectedStatus === "NOT_CERTIFIED_OR_OBS") {
    passed = actualStatus !== "CERTIFIED";
  } else if (scenario.expectedStatus === "CERTIFIED") {
    passed = actualStatus === "CERTIFIED";
  } else {
    passed = actualStatus === "NOT_CERTIFIED";
  }

  // Override: false positives or false negatives are always a failure
  if (isFalsePositive || isFalseNegative) passed = false;

  const finding = passed
    ? `Correctly diagnosed: ${actualStatus} (score ${actualScore})`
    : `Misdiagnosis: expected ${scenario.expectedStatus}, got ${actualStatus} (score ${actualScore})`;

  return Object.freeze({ scenario, actualStatus, actualScore, passed, isFalsePositive, isFalseNegative, evidenceTotal: evidence.total, evidenceFailed: evidence.failed, durationMs: Date.now() - t0, finding });
}

// ── Consistency test ──────────────────────────────────────────────────────────

function runConsistency(runs = 100): ConsistencyResult {
  const t0 = Date.now();
  const scores: number[] = [];
  const statuses: string[] = [];
  const hashes: string[] = [];

  const scan     = buildGoldenScan();
  const graph    = buildGoldenGraph();
  const pipeline = buildGoldenPipeline();

  for (let i = 0; i < runs; i++) {
    const ev     = EvidenceCollector.collect(scan, graph, pipeline);
    const status = deriveStatus(ev);
    const score  = deriveScore(ev);
    // Build baseline for hash
    const fakeReport = {
      scan, graph, pipeline, evidence: ev, status, score,
      certifiedAt: "2026-01-01T00:00:00.000Z", // fixed for hash consistency
      durationMs: 0, isFrozen: status === "CERTIFIED",
      nonConformities: [], observations: [], risks: [], recommendations: [], matrix: [],
    } as unknown as Parameters<typeof ArchitectureBaselineBuilder.build>[0];
    const baseline = ArchitectureBaselineBuilder.build(fakeReport);
    scores.push(score);
    statuses.push(status);
    hashes.push(baseline.structuralHash);
  }

  const uniqueScores   = [...new Set(scores)];
  const uniqueStatuses = [...new Set(statuses)];
  const uniqueHashes   = [...new Set(hashes)];

  return Object.freeze({
    runs,
    allIdentical: uniqueScores.length === 1 && uniqueStatuses.length === 1 && uniqueHashes.length === 1,
    uniqueScores, uniqueStatuses, uniqueHashes,
    durationMs: Date.now() - t0,
  });
}

// ── Performance test ──────────────────────────────────────────────────────────

function runPerformance(): PerformanceResult[] {
  const sizes = [10, 50, 100, 500];
  return sizes.map(n => {
    const t0 = Date.now();
    const components: ScannedComponent[] = Array.from({ length: n }, (_, i) =>
      makeComponent({ id: `Comp${i}`, role: i % 2 === 0 ? "parser" : "loader", layer: "content", isSingleton: true })
    );
    const scan     = makeScanResult(components);
    const edges    = components.slice(0, Math.min(n - 1, 499)).map((c, i) =>
      makeEdge(c.id, components[i + 1]?.id ?? components[0].id, "calls", "content", "content")
    );
    const graph    = makeGraph(edges);
    const stages   = Array.from({ length: Math.min(n, 11) }, (_, i) => makeStage(`Stage${i}`, true, `__STAGE_${i}__`));
    const pipeline = makePipeline(stages);
    const ev       = EvidenceCollector.collect(scan, graph, pipeline);
    return Object.freeze({ componentCount: n, durationMs: Date.now() - t0, scoreComputed: deriveScore(ev), evidenceCount: ev.total });
  });
}

// ── Main engine ───────────────────────────────────────────────────────────────

class StressTestEngineImpl {

  async run(): Promise<RobustnessReport> {
    const t0        = Date.now();
    const scenarios = buildScenarios();
    const results   = scenarios.map(s => runScenario(s));

    const passed         = results.filter(r => r.passed).length;
    const failed         = results.filter(r => !r.passed).length;
    const falsePositives = results.filter(r => r.isFalsePositive).length;
    const falseNegatives = results.filter(r => r.isFalseNegative).length;
    const detectionRate  = Math.round((passed / Math.max(scenarios.length, 1)) * 100);

    const consistency = runConsistency(100);
    const performance = runPerformance();

    const isResilient = passed === scenarios.length
      && falsePositives === 0
      && falseNegatives === 0
      && consistency.allIdentical;

    const certifications: string[] = [];
    if (isResilient) {
      certifications.push("MEMORYOS OFFICIAL LIBRARY — ENGINEERING CERTIFIED");
      certifications.push("ARCHITECTURE CERTIFIED");
      certifications.push("SELF-AUDITING CERTIFIED");
      certifications.push("BASELINE CERTIFIED");
      certifications.push("READY FOR COGNITIVE LAYER");
    } else {
      if (falsePositives === 0) certifications.push("FALSE POSITIVE FREE");
      if (falseNegatives === 0) certifications.push("FALSE NEGATIVE FREE");
      if (consistency.allIdentical) certifications.push("DETERMINISTIC");
    }

    return Object.freeze({
      totalScenarios:  scenarios.length,
      passed, failed, falsePositives, falseNegatives, detectionRate,
      consistency, performance,
      stressResults:   Object.freeze(results),
      totalDurationMs: Date.now() - t0,
      generatedAt:     new Date().toISOString(),
      finalVerdict:    isResilient ? "RESILIENT" : "FLAWED",
      certifications:  Object.freeze(certifications),
    });
  }
}

const G = globalThis as typeof globalThis & { __EF4210_STRESS__?: StressTestEngineImpl };
if (!G.__EF4210_STRESS__) G.__EF4210_STRESS__ = new StressTestEngineImpl();
export const StressTestEngine: StressTestEngineImpl = G.__EF4210_STRESS__;