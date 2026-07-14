/**
 * Sprint631Scenarios.ts — Sprint 6.3.2
 * Acceptance scenarios for Sprint 6.3.1 (Self-Healing Runtime)
 */

import type { AcceptanceScenario } from "../AcceptanceScenario";
import { SHR_CRITERIA } from "../AcceptanceCriteria";
import { assert } from "../AcceptanceAssertion";
import { RuntimeSupervisor }    from "../../self-healing-runtime/RuntimeSupervisor";
import { RuntimeEventBus }      from "../../self-healing-runtime/RuntimeEventBus";
import { RuntimeStateSnapshot } from "../../self-healing-runtime/RuntimeStateSnapshot";
import { RuntimeWarmup }        from "../../self-healing-runtime/RuntimeWarmup";
import { RuntimeRecovery }      from "../../self-healing-runtime/RuntimeRecovery";
import { RuntimeAudit }         from "../../self-healing-runtime/RuntimeAudit";
import { RuntimeDependencyResolver } from "../../self-healing-runtime/RuntimeDependencyResolver";
import { RuntimeRestartManager }     from "../../self-healing-runtime/RuntimeRestartManager";
import { RuntimeMetrics }            from "../../self-healing-runtime/RuntimeMetrics";

export function buildScenarios631(): AcceptanceScenario[] {
  const [c0, c1, c2, c3, c4, c5, c6, c7, c8, c9] = SHR_CRITERIA;

  return [
    {
      criterion: c0, // Watcher detects and fires triggers
      run: async () => {
        const bus = new RuntimeEventBus();
        let fired = false;
        bus.on("RuntimeStarted", () => { fired = true; });
        bus.emit("RuntimeStarted", { test: true });
        return assert.fromBoolean(
          fired && bus.history().length > 0,
          "EventBus fires triggers and records history",
          "EventBus did not fire or record",
          "RuntimeEventBus.emit or .on is broken"
        );
      },
    },
    {
      criterion: c1, // Restart Manager
      run: async () => {
        const bus      = new RuntimeEventBus();
        const resolver = new RuntimeDependencyResolver();
        const mgr      = new RuntimeRestartManager(resolver, bus);
        const plan     = mgr.buildPlan("KnowledgeGraphStore", "MANUAL");
        const ok = !!plan.id && plan.dependencyChain.length > 0;
        return {
          ...assert.fromBoolean(ok, `Plan built — ${plan.dependencyChain.length} modules in chain`, "Plan chain empty"),
          evidence: [{ kind: "SNAPSHOT" as const, label: "restart-plan", value: { planId: plan.id, chain: plan.dependencyChain } }],
        };
      },
    },
    {
      criterion: c2, // Snapshot
      run: async () => {
        const snap   = new RuntimeStateSnapshot();
        const result = snap.capture("MANUAL", "READY", { TestModule: "READY" });
        const ok = !!result.id && result.trigger === "MANUAL";
        return {
          ...assert.fromBoolean(ok, `Snapshot id=${result.id}`, "Snapshot fields invalid"),
          evidence: [{ kind: "SNAPSHOT" as const, label: "state-snapshot", value: result }],
        };
      },
    },
    {
      criterion: c3, // Restore — structural check
      run: async () => {
        const snap   = new RuntimeStateSnapshot();
        const result = snap.capture("CODE_CHANGE", "READY", { ModA: "READY" });
        return assert.fromBoolean(
          !!result.id && typeof result.moduleStates === "object",
          "Snapshot captured module states for restore",
          "moduleStates missing from snapshot"
        );
      },
    },
    {
      criterion: c4, // Warm-up
      run: async () => {
        const warmup = new RuntimeWarmup();
        const result = await warmup.run();
        return {
          ...assert.fromBoolean(result.steps.length === 5, `All 5 warmup steps ran (${result.durationMs}ms)`, `Only ${result.steps.length} steps ran`),
          evidence: [{ kind: "DURATION" as const, label: "warmup-duration", value: result.durationMs }],
        };
      },
    },
    {
      criterion: c5, // Recovery
      run: async () => {
        const bus = new RuntimeEventBus();
        const rec = new RuntimeRecovery(bus);
        const result = await rec.recover({ moduleId: "TestModule", recover: async () => true });
        const ok = result.finalResult === "RECOVERED" && result.attempts === 1;
        return {
          ...assert.fromBoolean(ok, `Recovered in ${result.attempts} attempt(s) — ${result.totalDurationMs}ms`, `result=${result.finalResult} attempts=${result.attempts}`),
          evidence: [{ kind: "METRIC" as const, label: "recovery-attempts", value: result.attempts }],
        };
      },
    },
    {
      criterion: c6, // Audit append-only
      run: async () => {
        const audit = new RuntimeAudit();
        audit.record({ actor: "Supervisor", action: "RESTART", trigger: "MANUAL", modules: ["ModA"], durationMs: 100, result: "SUCCESS" });
        const before = audit.count();
        audit.record({ actor: "Supervisor", action: "RECOVER", trigger: "CODE_CHANGE", modules: ["ModB"], durationMs: 200, result: "PARTIAL" });
        const after = audit.count();
        return assert.fromBoolean(after === before + 1, `Audit grew: ${before} → ${after}`, "Audit count did not grow");
      },
    },
    {
      criterion: c7, // Regression Shield SHR category
      run: async () => {
        try {
          const { EngineeringRegressionSuite } = await import("../../engineering-regression/EngineeringRegressionSuite");
          const suite  = new EngineeringRegressionSuite();
          const report = await suite.run();
          const shrCat = report.categories["SHR"];
          const ok = shrCat && shrCat.failed === 0;
          return {
            ...assert.fromBoolean(!!ok, `SHR category: ${shrCat?.passed ?? 0} passed, ${shrCat?.failed ?? 0} failed`, "SHR regression tests failed"),
            evidence: [{ kind: "METRIC" as const, label: "shr-regression-score", value: report.score }],
          };
        } catch (e) {
          return assert.fail(`Regression suite import failed: ${String(e)}`);
        }
      },
    },
    {
      criterion: c8, // EventBus lifecycle events
      run: async () => {
        const bus = new RuntimeEventBus();
        const events: string[] = [];
        bus.on("RuntimeStarted", () => events.push("RuntimeStarted"));
        bus.on("RuntimeStopped", () => events.push("RuntimeStopped"));
        bus.emit("RuntimeStarted", {});
        bus.emit("RuntimeStopped", {});
        const ok = events.length === 2;
        return assert.fromBoolean(ok, `EventBus received both lifecycle events: ${events.join(", ")}`, `Only received: ${events.join(", ")}`);
      },
    },
    {
      criterion: c9, // Metrics snapshot
      run: async () => {
        const metrics = new RuntimeMetrics();
        metrics.recordRestart(150, true);
        metrics.recordRecovery(300, true);
        metrics.recordWarmup(200, true);
        const snap = metrics.snapshot();
        const ok = snap.totalRestarts === 1 && snap.successRate === 100;
        return {
          ...assert.fromBoolean(ok, `Metrics: restarts=1 rate=100%`, `restarts=${snap.totalRestarts} rate=${snap.successRate}`),
          evidence: [{ kind: "METRIC" as const, label: "metrics-snapshot", value: snap }],
        };
      },
    },
  ];
}