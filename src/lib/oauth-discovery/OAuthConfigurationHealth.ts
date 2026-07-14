/**
 * OAuthConfigurationHealth.ts — Sprint 6.4.1A
 */

import type { DiscoveryHealthState } from "./OAuthDiscoveryTypes";

export interface DiscoveryHealthReport {
  overall:          DiscoveryHealthState;
  lastCheck:        number;
  detail:           string;
  providerStates:   Record<string, DiscoveryHealthState>;
  totalProviders:   number;
  healthyProviders: number;
}

export class OAuthConfigurationHealth {
  private _states:   Map<string, DiscoveryHealthState> = new Map();
  private _overall:  DiscoveryHealthState = "UNKNOWN";
  private _lastCheck = 0;
  private _detail   = "Not initialized";

  update(provider: string, state: DiscoveryHealthState, detail?: string): void {
    this._states.set(provider, state);
    this._lastCheck = Date.now();
    if (detail) this._detail = detail;
    this._recalcOverall();
  }

  private _recalcOverall(): void {
    const states = [...this._states.values()];
    if (states.every(s => s === "HEALTHY"))             this._overall = "HEALTHY";
    else if (states.some(s => s === "MISCONFIGURED"))   this._overall = "MISCONFIGURED";
    else if (states.some(s => s === "DEGRADED"))        this._overall = "DEGRADED";
    else                                                 this._overall = "UNKNOWN";
  }

  report(): DiscoveryHealthReport {
    const states = Object.fromEntries(this._states.entries());
    const healthy = [...this._states.values()].filter(s => s === "HEALTHY").length;
    return {
      overall:          this._overall,
      lastCheck:        this._lastCheck,
      detail:           this._detail,
      providerStates:   states,
      totalProviders:   this._states.size,
      healthyProviders: healthy,
    };
  }

  overall(): DiscoveryHealthState { return this._overall; }
}