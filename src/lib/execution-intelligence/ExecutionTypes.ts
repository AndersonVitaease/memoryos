/**
 * ExecutionTypes.ts — EI-02 (RFC-008 / ADR-015)
 *
 * Contratos uniformes para a cadeia de Execution Intelligence.
 *
 * Hoje (EI-02): apenas Runtime.processCapability() existe (pass-through puro).
 *   EI-03 adiciona SafetyGate (le reversibility do metadata do connector).
 *   EI-05 adiciona ExecutionIntelligence (enriquece antes do Safety Gate).
 *
 * Os 3 componentes (Intelligence, SafetyGate, Dispatcher) ja nascem compativeis
 * com Pipeline futura: cada um implementa ExecutionStage (recebe ExecutionContext,
 * devolve ExecutionContext). A extracao para Pipeline generica sera plug-in quando
 * o 4o estagio concreto aparecer (regra de disparo do RFC-008).
 *
 * Nenhum caller usa estes tipos ainda (EI-02 = zero risco). Sao a fundacao do
 * contrato que EI-03/EI-05/EI-07 vao implementar.
 */

import type { Reversibility } from "@/lib/connector-runtime/ConnectorTypes";
import type { ConnectorExecutionContext } from "@/lib/runtime-engine/RuntimeTypes";

// ── Request ──────────────────────────────────────────────────────────────────

/**
 * A requisicao que entra em Runtime.processCapability().
 * Origem: Planner (via GoalCapabilityRegistry) ou futuros callers (Agents, Workflows).
 */
export interface ExecutionRequest {
  /** ID do connector (ex: "gmail", "microsoft-graph", "google-drive"). */
  readonly connectorId: string;
  /** Capability a executar (ex: "sendEmail", "mail.send", "drive.deleteFile"). */
  readonly capability: string;
  /** Parametros da capability. */
  readonly params: Record<string, unknown>;
  /** Identidade propagada ao engine/connector (userId, workspaceId, sessionId, goalId, origin). */
  readonly context: ConnectorExecutionContext;
  /** ID de execucao para correlacao (vira o pipelineExecutionId do engine). Opcional. */
  readonly executionId?: string;
  /**
   * AP-04 (RFC-010/ADR-017): ID da execucao pai quando esta e uma sub-capability
   * invocada por um Adaptive Process (composite). Threaded como requestId no
   * ConnectorExecutionContext → correlacao em arvore (SystemEvent.parentId).
   * Undefined para capabilities atomicas (paridade ADR-015).
   */
  readonly parentExecutionId?: string;
  /**
   * EI-03: Safety Gate exige isto para capabilities `irreversible`.
   * Se ausente e a capability for irreversible → NeedsConfirmation.
   */
  readonly confirmedByUser?: boolean;
}

// ── PreparedExecution (produzido pela Execution Intelligence — EI-05+) ───────

export interface ExecutionGap {
  readonly field: string;
  readonly reason: string;
}

/**
 * Saida da Execution Intelligence: a melhor execucao possivel com o contexto
 * disponivel. Hoje (EI-02) nao e produzida — o Runtime e pass-through.
 */
export interface PreparedExecution {
  readonly request: ExecutionRequest;
  readonly enrichedParams: Record<string, unknown>;
  readonly gaps: readonly ExecutionGap[];
  readonly risks: readonly string[];
}

// ── IntelligenceBudget (EI-07 — travas de balanceamento) ──────────────────────

/**
 * Orcamento de custo por dispatch do Execution Intelligence. As 3 travas
 * (Convergence Budget = maxIterations, API/LLM Budget = maxLlmCalls/maxApiCalls,
 * Dependency Graph aciclico via InvestigatorRegistry) impedem loop infinito,
 * explosao de custo e dependencia circular. ADR-015 secao 4.
 */
export interface IntelligenceBudget {
  readonly maxIterations: number;
  readonly maxLlmCalls: number;
  readonly maxApiCalls: number;
}

/** Budget padrao (EI-07): 5 iteracoes, 3 chamadas de LLM, 4 chamadas de API. */
export const DEFAULT_BUDGET: IntelligenceBudget = {
  maxIterations: 5,
  maxLlmCalls: 3,
  maxApiCalls: 4,
};

// ── SafetyDecision (produzido pela Safety Gate — EI-03+) ────────────────────

/**
 * Decisao do Safety Gate.
 * - "approved": pode despachar.
 * - "needs_confirmation": irreversible sem confirmedByUser — pede confirmacao.
 * - "blocked": politica obrigatoria bloqueou (hard policy).
 */
export type SafetyDecision =
  | { readonly type: "approved" }
  | { readonly type: "needs_confirmation"; readonly reason: string; readonly summary: string }
  | { readonly type: "blocked"; readonly reason: string };

// ── ExecutionOutcome (terminal) ──────────────────────────────────────────────

/**
 * Resultado terminal de processCapability.
 * - "success": connector executou com sucesso.
 * - "failed": connector falhou ou nao foi encontrado.
 * - "needs_confirmation": Safety Gate pediu confirmacao (irreversible sem confirmedByUser).
 * - "blocked": Safety Gate bloqueou por politica.
 */
export interface ExecutionOutcome {
  readonly status: "success" | "failed" | "needs_confirmation" | "blocked";
  readonly connectorId: string;
  readonly capability: string;
  /** Dados retornados pelo connector (StepResult.output do engine). Null em falha/confirmacao. */
  readonly output: unknown | null;
  /**
   * Texto humano legivel para status nao-success:
   *  - failed: mensagem de erro (do connector ou excecao).
   *  - needs_confirmation: resumo da acao irreversivel (do SafetyGate).
   *  - blocked: motivo da politica (do SafetyGate/PolicyRegistry).
   */
  readonly message: string | null;
  readonly reversibility: Reversibility;
  /** ID da execucao no engine (correlacao com metricas/eventos). Null se nao despachado. */
  readonly executionId: string | null;
  /** Duracao total da execucao no engine (ms). Null se nao despachado. */
  readonly durationMs: number | null;
}

// ── Contrato uniforme dos 3 componentes (Pipeline-ready desde EI-02) ─────────
//
// Cada componente (Intelligence, SafetyGate, Dispatcher) implementa ExecutionStage:
// recebe um ExecutionContext, devolve um ExecutionContext enriquecido.
// Quando o 4o estagio concreto aparecer, a extracao para Pipeline generica e
// mecanica (plug-in), nao refatoracao profunda.

export interface ExecutionContext {
  readonly request: ExecutionRequest;
  readonly prepared: PreparedExecution | null;
  readonly safety: SafetyDecision | null;
  readonly outcome: ExecutionOutcome | null;
}

export interface ExecutionStage {
  readonly id: string;
  process(ctx: ExecutionContext): Promise<ExecutionContext>;
}