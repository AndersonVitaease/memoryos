/**
 * CTPTypes.ts — Phase 5.9.0
 * Cognitive Task Planner · Type Definitions
 */

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type ExecutionStrategy = "sequential" | "parallel" | "conditional";
export type ConnectorTarget = "github" | "base44" | "memory" | "official_library" | "specialist";
export type SpecialistType = "architecture" | "engineering" | "business" | "documentation" | "security";
export type TaskComplexity = "trivial" | "simple" | "moderate" | "complex";

// ── Detected Intent ───────────────────────────────────────────────────────────

export interface DetectedIntent {
  intentId:          string;
  description:       string;
  category:          string;
  priority:          number;          // 1 (highest) – 10
  confidence:        number;          // 0–1
  dependencies:      string[];        // intentIds this depends on
  complexity:        TaskComplexity;
  executionStrategy: ExecutionStrategy;
  requiredConnectors: ConnectorTarget[];
  requiredCapabilities: string[];
  extractedEntities: Record<string, string>; // e.g. { symbol: "ConnectionManager", file: "..." }
}

// ── Task Node in Execution Graph ──────────────────────────────────────────────

export interface TaskNode {
  taskId:      string;
  intentId:    string;
  name:        string;
  description: string;
  connector:   ConnectorTarget;
  capability:  string;
  payload:     Record<string, unknown>;
  status:      TaskStatus;
  dependsOn:   string[];         // taskIds
  canParallel: boolean;
  priority:    number;
  result:      TaskResult | null;
  startedAt:   number | null;
  completedAt: number | null;
  durationMs:  number | null;
}

// ── Task Result ───────────────────────────────────────────────────────────────

export interface TaskResult {
  taskId:     string;
  status:     TaskStatus;
  data:       unknown;
  evidence:   string[];
  confidence: number;
  error:      string | null;
}

// ── Execution Graph ───────────────────────────────────────────────────────────

export interface ExecutionGraph {
  graphId:       string;
  userMessage:   string;
  intents:       DetectedIntent[];
  tasks:         TaskNode[];
  criticalPath:  string[];           // taskIds in critical path order
  parallelGroups: string[][];        // groups of taskIds that can run in parallel
  estimatedMs:   number;
  createdAt:     number;
}

// ── Evidence Fusion ───────────────────────────────────────────────────────────

export interface EvidenceItem {
  source:     ConnectorTarget;
  capability: string;
  value:      string;
  confidence: number;
  taskId:     string;
}

export interface FusedEvidence {
  items:            EvidenceItem[];
  overallConfidence: number;
  sourcesSummary:   string[];
  conflicts:        string[];
}

// ── Plan Execution Result ─────────────────────────────────────────────────────

export interface PlanExecutionResult {
  planId:         string;
  graph:          ExecutionGraph;
  completedTasks: TaskNode[];
  failedTasks:    TaskNode[];
  skippedTasks:   TaskNode[];
  fusedEvidence:  FusedEvidence;
  overallStatus:  "SUCCESS" | "PARTIAL" | "FAILED";
  confidence:     number;
  durationMs:     number;
  recoveryEvents: RecoveryEvent[];
  narrative:      string;
  taskData:       Record<string, unknown>; // taskId -> data
}

// ── Recovery Event ────────────────────────────────────────────────────────────

export interface RecoveryEvent {
  taskId:      string;
  failureType: string;
  strategy:    string;
  outcome:     string;
  timestamp:   number;
}

// ── Planner Diagnostics ───────────────────────────────────────────────────────

export interface PlannerDiagnostic {
  planId:      string;
  userMessage: string;
  graph:       ExecutionGraph;
  result:      PlanExecutionResult;
  timestamp:   number;
}

export function makeCTPId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}