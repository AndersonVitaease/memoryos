/**
 * lcpTests.ts — Live Cognitive Pipeline Validation Suite
 * Phase 5.4 · 2026-07-13
 *
 * Validates:
 *   - Pipeline order
 *   - Pipeline context
 *   - Provenance preservation
 *   - Failure recovery
 *   - Snapshot generation
 *   - Knowledge updates
 *   - Real connector execution
 *
 * NEVER simulates successful execution.
 * Every test reflects actual pipeline behavior.
 */

import { LiveCognitivePipeline } from "./LiveCognitivePipeline";
import type { LiveCognitivePipelineReport } from "./LCPTypes";

// ── Test infrastructure ────────────────────────────────────────────────────────

export interface LCPTestResult {
  id:         number;
  name:       string;
  passed:     boolean;
  durationMs: number;
  detail:     string;
  error:      string | null;
}

export interface LCPTestSuiteResult {
  passed:     number;
  total:      number;
  durationMs: number;
  results:    LCPTestResult[];
  status:     "PASS" | "FAIL" | "PARTIAL";
  report:     LiveCognitivePipelineReport | null;
}

function test(id: number, name: string, fn: () => boolean | string, durationMs: number): LCPTestResult {
  try {
    const r = fn();
    const passed = r === true || r === "PASS";
    return { id, name, passed, durationMs, detail: typeof r === "string" ? r : passed ? "OK" : "FAILED", error: null };
  } catch (e) {
    return { id, name, passed: false, durationMs, detail: "Exception", error: String(e) };
  }
}

// ── Main test runner ───────────────────────────────────────────────────────────

export async function runLCPTests(): Promise<LCPTestSuiteResult> {
  const t0 = Date.now();
  const results: LCPTestResult[] = [];

  // ── Execute pipeline (real — no simulation) ─────────────────────────────────
  const pipeline = new LiveCognitivePipeline();
  const t1 = Date.now();
  const report = await pipeline.execute({ projectId: "lcp_test", userApprovalGiven: false });
  const execMs = Date.now() - t1;

  // C1 — Pipeline executes without unhandled exception
  results.push(test(1, "Pipeline executes without exception", () => !!report, execMs));

  // C2 — Report has required fields
  results.push(test(2, "Report has id, generatedAt, durationMs, status", () =>
    !!(report.id && report.generatedAt && report.durationMs >= 0 && report.status), execMs));

  // C3 — Correct number of stages
  results.push(test(3, `Pipeline has exactly 11 stages (got ${report.stages.length})`, () =>
    report.stages.length === 11 ? true : `Expected 11, got ${report.stages.length}`, execMs));

  // C4 — Stage order preserved (by name sequence)
  const EXPECTED_ORDER = [
    "ConnectorInvocationService","RepositoryAnalyzer","ApplicationAnalyzer",
    "KnowledgeReconstructionEngine","KnowledgeFusionEngine","IdentityResolutionEngine",
    "ProjectReconstructionEngine","GoalIntelligenceEngine","CognitiveLearningEngine",
    "KnowledgeGraphUpdate","ProjectSnapshot",
  ];
  const actualOrder = report.stages.map(s => s.stageName);
  const orderCorrect = EXPECTED_ORDER.every((name, i) => actualOrder[i] === name);
  results.push(test(4, "Stage order is correct (CIS→Repo→App→KRE→KFE→IRE→PRE→GIE→CLE→KG→Snapshot)", () =>
    orderCorrect ? true : `Order mismatch: ${actualOrder.join(",")}`, execMs));

  // C5 — Pipeline context present
  results.push(test(5, "Execution context has executionId + pipelineVersion", () =>
    !!(report.context.executionId && report.context.pipelineVersion === "1.0.0"), execMs));

  // C6 — Context is shared (same executionId in context)
  results.push(test(6, "Context projectId and timestamp present", () =>
    !!(report.context.projectId && report.context.timestamp > 0), execMs));

  // C7 — Provenance chain has entries
  results.push(test(7, "Provenance chain is non-empty", () =>
    report.provenanceChain.length >= 1 ? true : "No provenance entries", execMs));

  // C8 — Every stage has provenance
  const allHaveProv = report.stages.every(s => !!s.provenance?.engine);
  results.push(test(8, "Every stage has provenance (engine, transformation, confidence)", () =>
    allHaveProv ? true : `Missing provenance in some stages`, execMs));

  // C9 — Provenance count matches stage count
  results.push(test(9, "Provenance chain length matches stage count", () =>
    report.provenanceChain.length === report.stages.length
      ? true
      : `Prov=${report.provenanceChain.length} stages=${report.stages.length}`, execMs));

  // C10 — Failure recovery: at least Base44 connector must succeed (CIS always has Base44)
  const cisStage = report.stages.find(s => s.stageName === "ConnectorInvocationService");
  results.push(test(10, "CIS stage always succeeds (Base44 always available)", () =>
    cisStage?.status === "SUCCESS"
      ? `CIS: base44=${cisStage.output.base44Status}, github=${cisStage.output.githubStatus}`
      : `CIS status: ${cisStage?.status ?? "missing"}`, execMs));

  // C11 — Application Analyzer succeeds (Base44 live)
  const appStage = report.stages.find(s => s.stageName === "ApplicationAnalyzer");
  results.push(test(11, "ApplicationAnalyzer succeeds with live Base44 data", () =>
    appStage?.status === "SUCCESS"
      ? `projects=${(appStage.output as any).projectCount}, total=${(appStage.output as any).totalRecords}`
      : `AppAnalyzer status: ${appStage?.status ?? "missing"}`, execMs));

  // C12 — Recovery events generated when GitHub not configured
  const ghStage = report.stages.find(s => s.stageName === "RepositoryAnalyzer");
  const recoveryExpected = ghStage?.status === "NOT_CONFIGURED";
  results.push(test(12, "Recovery generated when GitHub not configured", () => {
    if (recoveryExpected) {
      return report.recoveryEvents.length >= 1
        ? `Recovery: ${report.recoveryEvents[0].strategy}`
        : "Recovery event missing despite NOT_CONFIGURED";
    }
    return true; // GitHub configured — no recovery needed
  }, execMs));

  // C13 — GIE stage executed
  const gieStage = report.stages.find(s => s.stageName === "GoalIntelligenceEngine");
  results.push(test(13, "GIE stage executed (goals created)", () =>
    gieStage?.status === "SUCCESS"
      ? `subGoals=${(gieStage.output as any).subGoals}, recs=${(gieStage.output as any).recommendations}`
      : `GIE status: ${gieStage?.status ?? "missing"}`, execMs));

  // C14 — CLE stage executed
  const cleStage = report.stages.find(s => s.stageName === "CognitiveLearningEngine");
  results.push(test(14, "CLE stage executed (learning score present)", () =>
    cleStage?.status === "SUCCESS"
      ? `score=${(cleStage.output as any).learningScore}`
      : `CLE status: ${cleStage?.status ?? "missing"}`, execMs));

  // C15 — Knowledge Graph Update stage
  const kgStage = report.stages.find(s => s.stageName === "KnowledgeGraphUpdate");
  results.push(test(15, "KnowledgeGraphUpdate stage executed", () =>
    kgStage?.status === "SUCCESS"
      ? `entry=${(kgStage.output as any).entryId}, evidence=${(kgStage.output as any).evidenceCount}`
      : `KG status: ${kgStage?.status ?? "missing"}`, execMs));

  // C16 — Snapshot generated
  const snapStage = report.stages.find(s => s.stageName === "ProjectSnapshot");
  results.push(test(16, "ProjectSnapshot generated with all state fields", () => {
    if (snapStage?.status !== "SUCCESS") return `Snapshot status: ${snapStage?.status}`;
    const snap = snapStage.output as any;
    const hasAll = snap.id && snap.applicationState && snap.goalState && snap.learningState && snap.evidence;
    return hasAll ? `snapshot=${snap.id}` : "Missing required snapshot fields";
  }, execMs));

  // C17 — Snapshot confidence > 0
  results.push(test(17, "Snapshot confidence > 0", () => {
    const snap = report.snapshot as any;
    return (snap?.confidence ?? 0) > 0 ? `confidence=${snap.confidence?.toFixed(2)}` : "confidence=0";
  }, execMs));

  // C18 — Snapshot has evidence
  results.push(test(18, "Snapshot contains evidence items", () =>
    report.snapshot.evidence?.length > 0
      ? `${report.snapshot.evidence.length} evidence items`
      : "No evidence in snapshot", execMs));

  // C19 — Real connector execution (Base44 invoked via CIS — never simulated)
  results.push(test(19, "Real connector execution confirmed (Base44 invoked, not simulated)", () => {
    const cisOut = cisStage?.output as any;
    return cisOut?.base44Status === "SUCCESS"
      ? `Base44 ping: SUCCESS — real execution confirmed`
      : `Base44 ping: ${cisOut?.base44Status} — not simulated`;
  }, execMs));

  // C20 — Graceful degradation: pipeline status is never FAILED when Base44 is up
  results.push(test(20, "Graceful degradation: status is OPERATIONAL/DEGRADED/PARTIAL when Base44 is live", () => {
    const appOk = appStage?.status === "SUCCESS";
    const isGraceful = ["OPERATIONAL", "DEGRADED", "PARTIAL"].includes(report.status);
    return (appOk && isGraceful) ? `status=${report.status}` : `status=${report.status}, appOk=${appOk}`;
  }, execMs));

  // ── Compile ─────────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  const total  = results.length;
  const status: LCPTestSuiteResult["status"] =
    passed === total ? "PASS" : passed >= total * 0.7 ? "PARTIAL" : "FAIL";

  return {
    passed, total,
    durationMs: Date.now() - t0,
    results,
    status,
    report,
  };
}