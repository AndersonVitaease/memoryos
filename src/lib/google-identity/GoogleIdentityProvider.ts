/**
 * GoogleIdentityProvider.ts — Sprint 6.4.1
 * Registers the Google provider with the Universal OAuth Platform.
 */

import { UOP } from "../universal-oauth/UniversalOAuthPlatform";
import type { OAuthProviderConfig } from "../universal-oauth/OAuthTypes";

export const GOOGLE_PROVIDER_CONFIG: OAuthProviderConfig = {
  name: "google",
  displayName: "Google",
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl:         "https://oauth2.googleapis.com/token",
  refreshUrl:       "https://oauth2.googleapis.com/token",
  userInfoUrl:      "https://www.googleapis.com/oauth2/v2/userinfo",
  supportedScopes: [
    "openid",
    "email",
    "profile",
    // Extended scopes — added per connector sprint
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/tasks.readonly",
  ],
  supportedGrants: ["authorization_code", "refresh_token"],
  supportsRefresh: true,
  supportsRevoke:  true,
  iconEmoji: "🔵",
  color: "blue",
};

// Sprint 6.4.1 — Identity-only scopes
export const GIP_IDENTITY_SCOPES = ["openid", "email", "profile"] as const;

export class GoogleIdentityProvider {
  private _registered = false;

  register(): void {
    if (this._registered) return;
    // Ensure Google provider is present in UOP registry
    UOP.registry.registerProvider(GOOGLE_PROVIDER_CONFIG);
    this._registered = true;
  }

  isRegistered(): boolean {
    return this._registered || UOP.registry.hasProvider("google");
  }

  getConfig(): OAuthProviderConfig {
    return GOOGLE_PROVIDER_CONFIG;
  }

  getIdentityScopes(): string[] {
    return [...GIP_IDENTITY_SCOPES];
  }
}