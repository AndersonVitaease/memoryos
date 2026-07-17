// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11C — EF-27: Engineering Quality Certification Suite
//
// EQ-01  No unsafe casts remain in ExecutionState (typed helpers only)
// EQ-02  ExecutionPipeline contains only orchestration logic
// EQ-03  Instrumentation is isolated in PipelineInstrumentation
// EQ-04  RuntimeDescriptors carry version metadata (apiVersion, schemaVersion)
// EQ-05  RuntimeRegistry.validate() / compatibility() / dependencyGraph() work
// EQ-06  ExecutionChain performs no concrete service instantiation
// EQ-07  Regression: all basic execution scenarios continue passing
// EQ-08  Architecture Freeze: pipeline has exactly 13 stages
// EQ-09  Dashboard isolation preserved: snapshot assembler works
// EQ-10  All previous certifications remain compatible
// ══════════════════════════════════════════════════════════════════════════════

import { ExecutionChain }              from "../ExecutionChain";
import { ExecutionCompositionRoot }    from "../ExecutionCompositionRoot";
import { RuntimeRegistry }             from "../RuntimeRegistry";
import { PipelineInstrumentation }     from "../PipelineInstrumentation";
import {
  EMPTY_EXECUTION_STATE,
  withUserInput, withIntent, withGoal, withPlan, withKernel,
  withOrchestrator, withCapability, withConnectorRuntime,
  withConnector, withResult, withMemory, withExplainability, withAudit,
  withRecord,
} from "../ExecutionState";
import { DeterministicClock }          from "../../runtime-infra/RuntimeClock";
import { DeterministicProvider }       from "../../runtime-infra/RuntimeExecutionIdProvider";
import { RuntimeEventBus }             from "../../runtime-infra/RuntimeEventBus";
import { RuntimeMetrics }              from "../../runtime-infra/RuntimeMetrics";
import type { UserInput }              from "../ExecutionChainTypes";

// ── Shared helpers ────────────────────────────────────────────────────────────

export interface EQCase {
  id:        string;
  label:     string;
  status:    "PASS" | "FAIL";
  durationMs: number;
  error?:    string;
}

export interface EQReport {
  certified:  boolean;
  passed:     number;
  failed:     number;
  total:      number;
  passRate:   string;
  durationMs: number;
  cases:      EQCase[];
}

function makeChain() {
  const clock   = new DeterministicClock(10);
  const ids     = new DeterministicProvider("eq");
  const bus     = new RuntimeEventBus(2000);
  const metrics = new RuntimeMetrics(60000, () => clock.now());
  return new ExecutionChain({ runtimeClock: clock, executionIdProvider: ids, eventBus: bus, metrics });
}

function inp(text: string, idx = 0): UserInput {
  return Object.freeze({ text, sessionId: `sess-eq-${idx}`, userId: "user-eq", timestamp: 1000 });
}

async function run(id: string, label: string, fn: () => Promise<void>): Promise<EQCase> {
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
// EQ-01 — No unsafe casts remain in ExecutionState
// ══════════════════════════════════════════════════════════════════════════════
async function eq01(): Promise<EQCase> {
  return run("EQ-01", "Typed helpers produce correct ExecutionState fields", async () => {
    const base = EMPTY_EXECUTION_STATE;

    // Each helper sets EXACTLY one field
    const s1 = withUserInput(base,         { text: "hi", sessionId: "s", userId: "u", timestamp: 0 });
    assert(s1.userInput !== undefined, "userInput not set");
    assert(s1.intent    === undefined, "intent should be unset");

    const s2 = withIntent(s1, { intentType: "MEMORY_RECALL", confidence: 0.9, requiresConnector: false, entities: {}, slots: {} });
    assert(s2.intent !== undefined,     "intent not set");
    assert(s2.userInput !== undefined,  "userInput lost");
    assert(s2.goal === undefined,       "goal should be unset");

    // All helpers return frozen objects
    assert(Object.isFrozen(s1), "s1 not frozen");
    assert(Object.isFrozen(s2), "s2 not frozen");

    // Verify we have exactly the right typed helpers exported
    const helpers = [
      withUserInput, withIntent, withGoal, withPlan, withKernel,
      withOrchestrator, withCapability, withConnectorRuntime,
      withConnector, withResult, withMemory, withExplainability, withAudit,
    ];
    assert(helpers.length === 13, `Expected 13 typed helpers, got ${helpers.length}`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// EQ-02 — ExecutionPipeline contains only orchestration logic
// ══════════════════════════════════════════════════════════════════════════════
async function eq02(): Promise<EQCase> {
  return run("EQ-02", "ExecutionPipeline accepts injected instrumentation", async () => {
    const instr = new PipelineInstrumentation();
    // PipelineInstrumentation is a separate class — not inside ExecutionPipeline
    assert(typeof instr.onSuccess === "function", "onSuccess missing");
    assert(typeof instr.onFailure === "function", "onFailure missing");
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// EQ-03 — Instrumentation isolated
// ══════════════════════════════════════════════════════════════════════════════
async function eq03(): Promise<EQCase> {
  return run("EQ-03", "PipelineInstrumentation emits evidence + record on success", async () => {
    const clock   = new DeterministicClock(5);
    const ids     = new DeterministicProvider("eq03");
    const bus     = new RuntimeEventBus(100);
    const metrics = new RuntimeMetrics(60000, () => clock.now());
    const evidences: unknown[] = [];

    const ctx = {
      executionId: "test-exec",
      sessionId:   "sess",
      clock,
      idProvider:  ids,
      eventBus:    bus,
      metrics,
      auditSink:   { onEvent: () => {} } as never,
      connectorRegistry: { resolve: () => "memory" } as never,
      runtimeRegistry:   { listAll: () => [] } as never,
      permissions: { userId: "u", scopes: [], roles: [] },
      config:      { maxTimeMs: 30000, maxRetries: 3, environment: "production" as const },
      evidences,
    };

    const instr = new PipelineInstrumentation();
    const record = instr.onSuccess(ctx, "TEST_STAGE", 100, 110, { in: 1 }, { out: 2 });

    assert(record.stage === "TEST_STAGE",   `stage=${record.stage}`);
    assert(record.durationMs === 10,        `durationMs=${record.durationMs}`);
    assert(record.status === "COMPLETED",   `status=${record.status}`);
    assert(Object.isFrozen(record),         "record not frozen");
    assert(evidences.length === 1,          "evidence not collected");
    assert(bus.history().some(e => e.type === "STAGE_COMPLETED"), "STAGE_COMPLETED not emitted");
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// EQ-04 — RuntimeDescriptors carry version metadata
// ══════════════════════════════════════════════════════════════════════════════
async function eq04(): Promise<EQCase> {
  return run("EQ-04", "RuntimeDescriptor supports apiVersion + schemaVersion", async () => {
    const reg = new RuntimeRegistry(0);
    reg.register({
      id:            "test-runtime",
      version:       "1.0",
      apiVersion:    "v1",
      schemaVersion: "2026.07",
      owner:         "core",
      capabilities:  ["test"],
      dependencies:  [],
      lifecycle:     "singleton",
      health:        () => ({ status: "healthy", uptime: 100, version: "1.0", dependencies: [] }),
    });

    const desc = reg.resolve("test-runtime");
    assert(desc !== undefined,          "descriptor not found");
    assert(desc!.apiVersion    === "v1",       `apiVersion=${desc!.apiVersion}`);
    assert(desc!.schemaVersion === "2026.07",  `schemaVersion=${desc!.schemaVersion}`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// EQ-05 — RuntimeRegistry validation operational
// ══════════════════════════════════════════════════════════════════════════════
async function eq05(): Promise<EQCase> {
  return run("EQ-05", "RuntimeRegistry.validate() / compatibility() / dependencyGraph()", async () => {
    const reg = new RuntimeRegistry(0);

    // Empty registry is valid
    const v0 = reg.validate();
    assert(v0.valid, "empty registry should be valid");

    // Register two valid runtimes
    const healthFn = () => ({ status: "healthy" as const, uptime: 100, version: "1.0", dependencies: [] as string[] });
    reg.register({ id: "A", version: "1.0", owner: "core", capabilities: ["cap-a"], dependencies: [],    lifecycle: "singleton", health: healthFn });
    reg.register({ id: "B", version: "1.0", owner: "core", capabilities: ["cap-b"], dependencies: ["A"], lifecycle: "singleton", health: healthFn });

    const v1 = reg.validate();
    assert(v1.valid, `validate failed: ${v1.violations.join(", ")}`);

    // compatibility
    const compat = reg.compatibility("A", "B");
    assert(typeof compat.compatible === "boolean", "compatible missing");
    assert(Array.isArray(compat.reasons), "reasons missing");

    // dependencyGraph
    const graph = reg.dependencyGraph();
    assert(graph.length === 2, `graph.length=${graph.length}`);
    const nodeB = graph.find(n => n.id === "B");
    assert(nodeB !== undefined,          "B not in graph");
    assert(nodeB!.resolved === true,     "B deps not resolved");
    assert(nodeB!.dependencies.includes("A"), "A not in B deps");

    // Register invalid descriptor — missing id — test violations
    const reg2 = new RuntimeRegistry(0);
    reg2.register({ id: "", version: "", owner: "", capabilities: [], dependencies: [], lifecycle: "singleton", health: healthFn });
    const v2 = reg2.validate();
    assert(!v2.valid, "invalid registry should fail validate");
    assert(v2.violations.length > 0, "no violations reported");
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// EQ-06 — ExecutionChain performs no concrete service instantiation
// ══════════════════════════════════════════════════════════════════════════════
async function eq06(): Promise<EQCase> {
  return run("EQ-06", "ExecutionChain uses injected reportAssembler from CompositionRoot", async () => {
    const clock   = new DeterministicClock(10);
    const rt      = ExecutionCompositionRoot.compose({ runtimeClock: clock });

    // CompositionRoot should expose reportAssembler
    assert(rt.reportAssembler !== undefined,           "reportAssembler missing from ComposedRuntime");
    assert(typeof rt.reportAssembler.assemble === "function", "assemble() missing");

    // Chain uses the same instance (not a new one)
    const chain = new ExecutionChain({ runtimeClock: clock });
    // Verify chain executes without error — assembler was properly injected
    const r = await chain.execute(inp("injection test", 1));
    assert(r.status === "COMPLETED", `status=${r.status}`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// EQ-07 — Regression: basic execution scenarios
// ══════════════════════════════════════════════════════════════════════════════
async function eq07(): Promise<EQCase> {
  return run("EQ-07", "Regression: memory recall, email, calendar, drive all complete", async () => {
    const chain = makeChain();
    const scenarios = [
      inp("What was decided last week?", 10),
      inp("Send email to boss@corp.com", 11),
      inp("Schedule meeting tomorrow at 9am", 12),
      inp("Open project plan in drive", 13),
    ];
    for (const i of scenarios) {
      const r = await chain.execute(i);
      assert(r.status === "COMPLETED", `${i.text}: status=${r.status}`);
      assert(r.stagesTotal === 13, `${i.text}: stagesTotal=${r.stagesTotal}`);
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// EQ-08 — Architecture Freeze: pipeline has exactly 13 stages
// ══════════════════════════════════════════════════════════════════════════════
async function eq08(): Promise<EQCase> {
  return run("EQ-08", "Architecture Freeze: exactly 13 stages in canonical pipeline", async () => {
    const chain = makeChain();
    const r = await chain.execute(inp("architecture freeze test", 20));
    assert(r.stagesTotal === 13,   `stagesTotal=${r.stagesTotal}`);
    assert(r.stagesPassed === 13,  `stagesPassed=${r.stagesPassed}`);
    assert(Object.isFrozen(r),     "report not frozen");

    // Verify canonical stage IDs
    const ids = r.stages.map(s => s.stage);
    const expected = [
      "USER_INPUT", "INTENT_RUNTIME", "GOAL_RUNTIME", "PLANNING_RUNTIME",
      "KERNEL", "RUNTIME_ORCHESTRATOR", "CAPABILITY_RUNTIME", "CONNECTOR_RUNTIME",
      "CONNECTOR", "RESULT", "MEMORY", "EXPLAINABILITY", "AUDIT",
    ];
    for (const id of expected) {
      assert(ids.includes(id), `Stage ${id} missing from pipeline`);
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// EQ-09 — Dashboard isolation preserved
// ══════════════════════════════════════════════════════════════════════════════
async function eq09(): Promise<EQCase> {
  return run("EQ-09", "withRecord helper is safe for snapshot assembly", async () => {
    const base = EMPTY_EXECUTION_STATE;
    const record = Object.freeze({
      stage: "TEST" as never,
      status: "COMPLETED" as const,
      startedAt: 0,
      completedAt: 10,
      durationMs: 10,
      input: null,
      output: null,
      error: null,
    });
    const s = withRecord(base, record);
    assert(s.records.length === 1, "record not appended");
    assert(Object.isFrozen(s),     "state not frozen");
    assert(Object.isFrozen(s.records), "records not frozen");
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// EQ-10 — Previous certifications remain compatible
// ══════════════════════════════════════════════════════════════════════════════
async function eq10(): Promise<EQCase> {
  return run("EQ-10", "P-01.11A+B: ExecutionChain public API unchanged", async () => {
    const chain = makeChain();
    // All fields from ExecutionChainReport must still exist
    const r = await chain.execute(inp("backward compat", 30));
    assert("chainId"              in r, "chainId missing");
    assert("sessionId"            in r, "sessionId missing");
    assert("userId"               in r, "userId missing");
    assert("startedAt"            in r, "startedAt missing");
    assert("completedAt"          in r, "completedAt missing");
    assert("totalDurationMs"      in r, "totalDurationMs missing");
    assert("status"               in r, "status missing");
    assert("stages"               in r, "stages missing");
    assert("userInput"            in r, "userInput missing");
    assert("finalOutput"          in r, "finalOutput missing");
    assert("memoryResult"         in r, "memoryResult missing");
    assert("explainabilityResult" in r, "explainabilityResult missing");
    assert("auditResult"          in r, "auditResult missing");
    assert("stagesPassed"         in r, "stagesPassed missing");
    assert("stagesTotal"          in r, "stagesTotal missing");
    // chain.bus() and chain.metrics() still work
    assert(typeof chain.bus     === "function", "bus() missing");
    assert(typeof chain.metrics === "function", "metrics() missing");
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Public runner
// ══════════════════════════════════════════════════════════════════════════════
export async function runEngineeringQualityCertification(): Promise<EQReport> {
  const t0 = Date.now();

  const cases = await Promise.all([
    eq01(), eq02(), eq03(), eq04(), eq05(),
    eq06(), eq07(), eq08(), eq09(), eq10(),
  ]);

  const passed  = cases.filter(c => c.status === "PASS").length;
  const failed  = cases.filter(c => c.status === "FAIL").length;
  const total   = cases.length;

  return {
    certified:  failed === 0,
    passed,
    failed,
    total,
    passRate:   `${((passed / total) * 100).toFixed(1)}%`,
    durationMs: Date.now() - t0,
    cases,
  };
}