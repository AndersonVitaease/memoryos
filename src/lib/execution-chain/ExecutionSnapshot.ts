// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11A — EF-08: ExecutionSnapshot
// The ONLY shape that Dashboard, monitoring, and external consumers may receive.
// Dashboard must NOT know ExecutionChainReport, ExecutionChain, or StageResult.
// ══════════════════════════════════════════════════════════════════════════════

export interface StageSnapshot {
  readonly stage:      string;
  readonly status:     "COMPLETED" | "FAILED" | "PENDING";
  readonly durationMs: number;
  readonly summary:    string;   // human-readable one-liner
}

export interface ExecutionSnapshot {
  readonly executionId:    string;
  readonly sessionId:      string;
  readonly status:         "COMPLETED" | "FAILED" | "PARTIAL";
  readonly startedAt:      number;
  readonly completedAt:    number;
  readonly totalDurationMs: number;
  readonly stagesPassed:   number;
  readonly stagesTotal:    number;
  readonly stages:         readonly StageSnapshot[];

  // Aggregate results — plain scalars only, no internal types
  readonly compliance:      "COMPLIANT" | "WARNING" | "VIOLATION" | null;
  readonly confidence:      number | null;
  readonly memorized:       boolean | null;
  readonly connectorUsed:   string | null;
  readonly intentType:      string | null;
  readonly humanSummary:    string | null;
}