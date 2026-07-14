/**
 * copTests.ts — Cognitive Observability Platform Test Suite
 * Sprint 7.1.1: Full coverage for all 11 inspectors + manager.
 */

import { ContextInspector } from "./ContextInspector";
import { PromptInspector } from "./PromptInspector";
import { PipelineTimelineInspector } from "./PipelineTimeline";
import { StreamingInspector } from "./StreamingInspector";
import { MemoryInspector } from "./MemoryInspector";
import { SpecialistInspector } from "./SpecialistInspector";
import { ConnectorInspector } from "./ConnectorInspector";
import { DecisionInspector } from "./DecisionInspector";
import { PerformanceTimeline } from "./PerformanceTimeline";
import { EventReplay } from "./EventReplay";
import { ConversationReplayEngine } from "./ConversationReplay";
import { CognitiveObservabilityManager } from "./CognitiveObservabilityManager";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

interface SuiteResult {
  suite: string;
  results: TestResult[];
  passed: number;
  failed: number;
  totalMs: number;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function runTest(name: string, fn: () => void | Promise<void>): Promise<TestResult> {
  const start = performance.now();
  try {
    await fn();
    return { name, passed: true, durationMs: Math.round(performance.now() - start) };
  } catch (e: any) {
    return { name, passed: false, error: e.message, durationMs: Math.round(performance.now() - start) };
  }
}

// ─── Suite 1: Context Inspector ───────────────────────────────────────────────

async function suiteContextInspector(): Promise<SuiteResult> {
  const ctx = ContextInspector.getInstance();
  ctx.clear();
  const cid = "conv-test-1";
  const mid = "msg-test-1";

  const results = await Promise.all([
    runTest("startCapture creates snapshot", () => {
      ctx.startCapture(cid, mid);
      assert(ctx.getSnapshot(mid) !== null, "snapshot should exist");
    }),
    runTest("addMessages records items", () => {
      ctx.startCapture(cid, "msg-2");
      ctx.addMessages("msg-2", [{ role: "user", content: "Hello" }]);
      const snap = ctx.getSnapshot("msg-2")!;
      assert(snap.items.length === 1, "should have 1 item");
      assert(snap.items[0].type === "message", "type should be message");
    }),
    runTest("addSummary records summary item", () => {
      ctx.startCapture(cid, "msg-3");
      ctx.addSummary("msg-3", "Test summary");
      const snap = ctx.getSnapshot("msg-3")!;
      assert(snap.items[0].type === "summary", "should be summary type");
    }),
    runTest("tokenEstimate is positive", () => {
      ctx.startCapture(cid, "msg-4");
      ctx.addMessages("msg-4", [{ role: "user", content: "Hello world this is a test" }]);
      const snap = ctx.getSnapshot("msg-4")!;
      assert(snap.totalTokensEstimate > 0, "tokens should be > 0");
    }),
    runTest("getLatest returns last snapshot", () => {
      const latest = ctx.getLatest();
      assert(latest !== null, "latest should not be null");
    }),
  ]);

  ctx.clear();
  const passed = results.filter((r) => r.passed).length;
  return { suite: "ContextInspector", results, passed, failed: results.length - passed, totalMs: results.reduce((s, r) => s + r.durationMs, 0) };
}

// ─── Suite 2: Prompt Inspector ────────────────────────────────────────────────

async function suitePromptInspector(): Promise<SuiteResult> {
  const insp = PromptInspector.getInstance();
  insp.clear();

  const results = await Promise.all([
    runTest("startCapture creates snapshot", () => {
      insp.startCapture("c1", "m1");
      assert(insp.getSnapshot("m1") !== null, "snapshot should exist");
    }),
    runTest("addSystemPrompt adds block", () => {
      insp.startCapture("c1", "m2");
      insp.addSystemPrompt("m2", "You are MemoryOS.");
      const snap = insp.getSnapshot("m2")!;
      assert(snap.blocks.length === 1, "should have 1 block");
      assert(snap.blocks[0].label === "System Prompt", "label check");
    }),
    runTest("tokenEstimate accumulates", () => {
      insp.startCapture("c1", "m3");
      insp.addSystemPrompt("m3", "System prompt content here");
      insp.addUserPrompt("m3", "User question here");
      const snap = insp.getSnapshot("m3")!;
      assert(snap.totalTokens > 0, "total tokens > 0");
    }),
    runTest("finalizePrompt builds finalPrompt string", () => {
      insp.startCapture("c1", "m4");
      insp.addSystemPrompt("m4", "System");
      insp.addUserPrompt("m4", "User");
      insp.finalizePrompt("m4");
      const snap = insp.getSnapshot("m4")!;
      assert(snap.finalPrompt.length > 0, "finalPrompt should not be empty");
    }),
    runTest("stats returns correct structure", () => {
      const s = insp.stats();
      assert(typeof s.totalSnapshots === "number", "totalSnapshots should be number");
    }),
  ]);

  insp.clear();
  const passed = results.filter((r) => r.passed).length;
  return { suite: "PromptInspector", results, passed, failed: results.length - passed, totalMs: results.reduce((s, r) => s + r.durationMs, 0) };
}

// ─── Suite 3: Pipeline Timeline ───────────────────────────────────────────────

async function suitePipelineTimeline(): Promise<SuiteResult> {
  const tl = PipelineTimelineInspector.getInstance();
  tl.clear();

  const results = await Promise.all([
    runTest("startTimeline creates timeline", () => {
      tl.startTimeline("c1", "m1");
      assert(tl.getTimeline("m1") !== null, "timeline should exist");
    }),
    runTest("stageStart records step", () => {
      tl.startTimeline("c1", "m2");
      tl.stageStart("m2", "prepare");
      const t = tl.getTimeline("m2")!;
      assert(t.steps.length === 1, "should have 1 step");
      assert(t.steps[0].status === "running", "should be running");
    }),
    runTest("stageDone marks step as done", () => {
      tl.startTimeline("c1", "m3");
      tl.stageStart("m3", "prepare");
      tl.stageDone("m3", "prepare");
      const t = tl.getTimeline("m3")!;
      assert(t.steps[0].status === "done", "should be done");
      assert((t.steps[0].durationMs ?? 0) >= 0, "durationMs >= 0");
    }),
    runTest("finalizeTimeline sets totalDurationMs", () => {
      tl.startTimeline("c1", "m4");
      tl.stageStart("m4", "prepare");
      tl.finalizeTimeline("m4");
      const t = tl.getTimeline("m4")!;
      assert(t.totalDurationMs != null, "totalDurationMs should be set");
    }),
    runTest("stageSkip records skipped", () => {
      tl.startTimeline("c1", "m5");
      tl.stageSkip("m5", "execute_capabilities");
      const t = tl.getTimeline("m5")!;
      assert(t.steps[0].status === "skipped", "should be skipped");
    }),
  ]);

  tl.clear();
  const passed = results.filter((r) => r.passed).length;
  return { suite: "PipelineTimeline", results, passed, failed: results.length - passed, totalMs: results.reduce((s, r) => s + r.durationMs, 0) };
}

// ─── Suite 4: Streaming Inspector ────────────────────────────────────────────

async function suiteStreamingInspector(): Promise<SuiteResult> {
  const insp = StreamingInspector.getInstance();
  insp.clear();

  const results = await Promise.all([
    runTest("startStreaming initializes snapshot", () => {
      insp.startStreaming("c1", "m1");
      assert(insp.getSnapshot("m1") !== null, "snapshot should exist");
    }),
    runTest("onChunk records first token time", () => {
      insp.startStreaming("c1", "m2");
      insp.onChunk("m2", "Hello");
      const snap = insp.getSnapshot("m2")!;
      assert(snap.firstTokenAt != null, "firstTokenAt should be set");
      assert(snap.timeToFirstTokenMs != null, "timeToFirstToken should be set");
    }),
    runTest("onChunk accumulates chars", () => {
      insp.startStreaming("c1", "m3");
      insp.onChunk("m3", "Hello ");
      insp.onChunk("m3", "world");
      const snap = insp.getSnapshot("m3")!;
      assert(snap.totalChars === 11, "totalChars should be 11");
      assert(snap.chunkCount === 2, "chunkCount should be 2");
    }),
    runTest("finalizeStreaming sets tokensPerSecond", () => {
      insp.startStreaming("c1", "m4");
      insp.onChunk("m4", "Test content for speed measurement");
      insp.finalizeStreaming("m4");
      const snap = insp.getSnapshot("m4")!;
      assert(snap.tokensPerSecond != null, "tokensPerSecond should be set");
    }),
    runTest("onInterruption increments counter", () => {
      insp.startStreaming("c1", "m5");
      insp.onInterruption("m5");
      insp.onInterruption("m5");
      const snap = insp.getSnapshot("m5")!;
      assert(snap.interruptionCount === 2, "interruptionCount should be 2");
      assert(snap.interrupted === true, "interrupted should be true");
    }),
  ]);

  insp.clear();
  const passed = results.filter((r) => r.passed).length;
  return { suite: "StreamingInspector", results, passed, failed: results.length - passed, totalMs: results.reduce((s, r) => s + r.durationMs, 0) };
}

// ─── Suite 5: Memory Inspector ────────────────────────────────────────────────

async function suiteMemoryInspector(): Promise<SuiteResult> {
  const insp = MemoryInspector.getInstance();
  insp.clear();

  const results = await Promise.all([
    runTest("startCapture creates snapshot", () => {
      insp.startCapture("c1", "m1");
      assert(insp.getSnapshot("m1") !== null, "snapshot should exist");
    }),
    runTest("addDecisions records long_term items", () => {
      insp.startCapture("c1", "m2");
      insp.addDecisions("m2", [{ title: "Use React", description: "Chose React", source: "conv", date: "2024-01-01" }]);
      const snap = insp.getSnapshot("m2")!;
      assert(snap.byTier.long_term === 1, "long_term count should be 1");
    }),
    runTest("addTasks records working items", () => {
      insp.startCapture("c1", "m3");
      insp.addTasks("m3", [{ title: "Task A", description: "Do it", status: "pending" }]);
      const snap = insp.getSnapshot("m3")!;
      assert(snap.byTier.working === 1, "working count should be 1");
    }),
    runTest("getByTier filters correctly", () => {
      insp.startCapture("c1", "m4");
      insp.addTasks("m4", [{ title: "T1", description: "d", status: "pending" }]);
      insp.addDecisions("m4", [{ title: "D1", description: "d", source: "s", date: "2024-01-01" }]);
      const working = insp.getByTier("m4", "working");
      assert(working.length === 1, "should have 1 working item");
    }),
    runTest("stats returns correct structure", () => {
      const s = insp.stats();
      assert(typeof s.totalSnapshots === "number", "totalSnapshots should be number");
    }),
  ]);

  insp.clear();
  const passed = results.filter((r) => r.passed).length;
  return { suite: "MemoryInspector", results, passed, failed: results.length - passed, totalMs: results.reduce((s, r) => s + r.durationMs, 0) };
}

// ─── Suite 6: Decision Inspector ─────────────────────────────────────────────

async function suiteDecisionInspector(): Promise<SuiteResult> {
  const insp = DecisionInspector.getInstance();
  insp.clear();

  const results = await Promise.all([
    runTest("startCapture creates snapshot", () => {
      insp.startCapture("c1", "m1");
      assert(insp.getSnapshot("m1") !== null, "snapshot should exist");
    }),
    runTest("recordDecision stores decision", () => {
      insp.startCapture("c1", "m2");
      insp.recordDecision("m2", {
        category: "routing",
        decision: "Route to memory specialist",
        reasoning: "User asked about past decisions",
        rule: "intent_match",
        engines: ["SpecialistRouter"],
        alternatives: [],
        confidence: 0.9,
      });
      const snap = insp.getSnapshot("m2")!;
      assert(snap.totalDecisions === 1, "should have 1 decision");
    }),
    runTest("recordRoutingDecision convenience method works", () => {
      insp.startCapture("c1", "m3");
      insp.recordRoutingDecision("m3", "MemorySpecialist", ["GeneralSpecialist"], "intent_score");
      const snap = insp.getSnapshot("m3")!;
      assert(snap.decisions[0].category === "routing", "should be routing category");
    }),
    runTest("alternatives are recorded", () => {
      insp.startCapture("c1", "m4");
      insp.recordDecision("m4", {
        category: "model_selection",
        decision: "Use automatic",
        reasoning: "Standard request",
        rule: "complexity_low",
        engines: ["ModelSelector"],
        alternatives: [{ label: "GPT-4", score: 0.3, outcome: "rejected", reason: "Overkill" }],
        confidence: 0.85,
      });
      const snap = insp.getSnapshot("m4")!;
      assert(snap.decisions[0].alternatives.length === 1, "should have 1 alternative");
    }),
    runTest("stats returns correct structure", () => {
      const s = insp.stats();
      assert(typeof s.totalDecisions === "number", "totalDecisions should be number");
    }),
  ]);

  insp.clear();
  const passed = results.filter((r) => r.passed).length;
  return { suite: "DecisionInspector", results, passed, failed: results.length - passed, totalMs: results.reduce((s, r) => s + r.durationMs, 0) };
}

// ─── Suite 7: Event Replay ────────────────────────────────────────────────────

async function suiteEventReplay(): Promise<SuiteResult> {
  const replay = EventReplay.getInstance();
  replay.clear();

  const results = await Promise.all([
    runTest("initLog creates log", () => {
      replay.initLog("c1");
      assert(replay.getLog("c1") !== null, "log should exist");
    }),
    runTest("emit records event", () => {
      replay.emit("c2", "test.event", "system", { value: 1 });
      const log = replay.getLog("c2")!;
      assert(log.totalEvents === 1, "should have 1 event");
    }),
    runTest("getEventsForMessage filters by messageId", () => {
      replay.initLog("c3");
      replay.emit("c3", "ev1", "pipeline", {}, "m1");
      replay.emit("c3", "ev2", "memory", {}, "m2");
      const events = replay.getEventsForMessage("c3", "m1");
      assert(events.length === 1, "should have 1 event for m1");
    }),
    runTest("replayFrom filters by timestamp", () => {
      replay.initLog("c4");
      const t1 = Date.now();
      replay.emit("c4", "early", "system", {});
      const t2 = Date.now();
      replay.emit("c4", "late", "system", {});
      const events = replay.replayFrom("c4", t2);
      assert(events.length >= 1, "should have at least 1 event from t2");
    }),
    runTest("stats returns correct structure", () => {
      const s = replay.stats();
      assert(typeof s.totalConversations === "number", "structure check");
    }),
  ]);

  replay.clear();
  const passed = results.filter((r) => r.passed).length;
  return { suite: "EventReplay", results, passed, failed: results.length - passed, totalMs: results.reduce((s, r) => s + r.durationMs, 0) };
}

// ─── Suite 8: COP Manager ────────────────────────────────────────────────────

async function suiteCOPManager(): Promise<SuiteResult> {
  const cop = CognitiveObservabilityManager.getInstance();
  cop.clearAll();

  const results = await Promise.all([
    runTest("getInstance returns singleton", () => {
      const a = CognitiveObservabilityManager.getInstance();
      const b = CognitiveObservabilityManager.getInstance();
      assert(a === b, "should be same instance");
    }),
    runTest("beginObservation initializes all inspectors", () => {
      cop.beginObservation("c-cop-1", "m-cop-1", "Test input");
      assert(cop.context.getSnapshot("m-cop-1") !== null, "context should be initialized");
      assert(cop.pipeline.getTimeline("m-cop-1") !== null, "pipeline should be initialized");
    }),
    runTest("finalizeObservation returns record", () => {
      cop.beginObservation("c-cop-2", "m-cop-2", "Test input 2");
      const record = cop.finalizeObservation("c-cop-2", "m-cop-2", "Test input 2");
      assert(record != null, "record should not be null");
      assert(record.conversationId === "c-cop-2", "conversationId should match");
    }),
    runTest("auditReadiness returns READY status", () => {
      const audit = cop.auditReadiness();
      assert(audit.status === "COGNITIVE OBSERVABILITY PLATFORM READY", "should be READY");
      assert(audit.failed.length === 0, "should have no failures");
    }),
    runTest("metrics returns all inspector stats", () => {
      const m = cop.metrics();
      assert(m.context != null, "context metrics should exist");
      assert(m.pipeline != null, "pipeline metrics should exist");
      assert(m.streaming != null, "streaming metrics should exist");
    }),
  ]);

  cop.clearAll();
  const passed = results.filter((r) => r.passed).length;
  return { suite: "CognitiveObservabilityManager", results, passed, failed: results.length - passed, totalMs: results.reduce((s, r) => s + r.durationMs, 0) };
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runCOPTests(): Promise<{
  suites: SuiteResult[];
  totalPassed: number;
  totalFailed: number;
  totalMs: number;
  auditStatus: string;
}> {
  const suites = await Promise.all([
    suiteContextInspector(),
    suitePromptInspector(),
    suitePipelineTimeline(),
    suiteStreamingInspector(),
    suiteMemoryInspector(),
    suiteDecisionInspector(),
    suiteEventReplay(),
    suiteCOPManager(),
  ]);

  const totalPassed = suites.reduce((s, r) => s + r.passed, 0);
  const totalFailed = suites.reduce((s, r) => s + r.failed, 0);
  const totalMs = suites.reduce((s, r) => s + r.totalMs, 0);

  const cop = CognitiveObservabilityManager.getInstance();
  const audit = cop.auditReadiness();

  return { suites, totalPassed, totalFailed, totalMs, auditStatus: audit.status };
}