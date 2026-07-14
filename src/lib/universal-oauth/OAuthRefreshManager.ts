/**
 * OAuthRefreshManager.ts — Sprint 6.4.0
 * Handles automatic token refresh when supported by the provider.
 * On failure, session is marked SESSION_EXPIRED.
 */

import type { OAuthRefreshAttempt, OAuthProviderName } from "./OAuthTypes";
import type { OAuthRegistry } from "./OAuthRegistry";
import type { OAuthTokenManager } from "./OAuthTokenManager";
import { getProvider } from "./OAuthProvider";

export class OAuthRefreshManager {
  private _history: OAuthRefreshAttempt[] = [];

  constructor(
    private readonly _registry: OAuthRegistry,
    private readonly _tokenManager: OAuthTokenManager,
  ) {}

  /**
   * Attempt to refresh the access token for a session.
   * Real refresh happens via the provider's refresh endpoint.
   * In this infrastructure sprint, the mechanism is stubbed —
   * actual HTTP calls will be wired in Sprint 6.4.1+.
   */
  async refresh(sessionId: string): Promise<OAuthRefreshAttempt> {
    const t0 = Date.now();
    const session = this._registry.getSession(sessionId);

    if (!session) {
      const attempt: OAuthRefreshAttempt = {
        sessionId,
        provider: "google",
        startedAt: t0,
        completedAt: Date.now(),
        durationMs: Date.now() - t0,
        success: false,
        result: "FAILED",
        error: "Session not found",
      };
      this._history.push(attempt);
      return attempt;
    }

    const provider = getProvider(session.provider);

    if (!provider.supportsRefresh) {
      const attempt: OAuthRefreshAttempt = {
        sessionId,
        provider: session.provider,
        startedAt: t0,
        completedAt: Date.now(),
        durationMs: Date.now() - t0,
        success: false,
        result: "NOT_SUPPORTED",
      };
      this._history.push(attempt);
      return attempt;
    }

    const hasRefreshToken = this._tokenManager.isValid(sessionId, "refresh") ||
      this._tokenManager.retrieve(sessionId, "refresh") !== null;

    if (!hasRefreshToken) {
      // Mark session expired
      this._registry.updateSession(sessionId, { status: "EXPIRED", health: "SESSION_EXPIRED" });
      const attempt: OAuthRefreshAttempt = {
        sessionId,
        provider: session.provider,
        startedAt: t0,
        completedAt: Date.now(),
        durationMs: Date.now() - t0,
        success: false,
        result: "SESSION_EXPIRED",
        error: "No refresh token available",
      };
      this._history.push(attempt);
      return attempt;
    }

    // Simulate refresh (actual HTTP in 6.4.1+)
    await new Promise(r => setTimeout(r, 10));
    const newExpiresAt = Date.now() + 3600_000; // +1 hour
    this._registry.updateSession(sessionId, {
      expiresAt: newExpiresAt,
      lastRefreshedAt: Date.now(),
      status: "ACTIVE",
      health: "CONNECTED",
    });

    const attempt: OAuthRefreshAttempt = {
      sessionId,
      provider: session.provider,
      startedAt: t0,
      completedAt: Date.now(),
      durationMs: Date.now() - t0,
      success: true,
      result: "REFRESHED",
    };
    this._history.push(attempt);
    return attempt;
  }

  history(): OAuthRefreshAttempt[] { return [...this._history]; }
  successCount(): number { return this._history.filter(h => h.success).length; }
  failCount(): number { return this._history.filter(h => !h.success).length; }
}