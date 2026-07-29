/**
 * ConnectorGoalIntentExecutor.ts — Motor de Múltiplas Intenções (Parte 6b — correção)
 *
 * FIX (achado real via teste): a primeira versão do executor (usando só
 * runReasoningPlan) não conseguia ler Gmail/Calendar de verdade — porque
 * a execução real de conectores passa por um caminho DIFERENTE
 * (roteador → ConversationGoalBridge → ConversationPlanningEngine →
 * motor de execução real → sintetizador), que só existe dentro do
 * ConversationPipeline.ts, não dentro do memoryReasoningPlanner.js.
 *
 * Este executor replica essa sequência real, por pedaço, sem duplicar
 * as etapas mais pesadas de enriquecimento de contexto (que servem
 * pra melhorar o prompt do LLM, não são necessárias pra execução de
 * conector em si). Se o pedaço não corresponder a nenhum goal de
 * conector válido, cai no runReasoningPlan (fluxo conversacional
 * normal) — mesma cobertura de uma mensagem única, por pedaço.
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
  kfmContext?: string;
}) => Promise<ReasoningPlanResult>;

interface BaseArgs {
  session: { id: string; project_id?: string | null };
  historyMessages?: unknown[];
  executionId: string;
}

export class ConnectorGoalIntentExecutor implements IntentExecutor {
  constructor(
    private readonly runReasoningPlan: RunReasoningPlanFn,
    private readonly baseArgs: BaseArgs
  ) {}

  async execute(intent: ClassifiedIntent): Promise<IntentExecutionResult> {
    const t0 = Date.now();
    const { session, historyMessages, executionId } = this.baseArgs;

    try {
      const { primaryRouter } = await import("@/lib/primary-conversation-router/PrimaryConversationRouter");
      const { conversationGoalBridge } = await import("@/lib/conversation-goal-bridge/ConversationGoalBridge");

      const routerResult = await primaryRouter.route(
        intent.text,
        session.id,
        session.project_id ?? null,
        (historyMessages as unknown[] | undefined)?.length ?? 0
      );

      const goalBridgeResult = conversationGoalBridge.derive(
        intent.text,
        routerResult.intent?.intent ?? "general_conversation",
        routerResult.intent?.confidence ?? 0,
      );

      if (!goalBridgeResult.goal.valid) {
        return this._fallbackToReasoningPlan(intent, t0);
      }

      const { conversationPlanningEngine } = await import("@/lib/planning-engine-e022/ConversationPlanningEngine");
      const planResult = conversationPlanningEngine.plan(goalBridgeResult.goal, { mode: "live", context: null });

      if (!planResult.success || planResult.plan.mode === "static_analysis" || (planResult.plan.steps?.length ?? 0) === 0) {
        return this._fallbackToReasoningPlan(intent, t0);
      }

      const { getRealRuntimeEngine } = await import("@/lib/connector-runtime-provider/ConnectorRuntimeProvider");
      const { synthesizeConnectorResult } = await import("@/lib/connector-runtime-provider/ConnectorResultSynthesizer");

      const realEngine = await getRealRuntimeEngine();
      const connCtx = Object.freeze({
        userId:      "multi-intent",
        workspaceId: "default",
        sessionId:   session.id,
        goalId:      goalBridgeResult.goal.id,
        origin:      "multi-intent-pipeline",
      });

      const { executionResult } = await realEngine.execute(planResult.plan, `${executionId}-frag-${intent.id}`, connCtx);
      const synthesis = await synthesizeConnectorResult(executionResult, intent.text, goalBridgeResult.goal.type, null);

      if (synthesis.handled && synthesis.response) {
        return {
          intent,
          success: true,
          response: synthesis.response,
          error: null,
          durationMs: Date.now() - t0,
        };
      }

      return this._fallbackToReasoningPlan(intent, t0);
    } catch (err) {
      console.warn(`[ConnectorGoalIntentExecutor] Falha no caminho de conector pro pedaço "${intent.text}", caindo pro conversacional:`, err);
      return this._fallbackToReasoningPlan(intent, t0);
    }
  }

  private async _fallbackToReasoningPlan(intent: ClassifiedIntent, t0: number): Promise<IntentExecutionResult> {
    try {
      const result = await this.runReasoningPlan({
        userMsg: intent.text,
        session: this.baseArgs.session,
        historyMessages: this.baseArgs.historyMessages,
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
