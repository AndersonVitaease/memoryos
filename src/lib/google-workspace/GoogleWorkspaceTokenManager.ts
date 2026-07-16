/**
 * GoogleWorkspaceTokenManager.ts — Engineering Sprint 7.0
 * In-memory + localStorage token cache with refresh orchestration.
 * Calls the existing googleOAuthRefresh backend function.
 */

import type { GWSToken } from "./GoogleWorkspaceTypes";
import { GoogleWorkspaceAuth } from "./GoogleWorkspaceAuth";

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

// ── In-memory cache ───────────────────────────────────────────────────────────

const _cache = new Map<string, { token: GWSToken; cachedAt: number }>();

// ── Token Manager ─────────────────────────────────────────────────────────────

class TokenManagerClass {
  /**
   * Get a valid access token for a user, refreshing if needed.
   */
  async ensureValidToken(userId: string): Promise<GWSToken | null> {
    // Check in-memory cache first
    const cached = _cache.get(userId);
    if (cached && Date.now() < cached.token.expiresAt - REFRESH_BUFFER_MS) {
      return cached.token;
    }

    // Fall back to persisted token
    const stored = GoogleWorkspaceAuth.getToken(userId);
    if (!stored) return null;

    // If still valid, use it and warm the cache
    if (Date.now() < stored.expiresAt - REFRESH_BUFFER_MS) {
      _cache.set(userId, { token: stored, cachedAt: Date.now() });
      return stored;
    }

    // Needs refresh
    return this._refresh(userId, stored);
  }

  private async _refresh(userId: string, current: GWSToken): Promise<GWSToken | null> {
    try {
      const resp = await fetch("/api/functions/googleOAuthRefresh", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ refresh_token: current.refreshToken }),
      });

      if (!resp.ok) {
        console.warn("[TokenManager] Refresh failed:", resp.status);
        return null;
      }

      const data = await resp.json();
      if (!data.access_token) return null;

      const newExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
      GoogleWorkspaceAuth.updateAccessToken(userId, data.access_token, newExpiresAt);

      const refreshed: GWSToken = {
        ...current,
        accessToken: data.access_token,
        expiresAt:   newExpiresAt,
      };

      _cache.set(userId, { token: refreshed, cachedAt: Date.now() });
      return refreshed;
    } catch (e) {
      console.warn("[TokenManager] Refresh error:", e);
      return null;
    }
  }

  /**
   * Invalidate the in-memory cache for a user (forces re-read from storage).
   */
  invalidateCache(userId: string): void {
    _cache.delete(userId);
  }

  /**
   * Returns cache stats for observability.
   */
  cacheStats(): { size: number; users: string[] } {
    return { size: _cache.size, users: [..._cache.keys()] };
  }
}

const _KEY = "__GWS_TOKEN_MGR__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new TokenManagerClass();
}
export const GoogleWorkspaceTokenManager: TokenManagerClass = (
  globalThis as unknown as Record<string, TokenManagerClass>
)[_KEY];