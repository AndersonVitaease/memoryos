/**
 * AcceptanceValidator.ts — Sprint 6.3.5
 * Validates the Engineering Acceptance Framework (EAF).
 */

import type { ValidatorResult, CheckResult } from "./ReadinessTypes";
import { AcceptanceEngine } from "../engineering-acceptance/AcceptanceEngine";
import { AcceptanceRegistry } from "../engineering-acceptance/AcceptanceRegistry";
import { AcceptanceHistory } from "../engineering-acceptance/AcceptanceHistory";
import { AcceptanceMetrics } from "../engineering-acceptance/AcceptanceMetrics";
import { AcceptanceAudit } from "../engineering-acceptance/AcceptanceAudit";
import { buildCriteria } from "../engineering-acceptance/AcceptanceCriteria";

function check(name: string, ok: boolean, detail: string, critical = false): CheckResult {
  return { name, status: ok ? "PASS" : "FAIL", detail, critical };
}

export class ERCAcceptanceValidator {
  validate(): ValidatorResult {
    const t0 = Date.now();
    const checks: CheckResult[] = [];

    // AcceptanceEngine API
    const engine = new AcceptanceEngine();
    checks.push(check("AcceptanceEngine.runSprint callable", typeof engine.runSprint === "function", "API OK", true));
    checks.push(check("AcceptanceEngine.dashboardState callable", typeof engine.dashboardState === "function", "API OK", false));

    // AcceptanceRegistry
    const reg = new AcceptanceRegistry();
    const crit = buildCriteria([{ desc: "ERC probe", cat: "SMOKE" }]);
    reg.register("erc_probe", "ERC acceptance probe", crit);
    checks.push(check("AcceptanceRegistry stores sprints", reg.has("erc_probe") && reg.count() >= 1, `count=${reg.count()}`, true));

    // AcceptanceHistory append-only
    const hist = new AcceptanceHistory();
    const fakeRun = {
      id: "h_erc", sprintId: "6.3.5", startedAt: Date.now(), completedAt: Date.now(),
      durationMs: 50, status: "PASS" as const, assertions: [], passed: 1, failed: 0,
      skipped: 0, blocked: 0, total: 1, score: 100, ready: true, confidence: 100,
      blockers: [], reportId: "r_erc",
    };
    hist.addRun(fakeRun);
    const before = hist.runCount();
    hist.addRun({ ...fakeRun, id: "h_erc2" });
    const after = hist.runCount();
    checks.push(check("AcceptanceHistory append-only", after === before + 1, `before=${before} after=${after}`, false));

    // AcceptanceMetrics
    const metrics = new AcceptanceMetrics();
    metrics.recordRun(200, 100, 100, true);
    const snap = metrics.snapshot();
    checks.push(check("AcceptanceMetrics records runs", snap.totalRuns >= 1, `runs=${snap.totalRuns} passRate=${snap.passRate}%`, false));

    // AcceptanceAudit append-only
    const audit = new AcceptanceAudit();
    audit.record("6.3.5", "erc_run", "ERCAcceptanceValidator", "RUN_STARTED", "RUNNING", "started");
    const auditBefore = audit.count();
    audit.record("6.3.5", "erc_run", "ERCAcceptanceValidator", "RUN_COMPLETED", "PASS", "done");
    const auditAfter = audit.count();
    checks.push(check("AcceptanceAudit append-only", auditAfter === auditBefore + 1, `before=${auditBefore} after=${auditAfter}`, false));

    const failed = checks.filter(c => c.status !== "PASS");
    const criticalFailed = failed.filter(c => c.critical);
    const score = Math.round((checks.filter(c => c.status === "PASS").length / checks.length) * 100);

    return {
      id: "eaf_validator",
      name: "Acceptance Validator",
      domain: "Acceptance",
      status: criticalFailed.length > 0 ? "FAIL" : failed.length > 0 ? "WARN" : "PASS",
      score,
      detail: `${checks.filter(c => c.status === "PASS").length}/${checks.length} EAF checks passed`,
      checks,
      durationMs: Date.now() - t0,
      blockers: criticalFailed.map(c => `[EAF] ${c.name}: ${c.detail}`),
      warnings: failed.filter(c => !c.critical).map(c => c.name),
      recommendations: criticalFailed.length > 0
        ? ["Restore EAF — acceptance validation is mandatory for sprint certification."] : [],
    };
  }
}