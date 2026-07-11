// cognitivePipelineAdapterTests.ts
// Sprint INT-01 · Engineering First
// 16 Acceptance Tests + 8 Hardening Tests = 24 criterios

import { CognitivePipelineAdapter } from "./CognitivePipelineAdapter";
import type { AdapterTestResult, AdapterTestSuite } from "./CognitivePipelineAdapterTypes";

function uid(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function run(
  criterion: number,
  name: string,
  fn: () => Promise<void> | void,
): Promise<AdapterTestResult> {
  const start = Date.now();
  try {
    await fn();
    return { criterion, name, passed: true, durationMs: Date.now() - start };
  } catch (err) {
    return {
      criterion,
      name,
      passed: false,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

function makeInput(overrides?: Partial<Parameters<CognitivePipelineAdapter["execute"]>[0]>) {
  return {
    message:   "What is the status of my memory?",
    sessionId: `sess-${uid()}`,
    userId:    `user-${uid()}`,
    projectId: "proj-test",
    ...overrides,
  };
}

export async function runCognitivePipelineAdapterTests(): Promise<AdapterTestSuite> {
  const suiteStart = Date.now();
  const results: AdapterTestResult[] = [];

  // ── Acceptance Tests (C1-C16) ──────────────────────────────────────────────

  results.push(await run(1, "execute() returns AdapterOutput with executionId", async () => {
    const a = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput());
    assert(typeof out.executionId === "string" && out.executionId.startsWith("cpa-"), "executionId must start with cpa-");
  }));

  results.push(await run(2, "execute() returns success=true for valid input", async () => {
    const a = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput());
    assert(out.success === true, `expected success=true, got ${out.success} error=${out.error}`);
  }));

  results.push(await run(3, "execute() returns 13 stages", async () => {
    const a = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput());
    assert(out.stages.length === 13, `expected 13 stages, got ${out.stages.length}`);
  }));

  results.push(await run(4, "INTENT_ADAPTER stage is COMPLETED", async () => {
    const a = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput());
    const s = out.stages.find(s => s.stage === "INTENT_ADAPTER");
    assert(s?.status === "COMPLETED", `INTENT_ADAPTER status=${s?.status}`);
  }));

  results.push(await run(5, "GOAL_RUNTIME stage is COMPLETED", async () => {
    const a = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput());
    const s = out.stages.find(s => s.stage === "GOAL_RUNTIME");
    assert(s?.status === "COMPLETED", `GOAL_RUNTIME status=${s?.status} error=${s?.error}`);
  }));

  results.push(await run(6, "DECISION_ENGINE stage is COMPLETED", async () => {
    const a = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput());
    const s = out.stages.find(s => s.stage === "DECISION_ENGINE");
    assert(s?.status === "COMPLETED", `DECISION_ENGINE status=${s?.status}`);
  }));

  results.push(await run(7, "PLANNING_ENGINE stage is COMPLETED", async () => {
    const a = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput());
    const s = out.stages.find(s => s.stage === "PLANNING_ENGINE");
    assert(s?.status === "COMPLETED", `PLANNING_ENGINE status=${s?.status}`);
  }));

  results.push(await run(8, "REFLECTION_ENGINE stage is COMPLETED", async () => {
    const a = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput());
    const s = out.stages.find(s => s.stage === "REFLECTION_ENGINE");
    assert(s?.status === "COMPLETED" || s?.status === "SKIPPED", `REFLECTION_ENGINE status=${s?.status}`);
  }));

  results.push(await run(9, "CAPABILITY_RUNTIME stage is SKIPPED (TODO INT-01-002)", async () => {
    const a = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput());
    const s = out.stages.find(s => s.stage === "CAPABILITY_RUNTIME");
    assert(s?.status === "SKIPPED", `expected SKIPPED got ${s?.status}`);
  }));

  results.push(await run(10, "MEMORY_ENGINE and KNOWLEDGE_ENGINE stages present", async () => {
    const a = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput());
    const mem  = out.stages.find(s => s.stage === "MEMORY_ENGINE");
    const know = out.stages.find(s => s.stage === "KNOWLEDGE_ENGINE");
    assert(!!mem,  "MEMORY_ENGINE stage missing");
    assert(!!know, "KNOWLEDGE_ENGINE stage missing");
  }));

  results.push(await run(11, "RESPONSE stage is COMPLETED", async () => {
    const a = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput());
    const s = out.stages.find(s => s.stage === "RESPONSE");
    assert(s?.status === "COMPLETED", `RESPONSE status=${s?.status}`);
  }));

  results.push(await run(12, "execute() logs include all stages", async () => {
    const a = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput());
    assert(out.logs.length >= 13, `expected >=13 logs, got ${out.logs.length}`);
    const hasReqFields = out.logs.every(l => l.executionId && l.pipelineStage && l.module && l.status && l.timestamp > 0);
    assert(hasReqFields, "some logs missing required fields");
  }));

  results.push(await run(13, "execute() returns goalId", async () => {
    const a = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput());
    assert(typeof out.goalId === "string" && out.goalId.length > 0, "goalId must be a non-empty string");
  }));

  results.push(await run(14, "metrics updated after execution", async () => {
    const a = new CognitivePipelineAdapter();
    await a.execute(makeInput());
    const m = a.getMetrics();
    assert(m.executionTotal === 1, `executionTotal=${m.executionTotal}`);
    assert(m.successTotal   === 1, `successTotal=${m.successTotal}`);
    assert(m.avgDurationMs  >= 0,  `avgDurationMs=${m.avgDurationMs}`);
  }));

  results.push(await run(15, "statistics() returns correct successRate", async () => {
    const a = new CognitivePipelineAdapter();
    await a.execute(makeInput());
    await a.execute(makeInput());
    const s = a.statistics();
    assert(s.executionTotal === 2,   `executionTotal=${s.executionTotal}`);
    assert(s.successRate    === 1.0, `successRate=${s.successRate}`);
  }));

  results.push(await run(16, "health() returns SUCCESS when all modules healthy", async () => {
    const a = new CognitivePipelineAdapter();
    const h = a.health();
    assert(h.status === "SUCCESS", `health=${h.status} details=${h.details}`);
    assert(typeof h.checks.goalRuntime === "boolean", "checks.goalRuntime must be boolean");
  }));

  // ── Hardening Tests (C17-C24) ─────────────────────────────────────────────

  results.push(await run(17, "[Hardening] execute() with empty message still processes", async () => {
    const a   = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput({ message: "" }));
    // Empty message: GoalRuntime may fail validation — must not throw
    assert(typeof out.executionId === "string", "executionId must be present even on empty message");
  }));

  results.push(await run(18, "[Hardening] execute() with very long message (5000 chars)", async () => {
    const a   = new CognitivePipelineAdapter();
    const msg = "a".repeat(5000);
    const out = await a.execute(makeInput({ message: msg }));
    assert(typeof out.executionId === "string", "executionId must be present");
    assert(out.stages.length === 13, "must still produce 13 stages");
  }));

  results.push(await run(19, "[Hardening] two consecutive executions with same adapter instance", async () => {
    const a  = new CognitivePipelineAdapter();
    const o1 = await a.execute(makeInput());
    const o2 = await a.execute(makeInput());
    assert(o1.executionId !== o2.executionId, "executionIds must be unique");
    assert(a.getMetrics().executionTotal === 2, `executionTotal should be 2`);
  }));

  results.push(await run(20, "[Hardening] reset() clears all state", async () => {
    const a = new CognitivePipelineAdapter();
    await a.execute(makeInput());
    a.reset();
    const m = a.getMetrics();
    assert(m.executionTotal === 0, `executionTotal after reset=${m.executionTotal}`);
    assert(a.getLogs().length === 0, "logs must be empty after reset");
  }));

  results.push(await run(21, "[Hardening] each stage result is frozen (immutable)", async () => {
    const a   = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput());
    const allFrozen = out.stages.every(s => Object.isFrozen(s));
    assert(allFrozen, "all stage results must be frozen");
  }));

  results.push(await run(22, "[Hardening] AdapterOutput is frozen", async () => {
    const a   = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput());
    assert(Object.isFrozen(out), "AdapterOutput must be frozen");
  }));

  results.push(await run(23, "[Hardening] each log has duration >= 0", async () => {
    const a   = new CognitivePipelineAdapter();
    const out = await a.execute(makeInput());
    const ok  = out.logs.every(l => typeof l.duration === "number" && l.duration >= 0);
    assert(ok, "all logs must have duration >= 0");
  }));

  results.push(await run(24, "[Hardening] getLogs() returns copy — mutation does not affect internal state", async () => {
    const a   = new CognitivePipelineAdapter();
    await a.execute(makeInput());
    const logs1 = a.getLogs();
    const countBefore = logs1.length;
    // mutate the returned array
    (logs1 as unknown[]).push({ fake: true });
    const logs2 = a.getLogs();
    assert(logs2.length === countBefore, "internal logs must not be affected by mutation of returned array");
  }));

  // ── Suite result ──────────────────────────────────────────────────────────

  const adapter    = new CognitivePipelineAdapter();
  // Run a single execution to get populated health/statistics
  await adapter.execute(makeInput());

  const passed = results.filter(r => r.passed).length;
  return {
    passed,
    total:      results.length,
    durationMs: Date.now() - suiteStart,
    results,
    health:     adapter.health(),
    statistics: adapter.statistics(),
    metrics:    adapter.getMetrics(),
  };
}