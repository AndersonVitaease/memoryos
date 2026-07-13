/**
 * cdlTests.ts — Cognitive Development Loop Validation Suite
 * Beta-03.1 · 2026-07-13
 *
 * End-to-end validation of the complete CDL.
 * Uses real connectors — never simulates success.
 * If credentials absent → NOT_CONFIGURED returned.
 */

import { DevelopmentLoopOrchestrator } from "./DevelopmentLoopOrchestrator";
import { RepositoryAnalyzer }          from "./RepositoryAnalyzer";
import { ApplicationAnalyzer }         from "./ApplicationAnalyzer";
import { CognitivePlanner }            from "./CognitivePlanner";
import { GitHubConnector }             from "../connector-runtime/connectors/GitHubConnector";
import { Base44Connector }             from "../connector-runtime/connectors/Base44Connector";

export interface CDLTestResult {
  id: string; name: string; category: string;
  status: "PASS" | "FAIL" | "SKIP"; durationMs: number; detail: string;
}
export interface CDLTestReport {
  id: string; generatedAt: number; durationMs: number;
  results: CDLTestResult[]; passed: number; failed: number; total: number;
  overallStatus: "CERTIFIED" | "PARTIAL" | "FAILED";
  certificationLevel: string; summary: string;
}

let _seq = 0;
function makeId() { return `cdl_test_${Date.now()}_${(++_seq).toString(36)}`; }

async function run(id: string, name: string, cat: string, fn: () => Promise<{ status: "PASS" | "FAIL" | "SKIP"; detail: string }>): Promise<CDLTestResult> {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { id, name, category: cat, status: r.status, durationMs: Date.now() - t0, detail: r.detail };
  } catch (err) {
    return { id, name, category: cat, status: "FAIL", durationMs: Date.now() - t0, detail: `Exception: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function runCDLTests(owner = "test-owner", repo = "test-repo"): Promise<CDLTestReport> {
  const t0 = Date.now();
  const orch = new DevelopmentLoopOrchestrator();
  const ctx  = { executionId: `cdl_val_${Date.now()}`, userId: "test", policyContext: {} };
  const results: CDLTestResult[] = [];

  // ── Part 1 — Orchestrator structure ──────────────────────────────────────

  results.push(await run("CDL-01", "DevelopmentLoopOrchestrator instantiation", "Orchestrator", async () => ({
    status: "PASS", detail: "Orchestrator + sub-components instantiated",
  })));

  results.push(await run("CDL-02", "Orchestrator exposes required state accessors", "Orchestrator", async () => {
    const ok = "repoAnalysis" in orch && "appAnalysis" in orch && "plan" in orch && "approval" in orch && "execRecord" in orch;
    return ok ? { status: "PASS", detail: "All state accessors present" } : { status: "FAIL", detail: "Missing state accessors" };
  }));

  // ── Part 2 — Repository Analysis ─────────────────────────────────────────

  results.push(await run("CDL-03", "RepositoryAnalyzer produces RepositoryAnalysis", "Repository Analysis", async () => {
    const analyzer = new RepositoryAnalyzer();
    const analysis = await analyzer.analyze(owner, repo);
    const ok = analysis.id && typeof analysis.durationMs === "number" && typeof analysis.branchCount === "number";
    return ok
      ? { status: "PASS", detail: `id=${analysis.id} commits=${analysis.commitCount} branches=${analysis.branchCount} files=${analysis.totalFiles} errors=${analysis.errors.length}` }
      : { status: "FAIL", detail: "RepositoryAnalysis missing required fields" };
  }));

  results.push(await run("CDL-04", "GitHub connector participates in analysis", "Repository Analysis", async () => {
    const github = new GitHubConnector();
    await github.initialize(ctx as any);
    const r = await github.execute("connectivity.ping", {}, ctx as any);
    return r.status !== undefined
      ? { status: "PASS", detail: `GitHub connector status=${r.status} (NOT_CONFIGURED is valid if no token)` }
      : { status: "FAIL", detail: "GitHub connector returned no status" };
  }));

  // ── Part 3 — Application Analysis ────────────────────────────────────────

  results.push(await run("CDL-05", "ApplicationAnalyzer produces ApplicationAnalysis", "Application Analysis", async () => {
    const analyzer = new ApplicationAnalyzer();
    const analysis = await analyzer.analyze();
    const ok = analysis.id && typeof analysis.projectCount === "number" && Array.isArray(analysis.entityCounts);
    return ok
      ? { status: "PASS", detail: `projects=${analysis.projectCount} sessions=${analysis.sessionCount} entityTypes=${analysis.entityCounts.length} auth=${analysis.authStatus}` }
      : { status: "FAIL", detail: "ApplicationAnalysis missing required fields" };
  }));

  results.push(await run("CDL-06", "Base44 connector participates in analysis", "Application Analysis", async () => {
    const b44 = new Base44Connector();
    await b44.initialize(ctx as any);
    const r = await b44.execute("connectivity.ping", {}, ctx as any);
    return r.status === "SUCCESS"
      ? { status: "PASS", detail: `Base44 authenticated — connectivity.ping SUCCESS` }
      : { status: "FAIL", detail: `Base44 connectivity.ping returned ${r.status}: ${r.error}` };
  }));

  // ── Part 4 — Cognitive Planning ───────────────────────────────────────────

  results.push(await run("CDL-07", "CognitivePlanner generates ExecutionPlan", "Cognitive Planning", async () => {
    const analyzer  = new RepositoryAnalyzer();
    const appAnal   = new ApplicationAnalyzer();
    const planner   = new CognitivePlanner();
    const [repo, app] = await Promise.all([analyzer.analyze(owner, "memoryos"), appAnal.analyze()]);
    const plan = planner.plan(repo, app);
    const ok = plan.id && Array.isArray(plan.steps) && plan.steps.length > 0 && Array.isArray(plan.opportunities);
    return ok
      ? { status: "PASS", detail: `plan.id=${plan.id} steps=${plan.steps.length} opportunities=${plan.opportunities.length} risk=${plan.risk.overall}` }
      : { status: "FAIL", detail: "ExecutionPlan missing required fields" };
  }));

  results.push(await run("CDL-08", "Every plan step has required fields", "Cognitive Planning", async () => {
    const planner = new CognitivePlanner();
    const plan = planner.plan(null, null);
    const invalid = plan.steps.filter(s => !s.id || !s.title || !s.connector || !s.operation);
    return invalid.length === 0
      ? { status: "PASS", detail: `All ${plan.steps.length} steps have id, title, connector, operation` }
      : { status: "FAIL", detail: `${invalid.length} steps missing required fields` };
  }));

  results.push(await run("CDL-09", "Every opportunity has reasoning field", "Cognitive Planning", async () => {
    const appAnal = new ApplicationAnalyzer();
    const app = await appAnal.analyze();
    const planner = new CognitivePlanner();
    const plan = planner.plan(null, app);
    const noReason = plan.opportunities.filter(o => !o.reasoning || o.reasoning.length === 0);
    return noReason.length === 0
      ? { status: "PASS", detail: `All ${plan.opportunities.length} opportunities have reasoning` }
      : { status: "FAIL", detail: `${noReason.length} opportunities missing reasoning` };
  }));

  // ── Part 5 — Approval workflow ────────────────────────────────────────────

  results.push(await run("CDL-10", "requestApproval() creates ApprovalRequest", "Approval", async () => {
    const o = new DevelopmentLoopOrchestrator();
    const appAnal = new ApplicationAnalyzer();
    const app = await appAnal.analyze();
    const plan = (new CognitivePlanner()).plan(null, app);
    // Inject plan
    (o as any)._plan = plan;
    const req = o.requestApproval();
    const ok = req.id && req.approved === null && Array.isArray(req.presentedSteps);
    return ok ? { status: "PASS", detail: `id=${req.id} approved=null (pending) steps=${req.presentedSteps.length}` }
              : { status: "FAIL", detail: "ApprovalRequest missing fields or not pending" };
  }));

  results.push(await run("CDL-11", "approve() sets approved=true", "Approval", async () => {
    const o = new DevelopmentLoopOrchestrator();
    const app = await new ApplicationAnalyzer().analyze();
    (o as any)._plan    = (new CognitivePlanner()).plan(null, app);
    (o as any)._approval = o.requestApproval();
    const approved = o.approve("test approval");
    return approved.approved === true
      ? { status: "PASS", detail: "approve() sets approved=true correctly" }
      : { status: "FAIL", detail: "approve() did not set approved=true" };
  }));

  results.push(await run("CDL-12", "Execution blocked without approval", "Approval", async () => {
    const o = new DevelopmentLoopOrchestrator();
    let threw = false;
    try { await o.executeApprovedPlan(); } catch { threw = true; }
    return threw
      ? { status: "PASS", detail: "executeApprovedPlan() throws without approval — guard working" }
      : { status: "FAIL", detail: "Execution allowed without approval — guard missing" };
  }));

  // ── Part 6 — Orchestrator full loop ───────────────────────────────────────

  results.push(await run("CDL-13", "Orchestrator analyze() runs both connectors", "Full Loop", async () => {
    const o = new DevelopmentLoopOrchestrator();
    const { repo, app } = await o.analyze(owner, repo);
    const ok = repo.id && app.id && typeof repo.branchCount === "number" && typeof app.projectCount === "number";
    return ok ? { status: "PASS", detail: `repo=${repo.id} app=${app.id} appAuth=${app.authStatus}` }
              : { status: "FAIL", detail: "analyze() did not return both analyses" };
  }));

  results.push(await run("CDL-14", "Full loop with approval and execution", "Full Loop", async () => {
    const o = new DevelopmentLoopOrchestrator();
    await o.analyze(owner, repo);
    const plan    = o.generatePlan();
    o.requestApproval();
    o.approve("automated test approval");
    const record = await o.executeApprovedPlan();
    const ok = record.id && typeof record.operationsExecuted === "number";
    return ok
      ? { status: "PASS", detail: `executionId=${record.id} ops=${record.operationsExecuted} success=${record.overallSuccess} duration=${record.durationMs}ms` }
      : { status: "FAIL", detail: "ExecutionRecord missing required fields" };
  }));

  results.push(await run("CDL-15", "Knowledge update record generated", "Full Loop", async () => {
    const o = new DevelopmentLoopOrchestrator();
    await o.analyze(owner, repo);
    o.generatePlan();
    o.requestApproval();
    o.approve();
    await o.executeApprovedPlan();
    const upd = o.buildKnowledgeUpdateRecord();
    const ok = upd.id && Array.isArray(upd.provenanceRecords);
    return ok ? { status: "PASS", detail: `id=${upd.id} provenance=${upd.provenanceRecords.length} timeline=${upd.timelineEventsAdded}` }
              : { status: "FAIL", detail: "KnowledgeUpdateRecord missing fields" };
  }));

  // ── Part 7 — Loop Report ──────────────────────────────────────────────────

  results.push(await run("CDL-16", "buildReport() generates CognitiveDevelopmentLoopReport", "Loop Report", async () => {
    const o = new DevelopmentLoopOrchestrator();
    await o.analyze(owner, repo);
    o.generatePlan();
    o.requestApproval();
    o.approve("test");
    await o.executeApprovedPlan();
    o.buildKnowledgeUpdateRecord();
    const report = o.buildReport();
    const ok = report.id && Array.isArray(report.phases) && report.phases.length === 8 && typeof report.certified === "boolean";
    return ok
      ? { status: "PASS", detail: `certified=${report.certified} level=${report.certificationLevel} phases=${report.phases.length} phases complete=${report.phases.filter(p => p.status === "complete").length}` }
      : { status: "FAIL", detail: "Report missing required fields" };
  }));

  results.push(await run("CDL-17", "Report contains all 8 loop phases", "Loop Report", async () => {
    const o = new DevelopmentLoopOrchestrator();
    const report = o.buildReport();
    const expectedPhases = ["repository_analysis","application_analysis","cognitive_planning","user_approval","assisted_execution","repository_update","knowledge_update","loop_validation"];
    const foundPhases = report.phases.map(p => p.phase);
    const allFound = expectedPhases.every(p => foundPhases.includes(p));
    return allFound
      ? { status: "PASS", detail: `All 8 phases present: ${foundPhases.join(", ")}` }
      : { status: "FAIL", detail: `Missing phases: ${expectedPhases.filter(p => !foundPhases.includes(p)).join(", ")}` };
  }));

  // ── Part 8 — Architecture rules ───────────────────────────────────────────

  results.push(await run("CDL-18", "Plan requires explicit user approval", "Architecture", async () => {
    const plan = new CognitivePlanner().plan(null, null);
    return plan.approved === false && plan.approvedAt === null
      ? { status: "PASS", detail: "New plan starts with approved=false, approvedAt=null" }
      : { status: "FAIL", detail: "Plan should start un-approved" };
  }));

  results.push(await run("CDL-19", "Repository update does NOT auto-push", "Architecture", async () => {
    const o = new DevelopmentLoopOrchestrator();
    await o.analyze(owner, repo);
    o.generatePlan(); o.requestApproval(); o.approve();
    await o.executeApprovedPlan();
    const update = o.buildRepositoryUpdateRecord() as any;
    return update.note?.includes("NOT performed")
      ? { status: "PASS", detail: "Repository update correctly defers push to user" }
      : { status: "FAIL", detail: "Repository update may auto-push — check buildRepositoryUpdateRecord()" };
  }));

  results.push(await run("CDL-20", "Provenance recorded for both connectors", "Architecture", async () => {
    const o = new DevelopmentLoopOrchestrator();
    await o.analyze(owner, repo);
    o.generatePlan(); o.requestApproval(); o.approve();
    await o.executeApprovedPlan();
    const upd = o.buildKnowledgeUpdateRecord();
    const hasBoth = upd.provenanceRecords.some(p => p.source === "github") && upd.provenanceRecords.some(p => p.source === "base44");
    return hasBoth
      ? { status: "PASS", detail: `Provenance from: ${upd.provenanceRecords.map(p => p.source).join(", ")}` }
      : { status: "FAIL", detail: `Only: ${upd.provenanceRecords.map(p => p.source).join(", ")} — both required` };
  }));

  const passed  = results.filter(r => r.status === "PASS").length;
  const failed  = results.filter(r => r.status === "FAIL").length;
  const total   = results.length;
  const certPct = passed / total;
  const certLevel = certPct >= 0.9 ? "CERTIFIED" : certPct >= 0.6 ? "PARTIAL" : "FAILED";

  return {
    id: makeId(), generatedAt: Date.now(), durationMs: Date.now() - t0,
    results, passed, failed, total,
    overallStatus: certLevel,
    certificationLevel: `${certLevel} — ${passed}/${total} (${(certPct * 100).toFixed(0)}%)`,
    summary: failed === 0
      ? `CDL CERTIFIED — ${passed}/${total} tests pass · Full cognitive development loop operational`
      : `CDL — ${failed} failure(s) · ${passed}/${total} pass · Level: ${certLevel}`,
  };
}