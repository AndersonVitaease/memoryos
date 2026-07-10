// ─── Registry Tests ───────────────────────────────────────────────────────────
// Foundation v1.0 · Testes do Registry, Pipeline, EventBus e HistoryStore

import { ReviewEngineRegistry } from "./ReviewEngineRegistry";
import { reviewEventBus }       from "./ReviewEventBus";
import { reviewHistory }        from "./ReviewHistoryStore";
import { runRegistryPipeline }  from "./RegistryPipeline";
import { MRIEngine }   from "./engines/MRIEngine";
import { MQCCSEngine } from "./engines/MQCCSEngine";
import { MERSEngine }  from "./engines/MERSEngine";
import { MADSEngine }  from "./engines/MADSEngine";
import type { ReviewEngine, EngineContext, EngineResult } from "./ReviewEngineContract";
import type { ReviewReport }  from "../ReviewReport";
import type { TestResult }    from "../ReviewReport";

export interface RegistryTestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function makeCtx(pass = 10, total = 10): EngineContext {
  const tests: TestResult[] = Array.from({ length: total }, (_, i) => ({
    name: `test_${i}`, passed: i < pass, error: undefined, durationMs: 2,
  }));
  return { tests, sprint: "sprint-test", foundation: "v1.0" };
}

function makeMockEngine(id: string, category = "Custom", priority = "Normal"): ReviewEngine {
  return {
    id, name: `Mock ${id}`, version: "1.0.0",
    category: category as any, priority: priority as any,
    execute: async (ctx) => ({
      engineId: id, engineName: `Mock ${id}`, category: category as any,
      gateName: id.toUpperCase(), status: "APPROVED" as const,
      data: { tested: true }, durationMs: 1,
    }),
  };
}

export async function runRegistryTests(): Promise<RegistryTestResult[]> {
  const results: RegistryTestResult[] = [];

  async function run(name: string, fn: () => Promise<void>) {
    const t0 = performance.now();
    try {
      await fn();
      results.push({ name, passed: true, durationMs: performance.now() - t0 });
    } catch (e) {
      results.push({ name, passed: false, error: String(e), durationMs: performance.now() - t0 });
    }
  }

  // ── Registry ──────────────────────────────────────────────────────────────

  await run("registry: register and discover engine", async () => {
    const reg = new ReviewEngineRegistry();
    reg.register(makeMockEngine("e1"));
    assert(reg.discover().length === 1, "should have 1 engine");
  });

  await run("registry: duplicate id throws", async () => {
    const reg = new ReviewEngineRegistry();
    reg.register(makeMockEngine("e1"));
    let threw = false;
    try { reg.register(makeMockEngine("e1")); } catch { threw = true; }
    assert(threw, "should throw on duplicate id");
  });

  await run("registry: replace overwrites without throwing", async () => {
    const reg = new ReviewEngineRegistry();
    reg.register(makeMockEngine("e1"));
    reg.replace(makeMockEngine("e1"));
    assert(reg.size() === 1, "should still have 1 engine");
  });

  await run("registry: remove deletes engine", async () => {
    const reg = new ReviewEngineRegistry();
    reg.register(makeMockEngine("e1"));
    reg.remove("e1");
    assert(reg.discover().length === 0, "should be empty after remove");
  });

  await run("registry: disable hides from discover()", async () => {
    const reg = new ReviewEngineRegistry();
    reg.register(makeMockEngine("e1"));
    reg.disable("e1");
    assert(reg.discover().length === 0, "disabled engine should not appear");
  });

  await run("registry: enable restores disabled engine", async () => {
    const reg = new ReviewEngineRegistry();
    reg.register(makeMockEngine("e1"));
    reg.disable("e1");
    reg.enable("e1");
    assert(reg.discover().length === 1, "re-enabled engine should appear");
  });

  await run("registry: sort by priority (Critical before Normal)", async () => {
    const reg = new ReviewEngineRegistry();
    reg.register(makeMockEngine("low1", "Custom", "Low"));
    reg.register(makeMockEngine("crit1", "Custom", "Critical"));
    reg.register(makeMockEngine("norm1", "Custom", "Normal"));
    const ids = reg.discover().map(e => e.id);
    assert(ids[0] === "crit1", `first should be Critical, got ${ids[0]}`);
    assert(ids[ids.length - 1] === "low1", "last should be Low");
  });

  await run("registry: has() works correctly", async () => {
    const reg = new ReviewEngineRegistry();
    reg.register(makeMockEngine("e1"));
    assert(reg.has("e1"), "should have e1");
    assert(!reg.has("e2"), "should not have e2");
  });

  await run("registry: listAll() returns active + inactive", async () => {
    const reg = new ReviewEngineRegistry();
    reg.register(makeMockEngine("e1"));
    reg.register(makeMockEngine("e2"));
    reg.disable("e2");
    assert(reg.listAll().length === 2, "listAll should return 2 entries");
    assert(reg.discover().length === 1, "discover should return only 1");
  });

  // ── Engine wrappers ───────────────────────────────────────────────────────

  await run("MRIEngine: executes and returns APPROVED", async () => {
    const e = new MRIEngine();
    const r = await e.execute(makeCtx(10, 10));
    assert(r.status === "APPROVED", "should be APPROVED");
    assert(r.engineId === "mri", "engineId should be mri");
    assert(r.category === "Testing", "category should be Testing");
  });

  await run("MRIEngine: partial pass → FAILED", async () => {
    const e = new MRIEngine();
    const r = await e.execute(makeCtx(5, 10));
    assert(r.status === "FAILED", "should be FAILED");
  });

  await run("MQCCSEngine: executes and returns CERTIFIED", async () => {
    const e = new MQCCSEngine();
    const r = await e.execute(makeCtx(10, 10));
    assert(r.status === "CERTIFIED", "should be CERTIFIED");
  });

  await run("MERSEngine: executes and returns APPROVED", async () => {
    const e = new MERSEngine();
    const r = await e.execute(makeCtx(10, 10));
    assert(r.status === "APPROVED", "should be APPROVED");
  });

  await run("MADSEngine: no isolation failures → APPROVED", async () => {
    const e = new MADSEngine();
    const r = await e.execute(makeCtx(10, 10));
    assert(r.status === "APPROVED", "should be APPROVED");
  });

  // ── Pipeline ──────────────────────────────────────────────────────────────

  await run("pipeline: runs all 4 core engines", async () => {
    const r = await runRegistryPipeline(makeCtx(10, 10));
    assert(r.engineResults.length >= 4, `expected ≥4 engines, got ${r.engineResults.length}`);
    const ids = r.engineResults.map(e => e.engineId);
    assert(ids.includes("mri"),   "mri should run");
    assert(ids.includes("mqccs"), "mqccs should run");
    assert(ids.includes("mers"),  "mers should run");
    assert(ids.includes("mads"),  "mads should run");
  });

  await run("pipeline: extraGates empty for 4 core engines", async () => {
    const r = await runRegistryPipeline(makeCtx(10, 10));
    assert(r.extraGates.length === 0, "no extra gates for core engines");
  });

  await run("pipeline: extra registered engine appears in extraGates", async () => {
    const { ReviewEngineRegistry: Reg } = await import("./ReviewEngineRegistry");
    const { RegistryPipeline } = await import("./RegistryPipeline");
    // Use the global registry and add a temp engine
    const { globalRegistry } = await import("./ReviewEngineRegistry");
    const tempEngine = makeMockEngine("perf-test-temp", "Performance", "Normal");
    globalRegistry.register(tempEngine);
    const r = await runRegistryPipeline(makeCtx(10, 10));
    const extra = r.extraGates.find(g => g.name === "PERF-TEST-TEMP");
    globalRegistry.remove("perf-test-temp");
    assert(!!extra, "extra engine should appear in extraGates");
  });

  // ── EventBus ──────────────────────────────────────────────────────────────

  await run("eventBus: subscribe and receive events", async () => {
    const events: string[] = [];
    const unsub = reviewEventBus.subscribe(e => events.push(e.type));
    reviewEventBus.publish("ReviewStarted", "sprint-test");
    unsub();
    assert(events.includes("ReviewStarted"), "should receive ReviewStarted");
  });

  await run("eventBus: unsubscribe stops receiving", async () => {
    const events: string[] = [];
    const unsub = reviewEventBus.subscribe(e => events.push(e.type));
    reviewEventBus.publish("ReviewStarted", "sprint-test");
    unsub();
    reviewEventBus.publish("ReviewCompleted", "sprint-test");
    assert(events.length === 1, "should only have 1 event after unsubscribe");
  });

  await run("eventBus: getHistory filters by sprint", async () => {
    reviewEventBus.publish("ReviewStarted", "sprint-x");
    reviewEventBus.publish("ReviewStarted", "sprint-y");
    const xEvents = reviewEventBus.getHistory("sprint-x");
    assert(xEvents.every(e => e.sprint === "sprint-x"), "should only have sprint-x events");
  });

  // ── HistoryStore ──────────────────────────────────────────────────────────

  await run("historyStore: persist and retrieve", async () => {
    const fakeReport = {
      reviewId: `test_${Date.now()}`, sprint: "sprint-hist-test",
      sprintLabel: "Test Sprint", timestamp: Date.now(), status: "APPROVED",
      mri: { passed: 10, total: 10, passRate: 100, totalDurationMs: 10, avgDurationMs: 1, tests: [], status: "APPROVED" },
      mqccs: { coverage: 100, level: "PLATINUM", status: "CERTIFIED" },
      mers: { architectureScore: 100, securityScore: 100, performanceScore: 100, overallScore: 100, status: "APPROVED" },
      mads: { criticalDrift: 0, highDrift: 0, technicalDebt: 0, status: "APPROVED" },
      compliance: [], findings: [], placeholders: [], abstractions: [],
      quality: { strengths: [], concerns: [], risks: [], techDebt: [], dimensions: [] },
      verdict: { approved: true, blockers: [], items: [], summary: "ok" },
      gates: [],
    } as unknown as ReviewReport;

    reviewHistory.persist(fakeReport);
    const all = reviewHistory.getAll();
    assert(all.some(e => e.reviewId === fakeReport.reviewId), "persisted report should be retrievable");
  });

  await run("historyStore: getLatest returns most recent", async () => {
    const latest = reviewHistory.getLatest();
    assert(latest !== null, "should have at least one entry");
  });

  await run("historyStore: getBySprint filters correctly", async () => {
    const entries = reviewHistory.getBySprint("sprint-hist-test");
    assert(entries.length >= 1, "should find the test entry");
    assert(entries.every(e => e.sprint === "sprint-hist-test"), "all entries should match sprint");
  });

  return results;
}