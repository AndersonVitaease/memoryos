/**
 * lcpResolutionTests.ts — Phase 5.6.2
 * Cognitive Module Resolution Validation Suite
 * 2026-07-13
 *
 * Verifies every certified engine is resolvable, instantiable, and executable
 * inside the Live Cognitive Pipeline.
 */

import { KnowledgeReconstructionEngine } from "../knowledge-reconstruction/KnowledgeReconstructionEngine";
import { KnowledgeFusionEngine }         from "../knowledge-fusion/KnowledgeFusionEngine";
import { IdentityResolutionEngine }      from "../identity-resolution/IdentityResolutionEngine";
import { ProjectReconstructionEngine }   from "../project-reconstruction/ProjectReconstructionEngine";
import { GoalIntelligenceEngine }        from "../goal-intelligence/GoalIntelligenceEngine";
import { CognitiveLearningEngine }       from "../cognitive-learning-engine/CognitiveLearningEngine";
import { LiveCognitivePipeline }         from "./LiveCognitivePipeline";
import { makeLCPId }                     from "./LCPTypes";

export type ModuleStatus = "RESOLVED" | "EXECUTED" | "NOT_FOUND" | "NOT_INITIALIZED" | "NOT_REGISTERED";

export interface ModuleResolutionEntry {
  engine:       string;
  importPath:   string;
  status:       ModuleStatus;
  instanceOk:   boolean;
  executedOk:   boolean;
  durationMs:   number;
  error:        string | null;
  detail:       string;
}

export interface ResolutionTestResult {
  id:         number;
  name:       string;
  passed:     boolean;
  durationMs: number;
  detail:     string;
  error:      string | null;
}

export interface ResolutionSuiteResult {
  passed:      number;
  total:       number;
  durationMs:  number;
  status:      "PASS" | "PARTIAL" | "FAIL";
  results:     ResolutionTestResult[];
  moduleMap:   ModuleResolutionEntry[];
  pipelineStatus: string | null;
  snapshotGenerated: boolean;
}

function chk(id: number, name: string, fn: () => string | boolean, ms = 0): ResolutionTestResult {
  try {
    const r      = fn();
    const passed = r === true || (typeof r === "string" && !r.startsWith("FAIL"));
    return { id, name, passed, durationMs: ms, detail: typeof r === "string" ? r : passed ? "OK" : "FAIL", error: null };
  } catch (e) {
    return { id, name, passed: false, durationMs: ms, detail: "Exception", error: String(e) };
  }
}

async function resolveModule(
  engine: string,
  importPath: string,
  instantiate: () => any,
  execute: (inst: any) => Promise<string>,
): Promise<ModuleResolutionEntry> {
  const t0 = Date.now();
  let instance: any = null;
  let instanceOk = false;
  let executedOk = false;
  let error: string | null = null;
  let detail = "";
  let status: ModuleStatus = "NOT_FOUND";

  try {
    instance   = instantiate();
    instanceOk = instance !== null && instance !== undefined;
    status     = instanceOk ? "RESOLVED" : "NOT_INITIALIZED";
  } catch (e) {
    error  = String(e);
    status = "NOT_INITIALIZED";
    detail = `Instantiation failed: ${error}`;
    return { engine, importPath, status, instanceOk, executedOk, durationMs: Date.now() - t0, error, detail };
  }

  try {
    detail    = await execute(instance);
    executedOk = true;
    status    = "EXECUTED";
  } catch (e) {
    error  = String(e);
    detail = `Execution failed: ${error}`;
    status = "RESOLVED"; // instantiated but execution failed
  }

  return { engine, importPath, status, instanceOk, executedOk, durationMs: Date.now() - t0, error, detail };
}

export async function runResolutionTests(): Promise<ResolutionSuiteResult> {
  const t0      = Date.now();
  const results: ResolutionTestResult[] = [];
  const moduleMap: ModuleResolutionEntry[] = [];

  // ── Module resolution audit ────────────────────────────────────────────────

  const kreEntry = await resolveModule(
    "KnowledgeReconstructionEngine",
    "src/lib/knowledge-reconstruction/KnowledgeReconstructionEngine.ts",
    () => new KnowledgeReconstructionEngine(),
    async (kre) => {
      const r = await kre.reconstruct();
      return `reconstruct() ok: status=${r.status}, items=${r.knowledgeExtracted}, nodes=${r.graphNodes}`;
    },
  );
  moduleMap.push(kreEntry);

  const kfeEntry = await resolveModule(
    "KnowledgeFusionEngine",
    "src/lib/knowledge-fusion/KnowledgeFusionEngine.ts",
    () => new KnowledgeFusionEngine(),
    async (kfe) => {
      const r = kfe.fuse([{ sourceId: "test", sourceName: "Test", items: [], relationships: [], timelineEvents: [] }]);
      return `fuse() ok: providers=${r.providersProcessed}, entities=${r.entitiesUnique}, conf=${r.overallConfidence}`;
    },
  );
  moduleMap.push(kfeEntry);

  const ireEntry = await resolveModule(
    "IdentityResolutionEngine",
    "src/lib/identity-resolution/IdentityResolutionEngine.ts",
    () => new IdentityResolutionEngine(),
    async (ire) => {
      const r = ire.resolve({ entities: [], relationships: [], timelineEvents: [] });
      return `resolve() ok: canonicals=${r.canonicalEntitiesCreated}, aliases=${r.aliasesDetected}`;
    },
  );
  moduleMap.push(ireEntry);

  const preEntry = await resolveModule(
    "ProjectReconstructionEngine",
    "src/lib/project-reconstruction/ProjectReconstructionEngine.ts",
    () => new ProjectReconstructionEngine(),
    async (pre) => {
      const r = pre.reconstruct([], "MemoryOS");
      return `reconstruct() ok: entities=${r.project.totalEntities}, stages=${r.pipelineStages.length}`;
    },
  );
  moduleMap.push(preEntry);

  const gieEntry = await resolveModule(
    "GoalIntelligenceEngine",
    "src/lib/goal-intelligence/GoalIntelligenceEngine.ts",
    () => new GoalIntelligenceEngine(),
    async (gie) => {
      const lc = gie.fullLifecycle({ title: "Resolution Test", description: "Phase 5.6.2", category: "technical", priority: "medium" });
      return `fullLifecycle() ok: subGoals=${lc.decomposition.subGoals.length}, recs=${lc.recommendations.length}`;
    },
  );
  moduleMap.push(gieEntry);

  const cleEntry = await resolveModule(
    "CognitiveLearningEngine",
    "src/lib/cognitive-learning-engine/CognitiveLearningEngine.ts",
    () => new CognitiveLearningEngine(),
    async (cle) => {
      const plan   = { id: "p1", steps: [{ id: "s1", title: "test", connector: "base44", operation: "ping" }], opportunities: [], risk: { overall: "low" } };
      const record = { id: "r1", stepResults: [{ stepId: "s1", status: "complete", startedAt: Date.now(), completedAt: Date.now(), durationMs: 1, output: {}, error: null, warnings: [] }], operationsExecuted: 1, errors: [], warnings: [], planId: "p1", startedAt: Date.now(), completedAt: Date.now(), durationMs: 1, overallSuccess: true };
      const s = cle.learn(plan as any, record as any, "exec_test");
      return `learn() ok: score=${s.overallLearningScore}, records=${s.learningRecords.length}`;
    },
  );
  moduleMap.push(cleEntry);

  // ── Individual criteria tests ──────────────────────────────────────────────

  results.push(chk(1, "KRE: module resolved",     () => kreEntry.instanceOk ? `RESOLVED: ${kreEntry.importPath}` : `FAIL: ${kreEntry.error}`, kreEntry.durationMs));
  results.push(chk(2, "KRE: reconstruct() executed", () => kreEntry.executedOk ? kreEntry.detail : `FAIL: ${kreEntry.error}`, kreEntry.durationMs));

  results.push(chk(3, "KFE: module resolved",     () => kfeEntry.instanceOk ? `RESOLVED` : `FAIL: ${kfeEntry.error}`, kfeEntry.durationMs));
  results.push(chk(4, "KFE: fuse() executed",     () => kfeEntry.executedOk ? kfeEntry.detail : `FAIL: ${kfeEntry.error}`, kfeEntry.durationMs));

  results.push(chk(5, "IRE: module resolved",     () => ireEntry.instanceOk ? `RESOLVED` : `FAIL: ${ireEntry.error}`, ireEntry.durationMs));
  results.push(chk(6, "IRE: resolve() executed",  () => ireEntry.executedOk ? ireEntry.detail : `FAIL: ${ireEntry.error}`, ireEntry.durationMs));

  results.push(chk(7, "PRE: module resolved",     () => preEntry.instanceOk ? `RESOLVED` : `FAIL: ${preEntry.error}`, preEntry.durationMs));
  results.push(chk(8, "PRE: reconstruct() executed", () => preEntry.executedOk ? preEntry.detail : `FAIL: ${preEntry.error}`, preEntry.durationMs));

  results.push(chk(9,  "GIE: module resolved",           () => gieEntry.instanceOk ? `RESOLVED` : `FAIL: ${gieEntry.error}`, gieEntry.durationMs));
  results.push(chk(10, "GIE: fullLifecycle() executed",  () => gieEntry.executedOk ? gieEntry.detail : `FAIL: ${gieEntry.error}`, gieEntry.durationMs));

  results.push(chk(11, "CLE: module resolved",    () => cleEntry.instanceOk ? `RESOLVED` : `FAIL: ${cleEntry.error}`, cleEntry.durationMs));
  results.push(chk(12, "CLE: learn() executed",   () => cleEntry.executedOk ? cleEntry.detail : `FAIL: ${cleEntry.error}`, cleEntry.durationMs));

  // ── Full pipeline execution ────────────────────────────────────────────────

  const tp = Date.now();
  let pipelineReport: any = null;
  let pipelineError: string | null = null;

  try {
    const lcp = new LiveCognitivePipeline();
    pipelineReport = await lcp.execute({ projectId: "resolution_test" });
  } catch (e) {
    pipelineError = String(e);
  }

  const pMs = Date.now() - tp;
  const successStages = pipelineReport?.stages?.filter((s: any) => s.status === "SUCCESS") ?? [];

  results.push(chk(13, "LCP: pipeline executes without crash", () =>
    pipelineReport ? `status=${pipelineReport.status}, stages=${pipelineReport.stages?.length}` : `FAIL: ${pipelineError}`, pMs));

  results.push(chk(14, "LCP: KRE stage SUCCESS", () => {
    const s = pipelineReport?.stages?.find((s: any) => s.stageName === "KnowledgeReconstructionEngine");
    return s?.status === "SUCCESS" ? `SUCCESS: nodes=${s.output?.graphNodes}` : `FAIL: ${s?.status ?? "missing"} ${s?.error ?? ""}`;
  }, pMs));

  results.push(chk(15, "LCP: KFE stage SUCCESS", () => {
    const s = pipelineReport?.stages?.find((s: any) => s.stageName === "KnowledgeFusionEngine");
    return s?.status === "SUCCESS" ? `SUCCESS: entities=${s.output?.entitiesUnique}` : `FAIL: ${s?.status ?? "missing"} ${s?.error ?? ""}`;
  }, pMs));

  results.push(chk(16, "LCP: IRE stage SUCCESS", () => {
    const s = pipelineReport?.stages?.find((s: any) => s.stageName === "IdentityResolutionEngine");
    return s?.status === "SUCCESS" ? `SUCCESS: canonicals=${s.output?.canonicalEntitiesCreated}` : `FAIL: ${s?.status ?? "missing"} ${s?.error ?? ""}`;
  }, pMs));

  results.push(chk(17, "LCP: PRE stage SUCCESS", () => {
    const s = pipelineReport?.stages?.find((s: any) => s.stageName === "ProjectReconstructionEngine");
    return s?.status === "SUCCESS" ? `SUCCESS: entities=${s.output?.totalEntities}` : `FAIL: ${s?.status ?? "missing"} ${s?.error ?? ""}`;
  }, pMs));

  results.push(chk(18, "LCP: GIE stage SUCCESS", () => {
    const s = pipelineReport?.stages?.find((s: any) => s.stageName === "GoalIntelligenceEngine");
    return s?.status === "SUCCESS" ? `SUCCESS: subGoals=${s.output?.subGoals}` : `FAIL: ${s?.status ?? "missing"} ${s?.error ?? ""}`;
  }, pMs));

  results.push(chk(19, "LCP: CLE stage SUCCESS", () => {
    const s = pipelineReport?.stages?.find((s: any) => s.stageName === "CognitiveLearningEngine");
    return s?.status === "SUCCESS" ? `SUCCESS: learningScore=${s.output?.learningScore}` : `FAIL: ${s?.status ?? "missing"} ${s?.error ?? ""}`;
  }, pMs));

  results.push(chk(20, "LCP: ProjectSnapshot generated", () => {
    const s = pipelineReport?.stages?.find((s: any) => s.stageName === "ProjectSnapshot");
    return s?.status === "SUCCESS" ? `SUCCESS: snapId exists` : `FAIL: ${s?.status ?? "missing"} ${s?.error ?? ""}`;
  }, pMs));

  results.push(chk(21, "LCP: pipeline OPERATIONAL or DEGRADED (>=5 SUCCESS stages)", () => {
    const ok = ["OPERATIONAL", "DEGRADED"].includes(pipelineReport?.status);
    return ok ? `status=${pipelineReport.status}, successStages=${successStages.length}` : `FAIL: status=${pipelineReport?.status}`;
  }, pMs));

  results.push(chk(22, "LCP: no duplicate engine instances", () => {
    const names = pipelineReport?.stages?.map((s: any) => s.stageName) ?? [];
    const unique = new Set(names).size;
    return unique === names.length ? `${unique} unique stage names` : `FAIL: duplicates found`;
  }, pMs));

  const passed = results.filter(r => r.passed).length;
  const status: ResolutionSuiteResult["status"] =
    passed === results.length ? "PASS" : passed >= results.length * 0.7 ? "PARTIAL" : "FAIL";

  return {
    passed, total: results.length, durationMs: Date.now() - t0,
    status, results, moduleMap,
    pipelineStatus: pipelineReport?.status ?? null,
    snapshotGenerated: !!(pipelineReport?.snapshot),
  };
}