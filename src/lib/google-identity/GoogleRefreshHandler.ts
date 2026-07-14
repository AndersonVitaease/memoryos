/**
 * GoogleRefreshHandler.ts — Sprint 6.4.1
 * Handles automatic token refresh via UOP.RefreshManager.
 * On failure: marks session EXPIRED. Never initiates new login.
 */

import { UOP } from "../universal-oauth/UniversalOAuthPlatform";
import type { GoogleAuthSession, GoogleAuthState } from "./GoogleIdentityTypes";

export interface RefreshResult {
  success:     boolean;
  result:      "REFRESHED" | "FAILED" | "NOT_NEEDED" | "SESSION_EXPIRED" | "NO_REFRESH_TOKEN";
  durationMs:  number;
  newExpiresAt?: number;
  error?:      string;
}

export class GoogleRefreshHandler {
  async refresh(session: GoogleAuthSession): Promise<RefreshResult> {
    const t0 = Date.now();

    // Check if refresh is needed
    const now = Date.now();
    const needsRefresh = session.expiresAt !== null && session.expiresAt - now < 300_000;
    if (!needsRefresh && session.state === "ACTIVE") {
      return { success: true, result: "NOT_NEEDED", durationMs: Date.now() - t0 };
    }

    // Check refresh token availability
    const hasRefreshToken = UOP.tokenManager.retrieve(session.id, "refresh") !== null;
    if (!hasRefreshToken) {
      return { success: false, result: "NO_REFRESH_TOKEN", durationMs: Date.now() - t0 };
    }

    try {
      // Delegate to UOP refresh manager
      const attempt = await UOP.refreshManager.refresh(session.id);

      if (attempt.result === "REFRESHED") {
        const newExpiresAt = Date.now() + 3600_000;
        return { success: true, result: "REFRESHED", durationMs: Date.now() - t0, newExpiresAt };
      }

      if (attempt.result === "SESSION_EXPIRED") {
        return { success: false, result: "SESSION_EXPIRED", durationMs: Date.now() - t0 };
      }

      return { success: false, result: "FAILED", durationMs: Date.now() - t0, error: attempt.error };
    } catch (err) {
      return { success: false, result: "FAILED", durationMs: Date.now() - t0, error: String(err) };
    }
  }

  /**
   * Schedule automatic refresh 5 minutes before expiration.
   * Returns the timeout handle (cancel with clearTimeout).
   */
  scheduleAutoRefresh(
    session: GoogleAuthSession,
    onRefresh: (result: RefreshResult) => void,
  ): ReturnType<typeof setTimeout> | null {
    if (!session.expiresAt || !session.refreshAvailable) return null;

    const msUntilRefresh = session.expiresAt - Date.now() - 300_000;
    if (msUntilRefresh <= 0) {
      // Already needs refresh — do it now
      this.refresh(session).then(onRefresh);
      return null;
    }

    return setTimeout(async () => {
      const result = await this.refresh(session);
      onRefresh(result);
    }, msUntilRefresh);
  }
}