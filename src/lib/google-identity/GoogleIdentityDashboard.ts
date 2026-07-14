/**
 * GoogleIdentityDashboard.ts — Sprint 6.4.1
 * Dashboard state aggregator for the GIP dashboard page.
 */

import type { GoogleAuthSession, GoogleMetricSnapshot, GoogleAuditEvent, GoogleDiagnosticResult } from "./GoogleIdentityTypes";
import type { GoogleOAuthAdapter } from "./GoogleOAuthAdapter";
import type { GoogleHealthReport } from "./GoogleHealth";

export interface GIPDashboardState {
  initialized:        boolean;
  providerReady:      boolean;
  activeSession:      GoogleAuthSession | null;
  allSessions:        GoogleAuthSession[];
  metrics:            GoogleMetricSnapshot;
  health:             GoogleHealthReport;
  recentAudit:        GoogleAuditEvent[];
  latestDiagnostic:   GoogleDiagnosticResult | null;
  uopSessionCount:    number;
  uopProviderCount:   number;
}

export class GoogleIdentityDashboard {
  private _lastDiagnostic: GoogleDiagnosticResult | null = null;

  constructor(private readonly _adapter: GoogleOAuthAdapter) {}

  state(): GIPDashboardState {
    return {
      initialized:      this._adapter.status().initialized,
      providerReady:    this._adapter.status().providerReady,
      activeSession:    this._adapter.getActiveSession(),
      allSessions:      this._adapter.getAllSessions(),
      metrics:          this._adapter.metrics.snapshot(),
      health:           this._adapter.health.report(),
      recentAudit:      this._adapter.audit.recent(30),
      latestDiagnostic: this._lastDiagnostic,
      uopSessionCount:  0, // set by page
      uopProviderCount: 8,
    };
  }

  runDiagnostics(): GoogleDiagnosticResult {
    const result = this._adapter.diagnose();
    this._lastDiagnostic = result;
    return result;
  }
}