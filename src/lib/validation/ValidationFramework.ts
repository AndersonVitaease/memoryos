/**
 * ValidationFramework.ts — Sprint P-02.0
 *
 * Orchestrates all validation scenarios, produces a final ValidationSuiteResult,
 * and tracks regression state (all previously passed scenarios are permanent).
 */

import { ValidationRunner }      from "./ValidationRunner";
import { OFFICIAL_SCENARIOS }    from "./ValidationScenarios";
import type {
  ValidationScenario,
  ValidationSuiteResult,
  ValidationResult,
} from "./ValidationTypes";

let _suiteHistory: ValidationSuiteResult[] = [];

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

  /** Regression check — verifies no previously passing scenario now fails. */
  checkRegression(latest: ValidationSuiteResult): string[] {
    if (_suiteHistory.length === 0) return [];
    const violations: string[] = [];
    for (const prev of _suiteHistory) {
      const prevPassed = new Set(prev.results.filter(r => r.passed).map(r => r.scenarioId));
      for (const r of latest.results) {
        if (prevPassed.has(r.scenarioId) && !r.passed) {
          violations.push(`REGRESSION: ${r.scenarioId} (${r.scenarioName}) previously passed but now failed`);
        }
      }
    }
    return violations;
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
    return suite;
  }
}