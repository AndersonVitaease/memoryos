/**
 * GoogleWorkspaceAuditLogger.ts — Engineering Sprint 7.0
 * Append-only audit log for all Google Workspace API calls.
 * Persisted in localStorage, capped to last 500 entries.
 */

import type { GWSAuditEntry, GWSServiceId } from "./GoogleWorkspaceTypes";

const STORAGE_KEY = "gws_audit_v1";
const MAX_ENTRIES = 500;

let _seq = 1;

function _load(): GWSAuditEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function _save(entries: GWSAuditEntry[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch { /* non-blocking */ }
}

// ── Audit Logger ──────────────────────────────────────────────────────────────

class AuditLoggerClass {
  /**
   * Record a completed API call.
   */
  log(entry: Omit<GWSAuditEntry, "id">): GWSAuditEntry {
    const full: GWSAuditEntry = {
      id: `audit-${Date.now()}-${(_seq++).toString().padStart(4, "0")}`,
      ...entry,
    };

    const all = _load();
    all.push(full);

    // Trim to max
    const trimmed = all.length > MAX_ENTRIES ? all.slice(-MAX_ENTRIES) : all;
    _save(trimmed);
    return full;
  }

  /**
   * Convenience: wrap an async call and auto-log the result.
   */
  async wrap<T>(
    serviceId: GWSServiceId,
    capability: string,
    userId: string,
    requestId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    let success = true;
    let errorCode: string | null = null;
    let errorMsg: string | null  = null;

    try {
      const result = await fn();
      return result;
    } catch (e) {
      success   = false;
      errorCode = (e as Record<string, string>)?.code ?? "UNKNOWN";
      errorMsg  = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      const completedAt = Date.now();
      this.log({
        serviceId,
        capability,
        userId,
        requestId,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        success,
        errorCode,
        errorMsg,
      });
    }
  }

  /**
   * Get all audit entries, newest first.
   */
  all(): GWSAuditEntry[] {
    return _load().slice().reverse();
  }

  /**
   * Filter by service.
   */
  forService(serviceId: GWSServiceId): GWSAuditEntry[] {
    return this.all().filter((e) => e.serviceId === serviceId);
  }

  /**
   * Filter by user.
   */
  forUser(userId: string): GWSAuditEntry[] {
    return this.all().filter((e) => e.userId === userId);
  }

  /**
   * Summary stats per service.
   */
  stats(): Record<GWSServiceId, { total: number; errors: number; avgMs: number }> {
    const all = _load();
    const acc: Record<string, { total: number; errors: number; totalMs: number }> = {};

    for (const e of all) {
      acc[e.serviceId] ??= { total: 0, errors: 0, totalMs: 0 };
      acc[e.serviceId].total++;
      if (!e.success) acc[e.serviceId].errors++;
      acc[e.serviceId].totalMs += e.durationMs;
    }

    const result: Record<string, { total: number; errors: number; avgMs: number }> = {};
    for (const [k, v] of Object.entries(acc)) {
      result[k] = { total: v.total, errors: v.errors, avgMs: v.total > 0 ? Math.round(v.totalMs / v.total) : 0 };
    }
    return result as Record<GWSServiceId, { total: number; errors: number; avgMs: number }>;
  }

  /**
   * Clear all audit logs.
   */
  clear(): void {
    _save([]);
  }
}

const _KEY = "__GWS_AUDIT__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new AuditLoggerClass();
}
export const GoogleWorkspaceAuditLogger: AuditLoggerClass = (
  globalThis as unknown as Record<string, AuditLoggerClass>
)[_KEY];