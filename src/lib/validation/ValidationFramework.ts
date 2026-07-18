/**
 * ValidationFramework.ts — Sprint P-02.0
 *
 * Orchestrates all validation scenarios, produces a final ValidationSuiteResult,
 * and tracks regression state (all previously passed scenarios are permanent).
 */

import { ValidationRunner }              from "./ValidationRunner";
import { OFFICIAL_SCENARIOS }            from "./ValidationScenarios";
import { RegressionStore }               from "./RegressionStore";
import { MetricsConsistencyAuditor }     from "./MetricsConsistencyAuditor";
import { CertificationReportBuilder }    from "./CertificationReport";
import type {
  ValidationScenario,
  ValidationSuiteResult,
  ValidationResult,
} from "./ValidationTypes";
import type { ProductValidationCertificate } from "./CertificationReport";

let _suiteHistory: ValidationSuiteResult[] = [];
let _lastCert: ProductValidationCertificate | null = null;

export class ValidationFramework {
  private readonly _runner: ValidationRunner;

  constructor() {
    this._runner = new ValidationRunner();
  }

  /** Run all official scenarios and return a full suite result. */
  async runAll(
    onProgress?: (done: number, total: number, latest: ValidationResult) => void,
  ): Promise<ValidationSuiteResult> {
    return this._runScenarios(OFFICIAL_SCENARIOS, onProgress);
  }

  /** Run a single scenario by ID. */
  async runOne(scenarioId: string): Promise<ValidationResult | null> {
    const scenario = OFFICIAL_SCENARIOS.find(s => s.id === scenarioId);
    if (!scenario) return null;
    return this._runner.run(scenario);
  }

  /** Run a specific subset of scenarios. */
  async runSubset(
    ids: string[],
    onProgress?: (done: number, total: number, latest: ValidationResult) => void,
  ): Promise<ValidationSuiteResult> {
    const scenarios = OFFICIAL_SCENARIOS.filter(s => ids.includes(s.id));
    return this._runScenarios(scenarios, onProgress);
  }

  /** Returns in-memory suite history for comparison. */
  history(): readonly ValidationSuiteResult[] {
    return Object.freeze([..._suiteHistory]);
  }

  /** Regression check — uses permanent RegressionStore. */
  checkRegression(latest: ValidationSuiteResult): string[] {
    return RegressionStore.detectRegressions(latest.results);
  }

  /** Run consistency audit across report/snapshot/metrics. */
  auditConsistency(suite: ValidationSuiteResult) {
    return MetricsConsistencyAuditor.auditAll(suite.results);
  }

  /** Build the final ProductValidationCertificate. */
  certify(suite: ValidationSuiteResult): ProductValidationCertificate {
    const regressions        = RegressionStore.all();
    const permanent          = RegressionStore.permanentSuite();
    const consistency        = MetricsConsistencyAuditor.auditAll(suite.results);
    const regressionViolations = RegressionStore.detectRegressions(suite.results);
    _lastCert = CertificationReportBuilder.build(suite, regressions, permanent, consistency, regressionViolations);
    return _lastCert;
  }

  /** Last issued certificate (null if never certified). */
  lastCertificate(): ProductValidationCertificate | null {
    return _lastCert;
  }

  /** Permanent regression suite IDs. */
  permanentSuite(): readonly string[] {
    return RegressionStore.permanentSuite();
  }

  private async _runScenarios(
    scenarios: readonly ValidationScenario[],
    onProgress?: (done: number, total: number, latest: ValidationResult) => void,
  ): Promise<ValidationSuiteResult> {
    const suiteId  = `suite-${Date.now()}`;
    const runAt    = Date.now();
    const results: ValidationResult[] = [];

    for (let i = 0; i < scenarios.length; i++) {
      const result = await this._runner.run(scenarios[i]);
      results.push(result);
      onProgress?.(i + 1, scenarios.length, result);
    }

    const passed      = results.filter(r => r.passed).length;
    const failed      = results.filter(r => !r.passed && r.status !== "PARTIAL").length;
    const partial     = results.filter(r => r.status === "PARTIAL").length;
    const durationMs  = Date.now() - runAt;
    const successRate = results.length > 0 ? passed / results.length : 0;

    const suite: ValidationSuiteResult = Object.freeze({
      suiteId,
      runAt,
      durationMs,
      total:        results.length,
      passed,
      failed,
      partial,
      successRate,
      results:      Object.freeze(results),
      certified:    passed === results.length,
    });

    _suiteHistory = [..._suiteHistory, suite];
    // Always record into permanent regression store
    RegressionStore.recordAll(suite.results);
    return suite;
  }
}