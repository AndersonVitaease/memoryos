// Connector Runtime — ConnectorRuntime — EF-35 Production
// Foundation v1.0 · Engineering First

import type { IConnector } from "./IConnector";
import { ConnectorRegistry } from "./ConnectorRegistry";
import { ConnectorLoader } from "./ConnectorLoader";
import { ConnectorExecutor } from "./ConnectorExecutor";
import type {
  ConnectorContext, ConnectorResult, ConnectorMetrics,
  ConnectorHealthReport, ExecutionRecord, ConnectorHealthStatus,
} from "./ConnectorTypes";
import { makeExecutionId, makeLog, calcP95 } from "./ConnectorTypes";

// ── Internal extended metrics record ─────────────────────────────────────────

interface MetricsInternal {
  connectorId: string;
  totalExecutions: number;
  totalFailures: number;
  totalDenied: number;
  totalTimeouts: number;
  totalSuccesses: number;
  durations: number[];
  lastExecutedAt: number | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  loadTimeMs: number | null;
  uptimeSince: number | null;
  healthHistory: ConnectorHealthStatus[];
}

function toPublicMetrics(m: MetricsInternal): ConnectorMetrics {
  const avg = m.durations.length > 0
    ? Math.round(m.durations.reduce((a, b) => a + b, 0) / m.durations.length)
    : 0;
  return {
    connectorId: m.connectorId,
    totalExecutions: m.totalExecutions,
    totalFailures: m.totalFailures,
    totalDenied: m.totalDenied,
    totalTimeouts: m.totalTimeouts,
    totalSuccesses: m.totalSuccesses,
    avgDurationMs: avg,
    p95DurationMs: calcP95(m.durations),
    lastExecutedAt: m.lastExecutedAt,
    lastSuccessAt: m.lastSuccessAt,
    lastFailureAt: m.lastFailureAt,
    lastError: m.lastError,
    loadTimeMs: m.loadTimeMs,
    uptimeSince: m.uptimeSince,
    healthHistory: [...m.healthHistory],
  };
}

// Policy Engine — JS interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _policyEngine: any = null;
async function getPolicyEngine() {
  if (!_policyEngine) {
    const mod = await import("../../lib/policies/policyEngine.js");
    _policyEngine = mod.PolicyEngine ?? mod.default;
  }
  return _policyEngine;
}

export class ConnectorRuntime {
  private readonly registry = new ConnectorRegistry();
  private readonly loader   = new ConnectorLoader();
  private readonly executor = new ConnectorExecutor();
  private readonly metricsMap = new Map<string, MetricsInternal>();

  // ── Registration ───────────────────────────────────────────────────────────

  register(connector: IConnector): void {
    this.registry.register(connector);
    this.metricsMap.set(connector.id, {
      connectorId: connector.id,
      totalExecutions: 0,
      totalFailures: 0,
      totalDenied: 0,
      totalTimeouts: 0,
      totalSuccesses: 0,
      durations: [],
      lastExecutedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      loadTimeMs: null,
      uptimeSince: null,
      healthHistory: [],
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async load(connectorId: string, context: ConnectorContext): Promise<void> {
    const connector = this.getOrThrow(connectorId);
    const result = await this.loader.load(connector, context);
    const m = this.metricsMap.get(connectorId)!;
    m.loadTimeMs = result.loadTimeMs;
    if (result.success) {
      m.uptimeSince = Date.now();
    }
    if (!result.success) throw new Error(`ConnectorLoader failed: ${result.error}`);
  }

  async unload(connectorId: string): Promise<void> {
    const connector = this.getOrThrow(connectorId);
    await this.loader.unload(connector);
    const m = this.metricsMap.get(connectorId);
    if (m) m.uptimeSince = null;
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  buildCancelledResult(connectorId: string, operation: string): ConnectorResult {
    return {
      status: "CANCELLED",
      success: false,
      error: "Execution cancelled by user",
      duration: 0,
      connectorId,
      executionId: makeExecutionId(),
      logs: [makeLog("warn", `Operation "${operation}" cancelled before execution`)],
    };
  }

  async execute(
    connectorId: string,
    operation: string,
    payload: Record<string, unknown>,
    context: Omit<ConnectorContext, "executionId">,
    timeoutMs?: number,
  ): Promise<ConnectorResult> {
    const connector = this.getOrThrow(connectorId);
    const ctx: ConnectorContext = { ...context, executionId: makeExecutionId() };

    // Policy Engine gate — mandatory before any execution
    const policy = await getPolicyEngine();
    const authResult = await policy.authorize({ connectorId, operation, context: ctx });

    if (!authResult.allow) {
      const denied: ConnectorResult = {
        status: "DENIED",
        success: false,
        error: authResult.reason ?? "Execution denied by Policy Engine",
        duration: 0,
        connectorId,
        executionId: ctx.executionId,
        logs: [makeLog("warn", `[PolicyEngine] DENIED "${operation}" on "${connectorId}" — rule: ${authResult.ruleId ?? "?"} — ${authResult.reason ?? "no reason"}`)],
      };
      this.updateMetrics(connectorId, denied);
      return denied;
    }

    const result = await this.executor.execute(connector, operation, payload, ctx, timeoutMs);
    this.updateMetrics(connectorId, result);
    return result;
  }

  // ── Health ─────────────────────────────────────────────────────────────────

  async health(connectorId: string): Promise<ConnectorHealthReport> {
    const report = await this.getOrThrow(connectorId).health();
    // record health status in history
    const m = this.metricsMap.get(connectorId);
    if (m) {
      m.healthHistory.push(report.status);
      if (m.healthHistory.length > 20) m.healthHistory.shift();
    }
    return report;
  }

  async healthAll(): Promise<ConnectorHealthReport[]> {
    const ids = this.registry.listAll().map(m => m.id);
    return Promise.all(ids.map(id => this.health(id)));
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getMetrics(connectorId: string): ConnectorMetrics | undefined {
    const m = this.metricsMap.get(connectorId);
    return m ? toPublicMetrics(m) : undefined;
  }

  allMetrics(): ConnectorMetrics[] {
    return Array.from(this.metricsMap.values()).map(toPublicMetrics);
  }

  getHistory(): ExecutionRecord[] {
    return this.executor.getHistory();
  }

  listConnectors() {
    return this.registry.listAll();
  }

  isLoaded(connectorId: string): boolean {
    return this.loader.isLoaded(connectorId);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private getOrThrow(id: string): IConnector {
    const c = this.registry.get(id);
    if (!c) throw new Error(`ConnectorRuntime: connector "${id}" not found`);
    return c;
  }

  private updateMetrics(connectorId: string, result: ConnectorResult): void {
    const m = this.metricsMap.get(connectorId);
    if (!m) return;
    m.totalExecutions++;
    m.lastExecutedAt = Date.now();
    m.durations.push(result.duration);
    if (m.durations.length > 500) m.durations.shift();

    if (result.status === "SUCCESS") {
      m.totalSuccesses++;
      m.lastSuccessAt = Date.now();
    } else if (result.status === "DENIED") {
      m.totalDenied++;
    } else if (result.status === "TIMEOUT") {
      m.totalTimeouts++;
      m.totalFailures++;
      m.lastFailureAt = Date.now();
      m.lastError = result.error ?? null;
    } else {
      m.totalFailures++;
      m.lastFailureAt = Date.now();
      m.lastError = result.error ?? null;
    }
  }
}