/**
 * AcceptanceEngine.ts — Sprint 6.3.2
 * Core engine — orchestrates registry, runner, validator, reporter
 */

import type { AcceptanceRunResult, AcceptanceReport } from "./EAFTypes";
import { AcceptanceRunner } from "./AcceptanceRunner";
import { AcceptanceDashboard } from "./AcceptanceDashboard";
import { AcceptanceEvidenceStore } from "./AcceptanceEvidence";
import { AcceptanceReporter } from "./AcceptanceReporter";
import { globalRegistry } from "./AcceptanceRegistry";
import type { AcceptanceCriterion } from "./EAFTypes";
import type { AcceptanceScenario } from "./AcceptanceScenario";

export class AcceptanceEngine {
  public runner    = new AcceptanceRunner();
  public evidence  = new AcceptanceEvidenceStore();
  public dashboard = new AcceptanceDashboard();
  public reporter  = new AcceptanceReporter();

  private _queue:   string[] = [];
  private _running: string | null = null;
  private _log:     string[] = [];

  onProgress?: (stage: string, done: number, total: number) => void;

  // ── Sprint registration ──────────────────────────────────────────────────

  registerSprint(
    sprintId: string,
    objective: string,
    criteria: AcceptanceCriterion[],
    scenarios: AcceptanceScenario[]
  ): void {
    globalRegistry.register(sprintId, objective, criteria);
    globalRegistry.bindScenarios(sprintId, scenarios);
    this._log.push(`[EAF] Sprint ${sprintId} registered — ${criteria.length} criteria, ${scenarios.length} scenarios`);
  }

  // ── Queue management ─────────────────────────────────────────────────────

  enqueue(sprintId: string): void {
    if (!this._queue.includes(sprintId)) {
      this._queue.push(sprintId);
      this._log.push(`[EAF] Sprint ${sprintId} enqueued`);
    }
  }

  dequeue(): string | undefined { return this._queue.shift(); }

  queue(): string[] { return [...this._queue]; }

  // ── Run ──────────────────────────────────────────────────────────────────

  async runSprint(sprintId: string): Promise<AcceptanceRunResult> {
    this._running = sprintId;
    this._log.push(`[EAF] Running acceptance for sprint ${sprintId}`);
    this.runner.onProgress = this.onProgress;
    try {
      const result = await this.runner.run(sprintId, globalRegistry);
      this._log.push(`[EAF] Sprint ${sprintId} — ${result.ready ? "READY ✅" : "NOT READY ❌"} — score=${result.score}% confidence=${result.confidence}%`);
      return result;
    } finally {
      this._running = null;
      // Remove from queue if present
      this._queue = this._queue.filter(id => id !== sprintId);
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────

  getReport(runResult: AcceptanceRunResult): AcceptanceReport {
    return this.reporter.generate(runResult);
  }

  // ── Dashboard state ──────────────────────────────────────────────────────

  dashboardState() {
    return this.dashboard.buildState(
      globalRegistry.all(),
      this._queue,
      this._running,
      this.runner.history,
      this.runner.metrics,
      this.runner.audit,
      this.evidence.count()
    );
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  history()  { return this.runner.history; }
  metrics()  { return this.runner.metrics; }
  audit()    { return this.runner.audit; }
  log()      { return [...this._log]; }
  running()  { return this._running; }
  isRunning(){ return this._running !== null; }
}