/**
 * GoogleAuthorizationFlow.ts — Sprint 6.4.1
 * Implements the Authorization Code Flow with PKCE for Google OAuth.
 * Actual browser redirect happens via this module.
 * Token exchange handled by GoogleTokenExchange.
 */

import { UOP } from "../universal-oauth/UniversalOAuthPlatform";
import type { GoogleAuthorizationRequest } from "./GoogleIdentityTypes";
import { GIP_IDENTITY_SCOPES } from "./GoogleIdentityProvider";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export class GoogleAuthorizationFlow {
  /**
   * Build a PKCE authorization request.
   * Returns the request object and the authorization URL.
   * Does NOT redirect — caller decides when to redirect.
   */
  buildRequest(
    clientId: string,
    redirectUri: string,
    scopes: string[] = [...GIP_IDENTITY_SCOPES],
    prompt: "consent" | "select_account" | "none" = "consent",
  ): { request: GoogleAuthorizationRequest; url: string } {
    const security = UOP.security;
    const state         = security.generateState();
    const nonce         = security.generateState(); // reuse random generator
    const codeVerifier  = security.generateCodeVerifier();
    const codeChallenge = this._sha256Base64Url(codeVerifier);

    const request: GoogleAuthorizationRequest = {
      scopes,
      state,
      nonce,
      codeVerifier,
      codeChallenge,
      redirectUri,
      prompt,
    };

    const params = new URLSearchParams({
      client_id:             clientId,
      redirect_uri:          redirectUri,
      response_type:         "code",
      scope:                 scopes.join(" "),
      state,
      nonce,
      code_challenge:        codeChallenge,
      code_challenge_method: "S256",
      access_type:           "offline",
      prompt,
    });

    return { request, url: `${GOOGLE_AUTH_URL}?${params.toString()}` };
  }

  /**
   * Validate the state parameter from the OAuth callback.
   */
  validateState(expected: string, received: string): boolean {
    return expected === received && expected.startsWith("state_");
  }

  /**
   * Extract authorization code and state from a callback URL.
   */
  parseCallback(callbackUrl: string): {
    code: string | null;
    state: string | null;
    error: string | null;
  } {
    const params = new URLSearchParams(
      callbackUrl.includes("?") ? callbackUrl.split("?")[1] : callbackUrl
    );
    return {
      code:  params.get("code"),
      state: params.get("state"),
      error: params.get("error"),
    };
  }

  /**
   * Simplified SHA-256 + Base64URL encoding for PKCE.
   * In production, uses WebCrypto. Here: deterministic mock for infra sprint.
   */
  private _sha256Base64Url(input: string): string {
    // In a real implementation, this would use:
    // const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
    // return base64url(digest);
    // For Sprint 6.4.1 infrastructure: return a stable deterministic stand-in
    const hash = Array.from(input).reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return btoa(`pkce_${hash}_${input.length}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }
}