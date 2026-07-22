/**
 * PipelineSnapshot.ts — Sprint EF-55.1
 *
 * Snapshot de todos os artefatos reais do pipeline após uma execução.
 * Preenchido pelo RuntimeTraceCollector — zero construção manual.
 */

import type { GoalSnapshot }      from "./GoalSnapshot";
import type { ConnectorSnapshot } from "./ConnectorSnapshot";

export interface PipelineStepSnapshot {
  readonly stage:         string;
  readonly artifactId:    string;     // real ID from the engine output
  readonly capturedAt:    number;
  readonly durationMs:    number;
  readonly inputHash:     string;     // key fields summarized
  readonly outputHash:    string;     // key fields summarized
  readonly metrics:       Readonly<Record<string, number | string>>;
  readonly status:        "present" | "missing";
}

export interface PipelineSnapshot {
  readonly snapshotId:    string;
  readonly goal:          GoalSnapshot;
  readonly capturedAt:    number;
  readonly totalDurationMs: number;
  readonly steps:         readonly PipelineStepSnapshot[];
  readonly connector:     ConnectorSnapshot | null;
  readonly allPresent:    boolean;
  readonly missingStages: readonly string[];
}