// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11 — Execution Chain Types
// Canonical type contracts for the full 13-stage execution pipeline.
// Every stage result carries its own `evidence` string for Explainability.
// ══════════════════════════════════════════════════════════════════════════════

export type ChainStage =
  | "USER_INPUT"
  | "INTENT_RUNTIME"
  | "GOAL_RUNTIME"
  | "PLANNING_RUNTIME"
  | "KERNEL"
  | "RUNTIME_ORCHESTRATOR"
  | "CAPABILITY_RUNTIME"
  | "CONNECTOR_RUNTIME"
  | "CONNECTOR"
  | "RESULT"
  | "MEMORY"
  | "EXPLAINABILITY"
  | "AUDIT";

export type ChainStageStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";

export interface UserInput {
  readonly text: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly timestamp: number;
  readonly metadata?: Record<string, unknown>;
}

export interface IntentResult {
  readonly intentType: string;
  readonly confidence: number;
  readonly entities: Record<string, string>;
  readonly slots: Record<string, string>;
  readonly requiresConnector: boolean;
  readonly requiresPlanning: boolean;
  readonly evidence?: string;
}

export interface GoalResult {
  readonly goalId: string;
  readonly goalType: string;
  readonly description: string;
  readonly subGoals: string[];
  readonly priority: number;
  readonly constraints: string[];
  readonly evidence?: string;
}

export interface PlanResult {
  readonly planId: string;
  readonly steps: PlanStep[];
  readonly estimatedDurationMs: number;
  readonly confidence: number;
  readonly evidence?: string;
}

export interface PlanStep {
  readonly stepId: string;
  readonly action: string;
  readonly capabilityId: string;
  readonly connectorId: string;
  readonly params: Record<string, unknown>;
  readonly dependsOn: string[];
}

export interface KernelResult {
  readonly sessionToken: string;
  readonly resourceLimits: { maxTimeMs: number; maxRetries: number };
  readonly securityContext: { userId: string; scopes: string[] };
  readonly routingDecision: string;
  readonly evidence?: string;
}

export interface OrchestratorResult {
  readonly orchestrationId: string;
  readonly selectedCapability: string;
  readonly selectedConnector: string;
  readonly executionParams: Record<string, unknown>;
  readonly fallbackChain: string[];
  readonly evidence?: string;
}

export interface CapabilityResult {
  readonly capabilityId: string;
  readonly capabilityName: string;
  readonly inputValidated: boolean;
  readonly outputSchema: string;
  readonly executionPolicy: string;
  readonly evidence?: string;
}

export interface ConnectorRuntimeResult {
  readonly connectorRuntimeId: string;
  readonly connectionEstablished: boolean;
  readonly rateLimitRemaining: number;
  readonly authMethod: string;
  readonly evidence?: string;
}

export interface ConnectorResult {
  readonly connectorId: string;
  readonly connectorName: string;
  readonly rawResponse: unknown;
  readonly responseStatus: number;
  readonly latencyMs: number;
  readonly evidence?: string;
}

export interface ResultOutput {
  readonly outputId: string;
  readonly data: unknown;
  readonly format: string;
  readonly confidence: number;
  readonly sources: string[];
  readonly evidence?: string;
}

export interface MemoryResult {
  readonly memorized: boolean;
  readonly memoryId: string;
  readonly tier: "ACTIVE" | "HISTORICAL" | "ARCHIVED";
  readonly knowledgeExtracted: string[];
  readonly entitiesStored: number;
  readonly evidence?: string;
}

export interface ExplainabilityResult {
  readonly traceId: string;
  readonly stagesExecuted: string[];
  readonly decisionLog: string[];
  readonly humanReadableSummary: string;
  readonly confidenceScore: number;
}

export interface AuditResult {
  readonly auditId: string;
  readonly complianceStatus: "COMPLIANT" | "WARNING" | "VIOLATION";
  readonly violations: string[];
  readonly auditedAt: number;
  readonly signature: string;
}

export interface ChainStageRecord {
  readonly stage: ChainStage;
  readonly status: ChainStageStatus;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly durationMs: number | null;
  readonly input: unknown;
  readonly output: unknown;
  readonly error: string | null;
}

export interface ExecutionChainReport {
  readonly chainId: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly totalDurationMs: number;
  readonly status: "COMPLETED" | "FAILED" | "PARTIAL";
  readonly stages: ChainStageRecord[];
  readonly userInput: UserInput;
  readonly finalOutput: ResultOutput | null;
  readonly memoryResult: MemoryResult | null;
  readonly explainabilityResult: ExplainabilityResult | null;
  readonly auditResult: AuditResult | null;
  readonly stagesPassed: number;
  readonly stagesTotal: number;
}