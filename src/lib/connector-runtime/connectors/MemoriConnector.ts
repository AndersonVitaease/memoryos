/**
 * MemoriConnector.ts — conector para Memori Cloud (memória persistente
 * de longo prazo via MCP — memorilabs.ai).
 *
 * Segue o mesmo padrão do OpenRouterConnector: implementa IConnector,
 * delega toda chamada HTTP sensível (com a chave de API) para funções
 * de backend seguras (base44/functions), nunca expõe a chave no navegador.
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
  "memori.remember",
  "memori.recall",
]);

function ok<T>(data: T, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "memori", executionId: eid, logs };
}

function fail(error: string, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED — ${error} — ${duration}ms`));
  return { status: "FAILED", success: false, error, duration, connectorId: "memori", executionId: eid, logs };
}

export class MemoriConnector implements IConnector {
  readonly id = "memori";

  metadata(): ConnectorMetadata {
    return {
      id: "memori",
      name: "Memori",
      version: "1.0.0",
      description: "Memória persistente de longo prazo via Memori Cloud (MCP) — grava e recupera fatos/preferências.",
      author: "MemoryOS",
      capabilities: [...CAPABILITIES],
      // EI-01 (RFC-008/ADR-015): per-capability reversibility. Default "safe".
      capabilityReversibility: {
        "memori.remember": "reversible",
        "memori.recall": "safe",
      },
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
      details: "Memori connector pronto — chave verificada no backend a cada chamada.",
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
        case "memori.remember": {
          const userMessage = typeof payload.userMessage === "string" ? payload.userMessage : null;
          const assistantResponse = typeof payload.assistantResponse === "string" ? payload.assistantResponse : null;

          if (!userMessage || !assistantResponse) {
            return fail("userMessage e assistantResponse são obrigatórios", start, eid, logs, operation);
          }

          const res = await base44.functions.invoke("memoriRemember", {
            userMessage,
            assistantResponse,
          });
          const d = res.data ?? res;
          if (d?.error) {
            return fail(d.error, start, eid, logs, operation);
          }
          logs.push(makeLog("info", `[${operation}] durationMs=${d.durationMs} totalMs=${d.totalMs}`));
          return ok({ success: d.success, durationMs: d.durationMs, totalMs: d.totalMs }, start, eid, logs, operation);
        }

        case "memori.recall": {
          const query = typeof payload.query === "string" ? payload.query : null;

          if (!query) {
            return fail("query é obrigatório", start, eid, logs, operation);
          }

          const res = await base44.functions.invoke("memoriRecall", { query });
          const d = res.data ?? res;
          if (d?.error) {
            return fail(d.error, start, eid, logs, operation);
          }
          logs.push(makeLog("info", `[${operation}] count=${d.count}`));
          return ok({ memories: d.memories, count: d.count }, start, eid, logs, operation);
        }

        default:
          return fail(`Unknown operation: "${operation}"`, start, eid, logs, operation);
      }
    } catch (e) {
      return fail((e as Error).message, start, eid, logs, operation);
    }
  }
}