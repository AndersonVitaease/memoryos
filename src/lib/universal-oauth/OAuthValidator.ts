/**
 * OAuthValidator.ts — Sprint 6.4.0
 * Validates OAuth sessions, tokens, and provider configurations.
 */

import type { OAuthSession, OAuthProviderConfig } from "./OAuthTypes";
import type { OAuthTokenManager } from "./OAuthTokenManager";

export interface ValidationResult {
  valid:    boolean;
  issues:   string[];
  warnings: string[];
}

export class OAuthValidator {
  constructor(private readonly _tokenManager: OAuthTokenManager) {}

  validateSession(session: OAuthSession): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    const now = Date.now();

    if (session.status === "REVOKED") issues.push("Session is revoked");
    if (session.status === "EXPIRED") issues.push("Session is expired");
    if (session.expiresAt !== null && session.expiresAt < now) issues.push("Token has expired");
    if (session.grantedScopes.length === 0) warnings.push("No scopes granted");

    const missingRequired = session.requiredScopes.filter(
      r => !session.grantedScopes.includes(r)
    );
    if (missingRequired.length > 0) {
      issues.push(`Missing required scopes: ${missingRequired.join(", ")}`);
    }

    // Check if access token is available
    if (!this._tokenManager.isValid(session.id, "access")) {
      warnings.push("Access token missing or expired — refresh required");
    }

    // Warn if expires soon (within 5 minutes)
    if (session.expiresAt !== null && session.expiresAt - now < 300_000 && session.expiresAt > now) {
      warnings.push("Session expires in less than 5 minutes");
    }

    return { valid: issues.length === 0, issues, warnings };
  }

  validateProvider(config: OAuthProviderConfig): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];

    if (!config.authorizationUrl) issues.push("Missing authorizationUrl");
    if (!config.tokenUrl) issues.push("Missing tokenUrl");
    if (config.supportedScopes.length === 0) warnings.push("No scopes defined");
    if (config.supportedGrants.length === 0) issues.push("No grant types defined");

    return { valid: issues.length === 0, issues, warnings };
  }

  validateScopes(granted: string[], required: string[]): ValidationResult {
    const grantedSet = new Set(granted);
    const missing = required.filter(r => !grantedSet.has(r));
    return {
      valid: missing.length === 0,
      issues: missing.map(m => `Required scope missing: ${m}`),
      warnings: [],
    };
  }
}