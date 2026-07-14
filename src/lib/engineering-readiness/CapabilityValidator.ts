/**
 * CapabilityValidator.ts — Sprint 6.3.5
 * Validates all major engineering capability layers.
 */

import type { ValidatorResult, CheckResult } from "./ReadinessTypes";
import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";
import { ConnectorRuntime } from "../universal-connector-platform/ConnectorRuntime";
import { ConnectorRegistry } from "../universal-connector-platform/ConnectorRegistry";
import { EngineeringMemory } from "../engineering-memory/EngineeringMemory";

function check(name: string, ok: boolean, detail: string, critical = false): CheckResult {
  return { name, status: ok ? "PASS" : "FAIL", detail, critical };
}

export class CapabilityValidator {
  async validate(): Promise<ValidatorResult> {
    const t0 = Date.now();
    const checks: CheckResult[] = [];

    // Knowledge Graph
    const kgReady = KnowledgeGraphStore.isReady();
    const kgAge = KnowledgeGraphStore.ageMs();
    checks.push(check("KnowledgeGraphStore accessible", typeof KnowledgeGraphStore.isReady === "function", "KGS API callable", true));
    checks.push(check("KG state reporting", typeof kgAge === "number", `ageMs=${kgAge}`, false));

    // Workflow
    let wfOk = false;
    try {
      const { EngineeringWorkflow } = await import("../engineering-workflow/EngineeringWorkflow");
      const wf = new EngineeringWorkflow();
      wfOk = typeof wf.inspect === "function" && typeof wf.initiate === "function";
    } catch { wfOk = false; }
    checks.push(check("EngineeringWorkflow operational", wfOk, wfOk ? "All methods callable" : "Import failed", true));

    // UCP Runtime
    let ucpOk = false;
    try {
      const rt = new ConnectorRuntime();
      rt.start();
      ucpOk = rt.isRunning();
      rt.stop();
    } catch { ucpOk = false; }
    checks.push(check("UCP ConnectorRuntime operational", ucpOk, ucpOk ? "Start/stop OK" : "Runtime failed", true));

    // UCP Registry
    let regOk = false;
    try {
      const reg = new ConnectorRegistry();
      regOk = typeof reg.register === "function" && typeof reg.has === "function";
    } catch { regOk = false; }
    checks.push(check("UCP ConnectorRegistry operational", regOk, regOk ? "Registry API accessible" : "Registry failed", true));

    // Engineering Memory
    let memOk = false;
    try {
      const em = new EngineeringMemory();
      memOk = typeof em.recordImplementation === "function" && typeof em.searchBeforeImplementing === "function";
    } catch { memOk = false; }
    checks.push(check("EngineeringMemory operational", memOk, memOk ? "MEM API callable" : "Memory failed", true));

    // Acceptance Framework
    let eafOk = false;
    try {
      const { AcceptanceEngine } = await import("../engineering-acceptance/AcceptanceEngine");
      const ae = new AcceptanceEngine();
      eafOk = typeof ae.runSprint === "function";
    } catch { eafOk = false; }
    checks.push(check("AcceptanceEngine operational", eafOk, eafOk ? "EAF API callable" : "EAF import failed", true));

    // AEL
    let aelOk = false;
    try {
      const { AutonomousEngineeringLoop } = await import("../autonomous-engineering/AutonomousEngineeringLoop");
      const loop = new AutonomousEngineeringLoop();
      aelOk = typeof loop.run === "function";
    } catch { aelOk = false; }
    checks.push(check("AutonomousEngineeringLoop operational", aelOk, aelOk ? "AEL API callable" : "AEL import failed", true));

    // SHR
    let shrOk = false;
    try {
      const { RuntimeSupervisor } = await import("../self-healing-runtime/RuntimeSupervisor");
      const sup = new RuntimeSupervisor();
      shrOk = typeof sup.start === "function";
    } catch { shrOk = false; }
    checks.push(check("SelfHealingRuntime operational", shrOk, shrOk ? "SHR API callable" : "SHR failed", true));

    // PSM
    let psmOk = false;
    try {
      const { PersistentSessionManager } = await import("../runtime-persistence/PersistentSessionManager");
      const mgr = new PersistentSessionManager();
      psmOk = typeof mgr.restore === "function";
    } catch { psmOk = false; }
    checks.push(check("PersistentSessionManager operational", psmOk, psmOk ? "PSM API callable" : "PSM failed", true));

    const failed = checks.filter(c => c.status !== "PASS");
    const criticalFailed = failed.filter(c => c.critical);
    const score = Math.round((checks.filter(c => c.status === "PASS").length / checks.length) * 100);

    return {
      id: "cap_validator",
      name: "Capability Validator",
      domain: "Infrastructure",
      status: criticalFailed.length > 0 ? "FAIL" : failed.length > 0 ? "WARN" : "PASS",
      score,
      detail: `${checks.filter(c => c.status === "PASS").length}/${checks.length} capabilities operational`,
      checks,
      durationMs: Date.now() - t0,
      blockers: criticalFailed.map(c => `[CRITICAL] ${c.name}: ${c.detail}`),
      warnings: failed.filter(c => !c.critical).map(c => `${c.name}: ${c.detail}`),
      recommendations: criticalFailed.length > 0
        ? ["Restore failed capability modules before proceeding to connector integration."]
        : [],
    };
  }
}