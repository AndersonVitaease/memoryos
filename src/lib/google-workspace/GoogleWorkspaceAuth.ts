/**
 * GoogleWorkspaceAuth.ts — Engineering Sprint 7.0
 * OAuth orchestration for Google Workspace services.
 * Delegates token storage to GoogleWorkspaceTokenManager.
 * Reused by all GWS services including the existing GmailConnector.
 */

import type { GWSToken, GWSServiceId } from "./GoogleWorkspaceTypes";
import { MINIMAL_SCOPES, missingScopes } from "./GoogleWorkspaceScopes";

const TOKEN_STORAGE_KEY = "gws_token_v1";

// ── Persisted token store (mirrors GoogleAuthSession pattern) ─────────────────

function _loadRaw(): Record<string, GWSToken> {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function _saveRaw(data: Record<string, GWSToken>): void {
  try { localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(data)); } catch { /* non-blocking */ }
}

// ── Auth layer ────────────────────────────────────────────────────────────────

class GoogleWorkspaceAuthClass {
  /**
   * Store a token received from the OAuth exchange backend function.
   */
  storeToken(userId: string, token: GWSToken): void {
    const all = _loadRaw();
    all[userId] = token;
    _saveRaw(all);
  }

  /**
   * Retrieve the stored token for a user.
   */
  getToken(userId: string): GWSToken | null {
    return _loadRaw()[userId] ?? null;
  }

  /**
   * Check if the user has a valid (non-expired) token.
   */
  isAuthenticated(userId: string): boolean {
    const token = this.getToken(userId);
    if (!token) return false;
    return Date.now() < token.expiresAt - 60_000; // 1 min buffer
  }

  /**
   * Check if the token covers all scopes required for a given service.
   */
  hasServiceAccess(userId: string, serviceId: GWSServiceId): boolean {
    const token = this.getToken(userId);
    if (!token) return false;
    const required = MINIMAL_SCOPES[serviceId];
    return missingScopes(token.scopes, required).length === 0;
  }

  /**
   * Revoke and remove the stored token for a user.
   */
  revokeToken(userId: string): void {
    const all = _loadRaw();
    delete all[userId];
    _saveRaw(all);
  }

  /**
   * Update just the access token portion after a refresh.
   */
  updateAccessToken(userId: string, newAccessToken: string, newExpiresAt: number): void {
    const all = _loadRaw();
    if (!all[userId]) return;
    all[userId] = { ...all[userId], accessToken: newAccessToken, expiresAt: newExpiresAt };
    _saveRaw(all);
  }

  /**
   * Build an Authorization header value from a stored token.
   */
  authHeader(userId: string): string | null {
    const token = this.getToken(userId);
    if (!token) return null;
    return `Bearer ${token.accessToken}`;
  }
}

const _KEY = "__GWS_AUTH__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new GoogleWorkspaceAuthClass();
}
export const GoogleWorkspaceAuth: GoogleWorkspaceAuthClass = (
  globalThis as unknown as Record<string, GoogleWorkspaceAuthClass>
)[_KEY];