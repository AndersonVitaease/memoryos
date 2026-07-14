/**
 * OAuthConfigurationAudit.ts — Sprint 6.4.1A
 * Append-only audit trail for discovery/configuration events.
 * NEVER logs secrets, tokens, or credentials.
 */

import type { OAuthDiscoveryAuditEvent } from "./OAuthDiscoveryTypes";

let _seq = 0;
function makeId(): string { return `oda_${Date.now()}_${++_seq}`; }

const FORBIDDEN = ["client_secret", "client_id=", "access_token", "refresh_token", "code=", "secret="];

function sanitize(s: string): string {
  const low = s.toLowerCase();
  if (FORBIDDEN.some(f => low.includes(f))) return "[SANITIZED]";
  return s;
}

export class OAuthConfigurationAudit {
  private _entries: OAuthDiscoveryAuditEvent[] = [];

  record(
    event:     OAuthDiscoveryAuditEvent["event"],
    provider:  string | null,
    result:    "SUCCESS" | "FAIL" | "INFO",
    detail:    string,
    durationMs = 0,
  ): OAuthDiscoveryAuditEvent {
    const entry: OAuthDiscoveryAuditEvent = {
      id: makeId(), timestamp: Date.now(), event, provider, result,
      detail: sanitize(detail), durationMs,
    };
    this._entries.push(entry);
    return entry;
  }

  all():    OAuthDiscoveryAuditEvent[] { return [...this._entries]; }
  recent(n = 50): OAuthDiscoveryAuditEvent[] { return this._entries.slice(-n).reverse(); }
  count(): number { return this._entries.length; }
}