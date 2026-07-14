/**
 * OAuthConfigurationValidator.ts — Sprint 6.4.1A
 * Validates OAuth provider configuration completeness and correctness.
 */

import type { OAuthConfigValidation } from "./OAuthDiscoveryTypes";
import type { OAuthEnvironmentInspector } from "./OAuthEnvironmentInspector";
import type { OAuthScopeRegistry } from "./OAuthScopeRegistry";
import type { OAuthRedirectUriResolver } from "./OAuthRedirectUriResolver";

export class OAuthConfigurationValidator {
  constructor(
    private readonly _env: OAuthEnvironmentInspector,
    private readonly _scopes: OAuthScopeRegistry,
    private readonly _redirect: OAuthRedirectUriResolver,
  ) {}

  validate(provider: string, configuredScopes: string[]): OAuthConfigValidation {
    const creds    = this._env.getCredentialStatus(provider);
    const env      = this._env.inspect();
    const required = this._scopes.getRequiredScopeNames(provider);
    const { missing: missingScopes } = this._scopes.validateGranted(provider, configuredScopes);
    const redirectUri = this._redirect.getRedirectUri(provider);

    const checks = [
      {
        label:  "Client ID configured",
        pass:   creds.clientId === "CONFIGURED",
        detail: creds.clientId === "CONFIGURED" ? "Client ID is set" : "Client ID is missing — configure in settings",
      },
      {
        label:  "Client Secret configured",
        pass:   creds.clientSecret === "CONFIGURED",
        detail: creds.clientSecret === "CONFIGURED" ? "Client Secret is set" : "Client Secret is missing — configure in settings",
      },
      {
        label:  "Redirect URI resolved",
        pass:   redirectUri.startsWith("http"),
        detail: `Redirect URI: ${redirectUri}`,
      },
      {
        label:  "HTTPS / secure origin",
        pass:   env.isSecure,
        detail: env.isSecure ? "Origin is secure" : "HTTP detected — OAuth requires HTTPS in production",
      },
      {
        label:  "PKCE supported",
        pass:   env.pkceSupported,
        detail: env.pkceSupported ? "WebCrypto available — PKCE enabled" : "WebCrypto not available",
      },
      {
        label:  "Required scopes configured",
        pass:   missingScopes.length === 0,
        detail: missingScopes.length === 0
          ? `All ${required.length} required scopes configured`
          : `Missing scopes: ${missingScopes.join(", ")}`,
      },
      {
        label:  "SessionStorage available",
        pass:   env.supportsSessionStorage,
        detail: env.supportsSessionStorage ? "PKCE state can be stored" : "sessionStorage not available",
      },
    ];

    const passed   = checks.filter(c => c.pass).length;
    const score    = Math.round((passed / checks.length) * 100);
    const blockers = checks.filter(c => !c.pass && (c.label.includes("Client") || c.label.includes("HTTPS"))).map(c => c.detail);
    const warnings = checks.filter(c => !c.pass && !blockers.includes(c.detail)).map(c => c.detail);

    return {
      provider,
      valid:    blockers.length === 0,
      checks,
      score,
      blockers,
      warnings,
    };
  }
}