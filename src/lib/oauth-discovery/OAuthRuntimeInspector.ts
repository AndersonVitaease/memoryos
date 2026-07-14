/**
 * OAuthRuntimeInspector.ts — Sprint 6.4.1A
 * Inspects live runtime state of OAuth sessions and providers via UOP.
 */

import { UOP } from "../universal-oauth/UniversalOAuthPlatform";

export interface RuntimeProviderState {
  provider:       string;
  activeSessions: number;
  expiredSessions: number;
  lastLoginAt:    number | null;
  lastErrorAt:    number | null;
  lastError:      string | null;
  tokenExpiresAt: number | null;
  health:         string;
}

export class OAuthRuntimeInspector {
  inspectProvider(provider: string): RuntimeProviderState {
    const sessions = UOP.registry.listSessions(provider as any);
    const active   = sessions.filter(s => s.status === "ACTIVE");
    const expired  = sessions.filter(s => s.status === "EXPIRED");
    const latest   = active.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
    const healthSnap = UOP.health.get(provider as any);

    return {
      provider,
      activeSessions:  active.length,
      expiredSessions: expired.length,
      lastLoginAt:     latest?.createdAt ?? null,
      lastErrorAt:     null, // tracked by GIP audit
      lastError:       null,
      tokenExpiresAt:  latest?.expiresAt ?? null,
      health:          healthSnap?.state ?? "DISCONNECTED",
    };
  }

  inspectAll(providers: string[]): RuntimeProviderState[] {
    return providers.map(p => this.inspectProvider(p));
  }

  totalActiveSessions(): number {
    return UOP.registry.activeSessions().length;
  }
}