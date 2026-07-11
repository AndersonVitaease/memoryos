// Connector Runtime — ConnectorRuntime
// Foundation v1.0 · Engineering First
//
// Orquestrador principal. Integra Registry + Loader + Executor.
// Mantém estado, metricas e ciclo de vida de todos os Connectors.

import type { IConnector } from "./IConnector";
import { ConnectorRegistry } from "./ConnectorRegistry";
import { ConnectorLoader } from "./ConnectorLoader";
import { ConnectorExecutor } from "./ConnectorExecutor";
import type {
  ConnectorContext, ConnectorResult, ConnectorMetrics,
  ConnectorHealthReport, ExecutionRecord,
} from "./ConnectorTypes";
import { makeExecutionId } from "./ConnectorTypes";

export class ConnectorRuntime {
  private readonly registry = new ConnectorRegistry();
  private readonly loader   = new ConnectorLoader();
  private readonly executor = new ConnectorExecutor();
  private readonly metrics  = new Map<string, ConnectorMetrics>();
  private readonly loadTimes = new Map<string, number>();

  // ── Registration ───────────────────────────────────────────────────────────

  register(connector: IConnector): void {
    this.registry.register(connector);
    this.metrics.set(connector.id, {
      connectorId: connector.id,
      totalExecutions: 0,
      totalFailures: 0,
      avgDurationMs: 0,
      lastExecutedAt: null,
      loadTimeMs: null,
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async load(connectorId: string, context: ConnectorContext): Promise<void> {
    const connector = this.getOrThrow(connectorId);
    const result = await this.loader.load(connector, context);
    if (!result.success) throw new Error(`ConnectorLoader failed: ${result.error}`);
    const m = this.metrics.get(connectorId)!;
    m.loadTimeMs = result.loadTimeMs;
  }

  async unload(connectorId: string): Promise<void> {
    const connector = this.getOrThrow(connectorId);
    await this.loader.unload(connector);
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  async execute(
    connectorId: string,
    operation: string,
    payload: Record<string, unknown>,
    context: Omit<ConnectorContext, "executionId">,
  ): Promise<ConnectorResult> {
    const connector = this.getOrThrow(connectorId);
    const ctx: ConnectorContext = { ...context, executionId: makeExecutionId() };

    const result = await this.executor.execute(connector, operation, payload, ctx);
    this.updateMetrics(connectorId, result);
    return result;
  }

  // ── Health ─────────────────────────────────────────────────────────────────

  async health(connectorId: string): Promise<ConnectorHealthReport> {
    return this.getOrThrow(connectorId).health();
  }

  async healthAll(): Promise<ConnectorHealthReport[]> {
    const ids = this.registry.listAll().map(m => m.id);
    return Promise.all(ids.map(id => this.health(id)));
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getMetrics(connectorId: string): ConnectorMetrics | undefined {
    return this.metrics.get(connectorId);
  }

  allMetrics(): ConnectorMetrics[] {
    return Array.from(this.metrics.values());
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
    const m = this.metrics.get(connectorId);
    if (!m) return;
    m.totalExecutions++;
    if (!result.success) m.totalFailures++;
    m.avgDurationMs = Math.round(
      (m.avgDurationMs * (m.totalExecutions - 1) + result.duration) / m.totalExecutions,
    );
    m.lastExecutedAt = Date.now();
  }
}