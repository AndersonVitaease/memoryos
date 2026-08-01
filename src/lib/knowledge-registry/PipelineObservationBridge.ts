/**
 * PipelineObservationBridge.ts — Ponte Pipeline → KnowledgeRegistry (Fase 1)
 *
 * Unica responsabilidade: transformar o contexto de uma execucao da pipeline
 * em ObservationInputs e entrega-los ao KnowledgeRegistry.
 *
 * REGRAS DE SEGURANCA:
 *   - Nunca lanca excecao
 *   - Nunca retorna Promise (fire-and-forget via void)
 *   - Nunca importa componentes da pipeline diretamente
 *   - Zero side-effects no conversationStore
 *
 * FASE 1: Apenas observacoes do tipo "conversation_turn" e "goal_execution".
 * Fases futuras adicionarao "entity_mention", "connector_result", etc.
 */

import { knowledgeRegistry } from "./KnowledgeRegistry";
import type { ObservationInput, ContextScope } from "./KnowledgeRegistryTypes";

// ── Input da bridge ───────────────────────────────────────────────────────────

export interface PipelineObservationInput {
  readonly executionId:  string;
  readonly sessionId:    string;
  readonly projectId?:   string | null;
  readonly userMessage:  string;
  readonly goalType?:    string | null;
  readonly goalValid?:   boolean;
  readonly goalConfidence?: number;
  readonly finalResponse?: string | null;
  readonly producerPath?: string;  // ex: "llm", "connector_runtime", "cognitive_gateway"
  readonly durationMs?:  number;
}

// ── PipelineObservationBridge ─────────────────────────────────────────────────

class PipelineObservationBridgeClass {

  /**
   * Registra observacoes a partir de uma execucao completa da pipeline.
   * Fire-and-forget: nao bloqueia, nao propaga erros.
   */
  observe(input: PipelineObservationInput): void {
    void this._run(input).catch(() => { /* nunca bloqueia */ });
  }

  private async _run(input: PipelineObservationInput): Promise<void> {
    const scope: ContextScope = input.projectId ? "project" : "session";

    // ── Observacao 1: conversation_turn (Evidence) ────────────────────────
    // Registra o fato de que o usuario fez uma pergunta nesta sessao.
    await knowledgeRegistry.commit({
      targetObjectId:   input.sessionId,
      targetObjectType: "session",
      nature:           "Evidence",
      payloadType:      "conversation_turn",
      data: {
        userMessage:  input.userMessage.slice(0, 500),  // trunca pra nao estourar
        hasResponse:  !!input.finalResponse,
        durationMs:   input.durationMs ?? null,
        producerPath: input.producerPath ?? "unknown",
      },
      contextScope:   scope,
      sessionId:      input.sessionId,
      projectId:      input.projectId ?? undefined,
      confidence:     1.0,
      producerId:     "ConversationPipeline",
      executionId:    input.executionId,
    });

    // ── Observacao 2: goal_execution (Evidence ou Inference) ─────────────
    // Registra o goal que foi derivado para esta mensagem.
    if (input.goalType && input.goalType !== "general.conversation" && input.goalType !== "unknown") {
      await knowledgeRegistry.commit({
        targetObjectId:   input.sessionId,
        targetObjectType: "session",
        nature:           input.goalValid ? "Evidence" : "Inference",
        payloadType:      "goal_execution",
        data: {
          goalType:    input.goalType,
          goalValid:   input.goalValid ?? false,
          confidence:  input.goalConfidence ?? 0,
          userMessage: input.userMessage.slice(0, 200),
        },
        contextScope:   scope,
        sessionId:      input.sessionId,
        projectId:      input.projectId ?? undefined,
        confidence:     input.goalConfidence ?? 0.5,
        producerId:     "ConversationGoalBridge",
        executionId:    input.executionId,
      });
    }
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__PIPELINE_OBS_BRIDGE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new PipelineObservationBridgeClass();
}

export const pipelineObservationBridge: PipelineObservationBridgeClass = (
  globalThis as unknown as Record<string, PipelineObservationBridgeClass>
)[_KEY];