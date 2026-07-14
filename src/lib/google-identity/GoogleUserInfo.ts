/**
 * GoogleUserInfo.ts — Sprint 6.4.1
 * Fetches and caches Google user info after token exchange.
 * Only stores non-sensitive profile data.
 */

import type { GoogleUserInfo } from "./GoogleIdentityTypes";

const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export class GoogleUserInfoService {
  private _cache: Map<string, GoogleUserInfo> = new Map();

  /**
   * Fetch user info from Google.
   * Requires a valid access token (retrieved from UOP.tokenManager internally).
   * Sprint 6.4.1: returns a simulated profile for infrastructure validation.
   */
  async fetch(sessionId: string, accessToken?: string): Promise<GoogleUserInfo | null> {
    // Return cached
    if (this._cache.has(sessionId)) {
      return this._cache.get(sessionId)!;
    }

    try {
      // In 6.4.2+ with real token: fetch from USERINFO_URL
      // For Sprint 6.4.1: return structured demo user info
      const userInfo: GoogleUserInfo = {
        id:         `google_${sessionId.slice(-12)}`,
        email:      "user@example.com",
        name:       "MemoryOS User",
        givenName:  "MemoryOS",
        familyName: "User",
        picture:    "https://www.gstatic.com/webp/gallery/1.webp",
        locale:     "pt-BR",
        verified:   true,
        hd:         undefined,
      };

      this._cache.set(sessionId, userInfo);
      return userInfo;
    } catch {
      return null;
    }
  }

  /**
   * Get cached user info without fetching.
   */
  getCached(sessionId: string): GoogleUserInfo | null {
    return this._cache.get(sessionId) ?? null;
  }

  /**
   * Clear cached user info (e.g. on logout).
   */
  clear(sessionId: string): void {
    this._cache.delete(sessionId);
  }

  clearAll(): void {
    this._cache.clear();
  }
}