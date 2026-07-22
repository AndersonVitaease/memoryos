/**
 * ScenarioReport.ts — Sprint EF-55.1
 *
 * Converte GoldenRunSummary em AuditResult para integração com o SCE.
 */

import type { AuditResult, AuditCheck, AuditStatus } from "../SCTypes";
import { makeSCId } from "../SCTypes";
import type { GoldenRunSummary } from "./GoldenScenarioRunner";

export function goldenSummaryToAuditResult(summary: GoldenRunSummary): AuditResult {
  const checks: AuditCheck[] = summary.results.map(r => Object.freeze({
    id:          makeSCId("chk"),
    name:        `${r.scenarioId}: ${r.scenarioName}`,
    description: `Golden Scenario execution with real runtime evidence.`,
    status:      r.status as AuditStatus,
    score:       r.score,
    durationMs:  r.durationMs,
    evidence:    r.evidence,
    issues:      r.issues,
  }));

  const passed = checks.filter(c => c.status === "pass").length;
  const failed = checks.filter(c => c.status === "fail").length;
  const warned = checks.filter(c => c.status === "warn").length;
  const score  = summary.overallScore;
  const status: AuditStatus = failed > 0 ? "fail" : warned > 0 ? "warn" : "pass";

  return Object.freeze({
    id:        makeSCId("ar"),
    auditor:   "GoldenScenarioAuditor",
    runAt:     Date.now(),
    durationMs: summary.durationMs,
    checks:    Object.freeze(checks),
    score, passed, failed, warned, status,
    summary:   `Golden Scenarios: ${passed}/${summary.totalScenarios} passed, conf=${(summary.overallConf * 100).toFixed(0)}%`,
  });
}