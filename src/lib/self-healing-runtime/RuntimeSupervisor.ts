/**
 * RuntimeSupervisor.ts — Sprint 6.3.1
 * Central supervisor — coordinates Watcher, Snapshot, DependencyResolver,
 * RestartManager, Recovery, Warmup, Restore, Audit, Health, and Metrics.
 *
 * Responds automatically to WatchEvents with zero human intervention.
 */

import type { RuntimeState, ModuleState, WatchTrigger } from "./SHRTypes";
import { RuntimeEventBus }        from "./RuntimeEventBus";
import { RuntimeLifecycle }       from "./RuntimeLifecycle";
import { RuntimeWatcher }         from "./RuntimeWatcher";
import { RuntimeStateSnapshot }   from "./RuntimeStateSnapshot";
import { RuntimeDependencyResolver } from "./RuntimeDependencyResolver";
import { RuntimeRestartManager }  from "./RuntimeRestartManager";
import { RuntimeRecovery }        from "./RuntimeRecovery";
import { RuntimeWarmup }          from "./RuntimeWarmup";
import { RuntimeRestore }         from "./RuntimeRestore";
import { RuntimeHealth }          from "./RuntimeHealth";
import { RuntimeAudit }           from "./RuntimeAudit";
import { RuntimeMetrics }         from "./RuntimeMetrics";
import { RuntimeDiagnostics }     from "./RuntimeDiagnostics";
import { RuntimeRecoveryHistory } from "./RuntimeRecoveryHistory";

export class RuntimeSupervisor {
  readonly bus:            RuntimeEventBus;
  readonly lifecycle:      RuntimeLifecycle;
  readonly watcher:        RuntimeWatcher;
  readonly snapshot:       RuntimeStateSnapshot;
  readonly resolver:       RuntimeDependencyResolver;
  readonly restartManager: RuntimeRestartManager;
  readonly recovery:       RuntimeRecovery;
  readonly warmup:         RuntimeWarmup;
  readonly restore:        RuntimeRestore;
  readonly health:         RuntimeHealth;
  readonly audit:          RuntimeAudit;
  readonly metrics:        RuntimeMetrics;
  readonly diagnostics:    RuntimeDiagnostics;
  readonly recoveryHistory:RuntimeRecoveryHistory;

  private _log: string[] = [];
  private _running = false;

  constructor() {
    this.bus             = new RuntimeEventBus();
    this.lifecycle       = new RuntimeLifecycle(this.bus);
    this.watcher         = new RuntimeWatcher(this.bus);
    this.snapshot        = new RuntimeStateSnapshot();
    this.resolver        = new RuntimeDependencyResolver();
    this.restartManager  = new RuntimeRestartManager(this.resolver, this.bus);
    this.recovery        = new RuntimeRecovery(this.bus);
    this.warmup          = new RuntimeWarmup();
    this.restore         = new RuntimeRestore();
    this.health          = new RuntimeHealth();
    this.audit           = new RuntimeAudit();
    this.metrics         = new RuntimeMetrics();
    this.diagnostics     = new RuntimeDiagnostics();
    this.recoveryHistory = new RuntimeRecoveryHistory();
  }

  async start(): Promise<void> {
    if (this._running) return;
    this._running = true;
    this._log = [];

    this.lifecycle.transition("STARTING");
    this._log.push(`[${new Date().toISOString()}] RuntimeSupervisor starting`);

    // Wire watcher → auto-restart pipeline
    this.watcher.onTrigger(async (watchEvent) => {
      this._log.push(`[${new Date().toISOString()}] WatchTrigger: ${watchEvent.trigger} → ${watchEvent.affectedModule}`);
      await this._handleWatchEvent(watchEvent.trigger, watchEvent.affectedModule, watchEvent.detail);
    });

    this.watcher.start();

    // Initial warm-up
    const wu = await this.warmup.run();
    this.metrics.recordWarmup(wu.durationMs, wu.success);
    this._log.push(`[${new Date().toISOString()}] Warmup complete — ${wu.success ? "OK" : `FAILED: ${wu.failedSteps.join(", ")}`}`);
    this.bus.emit("WarmupFinished", { success: wu.success, durationMs: wu.durationMs });

    this.lifecycle.transition("READY");
    this.bus.emit("RuntimeStarted", { warmupSuccess: wu.success });
    this._log.push(`[${new Date().toISOString()}] RuntimeSupervisor READY`);
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    this.watcher.stop();
    this.bus.emit("RuntimeStopping", {});
    this.lifecycle.transition("STOPPED");
    this._log.push(`[${new Date().toISOString()}] RuntimeSupervisor STOPPED`);
  }

  isRunning(): boolean { return this._running; }

  state(): RuntimeState { return this.lifecycle.state(); }

  log(): string[] { return [...this._log]; }

  /**
   * Manually trigger a watch event for testing / deployment hooks.
   */
  async triggerManual(moduleId: string, detail = "manual trigger"): Promise<void> {
    const watchEvent = this.watcher.fire("MANUAL", moduleId, detail);
    await this._handleWatchEvent("MANUAL", moduleId, detail);
  }

  // ── Internal self-healing pipeline ──────────────────────────────────────────

  private async _handleWatchEvent(trigger: WatchTrigger, affectedModule: string, detail: string): Promise<void> {
    const t0 = Date.now();

    // 1. Capture snapshot before any changes
    const snap = this.snapshot.capture(
      trigger,
      this.lifecycle.state(),
      this._currentModuleStates()
    );
    this.bus.emit("SnapshotCaptured", { snapshotId: snap.id, trigger });

    // 2. Build restart plan (minimal dependency chain only)
    const plan = this.restartManager.buildPlan(affectedModule, trigger);
    this._log.push(`[${new Date().toISOString()}] Restart plan: ${plan.dependencyChain.length} modules`);

    this.lifecycle.transition("RESTARTING");

    // 3. Execute restart with simulated restarter
    const result = await this.restartManager.execute(plan, async (moduleId) => {
      // Simulate module restart (real systems hook here to actual module init)
      this.health.updateModule(moduleId, "RESTARTING");
      await new Promise(r => setTimeout(r, 50));
      this.health.updateModule(moduleId, "READY");
      return true;
    });

    this.metrics.recordRestart(result.durationMs, result.success);

    if (!result.success && result.failed.length > 0) {
      // 4. Recovery for failed modules
      for (const failedModule of result.failed) {
        const rec = await this.recovery.recover({
          moduleId: failedModule,
          recover: async () => {
            await new Promise(r => setTimeout(r, 100));
            return true; // optimistic — real hook would attempt actual recovery
          },
        });
        this.recoveryHistory.add(rec);
        this.metrics.recordRecovery(rec.totalDurationMs, rec.finalResult === "RECOVERED");
        if (rec.finalResult !== "RECOVERED") {
          this.health.updateModule(failedModule, "DEGRADED");
        }
      }
    }

    // 5. Restore state
    const restoreResult = await this.restore.restore(snap);
    this.bus.emit("SnapshotRestored", { snapshotId: snap.id, success: restoreResult.success });

    // 6. Re-warmup
    const wu2 = await this.warmup.run();
    this.metrics.recordWarmup(wu2.durationMs, wu2.success);
    this.bus.emit("WarmupFinished", { round: 2, success: wu2.success });

    // 7. Re-evaluate health
    const healthReport = this.health.evaluate();

    // 8. Transition to READY or DEGRADED
    if (healthReport.status === "READY" || healthReport.status === "DEGRADED") {
      if (this.lifecycle.state() === "RESTARTING" || this.lifecycle.state() === "RECOVERING") {
        this.lifecycle.transition("READY");
      }
    }

    // 9. Audit
    this.audit.record({
      actor: "RuntimeSupervisor",
      action: `AUTO_RESTART:${trigger}`,
      trigger,
      modules: plan.dependencyChain,
      durationMs: Date.now() - t0,
      result: result.success ? "SUCCESS" : "PARTIAL",
      snapshotId: snap.id,
    });

    this.bus.emit("RuntimeRecovered", { trigger, modules: plan.dependencyChain, durationMs: Date.now() - t0 });
    this._log.push(`[${new Date().toISOString()}] Recovery complete — state: ${this.lifecycle.state()}`);
  }

  private _currentModuleStates(): Record<string, ModuleState> {
    const report = this.health.lastReport();
    if (!report) return {};
    return Object.fromEntries(report.details.map(d => [d.moduleId, d.state]));
  }
}