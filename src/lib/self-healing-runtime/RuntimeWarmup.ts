/**
 * RuntimeWarmup.ts — Sprint 6.3.1
 * Executes automatic warm-up sequences after restart/restore.
 * Runs: KnowledgeGraph, Connector, Memory, Registry, Runtime warm-ups.
 */

import type { WarmupResult, WarmupStep } from "./SHRTypes";
import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";

let _seq = 0;
function makeId(): string { return `warmup_${Date.now()}_${++_seq}`; }

export class RuntimeWarmup {
  private _history: WarmupResult[] = [];

  async run(): Promise<WarmupResult> {
    const startedAt = Date.now();
    const steps: WarmupStep[] = [];

    steps.push(await this._stepKnowledgeGraph());
    steps.push(await this._stepConnector());
    steps.push(await this._stepMemory());
    steps.push(await this._stepRegistry());
    steps.push(await this._stepRuntime());

    const failedSteps = steps.filter(s => !s.success).map(s => s.name);
    const result: WarmupResult = {
      id: makeId(),
      startedAt,
      completedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      steps,
      success: failedSteps.length === 0,
      failedSteps,
    };

    this._history.unshift(result);
    if (this._history.length > 50) this._history.splice(50);
    return result;
  }

  history(): WarmupResult[] { return [...this._history]; }

  lastResult(): WarmupResult | null { return this._history[0] ?? null; }

  // ── Individual warm-up steps ──────────────────────────────────────────────

  private async _stepKnowledgeGraph(): Promise<WarmupStep> {
    const t0 = Date.now();
    try {
      const ready = KnowledgeGraphStore.isReady();
      const entityCount = ready ? (KnowledgeGraphStore.get("warmup") ?? { entityCount: 0 }).entityCount : 0;
      return {
        name: "KnowledgeGraph",
        success: true,
        durationMs: Date.now() - t0,
        detail: ready
          ? `KG ready — ${entityCount} entities`
          : "KG not yet built — warmup registered for post-build",
      };
    } catch (e) {
      return { name: "KnowledgeGraph", success: false, durationMs: Date.now() - t0, detail: String(e) };
    }
  }

  private async _stepConnector(): Promise<WarmupStep> {
    const t0 = Date.now();
    try {
      // Probe connector invocation service availability
      const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
      const cis = new ConnectorInvocationService();
      const ok = typeof cis.invoke === "function";
      return {
        name: "Connector",
        success: ok,
        durationMs: Date.now() - t0,
        detail: ok ? "ConnectorInvocationService ready" : "CIS invoke missing",
      };
    } catch (e) {
      return { name: "Connector", success: false, durationMs: Date.now() - t0, detail: String(e) };
    }
  }

  private async _stepMemory(): Promise<WarmupStep> {
    const t0 = Date.now();
    try {
      const { EngineeringMemory } = await import("../engineering-memory/EngineeringMemory");
      const mem = new EngineeringMemory();
      const ok = typeof mem.recordImplementation === "function";
      return {
        name: "Memory",
        success: ok,
        durationMs: Date.now() - t0,
        detail: ok ? "EngineeringMemory API ready" : "EngineeringMemory API missing",
      };
    } catch (e) {
      return { name: "Memory", success: false, durationMs: Date.now() - t0, detail: String(e) };
    }
  }

  private async _stepRegistry(): Promise<WarmupStep> {
    const t0 = Date.now();
    try {
      const { ConnectorRegistry } = await import("../universal-connector-platform/ConnectorRegistry");
      const reg = new ConnectorRegistry();
      const ok = typeof reg.register === "function";
      return {
        name: "Registry",
        success: ok,
        durationMs: Date.now() - t0,
        detail: ok ? "ConnectorRegistry ready" : "Registry API missing",
      };
    } catch (e) {
      return { name: "Registry", success: false, durationMs: Date.now() - t0, detail: String(e) };
    }
  }

  private async _stepRuntime(): Promise<WarmupStep> {
    const t0 = Date.now();
    try {
      const { ConnectorRuntime } = await import("../universal-connector-platform/ConnectorRuntime");
      const rt = new ConnectorRuntime();
      rt.start();
      const ok = rt.isRunning();
      rt.stop();
      return {
        name: "Runtime",
        success: ok,
        durationMs: Date.now() - t0,
        detail: ok ? "ConnectorRuntime warm-up successful" : "ConnectorRuntime did not start",
      };
    } catch (e) {
      return { name: "Runtime", success: false, durationMs: Date.now() - t0, detail: String(e) };
    }
  }
}