/**
 * GoogleDiagnostics.ts — Sprint 6.4.1
 * Runs diagnostics on the Google Identity Provider and active sessions.
 */

import { UOP } from "../universal-oauth/UniversalOAuthPlatform";
import type { GoogleDiagnosticResult, GoogleAuthSession, GoogleHealthState } from "./GoogleIdentityTypes";

export class GoogleDiagnostics {
  run(session: GoogleAuthSession | null): GoogleDiagnosticResult {
    const t0 = Date.now();
    const issues: string[] = [];
    const recommendations: string[] = [];

    // OAuth health
    const oauthHealthy = UOP.registry.hasProvider("google");
    if (!oauthHealthy) {
      issues.push("Google provider not registered in UOP");
      recommendations.push("Call GoogleIdentityProvider.register()");
    }

    if (!session) {
      return {
        sessionId: null, runAt: t0, durationMs: Date.now() - t0,
        oauthHealthy, sessionActive: false, tokenValid: false,
        scopesGranted: [], timeRemaining: null, refreshCapable: false,
        providerReachable: true,
        overall: oauthHealthy ? "DEGRADED" : "DISCONNECTED",
        issues: [...issues, "No active session"],
        recommendations: [...recommendations, "Initiate Google OAuth login"],
      };
    }

    const now = Date.now();

    // Session active
    const sessionActive = session.state === "ACTIVE";
    if (!sessionActive) issues.push(`Session state: ${session.state}`);

    // Token validity
    const tokenValid = UOP.tokenManager.isValid(session.id, "access");
    if (!tokenValid) {
      issues.push("Access token invalid or missing");
      recommendations.push("Trigger token refresh or re-authenticate");
    }

    // Scopes
    const scopesGranted = session.grantedScopes;
    const hasIdentityScopes = ["openid", "email", "profile"].every(s => scopesGranted.includes(s));
    if (!hasIdentityScopes) {
      issues.push("Missing identity scopes");
      recommendations.push("Re-authorize with openid, email, profile scopes");
    }

    // Expiration
    const timeRemaining = session.expiresAt ? session.expiresAt - now : null;
    if (timeRemaining !== null && timeRemaining <= 0) {
      issues.push("Token has expired");
    } else if (timeRemaining !== null && timeRemaining < 300_000) {
      recommendations.push("Token expires soon — schedule refresh");
    }

    // Refresh capability
    const refreshCapable = session.refreshAvailable &&
      UOP.tokenManager.retrieve(session.id, "refresh") !== null;
    if (!refreshCapable && !tokenValid) {
      issues.push("No refresh capability — re-authentication required");
    }

    // Provider reachable (structural check)
    const providerReachable = oauthHealthy;

    const overall: GoogleHealthState =
      issues.length === 0 ? "HEALTHY" :
      issues.some(i => i.includes("expired") || i.includes("invalid")) ? "EXPIRED" :
      "DEGRADED";

    return {
      sessionId: session.id, runAt: t0, durationMs: Date.now() - t0,
      oauthHealthy, sessionActive, tokenValid, scopesGranted,
      timeRemaining, refreshCapable, providerReachable,
      overall, issues, recommendations,
    };
  }
}