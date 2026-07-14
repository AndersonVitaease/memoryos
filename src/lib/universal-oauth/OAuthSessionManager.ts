/**
 * OAuthSessionManager.ts — Sprint 6.4.0
 * Creates, validates, expires, restores, and terminates OAuth sessions.
 */

import type { OAuthSession, OAuthProviderName, OAuthSessionStatus } from "./OAuthTypes";
import type { OAuthRegistry } from "./OAuthRegistry";

export interface SessionCreateOptions {
  provider:       OAuthProviderName;
  userId:         string;
  grantedScopes:  string[];
  requiredScopes: string[];
  expiresAt:      number | null;
  metadata?:      Record<string, string | number | boolean>;
}

export interface SessionValidationResult {
  valid:    boolean;
  expired:  boolean;
  revoked:  boolean;
  missing:  boolean;
  issues:   string[];
}

export class OAuthSessionManager {
  constructor(private readonly _registry: OAuthRegistry) {}

  create(opts: SessionCreateOptions): OAuthSession {
    return this._registry.createSession(
      opts.provider,
      opts.userId,
      opts.grantedScopes,
      opts.requiredScopes,
      opts.expiresAt,
      opts.metadata ?? {},
    );
  }

  validate(sessionId: string): SessionValidationResult {
    const s = this._registry.getSession(sessionId);
    if (!s) return { valid: false, expired: false, revoked: false, missing: true, issues: ["Session not found"] };

    const issues: string[] = [];
    const now = Date.now();

    const expired = s.expiresAt !== null && s.expiresAt < now;
    const revoked = s.status === "REVOKED";

    if (expired) issues.push("Session has expired");
    if (revoked) issues.push("Session has been revoked");
    if (s.status === "PENDING") issues.push("Session not yet active");

    // Mark as expired in registry if needed
    if (expired && s.status === "ACTIVE") {
      this._registry.updateSession(sessionId, { status: "EXPIRED", health: "SESSION_EXPIRED" });
    }

    return {
      valid:   !expired && !revoked && issues.length === 0,
      expired, revoked, missing: false, issues,
    };
  }

  expire(sessionId: string): boolean {
    const s = this._registry.getSession(sessionId);
    if (!s) return false;
    this._registry.updateSession(sessionId, {
      status: "EXPIRED",
      health: "SESSION_EXPIRED",
      expiresAt: Date.now(),
    });
    return true;
  }

  restore(session: OAuthSession): OAuthSession | null {
    // Never restore a revoked or expired session
    if (session.status === "REVOKED") return null;
    const now = Date.now();
    if (session.expiresAt !== null && session.expiresAt < now) return null;

    return this._registry.updateSession(session.id, {
      status: "ACTIVE",
      health: "CONNECTED",
      lastValidatedAt: now,
    });
  }

  terminate(sessionId: string): boolean {
    return this._registry.revokeSession(sessionId);
  }

  get(sessionId: string): OAuthSession | null {
    return this._registry.getSession(sessionId);
  }

  all(provider?: OAuthProviderName): OAuthSession[] {
    return this._registry.listSessions(provider);
  }

  active(): OAuthSession[] {
    return this._registry.activeSessions();
  }

  expired(): OAuthSession[] {
    return this._registry.expiredSessions();
  }
}