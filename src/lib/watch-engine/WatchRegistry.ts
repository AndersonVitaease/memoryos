/**
 * WatchRegistry.ts — CRUD de Watches com validação e Dry Run
 *
 * Sprint WE-01 | RFC-005 | ADR-012 | EPIC-017 FEAT-110
 *
 * Responsabilidade única: criar, listar, pausar, retomar e deletar Watches.
 * Não executa avaliação — essa é responsabilidade do WatchEvaluator (WE-02).
 * Não dispara eventos — essa é responsabilidade do WatchOutbox (WE-03).
 *
 * Padrões obrigatórios (ADR-012):
 * - Singleton HMR-safe via globalThis
 * - Falha de compilação → status "invalid", nunca persiste Watch quebrado
 * - Dry Run verifica providers antes de persistir
 * - Zero modificação em arquivos existentes fora de src/lib/watch-engine/
 */

import { base44 } from "@/api/base44Client";
import {
  validateWatchIntent,
  serializeConditionTree,
  deserializeConditionTree,
} from "./WatchValidator";
import type {
  WatchIntent,
  WatchCreateResult,
  WatchListResult,
  WatchRecord,
  WatchValidationResult,
  DryRunResult,
  WatchRegistryMetrics,
  WatchStatus,
} from "./WatchTypes";

// ── WatchRegistry ─────────────────────────────────────────────────────────────

class WatchRegistryClass {
  private _totalCreated = 0;
  private _totalInvalid = 0;

  // ── create ──────────────────────────────────────────────────────────────────

  /**
   * Cria um Watch após validação e Dry Run.
   * Retorna { ok: false } com erros se inválido — nunca lança exceção.
   */
  async create(intent: WatchIntent): Promise<WatchCreateResult> {
    // 1. Validação estática
    const validation = validateWatchIntent(intent);
    if (!validation.valid) {
      this._totalInvalid++;
      return Object.freeze({
        ok: false,
        error: "Validação falhou",
        validationErrors: validation.errors,
      });
    }

    // 2. Dry Run — verifica acessibilidade dos providers
    const dryRun = await this._dryRun(intent);
    if (!dryRun.passed) {
      const unavailable = dryRun.providerChecks
        .filter((c) => !c.available)
        .map((c) => `${c.provider}: ${c.reason ?? "indisponível"}`)
        .join("; ");
      return Object.freeze({
        ok: false,
        error: `Dry Run falhou — providers indisponíveis: ${unavailable}`,
      });
    }

    // 3. Compilação antecipada — detecta erros de lógica antes de persistir
    // O compilador real vive no WatchEvaluator (WE-02). Aqui apenas
    // verificamos que a ConditionTree é deserializável e tem estrutura válida.
    const conditionJson = serializeConditionTree(intent.condition);
    const deserialized = deserializeConditionTree(conditionJson);
    if (!deserialized) {
      this._totalInvalid++;
      return Object.freeze({
        ok: false,
        error: "Falha ao serializar ConditionTree — estrutura inválida",
      });
    }

    // 4. Calcular próxima execução
    // Para clock: executar imediatamente (next_execution_at = agora) para que o
    // scheduler avalie já no próximo tick, sem esperar frequency_minutes.
    const now = new Date();
    const isClock = (intent.condition as any)?.provider === 'clock';
    const nextExecution = isClock ? now : new Date(now.getTime() + intent.frequency_minutes * 60 * 1000);

    // 5. Persistir
    try {
      const record = await base44.entities.Watch.create({
        name: intent.name,
        description: intent.description ?? "",
        condition_tree: conditionJson,
        frequency_minutes: intent.frequency_minutes,
        priority: intent.priority,
        status: "active",
        on_trigger_type: intent.on_trigger.type,
        on_trigger_payload: intent.on_trigger.payload
          ? JSON.stringify(intent.on_trigger.payload)
          : undefined,
        last_evaluation_result: false,
        consecutive_failures: 0,
        trigger_count: 0,
        next_execution_at: nextExecution.toISOString(),
        compiled_at: now.toISOString(),
        session_id: intent.session_id,
        project_id: intent.project_id,
      });

      this._totalCreated++;
      console.log(`[WatchRegistry] Watch criado: ${record.id} — "${intent.name}"`);

      return Object.freeze({ ok: true, watchId: record.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[WatchRegistry] Falha ao persistir Watch:`, msg);
      return Object.freeze({ ok: false, error: `Erro ao persistir: ${msg}` });
    }
  }

  // ── list ─────────────────────────────────────────────────────────────────────

  async list(filters?: {
    status?: WatchStatus;
    session_id?: string;
    project_id?: string;
    limit?: number;
  }): Promise<WatchListResult> {
    try {
      const query: Record<string, unknown> = {};
      if (filters?.status) query.status = filters.status;
      if (filters?.session_id) query.session_id = filters.session_id;
      if (filters?.project_id) query.project_id = filters.project_id;

      const records = Object.keys(query).length > 0
        ? await base44.entities.Watch.filter(query, "-created_date", filters?.limit ?? 100)
        : await base44.entities.Watch.list("-created_date", filters?.limit ?? 100);

      return Object.freeze({
        watches: Object.freeze(records as WatchRecord[]),
        total: records.length,
      });
    } catch (err) {
      console.error("[WatchRegistry] Falha ao listar Watches:", err);
      return Object.freeze({ watches: Object.freeze([]), total: 0 });
    }
  }

  // ── get ──────────────────────────────────────────────────────────────────────

  async get(watchId: string): Promise<WatchRecord | null> {
    try {
      return (await base44.entities.Watch.get(watchId)) as WatchRecord ?? null;
    } catch {
      return null;
    }
  }

  // ── pause ────────────────────────────────────────────────────────────────────

  async pause(watchId: string): Promise<boolean> {
    try {
      await base44.entities.Watch.update(watchId, { status: "paused" });
      console.log(`[WatchRegistry] Watch pausado: ${watchId}`);
      return true;
    } catch (err) {
      console.error(`[WatchRegistry] Falha ao pausar Watch ${watchId}:`, err);
      return false;
    }
  }

  // ── resume ───────────────────────────────────────────────────────────────────

  async resume(watchId: string): Promise<boolean> {
    try {
      const watch = await this.get(watchId);
      if (!watch) return false;
      // Só retoma se estava pausado ou em erro (não se inválido)
      if (watch.status === "invalid") {
        console.warn(`[WatchRegistry] Watch ${watchId} está inválido — não pode ser retomado`);
        return false;
      }
      const nextExecution = new Date(
        Date.now() + watch.frequency_minutes * 60 * 1000,
      ).toISOString();
      await base44.entities.Watch.update(watchId, {
        status: "active",
        consecutive_failures: 0,
        next_execution_at: nextExecution,
        error_message: null,
      });
      console.log(`[WatchRegistry] Watch retomado: ${watchId}`);
      return true;
    } catch (err) {
      console.error(`[WatchRegistry] Falha ao retomar Watch ${watchId}:`, err);
      return false;
    }
  }

  // ── delete ───────────────────────────────────────────────────────────────────

  async delete(watchId: string): Promise<boolean> {
    try {
      await base44.entities.Watch.delete(watchId);
      console.log(`[WatchRegistry] Watch deletado: ${watchId}`);
      return true;
    } catch (err) {
      console.error(`[WatchRegistry] Falha ao deletar Watch ${watchId}:`, err);
      return false;
    }
  }

  // ── metrics ──────────────────────────────────────────────────────────────────

  async getMetrics(): Promise<WatchRegistryMetrics> {
    try {
      const [active, paused, errored, invalid] = await Promise.all([
        base44.entities.Watch.filter({ status: "active" }, "-created_date", 1000),
        base44.entities.Watch.filter({ status: "paused" }, "-created_date", 1000),
        base44.entities.Watch.filter({ status: "error" }, "-created_date", 1000),
        base44.entities.Watch.filter({ status: "invalid" }, "-created_date", 1000),
      ]);
      const allActive = active as WatchRecord[];
      const totalTriggers = allActive.reduce((sum, w) => sum + (w.trigger_count ?? 0), 0);

      return Object.freeze({
        totalWatches: allActive.length + (paused as WatchRecord[]).length + (errored as WatchRecord[]).length + (invalid as WatchRecord[]).length,
        activeWatches: allActive.length,
        pausedWatches: (paused as WatchRecord[]).length,
        errorWatches: (errored as WatchRecord[]).length,
        invalidWatches: (invalid as WatchRecord[]).length,
        totalTriggers,
      });
    } catch {
      return Object.freeze({
        totalWatches: 0, activeWatches: 0, pausedWatches: 0,
        errorWatches: 0, invalidWatches: 0, totalTriggers: 0,
      });
    }
  }

  // ── Dry Run ──────────────────────────────────────────────────────────────────

  private async _dryRun(intent: WatchIntent): Promise<DryRunResult> {
    // Coleta todos os providers únicos da ConditionTree
    const providers = new Set<string>();
    this._collectProviders(intent.condition, providers);

    const checks = await Promise.all(
      [...providers].map(async (provider) => {
        // Por enquanto: verifica se o provider é um nome válido (não vazio).
        // No Sprint WE-02, o ConnectorGateway fará a verificação real de conectividade.
        const available = Boolean(provider && provider.trim().length > 0);
        return Object.freeze({
          provider,
          available,
          reason: available ? undefined : "Provider inválido ou vazio",
        });
      }),
    );

    return Object.freeze({
      passed: checks.every((c) => c.available),
      providerChecks: Object.freeze(checks),
    });
  }

  private _collectProviders(node: import("./WatchTypes").ConditionTree, set: Set<string>): void {
    if (node.kind === "leaf") {
      set.add(node.provider);
    } else if (node.kind === "AND" || node.kind === "OR") {
      for (const child of node.conditions) {
        this._collectProviders(child, set);
      }
    } else if (node.kind === "NOT") {
      this._collectProviders(node.condition, set);
    }
  }

  // ── Observabilidade ───────────────────────────────────────────────────────────

  getRegistryStats() {
    return Object.freeze({
      totalCreated: this._totalCreated,
      totalInvalid: this._totalInvalid,
    });
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__WATCH_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new WatchRegistryClass();
}

export const watchRegistry: WatchRegistryClass = (
  globalThis as unknown as Record<string, WatchRegistryClass>
)[_KEY];

export { WatchRegistryClass };