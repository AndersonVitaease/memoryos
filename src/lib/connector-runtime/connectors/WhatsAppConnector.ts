/**
 * WhatsAppConnector.ts — conector nativo para WhatsApp Business
 *
 * Implementa IConnector (Camada de Capability) e delega a execucao
 * para o WhatsAppProviderRegistry (Camada de Provider), que seleciona
 * o provedor ativo (Meta Cloud / Evolution / Baileys / futuros).
 *
 * Arquitetura 5 camadas:
 *   1. Capability  — este arquivo (IConnector) + GoalCapabilityRegistry
 *   2. Provider    — WhatsAppProviderRegistry + MetaCloud/Evolution/Baileys
 *   3. Event       — RuntimeEventBus (emitido pelo UCRBridge que envolve este connector)
 *   4. Observation — WhatsAppObservationBridge (fire-and-forget apos cada execucao)
 *   5. Watch       — WhatsAppWatchProvider (registra "whatsapp" no ConnectorGateway)
 *
 * O Planner NUNCA conhece o provedor ativo — apenas chama capabilities
 * "whatsapp.sendMessage", "whatsapp.sendTemplate", "whatsapp.getMessageStatus".
 */
import type { IConnector } from "../IConnector";
import type {
  ConnectorContext,
  ConnectorHealthReport,
  ConnectorMetadata,
  ConnectorResult,
  ConnectorLog,
} from "../ConnectorTypes";
import { makeLog, makeExecutionId } from "../ConnectorTypes";
import { whatsappProviderRegistry } from "@/lib/whatsapp/WhatsAppProviderRegistry";
import { whatsAppObservationBridge } from "@/lib/whatsapp/WhatsAppObservationBridge";
// Side-effect: registra "whatsapp" como provider do Watch Engine
import "@/lib/whatsapp/WhatsAppWatchProvider";

const CAPABILITIES = Object.freeze([
  "whatsapp.sendMessage",
  "whatsapp.sendTemplate",
  "whatsapp.getMessageStatus",
]);

function ok<T>(data: T, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "whatsapp", executionId: eid, logs };
}

function fail(error: string, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED — ${error} — ${duration}ms`));
  return { status: "FAILED", success: false, error, duration, connectorId: "whatsapp", executionId: eid, logs };
}

export class WhatsAppConnector implements IConnector {
  readonly id = "whatsapp";

  metadata(): ConnectorMetadata {
    return {
      id: "whatsapp",
      name: "WhatsApp Business",
      version: "1.0.0",
      description: "Envio de mensagens via WhatsApp Business (Meta Cloud API oficial, Evolution, Baileys).",
      author: "MemoryOS",
      capabilities: [...CAPABILITIES],
      // EI-01 (RFC-008/ADR-015): per-capability reversibility. Default "safe".
      // Mensagens enviadas nao podem ser "desenviadas".
      capabilityReversibility: {
        "whatsapp.sendMessage": "irreversible",
        "whatsapp.sendTemplate": "irreversible",
        "whatsapp.getMessageStatus": "safe",
      },
    };
  }

  validate(): boolean {
    return true;
  }

  async initialize(_ctx: ConnectorContext): Promise<void> {
    // Nada a inicializar — o provedor ativo e selecionado sob demanda
    // pelo WhatsAppProviderRegistry a cada execute().
  }

  async shutdown(): Promise<void> {}

  async health(): Promise<ConnectorHealthReport> {
    const provider = whatsappProviderRegistry.getActive();
    return {
      status: provider?.isAvailable() ? "healthy" : "unhealthy",
      connectorId: this.id,
      checkedAt: Date.now(),
      details: provider
        ? `Provedor ativo: ${provider.displayName}`
        : "Nenhum provedor WhatsApp registrado.",
    };
  }

  async execute(
    operation: string,
    payload: Record<string, unknown>,
    context: ConnectorContext,
  ): Promise<ConnectorResult> {
    const start = Date.now();
    const eid = context.executionId ?? makeExecutionId();
    const logs: ConnectorLog[] = [makeLog("info", `[${operation}] executionId=${eid}`)];

    const provider = whatsappProviderRegistry.getActive();
    if (!provider) {
      const error = "Nenhum provedor WhatsApp ativo.";
      whatsAppObservationBridge.observe({
        executionId: eid, sessionId: context.sessionId, projectId: context.projectId,
        provider: "none", operation, success: false, error, durationMs: Date.now() - start,
      });
      return fail(error, start, eid, logs, operation);
    }

    try {
      let result;

      switch (operation) {
        case "whatsapp.sendMessage": {
          const to = typeof payload.to === "string" ? payload.to : null;
          const message = typeof payload.message === "string" ? payload.message : null;
          if (!to || !message) {
            return fail("to e message são obrigatórios", start, eid, logs, operation);
          }
          result = await provider.sendMessage({ to, message });
          logs.push(makeLog("info", `[${operation}] provider=${provider.id} messageId=${result.messageId} status=${result.status}`));
          whatsAppObservationBridge.observe({
            executionId: eid, sessionId: context.sessionId, projectId: context.projectId,
            provider: provider.id, operation, to, messageId: result.messageId, status: result.status,
            success: true, durationMs: Date.now() - start,
          });
          return ok({ messageId: result.messageId, status: result.status, provider: result.provider }, start, eid, logs, operation);
        }

        case "whatsapp.sendTemplate": {
          const to = typeof payload.to === "string" ? payload.to : null;
          const templateName = typeof payload.templateName === "string" ? payload.templateName : null;
          const templateLanguage = typeof payload.templateLanguage === "string" ? payload.templateLanguage : undefined;
          const components = payload.components ?? undefined;
          if (!to || !templateName) {
            return fail("to e templateName são obrigatórios", start, eid, logs, operation);
          }
          result = await provider.sendTemplate({ to, templateName, templateLanguage, components: components as unknown[] | undefined });
          logs.push(makeLog("info", `[${operation}] provider=${provider.id} messageId=${result.messageId} status=${result.status}`));
          whatsAppObservationBridge.observe({
            executionId: eid, sessionId: context.sessionId, projectId: context.projectId,
            provider: provider.id, operation, to, messageId: result.messageId, status: result.status,
            success: true, durationMs: Date.now() - start,
          });
          return ok({ messageId: result.messageId, status: result.status, provider: result.provider }, start, eid, logs, operation);
        }

        case "whatsapp.getMessageStatus": {
          const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
          if (!messageId) {
            return fail("messageId é obrigatório", start, eid, logs, operation);
          }
          result = await provider.getMessageStatus({ messageId });
          logs.push(makeLog("info", `[${operation}] provider=${provider.id} status=${result.status}`));
          whatsAppObservationBridge.observe({
            executionId: eid, sessionId: context.sessionId, projectId: context.projectId,
            provider: provider.id, operation, messageId: result.messageId, status: result.status,
            success: true, durationMs: Date.now() - start,
          });
          return ok({ messageId: result.messageId, status: result.status, provider: result.provider }, start, eid, logs, operation);
        }

        default:
          return fail(`Unknown operation: "${operation}"`, start, eid, logs, operation);
      }
    } catch (e) {
      const error = (e as Error).message;
      whatsAppObservationBridge.observe({
        executionId: eid, sessionId: context.sessionId, projectId: context.projectId,
        provider: provider.id, operation, success: false, error, durationMs: Date.now() - start,
      });
      return fail(error, start, eid, logs, operation);
    }
  }
}