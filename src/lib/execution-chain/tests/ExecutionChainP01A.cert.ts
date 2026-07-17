// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11A — External Certification Suite
// tests/execution-chain/ExecutionChainP01A.cert.ts
//
// Phases:
//   R-01..R-10  Regression (all P-01.11 tests still pass)
//   I-01..I-15  Integration
//   A-01..A-10  Architecture (SOLID + DI + Immutability + Pipeline)
//   P-01..P-05  Pipeline (PipelineValidator + PipelineBuilder + ECR)
//   EX-01..EX-5 Explainability Evidence V2
//   AU-01..AU-5 Audit / RuntimeAuditSink
//   RH-01..RH-5 Runtime Health / RuntimeRegistry
// ══════════════════════════════════════════════════════════════════════════════

import { ExecutionChain }           from "../ExecutionChain";
import { ExecutionCompositionRoot } from "../ExecutionCompositionRoot";
import { PipelineBuilder }          from "../PipelineBuilder";
import { PipelineValidator }        from "../PipelineValidator";
import { RuntimeAuditSink }         from "../RuntimeAuditSink";
import { RuntimeRegistry }          from "../RuntimeRegistry";
import { DeterministicClock }       from "../../runtime-infra/RuntimeClock";
import { DeterministicProvider }    from "../../runtime-infra/RuntimeExecutionIdProvider";
import { RuntimeEventBus }          from "../../runtime-infra/RuntimeEventBus";
import { RuntimeMetrics }           from "../../runtime-infra/RuntimeMetrics";
import type { UserInput }           from "../ExecutionChainTypes";

// ── Test harness ──────────────────────────────────────────────────────────────

export interface CertCase {
  id: string; label: string; status: "PASS" | "FAIL"; durationMs: number; error?: string;
}
export interface CertReport {
  certified: boolean; passed: number; failed: number; total: number;
  passRate: string; durationMs: number; cases: CertCase[];
  suite: string;
}

function makeChain(clockStep = 10) {
  const clock   = new DeterministicClock(clockStep);
  const ids     = new DeterministicProvider("p011a");
  const bus     = new RuntimeEventBus(2000);
  const metrics = new RuntimeMetrics(60000, () => clock.now());
  const chain   = new ExecutionChain({ runtimeClock: clock, executionIdProvider: ids, eventBus: bus, metrics });
  return { chain, bus, metrics, clock };
}

function inp(text: string, idx = 0): UserInput {
  return Object.freeze({ text, sessionId: `sess-${idx}`, userId: "user-p011a", timestamp: 1000 });
}

async function run(id: string, label: string, fn: () => Promise<void>): Promise<CertCase> {
  const t0 = Date.now();
  try {
    await fn();
    return { id, label, status: "PASS", durationMs: Date.now() - t0 };
  } catch (e: unknown) {
    return { id, label, status: "FAIL", durationMs: Date.now() - t0, error: String((e as Error).message ?? e) };
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ══════════════════════════════════════════════════════════════════════════════
// REGRESSION — all P-01.11 tests pass unchanged
// ══════════════════════════════════════════════════════════════════════════════
async function regressionSuite(): Promise<CertCase[]> {
  const cases: CertCase[] = [];

  cases.push(await run("R-01", "13 stages complete", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("What was decided last Friday?", 1));
    assert(r.status === "COMPLETED", `status=${r.status}`);
    assert(r.stagesTotal === 13, `stagesTotal=${r.stagesTotal}`);
    assert(r.stagesPassed === 13, `stagesPassed=${r.stagesPassed}`);
  }));

  cases.push(await run("R-02", "Connector query completes", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("Send email to boss@corp.com about the update", 2));
    assert(r.status === "COMPLETED", `status=${r.status}`);
    assert(r.finalOutput !== null, "finalOutput null");
  }));

  cases.push(await run("R-03", "Memory stored on plan execution", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("Create a document summarising the project", 3));
    assert(r.memoryResult?.memorized === true, "not memorized");
  }));

  cases.push(await run("R-04", "auditResult present on success", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("recall notes", 4));
    assert(r.auditResult !== null, "auditResult null");
    assert(["COMPLIANT","WARNING","VIOLATION"].includes(r.auditResult!.complianceStatus), "invalid compliance");
  }));

  cases.push(await run("R-05", "explainabilityResult present on success", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("what projects am I working on?", 5));
    assert(r.explainabilityResult !== null, "explainabilityResult null");
    assert(r.explainabilityResult!.stagesExecuted.length > 0, "no stages in explain");
  }));

  cases.push(await run("R-06", "memoryResult tier ACTIVE", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("any pending tasks?", 6));
    assert(r.memoryResult?.tier === "ACTIVE", `tier=${r.memoryResult?.tier}`);
  }));

  cases.push(await run("R-07", "chainId, sessionId, userId correct", async () => {
    const { chain } = makeChain();
    const i = inp("identity test", 7);
    const r = await chain.execute(i);
    assert(r.sessionId === i.sessionId, "sessionId mismatch");
    assert(r.userId === i.userId, "userId mismatch");
    assert(r.chainId.startsWith("chain"), `chainId=${r.chainId}`);
  }));

  cases.push(await run("R-08", "totalDurationMs non-negative", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("quick", 8));
    assert(r.totalDurationMs >= 0, `durationMs=${r.totalDurationMs}`);
  }));

  cases.push(await run("R-09", "All stage records frozen", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("freeze test", 9));
    for (const s of r.stages) assert(Object.isFrozen(s), `stage ${s.stage} not frozen`);
  }));

  cases.push(await run("R-10", "Report itself frozen", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("immutability", 10));
    assert(Object.isFrozen(r), "report not frozen");
  }));

  return cases;
}

// ══════════════════════════════════════════════════════════════════════════════
// INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════
async function integrationSuite(): Promise<CertCase[]> {
  const cases: CertCase[] = [];

  cases.push(await run("I-01", "Memory recall completes", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("What did we decide about the architecture?", 11));
    assert(r.status === "COMPLETED", `status=${r.status}`);
  }));

  cases.push(await run("I-02", "Gmail connector resolved", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("Send email to alice@example.com with notes", 12));
    const orch = r.stages.find(s => s.stage === "RUNTIME_ORCHESTRATOR")?.output as { selectedConnector?: string };
    assert(orch?.selectedConnector === "gmail", `connector=${orch?.selectedConnector}`);
  }));

  cases.push(await run("I-03", "Calendar connector resolved", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("Schedule a meeting for tomorrow at 10am", 13));
    const orch = r.stages.find(s => s.stage === "RUNTIME_ORCHESTRATOR")?.output as { selectedConnector?: string };
    assert(["google_calendar","gmail"].includes(orch?.selectedConnector ?? ""), `connector=${orch?.selectedConnector}`);
  }));

  cases.push(await run("I-04", "Drive connector resolved", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("Open the project plan document in drive", 14));
    const orch = r.stages.find(s => s.stage === "RUNTIME_ORCHESTRATOR")?.output as { selectedConnector?: string };
    assert(orch?.selectedConnector === "google_drive", `connector=${orch?.selectedConnector}`);
  }));

  cases.push(await run("I-05", "Goal produces subGoals", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("Create a sprint plan for next week", 15));
    const goalOut = r.stages.find(s => s.stage === "GOAL_RUNTIME")?.output as { subGoals?: string[] };
    assert((goalOut?.subGoals?.length ?? 0) > 0, "no subGoals");
  }));

  cases.push(await run("I-06", "Explainability decisionLog has per-stage evidence", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("What files did I edit last month?", 16));
    assert(r.explainabilityResult!.decisionLog.length >= 3, "decisionLog short");
  }));

  cases.push(await run("I-07", "Audit COMPLIANT on clean run", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("recall decisions", 17));
    assert(r.auditResult?.complianceStatus === "COMPLIANT", `compliance=${r.auditResult?.complianceStatus}`);
  }));

  cases.push(await run("I-08", "Memory knowledgeExtracted non-empty", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("summarise last project discussion", 18));
    assert((r.memoryResult?.knowledgeExtracted?.length ?? 0) > 0, "no knowledge extracted");
  }));

  cases.push(await run("I-09", "EventBus gets STARTED + COMPLETED + STAGE_COMPLETED", async () => {
    const { chain, bus } = makeChain();
    await chain.execute(inp("bus event test", 19));
    const types = bus.history().map(e => e.type);
    assert(types.includes("EXECUTION_STARTED"), "EXECUTION_STARTED missing");
    assert(types.includes("EXECUTION_COMPLETED"), "EXECUTION_COMPLETED missing");
    assert(types.includes("STAGE_COMPLETED"), "STAGE_COMPLETED missing");
  }));

  cases.push(await run("I-10", "Metrics records executions and successes", async () => {
    const { chain, metrics } = makeChain();
    await chain.execute(inp("metrics test", 20));
    const snap = metrics.snapshot();
    assert(snap.executions >= 1, `executions=${snap.executions}`);
    assert(snap.successes  >= 1, `successes=${snap.successes}`);
  }));

  cases.push(await run("I-11", "Unknown query falls back to memory", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("what is the meaning of life?", 21));
    const orch = r.stages.find(s => s.stage === "RUNTIME_ORCHESTRATOR")?.output as { selectedConnector?: string };
    assert(orch?.selectedConnector === "memory", `connector=${orch?.selectedConnector}`);
  }));

  cases.push(await run("I-12", "Kernel securityContext has userId", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("kernel context test", 22));
    const kern = r.stages.find(s => s.stage === "KERNEL")?.output as { securityContext?: { userId: string } };
    assert(kern?.securityContext?.userId === "user-p011a", `userId=${kern?.securityContext?.userId}`);
  }));

  cases.push(await run("I-13", "Connector responseStatus=200", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("connector status", 23));
    const conn = r.stages.find(s => s.stage === "CONNECTOR")?.output as { responseStatus?: number };
    assert(conn?.responseStatus === 200, `responseStatus=${conn?.responseStatus}`);
  }));

  cases.push(await run("I-14", "Result confidence > 0", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("Send file to partner@corp.com", 24));
    assert((r.finalOutput?.confidence ?? 0) > 0, "confidence=0");
  }));

  cases.push(await run("I-15", "Sequential executions independent", async () => {
    const { chain } = makeChain();
    const r1 = await chain.execute(inp("first", 25));
    const r2 = await chain.execute(inp("second", 26));
    assert(r1.status === "COMPLETED" && r2.status === "COMPLETED", "not both completed");
    assert(r1.chainId !== r2.chainId, "chainIds collide");
  }));

  return cases;
}

// ══════════════════════════════════════════════════════════════════════════════
// ARCHITECTURE — SOLID + DI + Immutability + Pipeline
// ══════════════════════════════════════════════════════════════════════════════
async function architectureSuite(): Promise<CertCase[]> {
  const cases: CertCase[] = [];

  cases.push(await run("A-01", "Chain accepts external bus (Low Coupling)", async () => {
    const sharedBus = new RuntimeEventBus(500);
    const chain = new ExecutionChain({ eventBus: sharedBus });
    await chain.execute(inp("coupling test", 27));
    assert(chain.bus() === sharedBus, "bus not shared");
  }));

  cases.push(await run("A-02", "SRP: chain exposes only bus/metrics/execute", async () => {
    const chain = new ExecutionChain();
    assert(typeof chain.bus     === "function", "bus() missing");
    assert(typeof chain.metrics === "function", "metrics() missing");
    assert(typeof chain.execute === "function", "execute() missing");
  }));

  cases.push(await run("A-03", "All stage outputs immutable", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("immutability arch", 28));
    for (const s of r.stages) {
      if (s.output && typeof s.output === "object") {
        assert(Object.isFrozen(s.output), `stage ${s.stage} output not frozen`);
      }
    }
  }));

  cases.push(await run("A-04", "DIP: chain works with all-default deps", async () => {
    const chain = new ExecutionChain();
    const r = await chain.execute(inp("default deps", 29));
    assert(r.status === "COMPLETED", `status=${r.status}`);
  }));

  cases.push(await run("A-05", "Shared clock flows deterministically", async () => {
    const { chain } = makeChain(5);
    const r = await chain.execute(inp("clock test", 30));
    assert(r.startedAt % 5 === 0, `startedAt=${r.startedAt} not multiple of 5`);
  }));

  cases.push(await run("A-06", "Single EventBus serves all stages", async () => {
    const { chain, bus } = makeChain();
    await chain.execute(inp("bus singleton", 31));
    assert(bus.history().length > 10, `too few events: ${bus.history().length}`);
  }));

  cases.push(await run("A-07", "Explainability built from evidence, not post-hoc", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("evidence test", 32));
    const hasStageEvidence = r.explainabilityResult!.decisionLog.some(
      d => d.includes("Intent") || d.includes("Goal") || d.includes("Plan"),
    );
    assert(hasStageEvidence, "no stage evidence in decisionLog");
  }));

  cases.push(await run("A-08", "Audit STAGE_COMPLETED events >= 12", async () => {
    const { chain, bus } = makeChain();
    await chain.execute(inp("audit event", 33));
    const n = bus.ofType("STAGE_COMPLETED").length;
    assert(n >= 12, `STAGE_COMPLETED=${n}`);
  }));

  cases.push(await run("A-09", "ConnectorRegistry delegates correctly", async () => {
    let callCount = 0;
    const customRegistry = {
      resolve: (intent: { requiresConnector: boolean }) => {
        callCount++;
        return intent.requiresConnector ? "custom_connector" : "memory";
      },
    };
    const chain = new ExecutionChain({ connectorRegistry: customRegistry });
    await chain.execute(inp("registry delegation", 34));
    assert(callCount >= 1, `resolveCallCount=${callCount}`);
  }));

  cases.push(await run("A-10", "RuntimeClock single time source", async () => {
    const chain = new ExecutionChain({ runtimeClock: new DeterministicClock(100) });
    const r = await chain.execute(inp("clock source", 35));
    assert(r.startedAt % 100 === 0, `startedAt=${r.startedAt}`);
  }));

  return cases;
}

// ══════════════════════════════════════════════════════════════════════════════
// PIPELINE — PipelineValidator + PipelineBuilder + ECR
// ══════════════════════════════════════════════════════════════════════════════
async function pipelineSuite(): Promise<CertCase[]> {
  const cases: CertCase[] = [];

  cases.push(await run("P-01", "PipelineValidator accepts valid pipeline", async () => {
    const validator = new PipelineValidator();
    const stages = [
      "USER_INPUT","INTENT_RUNTIME","GOAL_RUNTIME","PLANNING_RUNTIME","KERNEL",
      "RUNTIME_ORCHESTRATOR","CAPABILITY_RUNTIME","CONNECTOR_RUNTIME","CONNECTOR",
      "RESULT","MEMORY","EXPLAINABILITY","AUDIT",
    ].map(id => ({ id, execute: async (_c: unknown, i: unknown) => i }));
    const r = validator.validate(stages);
    assert(r.valid, `invalid: ${r.errors.join(",")}`);
  }));

  cases.push(await run("P-02", "PipelineValidator rejects missing stages", async () => {
    const validator = new PipelineValidator();
    const stages = [{ id: "USER_INPUT", execute: async (_c: unknown, i: unknown) => i }];
    const r = validator.validate(stages);
    assert(!r.valid, "should be invalid");
    assert(r.errors.some(e => e.startsWith("MISSING_STAGE")), "no MISSING_STAGE error");
  }));

  cases.push(await run("P-03", "PipelineValidator rejects duplicates", async () => {
    const validator = new PipelineValidator();
    const stages = ["USER_INPUT","USER_INPUT"].map(id => ({ id, execute: async (_c: unknown, i: unknown) => i }));
    const r = validator.validate(stages);
    assert(!r.valid, "should be invalid");
    assert(r.errors.some(e => e.startsWith("DUPLICATE_STAGE")), "no DUPLICATE error");
  }));

  cases.push(await run("P-04", "ECR.compose() produces a valid runtime", async () => {
    const rt = ExecutionCompositionRoot.compose({ runtimeClock: new DeterministicClock(1) });
    assert(rt.clock !== undefined, "no clock");
    assert(rt.pipeline !== undefined, "no pipeline");
    assert(rt.eventBus !== undefined, "no eventBus");
    assert(rt.auditSink !== undefined, "no auditSink");
    assert(rt.runtimeRegistry !== undefined, "no runtimeRegistry");
  }));

  cases.push(await run("P-05", "ECR builds context with correct executionId", async () => {
    const rt  = ExecutionCompositionRoot.compose({ runtimeClock: new DeterministicClock(1) });
    const ctx = ExecutionCompositionRoot.buildContext(rt, "exec-001", "sess-001", "user-001");
    assert(ctx.executionId === "exec-001", `executionId=${ctx.executionId}`);
    assert(ctx.sessionId   === "sess-001", `sessionId=${ctx.sessionId}`);
    assert(ctx.permissions.userId === "user-001", `userId=${ctx.permissions.userId}`);
  }));

  return cases;
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPLAINABILITY EVIDENCE V2
// ══════════════════════════════════════════════════════════════════════════════
async function explainabilitySuite(): Promise<CertCase[]> {
  const cases: CertCase[] = [];

  cases.push(await run("EX-01", "ExplainabilityResult present and frozen", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("explain test", 40));
    assert(r.explainabilityResult !== null, "null");
    assert(Object.isFrozen(r.explainabilityResult), "not frozen");
  }));

  cases.push(await run("EX-02", "decisionLog non-empty", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("decision log test", 41));
    assert(r.explainabilityResult!.decisionLog.length > 0, "empty decisionLog");
  }));

  cases.push(await run("EX-03", "stagesExecuted equals COMPLETED count", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("stages executed test", 42));
    const completed = r.stages.filter(s => s.status === "COMPLETED").length;
    assert(r.explainabilityResult!.stagesExecuted.length === completed, "count mismatch");
  }));

  cases.push(await run("EX-04", "humanReadableSummary non-empty", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("human summary test", 43));
    assert(r.explainabilityResult!.humanReadableSummary.length > 10, "summary too short");
  }));

  cases.push(await run("EX-05", "confidenceScore in [0,1]", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("confidence test", 44));
    const s = r.explainabilityResult!.confidenceScore;
    assert(s >= 0 && s <= 1, `confidenceScore=${s}`);
  }));

  return cases;
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT / RuntimeAuditSink
// ══════════════════════════════════════════════════════════════════════════════
async function auditSuite(): Promise<CertCase[]> {
  const cases: CertCase[] = [];

  cases.push(await run("AU-01", "RuntimeAuditSink attaches and collects events", async () => {
    const bus  = new RuntimeEventBus(500);
    const sink = new RuntimeAuditSink();
    sink.attach(bus);
    bus.publish(Object.freeze({ type: "STAGE_COMPLETED" as const, executionId: "x", runtimeLabel: "t", timestamp: 1 }));
    assert(sink.countByType("STAGE_COMPLETED") === 1, "count mismatch");
  }));

  cases.push(await run("AU-02", "Sink drain returns immutable snapshot", async () => {
    const bus  = new RuntimeEventBus(500);
    const sink = new RuntimeAuditSink();
    sink.attach(bus);
    bus.publish(Object.freeze({ type: "STAGE_COMPLETED" as const, executionId: "x", runtimeLabel: "t", timestamp: 1 }));
    const records = sink.drain();
    assert(Object.isFrozen(records), "drain not frozen");
  }));

  cases.push(await run("AU-03", "Audit produces COMPLIANT on clean run", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("clean run", 50));
    assert(r.auditResult?.complianceStatus === "COMPLIANT", `compliance=${r.auditResult?.complianceStatus}`);
  }));

  cases.push(await run("AU-04", "Audit auditId is set", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("audit id test", 51));
    assert(r.auditResult!.auditId.length > 0, "empty auditId");
  }));

  cases.push(await run("AU-05", "Audit signature format correct", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(inp("signature test", 52));
    assert(r.auditResult!.signature.startsWith("sha256-"), `sig=${r.auditResult!.signature}`);
  }));

  return cases;
}

// ══════════════════════════════════════════════════════════════════════════════
// RUNTIME HEALTH / RuntimeRegistry
// ══════════════════════════════════════════════════════════════════════════════
async function runtimeHealthSuite(): Promise<CertCase[]> {
  const cases: CertCase[] = [];

  cases.push(await run("RH-01", "RuntimeRegistry registers and resolves", async () => {
    const reg = new RuntimeRegistry(0);
    reg.register({ id: "TEST", version: "1.0", owner: "test", capabilities: [], dependencies: [], lifecycle: "singleton", health: () => ({ status: "healthy", uptime: 0, version: "1.0", dependencies: [] }) });
    assert(reg.resolve("TEST") !== undefined, "not resolved");
  }));

  cases.push(await run("RH-02", "RuntimeRegistry health returns all statuses", async () => {
    const reg = new RuntimeRegistry(0);
    reg.register({ id: "A", version: "1.0", owner: "core", capabilities: [], dependencies: [], lifecycle: "singleton", health: () => ({ status: "healthy", uptime: 100, version: "1.0", dependencies: [] }) });
    const h = reg.health();
    assert(h["A"]?.status === "healthy", "not healthy");
  }));

  cases.push(await run("RH-03", "ECR compose registers 12 runtimes", async () => {
    const rt = ExecutionCompositionRoot.compose({ runtimeClock: new DeterministicClock(1) });
    const list = rt.runtimeRegistry.listAll();
    assert(list.length === 12, `registered=${list.length}`);
  }));

  cases.push(await run("RH-04", "All registered runtimes are healthy", async () => {
    const rt = ExecutionCompositionRoot.compose({ runtimeClock: new DeterministicClock(1) });
    const health = rt.runtimeRegistry.health();
    for (const [id, h] of Object.entries(health)) {
      assert(h.status === "healthy", `${id} not healthy`);
    }
  }));

  cases.push(await run("RH-05", "RuntimeRegistry uptime is non-negative", async () => {
    const clock = new DeterministicClock(10);
    clock.now(); // advance
    const rt = ExecutionCompositionRoot.compose({ runtimeClock: clock });
    const uptime = rt.runtimeRegistry.uptime(clock.now());
    assert(uptime >= 0, `uptime=${uptime}`);
  }));

  return cases;
}

// ══════════════════════════════════════════════════════════════════════════════
// Public runner
// ══════════════════════════════════════════════════════════════════════════════
export async function runP01ACertification(): Promise<CertReport> {
  const t0 = Date.now();
  const [regression, integration, architecture, pipeline, explainability, audit, runtimeHealth] =
    await Promise.all([
      regressionSuite(), integrationSuite(), architectureSuite(),
      pipelineSuite(), explainabilitySuite(), auditSuite(), runtimeHealthSuite(),
    ]);

  const cases    = [...regression, ...integration, ...architecture, ...pipeline, ...explainability, ...audit, ...runtimeHealth];
  const passed   = cases.filter(c => c.status === "PASS").length;
  const failed   = cases.filter(c => c.status === "FAIL").length;
  const total    = cases.length;
  const durationMs = Date.now() - t0;

  return {
    suite: "P-01.11A Architecture Freeze Certification",
    certified: failed === 0,
    passed, failed, total,
    passRate: `${((passed / total) * 100).toFixed(1)}%`,
    durationMs, cases,
  };
}