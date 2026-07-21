/**
 * LegacyContextProvider.ts — EF-40.6
 * Implementacao do contrato PlannerContext usando buildReasoningContext() legado.
 * NAO altera nenhum comportamento existente.
 */

import type { PlannerContext, PlannerContextDiagnostics } from "./PlannerContextTypes";

export interface LegacyContextInput {
  userMsg: string;
  memory: {
    context: string;
    sources: Array<{ type: string; [key: string]: unknown }>;
    sessionSummary?: string;
    intent?: unknown;
  };
  skills: Array<{ id: string; name: string; score: number }>;
  goal: { id: string; label: string; strategy: string };
  historyText: string;
  totalMessages: number;
  capabilities: Record<string, boolean>;
  capabilityResults: Record<string, unknown>;
  needsMoreInfo: boolean;
  missingInfoHint?: string;
  serviceInfo?: unknown;
  kfmContext?: string;
}

export const LegacyContextProvider = {
  async build(input: LegacyContextInput): Promise<PlannerContext> {
    const t0 = Date.now();
    let builtContext = "";
    let error: string | null = null;

    try {
      const { buildReasoningContext } = await import("@/lib/reasoning/contextBuilder");
      builtContext = buildReasoningContext({
        userMsg:         input.userMsg,
        memory:          input.memory,
        skills:          input.skills,
        goal:            input.goal,
        historyText:     input.historyText,
        totalMessages:   input.totalMessages,
        capabilities:    input.capabilities,
        capabilityResults: input.capabilityResults,
        needsMoreInfo:   input.needsMoreInfo,
        missingInfoHint: input.missingInfoHint,
        serviceInfo:     input.serviceInfo,
        kfmContext:      input.kfmContext,
      });
    } catch (e) {
      error = (e as Error).message;
    }

    const durationMs = Date.now() - t0;
    const sources = input.memory.sources.map((s) => s.type as string);
    const memoryCount = input.memory.sources.length;
    const estimatedTokens = Math.ceil(builtContext.length / 4);

    const diagnostics: PlannerContextDiagnostics = {
      provider:       "legacy",
      durationMs,
      memoryCount,
      documentCount:  0,
      sources,
      estimatedTokens,
      authorityScore: null,
      confidenceScore: null,
      coverage:       null,
      gaps:           [],
      duplications:   [],
      error,
      timestamp:      new Date().toISOString(),
    };

    return {
      conversation:   input.historyText,
      officialLibrary: "",
      memories:       input.memory.context || "",
      goals:          input.goal.label,
      preferences:    "",
      entities:       "",
      reasoningHints: input.goal.strategy,
      citations:      sources,
      diagnostics,
      // O contexto completo (para uso interno do planner via .toString())
      _rawPrompt:     builtContext,
    } as PlannerContext & { _rawPrompt: string };
  },
};