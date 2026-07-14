/**
 * RecoveryValidator.ts — Sprint 6.3.5
 * Simulates restart, recovery, warmup, reconnect, restore.
 */

import type { ValidatorResult, CheckResult } from "./ReadinessTypes";

function check(name: string, ok: boolean, detail: string, critical = true): CheckResult {
  return { name, status: ok ? "PASS" : "FAIL", detail, critical };
}

export class RecoveryValidator {
  async validate(): Promise<ValidatorResult> {
    const t0 = Date.now();
    const checks: CheckResult[] = [];

    // 1. RuntimeWarmup — 5 steps
    let warmupOk = false;
    let warmupSteps = 0;
    try {
      const { RuntimeWarmup } = await import("../self-healing-runtime/RuntimeWarmup");
      const warmup = new RuntimeWarmup();
      const result = await warmup.run();
      warmupSteps = result.steps.length;
      warmupOk = warmupSteps === 5;
    } catch { warmupOk = false; }
    checks.push(check("SHR Warmup completes 5 steps", warmupOk, warmupOk ? `${warmupSteps} steps ran` : `Only ${warmupSteps} steps ran`));

    // 2. RuntimeRecovery — succeeds on first try
    let recovOk = false;
    try {
      const { RuntimeRecovery } = await import("../self-healing-runtime/RuntimeRecovery");
      const { RuntimeEventBus } = await import("../self-healing-runtime/RuntimeEventBus");
      const bus = new RuntimeEventBus();
      const rec = new RuntimeRecovery(bus);
      const result = await rec.recover({ moduleId: "RecoveryProbe", recover: async () => true });
      recovOk = result.finalResult === "RECOVERED" && result.attempts === 1;
    } catch { recovOk = false; }
    checks.push(check("SHR Recovery — 1 attempt success", recovOk, recovOk ? "Recovered in 1 attempt" : "Recovery failed"));

    // 3. AutoReconnect — reconnects RESTORING session
    let reconOk = false;
    try {
      const { ConnectorSessionStore } = await import("../runtime-persistence/ConnectorSessionStore");
      const { AutoReconnectEngine } = await import("../runtime-persistence/AutoReconnectEngine");
      const store = new ConnectorSessionStore();
      store.upsert({ connectorId: "rec_probe", provider: "Test", displayName: "T", status: "RESTORING", statusReason: "restart", capabilities: ["READ"], health: "HEALTHY", metadata: {}, expiresAt: null });
      const engine = new AutoReconnectEngine();
      const attempts = await engine.reconnectAll(store);
      reconOk = attempts.length === 1 && attempts[0].result === "RECONNECTED";
    } catch { reconOk = false; }
    checks.push(check("AutoReconnect restores RESTORING session", reconOk, reconOk ? "Reconnected OK" : "Reconnect failed"));

    // 4. SessionRestorer handles empty store
    let restoreOk = false;
    try {
      const { ConnectorSessionStore } = await import("../runtime-persistence/ConnectorSessionStore");
      const { SessionRestorer } = await import("../runtime-persistence/SessionRestorer");
      const store = new ConnectorSessionStore();
      const restorer = new SessionRestorer();
      const res = restorer.restore(store);
      restoreOk = res.total === 0 && res.failed === 0;
    } catch { restoreOk = false; }
    checks.push(check("SessionRestorer handles empty store", restoreOk, restoreOk ? "Empty restore returns zeros" : "Restore threw on empty store", false));

    // 5. RuntimeRestartManager builds plan
    let planOk = false;
    try {
      const { RuntimeRestartManager } = await import("../self-healing-runtime/RuntimeRestartManager");
      const { RuntimeDependencyResolver } = await import("../self-healing-runtime/RuntimeDependencyResolver");
      const { RuntimeEventBus } = await import("../self-healing-runtime/RuntimeEventBus");
      const bus = new RuntimeEventBus();
      const resolver = new RuntimeDependencyResolver();
      const mgr = new RuntimeRestartManager(resolver, bus);
      const plan = mgr.buildPlan("KnowledgeGraphStore", "MANUAL");
      planOk = !!plan.id && plan.dependencyChain.length > 0;
    } catch { planOk = false; }
    checks.push(check("Restart plan generation", planOk, planOk ? "Plan built with dependency chain" : "Plan failed", false));

    // 6. StartupHealthCheck runs
    let hcOk = false;
    let hcCount = 0;
    try {
      const { StartupHealthCheck } = await import("../runtime-persistence/StartupHealthCheck");
      const hc = new StartupHealthCheck();
      const results = await hc.run();
      hcCount = results.length;
      hcOk = hcCount === 9;
    } catch { hcOk = false; }
    checks.push(check("StartupHealthCheck runs 9 components", hcOk, hcOk ? `${hcCount} health checks ran` : `${hcCount}/9 ran`));

    const failed = checks.filter(c => c.status !== "PASS");
    const criticalFailed = failed.filter(c => c.critical);
    const score = Math.round((checks.filter(c => c.status === "PASS").length / checks.length) * 100);

    return {
      id: "rec_validator",
      name: "Recovery Validator",
      domain: "Recovery",
      status: criticalFailed.length > 0 ? "FAIL" : failed.length > 0 ? "WARN" : "PASS",
      score,
      detail: `${checks.filter(c => c.status === "PASS").length}/${checks.length} recovery scenarios passed`,
      checks,
      durationMs: Date.now() - t0,
      blockers: criticalFailed.map(c => `[RECOVERY] ${c.name}: ${c.detail}`),
      warnings: failed.filter(c => !c.critical).map(c => c.name),
      recommendations: criticalFailed.length > 0
        ? ["Fix recovery path — system cannot self-heal after restart."] : [],
    };
  }
}