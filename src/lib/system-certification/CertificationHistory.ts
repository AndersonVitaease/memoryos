/**
 * CertificationHistory.ts — Sprint EF-55
 *
 * SRP: maintain audit history. HMR-safe singleton.
 */

import type { CertificationHistoryEntry, CertificationReport } from "./SCTypes";
import { makeSCId } from "./SCTypes";

class CertificationHistoryImpl {
  private _entries: CertificationHistoryEntry[] = [];

  record(report: CertificationReport): CertificationHistoryEntry {
    const entry: CertificationHistoryEntry = Object.freeze({
      id:             makeSCId("hist"),
      runAt:          Date.now(),
      overallScore:   report.metrics.overallCertificationScore,
      certified:      report.certified,
      reportId:       report.id,
      auditorResults: Object.freeze(
        Object.fromEntries(report.auditResults.map(r => [r.auditor, r.score]))
      ),
    });
    this._entries.push(entry);
    return entry;
  }

  getAll(): readonly CertificationHistoryEntry[]  { return this._entries; }
  getLast(n = 10): readonly CertificationHistoryEntry[] { return this._entries.slice(-n); }
  clear(): void { this._entries = []; }
}

const G = globalThis as typeof globalThis & { __EF55_CH__?: CertificationHistoryImpl };
if (!G.__EF55_CH__) G.__EF55_CH__ = new CertificationHistoryImpl();
export const CertificationHistory: CertificationHistoryImpl = G.__EF55_CH__;