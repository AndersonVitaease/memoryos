/**
 * RuntimeTypes.ts — Engineering Sprint E-02.3
 * Canonical types for the Runtime Engine.
 *
 * SRP: apenas contratos de dados.
 * Runtime conhece: ExecutionPlan, CapabilityExecutor, ExecutionContext.
 * Runtime NAO conhece: Gmail, Calendar, Drive, OAuth, LLM.
 */

import type { ExecutionPlan, ExecutionStep } from "@/lib/planning-engine-e022/ExecutionPlanTypes";

// ── Status enums ──────────────────────────────────────────────────────────────

export type ExecutionStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout"
  | "waiting_confirmation";

export type StepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

// ── Retry (structure only — algorithm is Sprint E-02.4+) ──────────────────────

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly backoffMs:   number;
}

export interface RetryContext {
  readonly attempt:     number;
  readonly maxAttempts: number;
  readonly lastError:   string | null;
}

export interface RetryDecision {
  readonly shouldRetry: boolean;
  readonly delayMs:     number;
  readonly reason:      string;
}

// ── Step result ───────────────────────────────────────────────────────────────

export interface StepResult {
  readonly stepId:     string;
  readonly connector:  string;
  readonly capability: string;
  readonly status:     StepStatus;
  readonly output:     unknown;
  readonly error:      string | null;
  readonly startedAt:  number;
  readonly finishedAt: number;
  readonly durationMs: number;
  readonly attempt:    number;
}

// ── Execution result ──────────────────────────────────────────────────────────

export interface ExecutionResult {
  readonly executionId: string;
  readonly planId:      string;
  readonly goalId:      string;
  readonly status:      ExecutionStatus;
  readonly steps:       readonly StepResult[];
  readonly startedAt:   number;
  readonly finishedAt:  number;
  readonly durationMs:  number;
  readonly errors:      readonly string[];
}

// ── Runtime execution context ─────────────────────────────────────────────────

export interface RuntimeExecutionContext {
  readonly executionId:     string;
  readonly planId:          string;
  readonly goalId:          string;
  readonly plan:            ExecutionPlan;
  readonly createdAt:       number;
  startedAt:                number | null;
  finishedAt:               number | null;
  status:                   ExecutionStatus;
  currentStepIndex:         number;
  stepResults:              StepResult[];
  cancelRequested:          boolean;
  timeoutAt:                number | null;
  /** ADR-004: typed contribution bag — each engine writes only its own section */
  readonly metadata:        Record<string, unknown>;
  /** ADR-004: typed population contract — preferred over metadata for new contributions */
  contribution:             Partial<RuntimeMetadata>;
}

// ── Capability executor interface (Dependency Inversion) ──────────────────────

export interface CapabilityExecutorInput {
  readonly executionId: string;
  readonly step:        ExecutionStep;
  readonly retryCtx:    RetryContext;
}

export interface CapabilityExecutorOutput {
  readonly status:  StepStatus;
  readonly output:  unknown;
  readonly error:   string | null;
}

export interface ICapabilityExecutor {
  /**
   * Executes a single capability step.
   * Must never throw — return a failed output instead.
   */
  execute(input: CapabilityExecutorInput): Promise<CapabilityExecutorOutput>;
}

// ── Runtime events (in-process only) ─────────────────────────────────────────

export type RuntimeEventType =
  | "execution_started"
  | "execution_step_started"
  | "execution_step_completed"
  | "execution_completed"
  | "execution_failed"
  | "execution_cancelled"
  | "execution_timeout";

export interface RuntimeEvent {
  readonly type:        RuntimeEventType;
  readonly executionId: string;
  readonly planId:      string;
  readonly goalId:      string;
  readonly stepId:      string | null;
  readonly connector:   string | null;
  readonly capability:  string | null;
  readonly status:      ExecutionStatus | StepStatus;
  readonly durationMs:  number | null;
  readonly timestamp:   number;
}

// ── RuntimeMetadata — ADR-004 — contrato de população do ExecutionReport ─────
//
// Cada Engine escreve SOMENTE a sua própria seção.
// O Runtime lê este objeto para montar o ExecutionReport final.
// Nenhum Engine escreve campos de outro Engine.
// Proprietários declarados — sem convenção implícita.

export interface RuntimeMetadataRouter {
  /** Proprietário: PrimaryConversationRouter */
  readonly userMessage:      string;
  readonly intent:           string;
  readonly intentConf:       number;
  readonly routingDecision:  string;
}

export interface RuntimeMetadataGoal {
  /** Proprietário: ConversationGoalBridge */
  readonly goalType:         string;
  readonly goalConfidence:   number;
}

export interface RuntimeMetadataConnector {
  /** Proprietário: ConnectorRuntime (via ctx.metadata após dispatch) */
  readonly connector:        string;
  readonly capability:       string;
  readonly executionDurationMs: number;
}

export interface RuntimeMetadataEpisode {
  /** Proprietário: EpisodeStore / CognitiveRuntime */
  readonly episodeId:        string;
}

export interface RuntimeMetadataKnowledge {
  /** Proprietário: KnowledgeStore */
  readonly knowledgeStoreBefore: number;
  readonly knowledgeStoreAfter:  number;
  readonly ksLastWriteId:        string;
}

// Seções tipadas — cada Engine contribui com a sua (null = Engine não executou)
export interface RuntimeMetadata {
  readonly router?:    RuntimeMetadataRouter;
  readonly goal?:      RuntimeMetadataGoal;
  readonly connector?: RuntimeMetadataConnector;
  readonly episode?:   RuntimeMetadataEpisode;
  readonly knowledge?: RuntimeMetadataKnowledge;
  /** Seções dos engines cognitivos (já tipadas em ExecutionReport) */
  readonly retrieval?: ExecutionReportRetrieval;
  readonly planner?:   ExecutionReportPlanner;
  readonly learning?:  ExecutionReportLearning;
  readonly memory?:    ExecutionReportMemory;
  readonly response?:  ExecutionReportResponse;
  /** Warnings acumulados durante execução */
  readonly warnings?:  readonly string[];
  /** Erro fatal capturado pelo Runtime */
  readonly fatalError?: string;
}

// ── ExecutionReport — ADR-003 — contrato oficial do Runtime ──────────────────
//
// Produzido exclusivamente pelo ConversationRuntimeEngine ao final de execute().
// Nenhuma outra camada monta este objeto.
// Consumidores (UI, Dashboard, Certification) apenas lêem — nunca reconstroem.

export interface ExecutionReportRetrieval {
  readonly reasoningId:       string;
  readonly rulesRetrieved:    number;
  readonly rulesUsed:         number;
  readonly inferenceDepth:    number;
  readonly decisionConf:      number;
  readonly knowledgeInjected: boolean;
  readonly contextLines:      number;
  readonly ksLastWriteId:     string;
}

export interface ExecutionReportPlanner {
  readonly planId:                  string | null;
  readonly steps:                   number;
  readonly mode:                    string;
  readonly success:                 boolean;
  readonly knowledgeRulesReceived:  number;
  readonly knowledgeInjected:       boolean;
}

export interface ExecutionReportLearning {
  readonly learningId:       string;
  readonly episodesAnalyzed: number;
  readonly knowledgeCreated: number;
  readonly patternsFound:    number;
  readonly patternsApproved: number;
  readonly learningConf:     number;
}

export interface ExecutionReportMemory {
  readonly total:       number;
  readonly validated:   number;
  readonly promoted:    number;
  readonly retrievable: number;
  readonly lastWriteId: string;
}

export interface ExecutionReportResponse {
  readonly responseId:        string;
  readonly chars:             number;
  readonly words:             number;
  readonly knowledgeInjected: boolean;
  readonly rulesInjected:     number;
  readonly retrievalId:       string | null;
}

export interface ExecutionReport {
  // Identity
  readonly executionId:   string;
  readonly userMessage:   string;
  readonly intent:        string | null;
  readonly intentConf:    number;
  readonly goalId:        string | null;
  readonly goalType:      string | null;
  readonly planId:        string | null;
  readonly connector:     string;
  readonly capability:    string;
  readonly episodeId:     string | null;

  // Knowledge chain
  readonly knowledgeStoreBefore: number;
  readonly knowledgeStoreAfter:  number;
  readonly knowledgeGrowth:      number;
  readonly ksLastWriteId:        string;

  // Engine sub-reports (null when engine was not invoked)
  readonly retrieval: ExecutionReportRetrieval | null;
  readonly planner:   ExecutionReportPlanner   | null;
  readonly learning:  ExecutionReportLearning  | null;
  readonly memory:    ExecutionReportMemory    | null;
  readonly response:  ExecutionReportResponse  | null;

  // Timing & health
  readonly totalDurationMs: number;
  readonly errors:          readonly string[];
  readonly warnings:        readonly string[];
}

// Retorno oficial de ConversationRuntimeEngine.execute() — ADR-003
export interface ExecutionWithReport {
  readonly executionResult: ExecutionResult;
  readonly executionReport: ExecutionReport;
}

// ── ID factory ────────────────────────────────────────────────────────────────

let _execSeq = 0;
export function makeExecutionId(): string {
  return `exec-rt-${Date.now()}-${(++_execSeq).toString(36)}`;
}