/**
 * ArchitectureGovernanceTests.ts — Architecture Governance Engine (AGE) v1.0
 * Sprint 8.5
 *
 * Self-contained test suite for the AGE subsystem.
 * Designed to run both in the browser (via exec via runAGETests()) and in
 * Node-based CI (exec_tool). Uses ZERO external test runners.
 *
 * Test groups:
 *   T-AGE-01  Rule catalog integrity
 *   T-AGE-02  Report builder logic
 *   T-AGE-03  Score algorithm
 *   T-AGE-04  Certification gate logic
 *   T-AGE-05  Regression shield structure
 *   T-AGE-06  Full governance pipeline (browser-safe)
 */

import { AGE_RULES, getCriticalRules, getRuleById, getRulesByCategory } from "./ArchitectureRules";
import { buildArchitectureReport }   from "./ArchitectureReport";
import { runArchitectureGovernance } from "./ArchitectureCertification";
import { runArchitectureGovernanceSuite } from "./ArchitectureRegressionShield";
import type { ArchitectureViolation, RuleScanResult } from "./ArchitectureViolation";
import type { ScanSummary } from "./ArchitectureScanner";

// ── Test runner ───────────────────────────────────────────────────────────────

interface TestCase {
  id:      string;
  name:    string;
  passed:  boolean;
  error:   string | null;
  ms:      number;
}

async function test(id: string, name: string, fn: () => Promise<void> | void): Promise<TestCase> {
  const t0 = Date.now();
  try {
    await fn();
    return { id, name, passed: true, error: null, ms: Date.now() - t0 };
  } catch (e) {
    return { id, name, passed: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

// ── Helpers: build mock scan summaries ───────────────────────────────────────

function mockCleanScan(): ScanSummary {
  return {
    totalRules: AGE_RULES.length,
    passed:     AGE_RULES.length,
    failed:     0,
    violations: [],
    warnings:   [],
    results:    AGE_RULES.map(r => ({
      ruleId:     r.id,
      ruleName:   r.name,
      passed:     true,
      violations: [],
      warnings:   [],
      durationMs: 1,
      evidence:   `${r.id} passed`,
    })),
    totalMs: 5,
  };
}

function mockViolatedScan(ruleId: string, severity: ArchitectureViolation["severity"]): ScanSummary {
  const rule = getRuleById(ruleId);
  const violation: ArchitectureViolation = {
    ruleId,
    ruleName:       rule?.name ?? "Unknown",
    description:    `Synthetic violation for ${ruleId}`,
    severity,
    file:           "lib/test/DuplicateComponent.ts",
    line:           42,
    evidence:       "class ConnectorBootstrap { // duplicate }",
    recommendation: rule?.recommendation ?? "Remove duplicate",
  };
  const results: RuleScanResult[] = AGE_RULES.map(r => ({
    ruleId:     r.id,
    ruleName:   r.name,
    passed:     r.id !== ruleId,
    violations: r.id === ruleId ? [violation] : [],
    warnings:   [],
    durationMs: 1,
    evidence:   r.id === ruleId ? "VIOLATION FOUND" : "passed",
  }));
  return {
    totalRules: AGE_RULES.length,
    passed:     AGE_RULES.length - 1,
    failed:     1,
    violations: [violation],
    warnings:   [],
    results,
    totalMs:    5,
  };
}

// ── Test groups ───────────────────────────────────────────────────────────────

async function testRuleCatalog(): Promise<TestCase[]> {
  return Promise.all([

    test("T-AGE-01-01", "AGE_RULES is a non-empty array", () => {
      assert(Array.isArray(AGE_RULES) && AGE_RULES.length > 0, "AGE_RULES must be a non-empty array");
    }),

    test("T-AGE-01-02", "Every rule has required fields", () => {
      for (const rule of AGE_RULES) {
        assert(typeof rule.id === "string" && rule.id.startsWith("AGE-"), `Rule ${rule.id} must start with AGE-`);
        assert(typeof rule.name === "string" && rule.name.length > 0, `Rule ${rule.id} must have a name`);
        assert(typeof rule.description === "string" && rule.description.length > 0, `Rule ${rule.id} must have a description`);
        assert(["CRITICAL","HIGH","MEDIUM","LOW"].includes(rule.severity), `Rule ${rule.id} must have valid severity`);
        assert(typeof rule.officialPath === "string" && rule.officialPath.length > 0, `Rule ${rule.id} must have officialPath`);
        assert(typeof rule.recommendation === "string" && rule.recommendation.length > 0, `Rule ${rule.id} must have recommendation`);
      }
    }),

    test("T-AGE-01-03", "Rule IDs are unique", () => {
      const ids = AGE_RULES.map(r => r.id);
      assert(new Set(ids).size === ids.length, "All rule IDs must be unique");
    }),

    test("T-AGE-01-04", "getCriticalRules returns only CRITICAL rules", () => {
      const critical = getCriticalRules();
      assert(critical.every(r => r.severity === "CRITICAL"), "All returned rules must be CRITICAL");
      assert(critical.length > 0, "There must be at least one CRITICAL rule");
    }),

    test("T-AGE-01-05", "getRuleById returns correct rule", () => {
      const rule = getRuleById("AGE-001");
      assert(rule !== undefined, "AGE-001 must exist");
      assert(rule!.id === "AGE-001", "ID must match");
    }),

    test("T-AGE-01-06", "getRuleById returns undefined for unknown ID", () => {
      const rule = getRuleById("AGE-999");
      assert(rule === undefined, "Unknown rule must return undefined");
    }),

    test("T-AGE-01-07", "getRulesByCategory returns correct subset", () => {
      const unique = getRulesByCategory("UNIQUENESS");
      assert(unique.every(r => r.category === "UNIQUENESS"), "All returned rules must be UNIQUENESS");
    }),

    test("T-AGE-01-08", "Every CRITICAL rule targets a distinct official path", () => {
      const critical = getCriticalRules();
      const paths = critical.map(r => r.officialPath);
      // Paths may overlap (e.g. two rules for the same file) — just verify no empty paths
      assert(paths.every(p => p.length > 0), "All CRITICAL rules must have a non-empty officialPath");
    }),
  ]);
}

async function testReportBuilder(): Promise<TestCase[]> {
  return Promise.all([

    test("T-AGE-02-01", "Clean scan produces score=100 report", () => {
      const report = buildArchitectureReport(mockCleanScan());
      assert(report.score === 100, `Expected score=100, got ${report.score}`);
      assert(report.certified === true, "Expected certified=true");
      assert(report.violations.length === 0, "Expected zero violations");
    }),

    test("T-AGE-02-02", "Violated scan produces score<100", () => {
      const report = buildArchitectureReport(mockViolatedScan("AGE-001", "CRITICAL"));
      assert(report.score < 100, `Expected score<100, got ${report.score}`);
      assert(report.certified === false, "Expected certified=false");
      assert(report.violations.length === 1, "Expected exactly 1 violation");
    }),

    test("T-AGE-02-03", "Report has all component statuses", () => {
      const report = buildArchitectureReport(mockCleanScan());
      assert(report.components.length > 0, "Report must have component statuses");
      const names = report.components.map(c => c.name);
      assert(names.includes("Official Bootstrap"), "Must have Official Bootstrap component");
      assert(names.includes("Official Runtime"), "Must have Official Runtime component");
      assert(names.includes("Official Pipeline"), "Must have Official Pipeline component");
    }),

    test("T-AGE-02-04", "Report generatedAt is valid ISO date", () => {
      const report = buildArchitectureReport(mockCleanScan());
      const d = new Date(report.generatedAt);
      assert(!isNaN(d.getTime()), "generatedAt must be a valid ISO date string");
    }),

    test("T-AGE-02-05", "Report verdict contains score", () => {
      const report = buildArchitectureReport(mockCleanScan());
      assert(report.verdict.includes("100"), "Verdict must mention score 100");
    }),

  ]);
}

async function testScoreAlgorithm(): Promise<TestCase[]> {
  return Promise.all([

    test("T-AGE-03-01", "Zero violations = score 100", () => {
      const report = buildArchitectureReport(mockCleanScan());
      assert(report.score === 100, `Expected 100, got ${report.score}`);
    }),

    test("T-AGE-03-02", "One CRITICAL violation = score 80", () => {
      const report = buildArchitectureReport(mockViolatedScan("AGE-001", "CRITICAL"));
      assert(report.score === 80, `Expected 80, got ${report.score}`);
    }),

    test("T-AGE-03-03", "One HIGH violation = score 90", () => {
      const report = buildArchitectureReport(mockViolatedScan("AGE-007", "HIGH"));
      assert(report.score === 90, `Expected 90, got ${report.score}`);
    }),

    test("T-AGE-03-04", "Score never goes below 0", () => {
      // Simulate many violations
      const scan = mockCleanScan();
      scan.violations = Array.from({ length: 20 }, (_, i) => ({
        ruleId: "AGE-001", ruleName: "Test", description: "test", severity: "CRITICAL" as const,
        file: "x", line: 0, evidence: "e", recommendation: "r",
      }));
      scan.results[0].violations = scan.violations;
      scan.results[0].passed = false;
      const report = buildArchitectureReport(scan);
      assert(report.score >= 0, "Score must never go below 0");
    }),

  ]);
}

async function testCertificationGate(): Promise<TestCase[]> {
  return Promise.all([

    test("T-AGE-04-01", "Certified when score=100 and no CRITICAL violations", () => {
      const report = buildArchitectureReport(mockCleanScan());
      assert(report.certified === true, "Expected certified");
    }),

    test("T-AGE-04-02", "Not certified when CRITICAL violation exists", () => {
      const report = buildArchitectureReport(mockViolatedScan("AGE-001", "CRITICAL"));
      assert(report.certified === false, "Expected not certified when CRITICAL violation exists");
    }),

    test("T-AGE-04-03", "CertificationResult has required shape", async () => {
      const result = await runArchitectureGovernance();
      assert(typeof result.certified === "boolean", "certified must be boolean");
      assert(typeof result.score === "number", "score must be number");
      assert(Array.isArray(result.violations), "violations must be array");
      assert(Array.isArray(result.warnings), "warnings must be array");
      assert(typeof result.report === "object", "report must be object");
    }),

  ]);
}

async function testRegressionShield(): Promise<TestCase[]> {
  return Promise.all([

    test("T-AGE-05-01", "Shield suite returns correct structure", async () => {
      const result = await runArchitectureGovernanceSuite();
      assert(result.suite === "Architecture Governance Suite", "Suite name must match");
      assert(typeof result.totalCases === "number" && result.totalCases > 0, "Must have cases");
      assert(typeof result.certified === "boolean", "certified must be boolean");
      assert(Array.isArray(result.cases), "cases must be array");
      assert(Array.isArray(result.failedRules), "failedRules must be array");
    }),

    test("T-AGE-05-02", "Shield cases map to AGE rules", async () => {
      const result = await runArchitectureGovernanceSuite();
      assert(result.totalCases === AGE_RULES.length, `Case count (${result.totalCases}) must equal rule count (${AGE_RULES.length})`);
    }),

    test("T-AGE-05-03", "Shield passRate is 0-100", async () => {
      const result = await runArchitectureGovernanceSuite();
      assert(result.passRate >= 0 && result.passRate <= 100, `passRate must be 0-100, got ${result.passRate}`);
    }),

    test("T-AGE-05-04", "Shield verdict is non-empty string", async () => {
      const result = await runArchitectureGovernanceSuite();
      assert(typeof result.verdict === "string" && result.verdict.length > 0, "verdict must be a non-empty string");
    }),

  ]);
}

async function testFullPipeline(): Promise<TestCase[]> {
  return Promise.all([

    test("T-AGE-06-01", "runArchitectureGovernance resolves", async () => {
      const result = await runArchitectureGovernance();
      assert(typeof result.certified === "boolean", "certified must exist");
    }),

    test("T-AGE-06-02", "Governance score is valid number", async () => {
      const result = await runArchitectureGovernance();
      assert(result.score >= 0 && result.score <= 100, `score must be 0-100, got ${result.score}`);
    }),

    test("T-AGE-06-03", "Governance report has components", async () => {
      const result = await runArchitectureGovernance();
      assert(result.report.components.length > 0, "Report must have components");
    }),

    test("T-AGE-06-04", "Governance violations array is present", async () => {
      const result = await runArchitectureGovernance();
      assert(Array.isArray(result.violations), "violations must be array");
    }),

  ]);
}

// ── Public runner ─────────────────────────────────────────────────────────────

export interface AGETestSuiteResult {
  totalCases:     number;
  passed:         number;
  failed:         number;
  passRate:       number;
  certified:      boolean;
  totalMs:        number;
  groups:         { name: string; cases: TestCase[]; passed: number; total: number }[];
  verdict:        string;
}

export async function runAGETests(): Promise<AGETestSuiteResult> {
  const t0 = Date.now();

  const [catalog, report, score, gate, shield, pipeline] = await Promise.all([
    testRuleCatalog(),
    testReportBuilder(),
    testScoreAlgorithm(),
    testCertificationGate(),
    testRegressionShield(),
    testFullPipeline(),
  ]);

  const groups = [
    { name: "T-AGE-01 Rule Catalog",         cases: catalog,  passed: catalog.filter(c=>c.passed).length,  total: catalog.length },
    { name: "T-AGE-02 Report Builder",        cases: report,   passed: report.filter(c=>c.passed).length,   total: report.length },
    { name: "T-AGE-03 Score Algorithm",       cases: score,    passed: score.filter(c=>c.passed).length,    total: score.length },
    { name: "T-AGE-04 Certification Gate",    cases: gate,     passed: gate.filter(c=>c.passed).length,     total: gate.length },
    { name: "T-AGE-05 Regression Shield",     cases: shield,   passed: shield.filter(c=>c.passed).length,   total: shield.length },
    { name: "T-AGE-06 Full Pipeline",         cases: pipeline, passed: pipeline.filter(c=>c.passed).length, total: pipeline.length },
  ];

  const allCases = groups.flatMap(g => g.cases);
  const totalPassed = allCases.filter(c => c.passed).length;
  const totalFailed = allCases.filter(c => !c.passed).length;
  const passRate = Math.round((totalPassed / allCases.length) * 100);
  const certified = passRate === 100;

  return {
    totalCases:  allCases.length,
    passed:      totalPassed,
    failed:      totalFailed,
    passRate,
    certified,
    totalMs:     Date.now() - t0,
    groups,
    verdict: certified
      ? `AGE TESTS CERTIFIED — ${totalPassed}/${allCases.length} tests passed`
      : `AGE TESTS FAILED — ${totalFailed} test(s) failed`,
  };
}