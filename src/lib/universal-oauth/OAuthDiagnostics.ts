/**
 * OAuthDiagnostics.ts — Sprint 6.4.0
 * Runs health, expiration, refresh, scope, and compatibility diagnostics.
 */

import type { OAuthDiagnosticResult, OAuthProviderName } from "./OAuthTypes";
import type { OAuthRegistry } from "./OAuthRegistry";
import type { OAuthTokenManager } from "./OAuthTokenManager";
import { getProvider } from "./OAuthProvider";

export class OAuthDiagnostics {
  constructor(
    private readonly _registry: OAuthRegistry,
    private readonly _tokenManager: OAuthTokenManager,
  ) {}

  run(sessionId: string): OAuthDiagnosticResult {
    const t0 = Date.now();
    const session = this._registry.getSession(sessionId);
    const issues: string[] = [];

    if (!session) {
      return {
        sessionId, provider: "google", runAt: t0,
        durationMs: Date.now() - t0,
        healthState: "ERROR", expirationOk: false,
        refreshCapable: false, scopesValid: false, providerReachable: false,
        overall: false, issues: ["Session not found"],
      };
    }

    const now = Date.now();
    const provider = getProvider(session.provider);

    // Expiration check
    const expirationOk = session.expiresAt === null || session.expiresAt > now;
    if (!expirationOk) issues.push("Session is expired");

    // Refresh capability
    const refreshCapable = provider.supportsRefresh &&
      this._tokenManager.retrieve(session.id, "refresh") !== null;
    if (!refreshCapable && !expirationOk) issues.push("Cannot refresh — no refresh token");

    // Scope validation
    const missingScopes = session.requiredScopes.filter(
      r => !session.grantedScopes.includes(r)
    );
    const scopesValid = missingScopes.length === 0;
    if (!scopesValid) issues.push(`Missing scopes: ${missingScopes.join(", ")}`);

    // Provider reachable (heuristic — actual HTTP check in 6.4.1+)
    const providerReachable = !!provider.tokenUrl && !!provider.authorizationUrl;
    if (!providerReachable) issues.push("Provider configuration incomplete");

    // Health state
    let healthState = session.health;
    if (!expirationOk) healthState = "SESSION_EXPIRED";
    else if (session.status === "REVOKED") healthState = "DISCONNECTED";
    else if (session.status === "ACTIVE" && expirationOk) healthState = "CONNECTED";

    return {
      sessionId, provider: session.provider, runAt: t0,
      durationMs: Date.now() - t0,
      healthState, expirationOk, refreshCapable, scopesValid, providerReachable,
      overall: issues.length === 0, issues,
    };
  }

  runAll(): OAuthDiagnosticResult[] {
    return this._registry.listSessions().map(s => this.run(s.id));
  }
}