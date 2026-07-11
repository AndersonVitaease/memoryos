// Capability Runtime — CapabilityRuntime
// Foundation v1.0 · Engineering First
//
// Orquestrador principal. Integra Registry + Loader + Executor.
// Reutiliza integralmente o Connector Runtime certificado.

import type { ICapability } from "./ICapability";
import { CapabilityRegistry } from "./CapabilityRegistry";
import { CapabilityLoader } from "./CapabilityLoader";
import { CapabilityExecutor } from "./CapabilityExecutor";
import type {
  CapabilityContext,
  CapabilityResult,
  CapabilityMetrics,
  CapabilityExecutionRecord,
} from "./CapabilityTypes";
import { makeCapabilityExecutionId, makeCapabilityLog } from "./CapabilityTypes";
import type { ConnectorRuntime } from "../connector-runtime/ConnectorRuntime";

// Policy Engine — lazy import (mesmo padrao do ConnectorRuntime)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _policyEngine: any = null;
async function getPolicyEngine() {
  if (!_policyEngine) {
    const mod = await import("../policies/policyEngine.js");
    _policyEngine = mod.PolicyEngine ?? mod.default;
  }
  return _policyEngine;
}

export class CapabilityRuntime {
  private readonly registry = new CapabilityRegistry();
  private readonly loader   = new CapabilityLoader();
  private readonly executor = new CapabilityExecutor();
  private readonly metrics  = new Map<string, CapabilityMetrics>();

  constructor(private readonly connectorRuntime: ConnectorRuntime) {}

  // ── Registration ───────────────────────────────────────────────────────────

  register(capability: ICapability): void {
    this.registry.register(capability);
    const meta = capability.metadata();
    this.metrics.set(capability.id, {
      capabilityId: capability.id,
      connectorId: meta.connectorId,
      totalExecutions: 0,
      totalFailures: 0,
      totalTimeouts: 0,
      avgDurationMs: 0,
      lastExecutedAt: null,
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async load(capabilityId: string, context: Omit<CapabilityContext, "executionId">): Promise<void> {
    const capability = this.getOrThrow(capabilityId);
    const ctx: CapabilityContext = {
      ...context,
      executionId: makeCapabilityExecutionId(),
    };
    const result = await this.loader.load(capability, ctx, this.connectorRuntime);
    if (!result.success) throw new Error(`CapabilityLoader failed: ${result.error}`);
  }

  async unload(capabilityId: string): Promise<void> {
    const capability = this.getOrThrow(capabilityId);
    await this.loader.unload(capability);
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  buildCancelledResult(capabilityId: string, connectorId: string, operation: string): CapabilityResult {
    return {
      status: "CANCELLED",
      success: false,
      error: "Execution cancelled by user",
      duration: 0,
      capabilityId,
      connectorId,
      executionId: makeCapabilityExecutionId(),
      logs: [makeCapabilityLog("warn", `Operation "${operation}" cancelled before execution`)],
    };
  }

  async execute(
    capabilityId: string,
    operation: string,
    payload: Record<string, unknown>,
    context: Omit<CapabilityContext, "executionId" | "capabilityId">,
    timeoutMs?: number,
  ): Promise<CapabilityResult> {
    const capability = this.getOrThrow(capabilityId);
    const ctx: CapabilityContext = {
      ...context,
      capabilityId,
      executionId: makeCapabilityExecutionId(),
    };

    // Policy Engine gate — obrigatorio antes de qualquer execucao (Foundation v1.0)
    const policy = await getPolicyEngine();
    const authResult = await policy.authorize({
      capabilityId,
      operation,
      connectorId: ctx.connectorId,
      context: ctx,
    });

    if (!authResult.allow) {
      const denied: CapabilityResult = {
        status: "DENIED",
        success: false,
        error: authResult.reason ?? "Execution denied by Policy Engine",
        duration: 0,
        capabilityId,
        connectorId: ctx.connectorId,
        executionId: ctx.executionId,
        logs: [makeCapabilityLog("warn", `Policy Engine denied "${operation}" on capability "${capabilityId}": ${authResult.reason ?? "no reason"}`)],
      };
      this.updateMetrics(capabilityId, denied);
      return denied;
    }

    const result = await this.executor.execute(
      capability, operation, payload, ctx, this.connectorRuntime, timeoutMs,
    );
    this.updateMetrics(capabilityId, result);
    return result;
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getMetrics(capabilityId: string): CapabilityMetrics | undefined {
    return this.metrics.get(capabilityId);
  }

  allMetrics(): CapabilityMetrics[] {
    return Array.from(this.metrics.values());
  }

  getHistory(): CapabilityExecutionRecord[] {
    return this.executor.getHistory();
  }

  listCapabilities() {
    return this.registry.listAll();
  }

  isLoaded(capabilityId: string): boolean {
    return this.loader.isLoaded(capabilityId);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private getOrThrow(id: string): ICapability {
    const c = this.registry.get(id);
    if (!c) throw new Error(`CapabilityRuntime: capability "${id}" not found`);
    return c;
  }

  private updateMetrics(capabilityId: string, result: CapabilityResult): void {
    const m = this.metrics.get(capabilityId);
    if (!m) return;
    m.totalExecutions++;
    if (!result.success) m.totalFailures++;
    if (result.status === "TIMEOUT") m.totalTimeouts++;
    m.avgDurationMs = Math.round(
      (m.avgDurationMs * (m.totalExecutions - 1) + result.duration) / m.totalExecutions,
    );
    m.lastExecutedAt = Date.now();
  }
}