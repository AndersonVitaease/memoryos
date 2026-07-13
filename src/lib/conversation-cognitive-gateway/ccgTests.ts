/**
 * ccgTests.ts — Conversation Cognitive Gateway Validation Suite
 * Phase 5.5 · 2026-07-13
 *
 * Validates: intent detection, gateway routing, pipeline invocation,
 * evidence generation, graceful degradation, conversation responses.
 * Never mocks cognitive execution. Uses real connectors.
 */

import { ConversationCognitiveGateway } from "./ConversationCognitiveGateway";

export interface CCGTestResult {
  id:         number;
  name:       string;
  passed:     boolean;
  durationMs: number;
  detail:     string;
  error:      string | null;
}

export interface CCGTestSuiteResult {
  passed:      number;
  total:       number;
  durationMs:  number;
  results:     CCGTestResult[];
  status:      "PASS" | "FAIL" | "PARTIAL";
  gatewayReport: ReturnType<ConversationCognitiveGateway["buildReport"]> | null;
}

function t(id: number, name: string, fn: () => boolean | string, ms: number): CCGTestResult {
  try {
    const r = fn();
    const passed = r === true || r === "PASS";
    return { id, name, passed, durationMs: ms, detail: typeof r === "string" ? r : passed ? "OK" : "FAILED", error: null };
  } catch (e) {
    return { id, name, passed: false, durationMs: ms, detail: "Exception", error: String(e) };
  }
}

export async function runCCGTests(): Promise<CCGTestSuiteResult> {
  const t0 = Date.now();
  const results: CCGTestResult[] = [];
  const gw = new ConversationCognitiveGateway();

  // ── Intent detection tests (no pipeline) ──────────────────────────────────

  const intent1 = gw.classifyIntent("Where did we stop?");
  results.push(t(1, "Intent: 'Where did we stop?' → project_status", () =>
    intent1.requiresCognitive && intent1.intent === "project_status"
      ? `intent=${intent1.intent}, conf=${intent1.confidence.toFixed(2)}`
      : `intent=${intent1.intent}, required=${intent1.requiresCognitive}`, 0));

  const intent2 = gw.classifyIntent("What is the next sprint?");
  results.push(t(2, "Intent: 'next sprint' → next_sprint", () =>
    intent2.intent === "next_sprint" && intent2.requiresCognitive
      ? `intent=${intent2.intent}`
      : `intent=${intent2.intent}`, 0));

  const intent3 = gw.classifyIntent("Show me the GitHub repository analysis");
  results.push(t(3, "Intent: 'GitHub repository' → repository_analysis", () =>
    intent3.intent === "repository_analysis"
      ? `intent=${intent3.intent}, keywords=${intent3.matchedKeywords.join(",")}`
      : `intent=${intent3.intent}`, 0));

  const intent4 = gw.classifyIntent("How is the Base44 connector doing?");
  results.push(t(4, "Intent: 'connector' → connector_diagnostics", () =>
    intent4.intent === "connector_diagnostics"
      ? `intent=${intent4.intent}`
      : `intent=${intent4.intent}`, 0));

  const intent5 = gw.classifyIntent("Hello, how are you?");
  results.push(t(5, "Intent: 'Hello how are you' → general_conversation (no pipeline)", () =>
    !intent5.requiresCognitive
      ? `intent=${intent5.intent}, requiresCognitive=false`
      : `Incorrectly classified as cognitive`, 0));

  const intent6 = gw.classifyIntent("What are the current technical debt items?");
  results.push(t(6, "Intent: 'technical debt' → technical_debt", () =>
    intent6.intent === "technical_debt" && intent6.requiresCognitive
      ? `intent=${intent6.intent}`
      : `intent=${intent6.intent}`, 0));

  const intent7 = gw.classifyIntent("What is the current project status?");
  results.push(t(7, "Intent: 'project status' → requiresCognitive=true", () =>
    intent7.requiresCognitive
      ? `intent=${intent7.intent}, requires pipeline invocation`
      : `intent=${intent7.intent}, requires=${intent7.requiresCognitive}`, 0));

  // ── Live gateway execution (real pipeline) ─────────────────────────────────

  const t1 = Date.now();
  const ans1 = await gw.process("What is the current project status?", "test_session", "test_project", 5);
  const ms1  = Date.now() - t1;
  results.push(t(8, "Gateway: project_status invokes pipeline and returns answer", () =>
    ans1.executionId && ans1.answer.length > 50
      ? `execId=${ans1.executionId}, answerLen=${ans1.answer.length}`
      : `execId=${ans1.executionId ?? "null"}, answerLen=${ans1.answer.length}`, ms1));

  results.push(t(9, "Answer has required evidence fields", () =>
    ans1.source && ans1.pipelineStatus
      ? `source=${ans1.source}, status=${ans1.pipelineStatus}, conf=${ans1.confidence.toFixed(2)}`
      : `Missing required fields`, ms1));

  results.push(t(10, "Answer contains executionId", () =>
    !!ans1.executionId
      ? `execId=${ans1.executionId}`
      : "executionId is null", ms1));

  results.push(t(11, "Answer contains stagesExecuted", () =>
    ans1.stagesExecuted.length > 0
      ? `stages=[${ans1.stagesExecuted.join(",")}]`
      : "No stages recorded", ms1));

  results.push(t(12, "Answer confidence is between 0 and 1", () =>
    ans1.confidence >= 0 && ans1.confidence <= 1
      ? `confidence=${ans1.confidence.toFixed(2)}`
      : `Invalid confidence: ${ans1.confidence}`, ms1));

  const t2 = Date.now();
  const ans2 = await gw.process("What is the next sprint?", "test_session", "test_project", 2);
  const ms2  = Date.now() - t2;
  results.push(t(13, "Gateway: next_sprint invokes pipeline", () =>
    ans2.intent === "next_sprint" && ans2.source !== "conversation_memory"
      ? `intent=next_sprint, source=${ans2.source}`
      : `intent=${ans2.intent}, source=${ans2.source}`, ms2));

  const t3 = Date.now();
  const ans3 = await gw.process("How is Base44 doing?", "test_session", null, 0);
  const ms3  = Date.now() - t3;
  results.push(t(14, "Gateway: connector_diagnostics returns Base44 status", () =>
    ans3.answer.includes("Base44") || ans3.answer.includes("base44")
      ? `answer mentions Base44`
      : `answer: ${ans3.answer.slice(0, 60)}`, ms3));

  // ── Graceful degradation ───────────────────────────────────────────────────

  results.push(t(15, "Graceful degradation: answer generated even when GitHub unavailable", () => {
    // GitHub is NOT_CONFIGURED in test — pipeline must still return an answer
    const hasAnswer = ans1.answer.length > 0;
    const pipelineRan = ans1.stagesExecuted.length > 0;
    return (hasAnswer && pipelineRan)
      ? `answer generated, ${ans1.stagesExecuted.length} stages, degraded=${ans1.degraded}`
      : `hasAnswer=${hasAnswer}, stages=${ans1.stagesExecuted.length}`;
  }, 0));

  results.push(t(16, "Recovery info populated when degraded", () => {
    if (!ans1.degraded) return "Not degraded — recovery not needed";
    return ans1.degradationReason
      ? `degradationReason=${ans1.degradationReason.slice(0, 60)}`
      : "Degraded but no degradation reason";
  }, 0));

  // ── General conversation bypass ────────────────────────────────────────────

  const t4 = Date.now();
  const ans4 = await gw.process("Tell me a joke", "test_session", null, 0);
  const ms4  = Date.now() - t4;
  results.push(t(17, "General conversation bypasses pipeline (source=conversation_memory)", () =>
    ans4.source === "conversation_memory"
      ? `source=conversation_memory, no pipeline invoked`
      : `source=${ans4.source} — should be conversation_memory`, ms4));

  // ── Diagnostics ────────────────────────────────────────────────────────────

  const report = gw.buildReport();
  results.push(t(18, "Gateway report tracks cognitive vs fallback requests", () =>
    report.cognitiveRequests >= 3 && report.totalRequests >= 4
      ? `cognitive=${report.cognitiveRequests}, total=${report.totalRequests}, fallback=${report.fallbackRequests}`
      : `cognitive=${report.cognitiveRequests}, total=${report.totalRequests}`, 0));

  results.push(t(19, "Diagnostics contain recent request details", () =>
    report.recentDiagnostics.length > 0
      ? `${report.recentDiagnostics.length} diagnostics, last intent=${report.recentDiagnostics[0]?.intent?.intent}`
      : "No diagnostics recorded", 0));

  results.push(t(20, "Average duration tracked", () =>
    report.avgDurationMs > 0
      ? `avgDuration=${report.avgDurationMs}ms`
      : "avgDurationMs=0", 0));

  const passed = results.filter(r => r.passed).length;
  const status: CCGTestSuiteResult["status"] =
    passed === results.length ? "PASS" : passed >= results.length * 0.7 ? "PARTIAL" : "FAIL";

  return { passed, total: results.length, durationMs: Date.now() - t0, results, status, gatewayReport: report };
}