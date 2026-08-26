/**
 * UCMEContextProvider.ts — EF-40.6
 * Implementacao do contrato PlannerContext usando MemoryContextBuilder / UnifiedMemoryEngine.
 * Executa em paralelo (Shadow Mode). NAO afeta respostas ao usuario.
 */

import type { PlannerContext, PlannerContextDiagnostics } from "./PlannerContextTypes";

export interface UCMEContextInput {
  userMsg: string;
  sessionId: string;
  projectId?: string | null;
  intent?: string;
}

interface MemoryEvidence {
  sourceType?: string;
  providerName?: string;
  confidence?: number;
  authority?: number;
  summary?: string;
}

export const UCMEContextProvider = {
  async build(input: UCMEContextInput): Promise<PlannerContext> {
    const t0 = Date.now();
    let error: string | null = null;
    let evidences: MemoryEvidence[] = [];
    let contextText = "";
    let authorityScore: number | null = null;
    let confidenceScore: number | null = null;
    let coverage: number | null = null;
    let documentCount = 0;

    try {
      const { MemoryContextBuilder } = await import("@/lib/ucme/MemoryContextBuilder");
      const result = await MemoryContextBuilder.build(input.userMsg, {
        intent:     input.intent,
        maxResults: 15,
        timeoutMs:  4000,
        projectId:  input.projectId ?? undefined,
      });

      contextText   = result.prompt ?? "";
      evidences     = (result.result?.evidence ?? []) as MemoryEvidence[];
      documentCount = evidences.filter((e) => e.sourceType === "official_library").length;

      if (evidences.length > 0) {
        const avgConf = evidences.reduce((s, e) => s + (e.confidence ?? 0), 0) / evidences.length;
        const avgAuth = evidences.reduce((s, e) => s + (e.authority  ?? 0), 0) / evidences.length;
        confidenceScore = Math.round(avgConf * 100) / 100;
        authorityScore  = Math.round(avgAuth * 100) / 100;
        coverage        = Math.min(1, evidences.length / 10);
      }
    } catch (e) {
      error = (e as Error).message;
    }

    const durationMs  = Date.now() - t0;
    const sources     = [...new Set(evidences.map((e) => e.sourceType ?? e.providerName ?? "unknown"))];
    const memoryCount = evidences.length;
    const estimatedTokens = Math.ceil(contextText.length / 4);

    const expectedSources = ["official_library", "conversation", "knowledge_graph"];
    const gaps = expectedSources.filter((s) => !sources.includes(s));

    const seen = new Set<string>();
    const duplications: string[] = [];
    for (const ev of evidences) {
      const key = ev.summary?.slice(0, 80) ?? "";
      if (key && seen.has(key)) duplications.push(key);
      else seen.add(key);
    }

    const diagnostics: PlannerContextDiagnostics = {
      provider:        "ucme",
      durationMs,
      memoryCount,
      documentCount,
      sources,
      estimatedTokens,
      authorityScore,
      confidenceScore,
      coverage,
      gaps,
      duplications,
      error,
      timestamp:       new Date().toISOString(),
    };

    return {
      conversation:    "",
      officialLibrary: "",
      memories:        contextText,
      goals:           "",
      preferences:     "",
      entities:        "",
      reasoningHints:  "",
      citations:       sources,
      diagnostics,
    };
  },
};