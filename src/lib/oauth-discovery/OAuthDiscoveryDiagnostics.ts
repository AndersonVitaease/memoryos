/**
 * OAuthDiscoveryDiagnostics.ts — Sprint 6.4.1A
 */

import type { OAuthProviderDiscovery } from "./OAuthDiscoveryTypes";

export interface DiscoveryDiagnosticResult {
  runAt:         number;
  durationMs:    number;
  providersOk:   number;
  providersFail: number;
  issues:        string[];
  recommendations: string[];
  overall:       "PASS" | "WARN" | "FAIL";
}

export class OAuthDiscoveryDiagnostics {
  run(providers: OAuthProviderDiscovery[]): DiscoveryDiagnosticResult {
    const t0 = Date.now();
    const issues: string[] = [];
    const recommendations: string[] = [];
    let ok = 0, fail = 0;

    for (const p of providers) {
      const healthy = p.health === "HEALTHY" || p.health === "UNKNOWN";
      if (p.clientIdStatus === "MISSING")     { issues.push(`${p.provider}: Client ID missing`); recommendations.push(`Configure Client ID for ${p.provider}`); fail++; }
      else if (p.clientSecretStatus === "MISSING") { issues.push(`${p.provider}: Client Secret missing`); recommendations.push(`Configure Client Secret for ${p.provider}`); fail++; }
      else { ok++; }
      if (p.missingScopes.length > 0) issues.push(`${p.provider}: Missing scopes: ${p.missingScopes.join(", ")}`);
    }

    const overall: DiscoveryDiagnosticResult["overall"] =
      fail === 0 ? "PASS" : fail < providers.length ? "WARN" : "FAIL";

    return { runAt: t0, durationMs: Date.now() - t0, providersOk: ok, providersFail: fail, issues, recommendations, overall };
  }
}