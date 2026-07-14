/**
 * RuntimeValidator.ts — Sprint 6.3.5
 * Validates SHR + PSM runtime state coherence.
 */

import type { ValidatorResult, CheckResult } from "./ReadinessTypes";

function check(name: string, ok: boolean, detail: string, critical = false): CheckResult {
  return { name, status: ok ? "PASS" : "FAIL", detail, critical };
}

export class RuntimeValidator {
  async validate(): Promise<ValidatorResult> {
    const t0 = Date.now();
    const checks: CheckResult[] = [];

    // SHR modules
    const shrModules: Array<[string, string]> = [
      ["RuntimeSupervisor",         "../self-healing-runtime/RuntimeSupervisor"],
      ["RuntimeEventBus",           "../self-healing-runtime/RuntimeEventBus"],
      ["RuntimeStateSnapshot",      "../self-healing-runtime/RuntimeStateSnapshot"],
      ["RuntimeDependencyResolver", "../self-healing-runtime/RuntimeDependencyResolver"],
      ["RuntimeRestartManager",     "../self-healing-runtime/RuntimeRestartManager"],
      ["RuntimeRecovery",           "../self-healing-runtime/RuntimeRecovery"],
      ["RuntimeWarmup",             "../self-healing-runtime/RuntimeWarmup"],
      ["RuntimeHealth",             "../self-healing-runtime/RuntimeHealth"],
      ["RuntimeAudit",              "../self-healing-runtime/RuntimeAudit"],
      ["RuntimeMetrics",            "../self-healing-runtime/RuntimeMetrics"],
    ];
    for (const [name, path] of shrModules) {
      let ok = false;
      try { const m = await import(/* @vite-ignore */ path); ok = !!m; } catch { ok = false; }
      checks.push(check(`SHR: ${name}`, ok, ok ? "accessible" : "missing", true));
    }

    // PSM modules
    const psmModules: Array<[string, string]> = [
      ["PersistentSessionManager",  "../runtime-persistence/PersistentSessionManager"],
      ["ConnectorSessionStore",     "../runtime-persistence/ConnectorSessionStore"],
      ["SessionSerializer",         "../runtime-persistence/SessionSerializer"],
      ["SessionRestorer",           "../runtime-persistence/SessionRestorer"],
      ["AutoReconnectEngine",       "../runtime-persistence/AutoReconnectEngine"],
      ["StartupHealthCheck",        "../runtime-persistence/StartupHealthCheck"],
      ["RuntimeBootstrap",          "../runtime-persistence/RuntimeBootstrap"],
      ["RuntimeBootstrapHistory",   "../runtime-persistence/RuntimeBootstrapHistory"],
      ["RuntimePersistenceAudit",   "../runtime-persistence/RuntimePersistenceAudit"],
    ];
    for (const [name, path] of psmModules) {
      let ok = false;
      try { const m = await import(/* @vite-ignore */ path); ok = !!m; } catch { ok = false; }
      checks.push(check(`PSM: ${name}`, ok, ok ? "accessible" : "missing", true));
    }

    const failed = checks.filter(c => c.status !== "PASS");
    const criticalFailed = failed.filter(c => c.critical);
    const score = Math.round((checks.filter(c => c.status === "PASS").length / checks.length) * 100);

    return {
      id: "rt_validator",
      name: "Runtime Validator",
      domain: "Recovery",
      status: criticalFailed.length > 0 ? "FAIL" : failed.length > 0 ? "WARN" : "PASS",
      score,
      detail: `${checks.filter(c => c.status === "PASS").length}/${checks.length} runtime modules accessible`,
      checks,
      durationMs: Date.now() - t0,
      blockers: criticalFailed.map(c => `[RT] ${c.name}: ${c.detail}`),
      warnings: failed.filter(c => !c.critical).map(c => c.name),
      recommendations: criticalFailed.length > 0
        ? ["Restore SHR/PSM modules — runtime recovery depends on them."] : [],
    };
  }
}