/**
 * ConnectorCertificationEvidenceStore.ts — Engineering Sprint E-03.3
 * Stores and retrieves certification evidence per run.
 * Uses localStorage with size-aware truncation.
 */

import type { CertificationEvidence } from "./CCCTypes";

const STORAGE_KEY = "memoryos_cert_evidence_v1";
const MAX_EVIDENCE_PER_CONNECTOR = 10; // keep last 10 runs of evidence

function _load(): Record<string, Record<string, CertificationEvidence>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function _save(data: Record<string, Record<string, CertificationEvidence>>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full — prune oldest entries per connector and retry
    for (const connId of Object.keys(data)) {
      const runs = Object.entries(data[connId]);
      if (runs.length > 3) {
        const trimmed = Object.fromEntries(runs.slice(-3));
        data[connId] = trimmed;
      }
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* give up */ }
  }
}

// ── Evidence Store ─────────────────────────────────────────────────────────────

class EvidenceStore {
  save(connectorId: string, runId: string, evidence: CertificationEvidence): void {
    const all = _load();
    all[connectorId] ??= {};
    all[connectorId][runId] = evidence;

    // Trim to max per connector
    const entries = Object.entries(all[connectorId]);
    if (entries.length > MAX_EVIDENCE_PER_CONNECTOR) {
      all[connectorId] = Object.fromEntries(entries.slice(-MAX_EVIDENCE_PER_CONNECTOR));
    }

    _save(all);
  }

  get(connectorId: string, runId: string): CertificationEvidence | null {
    const all = _load();
    return all[connectorId]?.[runId] ?? null;
  }

  listRunIds(connectorId: string): string[] {
    const all = _load();
    return Object.keys(all[connectorId] ?? {});
  }

  buildEvidence(partial: {
    reportJson: unknown;
    precision:  number;
    recall:     number;
    fpPct:      number;
    fnPct:      number;
    avgMs:      number;
    p95:        number;
    p99:        number;
    phaseLogs?: Record<string, string[]>;
    e2eSteps?:  Array<{ step: string; status: string; detail: string }>;
  }): CertificationEvidence {
    return Object.freeze({
      reportJson:  partial.reportJson,
      perfStats:   { avg: partial.avgMs, p95: partial.p95, p99: partial.p99 },
      precision:   partial.precision,
      recall:      partial.recall,
      fpPct:       partial.fpPct,
      fnPct:       partial.fnPct,
      phaseLogs:   partial.phaseLogs ?? {},
      e2eSteps:    partial.e2eSteps ?? [],
      capturedAt:  Date.now(),
    });
  }
}

const _EK = "__CERT_EVIDENCE__";
if (!(globalThis as unknown as Record<string, unknown>)[_EK]) {
  (globalThis as unknown as Record<string, unknown>)[_EK] = new EvidenceStore();
}
export const evidenceStore: EvidenceStore = (
  globalThis as unknown as Record<string, EvidenceStore>
)[_EK];