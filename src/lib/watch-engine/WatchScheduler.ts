/**
 * WatchScheduler.ts — Orquestrador de execução por prioridade
 *
 * Sprint WE-02 | RFC-005 | ADR-012 | EPIC-017 FEAT-113
 *
 * Responsabilidade única: encontrar Watches prontos para execução,
 * ordená-los por prioridade, executar via WatchEvaluator e persistir
 * os resultados — incluindo criação de PendingWatchAction no Outbox.
 *
 * ADR-012 §3: fila por prioridade — critical > high > normal > low.
 * ADR-012 §6: Circuit Breaker — 3 falhas consecutivas → status "error".
 * Não modifica nenhum arquivo fora de src/lib/watch-engine/.
 */

import { base44 } from "@/api/base44Client";
import { watchEvaluator } from "./WatchEvaluator";
import type { WatchRecord, WatchPriority } from "./WatchTypes";

// ── Ordenação por prioridade ──────────────────────────────────────────────────

const PRIORITY_ORDER: Record<WatchPriority, number> = {
  critical: 0,
  high:     1,
  normal:   2,
  low:      3,
};

function sortByPriority(watches: WatchRecord[]): WatchRecord[] {
  return [...watches].sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99),
  );
}

// ── SchedulerRun result ───────────────────────────────────────────────────────

export interface SchedulerRunResult {
  readonly processed:  number;
  readonly triggered:  number;
  readonly failed:     number;
  readonly skipped:    number;
  readonly durationMs: number;
}

// ── WatchScheduler ────────────────────────────────────────────────────────────

class WatchSchedulerClass {
  private _isRunning  = false;
  private _runCount   = 0;
  private _lastRunAt  = 0;

  // ── tick — chamado externamente (ex: workflow scheduled ou polling) ────────

  async tick(): Promise<SchedulerRunResult> {
    if (this._isRunning) {
      return Object.freeze({ processed: 0, triggered: 0, failed: 0, skipped: 1, durationMs: 0 });
    }

    this._isRunning = true;
    const t0 = Date.now();
    let processed = 0, triggered = 0, failed = 0, skipped = 0;

    try {
      // 1. Buscar Watches ativos com next_execution_at <= agora
      const now = new Date().toISOString();
      const candidates = await base44.entities.Watch.filter(
        { status: "active" }, "-next_execution_at", 200,
      ) as WatchRecord[];

      // Filtra os que já venceram o prazo
      const due = candidates.filter(
        (w) => !w.next_execution_at || w.next_execution_at <= now,
      );

      if (due.length === 0) {
        return Object.freeze({ processed: 0, triggered: 0, failed: 0, skipped: 0, durationMs: Date.now() - t0 });
      }

      // 2. Ordenar por prioridade
      const ordered = sortByPriority(due);

      // 3. Executar em série (respeita rate limits por provider)
      for (const watch of ordered) {
        const execResult = await this._executeWatch(watch);
        processed++;
        if (execResult.triggered) triggered++;
        if (execResult.failed)    failed++;
        if (execResult.skipped)   skipped++;
      }

      this._runCount++;
      this._lastRunAt = Date.now();
    } catch (err) {
      console.error("[WatchScheduler] Erro no tick:", err);
    } finally {
      this._isRunning = false;
    }

    return Object.freeze({
      processed, triggered, failed, skipped,
      durationMs: Date.now() - t0,
    });
  }

  // ── executeWatch ──────────────────────────────────────────────────────────

  private async _executeWatch(watch: WatchRecord): Promise<{
    triggered: boolean; failed: boolean; skipped: boolean;
  }> {
    const nextAt = new Date(
      Date.now() + watch.frequency_minutes * 60 * 1000,
    ).toISOString();

    let evalResult;
    try {
      evalResult = await watchEvaluator.evaluate(watch);
    } catch (err) {
      // Falha total na avaliação
      const msg = err instanceof Error ? err.message : String(err);
      const newFailures = (watch.consecutive_failures ?? 0) + 1;
      await base44.entities.Watch.update(watch.id, {
        status:               newFailures >= 3 ? "error" : "active",
        consecutive_failures: newFailures,
        error_message:        msg,
        last_execution_at:    new Date().toISOString(),
        next_execution_at:    nextAt,
      });
      await this._saveExecution(watch.id, false, false, [], msg);
      return { triggered: false, failed: true, skipped: false };
    }

    // Atualizar Watch com resultado
    const updateData: Record<string, unknown> = {
      last_evaluation_result: evalResult.result,
      last_execution_at:      new Date().toISOString(),
      next_execution_at:      nextAt,
      consecutive_failures:   0,
      error_message:          null,
    };
    if (evalResult.triggered) {
      updateData.trigger_count = (watch.trigger_count ?? 0) + 1;
    }
    await base44.entities.Watch.update(watch.id, updateData);

    // Salvar WatchExecution
    const providersCalled = Object.keys(evalResult.providerResults);
    await this._saveExecution(
      watch.id,
      evalResult.result,
      evalResult.triggered,
      providersCalled,
      evalResult.error,
      evalResult.durationMs,
      evalResult.providerResults,
    );

    // Se disparou → criar PendingWatchAction no Outbox
    if (evalResult.triggered) {
      await this._enqueueAction(watch, evalResult.result);
    }

    return { triggered: evalResult.triggered, failed: false, skipped: false };
  }

  // ── saveExecution ─────────────────────────────────────────────────────────

  private async _saveExecution(
    watchId:         string,
    result:          boolean,
    triggered:       boolean,
    providersCalled: string[],
    errorMsg?:       string,
    durationMs?:     number,
    providerResults?: unknown,
  ): Promise<void> {
    try {
      await base44.entities.WatchExecution.create({
        watch_id:          watchId,
        status:            errorMsg ? "failure" : "success",
        evaluation_result: result,
        triggered,
        providers_called:  providersCalled,
        provider_results:  providerResults ? JSON.stringify(providerResults) : undefined,
        duration_ms:       durationMs,
        error_message:     errorMsg,
      });
    } catch (err) {
      console.warn("[WatchScheduler] Falha ao salvar WatchExecution:", err);
    }
  }

  // ── enqueueAction — Outbox ────────────────────────────────────────────────

  private async _enqueueAction(watch: WatchRecord, result: boolean): Promise<void> {
    try {
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // +24h
      await base44.entities.PendingWatchAction.create({
        watch_id:     watch.id,
        action_type:  watch.on_trigger_type,
        payload:      JSON.stringify({
          watchId:   watch.id,
          watchName: watch.name,
          result,
          triggeredAt: new Date().toISOString(),
          ...(watch.on_trigger_payload ? JSON.parse(watch.on_trigger_payload) : {}),
        }),
        status:       "pending",
        retry_count:  0,
        max_retries:  3,
        expires_at:   expires,
        session_id:   watch.session_id,
      });
    } catch (err) {
      console.warn("[WatchScheduler] Falha ao enfileirar PendingWatchAction:", err);
    }
  }

  // ── Métricas ──────────────────────────────────────────────────────────────

  getMetrics() {
    return Object.freeze({
      runCount:  this._runCount,
      lastRunAt: this._lastRunAt,
      isRunning: this._isRunning,
    });
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__WATCH_SCHEDULER__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new WatchSchedulerClass();
}

export const watchScheduler: WatchSchedulerClass = (
  globalThis as unknown as Record<string, WatchSchedulerClass>
)[_KEY];

export { WatchSchedulerClass };