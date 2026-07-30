/**
 * LegacyMemoryService.ts — Memory Kernel v1.0
 * Sprint EF-40.8
 *
 * Adapta runMemoryPipeline() ao contrato MemoryService.
 * Nenhuma alteracao funcional. Nenhuma melhoria. Nenhuma mudanca de comportamento.
 * O Legacy funciona exatamente como antes — apenas encapsulado atras do contrato.
 */

import type { MemoryService } from "./MemoryService";
import type { MemoryRequest } from "./MemoryRequest";
import type { MemoryContext, MemoryContextDiagnostics } from "./MemoryContext";

export class LegacyMemoryService implements MemoryService {
  async retrieve(request: MemoryRequest): Promise<MemoryContext> {
    const t0 = Date.now();
    let error: string | null = null;
    let memories = "";
    let sessionSummary = "";
    let sources: Array<{ type: string; id?: string; name?: string }> = [];

    try {
      // Importacao lazy para evitar circular dependencies e garantir HMR
      const { runMemoryPipeline } = await import("@/lib/memoryPipeline");

      const result = await runMemoryPipeline(
        request.userMessage,
        request.sessionId,
        request.projectId ?? undefined,
      );

      memories       = result.context ?? "";
      sessionSummary = result.sessionSummary ?? "";
      sources        = (result.sources ?? []) as Array<{ type: string; id?: string; name?: string }>;
    } catch (e) {
      error = (e as Error).message;
    }

    const durationMs = Date.now() - t0;
    console.log(`[DIAG][LegacyMemoryService] Recuperação de memória levou ${durationMs}ms (${sources.length} fontes, erro: ${error ?? "nenhum"})`);

    const diagnostics: MemoryContextDiagnostics = {
      provider:       "legacy",
      durationMs,
      memoryCount:    sources.length,
      documentCount:  0,
      sources:        sources.map((s) => s.type),
      estimatedTokens: Math.ceil(memories.length / 4),
      authorityScore: null,
      confidenceScore: null,
      coverage:       null,
      gaps:           [],
      duplications:   [],
      error,
      timestamp:      new Date().toISOString(),
    };

    return {
      memories,
      sessionSummary,
      sources,
      entities:       "",
      projects:       "",
      conversations:  "",
      decisions:      "",
      officialLibrary: "",
      citations:      [],
      diagnostics,
    };
  }
}
