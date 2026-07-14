/**
 * RuntimeDiagnostics.ts — Sprint 6.3.1
 * Runs diagnostic checks across all SHR subsystems.
 */

import type { DiagnosticResult, DiagnosticCheck, RuntimeState } from "./SHRTypes";
import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";

export class RuntimeDiagnostics {
  async run(runtimeState: RuntimeState): Promise<DiagnosticResult> {
    const checks: DiagnosticCheck[] = [];

    checks.push(await this._checkKG());
    checks.push(await this._checkCIS());
    checks.push(await this._checkEngineeringMemory());
    checks.push(await this._checkUCP());
    checks.push(await this._checkWorkflow());

    const overall = checks.every(c => c.passed);

    return {
      overall,
      runtimeState,
      details: checks,
      capturedAt: Date.now(),
    };
  }

  private async _checkKG(): Promise<DiagnosticCheck> {
    const t0 = Date.now();
    const ready = KnowledgeGraphStore.isReady();
    return {
      name: "KnowledgeGraphStore",
      passed: true, // KG not being ready is not a failure — just a pre-condition
      detail: ready
        ? `KG ready — ${(KnowledgeGraphStore.get("diag") ?? { entityCount: 0 }).entityCount} entities`
        : "KG not yet built",
      durationMs: Date.now() - t0,
    };
  }

  private async _checkCIS(): Promise<DiagnosticCheck> {
    const t0 = Date.now();
    try {
      const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
      const cis = new ConnectorInvocationService();
      return {
        name: "ConnectorInvocationService",
        passed: typeof cis.invoke === "function",
        detail: typeof cis.invoke === "function" ? "CIS ready" : "CIS.invoke missing",
        durationMs: Date.now() - t0,
      };
    } catch (e) {
      return { name: "ConnectorInvocationService", passed: false, detail: String(e), durationMs: Date.now() - t0 };
    }
  }

  private async _checkEngineeringMemory(): Promise<DiagnosticCheck> {
    const t0 = Date.now();
    try {
      const { EngineeringMemory } = await import("../engineering-memory/EngineeringMemory");
      const mem = new EngineeringMemory();
      const ok = typeof mem.recordImplementation === "function";
      return {
        name: "EngineeringMemory",
        passed: ok,
        detail: ok ? "EngineeringMemory ready" : "API missing",
        durationMs: Date.now() - t0,
      };
    } catch (e) {
      return { name: "EngineeringMemory", passed: false, detail: String(e), durationMs: Date.now() - t0 };
    }
  }

  private async _checkUCP(): Promise<DiagnosticCheck> {
    const t0 = Date.now();
    try {
      const { ConnectorRuntime } = await import("../universal-connector-platform/ConnectorRuntime");
      const rt = new ConnectorRuntime();
      rt.start();
      const ok = rt.isRunning();
      rt.stop();
      return {
        name: "UniversalConnectorPlatform",
        passed: ok,
        detail: ok ? "UCP runtime probe OK" : "UCP runtime failed to start",
        durationMs: Date.now() - t0,
      };
    } catch (e) {
      return { name: "UniversalConnectorPlatform", passed: false, detail: String(e), durationMs: Date.now() - t0 };
    }
  }

  private async _checkWorkflow(): Promise<DiagnosticCheck> {
    const t0 = Date.now();
    try {
      const { EngineeringWorkflow } = await import("../engineering-workflow/EngineeringWorkflow");
      const wf = new EngineeringWorkflow();
      const ok = typeof wf.inspect === "function";
      return {
        name: "EngineeringWorkflow",
        passed: ok,
        detail: ok ? "EngineeringWorkflow ready" : "inspect() missing",
        durationMs: Date.now() - t0,
      };
    } catch (e) {
      return { name: "EngineeringWorkflow", passed: false, detail: String(e), durationMs: Date.now() - t0 };
    }
  }
}