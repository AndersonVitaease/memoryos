/**
 * AutonomousEngineeringLoop.ts — Sprint 6.3.3
 * Main entry point — runs the full engineering loop for an objective
 */

import { ExecutionContext } from "./ExecutionContext";
import { ExecutionCoordinator } from "./ExecutionCoordinator";
import { ExecutionHistory } from "./ExecutionHistory";
import { ExecutionMetrics } from "./ExecutionMetrics";
import { ExecutionReporter } from "./ExecutionReporter";
import { ExecutionDashboard } from "./ExecutionDashboard";
import { ExecutionEvidence } from "./ExecutionEvidence";
import type { AELStage, StageResult, AELReport } from "./AELTypes";
import type { ExecutionContextData } from "./ExecutionContext";

export class AutonomousEngineeringLoop {
  public history    = new ExecutionHistory();
  public metrics    = new ExecutionMetrics();
  public reporter   = new ExecutionReporter();
  public dashboard  = new ExecutionDashboard();
  public evidence   = new ExecutionEvidence();

  private _active:   ExecutionContext | null = null;
  private _log:      string[] = [];

  onStageChange?: (ctx: ExecutionContextData, stage: AELStage, result: StageResult) => void;
  onComplete?:    (report: AELReport) => void;

  async run(objective: string): Promise<AELReport> {
    const ctx  = new ExecutionContext(objective);
    this._active = ctx;
    this._log.push(`[AEL] Starting execution: "${objective.slice(0, 60)}"`);

    const coordinator = new ExecutionCoordinator();
    coordinator.onStageChange = (stage, result) => {
      this.onStageChange?.(ctx.data, stage, result);
    };

    await coordinator.execute(ctx);

    // Merge evidence from coordinator into this loop's store
    for (const e of coordinator.evidence.all()) {
      this.evidence.capture(e.executionId, e.stage, e.kind, e.label, e.value);
    }

    const report = this.reporter.generate(ctx);

    this.history.addContext(ctx.data);
    this.history.addReport(report);
    this.metrics.recordRun({
      durationMs:       ctx.durationMs,
      stagesCompleted:  ctx.data.stageResults.length,
      reused:           (ctx.data.plan?.reuseOpportunities.length ?? 0) > 0,
      approved:         ctx.data.approved,
      rolledBack:       false,
      recovered:        ctx.data.state === "RECOVERING",
      accepted:         ctx.data.acceptanceScore >= 80,
      ready:            ctx.data.state === "READY",
    });

    this._active = null;
    this._log.push(`[AEL] Execution complete — state: ${ctx.data.state}`);
    this.onComplete?.(report);

    return report;
  }

  activeContext(): ExecutionContextData | null { return this._active?.data ?? null; }
  isRunning(): boolean { return this._active !== null; }
  log(): string[] { return [...this._log]; }

  dashboardState() {
    return this.dashboard.build(
      this._active?.data ?? null,
      this.history.allContexts(),
      this.history.allReports(),
      this.metrics.snapshot(),
      this.evidence.count(),
      this.evidence.count(),
      0
    );
  }
}