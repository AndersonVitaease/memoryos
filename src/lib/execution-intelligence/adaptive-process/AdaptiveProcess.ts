/**
 * AdaptiveProcess.ts — AP-02 (RFC-010 / ADR-017)
 *
 * Categoria arquitetural interna: Adaptive Process.
 *
 * Um Adaptive Process possui 3 propriedades estruturais que o diferenciam de
 * uma capability comum:
 *   1. Auto-orquestracao dinamica de capabilities (decide quais chamar).
 *   2. Loop reflexivo com criterio de parada nao-trivial (gap-detection -> re-plan).
 *   3. Estrategia de parada propria (suficiencia de evidencia, nao contador fixo).
 *
 * Externo: continua sendo apenas uma capability (deepResearch, etc.) na
 * arquitetura publica de 4 elementos. Internamente e implementado por um
 * Adaptive Process. O metadata `composite` (AP-01) declara a bifurcacao
 * atomica-vs-composta ao Runtime.
 *
 * Nenhum caller importa este modulo ainda (AP-02 = scaffold puro, zero risco).
 * AP-03 conecta o AdaptiveProcessConnector; AP-04 wired o dispatch com
 * parentExecutionId; AP-05 expoe sinais no GoalRegistry.
 */

import type { ExecutionRequest, ExecutionOutcome } from "../ExecutionTypes";

// ── Sub-capability call ──────────────────────────────────────────────────────

/** Uma chamada de sub-capability que o processo decide executar dinamicamente. */
export interface SubCapabilityCall {
  readonly connectorId: string;
  readonly capability: string;
  readonly params: Record<string, unknown>;
}

/** Um step do plano de pesquisa: a chamada + o porque (rastreabilidade). */
export interface ResearchStep {
  readonly id: string;
  readonly call: SubCapabilityCall;
  readonly rationale: string;
}

// ── Reflection ───────────────────────────────────────────────────────────────

/** Estado verificavel de um requisito de missao executavel. */
export type CompletionRequirementStatus = "pending" | "completed" | "failed" | "unverified";

/** Requisito atomico que precisa ser satisfeito antes de a missao ser concluida. */
export interface CompletionRequirement {
  readonly id: string;
  readonly description: string;
  readonly required: boolean;
  readonly status: CompletionRequirementStatus;
  readonly evidence?: readonly string[];
}

/** Contrato opcional de completude para Adaptive Processes orientados a missao. */
export interface CompletionContract {
  readonly requirements: readonly CompletionRequirement[];
  readonly completed: number;
  readonly total: number;
  readonly requiredComplete: boolean;
}

/** Avaliacao dos resultados de uma rodada de invocacao. */
export interface Reflection {
  /** Resultados por step (stepId -> outcome). */
  readonly byStep: ReadonlyMap<string, ExecutionOutcome>;
  /** Lacunas de evidencia detectadas (o que ainda falta para responder). */
  readonly gaps: readonly string[];
  /** Score de suficiencia 0..1 — quando >= threshold, stop() = true. */
  readonly sufficiency: number;
  /**
   * Contrato opcional de completude para missoes executaveis (ex: OpenHands).
   * Deep Research continua usando apenas sufficiency/gaps; callers existentes
   * nao precisam preencher este campo.
   */
  readonly completion?: CompletionContract;
}

// ── Contexto injetado no processo ────────────────────────────────────────────

/**
 * Contexto que o AdaptiveProcessConnector (AP-03) passa ao processo.
 * `dispatch` e o callback que chama runtime.processCapability com
 * parentExecutionId threading (AP-04). Reentrada pela cadeia completa —
 * sub-caps passam por Intelligence + Safety + Dispatch, nunca por atalho.
 */
export interface AdaptiveProcessContext {
  /** A requisicao original que chegou ao connector (deepResearch). */
  readonly request: ExecutionRequest;
  /** ID da execucao pai — vira parentExecutionId nas sub-chamadas. */
  readonly parentExecutionId: string;
  /** Dispatch de uma sub-capability (runtime.processCapability com parentExecutionId). */
  readonly dispatch: (sub: SubCapabilityCall) => Promise<ExecutionOutcome>;
  /** Query/pergunta original do usuario (extraida de request.params). */
  readonly query: string;
}

// ── Adaptive Run State (Dynamic Re-planning V1) ──────────────────────────────

/**
 * Estado acumulado durante uma run do DynamicWaveRunner. Passado para
 * planNextWave() para que o processo possa gerar a proxima wave com base
 * nos resultados reais da execucao anterior — steps que ainda NAO existiam
 * no plano inicial.
 *
 * NAO e entidade persistente — e transitório, vive apenas durante a run.
 */
export interface AdaptiveRunState {
  /** Iteracao atual (0-based: 0 = apos primeira wave, 1 = apos segunda, etc). */
  readonly iteration: number;
  /** Todos os steps concluidos ate agora com seus outcomes. */
  readonly completedSteps: readonly { readonly step: ResearchStep; readonly result: ExecutionOutcome }[];
  /** Gaps detectados na ultima reflection. */
  readonly gaps: readonly string[];
  /** Reflection completa da ultima iteracao (null na primeira chamada). */
  readonly reflection: Reflection | null;
}

// ── Interface base ───────────────────────────────────────────────────────────

/**
 * Contrato de um Adaptive Process. Cada futuro processo (Deep Planning,
 * Root Cause Analysis, etc.) implementa esta interface.
 *
 * YAGNI: nao ha AdaptiveProcessRegistry enquanto houver 1 processo. O
 * AdaptiveProcessConnector (AP-03) detem diretamente a instancia. O
 * registry surge naturalmente com o 2º processo.
 */
export interface AdaptiveProcess {
  readonly id: string;
  readonly description: string;

  /** Monta plano dinamico de sub-capabilities para a query (primeira wave). */
  plan(ctx: AdaptiveProcessContext): Promise<readonly ResearchStep[]>;

  /**
   * Dynamic Re-planning V1: gera a proxima wave com base no estado acumulado.
   * Recebe os outcomes reais da iteracao anterior e decide quais NOVOS steps
   * executar. Se ausente, o DynamicWaveRunner re-chama plan() (backward-compat).
   */
  planNextWave?(state: AdaptiveRunState, ctx: AdaptiveProcessContext): Promise<readonly ResearchStep[]>;

  /** Executa os steps do plano, retornando os outcomes na ordem. */
  invoke(
    steps: readonly ResearchStep[],
    ctx: AdaptiveProcessContext,
  ): Promise<readonly ExecutionOutcome[]>;

  /** Avalia os resultados, detecta lacunas e mede suficiencia. */
  reflect(
    steps: readonly ResearchStep[],
    results: readonly ExecutionOutcome[],
    ctx: AdaptiveProcessContext,
  ): Promise<Reflection>;

  /** Decide se parou (suficiencia alcancada ou budget esgotado). */
  stop(reflection: Reflection): boolean;

  /** Sintetiza o output final a partir dos resultados + reflection. */
  synthesize(
    steps: readonly ResearchStep[],
    results: readonly ExecutionOutcome[],
    reflection: Reflection,
    ctx: AdaptiveProcessContext,
  ): Promise<unknown>;

  /** Orquestra o loop completo: plan -> invoke -> reflect -> (gap? re-plan) -> synthesize. */
  run(ctx: AdaptiveProcessContext): Promise<ExecutionOutcome>;
}