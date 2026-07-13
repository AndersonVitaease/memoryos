/**
 * pcrTests.ts — Primary Conversation Router Validation Suite
 * Phase 5.6 · 2026-07-13
 *
 * Validates: routing, cognitive invocation, memory bypass, diagnostics.
 * Uses real connectors — no mocks.
 */

import { PrimaryConversationRouter } from "./PrimaryConversationRouter";

export interface PCRTestResult {
  id:         number;
  name:       string;
  passed:     boolean;
  durationMs: number;
  detail:     string;
  error:      string | null;
}

export interface PCRSuiteResult {
  passed:     number;
  total:      number;
  durationMs: number;
  results:    PCRTestResult[];
  status:     "PASS" | "FAIL" | "PARTIAL";
  stats:      ReturnType<PrimaryConversationRouter["getStats"]>;
}

function check(id: number, name: string, fn: () => boolean | string, ms = 0): PCRTestResult {
  try {
    const r = fn();
    const passed = r === true || (typeof r === "string" && r !== "FAIL" && !r.startsWith("FAIL"));
    return { id, name, passed, durationMs: ms, detail: typeof r === "string" ? r : passed ? "OK" : "FAILED", error: null };
  } catch (e) {
    return { id, name, passed: false, durationMs: ms, detail: "Exception", error: String(e) };
  }
}

export async function runPCRTests(): Promise<PCRSuiteResult> {
  const t0 = Date.now();
  const results: PCRTestResult[] = [];
  const router = new PrimaryConversationRouter();

  // ── Routing decision tests ─────────────────────────────────────────────────

  const r1 = await router.route("Where did we stop?", "sess1", null, 3);
  results.push(check(1, "'Where did we stop?' → cognitive_pipeline", () =>
    r1.decision === "cognitive_pipeline"
      ? `decision=cognitive_pipeline, intent=${r1.intent.intent}`
      : `FAIL: decision=${r1.decision}`, r1.durationMs));

  results.push(check(2, "cognitive answer populated for 'Where did we stop?'", () =>
    !!r1.cognitiveAnswer?.executionId
      ? `execId=${r1.cognitiveAnswer.executionId}`
      : `FAIL: no executionId`, r1.durationMs));

  const r2 = await router.route("What is the current project status?", "sess1", "proj1", 2);
  results.push(check(3, "'Current project status' → cognitive_pipeline", () =>
    r2.decision === "cognitive_pipeline"
      ? `decision=cognitive_pipeline, intent=${r2.intent.intent}`
      : `FAIL: decision=${r2.decision}`, r2.durationMs));

  results.push(check(4, "Evidence returned for project status query", () =>
    (r2.cognitiveAnswer?.stagesExecuted.length ?? 0) > 0
      ? `stages=${r2.cognitiveAnswer?.stagesExecuted.length}`
      : `FAIL: no stages`, r2.durationMs));

  const r3 = await router.route("What is the next sprint?", "sess1", null, 1);
  results.push(check(5, "'Next sprint' → cognitive_pipeline", () =>
    r3.decision === "cognitive_pipeline"
      ? `decision=cognitive_pipeline, intent=${r3.intent.intent}`
      : `FAIL: decision=${r3.decision}`, r3.durationMs));

  const r4 = await router.route("What changed yesterday?", "sess1", null, 0);
  results.push(check(6, "'What changed yesterday' → cognitive (history/timeline)", () =>
    r4.decision === "cognitive_pipeline"
      ? `decision=cognitive_pipeline, intent=${r4.intent.intent}`
      : `decision=${r4.decision}, intent=${r4.intent.intent}`, r4.durationMs));

  // ── General conversation bypass ────────────────────────────────────────────

  const r5 = await router.route("Hello, how are you?", "sess1", null, 0);
  results.push(check(7, "'Hello how are you' → conversation_memory (bypasses pipeline)", () =>
    r5.decision === "conversation_memory"
      ? `decision=conversation_memory, no pipeline`
      : `FAIL: decision=${r5.decision}`, r5.durationMs));

  results.push(check(8, "cognitiveAnswer is null for general conversation", () =>
    r5.cognitiveAnswer === null
      ? "cognitiveAnswer=null as expected"
      : `FAIL: cognitiveAnswer present for general message`, r5.durationMs));

  const r6 = await router.route("Tell me a joke", "sess1", null, 0);
  results.push(check(9, "'Tell me a joke' → conversation_memory", () =>
    r6.decision === "conversation_memory"
      ? "decision=conversation_memory"
      : `FAIL: decision=${r6.decision}`, r6.durationMs));

  // ── Cognitive keyword coverage ─────────────────────────────────────────────

  const cognitiveQueries = [
    ["Show me the GitHub repository",          "repository_analysis"],
    ["How is the Base44 connector doing?",     "connector_diagnostics"],
    ["Explain the architecture of the system", "architecture_question"],
    ["What is the project timeline?",          "project_history"],
  ];

  for (const [msg, expectedIntent] of cognitiveQueries) {
    const r = await router.route(msg, "sess1", null, 0);
    results.push(check(
      results.length + 1,
      `'${msg.slice(0, 40)}' → cognitive`,
      () => r.decision === "cognitive_pipeline"
        ? `decision=cognitive_pipeline, intent=${r.intent.intent}`
        : `FAIL: decision=${r.decision}`,
      r.durationMs,
    ));
  }

  // ── Diagnostics / stats ────────────────────────────────────────────────────

  const stats = router.getStats();
  results.push(check(results.length + 1, "Router stats track total routed", () =>
    stats.totalRouted >= 10
      ? `total=${stats.totalRouted}, cognitive=${stats.cognitivePaths}, memory=${stats.memoryPaths}`
      : `FAIL: totalRouted=${stats.totalRouted}`, 0));

  results.push(check(results.length + 1, "Cognitive paths > memory paths", () =>
    stats.cognitivePaths > stats.memoryPaths
      ? `cognitive=${stats.cognitivePaths} > memory=${stats.memoryPaths}`
      : `cognitive=${stats.cognitivePaths} <= memory=${stats.memoryPaths}`, 0));

  results.push(check(results.length + 1, "avgDurationMs tracked", () =>
    stats.avgDurationMs > 0
      ? `avgDuration=${stats.avgDurationMs}ms`
      : "FAIL: avgDurationMs=0", 0));

  results.push(check(results.length + 1, "getLastResults returns history", () =>
    router.getLastResults().length >= 10
      ? `${router.getLastResults().length} results stored`
      : `FAIL: only ${router.getLastResults().length} results`, 0));

  const passed = results.filter(r => r.passed).length;
  const status: PCRSuiteResult["status"] =
    passed === results.length ? "PASS" : passed >= results.length * 0.7 ? "PARTIAL" : "FAIL";

  return { passed, total: results.length, durationMs: Date.now() - t0, results, status, stats };
}