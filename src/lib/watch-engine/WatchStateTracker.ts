/**
 * WatchStateTracker.ts — Rastreamento de transições de estado dos Watches
 *
 * Sprint WE-03 | RFC-005 | ADR-012 | EPIC-017 FEAT-115
 *
 * Responsabilidade única: rastrear a história de transições de cada Watch
 * para evitar spam de notificações (só dispara na transição false→true)
 * e fornecer snapshot do estado atual para o Evaluator.
 *
 * Regras ADR-012:
 * - Estado mantido em memória (cache) + persistido via WatchExecution
 * - Snapshot é read-only após criação
 * - Deduplicação: mesmo resultado consecutivo não gera novo trigger
 * - Singleton HMR-safe
 */

import { base44 } from "@/api/base44Client";

// ── StateSnapshot ─────────────────────────────────────────────────────────────

export interface StateSnapshot {
  readonly watchId:           string;
  readonly currentResult:     boolean;
  readonly previousResult:    boolean;
  readonly isTriggered:       boolean;    // transição false→true nesta avaliação
  readonly consecutiveTrue:   number;     // quantas vezes seguidas foi true
  readonly consecutiveFalse:  number;
  readonly lastEvaluatedAt:   number;     // timestamp ms
}

// ── WatchStateTracker ─────────────────────────────────────────────────────────

class WatchStateTrackerClass {
  // Cache em memória para comparação rápida
  private _states = new Map<string, {
    lastResult:       boolean;
    consecutiveTrue:  number;
    consecutiveFalse: number;
    lastEvaluatedAt:  number;
  }>();

  // ── record — chamado pelo WatchScheduler após cada avaliação ─────────────

  record(watchId: string, newResult: boolean): StateSnapshot {
    const prev = this._states.get(watchId) ?? {
      lastResult:       false,
      consecutiveTrue:  0,
      consecutiveFalse: 0,
      lastEvaluatedAt:  0,
    };

    const isTriggered   = !prev.lastResult && newResult;
    const consecutiveTrue  = newResult ? prev.consecutiveTrue + 1 : 0;
    const consecutiveFalse = !newResult ? prev.consecutiveFalse + 1 : 0;
    const now = Date.now();

    const next = { lastResult: newResult, consecutiveTrue, consecutiveFalse, lastEvaluatedAt: now };
    this._states.set(watchId, next);

    return Object.freeze({
      watchId,
      currentResult:    newResult,
      previousResult:   prev.lastResult,
      isTriggered,
      consecutiveTrue,
      consecutiveFalse,
      lastEvaluatedAt:  now,
    });
  }

  // ── getSnapshot — lê estado atual sem mudar nada ─────────────────────────

  getSnapshot(watchId: string): StateSnapshot | null {
    const s = this._states.get(watchId);
    if (!s) return null;
    return Object.freeze({
      watchId,
      currentResult:    s.lastResult,
      previousResult:   s.lastResult,  // sem contexto de "anterior" sem novo record
      isTriggered:      false,
      consecutiveTrue:  s.consecutiveTrue,
      consecutiveFalse: s.consecutiveFalse,
      lastEvaluatedAt:  s.lastEvaluatedAt,
    });
  }

  // ── hydrateFromDB — carrega último resultado dos Watches do banco ─────────

  async hydrateFromDB(): Promise<number> {
    try {
      const watches = await base44.entities.Watch.filter(
        { status: "active" }, "-updated_date", 200,
      ) as Array<Record<string, unknown>>;

      let loaded = 0;
      for (const w of watches) {
        const id = w.id as string;
        if (!this._states.has(id)) {
          this._states.set(id, {
            lastResult:       Boolean(w.last_evaluation_result),
            consecutiveTrue:  0,
            consecutiveFalse: 0,
            lastEvaluatedAt:  w.last_execution_at
              ? new Date(w.last_execution_at as string).getTime()
              : 0,
          });
          loaded++;
        }
      }
      return loaded;
    } catch {
      return 0;
    }
  }

  // ── clear — remove do cache (ex: ao deletar um Watch) ────────────────────

  clear(watchId: string): void {
    this._states.delete(watchId);
  }

  // ── Métricas ──────────────────────────────────────────────────────────────

  getMetrics() {
    let totalTrue = 0, totalFalse = 0;
    for (const s of this._states.values()) {
      if (s.lastResult) totalTrue++;
      else totalFalse++;
    }
    return Object.freeze({
      trackedWatches: this._states.size,
      currentlyTrue:  totalTrue,
      currentlyFalse: totalFalse,
    });
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__WATCH_STATE_TRACKER__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new WatchStateTrackerClass();
}

export const watchStateTracker: WatchStateTrackerClass = (
  globalThis as unknown as Record<string, WatchStateTrackerClass>
)[_KEY];

export { WatchStateTrackerClass };