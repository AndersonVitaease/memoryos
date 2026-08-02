/**
 * WatchCognitiveBridge.ts — Integração do Watch Engine com o pipeline cognitivo
 *
 * Sprint WE-03 | RFC-005 | ADR-012 | EPIC-017 FEAT-116
 *
 * Responsabilidade única: expor o Watch Engine ao Planner/Orchestrator
 * via interface estrita, sem nenhum acoplamento direto com módulos do Core.
 *
 * O Planner pode:
 * - Criar Watches a partir de intenções do usuário (ex: "me avise quando...")
 * - Listar Watches ativos de uma sessão
 * - Rodar o ciclo completo: Scheduler → Outbox em uma única chamada
 *
 * Zero importação de arquivos fora de src/lib/watch-engine/ neste módulo.
 */

import { watchRegistry } from "./WatchRegistry";
import { watchScheduler } from "./WatchScheduler";
import { watchOutbox } from "./WatchOutbox";
import { watchStateTracker } from "./WatchStateTracker";
import type { WatchIntent, WatchCreateResult, WatchListResult } from "./WatchTypes";

// ── WatchCycleResult — resultado de um ciclo completo ────────────────────────

export interface WatchCycleResult {
  readonly schedulerProcessed: number;
  readonly schedulerTriggered: number;
  readonly outboxDispatched:   number;
  readonly outboxFailed:       number;
  readonly durationMs:         number;
}

// ── WatchCognitiveBridge ──────────────────────────────────────────────────────

class WatchCognitiveBridgeClass {
  private _initialized = false;

  // ── init — hidratar state tracker na inicialização ───────────────────────

  async init(): Promise<void> {
    if (this._initialized) return;
    try {
      const loaded = await watchStateTracker.hydrateFromDB();
      console.log(`[WatchCognitiveBridge] Hydrated ${loaded} watch states from DB`);
      this._initialized = true;
    } catch (err) {
      console.warn("[WatchCognitiveBridge] Hydration falhou (não crítico):", err);
    }
  }

  // ── createFromIntent — chamado pelo Planner quando detecta "me avise quando..." ──

  async createFromIntent(intent: WatchIntent): Promise<WatchCreateResult> {
    return watchRegistry.create(intent);
  }

  // ── listForSession ────────────────────────────────────────────────────────

  async listForSession(sessionId: string): Promise<WatchListResult> {
    return watchRegistry.list({ session_id: sessionId, limit: 50 });
  }

  // ── runCycle — executa Scheduler + Outbox em sequência ───────────────────

  async runCycle(): Promise<WatchCycleResult> {
    const t0 = Date.now();

    const schedResult = await watchScheduler.tick();
    const outboxResult = await watchOutbox.processAll();

    return Object.freeze({
      schedulerProcessed: schedResult.processed,
      schedulerTriggered: schedResult.triggered,
      outboxDispatched:   outboxResult.dispatched,
      outboxFailed:       outboxResult.failed,
      durationMs:         Date.now() - t0,
    });
  }

  // ── getSystemStatus — snapshot completo do Watch Engine ──────────────────

  async getSystemStatus() {
    const [registryMetrics, schedulerMetrics, outboxMetrics, trackerMetrics] =
      await Promise.all([
        watchRegistry.getMetrics(),
        Promise.resolve(watchScheduler.getMetrics()),
        Promise.resolve(watchOutbox.getMetrics()),
        Promise.resolve(watchStateTracker.getMetrics()),
      ]);

    return Object.freeze({
      registry:  registryMetrics,
      scheduler: schedulerMetrics,
      outbox:    outboxMetrics,
      tracker:   trackerMetrics,
      initialized: this._initialized,
    });
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__WATCH_COGNITIVE_BRIDGE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new WatchCognitiveBridgeClass();
}

export const watchCognitiveBridge: WatchCognitiveBridgeClass = (
  globalThis as unknown as Record<string, WatchCognitiveBridgeClass>
)[_KEY];

export { WatchCognitiveBridgeClass };