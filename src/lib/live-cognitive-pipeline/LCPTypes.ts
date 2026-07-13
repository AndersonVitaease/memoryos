/**
 * LCPTypes.ts — Live Cognitive Pipeline Types
 * Phase 5.4 · MemoryOS Core · 2026-07-13
 *
 * Single source of truth for all pipeline data structures.
 * No engine may bypass the LiveCognitivePipeline.
 */

// ── ID helpers ────────────────────────────────────────────────────────────────

let _seq = 0;
export function makeLCPId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++_seq).toString(36)}`;
}

// ── Execution Context ─────────────────────────────────────────────────────────

export interface PipelineExecutionContext {
  executionId:        string;
  correlationId:      string;
  goalId:             string | null;
  projectId:          string;
  timestamp:          number;
  connectorEvidence:  string[];
  knowledgeEvidence:  string[];
  userApprovalGiven:  boolean;
  pipelineVersion:    string;
}

// ── Provenance ────────────────────────────────────────────────────────────────

export interface StageProvenance {
  stageId:         string;
  stageName:       string;
  engine:          string;
  inputSource:     string;
  executionTimeMs: number;
  confidence:      number;
  evidence:        string[];
  transformation:  string;
  timestamp:       number;
}

// ── Stage Result ──────────────────────────────────────────────────────────────

export type StageStatus = "SUCCESS" | "SKIPPED" | "FAILED" | "NOT_CONFIGURED";

export interface StageResult {
  stageId:     string;
  stageName:   string;
  status:      StageStatus;
  durationMs:  number;
  output:      Record<string, unknown>;
  error:       string | null;
  provenance:  StageProvenance;
  recovery:    string | null;
}

// ── Recovery ─────────────────────────────────────────────────────────────────

export interface PipelineRecoveryReport {
  id:             string;
  triggeredAt:    number;
  affectedStage:  string;
  cause:          string;
  strategy:       string;
  continuedWith:  string[];
  skippedStages:  string[];
  graceful:       boolean;
}

// ── Live Project Snapshot ─────────────────────────────────────────────────────

export interface LiveProjectSnapshot {
  id:               string;
  generatedAt:      number;
  executionId:      string;
  repositoryState:  Record<string, unknown>;
  applicationState: Record<string, unknown>;
  knowledgeState:   Record<string, unknown>;
  identityState:    Record<string, unknown>;
  projectState:     Record<string, unknown>;
  goalState:        Record<string, unknown>;
  learningState:    Record<string, unknown>;
  confidence:       number;
  evidence:         string[];
  provenanceChain:  StageProvenance[];
}

// ── Pipeline Report ────────────────────────────────────────────────────────────

export type PipelineStatus = "OPERATIONAL" | "DEGRADED" | "PARTIAL" | "FAILED" | "NOT_CONFIGURED";

export interface LiveCognitivePipelineReport {
  id:              string;
  generatedAt:     number;
  durationMs:      number;
  status:          PipelineStatus;
  certified:       boolean;
  context:         PipelineExecutionContext;
  stages:          StageResult[];
  stagesPassed:    number;
  stagesTotal:     number;
  recoveryEvents:  PipelineRecoveryReport[];
  snapshot:        LiveProjectSnapshot;
  provenanceChain: StageProvenance[];
  summary:         string;
}