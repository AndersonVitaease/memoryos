/**
 * OAuthDiscoveryHistory.ts — Sprint 6.4.1A
 * Append-only history of discovery reports.
 */

import type { OAuthDiscoveryReport } from "./OAuthDiscoveryTypes";

export class OAuthDiscoveryHistory {
  private _reports: OAuthDiscoveryReport[] = [];

  add(report: OAuthDiscoveryReport): void {
    this._reports.unshift(report);
    if (this._reports.length > 20) this._reports.splice(20);
  }

  all():    OAuthDiscoveryReport[] { return [...this._reports]; }
  latest(): OAuthDiscoveryReport | null { return this._reports[0] ?? null; }
  count():  number { return this._reports.length; }
}