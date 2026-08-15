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
import { outcomeToExecutionResult } from "@/lib/execution-intelligence/outcomeAdapter";

// Heurística conservadora de capabilities irreversíveis (WRITE). Se ANY step
// de ANY intenção casa, o batch é abortado e o fluxo per-intent legado (com
// EI/SafetyGate/confirmation) é usado. Em dúvida, não batcha (fail-safe).
const IRREVERSIBLE_CAP_RE = /(send|create|delete|update|rename|move|upload|invite|remove|edit|cancel|submit|complete|write)/i;

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
      // FIX (EI-04 multi-intent): userId/workspaceId reais — o valor falso
      // "multi-intent"/"default" fazia a resolucao de token OAuth falhar e todo
      // conector autenticado (Gmail sendEmail, etc.) silenciosamente falhar,
      // caindo no LLM que alucinava "enviado". Mesmo padrao do pipeline principal.
      let _miUserId = "multi-intent";
      let _miWorkspaceId = "default";
      try {
        const { base44 } = await import("@/api/base44Client");
        const _me = await base44.auth.me();
        if (_me?.id) _miUserId = _me.id;
      } catch { /* non-blocking */ }
      try {
        const { getActiveWorkspaceId } = await import("@/lib/workspace/WorkspaceContext");
        _miWorkspaceId = getActiveWorkspaceId();
      } catch { /* non-blocking */ }
      const connCtx = Object.freeze({
        userId:      _miUserId,
        workspaceId: _miWorkspaceId,
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
          const baseRequest = {
            connectorId: singleStep.connector,
            capability: singleStep.capability,
            params: singleStep.parameters ?? {},
            context: connCtx,
            executionId: execId,
          };
          const outcome = await eiRuntime.processCapability(baseRequest);
          if (outcome.status === "success") {
            executionResult = outcomeToExecutionResult(outcome, execId);
            usedEI = true;
          } else if (outcome.status === "needs_confirmation") {
            // EI-04 (irreversivel): pedir confirmacao ao usuario via
            // RuntimeConfirmationEngine. NAO cai no fallback auto-send — e a
            // seguranca efetiva do Safety Gate (EPIC-019).
            const { requestConfirmation } = await import("@/lib/runtime/RuntimeConfirmationEngine");
            const confirmResult = await requestConfirmation({
              capability:  `${outcome.connectorId}.${outcome.capability}`,
              title:       "Confirmar acao irreversivel",
              description: outcome.message ?? `Confirmar execucao de ${outcome.capability}`,
              payload:     { connectorId: outcome.connectorId, capability: outcome.capability },
            });
            if (confirmResult.confirmed) {
              const confirmedOutcome = await eiRuntime.processCapability({ ...baseRequest, confirmedByUser: true });
              if (confirmedOutcome.status === "success") {
                executionResult = outcomeToExecutionResult(confirmedOutcome, execId);
                usedEI = true;
              } else {
                // Confirmado mas dispatch falhou: nao cair no fallback (evita auto-send duplicado).
                return {
                  intent,
                  success: false,
                  response: null,
                  error: confirmedOutcome.message ?? "Falha apos confirmacao.",
                  durationMs: Date.now() - t0,
                };
              }
            } else {
              return {
                intent,
                success: true,
                response: "Acao cancelada pelo usuario.",
                error: null,
                durationMs: Date.now() - t0,
              };
            }
          }
          // blocked/failed: cai no fallback realEngine.execute (abaixo).
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

  /**
   * Caminho de batch (MultiIntent → UM ExecutionPlan): mescla N intenções
   * independentes num único plano cujos steps (dependsOn:[]) o
   * ExecutionOrchestrator executa em paralelo. Restrições de segurança:
   *   - só batcha single-step plans (1 step por intenção);
   *   - rejeita capabilities irreversíveis (IRREVERSIBLE_CAP_RE) → fallback;
   *   - rejeita goals inválidos/static_analysis/empty → fallback;
   *   - qualquer erro → retorna null (caller usa per-intent legado).
   * Não altera Orchestrator/Dispatcher/executores. O fluxo per-intent
   * original (execute()) permanece intacto como fallback de segurança.
   */
  async executeBatch(intents: ClassifiedIntent[]): Promise<IntentExecutionResult[] | null> {
    const t0 = Date.now();
    const { session, historyMessages, executionId } = this.baseArgs;
    try {
      const { primaryRouter } = await import("@/lib/primary-conversation-router/PrimaryConversationRouter");
      const { conversationGoalBridge } = await import("@/lib/conversation-goal-bridge/ConversationGoalBridge");
      const { conversationPlanningEngine } = await import("@/lib/planning-engine-e022/ConversationPlanningEngine");
      const { makePlanId } = await import("@/lib/planning-engine-e022/ExecutionPlanTypes");
      const { getRealRuntimeEngine } = await import("@/lib/connector-runtime-provider/ConnectorRuntimeProvider");
      const { synthesizeConnectorResult } = await import("@/lib/connector-runtime-provider/ConnectorResultSynthesizer");

      // 1. Resolve goal + plan por intenção. Aborta (null) se algo não for batchable.
      const groups: { intent: ClassifiedIntent; goal: any; plan: any; stepIds: string[] }[] = [];
      for (const intent of intents) {
        const routerResult = await primaryRouter.route(
          intent.text, session.id, session.project_id ?? null,
          (historyMessages as unknown[] | undefined)?.length ?? 0,
        );
        const goalBridgeResult = conversationGoalBridge.derive(
          intent.text,
          routerResult.intent?.intent ?? "general_conversation",
          routerResult.intent?.confidence ?? 0,
        );
        if (!goalBridgeResult.goal.valid) return null;
        const planResult = conversationPlanningEngine.plan(goalBridgeResult.goal, { mode: "live", context: null });
        if (!planResult.success || planResult.plan.mode === "static_analysis" || (planResult.plan.steps?.length ?? 0) === 0) return null;
        if (planResult.plan.steps.length !== 1) return null; // só single-step no batch
        const step = planResult.plan.steps[0];
        if (IRREVERSIBLE_CAP_RE.test(step.capability)) return null; // irreversível → fallback (EI/confirmation)
        groups.push({ intent, goal: goalBridgeResult.goal, plan: planResult.plan, stepIds: [step.id] });
      }
      if (groups.length === 0) return null;

      // 2. Mescla os steps num único ExecutionPlan. IDs já são globalmente
      // únicos (makeStepId usa sequencial global). dependsOn de cada step
      // vem do descriptor (default []) → todos independentes → mesma wave.
      const mergedSteps = groups.flatMap((g) => g.plan.steps);
      const mergedPlan = Object.freeze({
        id: makePlanId(),
        goalId: `multi-intent-${executionId}`,
        goalType: "multi-intent",
        status: "planned",
        steps: Object.freeze([...mergedSteps]),
        createdAt: Date.now(),
        durationMs: 0,
        mode: "live",
      });

      // 3. connCtx real (mesma resolução de execute()).
      let _miUserId = "multi-intent";
      let _miWorkspaceId = "default";
      try {
        const { base44 } = await import("@/api/base44Client");
        const _me = await base44.auth.me();
        if (_me?.id) _miUserId = _me.id;
      } catch { /* non-blocking */ }
      try {
        const { getActiveWorkspaceId } = await import("@/lib/workspace/WorkspaceContext");
        _miWorkspaceId = getActiveWorkspaceId();
      } catch { /* non-blocking */ }
      const connCtx = Object.freeze({
        userId: _miUserId, workspaceId: _miWorkspaceId, sessionId: session.id,
        goalId: mergedPlan.goalId, origin: "multi-intent-merged",
      });

      // 4. UMA execução pelo Runtime real → ExecutionOrchestrator → waves paralelas.
      const realEngine = await getRealRuntimeEngine();
      const { executionResult } = await realEngine.execute(mergedPlan as any, `${executionId}-merged`, connCtx);

      console.log("[MultiIntent][executeBatch] plano mesclado executado", {
        intents: groups.length, steps: mergedSteps.length, planId: mergedPlan.id,
        runtimeStatus: executionResult.status, durationMs: executionResult.durationMs,
      });

      // 5. Split dos stepResults por intenção + síntese individual.
      const results: IntentExecutionResult[] = [];
      for (const g of groups) {
        const subSteps = executionResult.steps.filter((s: any) => g.stepIds.includes(s.id));
        const subErrors = subSteps
          .filter((s: any) => s.status === "failed" || s.status === "timeout")
          .map((s: any) => s.error).filter(Boolean) as string[];
        const subResult = Object.freeze({ ...executionResult, steps: subSteps, errors: subErrors });
        const synthesis = await synthesizeConnectorResult(subResult as any, g.intent.text, g.goal.type, null);
        if (synthesis.handled && synthesis.response) {
          results.push({ intent: g.intent, success: true, response: synthesis.response, error: null, durationMs: Date.now() - t0 });
        } else {
          // Esta intenção não produziu resposta via batch → fallback conversacional individual.
          results.push(await this._fallbackToReasoningPlan(g.intent, t0));
        }
      }
      return results;
    } catch (err) {
      console.warn("[ConnectorGoalIntentExecutor] executeBatch falhou, fallback per-intent:", err);
      return null;
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

// _outcomeToExecutionResult extraido para src/lib/execution-intelligence/outcomeAdapter.ts (EI-04 shared).