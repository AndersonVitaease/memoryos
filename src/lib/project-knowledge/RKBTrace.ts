/**
 * RKBTrace.ts — EF-60.2.1
 * Phase 6.0.2 · MemoryOS · 2026-07-14
 *
 * Runtime trace collector for RepositoryKnowledgeBuilder.
 * Records every execution step with timing and diagnostics.
 * Read-only by all consumers; only RKBInstrumented writes.
 */

export type TraceStatus = "pending" | "running" | "ok" | "skipped" | "failed";

export interface TraceStep {
  id:        number;
  label:     string;
  status:    TraceStatus;
  startMs:   number;
  endMs:     number | null;
  durationMs: number | null;
  detail:    string;
  data:      Record<string, unknown>;
  error:     string | null;
}

export interface FileTrace {
  path:          string;
  language:      string;
  lines:         number;
  fetchStatus:   "ok" | "failed" | "empty";
  parseStatus:   "ok" | "skipped" | "failed";
  parseDurationMs: number;
  classes:       string[];
  interfaces:    string[];
  enums:         string[];
  functions:     number;
  types:         number;
  imports:       number;
  exports:       number;
  constants:     number;
  entitiesExtracted: number;
  entityName:    string;
  layer:         string;
  skipReason:    string | null;
  error:         string | null;
}

export interface RKBRunTrace {
  runId:        string;
  startedAt:    number;
  finishedAt:   number | null;
  durationMs:   number | null;
  owner:        string;
  repo:         string;
  branch:       string;
  steps:        TraceStep[];
  fileTraces:   FileTrace[];

  // Tree validation (EF-60.2.2)
  reposFound:       number;
  selectedRepo:     string;
  defaultBranch:    string;
  treeDownloaded:   boolean;
  totalTreeNodes:   number;
  ignoredNodes:     number;
  eligibleFiles:    number;
  skippedFiles:     number;
  skipReasons:      Record<string, number>;

  // Final counters
  entitiesTotal:    number;
  relationshipsTotal: number;
  modulesTotal:     number;
  persistenceStatus: "ok" | "failed" | "not_attempted";
  persistedAt:      number | null;

  // Failure analysis (EF-60.2.12)
  firstFailingStage: string | null;
  failureReason:    string | null;
  graphEmpty:       boolean;
}

class RKBTraceStore {
  private _current: RKBRunTrace | null = null;
  private _history: RKBRunTrace[] = [];

  begin(owner: string, repo: string, branch: string): RKBRunTrace {
    const run: RKBRunTrace = {
      runId:        `rkb-${Date.now()}`,
      startedAt:    Date.now(),
      finishedAt:   null,
      durationMs:   null,
      owner, repo, branch,
      steps:        [],
      fileTraces:   [],
      reposFound:       0,
      selectedRepo:     "",
      defaultBranch:    "",
      treeDownloaded:   false,
      totalTreeNodes:   0,
      ignoredNodes:     0,
      eligibleFiles:    0,
      skippedFiles:     0,
      skipReasons:      {},
      entitiesTotal:    0,
      relationshipsTotal: 0,
      modulesTotal:     0,
      persistenceStatus: "not_attempted",
      persistedAt:      null,
      firstFailingStage: null,
      failureReason:    null,
      graphEmpty:       true,
    };
    this._current = run;
    return run;
  }

  addStep(run: RKBRunTrace, label: string, detail: string, data: Record<string, unknown> = {}): TraceStep {
    const step: TraceStep = {
      id:         run.steps.length + 1,
      label,
      status:     "running",
      startMs:    Date.now(),
      endMs:      null,
      durationMs: null,
      detail,
      data,
      error:      null,
    };
    run.steps.push(step);
    return step;
  }

  finishStep(step: TraceStep, status: TraceStatus, detail?: string, data?: Record<string, unknown>, error?: string): void {
    step.status    = status;
    step.endMs     = Date.now();
    step.durationMs = step.endMs - step.startMs;
    if (detail) step.detail = detail;
    if (data)   Object.assign(step.data, data);
    if (error)  step.error  = error;
  }

  finish(run: RKBRunTrace): void {
    run.finishedAt = Date.now();
    run.durationMs = run.finishedAt - run.startedAt;
    run.graphEmpty = run.entitiesTotal === 0;

    // Auto-detect first failing stage (EF-60.2.12)
    if (run.graphEmpty) {
      for (const step of run.steps) {
        if (step.status === "failed") {
          run.firstFailingStage = step.label;
          run.failureReason     = step.error ?? step.detail;
          break;
        }
      }
      if (!run.firstFailingStage) {
        // Find the last "ok" step and infer what stopped after it
        const lastOk = [...run.steps].reverse().find(s => s.status === "ok");
        if (!lastOk) {
          run.firstFailingStage = "Repository Discovery";
          run.failureReason     = "No steps completed successfully";
        } else if (run.treeDownloaded && run.eligibleFiles === 0) {
          run.firstFailingStage = "File Filter";
          run.failureReason     = `Tree downloaded (${run.totalTreeNodes} nodes) but 0 eligible source files found`;
        } else if (run.eligibleFiles > 0 && run.entitiesTotal === 0) {
          run.firstFailingStage = "Entity Builder";
          run.failureReason     = `${run.eligibleFiles} files eligible but 0 entities extracted — parser may have returned empty results`;
        } else if (!run.treeDownloaded) {
          run.firstFailingStage = "Repository Tree Download";
          run.failureReason     = "Tree was not downloaded";
        }
      }
    }

    if (this._history.length >= 5) this._history.shift();
    this._history.push(run);
    this._current = null;
  }

  current(): RKBRunTrace | null  { return this._current; }
  latest():  RKBRunTrace | null  { return this._history[this._history.length - 1] ?? null; }
  history(): RKBRunTrace[]       { return [...this._history]; }
}

export const RKBTracer = new RKBTraceStore();