/**
 * OpenRouterConnector.ts — conector para OpenRouter (chat completions
 * e listagem de modelos de IA via API externa).
 *
 * Segue o mesmo padrão do GmailConnector/GoogleCalendarConnector: 
 * implementa IConnector, delega toda chamada HTTP sensível (com a chave
 * de API) para funções de backend seguras (base44/functions), nunca
 * expõe a chave no navegador.
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
import { base44 } from "@/api/base44Client";

const CAPABILITIES = Object.freeze([
  "openrouter.chatCompletion",
  "openrouter.listModels",
]);

function ok<T>(data: T, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "openrouter", executionId: eid, logs };
}

function fail(error: string, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED — ${error} — ${duration}ms`));
  return { status: "FAILED", success: false, error, duration, connectorId: "openrouter", executionId: eid, logs };
}

export class OpenRouterConnector implements IConnector {
  readonly id = "openrouter";

  metadata(): ConnectorMetadata {
    return {
      id: "openrouter",
      name: "OpenRouter",
      version: "1.0.0",
      description: "Acesso a múltiplos modelos de IA via OpenRouter — chat completions e listagem de modelos.",
      author: "MemoryOS",
      capabilities: [...CAPABILITIES],
    };
  }

  validate(): boolean {
    return true;
  }

  async initialize(_ctx: ConnectorContext): Promise<void> {
    // Nada a inicializar — a chave fica no backend, checada em cada chamada.
  }

  async shutdown(): Promise<void> {}

  async health(): Promise<ConnectorHealthReport> {
    return {
      status: "healthy",
      connectorId: this.id,
      checkedAt: Date.now(),
      details: "OpenRouter connector pronto — chave verificada no backend a cada chamada.",
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

    try {
      switch (operation) {
        case "openrouter.chatCompletion": {
          const model = typeof payload.model === "string" ? payload.model : null;
          const prompt = typeof payload.prompt === "string" ? payload.prompt : null;
          const maxTokens = typeof payload.maxTokens === "number" ? payload.maxTokens : undefined;

          if (!model || !prompt) {
            return fail("model e prompt são obrigatórios", start, eid, logs, operation);
          }

          const res = await base44.functions.invoke("openrouterChat", {
            model,
            messages: [{ role: "user", content: prompt }],
            maxTokens,
          });
          const d = res.data ?? res;
          if (d?.error) {
            return fail(d.error, start, eid, logs, operation);
          }
          logs.push(makeLog("info", `[${operation}] model=${d.model} usage=${JSON.stringify(d.usage ?? {})}`));
          return ok({ reply: d.reply, model: d.model, usage: d.usage }, start, eid, logs, operation);
        }

        case "openrouter.listModels": {
          const res = await base44.functions.invoke("openrouterListModels", {});
          const d = res.data ?? res;
          if (d?.error) {
            return fail(d.error, start, eid, logs, operation);
          }
          logs.push(makeLog("info", `[${operation}] count=${d.count}`));
          return ok({ models: d.models, count: d.count }, start, eid, logs, operation);
        }

        default:
          return fail(`Unknown operation: "${operation}"`, start, eid, logs, operation);
      }
    } catch (e) {
      return fail((e as Error).message, start, eid, logs, operation);
    }
  }
}
