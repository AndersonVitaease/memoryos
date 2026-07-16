/**
 * ArchitectureRegressionShield.ts — Architecture Governance Engine (AGE) v1.0
 * Sprint 8.5
 *
 * Architecture Governance Suite — the sixth certification suite in the
 * Sprint 8.x Regression Shield family.
 *
 * Each case maps directly to one of the 10 AGE rules. A case FAILS if any
 * parallel / duplicate component is detected in the production path.
 *
 * This suite runs in the browser (dynamic imports only — no fs access).
 * For Node-based (CI) validation see ArchitectureGovernanceTests.ts.
 */

import type { RuleScanResult }    from "./ArchitectureViolation";
import { runArchitectureScan }    from "./ArchitectureScanner";

// ── Shield result types ───────────────────────────────────────────────────────

export interface AGSCase {
  id:         string;
  rule:       string;
  passed:     boolean;
  durationMs: number;
  evidence:   string;
  violations: number;
}

export interface AGSSuiteResult {
  suite:          string;
  totalCases:     number;
  passed:         number;
  failed:         number;
  passRate:       number;
  certified:      boolean;
  totalDurationMs: number;
  verdict:        string;
  cases:          AGSCase[];
  failedRules:    string[];
}

// ── Map scan results to shield cases ─────────────────────────────────────────

function mapScanResultToCase(result: RuleScanResult): AGSCase {
  return {
    id:         result.ruleId,
    rule:       result.ruleName,
    passed:     result.passed,
    durationMs: result.durationMs,
    evidence:   result.evidence,
    violations: result.violations.length,
  };
}

// ── Run the Architecture Governance Suite ────────────────────────────────────

export async function runArchitectureGovernanceSuite(): Promise<AGSSuiteResult> {
  const t0   = Date.now();
  const scan = await runArchitectureScan();
  const cases: AGSCase[] = scan.results.map(mapScanResultToCase);

  const passed      = cases.filter(c => c.passed).length;
  const failed      = cases.filter(c => !c.passed).length;
  const passRate    = cases.length > 0 ? Math.round((passed / cases.length) * 100) : 0;
  const certified   = passRate === 100;
  const failedRules = cases.filter(c => !c.passed).map(c => c.id);

  return {
    suite:           "Architecture Governance Suite",
    totalCases:      cases.length,
    passed,
    failed,
    passRate,
    certified,
    totalDurationMs: Date.now() - t0,
    verdict: certified
      ? `ARCHITECTURE GOVERNANCE CERTIFIED — ${passed}/${cases.length} rules passed — Zero parallel paths`
      : `ARCHITECTURE GOVERNANCE FAILED — ${failed} rule(s) failed: ${failedRules.join(", ")}`,
    cases,
    failedRules,
  };
}

// ── Guard function (CI gate) ──────────────────────────────────────────────────

/**
 * Throws if the Architecture Governance Suite fails.
 * Use this as a hard gate in CI / pre-commit hooks.
 */
export async function assertArchitectureGovernance(): Promise<void> {
  const result = await runArchitectureGovernanceSuite();
  if (!result.certified) {
    throw new Error(
      `[AGE] Architecture Governance Suite FAILED.\n` +
      `Failed rules: ${result.failedRules.join(", ")}\n` +
      `Verdict: ${result.verdict}`
    );
  }
}