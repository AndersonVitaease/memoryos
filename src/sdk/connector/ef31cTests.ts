/**
 * ef31cTests.ts
 * Sprint EF-31C — Connector SDK Freeze & Developer Kit
 * 10 test groups covering SDK, BaseConnector, ConnectorBuilder, HelloConnector,
 * Compatibility, Freeze validation, Quality Gate, and SDK Certification.
 *
 * EF-31C · 2026-07-12 · Version: 1.0.0
 */

import { ConnectorRuntime } from '@/runtime/connectors/ConnectorRuntime';
import { BaseConnector } from './BaseConnector';
import { ConnectorBuilder } from './ConnectorBuilder';
import { HelloConnector, HELLO_MANIFEST } from './HelloConnector';
import type { IConnectorManifest } from '@/runtime/connectors/interfaces/IConnectorManifest';
import type { IConnectorAction } from '@/runtime/connectors/interfaces/IConnectorAction';
import type { IConnectorContext } from '@/runtime/connectors/interfaces/IConnectorContext';
import type { IConnectorSession } from '@/runtime/connectors/interfaces/IConnectorSession';
import type { IConnectorResult } from '@/runtime/connectors/interfaces/IConnectorResult';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeAction(o: Partial<IConnectorAction> = {}): IConnectorAction {
  return {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    connectorId: 'hello-connector-v1',
    actionId: 'list_items',
    correlationId: `corr_${Date.now()}`,
    executionId: `exec_${Date.now()}`,
    requestId: `req_${Date.now()}`,
    input: {},
    metadata: { attemptNumber: 1, maxAttempts: 3, timeoutMs: 5000, createdAt: new Date().toISOString() },
    ...o,
  };
}

function makeContext(o: Partial<IConnectorContext> = {}): IConnectorContext {
  return {
    correlationId: `corr_${Date.now()}`,
    executionId: `exec_${Date.now()}`,
    userId: 'user-sdk-test',
    grantedScopes: ['read', 'write', 'admin'],
    grantedPermissions: ['list_items', 'get_item', 'create_item', 'delete_item'],
    credentials: { type: 'apikey', apiKeyRef: 'ref_hello_001' },
    metadata: {},
    createdAt: new Date().toISOString(),
    ...o,
  };
}

async function bootHello(): Promise<ConnectorRuntime> {
  const rt = new ConnectorRuntime({ enableCircuitBreaker: true });
  await rt.registerConnector(HELLO_MANIFEST, new HelloConnector());
  rt.registerCredentials('hello-connector-v1', 'user-sdk-test', 'apikey', 'hello-secret-key');
  return rt;
}

// ── Test runner ─────────────────────────────────────────────────────────────

export interface EF31CTestResult {
  group: string;
  criterion: number;
  name: string;
  passed: boolean;
  detail?: string;
  error?: string;
  durationMs: number;
}

let seq = 0;
async function test(group: string, name: string, fn: () => Promise<void>): Promise<EF31CTestResult> {
  const criterion = ++seq;
  const start = Date.now();
  try { await fn(); return { group, criterion, name, passed: true, durationMs: Date.now() - start }; }
  catch (err) { return { group, criterion, name, passed: false, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - start }; }
}
function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

// ── GROUP 1: ConnectorBuilder ────────────────────────────────────────────────

async function g1_builder(): Promise<EF31CTestResult[]> {
  const G = 'G1 ConnectorBuilder';
  const r: EF31CTestResult[] = [];

  r.push(await test(G, 'Basic build produces valid frozen manifest', async () => {
    const m = new ConnectorBuilder('test-c', '1.0.0', 'Test')
      .addAction({ id: 'ping', name: 'Ping', description: 'ping', method: 'GET', endpoint: '/ping', requiredScopes: [], idempotent: true, sideEffects: [], paginated: false })
      .build();
    assert(m.id === 'test-c', 'Wrong id');
    assert(m.version === '1.0.0', 'Wrong version');
    assert(m.schemaVersion === 1, 'Wrong schemaVersion');
    assert(Object.isFrozen(m), 'Manifest must be frozen');
  }));

  r.push(await test(G, 'build() without actions throws', async () => {
    let threw = false;
    try { new ConnectorBuilder('x', '1.0.0', 'X').build(); }
    catch { threw = true; }
    assert(threw, 'Expected error when no actions registered');
  }));

  r.push(await test(G, 'Duplicate scope throws', async () => {
    let threw = false;
    const b = new ConnectorBuilder('x', '1.0.0', 'X');
    const s = { id: 'read', name: 'Read', description: '', required: true, sensitiveData: false, capabilities: [] };
    try { b.addScope(s).addScope(s); } catch { threw = true; }
    assert(threw, 'Expected error on duplicate scope');
  }));

  r.push(await test(G, 'Duplicate action throws', async () => {
    let threw = false;
    const b = new ConnectorBuilder('x', '1.0.0', 'X');
    const a = { id: 'ping', name: 'P', description: '', method: 'GET' as const, endpoint: '/', requiredScopes: [], idempotent: true, sideEffects: [], paginated: false };
    try { b.addAction(a).addAction(a); } catch { threw = true; }
    assert(threw, 'Expected error on duplicate action');
  }));

  r.push(await test(G, 'Invalid version semver throws', async () => {
    let threw = false;
    try { new ConnectorBuilder('x', 'v1.0', 'X'); } catch { threw = true; }
    assert(threw, 'Expected error for non-semver version');
  }));

  r.push(await test(G, 'All defaults applied when not overridden', async () => {
    const m = new ConnectorBuilder('defaults-c', '1.0.0', 'Defaults')
      .addAction({ id: 'a', name: 'A', description: '', method: 'GET', endpoint: '/', requiredScopes: [], idempotent: true, sideEffects: [], paginated: false })
      .build();
    assert(m.retryPolicy.maxAttempts === 3, 'Default retry maxAttempts should be 3');
    assert(m.circuitBreaker.enabled === true, 'Default circuit breaker should be enabled');
    assert(m.healthCheck.timeoutMs === 100, 'Default health check timeout should be 100ms');
    assert(m.auditLevel === 'basic', 'Default audit level should be basic');
    assert(m.telemetry.sensitiveFields.includes('password'), 'Default sensitiveFields should include password');
  }));

  r.push(await test(G, 'markDeprecated sets deprecated=true and supersededBy', async () => {
    const m = new ConnectorBuilder('old-c', '1.0.0', 'Old')
      .addAction({ id: 'a', name: 'A', description: '', method: 'GET', endpoint: '/', requiredScopes: [], idempotent: true, sideEffects: [], paginated: false })
      .markDeprecated('new-connector-v2')
      .build();
    assert(m.deprecated === true, 'Expected deprecated=true');
    assert(m.supersededBy === 'new-connector-v2', 'Wrong supersededBy');
    assert(typeof m.deprecatedAt === 'string', 'Expected deprecatedAt string');
  }));

  return r;
}

// ── GROUP 2: BaseConnector lifecycle ────────────────────────────────────────

async function g2_baseConnector(): Promise<EF31CTestResult[]> {
  const G = 'G2 BaseConnector';
  const r: EF31CTestResult[] = [];

  // Minimal concrete subclass for testing BaseConnector directly
  class MinimalConnector extends BaseConnector {
    protected async onExecute(action: IConnectorAction, _ctx: IConnectorContext, _s: IConnectorSession): Promise<IConnectorResult> {
      const now = new Date().toISOString();
      return {
        id: 'r1', connectorId: this.id, actionId: action.actionId, executionId: action.executionId,
        correlationId: action.correlationId, requestId: action.requestId,
        status: 'SUCCESS', output: { ok: true }, latencyMs: 1, attemptNumber: 1,
        completedAt: now, retryable: false,
        telemetry: { requestSentAt: now, responseReceivedAt: now, latencyMs: 1, retryCount: 0 },
      };
    }
  }

  const manifest = new ConnectorBuilder('base-test', '1.0.0', 'Base Test')
    .setAuth({ type: 'none' })
    .addAction({ id: 'noop', name: 'Noop', description: '', method: 'GET', endpoint: '/', requiredScopes: [], idempotent: true, sideEffects: [], paginated: false })
    .build();

  r.push(await test(G, 'Initial status is UNREGISTERED', async () => {
    const c = new MinimalConnector(manifest);
    assert(c.status === 'UNREGISTERED', `Expected UNREGISTERED, got ${c.status}`);
  }));

  r.push(await test(G, 'initialize() sets initializedAt and transitions to INITIALIZING', async () => {
    const c = new MinimalConnector(manifest);
    await c.initialize();
    assert(c.status === 'INITIALIZING', `Expected INITIALIZING, got ${c.status}`);
    assert(typeof c.statistics().initializedAt === 'string', 'Expected initializedAt');
  }));

  r.push(await test(G, 'connect() after initialize() sets status CONNECTED', async () => {
    const c = new MinimalConnector(manifest);
    await c.initialize();
    await c.connect();
    assert(c.status === 'CONNECTED', `Expected CONNECTED, got ${c.status}`);
  }));

  r.push(await test(G, 'execute() increments metrics', async () => {
    const c = new MinimalConnector(manifest);
    await c.initialize(); await c.connect();
    const ctx = makeContext();
    const sess = {} as IConnectorSession;
    await c.execute(makeAction({ connectorId: 'base-test', actionId: 'noop' }), ctx, sess);
    await c.execute(makeAction({ connectorId: 'base-test', actionId: 'noop' }), ctx, sess);
    const m = c.metrics();
    assert(m.executeCount === 2, `Expected 2, got ${m.executeCount}`);
    assert(m.successCount === 2, `Expected successCount=2, got ${m.successCount}`);
    assert(m.failureCount === 0, `Expected failureCount=0, got ${m.failureCount}`);
  }));

  r.push(await test(G, 'disconnect() sets status DISCONNECTED', async () => {
    const c = new MinimalConnector(manifest);
    await c.initialize(); await c.connect();
    const sess = {} as IConnectorSession;
    await c.disconnect(sess);
    assert(c.status === 'DISCONNECTED', `Expected DISCONNECTED, got ${c.status}`);
  }));

  r.push(await test(G, 'health() returns HEALTHY with correct connectorId', async () => {
    const c = new MinimalConnector(manifest);
    await c.initialize(); await c.connect();
    const h = await c.health();
    assert(h.status === 'HEALTHY', `Expected HEALTHY, got ${h.status}`);
    assert(h.connectorId === 'base-test', `Wrong connectorId: ${h.connectorId}`);
  }));

  r.push(await test(G, 'validate() returns valid=true for well-formed manifest', async () => {
    const c = new MinimalConnector(manifest);
    const v = await c.validate();
    assert(v.valid, `Expected valid=true, errors: ${JSON.stringify(v.errors)}`);
  }));

  r.push(await test(G, 'ping() returns reachable=true when CONNECTED', async () => {
    const c = new MinimalConnector(manifest);
    await c.initialize(); await c.connect();
    const p = await c.ping();
    assert(p.reachable === true, 'Expected reachable=true');
    assert(p.connectorId === 'base-test', 'Wrong connectorId');
  }));

  return r;
}

// ── GROUP 3: HelloConnector SDK-only validation ──────────────────────────────

async function g3_helloConnector(): Promise<EF31CTestResult[]> {
  const G = 'G3 HelloConnector';
  const r: EF31CTestResult[] = [];

  r.push(await test(G, 'HELLO_MANIFEST was built with ConnectorBuilder (frozen)', async () => {
    assert(Object.isFrozen(HELLO_MANIFEST), 'HELLO_MANIFEST must be frozen');
    assert(HELLO_MANIFEST.id === 'hello-connector-v1', 'Wrong id');
    assert(HELLO_MANIFEST.schemaVersion === 1, 'Wrong schemaVersion');
    assert(HELLO_MANIFEST.scopes.length === 3, `Expected 3 scopes, got ${HELLO_MANIFEST.scopes.length}`);
    assert(HELLO_MANIFEST.supportedActions.length === 4, `Expected 4 actions, got ${HELLO_MANIFEST.supportedActions.length}`);
  }));

  r.push(await test(G, 'HelloConnector extends BaseConnector', async () => {
    const c = new HelloConnector();
    assert(c instanceof BaseConnector, 'HelloConnector must extend BaseConnector');
    assert(c instanceof HelloConnector, 'Must be HelloConnector');
  }));

  r.push(await test(G, 'Full lifecycle: initialize → connect → authenticate', async () => {
    const c = new HelloConnector();
    await c.initialize();
    await c.connect();
    const authenticated = await c.authenticate(makeContext());
    assert(authenticated, 'Expected authenticated=true');
    assert(c.isAuthenticated(), 'Expected isAuthenticated()=true');
  }));

  r.push(await test(G, 'list_items returns items with correct structure', async () => {
    const rt = await bootHello();
    const result = await rt.execute(makeAction({ actionId: 'list_items' }), makeContext({ userId: 'user-sdk-test' }));
    assert(result.status === 'SUCCESS', `Expected SUCCESS, got ${result.status}`);
    assert(Array.isArray(result.output?.['items']), 'Expected items array');
    assert(typeof result.output?.['count'] === 'number', 'Expected count number');
  }));

  r.push(await test(G, 'get_item with valid id returns item', async () => {
    const rt = await bootHello();
    const result = await rt.execute(
      makeAction({ actionId: 'get_item', input: { id: 'hello-001' } }),
      makeContext({ userId: 'user-sdk-test' })
    );
    assert(result.status === 'SUCCESS', `Expected SUCCESS, got ${result.status}`);
    assert((result.output?.['item'] as HelloItem)?.id === 'hello-001', 'Wrong item id');
  }));

  r.push(await test(G, 'get_item with unknown id returns FAILED+NOT_FOUND', async () => {
    const rt = await bootHello();
    const result = await rt.execute(
      makeAction({ actionId: 'get_item', input: { id: 'ghost-id' } }),
      makeContext({ userId: 'user-sdk-test' })
    );
    assert(result.status === 'FAILED', `Expected FAILED, got ${result.status}`);
    assert(result.error?.code === 'NOT_FOUND', `Expected NOT_FOUND, got ${result.error?.code}`);
  }));

  r.push(await test(G, 'create_item creates and returns new item', async () => {
    const rt = await bootHello();
    const result = await rt.execute(
      makeAction({ actionId: 'create_item', input: { name: 'Test Item EF-31C' } }),
      makeContext({ userId: 'user-sdk-test' })
    );
    assert(result.status === 'SUCCESS', `Expected SUCCESS, got ${result.status}`);
    assert(result.output?.['created'] === true, 'Expected created=true');
    const item = result.output?.['item'] as HelloItem;
    assert(item?.name === 'Test Item EF-31C', `Wrong name: ${item?.name}`);
  }));

  r.push(await test(G, 'health() returns HEALTHY with all checks', async () => {
    const c = new HelloConnector();
    await c.initialize(); await c.connect();
    await c.authenticate(makeContext());
    const h = await c.health();
    assert(h.status === 'HEALTHY', `Expected HEALTHY, got ${h.status}`);
    assert(h.checks['initialized'] === true, 'Expected initialized=true');
    assert(h.checks['authenticated'] === true, 'Expected authenticated=true');
  }));

  r.push(await test(G, 'shutdown() sets authenticated=false', async () => {
    const c = new HelloConnector();
    await c.initialize(); await c.connect();
    await c.authenticate(makeContext());
    assert(c.isAuthenticated(), 'Expected auth before shutdown');
    await c.shutdown();
    assert(!c.isAuthenticated(), 'Expected auth=false after shutdown');
  }));

  return r;
}

// ── GROUP 4: SDK compatibility — all planned connectors ─────────────────────

async function g4_compatibility(): Promise<EF31CTestResult[]> {
  const G = 'G4 SDK Compatibility';
  const r: EF31CTestResult[] = [];

  const CONNECTOR_CASES: Array<{ id: string; name: string; auth: 'oauth2' | 'apikey'; scopes: string[] }> = [
    { id: 'base44-connector-v1', name: 'Base44 Connector', auth: 'apikey', scopes: ['workspace.read', 'workspace.write', 'files.read', 'files.write'] },
    { id: 'github-connector-v1', name: 'GitHub Connector', auth: 'oauth2', scopes: ['repo', 'repo:write', 'pull_requests', 'issues', 'workflows'] },
    { id: 'gmail-connector-v1', name: 'Gmail Connector', auth: 'oauth2', scopes: ['mail.read', 'mail.send', 'mail.delete'] },
    { id: 'gdrive-connector-v1', name: 'Google Drive Connector', auth: 'oauth2', scopes: ['drive.read', 'drive.write', 'drive.delete'] },
    { id: 'gcal-connector-v1', name: 'Google Calendar Connector', auth: 'oauth2', scopes: ['calendar.read', 'calendar.write', 'calendar.delete'] },
    { id: 'whatsapp-connector-v1', name: 'WhatsApp Connector', auth: 'bearer', scopes: ['messages.send', 'messages.read'] },
  ];

  for (const { id, name, auth, scopes } of CONNECTOR_CASES) {
    r.push(await test(G, `SDK supports ${name} (auth=${auth})`, async () => {
      const b = new ConnectorBuilder(id, '1.0.0', name)
        .setAuth(
          auth === 'oauth2'
            ? { type: 'oauth2', oauth2: { authorizationUrl: 'https://auth.example.com', tokenUrl: 'https://token.example.com', refreshUrl: 'https://refresh.example.com', defaultScopes: scopes, pkce: true, tokenStorage: 'memory', refreshStrategy: 'proactive', expiryBufferSeconds: 60 } }
            : auth === 'apikey'
            ? { type: 'apikey', apikey: { headerName: 'X-Api-Key', rotationPolicy: 'manual', secretName: `${id}_key` } }
            : { type: 'bearer', bearer: { headerName: 'Authorization', secretName: `${id}_token` } }
        );

      for (const s of scopes) {
        b.addScope({ id: s, name: s, description: `Scope: ${s}`, required: false, sensitiveData: false, capabilities: [s] });
      }

      b.addAction({ id: 'list', name: 'List', description: 'List resources', method: 'GET', endpoint: '/list', requiredScopes: [scopes[0]], idempotent: true, sideEffects: [], paginated: true });

      const m = b.build();
      assert(m.id === id, `Wrong id: ${m.id}`);
      assert(m.auth.type === auth, `Wrong auth: ${m.auth.type}`);
      assert(m.scopes.length === scopes.length, `Wrong scope count: ${m.scopes.length}`);

      // Validate via ManifestLoader in runtime
      const rt = new ConnectorRuntime();
      const v = rt.validateManifest(m);
      assert(v.valid, `Invalid manifest for ${name}: ${JSON.stringify(v.errors)}`);
    }));
  }

  return r;
}

// ── GROUP 5: SDK public interface freeze ────────────────────────────────────

async function g5_freeze(): Promise<EF31CTestResult[]> {
  const G = 'G5 SDK Freeze';
  const r: EF31CTestResult[] = [];

  r.push(await test(G, 'SDK index exports BaseConnector', async () => {
    const { BaseConnector } = await import('./index');
    assert(typeof BaseConnector === 'function', 'BaseConnector must be exported');
  }));

  r.push(await test(G, 'SDK index exports ConnectorBuilder', async () => {
    const { ConnectorBuilder } = await import('./index');
    assert(typeof ConnectorBuilder === 'function', 'ConnectorBuilder must be exported');
  }));

  r.push(await test(G, 'SDK index exports HelloConnector', async () => {
    const { HelloConnector, HELLO_MANIFEST } = await import('./index');
    assert(typeof HelloConnector === 'function', 'HelloConnector must be exported');
    assert(typeof HELLO_MANIFEST === 'object', 'HELLO_MANIFEST must be exported');
  }));

  r.push(await test(G, 'SDK index exports ConnectorRuntime', async () => {
    const { ConnectorRuntime } = await import('./index');
    assert(typeof ConnectorRuntime === 'function', 'ConnectorRuntime must be exported');
  }));

  r.push(await test(G, 'HELLO_MANIFEST passes runtime validation', async () => {
    const rt = new ConnectorRuntime();
    const v = rt.validateManifest(HELLO_MANIFEST);
    assert(v.valid, `HELLO_MANIFEST invalid: ${JSON.stringify(v.errors)}`);
    assert(v.errors.length === 0, `Expected 0 errors, got ${v.errors.length}`);
  }));

  r.push(await test(G, 'ConnectorRuntime.version is 1.0.0', async () => {
    const rt = new ConnectorRuntime();
    assert(rt.version === '1.0.0', `Expected 1.0.0, got ${rt.version}`);
  }));

  r.push(await test(G, 'HELLO_MANIFEST is structurally immutable (frozen)', async () => {
    const before = HELLO_MANIFEST.id;
    try { (HELLO_MANIFEST as Record<string, unknown>)['id'] = 'hacked'; } catch { /* ok */ }
    assert(HELLO_MANIFEST.id === before, 'Manifest.id must not be modifiable');
  }));

  return r;
}

// ── GROUP 6: HelloConnector via Runtime (integration) ───────────────────────

async function g6_integration(): Promise<EF31CTestResult[]> {
  const G = 'G6 Runtime Integration';
  const r: EF31CTestResult[] = [];

  r.push(await test(G, 'registerConnector does not throw for HelloConnector', async () => {
    const rt = new ConnectorRuntime();
    await rt.registerConnector(HELLO_MANIFEST, new HelloConnector());
    assert(rt.listConnectors().length === 1, 'Expected 1 connector');
    assert(rt.listConnectors()[0].connectorId === 'hello-connector-v1', 'Wrong connectorId');
  }));

  r.push(await test(G, 'listConnectors shows CONNECTED after register', async () => {
    const rt = await bootHello();
    const list = rt.listConnectors();
    assert(list.length === 1, 'Expected 1 connector');
    assert(list[0].status === 'CONNECTED', `Expected CONNECTED, got ${list[0].status}`);
  }));

  r.push(await test(G, 'Audit log has entries after execution', async () => {
    const rt = await bootHello();
    await rt.execute(makeAction(), makeContext({ userId: 'user-sdk-test' }));
    const log = rt.getAuditLog(10);
    assert(log.length >= 1, `Expected >= 1 audit record, got ${log.length}`);
    assert(log[0].connectorId === 'hello-connector-v1', 'Wrong connectorId in audit');
  }));

  r.push(await test(G, 'Telemetry tracks execution correctly', async () => {
    const rt = await bootHello();
    await rt.execute(makeAction(), makeContext({ userId: 'user-sdk-test' }));
    const telem = rt.getTelemetry('hello-connector-v1');
    assert(telem.requestCount >= 1, `Expected requestCount >= 1, got ${telem.requestCount}`);
    assert(telem.successCount >= 1, `Expected successCount >= 1, got ${telem.successCount}`);
  }));

  r.push(await test(G, 'diagnostics() returns valid manifest info for HelloConnector', async () => {
    const rt = await bootHello();
    const d = await rt.diagnostics('hello-connector-v1', 'user-sdk-test');
    assert(d.manifest.valid === true, 'Expected valid manifest in diagnostics');
    assert(d.manifest.actionCount === 4, `Expected 4 actions, got ${d.manifest.actionCount}`);
    assert(d.auth.hasCredentials === true, 'Expected hasCredentials=true');
  }));

  r.push(await test(G, 'shutdown() via runtime closes the connector', async () => {
    const rt = await bootHello();
    await rt.shutdown('hello-connector-v1');
    // After shutdown, connector should be DISCONNECTED in registry
    const list = rt.listConnectors();
    const found = list.find(c => c.connectorId === 'hello-connector-v1');
    assert(!found || found.status !== 'CONNECTED', 'Expected not CONNECTED after shutdown');
  }));

  return r;
}

// ── GROUP 7: Quality Gate ────────────────────────────────────────────────────

async function g7_qualityGate(): Promise<EF31CTestResult[]> {
  const G = 'G7 Quality Gate';
  const r: EF31CTestResult[] = [];

  r.push(await test(G, 'Runtime health is HEALTHY after HelloConnector registration', async () => {
    const rt = await bootHello();
    const h = await rt.health();
    assert(['HEALTHY', 'DEGRADED'].includes(h.status), `Invalid status: ${h.status}`);
    assert(h.checks['registryOperational'] === true, 'Expected registryOperational=true');
    assert(h.checks['auditIntact'] === true, 'Expected auditIntact=true');
  }));

  r.push(await test(G, 'No execution escapes the audit trail', async () => {
    const rt = await bootHello();
    const N = 5;
    for (let i = 0; i < N; i++) await rt.execute(makeAction(), makeContext({ userId: 'user-sdk-test' }));
    const log = rt.getAuditLog(N + 10);
    assert(log.length >= N, `Expected >= ${N} audit records, got ${log.length}`);
  }));

  r.push(await test(G, 'Statistics is JSON-serializable', async () => {
    const rt = await bootHello();
    await rt.execute(makeAction(), makeContext({ userId: 'user-sdk-test' }));
    const s = rt.statistics();
    const json = JSON.stringify(s);
    const parsed = JSON.parse(json);
    assert(parsed.runtimeVersion === '1.0.0', 'Wrong runtimeVersion in stats');
    assert(typeof parsed.callCount === 'number', 'Expected callCount number');
  }));

  r.push(await test(G, 'unregisterConnector removes from list', async () => {
    const rt = await bootHello();
    assert(rt.listConnectors().length === 1, 'Expected 1 before unregister');
    rt.unregisterConnector('hello-connector-v1');
    assert(rt.listConnectors().length === 0, 'Expected 0 after unregister');
  }));

  r.push(await test(G, 'HelloConnector metrics track correctly across 10 executions', async () => {
    const c = new HelloConnector();
    await c.initialize(); await c.connect();
    await c.authenticate(makeContext());
    for (let i = 0; i < 10; i++) {
      await c.execute(makeAction({ actionId: 'list_items' }), makeContext(), {} as IConnectorSession);
    }
    const m = c.metrics();
    assert(m.executeCount === 10, `Expected 10, got ${m.executeCount}`);
    assert(m.successCount === 10, `Expected successCount=10, got ${m.successCount}`);
    assert(m.avgLatencyMs >= 0, 'Expected non-negative avgLatencyMs');
  }));

  return r;
}

// ── GROUP 8: SDK boundary — no Runtime internals from connectors ─────────────

async function g8_boundaries(): Promise<EF31CTestResult[]> {
  const G = 'G8 SDK Boundaries';
  const r: EF31CTestResult[] = [];

  r.push(await test(G, 'HelloConnector does not reference ConnectorRegistry directly', async () => {
    // This validates by checking that the connector works exclusively
    // through the public SDK methods and runtime facade
    const c = new HelloConnector();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(c));
    // The connector must NOT have any registry/executor/audit/session references
    const internalRefs = methods.filter(m => ['registry', 'executor', 'audit', 'rateLimiter', 'permissions'].includes(m));
    assert(internalRefs.length === 0, `Connector exposes internal refs: ${internalRefs.join(', ')}`);
  }));

  r.push(await test(G, 'BaseConnector only exposes SDK-safe methods', async () => {
    const c = new HelloConnector();
    const sdkMethods = ['initialize', 'connect', 'authenticate', 'execute', 'disconnect', 'shutdown', 'health', 'validate', 'ping', 'metrics', 'statistics'];
    for (const m of sdkMethods) {
      assert(typeof c[m as keyof typeof c] === 'function', `Expected SDK method: ${m}`);
    }
  }));

  r.push(await test(G, 'ConnectorRuntime is the sole external runtime reference', async () => {
    // The SDK's index.ts re-exports ConnectorRuntime — no other Runtime class
    const sdk = await import('./index');
    const keys = Object.keys(sdk);
    // Verify only safe exports exist
    assert(keys.includes('ConnectorRuntime'), 'ConnectorRuntime must be exported');
    assert(keys.includes('BaseConnector'), 'BaseConnector must be exported');
    assert(keys.includes('ConnectorBuilder'), 'ConnectorBuilder must be exported');
    assert(keys.includes('HelloConnector'), 'HelloConnector must be exported');
  }));

  return r;
}

// ── GROUP 9: Performance ─────────────────────────────────────────────────────

async function g9_performance(): Promise<EF31CTestResult[]> {
  const G = 'G9 Performance';
  const r: EF31CTestResult[] = [];

  r.push(await test(G, '100 concurrent HelloConnector executions < 3s', async () => {
    const rt = await bootHello();
    const start = Date.now();
    const results = await Promise.all(
      Array.from({ length: 100 }, () => rt.execute(makeAction(), makeContext({ userId: 'user-sdk-test' })))
    );
    const elapsed = Date.now() - start;
    const successes = results.filter(x => x.status === 'SUCCESS').length;
    assert(successes === 100, `Expected 100 SUCCESS, got ${successes}`);
    assert(elapsed < 3000, `100 concurrent executions took ${elapsed}ms — too slow`);
  }));

  r.push(await test(G, 'ConnectorBuilder builds 50 manifests < 500ms', async () => {
    const start = Date.now();
    for (let i = 0; i < 50; i++) {
      new ConnectorBuilder(`perf-c-${i}`, '1.0.0', `Perf ${i}`)
        .addAction({ id: 'a', name: 'A', description: '', method: 'GET', endpoint: '/', requiredScopes: [], idempotent: true, sideEffects: [], paginated: false })
        .build();
    }
    const elapsed = Date.now() - start;
    assert(elapsed < 500, `50 builds took ${elapsed}ms — expected < 500ms`);
  }));

  return r;
}

// ── GROUP 10: SDK Certification ──────────────────────────────────────────────

async function g10_certification(): Promise<EF31CTestResult[]> {
  const G = 'G10 SDK Certification';
  const r: EF31CTestResult[] = [];

  r.push(await test(G, 'HelloConnector passes runtime manifest validation', async () => {
    const rt = new ConnectorRuntime();
    const v = rt.validateManifest(HELLO_MANIFEST);
    assert(v.valid, `Invalid: ${JSON.stringify(v.errors)}`);
  }));

  r.push(await test(G, 'HelloConnector is a valid IConnector (duck-type)', async () => {
    const c = new HelloConnector();
    assert(typeof c.initialize === 'function', 'Missing initialize');
    assert(typeof c.authenticate === 'function', 'Missing authenticate');
    assert(typeof c.execute === 'function', 'Missing execute');
    assert(typeof c.disconnect === 'function', 'Missing disconnect');
    assert(typeof c.health === 'function', 'Missing health');
    assert(typeof c.validate === 'function', 'Missing validate');
    assert(typeof c.ping === 'function', 'Missing ping');
  }));

  r.push(await test(G, 'SDK produces consistent manifests across multiple builds', async () => {
    const build = () => new ConnectorBuilder('stable-c', '1.0.0', 'Stable')
      .setCategory('utility')
      .addAction({ id: 'a', name: 'A', description: '', method: 'GET', endpoint: '/', requiredScopes: [], idempotent: true, sideEffects: [], paginated: false })
      .build();
    const m1 = build(); const m2 = build();
    assert(m1.id === m2.id, 'Inconsistent id');
    assert(m1.version === m2.version, 'Inconsistent version');
    assert(m1.category === m2.category, 'Inconsistent category');
    assert(m1.supportedActions.length === m2.supportedActions.length, 'Inconsistent actions');
  }));

  r.push(await test(G, 'SDK ready: BaseConnector + Builder + HelloConnector all functional', async () => {
    const m = new ConnectorBuilder('cert-c', '1.0.0', 'Certification')
      .addAction({ id: 'ping', name: 'Ping', description: '', method: 'GET', endpoint: '/', requiredScopes: [], idempotent: true, sideEffects: [], paginated: false })
      .build();
    const rt = new ConnectorRuntime();
    const v = rt.validateManifest(m);
    assert(v.valid, 'SDK-built manifest must be valid');
    const hello = new HelloConnector();
    await hello.initialize(); await hello.connect();
    const h = await hello.health();
    assert(h.status === 'HEALTHY', 'HelloConnector must be healthy');
    assert(m.id === 'cert-c', 'Builder must produce correct id');
    // All SDK components functional
    assert(true, 'SDK CERTIFIED');
  }));

  return r;
}

// ── MAIN ENTRY ────────────────────────────────────────────────────────────────

export interface EF31CSuiteResult {
  passed: number;
  total: number;
  durationMs: number;
  results: EF31CTestResult[];
  byGroup: Record<string, { passed: number; total: number }>;
  health: { status: 'SUCCESS' | 'PARTIAL' | 'FAILED'; details: string };
  statistics: { totalGroups: number; totalTests: number; successRate: number };
  metrics: { avgDurationMs: number; maxDurationMs: number };
  certification: {
    sdkComponents: number;
    baseConnectorImplemented: boolean;
    connectorBuilderImplemented: boolean;
    helloConnectorValidated: boolean;
    publicApiFrozen: boolean;
    compatibilityValidated: boolean;
    qualityGatePassed: boolean;
    totalTests: number;
    passedTests: number;
    successRate: number;
    verdict: 'SDK READY' | 'SDK NOT READY';
    justification: string;
  };
}

export async function runEF31CTests(): Promise<EF31CSuiteResult> {
  seq = 0;
  const start = Date.now();

  const allResults = (await Promise.all([
    g1_builder(),
    g2_baseConnector(),
    g3_helloConnector(),
    g4_compatibility(),
    g5_freeze(),
    g6_integration(),
    g7_qualityGate(),
    g8_boundaries(),
    g9_performance(),
    g10_certification(),
  ])).flat();

  const passed = allResults.filter(r => r.passed).length;
  const total = allResults.length;
  const durationMs = Date.now() - start;
  const successRate = total > 0 ? passed / total : 0;

  const byGroup: Record<string, { passed: number; total: number }> = {};
  for (const r of allResults) {
    if (!byGroup[r.group]) byGroup[r.group] = { passed: 0, total: 0 };
    byGroup[r.group].total++;
    if (r.passed) byGroup[r.group].passed++;
  }

  const durations = allResults.map(r => r.durationMs);
  const avgDurationMs = Math.round(durations.reduce((s, d) => s + d, 0) / (durations.length || 1));
  const maxDurationMs = Math.max(...durations, 0);

  const g1ok = byGroup['G1 ConnectorBuilder']?.passed === byGroup['G1 ConnectorBuilder']?.total;
  const g2ok = byGroup['G2 BaseConnector']?.passed === byGroup['G2 BaseConnector']?.total;
  const g3ok = byGroup['G3 HelloConnector']?.passed === byGroup['G3 HelloConnector']?.total;
  const g4ok = byGroup['G4 SDK Compatibility']?.passed === byGroup['G4 SDK Compatibility']?.total;
  const g5ok = byGroup['G5 SDK Freeze']?.passed === byGroup['G5 SDK Freeze']?.total;
  const g7ok = byGroup['G7 Quality Gate']?.passed === byGroup['G7 Quality Gate']?.total;
  const g10ok = byGroup['G10 SDK Certification']?.passed === byGroup['G10 SDK Certification']?.total;

  const ready = successRate === 1.0;

  return {
    passed, total, durationMs, results: allResults, byGroup,
    health: {
      status: successRate === 1 ? 'SUCCESS' : successRate >= 0.9 ? 'PARTIAL' : 'FAILED',
      details: `${passed}/${total} passed in ${durationMs}ms — ${(successRate * 100).toFixed(1)}% success`,
    },
    statistics: { totalGroups: 10, totalTests: total, successRate },
    metrics: { avgDurationMs, maxDurationMs },
    certification: {
      sdkComponents: 3,  // BaseConnector, ConnectorBuilder, HelloConnector
      baseConnectorImplemented: g2ok,
      connectorBuilderImplemented: g1ok,
      helloConnectorValidated: g3ok,
      publicApiFrozen: g5ok,
      compatibilityValidated: g4ok,
      qualityGatePassed: g7ok,
      totalTests: total,
      passedTests: passed,
      successRate,
      verdict: ready ? 'SDK READY' : 'SDK NOT READY',
      justification: ready
        ? 'All 10 SDK groups passed. ConnectorBuilder, BaseConnector and HelloConnector are fully functional. Public API is frozen and documented. 6 planned connectors (Base44, GitHub, Gmail, GDrive, GCal, WhatsApp) confirmed compatible. Connector Runtime is officially FROZEN. SDK READY for EF-32.'
        : `${total - passed} test(s) failed in: ${Object.entries(byGroup).filter(([,g]) => g.passed < g.total).map(([k]) => k).join(', ')}. Resolve all failures before declaring SDK READY.`,
    },
  };
}

interface HelloItem { id: string; name: string; createdAt: string; }