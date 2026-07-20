/**
 * DriveAuditStore.ts — SPRINT M1.11 — Forensic Audit Mode (READ-ONLY)
 *
 * Singleton in-memory store for Drive pipeline execution evidence.
 * ZERO business logic. ZERO side effects on the pipeline.
 * All writes are guarded by AUDIT_MODE flag.
 * All reads are safe at any time.
 */

// ── AUDIT MODE FLAG ────────────────────────────────────────────────────────────
// Set to false to disable ALL instrumentation with zero performance impact.
export const AUDIT_MODE = true;

// ── Evidence types ─────────────────────────────────────────────────────────────

export interface AuditStep {
  id:          string;
  label:       string;
  status:      "pending" | "ok" | "error" | "skipped";
  startedAt:   number | null;
  finishedAt:  number | null;
  durationMs:  number | null;
  data:        unknown;
  error:       string | null;
}

export interface DriveAuditTrace {
  executionId:  string;
  userMessage:  string;
  startedAt:    number;
  finishedAt:   number | null;
  steps:        AuditStep[];
}

// Step IDs in execution order
export const DRIVE_AUDIT_STEPS = [
  "pipeline",
  "goal",
  "planner",
  "runtime",
  "drive_search",
  "metadata",
  "download",
  "download_result",
  "synthesizer",
] as const;

export type DriveAuditStepId = typeof DRIVE_AUDIT_STEPS[number];

const STEP_LABELS: Record<DriveAuditStepId, string> = {
  pipeline:        "1. ConversationPipeline",
  goal:            "2. Goal",
  planner:         "3. Planner",
  runtime:         "4. Runtime",
  drive_search:    "5. Drive Search",
  metadata:        "6. Metadata",
  download:        "7. Download",
  download_result: "8. DownloadResult",
  synthesizer:     "9. Synthesizer",
};

function makeStep(id: DriveAuditStepId): AuditStep {
  return {
    id,
    label:      STEP_LABELS[id],
    status:     "pending",
    startedAt:  null,
    finishedAt: null,
    durationMs: null,
    data:       null,
    error:      null,
  };
}

// ── Store class ────────────────────────────────────────────────────────────────

class DriveAuditStoreClass {
  private _trace: DriveAuditTrace | null = null;
  private _listeners: Set<() => void> = new Set();

  beginTrace(executionId: string, userMessage: string): void {
    if (!AUDIT_MODE) return;
    this._trace = {
      executionId,
      userMessage,
      startedAt:  Date.now(),
      finishedAt: null,
      steps:      DRIVE_AUDIT_STEPS.map(makeStep),
    };
    this._notify();
  }

  record(
    stepId:    DriveAuditStepId,
    status:    "ok" | "error" | "skipped",
    data:      unknown,
    startedAt?: number,
    error?:    string,
  ): void {
    if (!AUDIT_MODE || !this._trace) return;
    const now     = Date.now();
    const started = startedAt ?? now;
    this._trace = {
      ...this._trace,
      steps: this._trace.steps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              status,
              startedAt:  started,
              finishedAt: now,
              durationMs: now - started,
              data,
              error: error ?? null,
            }
          : s
      ),
    };
    this._notify();
  }

  finishTrace(): void {
    if (!AUDIT_MODE || !this._trace) return;
    this._trace = { ...this._trace, finishedAt: Date.now() };
    this._notify();
  }

  get trace(): DriveAuditTrace | null {
    return this._trace;
  }

  subscribe(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  private _notify(): void {
    this._listeners.forEach((l) => l());
  }
}

// ── Singleton (HMR-safe) ───────────────────────────────────────────────────────

const _KEY = "__DRIVE_AUDIT_STORE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new DriveAuditStoreClass();
}

export const driveAuditStore: DriveAuditStoreClass = (
  globalThis as unknown as Record<string, DriveAuditStoreClass>
)[_KEY];