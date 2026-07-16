/**
 * MultiConnectorExecutionPlan.ts — Engineering Sprint 8.0
 * Types for the Multi-Connector Orchestration Engine (MCOE).
 * Zero dependencies on Core layers.
 */

// ── Execution node ────────────────────────────────────────────────────────────

export type NodeStatus = "pending" | "running" | "success" | "failed" | "skipped";
export type ExecMode   = "parallel" | "sequential";

export interface ExecutionNode {
  id:           string;           // e.g. "cal-today"
  connectorId:  string;           // "calendar" | "drive" | "gmail"
  capabilityId: string;           // "calendar.today"
  parameters:   Record<string, unknown>;
  dependsOn:    string[];         // node ids that must complete first
  mode:         ExecMode;
  timeoutMs:    number;
  retries:      number;
  label:        string;           // human-readable
}

export interface ExecutionNodeResult {
  nodeId:     string;
  status:     NodeStatus;
  output:     unknown;
  error:      string | null;
  startedAt:  number;
  finishedAt: number;
  durationMs: number;
  retryCount: number;
}

// ── Execution plan ────────────────────────────────────────────────────────────

export interface MultiConnectorExecutionPlan {
  id:          string;
  intentId:    string;
  rawQuery:    string;
  scenarioId:  string;            // "documents_from_meeting" | "client_summary" | "pending_before_meeting"
  nodes:       ExecutionNode[];
  createdAt:   number;
}

// ── Execution result ──────────────────────────────────────────────────────────

export interface MultiConnectorExecutionResult {
  planId:        string;
  intentId:      string;
  nodeResults:   ExecutionNodeResult[];
  unifiedContext:UnifiedContext;
  totalDurationMs: number;
  parallelSavingsMs: number;
  startedAt:     number;
  finishedAt:    number;
  success:       boolean;
  partialFailures: string[];  // nodeIds that failed
}

// ── Unified context ────────────────────────────────────────────────────────────

export interface UnifiedContext {
  calendarEvents: unknown[];
  driveFiles:     unknown[];
  gmailMessages:  unknown[];
  summary:        string;
  sources:        string[];   // connectorIds that contributed
  mergedAt:       number;
}

// ── Scenario templates ────────────────────────────────────────────────────────

export type ScenarioId =
  | "documents_from_meeting"
  | "client_summary"
  | "pending_before_meeting"
  | "custom";