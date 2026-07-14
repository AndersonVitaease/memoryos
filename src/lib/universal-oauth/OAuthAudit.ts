/**
 * OAuthAudit.ts — Sprint 6.4.0
 * Append-only audit trail. NEVER logs credentials.
 */

import type { OAuthAuditEntry, OAuthAuditEvent, OAuthProviderName } from "./OAuthTypes";
import { OAuthSecurity } from "./OAuthSecurity";

let _seq = 0;
function makeId(): string { return `oaa_${Date.now()}_${++_seq}`; }

export class OAuthAudit {
  private _entries: OAuthAuditEntry[] = [];
  private readonly _security = new OAuthSecurity();

  record(
    event: OAuthAuditEvent,
    provider: OAuthProviderName | "SYSTEM",
    sessionId: string | null,
    scopes: string[],
    result: "SUCCESS" | "FAIL" | "INFO",
    durationMs: number,
    detail: string,
  ): OAuthAuditEntry {
    // Security: assert detail doesn't contain credentials
    const sanitizedDetail = this._sanitizeDetail(detail);

    const entry: OAuthAuditEntry = {
      id: makeId(),
      timestamp: Date.now(),
      event, provider, sessionId, scopes,
      result, durationMs,
      detail: sanitizedDetail,
    };
    this._entries.push(entry);
    return entry;
  }

  private _sanitizeDetail(detail: string): string {
    const check = this._security.assertClean(detail);
    if (!check.clean) {
      return `[AUDIT SANITIZED — ${check.violations.length} credential pattern(s) removed]`;
    }
    return detail;
  }

  all(): OAuthAuditEntry[] { return [...this._entries]; }
  recent(n = 50): OAuthAuditEntry[] { return this._entries.slice(-n).reverse(); }
  count(): number { return this._entries.length; }

  byProvider(provider: OAuthProviderName): OAuthAuditEntry[] {
    return this._entries.filter(e => e.provider === provider);
  }

  byEvent(event: OAuthAuditEvent): OAuthAuditEntry[] {
    return this._entries.filter(e => e.event === event);
  }
}