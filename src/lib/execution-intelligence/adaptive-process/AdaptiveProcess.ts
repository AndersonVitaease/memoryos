// AdapteProcess.ts - AP-02 (RFC-010 / ADR-017)
// Categoria arquitetural interna: Adaptive Process.

import type { ExecutionRequest, ExecutionOutcome } from "../ExecutionTypes";

// ── Sub-capability call ──────────────────────────────────────────────────────

/** Uma chamada de sub-capability que o processo decide executar dinamicamente. */
export interface SubCapabilityCall {
  readonly connectorId: string;
  readonly capability: string;
  readonly params: Record<string, unknown>;
  /** EI-03: When true, SafetyGate approves irreversible capabilities. Set by supervised write flow after Approval 2. */
  readonly confirmedByUser?: boolean;
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
  readonly required?: boolean;
}

/** Reflection sobre uma wave executada. */
export interface Reflection {
  /** Outcomes por step. */
  readonly byStep?: Map<string, unknown>;
  /** Gaps identificados. */
  readonly gaps: readonly string[];
  /** Suficiencia medida (0–1). */
  readonly sufficiency: number;
  /** Completion contract with evaluated requirements. */
  readonly completion?: CompletionContract;
}

/** Completion contract for mission requirements. */
export interface CompletionContract {
  /** All evaluated requirements. */
  readonly requirements: readonly CompletionRequirement[];
  /** Number of completed requirements. */
  readonly completed: number;
  /** Total number of requirements. */
  readonly total: number;
  /** True if all required requirements are completed. */
  readonly requiredComplete: boolean;
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

  /** Target repository identifier (e.g., "memoryos", "eng-mcp") - SUP-03 context lock */
  readonly targetRepository?: string;

  /** Specific files the mission must address - SUP-03 context lock */
  readonly targetFiles?: readonly string[];

  /** Pass criteria that must be satisfied for mission completion - SUP-03 context lock */
  readonly passCriteria?: readonly string[];
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
export interface MissionContextLock {
  /** Original objective captured at mission start - SUP-03 context lock */
  readonly originalObjective: string;
  /** Target repository captured at mission start - SUP-03 context lock */
  readonly targetRepository?: string;
  /** Target files captured at mission start - SUP-03 context lock */
  readonly targetFiles?: readonly string[];
  /** Pass criteria captured at mission start - SUP-03 context lock */
  readonly passCriteria?: readonly string[];
}

/** Initial Mission Plan — ADV-01 Minimal Advisor: formalizes the initial strategy produced by plan() */
export interface InitialMissionPlan {
  readonly objective: string;
  readonly targetRepository?: string;
  readonly targetFiles?: readonly string[];
  readonly passCriteria?: readonly string[];
  /** Capabilities selected in the initial plan. */
  readonly selectedCapabilities: readonly string[];
  /** Read or write mode. */
  readonly mode: "read" | "write";
  /** Discovery queries for read mode. */
  readonly discoveryQueries?: readonly string[];
  /** Initial rationale for the plan (optional). */
  readonly rationale?: string;
  /** Timestamp of plan capture. */
  readonly timestamp: number;
}

/**
 * Estado acumulado durante uma run do DynamicWaveRunner.
 */
export interface AdaptiveRunState {
  /** Current iteration (0‑based). */
  readonly iteration: number;
  /** Steps completed so far (cumulative across waves). */
  readonly completedSteps: readonly { step: ResearchStep; result: ExecutionOutcome }[];
  /** Gaps identified during reflection. */
  readonly gaps: readonly string[];
  /** Reflection from previous wave, if any. */
  readonly reflection: Reflection | null;
  /** Initial mission plan captured once per run (ADV-01). */
  readonly initialMissionPlan?: InitialMissionPlan;
}

// ── Adaptive Process Interface ────────────────────────────────────────────────

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

  /**
   * ADV-01 Minimal Advisor: builds initial mission plan from plan() output.
   * Pure transformation of already-available data — no state, no LLM calls.
   * Used by DynamicWaveRunner to capture initial strategy once per run.
   */
  buildInitialMissionPlan?(
    ctx: AdaptiveProcessContext,
    waveSteps: readonly ResearchStep[],
  ): InitialMissionPlan | undefined;

  /**
   * Executa os steps do plano, retornando os outcomes na ordem.
   * Opcional: processos executados via DynamicWaveRunner NAO precisam
   * implementar invoke() — o runner despacha cada step via ctx.dispatch
   * (runtime.processCapability), nunca por este metodo. Processos que
   * mantem run() proprio (ex: SupervisedCapacityProcess) usam invoke()
   * internamente com seu proprio dispatchStep.
   */
  invoke?(
    steps: readonly ResearchStep[],
    ctx: AdaptiveProcessContext,
  ): Promise<readonly ExecutionOutcome[]>;

  /** Avalia os resultados, detecta lacunas e mede suficiencia. */
  reflect(
    steps: readonly ResearchStep[],
    outcomes: readonly ExecutionOutcome[],
    ctx: AdaptiveProcessContext,
  ): Promise<Reflection>;

  /**
   * Decide se a missao foi concluida com suficient evidência.
   * `true` → missao concluida (retorna outcome de sucesso),
   * `false` → precisa de mais waves (replan ou conclui com gaps).
   */
  stop(reflection: Reflection, state: AdaptiveRunState): Promise<boolean>;
}
