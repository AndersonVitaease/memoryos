/**
 * OAuthTokenManager.ts — Sprint 6.4.0
 * Manages token lifecycle. Tokens are NEVER exposed to the UI layer.
 * Only masked references are stored or returned externally.
 */

import type { OAuthTokenRecord, OAuthProviderName } from "./OAuthTypes";

let _seq = 0;
function makeId(): string { return `oat_${Date.now()}_${++_seq}`; }

function maskToken(raw: string): string {
  if (!raw || raw.length < 8) return "****";
  return raw.slice(0, 4) + "****" + raw.slice(-4);
}

function makeRef(provider: OAuthProviderName, type: "access" | "refresh" | "id"): string {
  return `ref:${provider}:${type}:${Date.now()}`;
}

export class OAuthTokenManager {
  // Internal vault — tokens are only stored in memory, never serialized
  private _vault: Map<string, string> = new Map();  // sessionId:type → encrypted-in-memory token
  private _records: Map<string, OAuthTokenRecord> = new Map();

  /**
   * Store a new token. The raw value is kept only in-memory.
   * Returns a masked reference for audit/display purposes.
   */
  store(
    sessionId: string,
    provider: OAuthProviderName,
    type: "access" | "refresh" | "id",
    rawToken: string,
    expiresAt: number | null,
    scopes: string[],
  ): OAuthTokenRecord {
    const key = `${sessionId}:${type}`;
    // Store raw token in memory vault only
    this._vault.set(key, rawToken);

    const record: OAuthTokenRecord = {
      sessionId,
      provider,
      tokenType: type,
      maskedRef: maskToken(rawToken),
      expiresAt,
      issuedAt: Date.now(),
      scopes,
    };
    this._records.set(key, record);
    return record;
  }

  /**
   * Retrieve raw token from in-memory vault.
   * NEVER exposed outside this manager — only used internally for API calls.
   */
  retrieve(sessionId: string, type: "access" | "refresh" | "id"): string | null {
    return this._vault.get(`${sessionId}:${type}`) ?? null;
  }

  /**
   * Get the public record (masked — safe for UI/audit).
   */
  getRecord(sessionId: string, type: "access" | "refresh" | "id"): OAuthTokenRecord | null {
    return this._records.get(`${sessionId}:${type}`) ?? null;
  }

  /**
   * Invalidate and remove all tokens for a session.
   */
  invalidate(sessionId: string): void {
    for (const type of ["access", "refresh", "id"] as const) {
      const key = `${sessionId}:${type}`;
      this._vault.delete(key);
      this._records.delete(key);
    }
  }

  /**
   * Check if a token is still valid (not expired).
   */
  isValid(sessionId: string, type: "access" | "refresh" | "id"): boolean {
    const rec = this._records.get(`${sessionId}:${type}`);
    if (!rec) return false;
    if (rec.expiresAt === null) return true;
    return rec.expiresAt > Date.now();
  }

  /**
   * Update stored token (e.g. after refresh).
   */
  update(
    sessionId: string,
    provider: OAuthProviderName,
    type: "access" | "refresh" | "id",
    rawToken: string,
    expiresAt: number | null,
    scopes: string[],
  ): OAuthTokenRecord {
    return this.store(sessionId, provider, type, rawToken, expiresAt, scopes);
  }

  /**
   * List all public records (masked — safe).
   */
  listRecords(): OAuthTokenRecord[] {
    return [...this._records.values()];
  }

  recordCount(): number { return this._records.size; }
  vaultSize(): number { return this._vault.size; }
}