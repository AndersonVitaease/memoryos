/**
 * AuditTypes.ts — EF-60B.1
 *
 * Tipos compartilhados entre o RuntimeArchitectureAuditor e todos os Analyzers.
 * Centralizado aqui para evitar dependencias circulares.
 */

import type { StageTraceEvent } from "@/lib/runtime-trace/OfficialRuntimeTraceStore";

export interface StageMetric {
  stage:    string;
  count:    number;
  totalMs:  number;
  avgMs:    number;
  minMs:    number;
  maxMs:    number;
  statuses: Record<string, number>;
}

export interface ArtifactRecord {
  artifactId:  string;
  stage:       string;
  executionId: string;
  runIndex:    number;
  createdAt:   number;
  durationMs:  number;
  status:      string;
}

export interface ContextFieldChange {
  field:    string;
  stage:    string;
  position: number;
  type:     "added";
}

export type NC_TYPE =
  | "STAGE_REPEATED"
  | "CHRONOLOGICAL_VIOLATION"
  | "MISSING_EXECUTION_ID"
  | "MISSING_ARTIFACT_ID"
  | "INCOMPLETE_TRACE"
  | "INCONSISTENT_DURATION"
  | "CONTEXT_BREAK"
  | "ZERO_EVENTS";

export interface NonConformity {
  id:          string;
  type:        NC_TYPE;
  description: string;
  evidence:    string;
  traceId?:    string;
  stage?:      string;
  position?:   number;
}

export interface TraceIntegrityScore {
  score:   number;
  label:   "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  details: string[];
}

export interface ExecutionMetrics {
  totalTraces:      number;
  completeTraces:   number;
  incompleteTraces: number;
  totalEvents:      number;
  totalArtifacts:   number;
  totalCtxChanges:  number;
  avgDurationMs:    number;
  minDurationMs:    number;
  maxDurationMs:    number;
  stageMetrics:     StageMetric[];
}

export interface AuditReport {
  generatedAt:     number;
  tracesAnalyzed:  number;
  metrics:         ExecutionMetrics;
  timeline:        StageTraceEvent[];
  ctxChangelog:    ContextFieldChange[];
  artifacts:       ArtifactRecord[];
  nonConformities: NonConformity[];
  integrity:       TraceIntegrityScore;
  stageSequences:  Array<{ runIndex: number; executionId: string; sequence: string[] }>;
}