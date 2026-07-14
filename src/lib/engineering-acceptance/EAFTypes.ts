/**
 * EAFTypes.ts — Sprint 6.3.2
 * Engineering Acceptance Framework — shared type definitions
 */

export type AcceptanceStatus = "PASS" | "FAIL" | "SKIP" | "BLOCKED" | "PENDING" | "RUNNING";
export type AcceptanceCategory =
  | "REGRESSION_SHIELD" | "SMOKE" | "ACCEPTANCE" | "GOVERNANCE"
  | "ARCHITECTURE" | "MEMORY" | "RUNTIME" | "CONNECTOR";

export type EvidenceKind = "LOG" | "SNAPSHOT" | "METRIC" | "STATE_BEFORE" | "STATE_AFTER" | "DURATION";

export interface AcceptanceCriterion {
  id: string;
  description: string;
  category: AcceptanceCategory;
  mandatory: boolean;
  timeout?: number; // ms
}

export interface AcceptanceEvidence {
  id: string;
  criterionId: string;
  kind: EvidenceKind;
  label: string;
  value: unknown;
  capturedAt: number;
}

export interface AcceptanceAssertionResult {
  criterionId: string;
  description: string;
  category: AcceptanceCategory;
  status: AcceptanceStatus;
  detail: string;
  durationMs: number;
  evidence: AcceptanceEvidence[];
  rca?: string;
}

export interface SprintRegistration {
  sprintId: string;
  objective: string;
  criteria: AcceptanceCriterion[];
  registeredAt: number;
}

export interface AcceptanceRunResult {
  id: string;
  sprintId: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  status: AcceptanceStatus;
  assertions: AcceptanceAssertionResult[];
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  total: number;
  score: number; // 0-100
  ready: boolean;
  confidence: number; // 0-100
  blockers: string[];
  reportId: string;
}

export interface AcceptanceReport {
  id: string;
  sprintId: string;
  runId: string;
  generatedAt: number;
  summary: string;
  ready: boolean;
  score: number;
  confidence: number;
  assertions: AcceptanceAssertionResult[];
  blockers: string[];
  evidenceCount: number;
  totalDurationMs: number;
}

export interface AcceptanceAuditEntry {
  id: string;
  sprintId: string;
  runId: string;
  actor: string;
  action: "RUN_STARTED" | "RUN_COMPLETED" | "APPROVED" | "REJECTED" | "EVIDENCE_CAPTURED";
  result: AcceptanceStatus;
  reason: string;
  timestamp: number;
}

export interface AcceptanceMetricSnapshot {
  totalRuns: number;
  passRate: number;
  failRate: number;
  avgDurationMs: number;
  avgScore: number;
  avgConfidence: number;
  reruns: number;
  recoveryMs: number;
  lastRunAt: number | null;
}