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
      // CT-01: step timeout específico para openhands.runTask.
      // O write two-phase pode exceder 300s (bootstrap + continuation + polling).
      // Mantemos o aumento estritamente nesta capability, sem alterar o timeout
      // global do Runtime. O backend recebe um budget menor (540s) e o client
      // hardcap (570s) ainda termina antes deste step timeout (600s).
      capabilityTimeout: {
        "openhands.runTask": 600_000,
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
      const appConversationId = typeof payload.app_conversation_id === "string" ? payload.app_conversation_id.trim() : "";
      const mode = payload.mode === "write" ? "write" : "read";

      if (!task) return fail("task e obrigatorio", start, eid, logs, operation);
      if (!repository && !appConversationId) return fail("repository e obrigatorio para nova conversation (owner/repo)", start, eid, logs, operation);

      // Long-running write flow is orchestrated through SHORT backend calls.
      // This avoids the Base44 backend-function ~300s request ceiling: no single
      // invoke remains open while OpenHands works. The connector owns the poll
      // loop inside the already-scoped 600s capability budget.
      const OVERALL_TIMEOUT_MS = 570_000;
      const SHORT_INVOKE_TIMEOUT_MS = 75_000;
      const overallDeadline = Date.now() + OVERALL_TIMEOUT_MS;
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      const invokeShort = async (payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`OpenHands short backend call timed out after ${SHORT_INVOKE_TIMEOUT_MS / 1000}s`)), SHORT_INVOKE_TIMEOUT_MS);
        });
        const response = await Promise.race([
          base44.functions.invoke("openHandsTaskProcess", payload),
          timeoutPromise,
        ]);
        return ((response as any)?.data ?? response ?? {}) as Record<string, unknown>;
      };

      let d: Record<string, unknown> | null = null;

      if (mode === "write" && !appConversationId) {
        // 1) START + START-TASK POLL — each backend call is short.
        // write_start performs only POST /app-conversations and returns start_task_id.
        // The connector polls start-task with separate calls until conversationId exists.
        let conversationId = "";
        let bootstrapCreateAttempt = 0;
        while (!conversationId && Date.now() < overallDeadline) {
          bootstrapCreateAttempt++;
          const started = await invokeShort({ action: "write_start", task, repository, mode });
          if (started?.error) return fail(String(started.error), start, eid, logs, operation);
          conversationId = typeof started?.app_conversation_id === "string" ? started.app_conversation_id : "";
          const startTaskId = typeof started?.start_task_id === "string" ? started.start_task_id : "";

          if (!conversationId && !startTaskId) {
            return fail("OpenHands write_start returned no start task id/conversation id", start, eid, logs, operation);
          }

          while (!conversationId && Date.now() < overallDeadline) {
            const startPoll = await invokeShort({
              action: "write_start_poll",
              start_task_id: startTaskId,
              repository,
              mode,
            });
            if (startPoll?.error) {
              const err = String(startPoll.error);
              const retryableGitAuth = err.includes("Git provider authentication issue when getting remote URL")
                && bootstrapCreateAttempt <= 1;
              if (!retryableGitAuth) return fail(err, start, eid, logs, operation);
              logs.push(makeLog("warn", `[${operation}] phase=start_task_git_auth_retry attempt=${bootstrapCreateAttempt}`));
              await sleep(15_000);
              break; // create a fresh app-conversation on the outer loop
            }
            conversationId = typeof startPoll?.app_conversation_id === "string" ? startPoll.app_conversation_id : "";
            if (!conversationId) await sleep(3_000);
          }
        }
        if (!conversationId) return fail("Timeout waiting for OpenHands conversation creation", start, eid, logs, operation);
        logs.push(makeLog("info", `[${operation}] phase=bootstrap_started conversation=${conversationId}`));

        // 2) POLL bootstrap until the bootstrap agent MessageEvent is consolidated.
        let baselineEventId = "";
        while (Date.now() < overallDeadline) {
          const poll = await invokeShort({ action: "bootstrap_poll", app_conversation_id: conversationId, repository, mode });
          if (poll?.error) return fail(String(poll.error), start, eid, logs, operation);
          if (poll?.phase === "bootstrap_ready" && typeof poll?.baseline_event_id === "string" && poll.baseline_event_id) {
            baselineEventId = poll.baseline_event_id;
            break;
          }
          await sleep(3_000);
        }
        if (!baselineEventId) return fail("Timeout waiting for OpenHands bootstrap readiness", start, eid, logs, operation);

        // 3) CONTINUE — send the real write task on the SAME conversation/sandbox.
        const continued = await invokeShort({
          action: "write_continue",
          app_conversation_id: conversationId,
          baseline_event_id: baselineEventId,
          task,
          repository,
          mode,
        });
        if (continued?.error) return fail(String(continued.error), start, eid, logs, operation);
        logs.push(makeLog("info", `[${operation}] phase=write_started conversation=${conversationId}`));

        // 4) POLL write completion. Once finished, keep polling briefly for the
        // real change_set to become visible; never fabricate it from agent text.
        let finishedWithoutChangesPolls = 0;
        while (Date.now() < overallDeadline) {
          const poll = await invokeShort({
            action: "write_poll",
            app_conversation_id: conversationId,
            baseline_event_id: baselineEventId,
            repository,
            mode,
          });
          if (poll?.error) return fail(String(poll.error), start, eid, logs, operation);
          if (poll?.phase === "write_complete" && poll?.change_set) {
            d = poll;
            break;
          }
          if (poll?.phase === "write_finished_waiting_changes") {
            finishedWithoutChangesPolls++;
            if (finishedWithoutChangesPolls >= 8) {
              return fail("change_set unavailable after OpenHands write completion", start, eid, logs, operation);
            }
            await sleep(5_000);
          } else {
            await sleep(3_000);
          }
        }
        if (!d) return fail("Timeout waiting for OpenHands write completion", start, eid, logs, operation);
      } else {
        // Read mode / explicit continuation keep the existing single-call path.
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`OpenHands backend function timed out after ${OVERALL_TIMEOUT_MS / 1000}s`)), OVERALL_TIMEOUT_MS);
        });
        const res = await Promise.race([
          base44.functions.invoke("openHandsTaskProcess", {
            task,
            ...(repository ? { repository } : {}),
            ...(appConversationId ? { app_conversation_id: appConversationId } : {}),
            mode,
            timeoutMs: 540_000,
          }),
          timeoutPromise,
        ]);
        d = ((res as any)?.data ?? res) as Record<string, unknown> | null;
      }
      if (d?.error) {
        const result = fail(String(d.error), start, eid, logs, operation);
        // Pass-through structured error fields from backend (no reinterpretation, no LLM)
        if (d && typeof d.openhands_status === "string") (result as Record<string, unknown>).openhands_status = d.openhands_status;
        if (d && typeof d.start_task_id === "string") (result as Record<string, unknown>).start_task_id = d.start_task_id;
        if (d && typeof d.stage === "string") (result as Record<string, unknown>).stage = d.stage;
        return result;
      }

      logs.push(
        makeLog("info", `[${operation}] mode=${mode} status=${d?.execution_status} replyChars=${String(d?.agent_reply_text ?? "").length}`),
      );
      return ok(
        {
          ok: d?.ok === true,
          agent_reply_text: typeof d?.agent_reply_text === "string" ? d.agent_reply_text : "",
          execution_status: typeof d?.execution_status === "string" ? d.execution_status : "",
          app_conversation_id: typeof d?.app_conversation_id === "string" ? d.app_conversation_id : null,
          continued: d?.continued === true,
          repository: typeof d?.repository === "string" ? d.repository : repository,
          mode,
          // Pass-through estruturado: change_set e sandbox_id do backend response.
          // NÃO reinterpretar. NÃO sintetizar. NÃO usar LLM. Apenas repassa para
          // SupervisedWriteFlow.parseChangeSet() consumir.
          change_set: d?.change_set ?? null,
          sandbox_id: typeof d?.sandbox_id === "string" ? d.sandbox_id : null,
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