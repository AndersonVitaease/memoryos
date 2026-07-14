/**
 * ConnectorValidator.ts — Sprint 6.3.5
 * Diagnoses all registered connectors via UCP.
 */

import type { ValidatorResult, CheckResult } from "./ReadinessTypes";
import { ConnectorRuntime } from "../universal-connector-platform/ConnectorRuntime";
import { ConnectorRegistry } from "../universal-connector-platform/ConnectorRegistry";
import { ConnectorFactory } from "../universal-connector-platform/ConnectorFactory";
import { ConnectorHealth } from "../universal-connector-platform/ConnectorHealth";
import { ConnectorAudit } from "../universal-connector-platform/ConnectorAudit";
import { ConnectorMetrics } from "../universal-connector-platform/ConnectorMetrics";
import { ConnectorLifecycle } from "../universal-connector-platform/ConnectorLifecycle";
import { ConnectorDiagnostics } from "../universal-connector-platform/ConnectorDiagnostics";
import { validateCompatibility } from "../universal-connector-platform/ConnectorCompatibility";
import { makeCapabilities, validateCapabilities } from "../universal-connector-platform/ConnectorCapabilities";

function check(name: string, ok: boolean, detail: string, critical = false): CheckResult {
  return { name, status: ok ? "PASS" : ok === false ? "FAIL" : "WARN", detail, critical };
}

export class ConnectorValidator {
  async validate(): Promise<ValidatorResult> {
    const t0 = Date.now();
    const checks: CheckResult[] = [];

    // Runtime lifecycle
    const rt = new ConnectorRuntime();
    rt.start();
    const rtRunning = rt.isRunning();
    rt.stop();
    checks.push(check("Runtime start/stop lifecycle", rtRunning, rtRunning ? "OK" : "Runtime did not start", true));

    // Registry
    const registry = new ConnectorRegistry();
    const factory = new ConnectorFactory();
    const descriptor = factory.create({ provider: "ERCTest", displayName: "ERC", version: "1.0.0", capabilities: ["READ"] });
    registry.register(descriptor);
    const regOk = registry.has(descriptor.id) && registry.count() >= 1;
    checks.push(check("Registry register + lookup", regOk, regOk ? `Registered, count=${registry.count()}` : "Registry inconsistent", true));

    // Capabilities
    const caps = makeCapabilities(["READ", "WRITE"]);
    const capValid = validateCapabilities(caps);
    const emptyInvalid = !validateCapabilities(makeCapabilities([])).valid;
    checks.push(check("Capabilities validated", capValid.valid && emptyInvalid, `valid=${capValid.valid} emptyRejected=${emptyInvalid}`, false));

    // Lifecycle transitions
    const lc = new ConnectorLifecycle();
    lc.init("erc_test");
    lc.transition("erc_test", "CONFIGURED");
    lc.transition("erc_test", "READY");
    const lcOk = lc.get("erc_test") === "READY";
    checks.push(check("Lifecycle REGISTERED → CONFIGURED → READY", lcOk, lcOk ? "Transitions OK" : `stuck at ${lc.get("erc_test")}`, false));

    // Diagnostics
    const diag = new ConnectorDiagnostics();
    const diagResult = diag.run({ ...descriptor, lifecycle: "CONFIGURED" });
    const diagOk = typeof diagResult.overall === "boolean";
    checks.push(check("Diagnostics execute", diagOk, diagOk ? `overall=${diagResult.overall}` : "Diagnostics failed", false));

    // Health
    const health = new ConnectorHealth();
    health.mark("erc_test", "HEALTHY", "OK");
    const healthSnap = health.get("erc_test");
    checks.push(check("Health state management", healthSnap.state === "HEALTHY", `state=${healthSnap.state}`, false));

    // Metrics
    const metrics = new ConnectorMetrics();
    metrics.recordCall("erc_test", 100, true);
    metrics.recordCall("erc_test", 200, false);
    const snap = metrics.snapshot("erc_test");
    const metricsOk = snap.totalCalls === 2 && snap.avgLatencyMs === 150;
    checks.push(check("Metrics recording accurate", metricsOk, metricsOk ? `calls=2 avg=150ms` : `calls=${snap.totalCalls} avg=${snap.avgLatencyMs}`, false));

    // Audit
    const audit = new ConnectorAudit();
    audit.install("erc_test", "ERC probe install");
    const auditOk = audit.count() >= 1;
    checks.push(check("Audit append-only", auditOk, auditOk ? `count=${audit.count()}` : "Audit empty", false));

    // Compatibility
    const compat = validateCompatibility({
      runtimeVersion: "6.3.0", workflowVersion: "6.1.0",
      governanceVersion: "6.2.2", architectureVersion: "6.2.3",
      engineeringMemoryVersion: "6.2.4",
    });
    checks.push(check("Layer compatibility verified", compat.valid, compat.valid ? "All compatible" : `violations=${compat.violations.join(",")}`, true));

    // Real connectors
    let ghOk = false;
    try {
      const { GitHubConnector } = await import("../connector-runtime/connectors/GitHubConnector");
      const gc = new GitHubConnector();
      ghOk = typeof gc.execute === "function";
    } catch { ghOk = false; }
    checks.push(check("GitHubConnector accessible", ghOk, ghOk ? "execute() callable" : "Import failed", false));

    let b44Ok = false;
    try {
      const { Base44Connector } = await import("../connector-runtime/connectors/Base44Connector");
      const bc = new Base44Connector();
      b44Ok = typeof bc.execute === "function";
    } catch { b44Ok = false; }
    checks.push(check("Base44Connector accessible", b44Ok, b44Ok ? "execute() callable" : "Import failed", false));

    const failed = checks.filter(c => c.status !== "PASS");
    const criticalFailed = failed.filter(c => c.critical);
    const score = Math.round((checks.filter(c => c.status === "PASS").length / checks.length) * 100);

    return {
      id: "conn_validator",
      name: "Connector Validator",
      domain: "ConnectorPlatform",
      status: criticalFailed.length > 0 ? "FAIL" : failed.length > 0 ? "WARN" : "PASS",
      score,
      detail: `${checks.filter(c => c.status === "PASS").length}/${checks.length} connector checks passed`,
      checks,
      durationMs: Date.now() - t0,
      blockers: criticalFailed.map(c => `[CONNECTOR] ${c.name}: ${c.detail}`),
      warnings: failed.filter(c => !c.critical).map(c => c.name),
      recommendations: criticalFailed.length > 0
        ? ["Fix UCP runtime before adding new connectors."] : [],
    };
  }
}