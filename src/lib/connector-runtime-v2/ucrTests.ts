/**
 * ucrTests.ts
 * Sprint 6.4.1 — Universal Connector Runtime
 *
 * Comprehensive test suite covering all UCR motors.
 * Tests: Registry · SDK · Runtime · Session Manager · Connection Registry ·
 * Router · Capability Engine · Lifecycle · Event Bus · Health · Metrics ·
 * Audit · Multi-connection · Connection Routing · Concurrency · Idempotence
 */

import { ConnectorRegistry } from './ConnectorRegistry';
import { ConnectionRegistry } from './ConnectionRegistry';
import { ConnectorEventBus } from './ConnectorEventBus';
import { ConnectorLifecycle } from './ConnectorLifecycle';
import { ConnectorSessionManager } from './ConnectorSessionManager';
import { ConnectorRouter } from './ConnectorRouter';
import { CapabilityEngine } from './CapabilityEngine';
import { ConnectorAudit } from './ConnectorAudit';
import { ConnectorMetrics } from './ConnectorMetrics';
import { ConnectorHealth } from './ConnectorHealth';
import { ConnectorRuntime } from './ConnectorRuntime';
import type { IConnectorSDK, AuthenticateRequest, AuthenticateResult, DisconnectResult } from './IConnectorSDK';
import type {
  ConnectorManifest, ConnectorCapability, ConnectorOperation,
  ConnectorContext, ExecuteRequest, ExecuteResult, ConnectorHealthReport,
  ConnectorLifecycleState,
} from './UCRTypes';

// ─── Test Harness ─────────────────────────────────────────────────────────────

interface TestResult { name: string; passed: boolean; error?: string; duration: number; }

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function run(name: string, fn: () => Promise<void> | void): Promise<TestResult> {
  const t0 = Date.now();
  try { await fn(); return { name, passed: true, duration: Date.now() - t0 }; }
  catch (e: unknown) { return { name, passed: false, error: String(e), duration: Date.now() - t0 }; }
}

// ─── Mock SDK ─────────────────────────────────────────────────────────────────

let _connSeq = 0;
function makeConnectorId(): string { return `mock-connector-${++_connSeq}`; }

function makeMockSDK(id?: string, caps: ConnectorCapability[] = ['READ_EMAIL', 'SEND_EMAIL']): IConnectorSDK {
  const connectorId = id ?? makeConnectorId();
  const mf: ConnectorManifest = {
    id: connectorId, name: `Mock ${connectorId}`, version: '1.0.0',
    vendor: 'Test Vendor', category: 'email', description: 'Test connector',
    icon: '', tags: ['test'], documentation: '',
    authentication: { type: 'oauth2', required: true, flows: ['authorization_code_pkce'] },
    capabilities: caps,
    operations: caps.map((c) => ({
      id: `op-${c.toLowerCase()}`, name: c, description: c, capability: c,
      inputSchema: {}, outputSchema: {}, requiresAuth: true,
    })),
    permissions: ['read', 'write'],
    healthChecks: [{ id: 'ping', name: 'Ping', intervalMs: 30_000, timeoutMs: 5_000, critical: true }],
    federation: { type: 'workspace', supported: true },
  };

  return {
    connectorId,
    manifest:    () => mf,
    initialize:  async () => {},
    shutdown:    async () => {},
    health:      async (): Promise<ConnectorHealthReport> => ({
      connectorId, status: 'healthy', latencyMs: 5, availability: 1,
      lastSuccess: new Date().toISOString(), lastFailure: null,
      uptimeMs: 1_000, checkedAt: new Date().toISOString(), details: {},
    }),
    capabilities: () => caps,
    operations:   () => mf.operations,
    execute:      async (req: ExecuteRequest): Promise<ExecuteResult> => ({
      success: true, operationId: req.operationId, connectionId: req.context.connectionId,
      output: { mock: true }, durationMs: 1,
    }),
    authenticate: async (req: AuthenticateRequest): Promise<AuthenticateResult> => ({
      success: true, connectionId: `auth-conn-${Date.now()}`,
    }),
    disconnect: async (connectionId: string): Promise<DisconnectResult> => ({
      success: true, connectionId, disconnectedAt: new Date().toISOString(),
    }),
    metadata: () => ({ version: '1.0.0', startedAt: new Date().toISOString() }),
  };
}

function makeContext(connectorId: string, connectionId = 'conn-1', orgId = 'org-1'): ConnectorContext {
  return {
    organizationId: orgId, workspaceId: 'ws-1', userId: 'user-1',
    connectionId, connectorId, providerId: 'mock-provider',
    requestId: `req-${Date.now()}`, correlationId: `corr-${Date.now()}`,
    permissions: ['read', 'write'], metadata: {},
  };
}

function addActiveConnection(connectorId: string, opts?: Partial<{ orgId: string; wsId: string; email: string }>): string {
  const rec = ConnectionRegistry.add({
    providerId:     'mock-provider',
    connectorId,
    organizationId: opts?.orgId ?? 'org-1',
    workspaceId:    opts?.wsId ?? 'ws-1',
    accountId:      'acc-1',
    displayName:    'Test User',
    email:          opts?.email ?? 'test@example.com',
    state:          'ACTIVE',
    scopes:         ['read'],
    expiresAt:      new Date(Date.now() + 3_600_000).toISOString(),
    metadata:       {},
  });
  return rec.connectionId;
}

// ─── Connector Registry Tests ─────────────────────────────────────────────────

const registryTests = [
  run('REG-01: register and lookup connector', () => {
    const sdk = makeMockSDK();
    ConnectorRegistry.register(sdk);
    assert(ConnectorRegistry.has(sdk.connectorId), 'Expected connector to be registered');
    const found = ConnectorRegistry.lookup(sdk.connectorId);
    assert(found.connectorId === sdk.connectorId, 'Expected correct connectorId');
  }),
  run('REG-02: mismatched id throws', () => {
    const sdk = makeMockSDK('mismatch-def');
    const fake = { ...sdk, connectorId: 'different-id' };
    let threw = false;
    try { ConnectorRegistry.register(fake as IConnectorSDK); } catch { threw = true; }
    assert(threw, 'Expected mismatch to throw');
  }),
  run('REG-03: unregister removes connector', () => {
    const sdk = makeMockSDK();
    ConnectorRegistry.register(sdk);
    ConnectorRegistry.unregister(sdk.connectorId);
    assert(!ConnectorRegistry.has(sdk.connectorId), 'Expected connector removed');
  }),
  run('REG-04: search returns matching connectors', () => {
    const sdk = makeMockSDK();
    ConnectorRegistry.register(sdk);
    const results = ConnectorRegistry.search('Mock');
    assert(results.length > 0, 'Expected search to return results');
  }),
  run('REG-05: listByCapability filters correctly', () => {
    const sdk = makeMockSDK(undefined, ['READ_CALENDAR']);
    ConnectorRegistry.register(sdk);
    const results = ConnectorRegistry.listByCapability('READ_CALENDAR');
    assert(results.some((m) => m.id === sdk.connectorId), 'Expected connector with READ_CALENDAR');
  }),
  run('REG-06: lookup unregistered throws', () => {
    let threw = false;
    try { ConnectorRegistry.lookup('does-not-exist'); } catch { threw = true; }
    assert(threw, 'Expected unregistered lookup to throw');
  }),
  run('REG-07: CONNECTOR_REGISTERED event emitted', () => {
    const sdk = makeMockSDK();
    ConnectorRegistry.register(sdk);
    const evts = ConnectorEventBus.query({ eventType: 'CONNECTOR_REGISTERED', connectorId: sdk.connectorId });
    assert(evts.length > 0, 'Expected CONNECTOR_REGISTERED event');
  }),
  run('REG-08: health returns connector list', () => {
    const h = ConnectorRegistry.health();
    assert(h.status === 'ok', 'Expected ok');
    assert(Array.isArray(h.connectors), 'Expected connectors array');
  }),
];

// ─── Connection Registry Tests ─────────────────────────────────────────────────

const connectionTests = [
  run('CR-01: add and get connection', () => {
    const connId = addActiveConnection('mock-c');
    const rec = ConnectionRegistry.get(connId);
    assert(rec !== null, 'Expected connection');
    assert(rec!.state === 'ACTIVE', 'Expected ACTIVE state');
  }),
  run('CR-02: multi-connection per connector', () => {
    const id = `cr-multi-${Date.now()}`;
    const sdk = makeMockSDK(id);
    ConnectorRegistry.register(sdk);
    addActiveConnection(id, { email: 'a@test.com' });
    addActiveConnection(id, { email: 'b@test.com' });
    addActiveConnection(id, { email: 'c@test.com' });
    const conns = ConnectionRegistry.listByConnector(id);
    assert(conns.length === 3, `Expected 3 connections, got ${conns.length}`);
  }),
  run('CR-03: remove connection', () => {
    const connId = addActiveConnection('mock-rm');
    assert(ConnectionRegistry.has(connId), 'Expected connection exists');
    ConnectionRegistry.remove(connId);
    assert(!ConnectionRegistry.has(connId), 'Expected connection removed');
  }),
  run('CR-04: listByOrg isolates correctly', () => {
    const connId = addActiveConnection('mock-org', { orgId: 'org-isolated' });
    const results = ConnectionRegistry.listByOrg('org-isolated');
    assert(results.every((c) => c.organizationId === 'org-isolated'), 'Expected org isolation');
  }),
  run('CR-05: CONNECTION_ADDED event emitted', () => {
    const connId = addActiveConnection('mock-evt-conn');
    const evts = ConnectorEventBus.query({ eventType: 'CONNECTION_ADDED', connectionId: connId });
    assert(evts.length > 0, 'Expected CONNECTION_ADDED event');
  }),
  run('CR-06: setState updates connection state', () => {
    const connId = addActiveConnection('mock-state');
    ConnectionRegistry.setState(connId, 'EXPIRED');
    assert(ConnectionRegistry.get(connId)?.state === 'EXPIRED', 'Expected EXPIRED state');
  }),
];

// ─── Lifecycle Tests ──────────────────────────────────────────────────────────

const lifecycleTests = [
  run('LC-01: valid lifecycle transitions', async () => {
    const sdk = makeMockSDK();
    ConnectorRegistry.register(sdk);
    assert(ConnectorRegistry.getLifecycleState(sdk.connectorId) === 'REGISTERED', 'Expected REGISTERED');
    await ConnectorLifecycle.initialize(sdk.connectorId, makeContext(sdk.connectorId));
    assert(ConnectorRegistry.getLifecycleState(sdk.connectorId) === 'READY', 'Expected READY after init');
  }),
  run('LC-02: invalid transition throws', async () => {
    const sdk = makeMockSDK();
    ConnectorRegistry.register(sdk);
    let threw = false;
    try { ConnectorLifecycle.transition(sdk.connectorId, 'READY'); } catch { threw = true; }
    assert(threw, 'Expected invalid transition to throw');
  }),
  run('LC-03: markBusy/restore cycle', async () => {
    const sdk = makeMockSDK();
    ConnectorRegistry.register(sdk);
    await ConnectorLifecycle.initialize(sdk.connectorId, makeContext(sdk.connectorId));
    const restore = ConnectorLifecycle.markBusy(sdk.connectorId);
    assert(ConnectorRegistry.getLifecycleState(sdk.connectorId) === 'BUSY', 'Expected BUSY');
    restore();
    assert(ConnectorRegistry.getLifecycleState(sdk.connectorId) === 'READY', 'Expected READY after restore');
  }),
  run('LC-04: isReady returns false for REGISTERED state', () => {
    const sdk = makeMockSDK();
    ConnectorRegistry.register(sdk);
    assert(!ConnectorLifecycle.isReady(sdk.connectorId), 'Expected isReady=false');
  }),
  run('LC-05: canTransition returns correct boolean', async () => {
    const sdk = makeMockSDK();
    ConnectorRegistry.register(sdk);
    assert(ConnectorLifecycle.canTransition(sdk.connectorId, 'INITIALIZED'), 'Expected INITIALIZED valid');
    assert(!ConnectorLifecycle.canTransition(sdk.connectorId, 'READY'), 'Expected READY invalid from REGISTERED');
  }),
];

// ─── Session Manager Tests ────────────────────────────────────────────────────

const sessionTests = [
  run('SM-01: start creates active session', () => {
    const ctx = makeContext('sm-conn', 'sm-connection-1');
    const session = ConnectorSessionManager.start(ctx);
    assert(session.state === 'active', 'Expected active session');
    assert(session.connectionId === 'sm-connection-1', 'Expected correct connectionId');
  }),
  run('SM-02: same connectionId returns same session', () => {
    const ctx = makeContext('sm-idem', 'sm-idem-conn');
    const s1 = ConnectorSessionManager.start(ctx);
    const s2 = ConnectorSessionManager.start(ctx);
    assert(s1.id === s2.id, 'Expected idempotent session');
  }),
  run('SM-03: end marks session expired', () => {
    const ctx = makeContext('sm-end', 'sm-end-conn');
    const session = ConnectorSessionManager.start(ctx);
    ConnectorSessionManager.end(session.id);
    assert(ConnectorSessionManager.get(session.id)?.state === 'expired', 'Expected expired');
  }),
  run('SM-04: cache set and get', () => {
    const ctx = makeContext('sm-cache', 'sm-cache-conn');
    const session = ConnectorSessionManager.start(ctx);
    ConnectorSessionManager.cacheSet(session.id, 'key', 'value');
    assert(ConnectorSessionManager.cacheGet(session.id, 'key') === 'value', 'Expected cached value');
  }),
  run('SM-05: SESSION_STARTED event emitted', () => {
    const ctx = makeContext('sm-evt', `sm-evt-conn-${Date.now()}`);
    ConnectorSessionManager.start(ctx);
    const evts = ConnectorEventBus.query({ eventType: 'SESSION_STARTED', connectionId: ctx.connectionId });
    assert(evts.length > 0, 'Expected SESSION_STARTED event');
  }),
];

// ─── Router Tests ─────────────────────────────────────────────────────────────

const routerTests = [
  run('RT-01: direct connectionId routing', () => {
    const connId = addActiveConnection('rt-direct');
    const result = ConnectorRouter.route({ connectionId: connId });
    assert(result.connections.length === 1, 'Expected 1 connection');
    assert(result.strategy === 'single', 'Expected single strategy');
  }),
  run('RT-02: fan-out returns all matching connections', () => {
    const id = `rt-fanout-${Date.now()}`;
    const sdk = makeMockSDK(id);
    ConnectorRegistry.register(sdk);
    addActiveConnection(id, { email: 'a@test.com' });
    addActiveConnection(id, { email: 'b@test.com' });
    addActiveConnection(id, { email: 'c@test.com' });
    const result = ConnectorRouter.route({ connectorId: id, all: true });
    assert(result.connections.length === 3, `Expected 3, got ${result.connections.length}`);
    assert(result.strategy === 'fan_out', 'Expected fan_out strategy');
  }),
  run('RT-03: unknown connectionId returns empty', () => {
    const result = ConnectorRouter.route({ connectionId: 'non-existent' });
    assert(result.connections.length === 0, 'Expected empty connections');
  }),
  run('RT-04: fanOut executes callback for all connections', async () => {
    const id = `rt-fanout2-${Date.now()}`;
    const sdk = makeMockSDK(id);
    ConnectorRegistry.register(sdk);
    addActiveConnection(id, { email: 'x@test.com' });
    addActiveConnection(id, { email: 'y@test.com' });
    const results = await ConnectorRouter.fanOut({ connectorId: id }, async (connId) => connId);
    assert(results.length === 2, `Expected 2 results, got ${results.length}`);
  }),
  run('RT-05: orgId isolation in routing', () => {
    const connId = addActiveConnection('rt-org-iso', { orgId: 'org-isolated-rt' });
    const result = ConnectorRouter.route({ organizationId: 'org-isolated-rt' });
    assert(result.connections.every((c) => c.organizationId === 'org-isolated-rt'), 'Expected org isolation');
  }),
];

// ─── Capability Engine Tests ──────────────────────────────────────────────────

const capabilityTests = [
  run('CAP-01: resolve returns connectors with capability', () => {
    const id = `cap-${Date.now()}`;
    const sdk = makeMockSDK(id, ['UPLOAD_FILE']);
    ConnectorRegistry.register(sdk);
    const resolution = CapabilityEngine.resolve('UPLOAD_FILE');
    assert(resolution.connectorIds.includes(id), 'Expected connector in resolution');
  }),
  run('CAP-02: resolve available=true with active connection', () => {
    const id = `cap-avail-${Date.now()}`;
    const sdk = makeMockSDK(id, ['DOWNLOAD_FILE']);
    ConnectorRegistry.register(sdk);
    addActiveConnection(id);
    const res = CapabilityEngine.resolve('DOWNLOAD_FILE');
    assert(res.available, 'Expected available=true');
    assert(res.connectionCount > 0, 'Expected connectionCount > 0');
  }),
  run('CAP-03: supportsOperation returns correct boolean', () => {
    const id = `cap-op-${Date.now()}`;
    const sdk = makeMockSDK(id, ['SEARCH']);
    ConnectorRegistry.register(sdk);
    assert(CapabilityEngine.supportsOperation(id, 'op-search'), 'Expected SEARCH supported');
    assert(!CapabilityEngine.supportsOperation(id, 'op-nonexistent'), 'Expected nonexistent not supported');
  }),
  run('CAP-04: resolveAll covers all registered capabilities', () => {
    const all = CapabilityEngine.resolveAll();
    assert(all.length > 0, 'Expected capabilities to be resolved');
  }),
];

// ─── Event Bus Tests ──────────────────────────────────────────────────────────

const eventTests = [
  run('EVT-01: emitted events have required fields', () => {
    const evt = ConnectorEventBus.emit({
      eventType: 'REQUEST_STARTED', connectorId: 'mock', connectionId: 'c',
      organizationId: 'o', actor: 'u', payload: {}, status: 'PENDING',
    });
    assert(typeof evt.id === 'string', 'Expected id');
    assert(typeof evt.timestamp === 'string', 'Expected timestamp');
    assert(typeof evt.requestId === 'string', 'Expected requestId');
  }),
  run('EVT-02: subscribe receives event', () => {
    let received = false;
    const unsub = ConnectorEventBus.subscribe('REQUEST_COMPLETED', () => { received = true; });
    ConnectorEventBus.emit({ eventType: 'REQUEST_COMPLETED', connectorId: 'c', connectionId: 'x', organizationId: 'o', actor: 'a', payload: {}, status: 'SUCCESS' });
    unsub();
    assert(received, 'Expected subscriber called');
  }),
  run('EVT-03: unsubscribe stops receiving', () => {
    let count = 0;
    const unsub = ConnectorEventBus.subscribe('REQUEST_FAILED', () => { count++; });
    ConnectorEventBus.emit({ eventType: 'REQUEST_FAILED', connectorId: 'c', connectionId: 'x', organizationId: 'o', actor: 'a', payload: {}, status: 'FAILURE' });
    unsub();
    ConnectorEventBus.emit({ eventType: 'REQUEST_FAILED', connectorId: 'c', connectionId: 'x', organizationId: 'o', actor: 'a', payload: {}, status: 'FAILURE' });
    assert(count === 1, `Expected count=1, got ${count}`);
  }),
  run('EVT-04: query filters by connectorId', () => {
    const id = `evt-filter-${Date.now()}`;
    ConnectorEventBus.emit({ eventType: 'CONNECTOR_REGISTERED', connectorId: id, connectionId: '', organizationId: '', actor: 'a', payload: {}, status: 'SUCCESS' });
    const evts = ConnectorEventBus.query({ connectorId: id });
    assert(evts.length > 0, 'Expected filtered events');
    assert(evts.every((e) => e.connectorId === id), 'Expected correct filter');
  }),
];

// ─── Health Tests ─────────────────────────────────────────────────────────────

const healthTests = [
  run('HLTH-01: ConnectorHealth.check returns healthy for mock', async () => {
    const sdk = makeMockSDK();
    ConnectorRegistry.register(sdk);
    await ConnectorLifecycle.initialize(sdk.connectorId, makeContext(sdk.connectorId));
    const h = await ConnectorHealth.check(sdk.connectorId);
    assert(h.status === 'healthy', 'Expected healthy');
    assert(h.latencyMs >= 0, 'Expected latency');
  }),
  run('HLTH-02: ConnectorHealth.checkAll covers all connectors', async () => {
    const all = await ConnectorHealth.checkAll();
    assert(typeof all === 'object', 'Expected object');
  }),
  run('HLTH-03: ConnectorRuntime.health covers all sub-systems', async () => {
    const rt = new ConnectorRuntime();
    const h = rt.health();
    const required = ['registry', 'connections', 'sessions', 'router', 'capabilities', 'audit', 'metrics'];
    for (const k of required) assert(k in h, `Expected health key: ${k}`);
  }),
  run('HLTH-04: ConnectorAudit.health returns counts', () => {
    const h = ConnectorAudit.health();
    assert(h.status === 'ok', 'Expected ok');
    assert(typeof h.total === 'number', 'Expected total');
  }),
  run('HLTH-05: ConnectorMetrics.health returns trackedConnectors', () => {
    const h = ConnectorMetrics.health();
    assert(h.status === 'ok', 'Expected ok');
    assert(typeof h.trackedConnectors === 'number', 'Expected trackedConnectors');
  }),
];

// ─── Multi-connection Tests ───────────────────────────────────────────────────

const multiConnectionTests = [
  run('MC-01: multiple Gmail-like connections per org', () => {
    const id = `mc-gmail-${Date.now()}`;
    const sdk = makeMockSDK(id, ['READ_EMAIL', 'SEND_EMAIL']);
    ConnectorRegistry.register(sdk);
    ['commercial@gmail.com', 'financial@gmail.com', 'director@gmail.com'].forEach((email) => {
      addActiveConnection(id, { email });
    });
    const conns = ConnectionRegistry.listByConnector(id);
    assert(conns.length === 3, `Expected 3 Gmail connections, got ${conns.length}`);
  }),
  run('MC-02: multiple orgs share the same connector', () => {
    const id = `mc-multi-org-${Date.now()}`;
    const sdk = makeMockSDK(id);
    ConnectorRegistry.register(sdk);
    addActiveConnection(id, { orgId: 'org-A' });
    addActiveConnection(id, { orgId: 'org-B' });
    addActiveConnection(id, { orgId: 'org-C' });
    const orgA = ConnectionRegistry.listByOrg('org-A').filter((c) => c.connectorId === id);
    const orgB = ConnectionRegistry.listByOrg('org-B').filter((c) => c.connectorId === id);
    assert(orgA.length === 1, 'Expected 1 for org-A');
    assert(orgB.length === 1, 'Expected 1 for org-B');
  }),
  run('MC-03: workspace isolation', () => {
    const id = `mc-ws-${Date.now()}`;
    const sdk = makeMockSDK(id);
    ConnectorRegistry.register(sdk);
    addActiveConnection(id, { wsId: 'ws-A' });
    addActiveConnection(id, { wsId: 'ws-B' });
    const wsA = ConnectionRegistry.listByWorkspace('ws-A').filter((c) => c.connectorId === id);
    assert(wsA.length === 1, 'Expected 1 for ws-A');
  }),
  run('MC-04: parallel fan-out across 5 connections', async () => {
    const id = `mc-parallel-${Date.now()}`;
    const sdk = makeMockSDK(id, ['READ_EMAIL']);
    ConnectorRegistry.register(sdk);
    for (let i = 0; i < 5; i++) addActiveConnection(id, { email: `user${i}@test.com` });
    await ConnectorLifecycle.initialize(id, makeContext(id, 'temp'));
    const results = await ConnectorRouter.fanOut({ connectorId: id }, async (connId) => connId);
    assert(results.length === 5, `Expected 5 parallel results, got ${results.length}`);
  }),
];

// ─── Concurrency & Idempotence ────────────────────────────────────────────────

const concurrencyTests = [
  run('CONC-01: concurrent connection adds produce unique IDs', async () => {
    const id = `conc-${Date.now()}`;
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        Promise.resolve(addActiveConnection(id, { email: `u${i}@test.com` }))
      )
    );
    assert(new Set(results).size === 10, 'Expected 10 unique connectionIds');
  }),
  run('CONC-02: register is idempotent (re-register same connector)', () => {
    const sdk = makeMockSDK();
    ConnectorRegistry.register(sdk);
    ConnectorRegistry.register(sdk); // idempotent re-register
    assert(ConnectorRegistry.has(sdk.connectorId), 'Expected still registered');
  }),
  run('CONC-03: session start is idempotent for same connectionId', () => {
    const ctx = makeContext('idem-connector', `idem-conn-${Date.now()}`);
    const s1 = ConnectorSessionManager.start(ctx);
    const s2 = ConnectorSessionManager.start(ctx);
    assert(s1.id === s2.id, 'Expected same session');
  }),
  run('CONC-04: concurrent sessions for different connections', async () => {
    const ids = await Promise.all(
      Array.from({ length: 5 }, (_, i) => {
        const ctx = makeContext('conc-sess', `conc-conn-${Date.now()}-${i}`);
        return ConnectorSessionManager.start(ctx).id;
      })
    );
    assert(new Set(ids).size === 5, 'Expected unique sessions per connection');
  }),
];

// ─── Audit Tests ──────────────────────────────────────────────────────────────

const auditTests = [
  run('AUDIT-01: record stores entry', () => {
    ConnectorAudit.record({
      connectorId: 'mock', connectionId: 'c', userId: 'u', organizationId: 'o',
      operationId: 'op-read', outcome: 'success', durationMs: 10, metadata: {},
    });
    const r = ConnectorAudit.query({ connectorId: 'mock' });
    assert(r.length > 0, 'Expected audit record');
  }),
  run('AUDIT-02: query filters by outcome', () => {
    ConnectorAudit.record({
      connectorId: 'mock-fail', connectionId: 'c', userId: 'u', organizationId: 'o',
      operationId: 'op-read', outcome: 'failure', durationMs: 5, metadata: {},
    });
    const failures = ConnectorAudit.query({ connectorId: 'mock-fail', outcome: 'failure' });
    assert(failures.length > 0, 'Expected failure record');
    assert(failures.every((r) => r.outcome === 'failure'), 'All results must be failures');
  }),
];

// ─── Runner ───────────────────────────────────────────────────────────────────

export async function runUCRTests(): Promise<{
  results: TestResult[];
  passed:  number;
  failed:  number;
  coverage: string;
}> {
  const all = [
    ...registryTests,
    ...connectionTests,
    ...lifecycleTests,
    ...sessionTests,
    ...routerTests,
    ...capabilityTests,
    ...eventTests,
    ...healthTests,
    ...multiConnectionTests,
    ...concurrencyTests,
    ...auditTests,
  ];

  const results = await Promise.all(all);
  const passed  = results.filter((r) => r.passed).length;
  const failed  = results.filter((r) => !r.passed).length;
  const coverage = `${passed}/${results.length} tests passed (${Math.round((passed / results.length) * 100)}%)`;

  console.log(`\n[UCR Tests 6.4.1] ${coverage}`);
  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    console.log(`  ${icon} ${r.name} (${r.duration}ms)${r.error ? ' — ' + r.error : ''}`);
  }

  return { results, passed, failed, coverage };
}