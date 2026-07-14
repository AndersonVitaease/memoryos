/**
 * GoogleAudit.ts — Sprint 6.4.1
 * Append-only audit trail for Google Identity Provider events.
 * NEVER logs tokens, codes, or secrets.
 */

import type { GoogleAuditEvent } from "./GoogleIdentityTypes";
import { UOP } from "../universal-oauth/UniversalOAuthPlatform";

let _seq = 0;
function makeId(): string { return `gia_${Date.now()}_${++_seq}`; }

const FORBIDDEN = ["access_token", "refresh_token", "code", "client_secret", "id_token", "token=", "secret"];

function sanitize(detail: string): string {
  const lower = detail.toLowerCase();
  if (FORBIDDEN.some(f => lower.includes(f))) {
    return "[SANITIZED — credential pattern detected]";
  }
  return detail;
}

export class GoogleAudit {
  private _entries: GoogleAuditEvent[] = [];

  record(
    event: GoogleAuditEvent["event"],
    sessionId: string | null,
    scopes: string[],
    result: "SUCCESS" | "FAIL" | "INFO",
    durationMs: number,
    detail: string,
  ): GoogleAuditEvent {
    const entry: GoogleAuditEvent = {
      id:        makeId(),
      timestamp: Date.now(),
      event,
      sessionId,
      scopes,
      result,
      durationMs,
      detail: sanitize(detail),
    };
    this._entries.push(entry);

    // Mirror to UOP audit for unified audit trail
    UOP.audit.record(
      "SESSION_CREATED", // map to closest UOP event
      "google",
      sessionId,
      scopes,
      result === "SUCCESS" ? "SUCCESS" : result === "FAIL" ? "FAIL" : "INFO",
      durationMs,
      `[GIP] ${event}: ${sanitize(detail)}`,
    );

    return entry;
  }

  all(): GoogleAuditEvent[] { return [...this._entries]; }
  recent(n = 50): GoogleAuditEvent[] { return this._entries.slice(-n).reverse(); }
  count(): number { return this._entries.length; }

  byEvent(event: GoogleAuditEvent["event"]): GoogleAuditEvent[] {
    return this._entries.filter(e => e.event === event);
  }
}