/**
 * TestReportGenerator.ts
 * Assembles immutable TestReport objects from suite results.
 *
 * SRP: Report generation only — no execution, no assertion, no storage.
 * Sprint: EV-1
 */

import type {
  TestReport, TestSuiteResult, CoverageSnapshot, RegressionEntry,
} from "./ValidationTypes";

let _reportCounter = 0;

export const TestReportGenerator = Object.freeze({

  generate(
    suites:      TestSuiteResult[],
    coverage:    CoverageSnapshot,
    regressions: RegressionEntry[],
    durationMs:  number,
  ): TestReport {
    _reportCounter++;
    const reportId = `EVR-${String(_reportCounter).padStart(3, "0")}`;

    const totalTests   = suites.reduce((s, x) => s + x.total,   0);
    const totalPassed  = suites.reduce((s, x) => s + x.passed,  0);
    const totalFailed  = suites.reduce((s, x) => s + x.failed,  0);
    const totalErrors  = suites.reduce((s, x) => s + x.errors,  0);
    const totalSkipped = suites.reduce((s, x) => s + x.skipped, 0);
    const passRate     = totalTests > 0
      ? Math.round((totalPassed / totalTests) * 100)
      : 0;

    return Object.freeze({
      reportId,
      totalTests,
      totalPassed,
      totalFailed,
      totalErrors,
      totalSkipped,
      passRate,
      durationMs,
      suites:      Object.freeze(suites),
      coverage,
      regressions: Object.freeze(regressions),
      generatedAt: new Date().toISOString(),
      certified:   totalFailed === 0 && totalErrors === 0 && passRate === 100,
    });
  },

  reset(): void { _reportCounter = 0; },
});