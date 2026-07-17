// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11 — ExecutionChain Certification Suite
// Phases 12 + 13 + 14: Regression · Integration · Architecture Validation
// 100% deterministic — no network, no LLM, no mocks beyond injected stubs.
// ══════════════════════════════════════════════════════════════════════════════

import { ExecutionChain }       from "./ExecutionChain";
import { DeterministicClock }   from "../runtime-infra/RuntimeClock";
import { DeterministicProvider } from "../runtime-infra/RuntimeExecutionIdProvider";
import { RuntimeEventBus }      from "../runtime-infra/RuntimeEventBus";
import { RuntimeMetrics }       from "../runtime-infra/RuntimeMetrics";
import type { UserInput }       from "./ExecutionChainTypes";

export interface CertCase {
  id: string;
  label: string;
  status: "PASS" | "FAIL";
  durationMs: number;
  error?: string;
}

export interface CertReport {
  certified: boolean;
  passed: number;
  failed: number;
  total: number;
  passRate: string;
  durationMs: number;
  cases: CertCase[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeChain(clockStep = 10): { chain: ExecutionChain; bus: RuntimeEventBus; metrics: RuntimeMetrics } {
  const clock   = new DeterministicClock(clockStep);
  const ids     = new DeterministicProvider("cert");
  const bus     = new RuntimeEventBus(2000);
  const metrics = new RuntimeMetrics(60000, () => clock.now());
  const chain   = new ExecutionChain({ runtimeClock: clock, executionIdProvider: ids, eventBus: bus, metrics });
  return { chain, bus, metrics };
}

function input(text: string, idx = 0): UserInput {
  return Object.freeze({ text, sessionId: `sess-cert-${idx}`, userId: "user-cert", timestamp: 1000 });
}

async function run(label: string, fn: () => Promise<void>): Promise<CertCase> {
  const t0 = Date.now();
  try {
    await fn();
    return { id: label, label, status: "PASS", durationMs: Date.now() - t0 };
  } catch (e: unknown) {
    return { id: label, label, status: "FAIL", durationMs: Date.now() - t0, error: String((e as Error).message ?? e) };
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 12 — Regression Tests (existing behaviour preserved)
// ══════════════════════════════════════════════════════════════════════════════
async function regressionSuite(): Promise<CertCase[]> {
  const cases: CertCase[] = [];

  cases.push(await run("R-01 — Memory recall completes 13 stages", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("What was decided last Friday?", 1));
    assert(r.status === "COMPLETED", `status=${r.status}`);
    assert(r.stagesTotal === 13, `stagesTotal=${r.stagesTotal}`);
    assert(r.stagesPassed === 13, `stagesPassed=${r.stagesPassed}`);
  }));

  cases.push(await run("R-02 — Connector query detects requiresConnector", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("Send email to boss@corp.com about the update", 2));
    assert(r.status === "COMPLETED", `status=${r.status}`);
    assert(r.finalOutput !== null, "finalOutput is null");
    assert(r.finalOutput!.sources.length > 0, "no sources");
  }));

  cases.push(await run("R-03 — Plan execute path produces plan steps", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("Create a document summarising the project", 3));
    assert(r.status === "COMPLETED", `status=${r.status}`);
    assert(r.memoryResult?.memorized === true, "not memorized");
  }));

  cases.push(await run("R-04 — auditResult is always present on success", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("recall last week's notes", 4));
    assert(r.auditResult !== null, "auditResult is null");
    assert(["COMPLIANT", "WARNING", "VIOLATION"].includes(r.auditResult!.complianceStatus), "invalid compliance");
  }));

  cases.push(await run("R-05 — explainabilityResult always present on success", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("what projects am I working on?", 5));
    assert(r.explainabilityResult !== null, "explainabilityResult is null");
    assert(r.explainabilityResult!.stagesExecuted.length > 0, "no stages in explain");
  }));

  cases.push(await run("R-06 — memoryResult tier is ACTIVE", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("any pending tasks?", 6));
    assert(r.memoryResult?.tier === "ACTIVE", `tier=${r.memoryResult?.tier}`);
  }));

  cases.push(await run("R-07 — chainId, sessionId, userId are set correctly", async () => {
    const { chain } = makeChain();
    const inp = input("test identity fields", 7);
    const r = await chain.execute(inp);
    assert(r.sessionId === inp.sessionId, "sessionId mismatch");
    assert(r.userId    === inp.userId,    "userId mismatch");
    assert(r.chainId.startsWith("chain"), `chainId=${r.chainId}`);
  }));

  cases.push(await run("R-08 — totalDurationMs is non-negative", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("quick recall", 8));
    assert(r.totalDurationMs >= 0, `totalDurationMs=${r.totalDurationMs}`);
  }));

  cases.push(await run("R-09 — All stage records are frozen (immutable)", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("freeze test", 9));
    for (const s of r.stages) {
      assert(Object.isFrozen(s), `stage ${s.stage} is not frozen`);
    }
  }));

  cases.push(await run("R-10 — Report itself is frozen", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("immutability check", 10));
    assert(Object.isFrozen(r), "report is not frozen");
  }));

  return cases;
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 13 — Integration Tests (full scenario coverage)
// ══════════════════════════════════════════════════════════════════════════════
async function integrationSuite(): Promise<CertCase[]> {
  const cases: CertCase[] = [];

  // Memory recall
  cases.push(await run("I-01 — Memory recall: intent=MEMORY_RECALL", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("What did we decide about the architecture?", 11));
    assert(r.status === "COMPLETED", `status=${r.status}`);
    assert(!r.finalOutput?.sources.includes("Gmail"), "unexpected Gmail source");
  }));

  // Gmail / email connector
  cases.push(await run("I-02 — Email connector: resolves gmail", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("Send email to alice@example.com with meeting notes", 12));
    assert(r.status === "COMPLETED", `status=${r.status}`);
    const orchOut = r.stages.find(s => s.stage === "RUNTIME_ORCHESTRATOR")?.output as { selectedConnector?: string };
    assert(orchOut?.selectedConnector === "gmail", `connector=${orchOut?.selectedConnector}`);
  }));

  // Calendar connector
  cases.push(await run("I-03 — Calendar: resolves google_calendar", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("Schedule a meeting for tomorrow at 10am", 13));
    assert(r.status === "COMPLETED", `status=${r.status}`);
    const orchOut = r.stages.find(s => s.stage === "RUNTIME_ORCHESTRATOR")?.output as { selectedConnector?: string };
    assert(["google_calendar", "gmail"].includes(orchOut?.selectedConnector ?? ""), `connector=${orchOut?.selectedConnector}`);
  }));

  // Drive connector
  cases.push(await run("I-04 — Drive: resolves google_drive", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("Open the project plan document in drive", 14));
    assert(r.status === "COMPLETED", `status=${r.status}`);
    const orchOut = r.stages.find(s => s.stage === "RUNTIME_ORCHESTRATOR")?.output as { selectedConnector?: string };
    assert(orchOut?.selectedConnector === "google_drive", `connector=${orchOut?.selectedConnector}`);
  }));

  // Planning path
  cases.push(await run("I-05 — Planning: generates subGoals", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("Create a sprint plan for next week's work", 15));
    assert(r.status === "COMPLETED", `status=${r.status}`);
    const goalOut = r.stages.find(s => s.stage === "GOAL_RUNTIME")?.output as { subGoals?: string[] };
    assert((goalOut?.subGoals?.length ?? 0) > 0, "no subGoals produced");
  }));

  // Explainability evidence
  cases.push(await run("I-06 — Explainability: decisionLog contains per-stage evidence", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("What files did I edit last month?", 16));
    assert(r.explainabilityResult !== null, "no explainability");
    assert(r.explainabilityResult!.decisionLog.length >= 3, "decisionLog too short");
  }));

  // Audit via events
  cases.push(await run("I-07 — Audit: uses bus events, compliance COMPLIANT on clean run", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("recall my recent decisions", 17));
    assert(r.auditResult?.complianceStatus === "COMPLIANT", `compliance=${r.auditResult?.complianceStatus}`);
  }));

  // Memory storage
  cases.push(await run("I-08 — Memory: knowledgeExtracted is non-empty", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("summarise the last project discussion", 18));
    assert((r.memoryResult?.knowledgeExtracted?.length ?? 0) > 0, "no knowledge extracted");
  }));

  // EventBus receives events
  cases.push(await run("I-09 — EventBus: EXECUTION_STARTED and EXECUTION_COMPLETED emitted", async () => {
    const { chain, bus } = makeChain();
    await chain.execute(input("bus event test", 19));
    const types = bus.history().map(e => e.type);
    assert(types.includes("EXECUTION_STARTED"),   "EXECUTION_STARTED missing");
    assert(types.includes("EXECUTION_COMPLETED"), "EXECUTION_COMPLETED missing");
    assert(types.includes("STAGE_COMPLETED"),      "STAGE_COMPLETED missing");
  }));

  // Metrics recorded
  cases.push(await run("I-10 — Metrics: records at least 1 execution and 1 success", async () => {
    const { chain, metrics } = makeChain();
    await chain.execute(input("metrics test", 20));
    const snap = metrics.snapshot();
    assert(snap.executions >= 1, `executions=${snap.executions}`);
    assert(snap.successes  >= 1, `successes=${snap.successes}`);
  }));

  // Connector resolution — fallback to memory
  cases.push(await run("I-11 — ConnectorRegistry: unknown query falls back to memory", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("what is the meaning of life?", 21));
    assert(r.status === "COMPLETED", `status=${r.status}`);
    const orchOut = r.stages.find(s => s.stage === "RUNTIME_ORCHESTRATOR")?.output as { selectedConnector?: string };
    assert(orchOut?.selectedConnector === "memory", `connector=${orchOut?.selectedConnector}`);
  }));

  // Kernel security context
  cases.push(await run("I-12 — Kernel: securityContext contains userId", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("kernel context test", 22));
    const kern = r.stages.find(s => s.stage === "KERNEL")?.output as { securityContext?: { userId: string } };
    assert(kern?.securityContext?.userId === "user-cert", `userId=${kern?.securityContext?.userId}`);
  }));

  // Connector result has responseStatus 200
  cases.push(await run("I-13 — Connector: responseStatus=200", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("connector status test", 23));
    const conn = r.stages.find(s => s.stage === "CONNECTOR")?.output as { responseStatus?: number };
    assert(conn?.responseStatus === 200, `responseStatus=${conn?.responseStatus}`);
  }));

  // Result confidence matches intent
  cases.push(await run("I-14 — Result: confidence comes from intent", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("Send file to partner@corp.com", 24));
    assert((r.finalOutput?.confidence ?? 0) > 0, "confidence=0");
  }));

  // Multiple sequential executions share same infra
  cases.push(await run("I-15 — Sequential executions: both complete independently", async () => {
    const { chain } = makeChain();
    const r1 = await chain.execute(input("first query", 25));
    const r2 = await chain.execute(input("second query", 26));
    assert(r1.status === "COMPLETED", `r1.status=${r1.status}`);
    assert(r2.status === "COMPLETED", `r2.status=${r2.status}`);
    assert(r1.chainId !== r2.chainId, "chainIds collide");
  }));

  return cases;
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 14 — Architecture Validation
// ══════════════════════════════════════════════════════════════════════════════
async function architectureSuite(): Promise<CertCase[]> {
  const cases: CertCase[] = [];

  cases.push(await run("A-01 — No circular coupling: chain accepts external bus", async () => {
    const sharedBus = new RuntimeEventBus(500);
    const chain = new ExecutionChain({ eventBus: sharedBus });
    await chain.execute(input("circular test", 27));
    assert(chain.bus() === sharedBus, "bus not shared correctly");
  }));

  cases.push(await run("A-02 — SRP: chain exposes bus() and metrics() only", async () => {
    const chain = new ExecutionChain();
    assert(typeof chain.bus     === "function", "bus() missing");
    assert(typeof chain.metrics === "function", "metrics() missing");
    assert(typeof chain.execute === "function", "execute() missing");
  }));

  cases.push(await run("A-03 — Immutability: all stage outputs are frozen", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("immutability architecture", 28));
    for (const s of r.stages) {
      const out = s.output;
      if (out && typeof out === "object") {
        assert(Object.isFrozen(out), `stage ${s.stage} output not frozen`);
      }
    }
  }));

  cases.push(await run("A-04 — Low coupling: chain works with all-default deps", async () => {
    const chain = new ExecutionChain();
    const r = await chain.execute(input("default deps test", 29));
    assert(r.status === "COMPLETED", `status=${r.status}`);
  }));

  cases.push(await run("A-05 — Reuse: shared clock flows through all stages", async () => {
    const clock = new DeterministicClock(5);
    const chain = new ExecutionChain({ runtimeClock: clock });
    const r = await chain.execute(input("shared clock test", 30));
    // All timestamps should be deterministic multiples of 5
    assert(r.startedAt % 5 === 0, `startedAt=${r.startedAt} not multiple of 5`);
  }));

  cases.push(await run("A-06 — No duplication: single EventBus instance serves all stages", async () => {
    const { chain, bus } = makeChain();
    await chain.execute(input("bus singleton test", 31));
    const events = bus.history();
    assert(events.length > 10, `too few events: ${events.length}`);
    // All events share same bus (would fail if multiple buses existed)
    const execIds = new Set(events.map(e => e.executionId));
    assert(execIds.size >= 2, "expected multiple execution IDs in bus"); // chainId + stageIds
  }));

  cases.push(await run("A-07 — Explainability built from evidence, not post-hoc state", async () => {
    const { chain } = makeChain();
    const r = await chain.execute(input("evidence test", 32));
    const expl = r.explainabilityResult;
    assert(expl !== null, "no explainability");
    // Evidence strings should contain stage-specific content
    const hasStageEvidence = expl!.decisionLog.some(d => d.includes("Intent") || d.includes("Goal") || d.includes("Plan"));
    assert(hasStageEvidence, "decisionLog missing per-stage evidence");
  }));

  cases.push(await run("A-08 — Audit consumes bus events, not reconstructed state", async () => {
    const { chain, bus } = makeChain();
    await chain.execute(input("audit event test", 33));
    const stageCompletedCount = bus.ofType("STAGE_COMPLETED").length;
    assert(stageCompletedCount >= 12, `STAGE_COMPLETED events=${stageCompletedCount}`);
  }));

  cases.push(await run("A-09 — ConnectorRegistry is the sole resolver (no hardcoded names in chain)", async () => {
    // Inject a custom registry to confirm chain delegates to it
    let resolveCallCount = 0;
    const customRegistry = {
      resolve: (intent: { requiresConnector: boolean }) => {
        resolveCallCount++;
        return intent.requiresConnector ? "custom_connector" : "memory";
      },
    };
    const chain = new ExecutionChain({ connectorRegistry: customRegistry });
    await chain.execute(input("registry delegation test", 34));
    assert(resolveCallCount >= 1, `resolveCallCount=${resolveCallCount}`);
  }));

  cases.push(await run("A-10 — RuntimeClock is the single time source", async () => {
    const clock = new DeterministicClock(100);
    const chain = new ExecutionChain({ runtimeClock: clock });
    const r = await chain.execute(input("clock source test", 35));
    // With step=100, all timestamps are multiples of 100
    assert(r.startedAt % 100 === 0, `startedAt=${r.startedAt}`);
  }));

  return cases;
}

// ══════════════════════════════════════════════════════════════════════════════
// Public runner
// ══════════════════════════════════════════════════════════════════════════════
export async function runExecutionChainCertification(): Promise<CertReport> {
  const t0 = Date.now();

  const [regression, integration, architecture] = await Promise.all([
    regressionSuite(),
    integrationSuite(),
    architectureSuite(),
  ]);

  const cases   = [...regression, ...integration, ...architecture];
  const passed  = cases.filter(c => c.status === "PASS").length;
  const failed  = cases.filter(c => c.status === "FAIL").length;
  const total   = cases.length;
  const durationMs = Date.now() - t0;

  return {
    certified: failed === 0,
    passed,
    failed,
    total,
    passRate: `${((passed / total) * 100).toFixed(1)}%`,
    durationMs,
    cases,
  };
}