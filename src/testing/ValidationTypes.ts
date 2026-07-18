/**
 * ValidationTypes.ts
 * All type contracts for the Engineering Validation Platform (EVP).
 *
 * SRP: Types only — no logic.
 * Sprint: EV-1
 */

// ── Test result ────────────────────────────────────────────────────────────────

export type TestStatus = "PASS" | "FAIL" | "ERROR" | "SKIPPED" | "PENDING";

export type TestCategory =
  | "UNIT" | "INTEGRATION" | "REGRESSION" | "COGNITIVE" | "PERFORMANCE" | "SECURITY";

export interface TestEvidence {
  readonly key:      string;
  readonly expected: unknown;
  readonly actual:   unknown;
  readonly passed:   boolean;
  readonly note?:    string;
}

export interface TestResult {
  readonly id:          string;   // TR-NNN
  readonly suiteName:   string;
  readonly testName:    string;
  readonly category:    TestCategory;
  readonly status:      TestStatus;
  readonly durationMs:  number;
  readonly evidence:    TestEvidence[];
  readonly error?:      string;
  readonly stackTrace?: string;
  readonly runAt:       string;
}

// ── Test definition ─────────────────────────────────────────────────────────────

export type TestFn = () => void | Promise<void>;

export interface TestDefinition {
  readonly id:       string;
  readonly suite:    string;
  readonly name:     string;
  readonly category: TestCategory;
  readonly fn:       TestFn;
  readonly skip?:    boolean;
  readonly tags?:    string[];
}

// ── Test suite ─────────────────────────────────────────────────────────────────

export interface TestSuiteResult {
  readonly suiteId:    string;
  readonly suiteName:  string;
  readonly category:   TestCategory;
  readonly total:      number;
  readonly passed:     number;
  readonly failed:     number;
  readonly errors:     number;
  readonly skipped:    number;
  readonly durationMs: number;
  readonly results:    TestResult[];
  readonly runAt:      string;
}

// ── Report ─────────────────────────────────────────────────────────────────────

export interface TestReport {
  readonly reportId:      string;  // EVR-NNN
  readonly totalTests:    number;
  readonly totalPassed:   number;
  readonly totalFailed:   number;
  readonly totalErrors:   number;
  readonly totalSkipped:  number;
  readonly passRate:      number;   // 0–100
  readonly durationMs:    number;
  readonly suites:        TestSuiteResult[];
  readonly coverage:      CoverageSnapshot;
  readonly regressions:   RegressionEntry[];
  readonly generatedAt:   string;
  readonly certified:     boolean;
}

// ── Coverage ───────────────────────────────────────────────────────────────────

export interface CoverageEntry {
  readonly module:    string;
  readonly tested:    boolean;
  readonly testCount: number;
}

export interface CoverageSnapshot {
  readonly modules:        CoverageEntry[];
  readonly testedModules:  number;
  readonly totalModules:   number;
  readonly coverageRate:   number;   // 0–100
}

// ── Regression ─────────────────────────────────────────────────────────────────

export interface RegressionEntry {
  readonly id:          string;
  readonly testName:    string;
  readonly suiteName:   string;
  readonly previousRun: TestStatus;
  readonly currentRun:  TestStatus;
  readonly detectedAt:  string;
}

// ── Assertion ──────────────────────────────────────────────────────────────────

export interface AssertionResult {
  readonly passed:   boolean;
  readonly evidence: TestEvidence;
  readonly message?: string;
}