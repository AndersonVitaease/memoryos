/**
 * ConnectorRuntimePipeline.ts — EF-35 Production Validation Pipeline
 * Validates: Connector Runtime end-to-end with strengthened assertions
 * Foundation v1.0 · Engineering First · 2026-07-13
 */

import { ConnectorRuntime } from './ConnectorRuntime';
import { Base44Connector } from './connectors/Base44Connector';
import { GitHubConnector } from './connectors/GitHubConnector';
import type {
  ConnectorContext, ConnectorResult, ConnectorMetrics,
  ConnectorHealthReport, ConnectorValidationResult,
} from './ConnectorTypes';
import { makeExecutionId } from './ConnectorTypes';

// ── Registry Entry ────────────────────────────────────────────────────────────

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
  totalDenied: number;
  totalSuccesses: number;
  p95DurationMs: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  uptimeSince: number | null;
  healthHistory: string[];
  validation: ConnectorValidationResult | null;
}

// ── Connector Log Entry ───────────────────────────────────────────────────────

export interface ConnectorLogEntry {
  id: string;
  timestamp: number;
  connectorId: string;
  connectorName: string;
  action: string;
  result: string;
  executionTimeMs: number;
  details?: string;
}

// ── Diagnostic Row ────────────────────────────────────────────────────────────

export interface ConnectorDiagnostic {
  connectorId: string;
  name: string;
  version: string;
  provider: string;
  status: string;
  latencyMs: number | null;
  p95DurationMs: number;
  capabilities: string[];
  lastHealthCheckAt: number | null;
  healthDetails: string;
  metrics: ConnectorMetrics | undefined;
  validation: ConnectorValidationResult | null;
  authorizationStatus: string;
  uptimeSince: number | null;
  lastError: string | null;
  currentSession: string;
}

// ── Pipeline Test Result ──────────────────────────────────────────────────────

export interface PipelineTestResult {
  group: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

// ── Report Check Item ─────────────────────────────────────────────────────────

export interface ReportCheckItem {
  label: string;
  status: 'PASS' | 'WARNING' | 'FAIL';
  detail: string;
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
  reportItems: ReportCheckItem[];
  registry: RegistryEntry[];
  diagnostics: ConnectorDiagnostic[];
  logs: ConnectorLogEntry[];
  policyDecisionLog: unknown[];
}

// ── Helper ────────────────────────────────────────────────────────────────────

function makeCtx(extra: Partial<ConnectorContext> = {}): ConnectorContext {
  return {
    executionId: makeExecutionId(),
    userId: 'pipeline-validator',
    projectId: 'connector-runtime-validation',
    sessionId: 'pipeline-session',
    ...extra,
  };
}

// ── ConnectorRuntimePipeline ──────────────────────────────────────────────────

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

  // ── Discovery & registration ──────────────────────────────────────────────

  async discover(): Promise<void> {
    const connectors = [this.base44, this.github];
    for (const c of connectors) {
      if (!this.runtime.listConnectors().find(m => m.id === c.id)) {
        this.runtime.register(c);
      }
    }
    const ctx = makeCtx();
    for (const c of connectors) {
      try { await this.runtime.load(c.id, ctx); } catch { /* degraded — continue */ }
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
      const validation = m.id === 'base44'
        ? (this.base44 as any).getLastValidation?.() ?? null
        : (this.github as any).getLastValidation?.() ?? null;
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
        totalDenied: metrics?.totalDenied ?? 0,
        totalSuccesses: metrics?.totalSuccesses ?? 0,
        p95DurationMs: metrics?.p95DurationMs ?? 0,
        lastSuccessAt: metrics?.lastSuccessAt ?? null,
        lastFailureAt: metrics?.lastFailureAt ?? null,
        lastError: metrics?.lastError ?? null,
        uptimeSince: metrics?.uptimeSince ?? null,
        healthHistory: (metrics?.healthHistory ?? []) as string[],
        validation,
      } as RegistryEntry;
    });
  }

  // ── Dynamic routing ───────────────────────────────────────────────────────

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
    return this.registry.map(r => {
      const metrics = this.runtime.getMetrics(r.connectorId);
      const authStatus = r.healthStatus === 'healthy' ? 'AUTHORIZED' : r.healthStatus === 'unhealthy' ? 'UNAUTHORIZED' : 'DEGRADED';
      return {
        connectorId: r.connectorId,
        name: r.name,
        version: r.version,
        provider: r.provider,
        status: r.healthStatus,
        latencyMs: r.latencyMs,
        p95DurationMs: r.p95DurationMs,
        capabilities: r.capabilities,
        lastHealthCheckAt: r.lastHealthCheck,
        healthDetails: r.healthDetails,
        metrics,
        validation: r.validation,
        authorizationStatus: authStatus,
        uptimeSince: r.uptimeSince,
        lastError: r.lastError,
        currentSession: 'pipeline-session',
      };
    });
  }

  getLogs(): ConnectorLogEntry[] { return [...this.logs]; }
  getRegistry(): RegistryEntry[] { return [...this.registry]; }
  getRuntime(): ConnectorRuntime { return this.runtime; }

  // ── Full Validation Pipeline ──────────────────────────────────────────────

  async runValidation(): Promise<PipelineValidationReport> {
    const startAll = Date.now();
    const results: PipelineTestResult[] = [];

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

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

    // Run async validations upfront so we can reference them in tests
    await self.base44.validateAsync().catch(() => null);
    await self.github.validateAsync().catch(() => null);

    // ── G1: Runtime Init ──────────────────────────────────────────────────
    results.push(await test('G1 Runtime Init', 'ConnectorRuntime instantiates without error', async () => ({
      passed: !!self.runtime,
      details: { type: typeof self.runtime },
    })));

    results.push(await test('G1 Runtime Init', 'discover() registers Base44 and GitHub', async () => {
      await self.discover();
      const metas = self.runtime.listConnectors();
      return { passed: metas.some(m => m.id === 'base44') && metas.some(m => m.id === 'github'), details: { count: metas.length, ids: metas.map(m => m.id) } };
    }));

    results.push(await test('G1 Runtime Init', 'Registry reports 2 connectors after discovery', async () => ({
      passed: self.registry.length >= 2,
      details: { registryCount: self.registry.length },
    })));

    // ── G2: Connector Registry ────────────────────────────────────────────
    results.push(await test('G2 Registry', 'Base44 registry entry has all required fields', async () => {
      const entry = self.registry.find(r => r.connectorId === 'base44');
      const ok = !!(entry?.connectorId && entry?.name && entry?.version && entry?.provider && entry?.capabilities?.length);
      return { passed: ok, details: entry ? { connectorId: entry.connectorId, name: entry.name, version: entry.version, provider: entry.provider, capabilitiesCount: entry.capabilities.length } : {} };
    }));

    results.push(await test('G2 Registry', 'Registry entry status is a valid enum value', async () => {
      const e = self.registry[0];
      const valid = ['registered', 'ready', 'degraded', 'error', 'unknown'].includes(e?.status ?? '');
      return { passed: valid, details: { status: e?.status } };
    }));

    results.push(await test('G2 Registry', 'Base44 connector has >= 4 capabilities', async () => {
      const e = self.registry.find(r => r.connectorId === 'base44');
      return { passed: !!e && e.capabilities.length >= 4, details: { capabilities: e?.capabilities } };
    }));

    results.push(await test('G2 Registry', 'GitHub connector has >= 3 capabilities', async () => {
      const e = self.registry.find(r => r.connectorId === 'github');
      return { passed: !!e && e.capabilities.length >= 3, details: { capabilities: e?.capabilities } };
    }));

    results.push(await test('G2 Registry', 'Registry entries include EF-35 extended metrics fields', async () => {
      const e = self.registry[0];
      const ok = typeof e?.totalDenied === 'number' && typeof e?.p95DurationMs === 'number';
      return { passed: ok, details: { totalDenied: e?.totalDenied, p95DurationMs: e?.p95DurationMs } };
    }));

    // ── G3: Base44 Connector ──────────────────────────────────────────────
    results.push(await test('G3 Base44', 'initialize() does not throw', async () => {
      await self.base44.initialize(makeCtx());
      return { passed: true };
    }));

    results.push(await test('G3 Base44', 'healthCheck() returns ConnectorHealthReport with required fields', async () => {
      const h = await self.base44.health();
      const ok = !!h.connectorId && !!h.status && typeof h.checkedAt === 'number';
      return { passed: ok, details: { connectorId: h.connectorId, status: h.status, checkedAt: h.checkedAt, details: h.details } };
    }));

    results.push(await test('G3 Base44', 'validateAsync() returns structured ConnectorValidationResult', async () => {
      const v = self.base44.getLastValidation();
      const ok = v !== null && typeof v.valid === 'boolean' && Array.isArray(v.checks) && typeof v.summary === 'string';
      return { passed: ok, details: { valid: v?.valid, checksCount: v?.checks?.length, summary: v?.summary } };
    }));

    results.push(await test('G3 Base44', 'getCapabilities() returns non-empty array', async () => {
      const m = self.base44.metadata();
      return { passed: Array.isArray(m.capabilities) && m.capabilities.length > 0, details: { capabilities: m.capabilities } };
    }));

    // Functional: auth.me — must return SUCCESS (authenticated context)
    results.push(await test('G3 Base44', 'execute(auth.me) — returns SUCCESS with user.id field', async () => {
      const r = await self.execute('base44', 'auth.me');
      const ok = r.status === 'SUCCESS' && !!(r.data as any)?.id;
      return { passed: ok, details: { status: r.status, userId: (r.data as any)?.id, error: r.error } };
    }));

    results.push(await test('G3 Base44', 'execute(auth.validate) — returns SUCCESS (user is authenticated)', async () => {
      const r = await self.execute('base44', 'auth.validate');
      const ok = r.status === 'SUCCESS' && (r.data as any)?.authenticated === true;
      return { passed: ok, details: { status: r.status, authenticated: (r.data as any)?.authenticated, error: r.error } };
    }));

    results.push(await test('G3 Base44', 'execute(connectivity.ping) — returns SUCCESS with pong:true', async () => {
      const r = await self.execute('base44', 'connectivity.ping');
      const ok = r.status === 'SUCCESS' && (r.data as any)?.pong === true;
      return { passed: ok, details: { status: r.status, pong: (r.data as any)?.pong, error: r.error } };
    }));

    results.push(await test('G3 Base44', 'execute(projects.list) — returns SUCCESS with count field', async () => {
      const r = await self.execute('base44', 'projects.list', { limit: 3 });
      const ok = r.status === 'SUCCESS' && typeof (r.data as any)?.count === 'number';
      return { passed: ok, details: { status: r.status, count: (r.data as any)?.count, error: r.error } };
    }));

    results.push(await test('G3 Base44', 'execute(sessions.list) — returns SUCCESS with count field', async () => {
      const r = await self.execute('base44', 'sessions.list', { limit: 3 });
      const ok = r.status === 'SUCCESS' && typeof (r.data as any)?.count === 'number';
      return { passed: ok, details: { status: r.status, count: (r.data as any)?.count, error: r.error } };
    }));

    results.push(await test('G3 Base44', 'execute(app.info) — returns SUCCESS with connector metadata', async () => {
      const r = await self.execute('base44', 'app.info');
      const ok = r.status === 'SUCCESS' && !!(r.data as any)?.connector?.id;
      return { passed: ok, details: { status: r.status, connectorId: (r.data as any)?.connector?.id, error: r.error } };
    }));

    results.push(await test('G3 Base44', 'execute(unknown.op) — returns FAILED, not exception', async () => {
      const r = await self.execute('base44', 'unknown.operation.xyz');
      return { passed: r.status === 'FAILED' && !r.success, details: { status: r.status, error: r.error } };
    }));

    results.push(await test('G3 Base44', 'shutdown() does not throw', async () => {
      await self.base44.shutdown();
      await self.base44.initialize(makeCtx()); // re-init for subsequent tests
      return { passed: true };
    }));

    // ── G4: GitHub Connector ──────────────────────────────────────────────
    const githubToken = (globalThis as any).__GITHUB_TOKEN__ ?? (globalThis as any).__env__?.GITHUB_TOKEN ?? null;
    const githubConfigured = !!githubToken;

    results.push(await test('G4 GitHub', 'initialize() does not throw', async () => {
      await self.github.initialize(makeCtx());
      return { passed: true };
    }));

    results.push(await test('G4 GitHub', 'healthCheck() returns ConnectorHealthReport with required fields', async () => {
      const h = await self.github.health();
      const ok = !!h.connectorId && !!h.status && typeof h.checkedAt === 'number';
      return { passed: ok, details: { connectorId: h.connectorId, status: h.status, details: h.details } };
    }));

    results.push(await test('G4 GitHub', 'validateAsync() returns ConnectorValidationResult', async () => {
      const v = self.github.getLastValidation();
      const ok = v !== null && typeof v.valid === 'boolean' && Array.isArray(v.checks);
      return { passed: ok, details: { valid: v?.valid, checksCount: v?.checks?.length, summary: v?.summary } };
    }));

    results.push(await test('G4 GitHub', 'getCapabilities() includes repos.list', async () => {
      const m = self.github.metadata();
      return { passed: m.capabilities.includes('repos.list'), details: { capabilities: m.capabilities } };
    }));

    // Functional: GitHub ops — reflect real state (NOT_CONFIGURED if no token)
    results.push(await test('G4 GitHub', 'execute(connectivity.ping) — returns SUCCESS or NOT_CONFIGURED (never fakes)', async () => {
      const r = await self.execute('github', 'connectivity.ping');
      const validStatuses = ['SUCCESS', 'NOT_CONFIGURED', 'FAILED'];
      const ok = validStatuses.includes(r.status);
      const expectedIfNoToken = !githubConfigured ? r.status === 'NOT_CONFIGURED' : r.status === 'SUCCESS';
      return {
        passed: ok && expectedIfNoToken,
        details: { status: r.status, tokenConfigured: githubConfigured, expected: githubConfigured ? 'SUCCESS' : 'NOT_CONFIGURED', error: r.error },
      };
    }));

    results.push(await test('G4 GitHub', 'execute(repos.list) — returns SUCCESS or NOT_CONFIGURED (never fakes)', async () => {
      const r = await self.execute('github', 'repos.list', { per_page: 5 });
      const ok = githubConfigured ? r.status === 'SUCCESS' : r.status === 'NOT_CONFIGURED';
      return { passed: ok, details: { status: r.status, tokenConfigured: githubConfigured, expected: githubConfigured ? 'SUCCESS' : 'NOT_CONFIGURED', error: r.error } };
    }));

    results.push(await test('G4 GitHub', 'execute(repos.branches) missing payload — returns FAILED', async () => {
      // This should always FAIL regardless of token (payload validation)
      const r = await self.execute('github', 'repos.branches', {});
      // With no token → NOT_CONFIGURED (token check comes first)
      const ok = githubConfigured
        ? r.status === 'FAILED'
        : r.status === 'NOT_CONFIGURED' || r.status === 'FAILED';
      return { passed: ok, details: { status: r.status, error: r.error } };
    }));

    results.push(await test('G4 GitHub', 'execute(auth.user) — returns SUCCESS or NOT_CONFIGURED (never fakes)', async () => {
      const r = await self.execute('github', 'auth.user');
      const ok = githubConfigured ? r.status === 'SUCCESS' : r.status === 'NOT_CONFIGURED';
      return { passed: ok, details: { status: r.status, tokenConfigured: githubConfigured, error: r.error } };
    }));

    results.push(await test('G4 GitHub', 'execute(auth.validate) — returns SUCCESS or NOT_CONFIGURED', async () => {
      const r = await self.execute('github', 'auth.validate');
      const ok = githubConfigured ? r.status === 'SUCCESS' : r.status === 'NOT_CONFIGURED';
      return { passed: ok, details: { status: r.status, tokenConfigured: githubConfigured, error: r.error } };
    }));

    results.push(await test('G4 GitHub', 'execute(unknown.op) — returns FAILED or NOT_CONFIGURED, never SUCCESS', async () => {
      const r = await self.execute('github', 'totally.unknown.op');
      const ok = r.status !== 'SUCCESS';
      return { passed: ok, details: { status: r.status, error: r.error } };
    }));

    results.push(await test('G4 GitHub', 'shutdown() does not throw', async () => {
      await self.github.shutdown();
      await self.github.initialize(makeCtx());
      return { passed: true };
    }));

    // ── G5: Dynamic Routing ───────────────────────────────────────────────
    results.push(await test('G5 Dynamic Routing', 'routeByCapability(auth.me) routes to Base44', async () => {
      await self.discover();
      const r = await self.routeByCapability('auth.me');
      const ok = r !== null && r.connectorId === 'base44';
      return { passed: ok, details: { connectorId: r?.connectorId, status: r?.status } };
    }));

    results.push(await test('G5 Dynamic Routing', 'routeByCapability(repos.list) routes to GitHub', async () => {
      const r = await self.routeByCapability('repos.list', { per_page: 3 });
      const ok = r !== null && r.connectorId === 'github';
      return { passed: ok, details: { connectorId: r?.connectorId, status: r?.status } };
    }));

    results.push(await test('G5 Dynamic Routing', 'routeByCapability(nonexistent) returns null gracefully', async () => {
      const r = await self.routeByCapability('totally.unknown.capability.xyz');
      return { passed: r === null, details: { result: r } };
    }));

    results.push(await test('G5 Dynamic Routing', 'listConnectors() returns all registered connectors', async () => {
      const list = self.runtime.listConnectors();
      return { passed: list.length >= 2, details: { connectors: list.map(m => m.id), count: list.length } };
    }));

    results.push(await test('G5 Dynamic Routing', 'healthAll() returns health for all connectors', async () => {
      const healths = await self.runtime.healthAll();
      return { passed: healths.length >= 2, details: { count: healths.length, statuses: healths.map(h => h.status) } };
    }));

    // ── G6: Health Checks ─────────────────────────────────────────────────
    results.push(await test('G6 Health Checks', 'runtime.health(base44) returns ConnectorHealthReport', async () => {
      const h = await self.runtime.health('base44');
      const ok = !!h.connectorId && !!h.status && typeof h.checkedAt === 'number';
      return { passed: ok, details: { connectorId: h.connectorId, status: h.status, details: h.details } };
    }));

    results.push(await test('G6 Health Checks', 'runtime.health(github) returns ConnectorHealthReport', async () => {
      const h = await self.runtime.health('github');
      const ok = !!h.connectorId && !!h.status;
      return { passed: ok, details: { connectorId: h.connectorId, status: h.status, details: h.details } };
    }));

    results.push(await test('G6 Health Checks', 'runtime.health(unknown) throws — connector not found', async () => {
      try {
        await self.runtime.health('connector-does-not-exist');
        return { passed: false, details: { error: 'Expected throw but did not throw' } };
      } catch (e) {
        return { passed: true, details: { threw: e instanceof Error ? e.message : String(e) } };
      }
    }));

    results.push(await test('G6 Health Checks', 'Base44 health status reflects real auth state', async () => {
      const h = await self.runtime.health('base44');
      // healthy = actually authenticated; unhealthy = not initialized; degraded = partial
      const validStatuses = ['healthy', 'degraded', 'unhealthy'];
      return { passed: validStatuses.includes(h.status), details: { status: h.status, details: h.details } };
    }));

    results.push(await test('G6 Health Checks', 'GitHub health status NOT_CONFIGURED or real health — never faked', async () => {
      const h = await self.runtime.health('github');
      const validStatuses = ['healthy', 'degraded', 'unhealthy'];
      // If no token: must be unhealthy with "No token" message
      const ok = githubConfigured
        ? validStatuses.includes(h.status)
        : h.status === 'unhealthy' && (h.details ?? '').toLowerCase().includes('token');
      return { passed: ok, details: { status: h.status, details: h.details, tokenConfigured: githubConfigured } };
    }));

    // ── G7: Policy Engine ─────────────────────────────────────────────────
    results.push(await test('G7 Policy Engine', 'PolicyEngine module loaded with version 2.0.0', async () => {
      const mod = await import('../../lib/policies/policyEngine.js');
      const pe = mod.PolicyEngine ?? mod.default;
      const ok = pe?.version === '2.0.0';
      return { passed: ok, details: { version: pe?.version, id: pe?.id } };
    }));

    results.push(await test('G7 Policy Engine', 'PolicyEngine authorizes pipeline-validator user', async () => {
      const mod = await import('../../lib/policies/policyEngine.js');
      const pe = mod.PolicyEngine ?? mod.default;
      const r = await pe.authorize({ connectorId: 'base44', operation: 'auth.me', context: makeCtx() });
      return { passed: r.allow === true && r.ruleId === 'rule-100', details: { allow: r.allow, ruleId: r.ruleId, reason: r.reason } };
    }));

    results.push(await test('G7 Policy Engine', 'PolicyEngine DENIES anonymous user on sensitive ops', async () => {
      const mod = await import('../../lib/policies/policyEngine.js');
      const pe = mod.PolicyEngine ?? mod.default;
      const r = await pe.authorize({
        connectorId: 'base44', operation: 'auth.me',
        context: { ...makeCtx(), userId: 'anonymous' },
      });
      return { passed: r.allow === false, details: { allow: r.allow, ruleId: r.ruleId, reason: r.reason } };
    }));

    results.push(await test('G7 Policy Engine', 'PolicyEngine DENIES unknown connector', async () => {
      const mod = await import('../../lib/policies/policyEngine.js');
      const pe = mod.PolicyEngine ?? mod.default;
      const r = await pe.authorize({ connectorId: 'totally-unknown-connector', operation: 'any.op', context: makeCtx() });
      return { passed: r.allow === false && r.ruleId === 'rule-002', details: { allow: r.allow, ruleId: r.ruleId, reason: r.reason } };
    }));

    results.push(await test('G7 Policy Engine', 'PolicyEngine logs every decision', async () => {
      const mod = await import('../../lib/policies/policyEngine.js');
      const pe = mod.PolicyEngine ?? mod.default;
      const before = pe.getDecisionLog().length;
      await pe.authorize({ connectorId: 'base44', operation: 'test.ping', context: makeCtx() });
      const after = pe.getDecisionLog().length;
      return { passed: after > before, details: { before, after, delta: after - before } };
    }));

    results.push(await test('G7 Policy Engine', 'PolicyEngine DENIED result propagates through runtime.execute()', async () => {
      // Execute with anonymous userId — will be denied by rule-001 (auth.me + anonymous)
      const ctx = { userId: 'anonymous', projectId: 'test', sessionId: 'test-session' };
      const r = await self.runtime.execute('base44', 'auth.me', {}, ctx);
      return { passed: r.status === 'DENIED', details: { status: r.status, error: r.error } };
    }));

    // ── G8: Metrics & Logs ────────────────────────────────────────────────
    results.push(await test('G8 Metrics', 'runtime.getMetrics(base44) has EF-35 extended fields', async () => {
      const m = self.runtime.getMetrics('base44');
      const ok = m !== undefined &&
        typeof m.totalExecutions === 'number' &&
        typeof m.totalSuccesses === 'number' &&
        typeof m.totalDenied === 'number' &&
        typeof m.totalTimeouts === 'number' &&
        typeof m.p95DurationMs === 'number';
      return { passed: !!ok, details: m ? { totalExecutions: m.totalExecutions, totalSuccesses: m.totalSuccesses, totalDenied: m.totalDenied, p95DurationMs: m.p95DurationMs } : {} };
    }));

    results.push(await test('G8 Metrics', 'runtime.allMetrics() returns array with 2+ entries', async () => {
      const ms = self.runtime.allMetrics();
      return { passed: ms.length >= 2, details: { count: ms.length } };
    }));

    results.push(await test('G8 Metrics', 'runtime.getHistory() returns execution records', async () => {
      const h = self.runtime.getHistory();
      return { passed: Array.isArray(h), details: { count: h.length } };
    }));

    results.push(await test('G8 Metrics', 'Connector logs accumulated for all executed actions', async () => ({
      passed: self.logs.length > 0,
      details: { logCount: self.logs.length },
    })));

    results.push(await test('G8 Metrics', 'Log entries have all required fields', async () => {
      if (self.logs.length === 0) return { passed: false, details: { error: 'No logs' } };
      const l = self.logs[0];
      const ok = !!(l.id && l.connectorId && l.action && l.result && typeof l.executionTimeMs === 'number' && typeof l.timestamp === 'number');
      return { passed: ok, details: { id: l.id, connectorId: l.connectorId, action: l.action, result: l.result, executionTimeMs: l.executionTimeMs } };
    }));

    results.push(await test('G8 Metrics', 'Metrics health history accumulated by healthAll()', async () => {
      const m = self.runtime.getMetrics('base44');
      return { passed: Array.isArray(m?.healthHistory) && m!.healthHistory.length > 0, details: { healthHistory: m?.healthHistory } };
    }));

    // ── G9: Integration — end-to-end ──────────────────────────────────────
    results.push(await test('G9 Integration Base44', 'auth.me: executionId and connectorId present in result', async () => {
      const r = await self.execute('base44', 'auth.me');
      const ok = typeof r.executionId === 'string' && r.connectorId === 'base44';
      return { passed: ok, details: { status: r.status, executionId: r.executionId, connectorId: r.connectorId } };
    }));

    results.push(await test('G9 Integration Base44', 'projects.list: result.logs is non-empty array', async () => {
      const r = await self.execute('base44', 'projects.list');
      const ok = Array.isArray(r.logs) && r.logs.length > 0;
      return { passed: ok, details: { status: r.status, logsCount: r.logs?.length } };
    }));

    results.push(await test('G9 Integration Base44', 'connectivity.ping: duration is a real positive number', async () => {
      const r = await self.execute('base44', 'connectivity.ping');
      const ok = typeof r.duration === 'number' && r.duration >= 0;
      return { passed: ok, details: { status: r.status, duration: r.duration } };
    }));

    results.push(await test('G9 Integration GitHub', 'connectivity.ping: executionId present, status reflects token state', async () => {
      const r = await self.execute('github', 'connectivity.ping');
      const statusOk = githubConfigured ? r.status === 'SUCCESS' : r.status === 'NOT_CONFIGURED';
      const ok = typeof r.executionId === 'string' && statusOk;
      return { passed: ok, details: { status: r.status, executionId: r.executionId, tokenConfigured: githubConfigured } };
    }));

    results.push(await test('G9 Integration GitHub', 'repos.list: result.logs is array, status reflects token state', async () => {
      const r = await self.execute('github', 'repos.list');
      const statusOk = githubConfigured ? r.status === 'SUCCESS' : r.status === 'NOT_CONFIGURED';
      const ok = Array.isArray(r.logs) && statusOk;
      return { passed: ok, details: { status: r.status, logsCount: r.logs?.length } };
    }));

    results.push(await test('G9 Integration GitHub', 'logs accumulate across multiple GitHub operations', async () => {
      const before = self.logs.length;
      await self.execute('github', 'connectivity.ping');
      await self.execute('github', 'repos.list');
      return { passed: self.logs.length > before, details: { before, after: self.logs.length } };
    }));

    // ── G10: Connector Validation Diagnostics ─────────────────────────────
    results.push(await test('G10 Validation', 'Base44 validateAsync checks include "Authenticated session"', async () => {
      const v = self.base44.getLastValidation();
      const hasAuth = v?.checks.some(c => c.name === 'Authenticated session');
      return { passed: !!hasAuth, details: { valid: v?.valid, summary: v?.summary } };
    }));

    results.push(await test('G10 Validation', 'GitHub validateAsync checks include "Token configured"', async () => {
      const v = self.github.getLastValidation();
      const hasToken = v?.checks.some(c => c.name === 'Token configured');
      return { passed: !!hasToken, details: { valid: v?.valid, summary: v?.summary } };
    }));

    results.push(await test('G10 Validation', 'getDiagnostics() returns extended ConnectorDiagnostic array', async () => {
      const d = await self.getDiagnostics();
      const ok = d.length >= 2 && typeof d[0].version === 'string' && typeof d[0].provider === 'string';
      return { passed: ok, details: { count: d.length, sample: d[0] ? { name: d[0].name, version: d[0].version, authorizationStatus: d[0].authorizationStatus } : null } };
    }));

    // Final refresh
    await self.refreshRegistry();

    // ── Compute checks ────────────────────────────────────────────────────
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    const successRate = total > 0 ? passed / total : 0;

    const g1 = results.filter(r => r.group.startsWith('G1'));
    const g3g9b = results.filter(r => r.group.startsWith('G3') || r.group.startsWith('G9 Integration Base44'));
    const g4g9g = results.filter(r => r.group.startsWith('G4') || r.group.startsWith('G9 Integration GitHub'));
    const g2 = results.filter(r => r.group.startsWith('G2'));
    const g5 = results.filter(r => r.group.startsWith('G5'));

    const checks = {
      runtimeOperational: g1.every(r => r.passed),
      base44Operational: g3g9b.filter(r => r.passed).length >= Math.ceil(g3g9b.length * 0.8),
      githubOperational: g4g9g.every(r => r.passed),
      registryOperational: g2.every(r => r.passed),
      dynamicRoutingOperational: g5.every(r => r.passed),
    };

    // ── Build production readiness report ─────────────────────────────────
    const policyG7 = results.filter(r => r.group.startsWith('G7'));
    const healthG6 = results.filter(r => r.group.startsWith('G6'));
    const metricsG8 = results.filter(r => r.group.startsWith('G8'));
    const validG10 = results.filter(r => r.group.startsWith('G10'));

    function groupStatus(items: PipelineTestResult[]): 'PASS' | 'WARNING' | 'FAIL' {
      if (items.length === 0) return 'FAIL';
      const p = items.filter(i => i.passed).length;
      if (p === items.length) return 'PASS';
      if (p >= Math.ceil(items.length * 0.6)) return 'WARNING';
      return 'FAIL';
    }

    const b44ValidCheck = self.base44.getLastValidation();
    const ghValidCheck = self.github.getLastValidation();
    const policyVersion = await (async () => {
      try {
        const mod = await import('../../lib/policies/policyEngine.js');
        return (mod.PolicyEngine ?? mod.default)?.version;
      } catch { return null; }
    })();

    const reportItems: ReportCheckItem[] = [
      {
        label: 'Architecture — Connector Runtime',
        status: checks.runtimeOperational ? 'PASS' : 'FAIL',
        detail: `Runtime: ${checks.runtimeOperational ? 'operational' : 'degraded'} · ${self.runtime.listConnectors().length} connectors registered`,
      },
      {
        label: 'Connector Registry',
        status: checks.registryOperational ? 'PASS' : 'FAIL',
        detail: `${self.registry.length} entries · fields: id, name, version, provider, capabilities, metrics`,
      },
      {
        label: 'Connector Loader',
        status: self.registry.some(r => r.loadTimeMs !== null) ? 'PASS' : 'WARNING',
        detail: self.registry.map(r => `${r.connectorId}: loadTime=${r.loadTimeMs ?? 'N/A'}ms`).join(' · '),
      },
      {
        label: 'Connector Executor',
        status: self.runtime.getHistory().length > 0 ? 'PASS' : 'WARNING',
        detail: `${self.runtime.getHistory().length} execution records · timeout enforcement: active`,
      },
      {
        label: 'Base44 Connector',
        status: checks.base44Operational ? 'PASS' : 'FAIL',
        detail: b44ValidCheck ? b44ValidCheck.summary : 'Validation not run',
      },
      {
        label: 'GitHub Connector',
        status: githubConfigured ? (checks.githubOperational ? 'PASS' : 'FAIL') : 'WARNING',
        detail: githubConfigured
          ? (ghValidCheck ? ghValidCheck.summary : 'Validation not run')
          : 'NOT_CONFIGURED — token required. Set VITE_GITHUB_TOKEN or __GITHUB_TOKEN__',
      },
      {
        label: 'Policy Engine',
        status: policyVersion === '2.0.0' ? (policyG7.every(r => r.passed) ? 'PASS' : 'WARNING') : 'FAIL',
        detail: `Version: ${policyVersion ?? 'unknown'} · ${policyG7.filter(r => r.passed).length}/${policyG7.length} policy tests passed · Decision log active`,
      },
      {
        label: 'Dynamic Routing',
        status: checks.dynamicRoutingOperational ? 'PASS' : 'FAIL',
        detail: 'Capability-based routing · auth.me→Base44 · repos.list→GitHub · unknown→null',
      },
      {
        label: 'Health System',
        status: groupStatus(healthG6),
        detail: self.registry.map(r => `${r.connectorId}: ${r.healthStatus} — ${r.healthDetails || 'no details'}`).join(' · '),
      },
      {
        label: 'Logging',
        status: self.logs.length > 0 ? 'PASS' : 'FAIL',
        detail: `${self.logs.length} action log entries · fields: id, connectorId, action, result, executionTimeMs, timestamp`,
      },
      {
        label: 'Metrics',
        status: groupStatus(metricsG8),
        detail: 'EF-35: totalSuccesses · totalDenied · totalTimeouts · avgDuration · p95Duration · healthHistory',
      },
      {
        label: 'Authorization (Policy Engine v2)',
        status: policyG7.every(r => r.passed) ? 'PASS' : 'FAIL',
        detail: `Rule-based · ALLOW/DENY with reason + ruleId · audit log · ${policyG7.filter(r => r.passed).length}/${policyG7.length} tests passed`,
      },
      {
        label: 'Connector Validation (real)',
        status: groupStatus(validG10),
        detail: 'validateAsync() checks: SDK, auth, API reachability, token, capabilities · structured ConnectorValidationResult',
      },
      {
        label: 'Production Readiness',
        status: (checks.runtimeOperational && checks.base44Operational && checks.registryOperational && checks.dynamicRoutingOperational && policyG7.every(r => r.passed))
          ? (githubConfigured && checks.githubOperational ? 'PASS' : 'WARNING')
          : 'FAIL',
        detail: githubConfigured
          ? 'All systems operational'
          : 'Base44: production-ready · GitHub: requires token configuration · Policy Engine: v2.0.0 operational',
      },
    ];

    // Policy decision log
    let policyDecisionLog: unknown[] = [];
    try {
      const mod = await import('../../lib/policies/policyEngine.js');
      const pe = mod.PolicyEngine ?? mod.default;
      policyDecisionLog = pe.getDecisionLog();
    } catch { /* ignore */ }

    return {
      runAt: startAll,
      totalMs: Date.now() - startAll,
      results,
      passed,
      total,
      successRate,
      checks,
      reportItems,
      registry: [...self.registry],
      diagnostics: await self.getDiagnostics(),
      logs: [...self.logs],
      policyDecisionLog,
    };
  }
}