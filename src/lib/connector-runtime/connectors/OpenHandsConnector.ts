/**
 * OpenHandsConnector.ts — conector fino para OpenHands Cloud.
 *
 * Mesmo padrao do MemoriConnector/MCPConnector: implementa IConnector e
 * delega toda chamada sensivel (OPENHANDS_API_KEY, Cloud API, Agent Server
 * REST) para a backend function segura `openHandsTaskProcess`
 * (base44/functions), que ja esta certificada e autenticada. Nada de chaves
 * no navegador.
 *
 * Capability unica parametrizada por `mode`:
 *   - openhands.runTask  (mode: "read" | "write", default "read")
 *
 * Reversibility:
 *   - read  -> safe
 *   - write -> reversible (altera estado do repo; Safety Gate pode frear
 *              se classificada irreversible no futuro). Declarado "safe"
 *              por default; o gate real e o `mode` no payload + a instrucao
 *              de read-only que a backend function injeta quando mode=read.
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

const CAPABILITIES = Object.freeze(["openhands.runTask"]);

function ok<T>(data: T, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "openhands", executionId: eid, logs };
}

function fail(error: string, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED - ${error} - ${duration}ms`));
  return { status: "FAILED", success: false, error, duration, connectorId: "openhands", executionId: eid, logs };
}

export class OpenHandsConnector implements IConnector {
  readonly id = "openhands";

  metadata(): ConnectorMetadata {
    return {
      id: "openhands",
      name: "OpenHands",
      version: "1.0.0",
      description:
        "OpenHands Cloud — orquestra tarefas de engenharia via backend function openHandsTaskProcess (Cloud API + Agent Server REST).",
      author: "MemoryOS",
      capabilities: [...CAPABILITIES],
      capabilityReversibility: {
        "openhands.runTask": "safe",
      },
    };
  }

  validate(): boolean {
    return true;
  }

  async initialize(_ctx: ConnectorContext): Promise<void> {
    // Nada a inicializar - OPENHANDS_API_KEY fica no backend, lida a cada chamada.
  }

  async shutdown(): Promise<void> {}

  async health(): Promise<ConnectorHealthReport> {
    return {
      status: "healthy",
      connectorId: this.id,
      checkedAt: Date.now(),
      details: "OpenHands connector pronto - credencial verificada no backend a cada chamada.",
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
      if (operation !== "openhands.runTask") {
        return fail(`Unknown operation: "${operation}"`, start, eid, logs, operation);
      }

      const task = typeof payload.task === "string" ? payload.task.trim() : "";
      const repository = typeof payload.repository === "string" ? payload.repository.trim() : "";
      const mode = payload.mode === "write" ? "write" : "read";

      if (!task) return fail("task e obrigatorio", start, eid, logs, operation);
      if (!repository) return fail("repository e obrigatorio (owner/repo)", start, eid, logs, operation);

      const res = await base44.functions.invoke("openHandsTaskProcess", { task, repository, mode });
      const d = (res.data ?? res) as Record<string, unknown> | null;
      if (d?.error) return fail(String(d.error), start, eid, logs, operation);

      logs.push(
        makeLog("info", `[${operation}] mode=${mode} status=${d?.execution_status} replyChars=${String(d?.agent_reply_text ?? "").length}`),
      );
      return ok(
        {
          ok: d?.ok === true,
          agent_reply_text: typeof d?.agent_reply_text === "string" ? d.agent_reply_text : "",
          execution_status: typeof d?.execution_status === "string" ? d.execution_status : "",
          app_conversation_id: typeof d?.app_conversation_id === "string" ? d.app_conversation_id : null,
          repository,
          mode,
        },
        start,
        eid,
        logs,
        operation,
      );
    } catch (e: any) {
      const realError =
        e?.response?.data?.error ||
        (typeof e?.response?.data === "string" ? e.response.data : null) ||
        e?.data?.error ||
        e?.message ||
        String(e);
      return fail(String(realError), start, eid, logs, operation);
    }
  }
}