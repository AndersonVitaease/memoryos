/**
 * OAuthPersistence.ts — Sprint 6.4.0
 * Integrates with Persistent Runtime to save/restore OAuth sessions.
 * NEVER persists tokens — only session metadata and granted scopes.
 */

import type { OAuthSession, OAuthPersistenceRecord, OAuthProviderName } from "./OAuthTypes";
import type { OAuthRegistry } from "./OAuthRegistry";

const STORAGE_KEY = "uop_sessions_v1";

export interface RestoreResult {
  total:    number;
  restored: number;
  skipped:  number;
  failed:   number;
  log:      string[];
}

export class OAuthPersistence {
  constructor(private readonly _registry: OAuthRegistry) {}

  /**
   * Serialize active sessions to localStorage.
   * NEVER includes tokens.
   */
  save(): void {
    const sessions = this._registry.activeSessions();
    const records: OAuthPersistenceRecord[] = sessions.map(s => ({
      sessionId:       s.id,
      provider:        s.provider,
      status:          s.status,
      grantedScopes:   s.grantedScopes,
      expiresAt:       s.expiresAt,
      lastRefreshedAt: s.lastRefreshedAt,
      metadata:        s.metadata,
    }));

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, savedAt: Date.now() }));
    } catch {
      // Storage might be unavailable — silently skip
    }
  }

  /**
   * Restore sessions from localStorage.
   * Expired sessions are skipped.
   */
  restore(): RestoreResult {
    const log: string[] = [];
    let restored = 0, skipped = 0, failed = 0;

    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch { /* unavailable */ }

    if (!raw) {
      log.push("No persisted sessions found");
      return { total: 0, restored, skipped, failed, log };
    }

    let parsed: { records: OAuthPersistenceRecord[]; savedAt: number };
    try {
      parsed = JSON.parse(raw);
    } catch {
      log.push("Failed to parse persisted sessions");
      return { total: 0, restored, skipped, failed, log };
    }

    const now = Date.now();
    const total = parsed.records.length;

    for (const rec of parsed.records) {
      try {
        // Skip expired sessions
        if (rec.expiresAt !== null && rec.expiresAt < now) {
          log.push(`Skipped expired session: ${rec.sessionId} (${rec.provider})`);
          skipped++;
          continue;
        }
        // Skip revoked sessions
        if (rec.status === "REVOKED" || rec.status === "EXPIRED") {
          log.push(`Skipped ${rec.status.toLowerCase()} session: ${rec.sessionId}`);
          skipped++;
          continue;
        }
        // Restore session (tokens will need re-auth — only metadata is restored)
        this._registry.createSession(
          rec.provider,
          "restored_user",
          rec.grantedScopes,
          [],
          rec.expiresAt,
          { ...rec.metadata, restored: true, originalSessionId: rec.sessionId },
        );
        log.push(`Restored session: ${rec.provider} (${rec.grantedScopes.length} scopes)`);
        restored++;
      } catch (e) {
        log.push(`Failed to restore session ${rec.sessionId}: ${String(e)}`);
        failed++;
      }
    }

    return { total, restored, skipped, failed, log };
  }

  /**
   * Clear all persisted session data.
   */
  clear(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ok */ }
  }

  /**
   * Check if any persisted sessions exist.
   */
  hasPersisted(): boolean {
    try { return !!localStorage.getItem(STORAGE_KEY); }
    catch { return false; }
  }
}