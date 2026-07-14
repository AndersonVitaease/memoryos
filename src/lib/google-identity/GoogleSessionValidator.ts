/**
 * GoogleSessionValidator.ts — Sprint 6.4.1
 * Validates Google OAuth sessions via UOP.
 */

import { UOP } from "../universal-oauth/UniversalOAuthPlatform";
import type { GoogleAuthSession } from "./GoogleIdentityTypes";

export interface GoogleSessionValidation {
  valid:           boolean;
  sessionActive:   boolean;
  tokenValid:      boolean;
  scopesGranted:   string[];
  timeRemainingMs: number | null;
  refreshAvailable: boolean;
  issues:          string[];
}

export class GoogleSessionValidator {
  validate(session: GoogleAuthSession): GoogleSessionValidation {
    const issues: string[] = [];
    const now = Date.now();

    // Session state check
    const sessionActive = session.state === "ACTIVE" || session.state === "REFRESHING";
    if (!sessionActive) issues.push(`Session state is ${session.state}`);

    // Token validity
    const tokenValid = UOP.tokenManager.isValid(session.id, "access");
    if (!tokenValid) issues.push("Access token missing or expired");

    // Expiration
    const timeRemainingMs = session.expiresAt ? session.expiresAt - now : null;
    if (timeRemainingMs !== null && timeRemainingMs <= 0) {
      issues.push("Session has expired");
    } else if (timeRemainingMs !== null && timeRemainingMs < 300_000) {
      issues.push("Session expires in less than 5 minutes — refresh recommended");
    }

    // Refresh
    const refreshAvailable = session.refreshAvailable &&
      UOP.tokenManager.retrieve(session.id, "refresh") !== null;

    // Required scopes
    if (!session.grantedScopes.includes("openid")) issues.push("Missing required scope: openid");
    if (!session.grantedScopes.includes("email"))  issues.push("Missing required scope: email");

    return {
      valid: sessionActive && issues.filter(i => !i.includes("less than 5 minutes")).length === 0,
      sessionActive,
      tokenValid,
      scopesGranted: session.grantedScopes,
      timeRemainingMs,
      refreshAvailable,
      issues,
    };
  }
}