// CognitivePipelineAdapterTypes.ts
// Sprint INT-01 · Engineering First
// Responsabilidade UNICA: definir todos os tipos do Cognitive Pipeline Adapter.
// Nao executa logica. Nao cria Engines. Apenas tipos.

// ── Pipeline Stage ──────────────────────────────────────────────────────────

export type PipelineStage =
  | "INTENT_ADAPTER"
  | "GOAL_RUNTIME"
  | "GOAL_REGISTRY"
  | "GOAL_SCHEDULER"
  | "EXECUTION_DISPATCHER"
  | "GOAL_EXECUTION_QUEUE"
  | "DECISION_ENGINE"
  | "PLANNING_ENGINE"
  | "REFLECTION_ENGINE"
  | "CAPABILITY_RUNTIME"
  | "MEMORY_ENGINE"
  | "KNOWLEDGE_ENGINE"
  | "RESPONSE";

export type PipelineStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

// ── Adapter Input / Output ───────────────────────────────────────────────────

export interface AdapterInput {
  /** The raw user message text */
  message: string;
  /** Base44 session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Optional project ID */
  projectId?: string;
  /** Additional metadata for intent detection (future: Intent Layer) */
  metadata?: Record<string, unknown>;
}

export interface AdapterOutput {
  /** Unique execution ID for this pipeline run */
  executionId: string;
  /** Whether the pipeline completed successfully */
  success: boolean;
  /** Final response text to surface to the UI */
  response: string;
  /** ID of the Goal created in Goal Runtime */
  goalId?: string;
  /** Duration in ms for the full pipeline */
  durationMs: number;
  /** Per-stage timing and status */
  stages: PipelineStageResult[];
  /** All logs emitted during this run */
  logs: PipelineLog[];
  /** Error if success=false */
  error?: string;
}

// ── Stage Result ─────────────────────────────────────────────────────────────

export interface PipelineStageResult {
  stage: PipelineStage;
  status: PipelineStatus;
  durationMs: number;
  detail?: string;
  error?: string;
}

// ── Logs ─────────────────────────────────────────────────────────────────────

export interface PipelineLog {
  executionId: string;
  pipelineStage: PipelineStage;
  module: string;
  status: PipelineStatus;
  duration: number;
  timestamp: number;
  detail?: string;
  error?: string;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export interface AdapterMetrics {
  /** Total pipeline executions started */
  executionTotal: number;
  /** Total successful completions */
  successTotal: number;
  /** Total failures */
  failureTotal: number;
  /** Average full-pipeline duration in ms */
  avgDurationMs: number;
  /** Average duration per stage (key = PipelineStage) */
  avgStageMs: Partial<Record<PipelineStage, number>>;
}

// ── Statistics ───────────────────────────────────────────────────────────────

export interface AdapterStatistics {
  executionTotal: number;
  successTotal: number;
  failureTotal: number;
  successRate: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  stageCounts: Partial<Record<PipelineStage, number>>;
  stageFailures: Partial<Record<PipelineStage, number>>;
}

// ── Health ────────────────────────────────────────────────────────────────────

export interface AdapterHealth {
  status: "SUCCESS" | "FAILED";
  checks: {
    goalRuntime: boolean;
    goalRegistry: boolean;
    goalScheduler: boolean;
    executionDispatcher: boolean;
    decisionEngine: boolean;
    planningEngine: boolean;
    reflectionEngine: boolean;
    capabilityRuntime: boolean;
    memoryEngine: boolean;
    knowledgeEngine: boolean;
  };
  details: string;
}

// ── Test Types ────────────────────────────────────────────────────────────────

export interface AdapterTestResult {
  criterion: number;
  name: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
  error?: string;
}

export interface AdapterTestSuite {
  passed: number;
  total: number;
  durationMs: number;
  results: AdapterTestResult[];
  health: AdapterHealth;
  statistics: AdapterStatistics;
  metrics: AdapterMetrics;
}