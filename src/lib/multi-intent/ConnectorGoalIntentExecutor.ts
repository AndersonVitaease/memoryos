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
import type { ExecutionResult } from "@/lib/runtime-engine/RuntimeTypes";
import type { ExecutionOutcome } from "@/lib/execution-intelligence";

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
      const execId = `${executionId}-frag-${intent.id}`;

      // EI-04 (pos-EI-07): primeiro caller vivo migrado para processCapability.
      // Planos de 1 step tentam a cadeia Execution Intelligence + Safety Gate primeiro.
      // safe/reversible despacham via EI (enriquecimento + safety); needs_confirmation/
      // blocked/failed (irreversivel sem confirmar) caem no realEngine.execute original
      // → automacao irreversivel (mail.send agendado, watches) preservada. Reversible-first.
      let executionResult!: ExecutionResult;
      const singleStep = planResult.plan.steps.length === 1 ? planResult.plan.steps[0] : null;
      let usedEI = false;
      if (singleStep) {
        try {
          const { getExecutionRuntime } = await import("@/lib/execution-intelligence");
          const eiRuntime = await getExecutionRuntime();
          const outcome = await eiRuntime.processCapability({
            connectorId: singleStep.connector,
            capability: singleStep.capability,
            params: singleStep.parameters ?? {},
            context: connCtx,
            executionId: execId,
          });
          if (outcome.status === "success") {
            executionResult = _outcomeToExecutionResult(outcome, execId);
            usedEI = true;
          }
        } catch (err) {
          console.warn("[ConnectorGoalIntentExecutor] EI dispatch falhou, caindo pro realEngine:", err);
        }
      }
      if (!usedEI) {
        const { executionResult: er } = await realEngine.execute(planResult.plan, execId, connCtx);
        executionResult = er;
      }

      // EI-04 observabilidade: distingue despacho via cadeia EI vs fallback ao
      // realEngine, para confirmar em producao que a migracao esta viva.
      console.log("[EI-04][multi-intent]", usedEI ? "ei_dispatched" : "ei_fallback", {
        steps: planResult.plan.steps.length,
        firstConnector: planResult.plan.steps[0]?.connector,
        firstCapability: planResult.plan.steps[0]?.capability,
        executionId: execId,
      });

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

/**
 * EI-04: mapeia um ExecutionOutcome bem-sucedido (dispatch via processCapability)
 * de volta ao shape ExecutionResult que o ConnectorResultSynthesizer consome. So
 * chamado quando outcome.status === "success" (safe/reversible despachados pelo
 * Safety Gate). needs_confirmation/blocked/failed nao chegam aqui — o executor
 * cai no realEngine.execute original (automacao irreversivel preservada).
 */
function _outcomeToExecutionResult(outcome: ExecutionOutcome, executionId: string): ExecutionResult {
  const now = Date.now();
  const durationMs = outcome.durationMs ?? 0;
  return {
    executionId: outcome.executionId ?? executionId,
    planId: "ei-adapter",
    goalId: `ei-${outcome.executionId ?? executionId}`,
    status: "completed",
    steps: [
      {
        stepId: "ei-step-1",
        connector: outcome.connectorId,
        capability: outcome.capability,
        status: "completed",
        output: outcome.output,
        error: null,
        startedAt: now - durationMs,
        finishedAt: now,
        durationMs,
        attempt: 1,
      },
    ],
    startedAt: now - durationMs,
    finishedAt: now,
    durationMs,
    errors: [],
  };
}