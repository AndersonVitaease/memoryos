/**
 * OAuthConfigurationMetrics.ts — Sprint 6.4.1A
 */

import type { OAuthDiscoveryMetrics } from "./OAuthDiscoveryTypes";

export class OAuthConfigurationMetrics {
  private _runs:        { durationMs: number }[] = [];
  private _validations: { pass: boolean }[] = [];
  private _lastRunAt:   number | null = null;

  recordRun(durationMs: number, providerCount: number): void {
    this._runs.push({ durationMs });
    this._lastRunAt = Date.now();
  }

  recordValidation(pass: boolean): void {
    this._validations.push({ pass });
  }

  snapshot(fullyConfigured: number, healthy: number, tracked: number): OAuthDiscoveryMetrics {
    const avg = this._runs.length === 0 ? 0
      : Math.round(this._runs.reduce((a, b) => a + b.durationMs, 0) / this._runs.length);
    const passRate = this._validations.length === 0 ? 0
      : Math.round(this._validations.filter(v => v.pass).length / this._validations.length * 100);
    return {
      totalDiscoveryRuns:   this._runs.length,
      lastRunAt:            this._lastRunAt,
      avgRunMs:             avg,
      providersTracked:     tracked,
      fullyConfiguredCount: fullyConfigured,
      healthyCount:         healthy,
      totalValidations:     this._validations.length,
      validationPassRate:   passRate,
    };
  }
}