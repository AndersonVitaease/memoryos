/**
 * ucpTests.ts — Sprint 6.3.0
 * Regression tests for the Universal Connector Platform.
 */

import { ConnectorRuntime }      from "./ConnectorRuntime";
import { ConnectorFactory }      from "./ConnectorFactory";
import { ConnectorRegistry }     from "./ConnectorRegistry";
import { ConnectorLifecycle }    from "./ConnectorLifecycle";
import { ConnectorHealth }       from "./ConnectorHealth";
import { ConnectorMetrics }      from "./ConnectorMetrics";
import { ConnectorAudit }        from "./ConnectorAudit";
import { ConnectorDiagnostics }  from "./ConnectorDiagnostics";
import { ConnectorCompatibility, validateCompatibility } from "./ConnectorCompatibility";
import { makeCapabilities, validateCapabilities } from "./ConnectorCapabilities";
import { UniversalConnectorPlatform } from "./UniversalConnectorPlatform";

export interface UCPTestResult {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

export interface UCPTestReport {
  passed: number;
  failed: number;
  total: number;
  results: UCPTestResult[];
  durationMs: number;
  shield: "PASS" | "FAIL";
}

async function runTest(
  id: string,
  name: string,
  fn: () => void | Promise<void>
): Promise<UCPTestResult> {
  const t0 = Date.now();
  try {
    await fn();
    return { id, name, passed: true, detail: "OK", durationMs: Date.now() - t0 };
  } catch (e) {
    return { id, name, passed: false, detail: String(e), durationMs: Date.now() - t0 };
  }
}

export async function runUCPTests(): Promise<UCPTestReport> {
  const t0 = Date.now();
  const results: UCPTestResult[] = [];

  results.push(await runTest("ucp_01", "Connector Runtime initializes", () => {
    const rt = new ConnectorRuntime();
    rt.start();
    if (!rt.isRunning()) throw new Error("Runtime not running after start()");
    rt.stop();
    if (rt.isRunning()) throw new Error("Runtime still running after stop()");
  }));

  results.push(await runTest("ucp_02", "Connector Registry works", () => {
    const registry = new ConnectorRegistry();
    const factory  = new ConnectorFactory();
    const d = factory.create({ provider: "Test", displayName: "Test Connector", version: "1.0.0", capabilities: ["READ"] });
    registry.register(d);
    if (!registry.has(d.id)) throw new Error("Registry.has() failed");
    if (registry.count() !== 1) throw new Error(`Expected 1 connector, got ${registry.count()}`);
    const all = registry.all();
    if (all[0].id !== d.id) throw new Error("Registry.all() returned wrong connector");
  }));

  results.push(await runTest("ucp_03", "Factory creates connectors", () => {
    const factory = new ConnectorFactory();
    const d = factory.create({
      provider: "FactoryTest", displayName: "Factory Connector", version: "2.1.0",
      capabilities: ["READ", "WRITE"],
    });
    if (!d.id)          throw new Error("No id generated");
    if (!d.registeredAt) throw new Error("No registeredAt");
    if (d.lifecycle !== "REGISTERED") throw new Error(`Expected REGISTERED, got ${d.lifecycle}`);
    if (d.version.major !== 2) throw new Error(`Expected major=2, got ${d.version.major}`);
  }));

  results.push(await runTest("ucp_04", "Factory rejects missing provider", () => {
    const factory = new ConnectorFactory();
    let threw = false;
    try { factory.create({ provider: "", displayName: "X", version: "1.0.0", capabilities: ["READ"] }); }
    catch { threw = true; }
    if (!threw) throw new Error("Factory should throw on empty provider");
  }));

  results.push(await runTest("ucp_05", "Capabilities validated", () => {
    const caps = makeCapabilities(["READ", "WRITE", "SEARCH"]);
    const result = validateCapabilities(caps);
    if (!result.valid) throw new Error(`Capabilities invalid: ${result.violations.join(", ")}`);
    if (!caps.READ || !caps.WRITE || !caps.SEARCH) throw new Error("Expected READ/WRITE/SEARCH true");
    if (caps.EVENTS || caps.WEBHOOKS || caps.SYNC) throw new Error("Unexpected extra capabilities");
  }));

  results.push(await runTest("ucp_06", "Capabilities rejects empty set", () => {
    const caps = makeCapabilities([]);
    const result = validateCapabilities(caps);
    if (result.valid) throw new Error("Should be invalid with no capabilities declared");
  }));

  results.push(await runTest("ucp_07", "Lifecycle transitions", () => {
    const lc = new ConnectorLifecycle();
    lc.init("c1");
    if (lc.get("c1") !== "REGISTERED") throw new Error("Expected REGISTERED");
    lc.transition("c1", "CONFIGURED");
    if (lc.get("c1") !== "CONFIGURED") throw new Error("Expected CONFIGURED");
    lc.transition("c1", "READY");
    if (lc.get("c1") !== "READY") throw new Error("Expected READY");
    lc.transition("c1", "DEGRADED");
    if (lc.get("c1") !== "DEGRADED") throw new Error("Expected DEGRADED");
  }));

  results.push(await runTest("ucp_08", "Lifecycle rejects invalid transition", () => {
    const lc = new ConnectorLifecycle();
    lc.init("c2");
    let threw = false;
    try { lc.transition("c2", "READY"); } // REGISTERED → READY not allowed
    catch { threw = true; }
    if (!threw) throw new Error("Should have thrown on invalid transition");
  }));

  results.push(await runTest("ucp_09", "Diagnostics execute", () => {
    const factory = new ConnectorFactory();
    const diag    = new ConnectorDiagnostics();
    const d = factory.create({ provider: "DiagTest", displayName: "Diag", version: "1.0.0", capabilities: ["READ"] });
    // Must be CONFIGURED or READY for readiness to pass — update lifecycle manually
    const updated = { ...d, lifecycle: "CONFIGURED" as const };
    const result  = diag.run(updated);
    if (typeof result.selfTest !== "boolean") throw new Error("selfTest not boolean");
    if (typeof result.overall !== "boolean")  throw new Error("overall not boolean");
    if (!result.details.length) throw new Error("No diagnostic details");
  }));

  results.push(await runTest("ucp_10", "Health updates", () => {
    const health = new ConnectorHealth();
    health.mark("h1", "HEALTHY", "All good");
    const snap = health.get("h1");
    if (snap.state !== "HEALTHY") throw new Error(`Expected HEALTHY, got ${snap.state}`);
    health.update("h1", { errorRate: 60 });
    const snap2 = health.get("h1");
    if (snap2.state !== "UNHEALTHY") throw new Error(`Expected UNHEALTHY after high errorRate`);
  }));

  results.push(await runTest("ucp_11", "Metrics collected", () => {
    const metrics = new ConnectorMetrics();
    metrics.recordCall("m1", 100, true);
    metrics.recordCall("m1", 200, true);
    metrics.recordCall("m1", 150, false);
    const snap = metrics.snapshot("m1");
    if (snap.totalCalls !== 3) throw new Error(`Expected 3 calls, got ${snap.totalCalls}`);
    if (snap.totalErrors !== 1) throw new Error(`Expected 1 error, got ${snap.totalErrors}`);
    if (snap.avgLatencyMs !== 150) throw new Error(`Expected avgLatency=150, got ${snap.avgLatencyMs}`);
  }));

  results.push(await runTest("ucp_12", "Audit immutable (append-only)", () => {
    const audit = new ConnectorAudit();
    audit.install("a1", "installed");
    const before = audit.count();
    audit.configure("a1", "configured");
    audit.error("a1", "test error");
    const after = audit.count();
    if (after !== before + 2) throw new Error(`Expected ${before + 2} entries, got ${after}`);
    const entries = audit.all();
    if (entries[0].event !== "INSTALL") throw new Error("First entry should be INSTALL");
  }));

  results.push(await runTest("ucp_13", "Compatibility validated", () => {
    const result = validateCompatibility({
      runtimeVersion:           "6.3.0",
      workflowVersion:          "6.1.0",
      governanceVersion:        "6.2.2",
      architectureVersion:      "6.2.3",
      engineeringMemoryVersion: "6.2.4",
    });
    if (!result.valid) throw new Error(`Compatibility invalid: ${result.violations.join(", ")}`);
  }));

  results.push(await runTest("ucp_14", "Compatibility rejects old version", () => {
    const result = validateCompatibility({
      runtimeVersion:           "5.0.0", // too old
      workflowVersion:          "6.1.0",
      governanceVersion:        "6.2.2",
      architectureVersion:      "6.2.3",
      engineeringMemoryVersion: "6.2.4",
    });
    if (result.valid) throw new Error("Should be invalid with old runtimeVersion");
  }));

  results.push(await runTest("ucp_15", "Full runtime install flow", () => {
    const rt = new ConnectorRuntime();
    rt.start();
    const d = rt.install({ provider: "FullTest", displayName: "Full Test", version: "1.0.0", capabilities: ["READ", "WRITE"] });
    if (!rt.registry.has(d.id)) throw new Error("Connector not in registry after install");
    if (rt.lifecycle.get(d.id) !== "REGISTERED") throw new Error("Expected REGISTERED lifecycle");
    const auditEntries = rt.audit.forConnector(d.id);
    if (!auditEntries.some(e => e.event === "INSTALL")) throw new Error("No INSTALL audit entry");
    rt.transitionLifecycle(d.id, "CONFIGURED");
    rt.transitionLifecycle(d.id, "READY");
    if (rt.lifecycle.get(d.id) !== "READY") throw new Error("Expected READY lifecycle");
    const stats = rt.stats();
    if (stats.readyConnectors < 1) throw new Error("readyConnectors should be >= 1");
    rt.stop();
  }));

  results.push(await runTest("ucp_16", "UCP singleton stable", () => {
    const rt1 = UniversalConnectorPlatform.getRuntime();
    const rt2 = UniversalConnectorPlatform.getRuntime();
    if (rt1 !== rt2) throw new Error("Singleton broken — two different instances returned");
    if (!UniversalConnectorPlatform.isReady()) throw new Error("UCP should be ready");
  }));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    passed, failed,
    total:      results.length,
    results,
    durationMs: Date.now() - t0,
    shield:     failed === 0 ? "PASS" : "FAIL",
  };
}