/**
 * AdaptiveProcessConnector.ts — AP-03 (RFC-010 / ADR-017)
 *
 * Shell connector que expoe Adaptive Processes como capabilities comuns na
 * arquitetura publica de 4 elementos. Com o segundo processo concreto
 * (SupervisedEngineering), usa um mapa local operation -> process getter;
 * sem criar infraestrutura adicional fora deste shell fino.
 *
 * Metadata declara `composite: true` (AP-01) para a capability `deepResearch`.
 * O Runtime (AP-04) le esse flag para aplicar politica de execucao composta:
 * sub-budget proprio, correlation tree via parentExecutionId, timeout estendido,
 * propagacao de auth context, circuit breaker isolado.
 *
 * Reentrada pela cadeia completa (ADR-015 invariant #1): as sub-capabilities
 * que o DeepResearchProcess invoca passam por runtime.processCapability
 * (Intelligence + Safety + Dispatch), nunca por atalho. O dispatch e injetado
 * via setAdaptiveProcessRuntime() — AP-04 wired o runtime real.
 *
 * Estado atual (AP-03): connector registrado e valida no bootstrap; mapping
 * `deepResearch` presente no GoalCapabilityRegistry; porem o goal ainda nao
 * tem sinais no GoalRegistry (AP-05) → Planner nao roteia → zero producao.
 * Se execute() for chamado antes do runtime wired (AP-04), retorna
 * NOT_CONFIGURED — comportamento seguro, nao quebra nada.
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
import { getDeepResearchProcess } from "@/lib/execution-intelligence/adaptive-process/DeepResearchProcess";
import { getSupervisedEngineeringProcess } from "@/lib/execution-intelligence/adaptive-process/SupervisedEngineeringProcess";
import type { AdaptiveProcess, AdaptiveProcessContext } from "@/lib/execution-intelligence/adaptive-process/AdaptiveProcess";
import type { ExecutionOutcome, ExecutionRequest } from "@/lib/execution-intelligence/ExecutionTypes";
import type { ConnectorExecutionContext } from "@/lib/runtime-engine/RuntimeTypes";

const CAPABILITIES = Object.freeze(["deepResearch", "supervisedEngineering"]);

const PROCESS_GETTERS: Record<string, () => AdaptiveProcess> = {
  deepResearch: getDeepResearchProcess,
  supervisedEngineering: getSupervisedEngineeringProcess,
};

// ── Runtime injection (wired em AP-04) ──────────────────────────────────────
//
// dispatch(sub) chama runtime.processCapability com parentExecutionId threading.
// Reentrada pela cadeia completa — sub-caps passam por Intelligence + Safety +
// Dispatch. O connector nao conhece o runtime diretamente; AP-04 injeta via
// setAdaptiveProcessRuntime().

export interface AdaptiveProcessDispatchCall {
  readonly connectorId: string;
  readonly capability: string;
  readonly params: Record<string, unknown>;
  readonly parentExecutionId: string;
}

export interface AdaptiveProcessRuntime {
  processCapability(req: ExecutionRequest): Promise<ExecutionOutcome>;
}

let _runtime: AdaptiveProcessRuntime | null = null;

/** AP-04 injeta o runtime real aqui. Ate entao execute() retorna NOT_CONFIGURED. */
export function setAdaptiveProcessRuntime(r: AdaptiveProcessRuntime | null): void {
  _runtime = r;
}

// ── Connector ────────────────────────────────────────────────────────────────

export class AdaptiveProcessConnector implements IConnector {
  readonly id = "adaptive-process";

  metadata(): ConnectorMetadata {
    return {
      id: "adaptive-process",
      name: "Adaptive Process",
      version: "1.0.0",
      description:
        "Adaptive Processes — capacidades compostas (multi-step, reflexivas): Deep Research e Supervised Engineering.",
      author: "MemoryOS",
      capabilities: [...CAPABILITIES],
      capabilityReversibility: {
        deepResearch: "safe",
        supervisedEngineering: "reversible",
      },
      capabilityComposite: {
        deepResearch: true,
        supervisedEngineering: true,
      },
    };
  }

  validate(): boolean {
    return true;
  }

  async initialize(_ctx: ConnectorContext): Promise<void> {
    // Nada a inicializar — os processos sao lazy singletons.
  }

  async shutdown(): Promise<void> {}

  async health(): Promise<ConnectorHealthReport> {
    return {
      status: "healthy",
      connectorId: this.id,
      checkedAt: Date.now(),
      details: _runtime
        ? "Adaptive Process connector pronto — runtime wired (AP-04)."
        : "Adaptive Process connector registrado — runtime ainda nao wired (AP-04 pending).",
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

    const getProcess = PROCESS_GETTERS[operation];
    if (!getProcess) {
      const err = `Unknown operation: "${operation}"`;
      logs.push(makeLog("error", err));
      return {
        status: "NOT_SUPPORTED",
        success: false,
        error: err,
        duration: Date.now() - start,
        connectorId: this.id,
        executionId: eid,
        logs,
      };
    }

    if (!_runtime) {
      const err = "Adaptive Process runtime not wired (AP-04 pending) — execute() inert.";
      logs.push(makeLog("warn", err));
      return {
        status: "NOT_CONFIGURED",
        success: false,
        error: err,
        duration: Date.now() - start,
        connectorId: this.id,
        executionId: eid,
        logs,
      };
    }

    const query = operation === "supervisedEngineering"
      ? (typeof payload.task === "string" ? payload.task : "")
      : (typeof payload.query === "string" ? payload.query : "");

    // AP-04: auth context propagado as sub-capabilities. O connector recebe
    // ConnectorContext (projectId) e mapeia para ConnectorExecutionContext
    // (workspaceId) — preserva userId/sessionId/goalId da execucao pai.
    const parentCtx: ConnectorExecutionContext = {
      userId: context.userId,
      workspaceId: (context as { workspaceId?: string }).workspaceId ?? context.projectId,
      sessionId: context.sessionId,
      goalId: context.goalId,
      origin: "adaptive-process",
    };

    const processCtx: AdaptiveProcessContext = {
      request: {
        connectorId: this.id,
        capability: operation,
        params: payload,
        context: parentCtx,
        executionId: eid,
      },
      parentExecutionId: eid,
      query,
      dispatch: async (sub) => {
        // AP-04: reentrada pela cadeia completa — sub-cap invoca processCapability
        // (Intelligence + Safety + Dispatch), nunca por atalho. parentExecutionId
        // threads o eid do deepResearch pai para correlacao em arvore.
        const outcome = await _runtime!.processCapability({
          connectorId: sub.connectorId,
          capability: sub.capability,
          params: sub.params,
          context: parentCtx,
          parentExecutionId: eid,
          confirmedByUser: sub.confirmedByUser,
        });
        return outcome;
      },
    };

    try {
      const outcome = await getProcess().run(processCtx);
      logs.push(makeLog("info", `[${operation}] process completed — status=${outcome.status}`));
      return {
        status: outcome.status === "success" ? "SUCCESS" : "FAILED",
        success: outcome.status === "success",
        data: outcome.output,
        error: outcome.message ?? undefined,
        duration: Date.now() - start,
        connectorId: this.id,
        executionId: eid,
        logs,
      };
    } catch (e) {
      const err = (e as Error).message;
      logs.push(makeLog("error", `[${operation}] FAILED — ${err}`));
      return {
        status: "FAILED",
        success: false,
        error: err,
        duration: Date.now() - start,
        connectorId: this.id,
        executionId: eid,
        logs,
      };
    }
  }
}