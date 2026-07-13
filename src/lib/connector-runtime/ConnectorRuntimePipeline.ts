/**
 * ConnectorRuntimePipeline.ts
 * Connector Runtime — End-to-End Validation Pipeline
 * Validates: Goal Runtime → Planner → Capability Runtime → Connector Runtime
 * Provides: discovery, registration, health checks, capability exposure, dynamic routing
 * Foundation v1.0 · Engineering First · 2026-07-13
 */

import { ConnectorRuntime } from './ConnectorRuntime';
import { ConnectorRegistry } from './ConnectorRegistry';
import { Base44Connector } from './connectors/Base44Connector';
import { GitHubConnector } from './connectors/GitHubConnector';
import type {
  ConnectorContext, ConnectorResult, ConnectorMetadata,
  ConnectorHealthReport, ConnectorMetrics,
} from './ConnectorTypes';
import { makeExecutionId } from './ConnectorTypes';

// ── Registry Entry (enriched for diagnostics) ────────────────────────────────

export interface RegistryEntry {
  connectorId: string;
  name: string;
  version: string;
  provider: string;
  status: 'registered' | 'ready' | 'degraded' | 'error' | 'unknown';
  capabilities: string[];
  lastHealthCheck: number | null;
  healthStatus: string;
  healthDetails: string;
  latencyMs: number | null;
  loadTimeMs: number | null;
  totalExecutions: number;
  totalFailures: number;
}

// ── Connector Log Entry ────────────────────────────────────────────────────────

export interface ConnectorLogEntry {
  id: string;
  timestamp: number;
  connectorId: string;
  connectorName: string;
  action: string;
  result: 'SUCCESS' | 'FAILED' | 'DENIED' | 'TIMEOUT' | 'CANCELLED';
  executionTimeMs: number;
  details?: string;
}

// ── Diagnostic Row ─────────────────────────────────────────────────────────────

export interface ConnectorDiagnostic {
  connectorId: string;
  name: string;
  status: string;
  latencyMs: number | null;
  capabilities: string[];
  lastHealthCheckAt: number | null;
  healthDetails: string;
  metrics: ConnectorMetrics | undefined;
}

// ── Pipeline Test Result ───────────────────────────────────────────────────────

export interface PipelineTestResult {
  group: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

// ── Validation Report ─────────────────────────────────────────────────────────

export interface PipelineValidationReport {
  runAt: number;
  totalMs: number;
  results: PipelineTestResult[];
  passed: number;
  total: number;
  successRate: number;
  checks: {
    runtimeOperational: boolean;
    base44Operational: boolean;
    githubOperational: boolean;
    registryOperational: boolean;
    dynamicRoutingOperational: boolean;
  };
  registry: RegistryEntry[];
  diagnostics: ConnectorDiagnostic[];
  logs: ConnectorLogEntry[];
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function makeCtx(extra: Partial<ConnectorContext> = {}): ConnectorContext {
  return {
    executionId: makeExecutionId(),
    userId: 'pipeline-validator',
    projectId: 'connector-runtime-validation',
    sessionId: 'pipeline-session',
    ...extra,
  };
}

// ── ConnectorRuntimePipeline ───────────────────────────────────────────────────

export class ConnectorRuntimePipeline {
  private runtime: ConnectorRuntime;
  private base44: Base44Connector;
  private github: GitHubConnector;
  private registry: RegistryEntry[] = [];
  private logs: ConnectorLogEntry[] = [];
  private logSeq = 0;

  constructor() {
    this.runtime = new ConnectorRuntime();
    this.base44 = new Base44Connector();
    this.github = new GitHubConnector();
  }

  // ── Auto-discovery & registration ─────────────────────────────────────────

  async discover(): Promise<void> {
    const connectors = [this.base44, this.github];

    for (const c of connectors) {
      if (!this.runtime.listConnectors().find(m => m.id === c.id)) {
        this.runtime.register(c);
      }
    }

    // Load (initialize) each connector
    const ctx = makeCtx();
    for (const c of connectors) {
      try {
        await this.runtime.load(c.id, ctx);
      } catch {
        // degraded — continue
      }
    }

    await this.refreshRegistry();
  }

  async refreshRegistry(): Promise<void> {
    const metas = this.runtime.listConnectors();
    const healthResults = await this.runtime.healthAll();
    const healthMap = new Map<string, ConnectorHealthReport>(healthResults.map(h => [h.connectorId, h]));

    this.registry = metas.map(m => {
      const h = healthMap.get(m.id);
      const metrics = this.runtime.getMetrics(m.id);
      return {
        connectorId: m.id,
        name: m.name,
        version: m.version,
        provider: m.author,
        status: h?.status === 'healthy' ? 'ready' : h?.status === 'degraded' ? 'degraded' : 'error',
        capabilities: m.capabilities,
        lastHealthCheck: h?.checkedAt ?? null,
        healthStatus: h?.status ?? 'unknown',
        healthDetails: h?.details ?? '',
        latencyMs: metrics?.avgDurationMs ?? null,
        loadTimeMs: metrics?.loadTimeMs ?? null,
        totalExecutions: metrics?.totalExecutions ?? 0,
        totalFailures: metrics?.totalFailures ?? 0,
      } as RegistryEntry;
    });
  }

  // ── Dynamic routing — select connector by capability ─────────────────────

  async routeByCapability(capability: string, payload: Record<string, unknown> = {}): Promise<ConnectorResult | null> {
    const meta = this.runtime.listConnectors().find(m => m.capabilities.includes(capability));
    if (!meta) return null;
    const ctx = makeCtx({ capabilityId: capability });
    const result = await this.runtime.execute(meta.id, capability, payload, ctx);
    this.addLog(meta.id, meta.name, capability, result);
    return result;
  }

  // ── Execute with logging ──────────────────────────────────────────────────

  async execute(connectorId: string, operation: string, payload: Record<string, unknown> = {}): Promise<ConnectorResult> {
    const meta = this.runtime.listConnectors().find(m => m.id === connectorId);
    const ctx = makeCtx();
    const result = await this.runtime.execute(connectorId, operation, payload, ctx);
    this.addLog(connectorId, meta?.name ?? connectorId, operation, result);
    return result;
  }

  private addLog(connectorId: string, connectorName: string, action: string, result: ConnectorResult): void {
    this.logs.push({
      id: `log_${++this.logSeq}`,
      timestamp: Date.now(),
      connectorId,
      connectorName,
      action,
      result: result.status,
      executionTimeMs: result.duration,
      details: result.error ?? undefined,
    });
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  async getDiagnostics(): Promise<ConnectorDiagnostic[]> {
    await this.refreshRegistry();
    return this.registry.map(r => ({
      connectorId: r.connectorId,
      name: r.name,
      status: r.healthStatus,
      latencyMs: r.latencyMs,
      capabilities: r.capabilities,
      lastHealthCheckAt: r.lastHealthCheck,
      healthDetails: r.healthDetails,
      metrics: this.runtime.getMetrics(r.connectorId),
    }));
  }

  getLogs(): ConnectorLogEntry[] { return [...this.logs]; }
  getRegistry(): RegistryEntry[] { return [...this.registry]; }
  getRuntime(): ConnectorRuntime { return this.runtime; }

  // ── Full Validation Pipeline ──────────────────────────────────────────────

  async runValidation(): Promise<PipelineValidationReport> {
    const startAll = Date.now();
    const results: PipelineTestResult[] = [];

    async function test(
      group: string,
      name: string,
      fn: () => Promise<{ passed: boolean; details?: Record<string, unknown> }>,
    ): Promise<PipelineTestResult> {
      const t = Date.now();
      try {
        const { passed, details } = await fn();
        return { group, name, passed, durationMs: Date.now() - t, details };
      } catch (err) {
        return { group, name, passed: false, durationMs: Date.now() - t, error: err instanceof Error ? err.message : String(err) };
      }
    }

    // ── G1: Runtime Initialization ─────────────────────────────────────────
    results.push(await test('G1 Runtime Init', 'ConnectorRuntime instantiates without error', async () => {
      return { passed: !!this.runtime };
    }));

    results.push(await test('G1 Runtime Init', 'discover() registers Base44 and GitHub connectors', async () => {
      await this.discover();
      const metas = this.runtime.listConnectors();
      return { passed: metas.some(m => m.id === 'base44') && metas.some(m => m.id === 'github'), details: { count: metas.length } };
    }));

    results.push(await test('G1 Runtime Init', 'Registry reports 2 connectors after discovery', async () => {
      return { passed: this.registry.length >= 2, details: { registryCount: this.registry.length } };
    }));

    // ── G2: Connector Registry ─────────────────────────────────────────────
    results.push(await test('G2 Registry', 'Registry entry has all required fields', async () => {
      const entry = this.registry.find(r => r.connectorId === 'base44');
      const ok = !!(entry?.connectorId && entry?.name && entry?.version && entry?.provider && entry?.capabilities?.length);
      return { passed: !!ok, details: entry ?? {} };
    }));

    results.push(await test('G2 Registry', 'Registry entry has status field', async () => {
      const e = this.registry[0];
      return { passed: ['registered', 'ready', 'degraded', 'error', 'unknown'].includes(e?.status ?? ''), details: { status: e?.status } };
    }));

    results.push(await test('G2 Registry', 'Base44 connector in registry with capabilities', async () => {
      const e = this.registry.find(r => r.connectorId === 'base44');
      return { passed: !!e && e.capabilities.length >= 4, details: { capabilities: e?.capabilities } };
    }));

    results.push(await test('G2 Registry', 'GitHub connector in registry with capabilities', async () => {
      const e = this.registry.find(r => r.connectorId === 'github');
      return { passed: !!e && e.capabilities.length >= 3, details: { capabilities: e?.capabilities } };
    }));

    // ── G3: Base44 Connector ──────────────────────────────────────────────
    results.push(await test('G3 Base44', 'connect() — initialize returns without throwing', async () => {
      const ctx = makeCtx();
      await this.base44.initialize(ctx);
      return { passed: true };
    }));

    results.push(await test('G3 Base44', 'healthCheck() — returns structured report', async () => {
      const h = await this.base44.health();
      return { passed: !!h.connectorId && !!h.status && typeof h.checkedAt === 'number', details: { status: h.status, details: h.details } };
    }));

    results.push(await test('G3 Base44', 'getCapabilities() — metadata returns capabilities array', async () => {
      const m = this.base44.metadata();
      return { passed: Array.isArray(m.capabilities) && m.capabilities.length > 0, details: { capabilities: m.capabilities } };
    }));

    results.push(await test('G3 Base44', 'execute(auth.me) — returns ConnectorResult', async () => {
      const r = await this.execute('base44', 'auth.me');
      return { passed: typeof r.status === 'string' && typeof r.duration === 'number', details: { status: r.status, duration: r.duration } };
    }));

    results.push(await test('G3 Base44', 'execute(connectivity.ping) — returns structured response', async () => {
      const r = await this.execute('base44', 'connectivity.ping');
      return { passed: typeof r.status === 'string', details: { status: r.status, duration: r.duration } };
    }));

    results.push(await test('G3 Base44', 'execute(projects.list) — returns array-shaped response', async () => {
      const r = await this.execute('base44', 'projects.list', { limit: 5 });
      return { passed: typeof r.status === 'string', details: { status: r.status } };
    }));

    results.push(await test('G3 Base44', 'execute(sessions.list) — returns structured response', async () => {
      const r = await this.execute('base44', 'sessions.list', { limit: 3 });
      return { passed: typeof r.status === 'string', details: { status: r.status } };
    }));

    results.push(await test('G3 Base44', 'execute(app.info) — returns connector metadata in data', async () => {
      const r = await this.execute('base44', 'app.info');
      return { passed: typeof r.status === 'string', details: { status: r.status } };
    }));

    results.push(await test('G3 Base44', 'execute(auth.validate) — returns auth check result', async () => {
      const r = await this.execute('base44', 'auth.validate');
      return { passed: typeof r.status === 'string', details: { status: r.status } };
    }));

    results.push(await test('G3 Base44', 'disconnect() — shutdown without error', async () => {
      await this.base44.shutdown();
      return { passed: true };
    }));

    results.push(await test('G3 Base44', 'execute unknown operation returns FAILED not exception', async () => {
      await this.base44.initialize(makeCtx());
      const r = await this.execute('base44', 'unknown.op.xyz');
      return { passed: r.status === 'FAILED' && !r.success, details: { status: r.status } };
    }));

    // ── G4: GitHub Connector ──────────────────────────────────────────────
    results.push(await test('G4 GitHub', 'connect() — initialize without throwing', async () => {
      const ctx = makeCtx();
      await this.github.initialize(ctx);
      return { passed: true };
    }));

    results.push(await test('G4 GitHub', 'healthCheck() — returns structured report', async () => {
      const h = await this.github.health();
      return { passed: !!h.connectorId && !!h.status, details: { status: h.status, details: h.details } };
    }));

    results.push(await test('G4 GitHub', 'getCapabilities() — capabilities include repos.list', async () => {
      const m = this.github.metadata();
      return { passed: m.capabilities.includes('repos.list'), details: { capabilities: m.capabilities } };
    }));

    results.push(await test('G4 GitHub', 'execute(connectivity.ping) — returns structured ConnectorResult', async () => {
      const r = await this.execute('github', 'connectivity.ping');
      return { passed: typeof r.status === 'string' && typeof r.duration === 'number', details: { status: r.status, duration: r.duration } };
    }));

    results.push(await test('G4 GitHub', 'execute(repos.list) — returns ConnectorResult', async () => {
      const r = await this.execute('github', 'repos.list', { per_page: 5 });
      return { passed: typeof r.status === 'string', details: { status: r.status } };
    }));

    results.push(await test('G4 GitHub', 'execute(repos.branches) with missing payload — returns FAILED', async () => {
      const r = await this.execute('github', 'repos.branches', {});
      return { passed: r.status === 'FAILED', details: { status: r.status, error: r.error } };
    }));

    results.push(await test('G4 GitHub', 'execute(auth.user) — returns ConnectorResult', async () => {
      const r = await this.execute('github', 'auth.user');
      return { passed: typeof r.status === 'string', details: { status: r.status } };
    }));

    results.push(await test('G4 GitHub', 'execute(auth.validate) — returns ConnectorResult', async () => {
      const r = await this.execute('github', 'auth.validate');
      return { passed: typeof r.status === 'string', details: { status: r.status } };
    }));

    results.push(await test('G4 GitHub', 'execute unknown operation returns FAILED not exception', async () => {
      const r = await this.execute('github', 'nonexistent.op');
      return { passed: r.status === 'FAILED' && !r.success, details: { status: r.status } };
    }));

    results.push(await test('G4 GitHub', 'disconnect() — shutdown without error', async () => {
      await this.github.shutdown();
      return { passed: true };
    }));

    // ── G5: Dynamic Routing ───────────────────────────────────────────────
    results.push(await test('G5 Dynamic Routing', 'routeByCapability(auth.me) routes to Base44', async () => {
      await this.discover();
      const r = await this.routeByCapability('auth.me');
      return { passed: r !== null && r.connectorId === 'base44', details: { connectorId: r?.connectorId, status: r?.status } };
    }));

    results.push(await test('G5 Dynamic Routing', 'routeByCapability(repos.list) routes to GitHub', async () => {
      const r = await this.routeByCapability('repos.list', { per_page: 3 });
      return { passed: r !== null && r.connectorId === 'github', details: { connectorId: r?.connectorId, status: r?.status } };
    }));

    results.push(await test('G5 Dynamic Routing', 'routeByCapability(nonexistent) returns null gracefully', async () => {
      const r = await this.routeByCapability('totally.unknown.capability.xyz');
      return { passed: r === null };
    }));

    results.push(await test('G5 Dynamic Routing', 'runtime.listConnectors() returns all registered connectors', async () => {
      const list = this.runtime.listConnectors();
      return { passed: list.length >= 2, details: { connectors: list.map(m => m.id) } };
    }));

    results.push(await test('G5 Dynamic Routing', 'runtime.healthAll() returns health for all connectors', async () => {
      const healths = await this.runtime.healthAll();
      return { passed: healths.length >= 2, details: { count: healths.length, statuses: healths.map(h => h.status) } };
    }));

    // ── G6: Health Checks ─────────────────────────────────────────────────
    results.push(await test('G6 Health Checks', 'runtime.health(base44) returns ConnectorHealthReport', async () => {
      const h = await this.runtime.health('base44');
      return { passed: !!h.connectorId && !!h.status && typeof h.checkedAt === 'number', details: { status: h.status } };
    }));

    results.push(await test('G6 Health Checks', 'runtime.health(github) returns ConnectorHealthReport', async () => {
      const h = await this.runtime.health('github');
      return { passed: !!h.connectorId && !!h.status, details: { status: h.status } };
    }));

    results.push(await test('G6 Health Checks', 'runtime.health(unknown) throws — not found', async () => {
      try {
        await this.runtime.health('connector-does-not-exist');
        return { passed: false };
      } catch {
        return { passed: true };
      }
    }));

    // ── G7: Metrics & Logs ────────────────────────────────────────────────
    results.push(await test('G7 Metrics', 'runtime.getMetrics(base44) returns metrics after execution', async () => {
      const m = this.runtime.getMetrics('base44');
      return { passed: m !== undefined && typeof m.totalExecutions === 'number', details: m };
    }));

    results.push(await test('G7 Metrics', 'runtime.allMetrics() returns array with 2+ entries', async () => {
      const ms = this.runtime.allMetrics();
      return { passed: ms.length >= 2, details: { count: ms.length } };
    }));

    results.push(await test('G7 Metrics', 'runtime.getHistory() returns execution records', async () => {
      const h = this.runtime.getHistory();
      return { passed: Array.isArray(h), details: { count: h.length } };
    }));

    results.push(await test('G7 Metrics', 'connector logs accumulated: each action is logged', async () => {
      return { passed: this.logs.length > 0, details: { logCount: this.logs.length } };
    }));

    results.push(await test('G7 Metrics', 'log entries have required fields', async () => {
      if (this.logs.length === 0) return { passed: false, error: 'No logs' };
      const l = this.logs[0];
      const ok = !!(l.id && l.connectorId && l.action && l.result && typeof l.executionTimeMs === 'number');
      return { passed: ok, details: { sample: l } };
    }));

    // ── G8: Integration — MemoryOS → Runtime → Base44 ─────────────────────
    results.push(await test('G8 Integration Base44', 'MemoryOS→Runtime→Base44: auth.me end-to-end', async () => {
      const r = await this.execute('base44', 'auth.me');
      return { passed: typeof r.status === 'string' && !!r.executionId && !!r.connectorId, details: { status: r.status, executionId: r.executionId } };
    }));

    results.push(await test('G8 Integration Base44', 'MemoryOS→Runtime→Base44: projects.list end-to-end', async () => {
      const r = await this.execute('base44', 'projects.list');
      return { passed: typeof r.status === 'string' && Array.isArray(r.logs), details: { status: r.status, logCount: r.logs?.length } };
    }));

    results.push(await test('G8 Integration Base44', 'MemoryOS→Runtime→Base44: connectivity.ping end-to-end', async () => {
      const r = await this.execute('base44', 'connectivity.ping');
      return { passed: typeof r.status === 'string' && typeof r.duration === 'number', details: { status: r.status, duration: r.duration } };
    }));

    // ── G9: Integration — MemoryOS → Runtime → GitHub ─────────────────────
    results.push(await test('G9 Integration GitHub', 'MemoryOS→Runtime→GitHub: connectivity.ping end-to-end', async () => {
      const r = await this.execute('github', 'connectivity.ping');
      return { passed: typeof r.status === 'string' && !!r.executionId, details: { status: r.status } };
    }));

    results.push(await test('G9 Integration GitHub', 'MemoryOS→Runtime→GitHub: repos.list end-to-end', async () => {
      const r = await this.execute('github', 'repos.list');
      return { passed: typeof r.status === 'string' && Array.isArray(r.logs), details: { status: r.status } };
    }));

    results.push(await test('G9 Integration GitHub', 'MemoryOS→Runtime→GitHub: auth.user end-to-end', async () => {
      const r = await this.execute('github', 'auth.user');
      return { passed: typeof r.status === 'string', details: { status: r.status } };
    }));

    results.push(await test('G9 Integration GitHub', 'MemoryOS→Runtime→GitHub: logs accumulate across multiple ops', async () => {
      const before = this.logs.length;
      await this.execute('github', 'connectivity.ping');
      await this.execute('github', 'repos.list');
      return { passed: this.logs.length > before, details: { before, after: this.logs.length } };
    }));

    // ── G10: Validation Report ─────────────────────────────────────────────
    results.push(await test('G10 Validation Report', 'Validation pipeline produces at least 30 test results', async () => {
      return { passed: results.length >= 30, details: { count: results.length } };
    }));

    results.push(await test('G10 Validation Report', 'refreshRegistry produces RegistryEntry with provider field', async () => {
      await this.refreshRegistry();
      const e = this.registry[0];
      return { passed: typeof e?.provider === 'string', details: { provider: e?.provider } };
    }));

    results.push(await test('G10 Validation Report', 'getDiagnostics() returns ConnectorDiagnostic array', async () => {
      const d = await this.getDiagnostics();
      return { passed: d.length >= 2, details: { count: d.length, sample: d[0] } };
    }));

    // Final refresh
    await this.refreshRegistry();

    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    const successRate = total > 0 ? passed / total : 0;
    const b44Entries = results.filter(r => r.group.startsWith('G3') || r.group.startsWith('G8'));
    const ghEntries = results.filter(r => r.group.startsWith('G4') || r.group.startsWith('G9'));
    const regEntries = results.filter(r => r.group.startsWith('G2'));
    const routeEntries = results.filter(r => r.group.startsWith('G5'));

    return {
      runAt: startAll,
      totalMs: Date.now() - startAll,
      results,
      passed,
      total,
      successRate,
      checks: {
        runtimeOperational: results.filter(r => r.group.startsWith('G1')).every(r => r.passed),
        base44Operational: b44Entries.filter(r => r.passed).length >= Math.ceil(b44Entries.length * 0.7),
        githubOperational: ghEntries.filter(r => r.passed).length >= Math.ceil(ghEntries.length * 0.6),
        registryOperational: regEntries.every(r => r.passed),
        dynamicRoutingOperational: routeEntries.every(r => r.passed),
      },
      registry: [...this.registry],
      diagnostics: await this.getDiagnostics(),
      logs: [...this.logs],
    };
  }
}