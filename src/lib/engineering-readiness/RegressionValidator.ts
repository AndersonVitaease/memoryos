/**
 * RegressionValidator.ts — Sprint 6.3.5
 * Validates the Regression Shield is intact and running.
 */

import type { ValidatorResult, CheckResult } from "./ReadinessTypes";
import { EngineeringRegressionSuite } from "../engineering-regression/EngineeringRegressionSuite";

function check(name: string, ok: boolean, detail: string, critical = false): CheckResult {
  return { name, status: ok ? "PASS" : "FAIL", detail, critical };
}

export class RegressionValidator {
  async validate(): Promise<ValidatorResult> {
    const t0 = Date.now();
    const checks: CheckResult[] = [];

    // Suite instantiation
    const suite = new EngineeringRegressionSuite();
    checks.push(check("RegressionSuite instantiates", !!suite && typeof suite.run === "function", "Suite API OK", true));

    // Run a focused subset of fast tests (not the full suite — that takes too long)
    // Instead validate: suite runs, returns a report, categories present
    let report: any = null;
    try {
      report = await suite.run();
    } catch (e) {
      checks.push(check("Suite.run() executes", false, String(e), true));
    }

    if (report) {
      checks.push(check("Suite.run() returns report", !!report.id, `id=${report.id}`, true));
      checks.push(check("Report has categories", Object.keys(report.categories).length >= 10, `categories=${Object.keys(report.categories).length}`, false));
      checks.push(check("Acceptance score reported", typeof report.acceptanceScore === "number", `acceptanceScore=${report.acceptanceScore}`, false));
      checks.push(check("Shield status present", ["PASS","FAIL","BLOCKED"].includes(report.shield), `shield=${report.shield}`, true));
      checks.push(check("Score > 0", report.score > 0, `score=${Math.round(report.score * 100)}%`, false));

      // KG, BASELINE, ROUTING must all be present
      const hasKg = "KG" in report.categories;
      const hasBaseline = "BASELINE" in report.categories;
      const hasRouting = "ROUTING" in report.categories;
      const hasPsm = "PSM" in report.categories;
      checks.push(check("All required categories present", hasKg && hasBaseline && hasRouting && hasPsm,
        `KG=${hasKg} BASELINE=${hasBaseline} ROUTING=${hasRouting} PSM=${hasPsm}`, true));
    }

    const score = report
      ? Math.min(100, Math.round(report.score * 100))
      : 0;

    const failed = checks.filter(c => c.status !== "PASS");
    const criticalFailed = failed.filter(c => c.critical);
    const checkScore = Math.round((checks.filter(c => c.status === "PASS").length / checks.length) * 100);

    return {
      id: "reg_validator",
      name: "Regression Validator",
      domain: "Regression",
      status: criticalFailed.length > 0 ? "FAIL" : failed.length > 0 ? "WARN" : "PASS",
      score: Math.round((score + checkScore) / 2),
      detail: report
        ? `Regression shield: ${report.shield} | ${report.passed}/${report.total} tests passed`
        : "Suite failed to run",
      checks,
      durationMs: Date.now() - t0,
      blockers: criticalFailed.map(c => `[REG] ${c.name}: ${c.detail}`),
      warnings: failed.filter(c => !c.critical).map(c => c.name),
      recommendations: criticalFailed.length > 0
        ? ["Fix regression suite failures before certifying platform."] : [],
    };
  }
}