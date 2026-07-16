/**
 * ConnectorCertificationHistory.ts — Engineering Sprint E-03.3
 * Permanent, append-only certification run history.
 * Persisted in localStorage for cross-session durability.
 */

import type { CertificationRun, CertificationEvidence } from "./CCCTypes";

const STORAGE_KEY = "memoryos_cert_history_v1";

let _runCounter = 1;

function _load(): Record<string, CertificationRun[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function _save(data: Record<string, CertificationRun[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* storage full — non-blocking */ }
}

// ── History store ─────────────────────────────────────────────────────────────

class CertificationHistoryStore {
  startRun(connectorId: string, version: string, buildId: string, author = "system"): CertificationRun {
    const run: CertificationRun = {
      runId:          `run-${Date.now()}-${(_runCounter++).toString().padStart(4, "0")}`,
      connectorId,
      version,
      state:          "certification_running",
      startedAt:      Date.now(),
      completedAt:    null,
      durationMs:     null,
      author,
      passed:         null,
      failureReasons: [],
      evidence:       null,
      buildId,
    };

    const all = _load();
    (all[connectorId] ??= []).push(run);
    _save(all);
    return run;
  }

  completeRun(
    runId: string,
    connectorId: string,
    passed: boolean,
    evidence: CertificationEvidence | null,
    failureReasons: string[] = [],
  ): CertificationRun | null {
    const all = _load();
    const list = all[connectorId] ?? [];
    const idx  = list.findIndex((r) => r.runId === runId);
    if (idx === -1) return null;

    const run = { ...list[idx] };
    run.completedAt    = Date.now();
    run.durationMs     = run.completedAt - run.startedAt;
    run.passed         = passed;
    run.state          = passed ? "certification_passed" : "certification_failed";
    run.failureReasons = failureReasons;
    run.evidence       = evidence;

    list[idx] = run;
    all[connectorId] = list;
    _save(all);
    return run;
  }

  getHistory(connectorId: string): CertificationRun[] {
    const all = _load();
    return (all[connectorId] ?? []).slice().reverse(); // newest first
  }

  getAllHistory(): Record<string, CertificationRun[]> {
    const all = _load();
    const result: Record<string, CertificationRun[]> = {};
    for (const [id, runs] of Object.entries(all)) {
      result[id] = [...runs].reverse();
    }
    return result;
  }

  getLatestRun(connectorId: string): CertificationRun | null {
    const all = _load();
    const list = all[connectorId] ?? [];
    return list[list.length - 1] ?? null;
  }

  getLatestPassed(connectorId: string): CertificationRun | null {
    const all = _load();
    const list = (all[connectorId] ?? []).slice().reverse();
    return list.find((r) => r.passed === true) ?? null;
  }

  clearHistory(connectorId: string): void {
    const all = _load();
    delete all[connectorId];
    _save(all);
  }

  stats(connectorId: string): { total: number; passed: number; failed: number; passRate: number } {
    const history = this.getHistory(connectorId);
    const passed  = history.filter((r) => r.passed === true).length;
    const failed  = history.filter((r) => r.passed === false).length;
    return {
      total:    history.length,
      passed,
      failed,
      passRate: history.length > 0 ? Math.round((passed / history.length) * 100) : 0,
    };
  }
}

const _HK = "__CERT_HISTORY__";
if (!(globalThis as unknown as Record<string, unknown>)[_HK]) {
  (globalThis as unknown as Record<string, unknown>)[_HK] = new CertificationHistoryStore();
}
export const certHistory: CertificationHistoryStore = (
  globalThis as unknown as Record<string, CertificationHistoryStore>
)[_HK];