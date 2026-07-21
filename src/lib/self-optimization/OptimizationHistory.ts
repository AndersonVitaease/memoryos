/**
 * OptimizationHistory.ts — Sprint EF-53
 *
 * SRP: registrar histórico de recomendações — quando surgiram, quando foram
 * aceitas e se produziram melhoria.
 *
 * HMR-safe singleton via globalThis.
 */

import type { OptimizationHistoryEntry, OptimizationRecommendation } from "./SOTypes";
import { makeSOId } from "./SOTypes";

class OptimizationHistoryImpl {
  private _entries: OptimizationHistoryEntry[] = [];

  record(rec: OptimizationRecommendation): OptimizationHistoryEntry {
    const entry: OptimizationHistoryEntry = Object.freeze({
      id:               makeSOId("hist"),
      recommendationId: rec.id,
      target:           rec.target,
      title:            rec.title,
      createdAt:        Date.now(),
      resolvedAt:       null,
      accepted:         null,
      improved:         null,
      notes:            "",
    });
    this._entries.push(entry);
    return entry;
  }

  resolve(entryId: string, accepted: boolean, improved: boolean | null, notes = ""): OptimizationHistoryEntry | null {
    const idx = this._entries.findIndex(e => e.id === entryId);
    if (idx === -1) return null;
    const updated: OptimizationHistoryEntry = Object.freeze({
      ...this._entries[idx],
      resolvedAt: Date.now(),
      accepted,
      improved,
      notes,
    });
    this._entries[idx] = updated;
    return updated;
  }

  getAll(): readonly OptimizationHistoryEntry[] { return this._entries; }
  getPending(): readonly OptimizationHistoryEntry[] { return this._entries.filter(e => e.accepted === null); }
  getAccepted(): readonly OptimizationHistoryEntry[] { return this._entries.filter(e => e.accepted === true); }
  clear(): void { this._entries = []; }
}

const G = globalThis as typeof globalThis & { __EF53_HIST__?: OptimizationHistoryImpl };
if (!G.__EF53_HIST__) G.__EF53_HIST__ = new OptimizationHistoryImpl();
export const OptimizationHistory: OptimizationHistoryImpl = G.__EF53_HIST__;