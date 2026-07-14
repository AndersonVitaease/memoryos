/**
 * OAuthRegistry.ts — Sprint 6.4.0
 * Central registry for all OAuth providers and active sessions.
 */

import type { OAuthProviderConfig, OAuthProviderName, OAuthSession } from "./OAuthTypes";
import { OAUTH_PROVIDERS, listProviders } from "./OAuthProvider";

let _seq = 0;
function makeId(prefix: string): string { return `${prefix}_${Date.now()}_${++_seq}`; }

export class OAuthRegistry {
  private _providers: Map<OAuthProviderName, OAuthProviderConfig> = new Map();
  private _sessions:  Map<string, OAuthSession> = new Map();

  constructor() {
    // Auto-register all built-in providers
    for (const p of listProviders()) {
      this._providers.set(p.name, p);
    }
  }

  // ── Providers ──────────────────────────────────────────────────────────────

  registerProvider(config: OAuthProviderConfig): void {
    this._providers.set(config.name, config);
  }

  getProvider(name: OAuthProviderName): OAuthProviderConfig | null {
    return this._providers.get(name) ?? null;
  }

  listProviders(): OAuthProviderConfig[] {
    return [...this._providers.values()];
  }

  hasProvider(name: OAuthProviderName): boolean {
    return this._providers.has(name);
  }

  providerCount(): number { return this._providers.size; }

  // ── Sessions ───────────────────────────────────────────────────────────────

  createSession(
    provider: OAuthProviderName,
    userId: string,
    grantedScopes: string[],
    requiredScopes: string[],
    expiresAt: number | null,
    metadata: Record<string, string | number | boolean> = {},
  ): OAuthSession {
    const session: OAuthSession = {
      id: makeId("oas"),
      provider,
      userId,
      status: "ACTIVE",
      grantedScopes,
      requiredScopes,
      createdAt: Date.now(),
      expiresAt,
      lastRefreshedAt: null,
      lastValidatedAt: Date.now(),
      metadata,
      health: "CONNECTED",
    };
    this._sessions.set(session.id, session);
    return session;
  }

  getSession(id: string): OAuthSession | null {
    return this._sessions.get(id) ?? null;
  }

  updateSession(id: string, patch: Partial<OAuthSession>): OAuthSession | null {
    const s = this._sessions.get(id);
    if (!s) return null;
    const updated = { ...s, ...patch };
    this._sessions.set(id, updated);
    return updated;
  }

  revokeSession(id: string): boolean {
    const s = this._sessions.get(id);
    if (!s) return false;
    this._sessions.set(id, { ...s, status: "REVOKED", health: "DISCONNECTED" });
    return true;
  }

  listSessions(provider?: OAuthProviderName): OAuthSession[] {
    const all = [...this._sessions.values()];
    return provider ? all.filter(s => s.provider === provider) : all;
  }

  activeSessions(): OAuthSession[] {
    return [...this._sessions.values()].filter(s => s.status === "ACTIVE");
  }

  expiredSessions(): OAuthSession[] {
    const now = Date.now();
    return [...this._sessions.values()].filter(s =>
      s.expiresAt !== null && s.expiresAt < now && s.status !== "REVOKED"
    );
  }

  sessionCount(): number { return this._sessions.size; }
}