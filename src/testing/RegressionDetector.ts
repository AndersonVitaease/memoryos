/**
 * RegressionDetector.ts
 * Detects regressions by comparing current results against the previous run snapshot.
 *
 * SRP: Regression detection only — no execution, no reporting.
 * Sprint: EV-1
 */

import type { TestResult, RegressionEntry, TestStatus } from "./ValidationTypes";

let _previousSnapshot = new Map<string, TestStatus>();
let _regressionCounter = 0;

function testKey(r: TestResult): string {
  return `${r.suiteName}::${r.testName}`;
}

export const RegressionDetector = Object.freeze({

  detect(results: TestResult[]): RegressionEntry[] {
    const regressions: RegressionEntry[] = [];

    for (const r of results) {
      const key      = testKey(r);
      const previous = _previousSnapshot.get(key);

      if (previous !== undefined && previous !== r.status) {
        // A status change where a previously passing test now fails = regression
        const isRegression =
          (previous === "PASS" && (r.status === "FAIL" || r.status === "ERROR"));

        if (isRegression) {
          _regressionCounter++;
          regressions.push(Object.freeze({
            id:          `REG-${String(_regressionCounter).padStart(3, "0")}`,
            testName:    r.testName,
            suiteName:   r.suiteName,
            previousRun: previous,
            currentRun:  r.status,
            detectedAt:  new Date().toISOString(),
          }));
        }
      }
    }

    // Update snapshot with current run
    for (const r of results) {
      _previousSnapshot.set(testKey(r), r.status);
    }

    return regressions;
  },

  getSnapshot(): Map<string, TestStatus> {
    return new Map(_previousSnapshot);
  },

  reset(): void {
    _previousSnapshot = new Map();
    _regressionCounter = 0;
  },
});