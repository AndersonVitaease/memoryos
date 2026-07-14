/**
 * OAuthDiscoveryEngine.ts — Sprint 6.4.1A
 * Central discovery engine. Auto-inspects every registered OAuth provider
 * and produces a complete, self-describing configuration report.
 * GIP and all future connectors consume this instead of hardcoding config.
 */

import { UOP } from "../universal-oauth/UniversalOAuthPlatform";
import { OAuthRedirectUriResolver } from "./OAuthRedirectUriResolver";
import { OAuthCallbackResolver } from "./OAuthCallbackResolver";
import { OAuthScopeRegistry } from "./OAuthScopeRegistry";
import { OAuthEnvironmentInspector } from "./OAuthEnvironmentInspector";
import { OAuthConfigurationValidator } from "./OAuthConfigurationValidator";
import { OAuthRuntimeInspector } from "./OAuthRuntimeInspector";
import { OAuthConfigurationAudit } from "./OAuthConfigurationAudit";
import { OAuthConfigurationMetrics } from "./OAuthConfigurationMetrics";
import { OAuthConfigurationHealth } from "./OAuthConfigurationHealth";
import { OAuthDiscoveryDiagnostics } from "./OAuthDiscoveryDiagnostics";
import { OAuthDiscoveryHistory } from "./OAuthDiscoveryHistory";
import type {
  OAuthProviderDiscovery,
  OAuthDiscoveryReport,
  DiscoveryProviderStatus,
  DiscoveryHealthState,
} from "./OAuthDiscoveryTypes";

// Required APIs per provider (for documentation purposes)
const REQUIRED_APIS: Record<string, string[]> = {
  google: [
    "Google Identity (OAuth 2.0)",
    "People API (for profile)",
    "Google Calendar API (Sprint 6.4.2)",
    "Gmail API (Sprint 6.4.3)",
    "Google Drive API (Sprint 6.4.4)",
  ],
};

const PROVIDER_NOTES: Record<string, string[]> = {
  google: [
    "Set Authorized Redirect URI in Google Cloud Console",
    "Add Authorized JavaScript Origins",
    "Enable required APIs in Google Cloud Console",
    "Sprint 6.4.1: identity scopes only (openid, email, profile)",
  ],
  microsoft: ["Register app in Azure Active Directory", "Set redirect URI in app registration"],
  github:    ["Create OAuth App in GitHub Developer Settings"],
  slack:     ["Create Slack App at api.slack.com/apps"],
};

let _seq = 0;
function makeId(): string { return `odr_${Date.now()}_${++_seq}`; }

export class OAuthDiscoveryEngine {
  readonly redirect    = new OAuthRedirectUriResolver();
  readonly callback    = new OAuthCallbackResolver();
  readonly scopes      = new OAuthScopeRegistry();
  readonly env         = new OAuthEnvironmentInspector();
  readonly audit       = new OAuthConfigurationAudit();
  readonly metrics     = new OAuthConfigurationMetrics();
  readonly health      = new OAuthConfigurationHealth();
  readonly diagnostics = new OAuthDiscoveryDiagnostics();
  readonly history     = new OAuthDiscoveryHistory();

  private readonly _validator  = new OAuthConfigurationValidator(this.env, this.scopes, this.redirect);
  private readonly _runtime    = new OAuthRuntimeInspector();

  /**
   * Run a full discovery pass over all registered providers.
   */
  discover(): OAuthDiscoveryReport {
    const t0 = Date.now();
    const uopProviders = UOP.registry.listProviders();
    const providers: OAuthProviderDiscovery[] = [];

    for (const uopProv of uopProviders) {
      const pName = uopProv.name;
      const redirectConfig = this.redirect.resolve(pName);
      const envCreds       = this.env.getCredentialStatus(pName);
      const requiredScopes = this.scopes.getRequiredScopeNames(pName);
      const configuredScopes = this.scopes.getScopeNames(pName);
      const { missing: missingScopes } = this.scopes.validateGranted(pName, configuredScopes);
      const runtime = this._runtime.inspectProvider(pName);
      const validation = this._validator.validate(pName, configuredScopes);

      // Determine status
      const credsMissing = envCreds.clientId === "MISSING" || envCreds.clientSecret === "MISSING";
      const status: DiscoveryProviderStatus =
        !credsMissing && missingScopes.length === 0 ? "FULLY_CONFIGURED" :
        !credsMissing && missingScopes.length > 0   ? "PARTIALLY_CONFIGURED" :
        credsMissing  && validation.score > 30      ? "PARTIALLY_CONFIGURED" :
        "MISSING_CREDENTIALS";

      // Health
      const healthState: DiscoveryHealthState =
        status === "FULLY_CONFIGURED" ? "HEALTHY" :
        status === "PARTIALLY_CONFIGURED" ? "DEGRADED" :
        "MISCONFIGURED";

      const missing: string[] = [];
      if (envCreds.clientId     === "MISSING") missing.push("Client ID");
      if (envCreds.clientSecret === "MISSING") missing.push("Client Secret");
      if (missingScopes.length > 0)             missing.push(`Scopes: ${missingScopes.join(", ")}`);

      const discovery: OAuthProviderDiscovery = {
        provider:           pName,
        displayName:        uopProv.displayName,
        iconEmoji:          uopProv.iconEmoji,
        status,
        health:             healthState,
        clientIdStatus:     envCreds.clientId,
        clientSecretStatus: envCreds.clientSecret,
        authorizationUrl:   uopProv.authorizationUrl,
        tokenUrl:           uopProv.tokenUrl,
        userInfoUrl:        uopProv.userInfoUrl,
        redirectUri:        redirectConfig.redirectUri,
        callbackUri:        redirectConfig.callbackUri,
        authorizedOrigins:  redirectConfig.authorizedOrigins,
        requiredScopes,
        configuredScopes,
        missingScopes,
        supportsRefresh:    uopProv.supportsRefresh,
        supportsPKCE:       true,
        supportsRevoke:     uopProv.supportsRevoke,
        sessionPersisted:   true,
        autoReconnect:      uopProv.supportsRefresh,
        lastLoginAt:        runtime.lastLoginAt,
        lastErrorAt:        runtime.lastErrorAt,
        lastError:          runtime.lastError,
        tokenExpiresAt:     runtime.tokenExpiresAt,
        activeSessions:     runtime.activeSessions,
        missingConfig:      missing,
        requiredApis:       REQUIRED_APIS[pName],
        notes:              PROVIDER_NOTES[pName] ?? [],
      };
      providers.push(discovery);
      this.health.update(pName, healthState);
    }

    const fullyConfigured = providers.filter(p => p.status === "FULLY_CONFIGURED").length;
    const partial         = providers.filter(p => p.status === "PARTIALLY_CONFIGURED").length;
    const missing         = providers.filter(p => p.status === "MISSING_CREDENTIALS" || p.status === "NOT_CONFIGURED").length;
    const healthy         = providers.filter(p => p.health === "HEALTHY").length;
    const degraded        = providers.filter(p => p.health !== "HEALTHY").length;

    const issues          = providers.flatMap(p => p.missingConfig.map(m => `${p.provider}: ${m}`));
    const recommendations = providers.filter(p => p.missingConfig.length > 0).map(p =>
      `Configure ${p.displayName}: ${p.missingConfig.join(", ")}`
    );

    const report: OAuthDiscoveryReport = {
      id: makeId(), generatedAt: Date.now(), durationMs: Date.now() - t0,
      providers, totalProviders: providers.length,
      fullyConfigured, partial, missing, healthy, degraded,
      issues, recommendations,
    };

    this.history.add(report);
    this.metrics.recordRun(report.durationMs, providers.length);
    this.audit.record("DISCOVERY_RUN", null, "SUCCESS", `Discovered ${providers.length} providers in ${report.durationMs}ms`, report.durationMs);
    return report;
  }

  /**
   * Get the discovered configuration for a single provider.
   * Used by GIP and all future connectors.
   */
  getProviderConfig(provider: string): OAuthProviderDiscovery | null {
    const latest = this.history.latest();
    if (latest) return latest.providers.find(p => p.provider === provider) ?? null;
    // Run discovery if no history
    const report = this.discover();
    return report.providers.find(p => p.provider === provider) ?? null;
  }

  /**
   * Get redirect URI for a provider — consumed by GIP.
   */
  getRedirectUri(provider: string): string {
    return this.redirect.getRedirectUri(provider);
  }

  /**
   * Mark credentials as configured (does NOT store the value).
   */
  markCredentials(provider: string, hasClientId: boolean, hasClientSecret: boolean): void {
    this.env.setCredentialPresence(provider, hasClientId, hasClientSecret);
    this.audit.record("CONFIG_CHANGED", provider, "INFO",
      `Credentials updated: clientId=${hasClientId ? "SET" : "MISSING"} clientSecret=${hasClientSecret ? "SET" : "MISSING"}`);
  }

  /**
   * Run diagnostics on all providers.
   */
  runDiagnostics(): ReturnType<OAuthDiscoveryDiagnostics["run"]> {
    const latest = this.history.latest();
    const providers = latest?.providers ?? this.discover().providers;
    const result = this.diagnostics.run(providers);
    this.audit.record("DIAGNOSTIC_RUN", null, result.overall === "FAIL" ? "FAIL" : "SUCCESS",
      `Diagnostics: ${result.overall} (${result.providersOk} OK, ${result.providersFail} fail)`, result.durationMs);
    return result;
  }
}

// ── Global singleton ───────────────────────────────────────────────────────────
const G = globalThis as any;
if (!G.__oauthDiscoveryEngine) G.__oauthDiscoveryEngine = new OAuthDiscoveryEngine();
export const OAuthDiscovery: OAuthDiscoveryEngine = G.__oauthDiscoveryEngine;