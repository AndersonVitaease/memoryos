/**
 * OAuthDiscoveryDashboard.ts — Sprint 6.4.1A
 * Dashboard state aggregator.
 */

import { OAuthDiscovery } from "./OAuthDiscoveryEngine";
import type { OAuthDiscoveryReport, OAuthDiscoveryMetrics } from "./OAuthDiscoveryTypes";
import type { DiscoveryHealthReport } from "./OAuthConfigurationHealth";
import type { DiscoveryDiagnosticResult } from "./OAuthDiscoveryDiagnostics";

export interface DiscoveryDashboardState {
  latestReport:     OAuthDiscoveryReport | null;
  health:           DiscoveryHealthReport;
  metrics:          OAuthDiscoveryMetrics;
  latestDiagnostic: DiscoveryDiagnosticResult | null;
  historyCount:     number;
  recentAudit:      ReturnType<typeof OAuthDiscovery.audit.recent>;
  baseUrl:          string;
  isSecure:         boolean;
}

export class OAuthDiscoveryDashboard {
  private _lastDiagnostic: DiscoveryDiagnosticResult | null = null;

  state(): DiscoveryDashboardState {
    const latest  = OAuthDiscovery.history.latest();
    const health  = OAuthDiscovery.health.report();
    const env     = OAuthDiscovery.env.inspect();
    const fc      = latest?.fullyConfigured ?? 0;
    const h       = latest ? latest.providers.filter(p => p.health === "HEALTHY").length : 0;
    const metrics = OAuthDiscovery.metrics.snapshot(fc, h, latest?.totalProviders ?? 0);

    return {
      latestReport:     latest,
      health,
      metrics,
      latestDiagnostic: this._lastDiagnostic,
      historyCount:     OAuthDiscovery.history.count(),
      recentAudit:      OAuthDiscovery.audit.recent(30),
      baseUrl:          env.baseUrl,
      isSecure:         env.isSecure,
    };
  }

  runDiscovery(): OAuthDiscoveryReport {
    return OAuthDiscovery.discover();
  }

  runDiagnostics(): DiscoveryDiagnosticResult {
    const r = OAuthDiscovery.runDiagnostics();
    this._lastDiagnostic = r;
    return r;
  }
}