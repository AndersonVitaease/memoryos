/**
 * UCMEMemoryService.ts — Memory Kernel v1.0
 * Sprint EF-40.8
 *
 * Adapta UnifiedMemoryEngine ao contrato MemoryService.
 * NÃO implementa novos Providers.
 * NÃO adiciona dados novos.
 * Somente adapta o contrato existente do UCME para MemoryContext.
 */

import type { MemoryService } from "./MemoryService";
import type { MemoryRequest } from "./MemoryRequest";
import type { MemoryContext, MemoryContextDiagnostics } from "./MemoryContext";

export class UCMEMemoryService implements MemoryService {
  async retrieve(request: MemoryRequest): Promise<MemoryContext> {
    const t0 = Date.now();
    let error: string | null = null;
    let memories = "";
    let sessionSummary = "";
    let citations: string[] = [];
    let memoryCount = 0;
    let documentCount = 0;
    let providerSources: string[] = [];
    let authorityScore: number | null = null;
    let confidenceScore: number | null = null;
    let coverage: number | null = null;

    try {
      const { MemoryContextBuilder } = await import("@/lib/ucme/MemoryContextBuilder");

      const result = await MemoryContextBuilder.build(request.userMessage, {
        intent:     request.options?.intent,
        providers:  request.options?.providers ? [...request.options.providers] : undefined,
        maxResults: request.options?.maxResults ?? 10,
        timeoutMs:  request.options?.timeoutMs ?? 5000,
        traceId:    request.options?.traceId,
        projectId:  request.projectId ?? null,
        sessionId:  request.sessionId,
      });

      memories = result.prompt ?? "";
      const evidence = (result.result?.evidence ?? []) as Array<{
        sourceType?: string;
        providerName?: string;
        confidence?: number;
        authority?: number;
        summary?: string;
        metadata?: Record<string, unknown>;
      }>;

      memoryCount   = evidence.length;
      documentCount = evidence.filter((e) => e.sourceType === "official_library" || e.providerName === "Official Library").length;
      providerSources = [...new Set(evidence.map((e) => e.sourceType ?? e.providerName ?? "unknown"))];
      citations       = providerSources;

      if (memoryCount > 0) {
        const avgConf = evidence.reduce((s, e) => s + (e.confidence ?? 0), 0) / memoryCount;
        const avgAuth = evidence.reduce((s, e) => s + ((e.authority as number) ?? 0), 0) / memoryCount;
        confidenceScore = Math.round(avgConf * 100) / 100;
        authorityScore  = Math.round(avgAuth * 100) / 100;
        coverage        = Math.min(1, memoryCount / 10);
      }
    } catch (e) {
      error = (e as Error).message;
    }

    const durationMs = Date.now() - t0;

    const diagnostics: MemoryContextDiagnostics = {
      provider:       "ucme",
      durationMs,
      memoryCount,
      documentCount,
      sources:        providerSources,
      estimatedTokens: Math.ceil(memories.length / 4),
      authorityScore,
      confidenceScore,
      coverage,
      gaps:           [],
      duplications:   [],
      error,
      timestamp:      new Date().toISOString(),
    };

    return {
      memories,
      sessionSummary,
      sources:        providerSources.map((s) => ({ type: s })),
      entities:       "",
      projects:       "",
      conversations:  "",
      decisions:      "",
      officialLibrary: "",
      citations,
      diagnostics,
    };
  }
}