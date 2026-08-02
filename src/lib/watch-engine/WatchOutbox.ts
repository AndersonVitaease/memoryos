/**
 * WatchOutbox.ts — Durable Outbox Worker (entrega garantida de ações)
 *
 * Sprint WE-03 | RFC-005 | ADR-012 | EPIC-017 FEAT-114
 *
 * Responsabilidade única: processar PendingWatchAction com retry e TTL.
 * Garante que nenhum disparo se perde mesmo em crash — padrão Outbox.
 *
 * Regras ADR-012:
 * - Máx. 3 retries por ação; após isso → status "failed"
 * - TTL: ações com expires_at no passado → status "expired" sem dispatch
 * - Despacho fire-and-forget: falha nunca bloqueia o worker
 * - Singleton HMR-safe
 */

import { base44 } from "@/api/base44Client";

// ── Dispatcher — extensível sem modificar o Outbox ───────────────────────────

export type ActionDispatcher = (
  actionType: string,
  payload: Record<string, unknown>,
) => Promise<void>;

// ── WorkerResult ──────────────────────────────────────────────────────────────

export interface OutboxWorkerResult {
  readonly processed:  number;
  readonly dispatched: number;
  readonly failed:     number;
  readonly expired:    number;
  readonly durationMs: number;
}

// ── WatchOutbox ───────────────────────────────────────────────────────────────

class WatchOutboxClass {
  private _dispatchers = new Map<string, ActionDispatcher>();
  private _isRunning   = false;
  private _runCount    = 0;

  // ── Registro de dispatchers ───────────────────────────────────────────────

  registerDispatcher(actionType: string, dispatcher: ActionDispatcher): void {
    this._dispatchers.set(actionType, dispatcher);
  }

  // ── processAll — worker principal ─────────────────────────────────────────

  async processAll(): Promise<OutboxWorkerResult> {
    if (this._isRunning) {
      return Object.freeze({ processed: 0, dispatched: 0, failed: 0, expired: 0, durationMs: 0 });
    }
    this._isRunning = true;
    const t0 = Date.now();
    let processed = 0, dispatched = 0, failed = 0, expired = 0;

    try {
      const pending = await base44.entities.PendingWatchAction.filter(
        { status: "pending" }, "created_date", 100,
      ) as Array<Record<string, unknown>>;

      const now = new Date().toISOString();

      for (const action of pending) {
        processed++;

        // TTL check
        if (action.expires_at && (action.expires_at as string) < now) {
          await base44.entities.PendingWatchAction.update(action.id as string, {
            status: "expired",
          });
          expired++;
          continue;
        }

        // Retry limit check
        const retries = (action.retry_count as number) ?? 0;
        const maxRetries = (action.max_retries as number) ?? 3;
        if (retries >= maxRetries) {
          await base44.entities.PendingWatchAction.update(action.id as string, {
            status: "failed",
            error_message: `Max retries (${maxRetries}) atingido`,
          });
          failed++;
          continue;
        }

        // Despachar
        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse((action.payload as string) ?? "{}");
        } catch {
          payload = {};
        }

        const dispatcher = this._dispatchers.get(action.action_type as string)
          ?? this._defaultDispatcher;

        try {
          await dispatcher(action.action_type as string, payload);
          await base44.entities.PendingWatchAction.update(action.id as string, {
            status:        "dispatched",
            dispatched_at: new Date().toISOString(),
          });
          dispatched++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await base44.entities.PendingWatchAction.update(action.id as string, {
            retry_count:   retries + 1,
            error_message: msg,
          });
          // Não marca como failed ainda — próxima rodada tenta de novo
          failed++;
        }
      }

      this._runCount++;
    } catch (err) {
      console.error("[WatchOutbox] Erro no worker:", err);
    } finally {
      this._isRunning = false;
    }

    return Object.freeze({ processed, dispatched, failed, expired, durationMs: Date.now() - t0 });
  }

  // ── Dispatcher padrão (log + notificação interna) ─────────────────────────

  private _defaultDispatcher: ActionDispatcher = async (actionType, payload) => {
    console.log(`[WatchOutbox][dispatch] type=${actionType}`, payload);
    // notify_user: persiste como KnowledgeObservation para surfacing na UI
    if (actionType === "notify_user") {
      try {
        await base44.entities.KnowledgeObservation.create({
          target_object_id:   payload.watchId as string ?? "watch",
          target_object_type: "watch_trigger",
          nature:             "Evidence",
          payload_type:       "watch_trigger",
          data:               JSON.stringify(payload),
          context_scope:      "global",
          session_id:         payload.session_id as string ?? undefined,
          confidence:         1.0,
          producer_id:        "WatchOutbox",
        });
      } catch {
        // fire-and-forget — não propaga
      }
    }
  };

  // ── Métricas ──────────────────────────────────────────────────────────────

  getMetrics() {
    return Object.freeze({
      runCount:            this._runCount,
      isRunning:           this._isRunning,
      registeredDispatchers: this._dispatchers.size,
    });
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__WATCH_OUTBOX__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new WatchOutboxClass();
}

export const watchOutbox: WatchOutboxClass = (
  globalThis as unknown as Record<string, WatchOutboxClass>
)[_KEY];

export { WatchOutboxClass };