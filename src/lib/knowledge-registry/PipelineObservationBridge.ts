/**
 * PipelineObservationBridge.ts — Ponte Pipeline → KnowledgeRegistry
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
 * Sprint EF-411 (Observation Engine):
 *   Observacao 3: "llm_response" — o fato aprendido neste turno.
 *   Emite CognitiveEventBus.knowledge_observation_generated ao concluir.
 */

import { knowledgeRegistry } from "./KnowledgeRegistry";
import type { ObservationInput, ContextScope } from "./KnowledgeRegistryTypes";
import { cognitiveEventBus } from "@/lib/cognitive-event-bus/CognitiveEventBus";

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

    // ── Observacao 3: llm_response (Sprint EF-411 — Observation Engine) ──
    // Registra o fato que a IA aprendeu neste turno — o conhecimento
    // gerado, não apenas o evento de conversa. Esta é a observação que
    // alimenta o Read Model (StateView) na Sprint EF-412.
    if (input.finalResponse && input.finalResponse.trim().length > 20) {
      const obsResult = await knowledgeRegistry.commit({
        targetObjectId:   input.executionId,
        targetObjectType: "message",
        nature:           "Inference",
        payloadType:      "llm_response",
        data: {
          responseHead:  input.finalResponse.slice(0, 600),
          responseLen:   input.finalResponse.length,
          producerPath:  input.producerPath ?? "unknown",
          goalType:      input.goalType ?? null,
          durationMs:    input.durationMs ?? null,
        },
        contextScope:   scope,
        sessionId:      input.sessionId,
        projectId:      input.projectId ?? undefined,
        confidence:     0.8,
        producerId:     "ObservationEngine",
        executionId:    input.executionId,
      });

      // Emite no CognitiveEventBus para desacoplar consumidores futuros
      cognitiveEventBus.emit(
        'knowledge_observation_generated',
        input.sessionId,
        input.executionId,
        {
          observationId: obsResult.observationId ?? null,
          payloadType:   "llm_response",
          producerPath:  input.producerPath ?? "unknown",
          goalType:      input.goalType ?? null,
        },
      );
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