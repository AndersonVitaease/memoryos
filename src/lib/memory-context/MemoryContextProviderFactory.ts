/**
 * MemoryContextProviderFactory.ts — EF-40.6
 *
 * MODO LEGACY  — Planner recebe apenas Legacy. UCME nao executa.
 * MODO UCME    — Planner recebe apenas UCME. (Fase futura EF-40.7)
 * MODO SHADOW  — Planner usa Legacy. UCME roda em paralelo para diagnostico.
 *
 * Rollback: alterar MEMORY_CONTEXT_MODE para "LEGACY".
 * Nenhum arquivo precisa ser removido.
 */

import type { MemoryContextMode, ShadowDiagnosticsReport } from "./PlannerContextTypes";
import { LegacyContextProvider, type LegacyContextInput } from "./LegacyContextProvider";
import { UCMEContextProvider, type UCMEContextInput } from "./UCMEContextProvider";

// ── Feature Flag ──────────────────────────────────────────────────────────────
// Alterar apenas aqui para controlar o modo.
// LEGACY | UCME | SHADOW
export const MEMORY_CONTEXT_MODE: MemoryContextMode =
  (typeof window !== "undefined" && (window as unknown as Record<string, string>).__MEMORY_CONTEXT_MODE__ as MemoryContextMode) ??
  "SHADOW";

// ── Shadow Store (in-memory, max 50 reports) ──────────────────────────────────
const _shadowReports: ShadowDiagnosticsReport[] = [];

export const shadowStore = {
  push(report: ShadowDiagnosticsReport): void {
    _shadowReports.unshift(report);
    if (_shadowReports.length > 50) _shadowReports.pop();
  },
  getAll(): readonly ShadowDiagnosticsReport[] {
    return _shadowReports;
  },
  clear(): void {
    _shadowReports.length = 0;
  },
  count(): number {
    return _shadowReports.length;
  },
};

// ── Factory ───────────────────────────────────────────────────────────────────

export interface FactoryInput {
  legacyInput: LegacyContextInput;
  ucmeInput:   UCMEContextInput;
  messageId:   string;
}

export const MemoryContextProviderFactory = {

  /**
   * Executa o provider correto de acordo com o modo configurado.
   * Em SHADOW: retorna o contexto legacy E dispara UCME em paralelo (fire-and-forget).
   * O contexto retornado ao Planner NUNCA e alterado pelo UCME no modo SHADOW.
   */
  async execute(params: FactoryInput): Promise<ReturnType<typeof LegacyContextProvider.build>> {
    const mode = MEMORY_CONTEXT_MODE;

    if (mode === "UCME") {
      // Fase futura EF-40.7 — ainda nao ativada
      return LegacyContextProvider.build(params.legacyInput);
    }

    if (mode === "SHADOW") {
      // Planner recebe SEMPRE o Legacy
      const legacyPromise = LegacyContextProvider.build(params.legacyInput);

      // UCME roda em paralelo — nao bloqueia o Planner
      const ucmePromise = UCMEContextProvider.build(params.ucmeInput).then(async (ucmeCtx) => {
        const legacyCtx = await legacyPromise;
        const legacyDiag = legacyCtx.diagnostics;
        const ucmeDiag   = ucmeCtx.diagnostics;

        const report: ShadowDiagnosticsReport = {
          timestamp: new Date().toISOString(),
          messageId: params.messageId,
          legacy: {
            ...legacyDiag,
            contextLength: (legacyCtx as unknown as Record<string, string>)._rawPrompt?.length ?? legacyCtx.memories.length,
          },
          ucme: {
            ...ucmeDiag,
            contextLength: ucmeCtx.memories.length,
          },
          diff: {
            memoryCountDelta: ucmeDiag.memoryCount   - legacyDiag.memoryCount,
            documentCountDelta: ucmeDiag.documentCount - legacyDiag.documentCount,
            durationDelta:     ucmeDiag.durationMs    - legacyDiag.durationMs,
            sourceDiff: ucmeDiag.sources.filter((s) => !legacyDiag.sources.includes(s)),
            ucmeWider:   ucmeDiag.memoryCount   > legacyDiag.memoryCount,
            ucmeFaster:  ucmeDiag.durationMs    < legacyDiag.durationMs,
          },
        };

        shadowStore.push(report);
      }).catch((e) => {
        // UCME shadow nao deve jamais impactar o Planner
        console.warn("[SHADOW] UCME context provider failed silently:", (e as Error).message);
      });

      // Retorna Legacy imediatamente ao Planner — UCME continua rodando em background
      void ucmePromise;
      return legacyPromise;
    }

    // LEGACY (default)
    return LegacyContextProvider.build(params.legacyInput);
  },

  getMode(): MemoryContextMode {
    return MEMORY_CONTEXT_MODE;
  },

  getShadowReports(): readonly ShadowDiagnosticsReport[] {
    return shadowStore.getAll();
  },
};