/**
 * WhatsAppObservationBridge.ts — Camada de Observacao do WhatsApp
 *
 * Ponte WhatsApp Connector -> KnowledgeRegistry.
 *
 * Unica responsabilidade: transformar o resultado de uma execucao do
 * WhatsApp Connector em ObservationInputs e entrega-los ao
 * KnowledgeRegistry (fire-and-forget, nunca lanca excecao).
 *
 * REGRAS DE SEGURANCA:
 *   - Nunca lanca excecao
 *   - Nunca retorna Promise (fire-and-forget via void)
 *   - Nunca bloqueia a resposta do connector
 *
 * Usa payloadType "connector_result" e scope "session" — ambos ja
 * registrados no KnowledgeRegistryTypes. NAO modifica tipos frozen.
 */

import { knowledgeRegistry } from "@/lib/knowledge-registry/KnowledgeRegistry";

export interface WhatsAppObservationInput {
  readonly executionId: string;
  readonly sessionId?: string;
  readonly projectId?: string | null;
  readonly provider: string;
  readonly operation: string;
  readonly to?: string;
  readonly messageId?: string | null;
  readonly status?: string | null;
  readonly success: boolean;
  readonly error?: string;
  readonly durationMs: number;
}

class WhatsAppObservationBridgeClass {
  observe(input: WhatsAppObservationInput): void {
    void this._run(input).catch(() => { /* nunca bloqueia */ });
  }

  private async _run(input: WhatsAppObservationInput): Promise<void> {
    await knowledgeRegistry.commit({
      targetObjectId: input.executionId,
      targetObjectType: "message",
      nature: "Evidence",
      payloadType: "connector_result",
      data: {
        provider: input.provider,
        operation: input.operation,
        to: input.to ?? null,
        messageId: input.messageId ?? null,
        status: input.status ?? null,
        success: input.success,
        error: input.error ?? null,
        durationMs: input.durationMs,
      },
      contextScope: "session",
      sessionId: input.sessionId,
      projectId: input.projectId ?? undefined,
      confidence: 1.0,
      producerId: "WhatsAppConnector",
      executionId: input.executionId,
    });
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__WHATSAPP_OBS_BRIDGE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new WhatsAppObservationBridgeClass();
}

export const whatsAppObservationBridge: WhatsAppObservationBridgeClass = (
  globalThis as unknown as Record<string, WhatsAppObservationBridgeClass>
)[_KEY];