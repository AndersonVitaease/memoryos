/**
 * ReasoningPlanIntentExecutor.ts — Motor de Múltiplas Intenções (Parte 6a)
 *
 * Em vez de reimplementar a classificação e execução de cada tipo de
 * pedido (Gmail, Calendar, GitHub, Drive, Memória...), este executor
 * REAPROVEITA o pipeline principal inteiro (runReasoningPlan) — que já
 * sabe fazer tudo isso — chamando ele uma vez por pedaço decomposto.
 */

import type { ClassifiedIntent, IntentExecutionResult, IntentExecutor } from "./IntentTypes";

interface ReasoningPlanResult {
  response: string;
  plan?: unknown;
  sources?: unknown[];
}

type RunReasoningPlanFn = (args: {
  userMsg: string;
  session: unknown;
  historyMessages?: unknown[];
  setPhase?: (p: string) => void;
  kfmContext?: string;
}) => Promise<ReasoningPlanResult>;

interface BaseArgs {
  session: unknown;
  historyMessages?: unknown[];
  setPhase?: (p: string) => void;
  kfmContext?: string;
}

export class ReasoningPlanIntentExecutor implements IntentExecutor {
  constructor(
    private readonly runReasoningPlan: RunReasoningPlanFn,
    private readonly baseArgs: BaseArgs
  ) {}

  async execute(intent: ClassifiedIntent): Promise<IntentExecutionResult> {
    const t0 = Date.now();
    try {
      const result = await this.runReasoningPlan({
        userMsg: intent.text,
        session: this.baseArgs.session,
        historyMessages: this.baseArgs.historyMessages,
        kfmContext: this.baseArgs.kfmContext,
      });
      return {
        intent,
        success: true,
        response: result.response,
        error: null,
        durationMs: Date.now() - t0,
      };
    } catch (err) {
      return {
        intent,
        success: false,
        response: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
      };
    }
  }
}
