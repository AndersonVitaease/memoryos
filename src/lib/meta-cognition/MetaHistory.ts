/**
 * MetaHistory.ts — Sprint EF-54
 *
 * SRP: registrar histórico de todas as reflexões e análises meta-cognitivas.
 * HMR-safe singleton via globalThis.
 */

import type { MetaHistoryEntry, MetaReport } from "./MCTypes";
import { makeMCId } from "./MCTypes";

class MetaHistoryImpl {
  private _entries: MetaHistoryEntry[] = [];

  record(report: MetaReport): MetaHistoryEntry {
    const entry: MetaHistoryEntry = Object.freeze({
      id:                      makeMCId("mhist"),
      recordedAt:              Date.now(),
      goal:                    report.goal,
      biasCount:               report.biases.length,
      consistencyIssues:       report.consistencyIssues.length,
      alternativesConsidered:  report.alternatives.length,
      reasoningQuality:        report.metrics.reasoningQuality,
      metaConfidence:          report.metrics.metaConfidence,
      reportId:                report.id,
    });
    this._entries.push(entry);
    return entry;
  }

  getAll(): readonly MetaHistoryEntry[]   { return this._entries; }
  getLast(n = 20): readonly MetaHistoryEntry[] { return this._entries.slice(-n); }
  clear(): void { this._entries = []; }
}

const G = globalThis as typeof globalThis & { __EF54_MH__?: MetaHistoryImpl };
if (!G.__EF54_MH__) G.__EF54_MH__ = new MetaHistoryImpl();
export const MetaHistory: MetaHistoryImpl = G.__EF54_MH__;