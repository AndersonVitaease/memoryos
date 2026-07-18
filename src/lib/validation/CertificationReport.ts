/**
 * CertificationReport.ts — Sprint P-02.1
 *
 * Produces the final consolidated Product Validation certificate.
 * Combines: suite results, regression entries, consistency audit, coverage.
 */

import type { ValidationSuiteResult } from "./ValidationTypes";
import type { RegressionEntry }       from "./RegressionStore";
import type { ConsistencyAuditResult } from "./MetricsConsistencyAuditor";
import { OFFICIAL_SCENARIOS }         from "./ValidationScenarios";

export interface ScenarioCoverage {
  readonly total:   number;
  readonly executed: number;
  readonly passed:  number;
  readonly rate:    number;
}

export interface CategoryCoverage {
  readonly category: string;
  readonly total:    number;
  readonly passed:   number;
  readonly rate:     number;
}

export interface ProductValidationCertificate {
  readonly certId:            string;
  readonly issuedAt:          number;
  readonly program:           string;
  readonly sprint:            string;
  readonly certified:         boolean;
  readonly scenarioCoverage:  ScenarioCoverage;
  readonly categoryCoverage:  readonly CategoryCoverage[];
  readonly regressionEntries: readonly RegressionEntry[];
  readonly permanentSuite:    readonly string[];
  readonly consistencyAudit:  ConsistencyAuditResult;
  readonly regressions:       readonly string[];
  readonly avgConfidence:     number;
  readonly avgDurationMs:     number;
  readonly summary:           string;
}

export const CertificationReportBuilder = {
  build(
    suite:       ValidationSuiteResult,
    regressions: readonly RegressionEntry[],
    permanent:   readonly string[],
    consistency: ConsistencyAuditResult,
    regressionViolations: readonly string[],
  ): ProductValidationCertificate {
    const certId  = `P02-CERT-${Date.now()}`;
    const issuedAt = Date.now();

    // Coverage
    const scenarioCoverage: ScenarioCoverage = {
      total:    OFFICIAL_SCENARIOS.length,
      executed: suite.total,
      passed:   suite.passed,
      rate:     suite.total > 0 ? suite.passed / suite.total : 0,
    };

    // Category breakdown
    const catMap = new Map<string, { total: number; passed: number }>();
    for (const r of suite.results) {
      const e = catMap.get(r.category) ?? { total: 0, passed: 0 };
      catMap.set(r.category, { total: e.total + 1, passed: e.passed + (r.passed ? 1 : 0) });
    }
    const categoryCoverage: CategoryCoverage[] = [...catMap.entries()].map(([cat, v]) =>
      Object.freeze({ category: cat, total: v.total, passed: v.passed, rate: v.total > 0 ? v.passed / v.total : 0 })
    );

    // Aggregate metrics
    const avgConfidence = suite.results.length > 0
      ? suite.results.reduce((a, r) => a + (r.metrics?.confidence ?? 0), 0) / suite.results.length
      : 0;
    const avgDurationMs = suite.results.length > 0
      ? suite.results.reduce((a, r) => a + (r.metrics?.totalDurationMs ?? 0), 0) / suite.results.length
      : 0;

    const certified =
      suite.certified &&
      consistency.consistent &&
      regressionViolations.length === 0;

    const summary = certified
      ? `MemoryOS Core v1.0 — Product Validation CERTIFIED. ${suite.passed}/${suite.total} scenarios passed, ` +
        `${permanent.length} in permanent regression suite, consistency verified, zero regressions.`
      : `Product Validation INCOMPLETE. ${suite.passed}/${suite.total} passed. ` +
        `Consistency violations: ${consistency.violations.length}. Regressions: ${regressionViolations.length}.`;

    return Object.freeze({
      certId,
      issuedAt,
      program:           "P-02 Product Validation",
      sprint:            "P-02.1 Validation Integration & Certification",
      certified,
      scenarioCoverage:  Object.freeze(scenarioCoverage),
      categoryCoverage:  Object.freeze(categoryCoverage),
      regressionEntries: Object.freeze(regressions),
      permanentSuite:    Object.freeze([...permanent]),
      consistencyAudit:  consistency,
      regressions:       Object.freeze([...regressionViolations]),
      avgConfidence:     +avgConfidence.toFixed(4),
      avgDurationMs:     +avgDurationMs.toFixed(1),
      summary,
    });
  },
};