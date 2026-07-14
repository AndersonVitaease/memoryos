/**
 * GoogleTokenExchange.ts — Sprint 6.4.1
 * Handles authorization code → token exchange via UOP.
 * All token storage goes through OAuthTokenManager (never raw).
 */

import { UOP } from "../universal-oauth/UniversalOAuthPlatform";
import type { GoogleTokenResponse } from "./GoogleIdentityTypes";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export class GoogleTokenExchange {
  /**
   * Exchange an authorization code for tokens.
   * In Sprint 6.4.1: infrastructure is wired, actual HTTP call requires
   * a backend function (client_secret must not be in browser code).
   * Returns metadata only — tokens stored internally in UOP.TokenManager.
   */
  async exchange(
    sessionId: string,
    code: string,
    codeVerifier: string,
    clientId: string,
    redirectUri: string,
  ): Promise<{ success: boolean; tokenResponse: GoogleTokenResponse | null; error?: string }> {
    // In production: POST to a backend function that holds client_secret
    // The backend exchanges code → tokens and returns only metadata
    // For Sprint 6.4.1: simulate the exchange structure
    try {
      const issuedAt = Date.now();
      const expiresIn = 3600; // 1 hour

      // Simulate token receipt — in 6.4.2+ backend function performs real exchange
      const tokenResponse: GoogleTokenResponse = {
        tokenType:       "Bearer",
        expiresIn,
        scope:           "openid email profile",
        hasRefreshToken: true,
        issuedAt,
      };

      // Store masked reference in UOP token manager
      const fakeAccessToken  = `ya29.simulated_${sessionId.slice(-8)}_${issuedAt}`;
      const fakeRefreshToken = `1//simulated_refresh_${sessionId.slice(-8)}`;
      const expiresAt = issuedAt + expiresIn * 1000;

      UOP.tokenManager.store(sessionId, "google", "access",  fakeAccessToken,  expiresAt, ["openid", "email", "profile"]);
      UOP.tokenManager.store(sessionId, "google", "refresh", fakeRefreshToken, null,      ["openid", "email", "profile"]);

      return { success: true, tokenResponse };
    } catch (err) {
      return { success: false, tokenResponse: null, error: String(err) };
    }
  }

  /**
   * Revoke a token via Google's revocation endpoint.
   * Sprint 6.4.1: infrastructure stub — actual HTTP in backend function.
   */
  async revoke(sessionId: string): Promise<boolean> {
    UOP.tokenManager.invalidate(sessionId);
    return true;
  }
}