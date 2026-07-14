/**
 * StartupCoordinator.ts — Sprint 6.3.4
 * Orchestrates the full startup sequence:
 * BOOT → RUNTIME → RESTORE_SESSIONS → WARMUP → HEALTH → KNOWLEDGE_GRAPH → ACCEPTANCE → DASHBOARD → READY
 */

import type { BootstrapReport, BootstrapPhase } from "./RuntimePersistenceTypes";
import { RuntimePersistence } from "./RuntimePersistence";
import { StartupHealthCheck } from "./StartupHealthCheck";

let _seq = 0;
function makeId(): string { return `boot_${Date.now()}_${++_seq}`; }

interface PhaseRecord {
  phase:      BootstrapPhase;
  status:     "PASS" | "FAIL" | "SKIP";
  durationMs: number;
  detail:     string;
}

export class StartupCoordinator {
  private _healthCheck = new StartupHealthCheck();
  private _phases: PhaseRecord[] = [];
  private _errors: string[] = [];
  private _currentPhase: BootstrapPhase = "BOOT";

  onPhaseChange?: (phase: BootstrapPhase) => void;

  async boot(): Promise<BootstrapReport> {
    const startedAt = Date.now();
    this._phases = [];
    this._errors = [];

    const report: BootstrapReport = {
      id:            makeId(),
      startedAt,
      completedAt:   0,
      durationMs:    0,
      phase:         "BOOT",
      success:       false,
      phases:        [],
      healthChecks:  [],
      restoreResult: null,
      errors:        [],
    };

    try {
      // Phase 1 — BOOT
      await this._phase("BOOT", async () => "Runtime initializing");

      // Phase 2 — RUNTIME (Self-Healing Runtime warmup)
      await this._phase("RUNTIME", async () => {
        const { SelfHealingRuntime } = await import("../self-healing-runtime/SelfHealingRuntime");
        SelfHealingRuntime.supervisor.start();
        return "Self-Healing Runtime started";
      });

      // Phase 3 — RESTORE_SESSIONS
      await this._phase("RESTORE_SESSIONS", async () => {
        const restoreResult = RuntimePersistence.sessions.restore();
        const syncResult    = RuntimePersistence.sessions.sync();
        report.restoreResult = restoreResult;
        RuntimePersistence.audit.record("StartupCoordinator", "RESTORE_SESSIONS", "SessionStore",
          "PASS", `restored=${restoreResult.restored} expired=${restoreResult.expired} synced=${syncResult.synced}`);
        return `Restored ${restoreResult.restored}, expired ${restoreResult.expired}, synced ${syncResult.synced}`;
      });

      // Phase 4 — WARMUP (Auto-reconnect valid sessions)
      await this._phase("WARMUP", async () => {
        const attempts = await RuntimePersistence.sessions.reconnect.reconnectAll(RuntimePersistence.sessions.store);
        const reconnected = attempts.filter(a => a.result === "RECONNECTED").length;
        return `Auto-reconnected ${reconnected}/${attempts.length} sessions`;
      });

      // Phase 5 — HEALTH
      await this._phase("HEALTH", async () => {
        const results = await this._healthCheck.run();
        report.healthChecks = results;
        const summary = this._healthCheck.summary(results);
        RuntimePersistence.audit.record("StartupCoordinator", "HEALTH_CHECK", "AllComponents",
          summary.overall, `pass=${summary.pass} fail=${summary.fail} degraded=${summary.degraded}`);
        return `Health: ${summary.overall} (${summary.pass}/${results.length} pass)`;
      });

      // Phase 6 — KNOWLEDGE_GRAPH
      await this._phase("KNOWLEDGE_GRAPH", async () => {
        const { KnowledgeGraphStore } = await import("../project-knowledge/KnowledgeGraphStore");
        const ready = KnowledgeGraphStore.isReady();
        return ready ? "Knowledge Graph ready" : "Knowledge Graph not built yet — will build on first use";
      });

      // Phase 7 — ACCEPTANCE
      await this._phase("ACCEPTANCE", async () => {
        return "Acceptance Framework available";
      });

      // Phase 8 — DASHBOARD
      await this._phase("DASHBOARD", async () => {
        RuntimePersistence.sessions.save();
        return "Dashboard state synchronized";
      });

      // Phase 9 — READY
      await this._phase("READY", async () => "MemoryOS Runtime READY");

      report.success = true;
      report.phase   = "READY";

    } catch (err) {
      const msg = String(err);
      this._errors.push(msg);
      report.success = false;
      report.phase   = "FAILED";
      RuntimePersistence.audit.record("StartupCoordinator", "BOOT_FAILED", "Runtime", "FAIL", msg);
    }

    report.completedAt = Date.now();
    report.durationMs  = report.completedAt - startedAt;
    report.phases      = [...this._phases];
    report.errors      = [...this._errors];

    RuntimePersistence.history.add(report);
    return report;
  }

  private async _phase(phase: BootstrapPhase, fn: () => Promise<string>): Promise<void> {
    const t0 = Date.now();
    this._currentPhase = phase;
    this.onPhaseChange?.(phase);
    try {
      const detail = await fn();
      this._phases.push({ phase, status: "PASS", durationMs: Date.now() - t0, detail });
    } catch (err) {
      const detail = String(err);
      this._phases.push({ phase, status: "FAIL", durationMs: Date.now() - t0, detail });
      this._errors.push(`[${phase}] ${detail}`);
      // Non-fatal: continue to next phase (degraded mode)
    }
  }

  get currentPhase(): BootstrapPhase { return this._currentPhase; }
}