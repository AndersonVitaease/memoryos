/**
 * CapabilityAudit.ts — Engineering Sprint 7.0.2
 * Append-only audit log for capability executions.
 * Persisted in localStorage, capped to 1000 entries.
 */

import type { CapabilityAuditEntry, CapabilityState } from "./CapabilityLifecycleTypes";

const STORAGE_KEY = "cap_lifecycle_audit_v1";
const MAX_ENTRIES = 1000;
let _seq = 1;

function _load(): CapabilityAuditEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function _save(entries: CapabilityAuditEntry[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch { /* non-blocking */ }
}

class CapabilityAuditStore {
  record(entry: Omit<CapabilityAuditEntry, "id">): CapabilityAuditEntry {
    const full: CapabilityAuditEntry = {
      id: `cap-audit-${Date.now()}-${(_seq++).toString().padStart(4, "0")}`,
      ...entry,
    };
    const all = _load();
    all.push(full);
    _save(all.length > MAX_ENTRIES ? all.slice(-MAX_ENTRIES) : all);
    return full;
  }

  async wrap<T extends { success?: boolean; ok?: boolean; error?: string | null }>(
    capabilityId: string,
    serviceId: string,
    version: string,
    state: CapabilityState,
    executedBy: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const executedAt = Date.now();
    let success = true;
    let errorCode: string | null = null;
    let errorMsg: string | null = null;
    try {
      const result = await fn();
      success = (result.success ?? result.ok) === true;
      if (!success) errorMsg = result.error ?? null;
      return result;
    } catch (e) {
      success = false;
      errorCode = (e as Record<string, string>)?.code ?? "UNKNOWN";
      errorMsg = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      this.record({ capabilityId, serviceId, version, state, executedBy, executedAt, durationMs: Date.now() - executedAt, success, errorCode, errorMsg });
    }
  }

  forCapability(id: string): CapabilityAuditEntry[] {
    return _load().filter((e) => e.capabilityId === id).reverse();
  }

  all(): CapabilityAuditEntry[] {
    return _load().slice().reverse();
  }

  stats(capabilityId: string): { total: number; success: number; failure: number; avgMs: number } {
    const entries = _load().filter((e) => e.capabilityId === capabilityId);
    const success = entries.filter((e) => e.success).length;
    const totalMs = entries.reduce((s, e) => s + e.durationMs, 0);
    return { total: entries.length, success, failure: entries.length - success, avgMs: entries.length > 0 ? Math.round(totalMs / entries.length) : 0 };
  }

  clear(): void { _save([]); }
}

const _KEY = "__CAP_AUDIT__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new CapabilityAuditStore();
}
export const capabilityAudit: CapabilityAuditStore = (
  globalThis as unknown as Record<string, CapabilityAuditStore>
)[_KEY];