/**
 * TestRunner.ts
 * Orchestrates batch test execution and aggregates into suite results.
 *
 * SRP: Orchestration only — delegates execution to TestEngine.
 * Sprint: EV-1
 */

import { TestEngine }           from "./TestEngine";
import { TestReportGenerator }  from "./TestReportGenerator";
import { RegressionDetector }   from "./RegressionDetector";
import { CoverageAnalyzer }     from "./CoverageAnalyzer";
import type { TestSuiteResult, TestResult, TestReport, TestCategory } from "./ValidationTypes";

function groupBySuite(results: TestResult[]): TestSuiteResult[] {
  const suiteMap = new Map<string, TestResult[]>();
  for (const r of results) {
    const arr = suiteMap.get(r.suiteName) ?? [];
    arr.push(r);
    suiteMap.set(r.suiteName, arr);
  }

  return [...suiteMap.entries()].map(([suiteName, rs]) => {
    const start = Math.min(...rs.map(r => new Date(r.runAt).getTime()));
    const end   = Math.max(...rs.map(r => new Date(r.runAt).getTime() + r.durationMs));
    return Object.freeze({
      suiteId:    suiteName,
      suiteName,
      category:   rs[0]?.category ?? ("UNIT" as TestCategory),
      total:      rs.length,
      passed:     rs.filter(r => r.status === "PASS").length,
      failed:     rs.filter(r => r.status === "FAIL").length,
      errors:     rs.filter(r => r.status === "ERROR").length,
      skipped:    rs.filter(r => r.status === "SKIPPED").length,
      durationMs: end - start,
      results:    Object.freeze(rs),
      runAt:      new Date(start).toISOString(),
    });
  });
}

export const TestRunner = Object.freeze({

  /** Run all registered tests and generate a full report */
  async runAll(): Promise<TestReport> {
    const start   = Date.now();
    const results = await TestEngine.runAll();
    const suites  = groupBySuite(results);
    const coverage   = CoverageAnalyzer.analyze(results);
    const regressions = RegressionDetector.detect(results);
    return TestReportGenerator.generate(suites, coverage, regressions, Date.now() - start);
  },

  /** Run all tests in a specific suite */
  async runSuite(suite: string): Promise<TestSuiteResult> {
    const start   = Date.now();
    const results = await TestEngine.runSuite(suite);
    const suites  = groupBySuite(results);
    return suites[0] ?? Object.freeze({
      suiteId:    suite,
      suiteName:  suite,
      category:   "UNIT" as TestCategory,
      total:      0, passed: 0, failed: 0, errors: 0, skipped: 0,
      durationMs: Date.now() - start,
      results:    [],
      runAt:      new Date().toISOString(),
    });
  },

  /** Run tests by category */
  async runCategory(category: TestCategory): Promise<TestSuiteResult[]> {
    const results = await TestEngine.runCategory(category);
    return groupBySuite(results);
  },

  /** Run a single test by suite+name */
  async runOne(suite: string, name: string): Promise<TestReport> {
    const result  = await TestEngine.run(suite, name);
    const suites  = groupBySuite([result]);
    const coverage   = CoverageAnalyzer.analyze([result]);
    const regressions = RegressionDetector.detect([result]);
    return TestReportGenerator.generate(suites, coverage, regressions, result.durationMs);
  },

  listSuites(): string[] {
    return TestEngine.listSuites();
  },
});