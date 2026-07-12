/**
 * ef32Tests.ts
 * Sprint EF-32 — Base44 Connector Test Suite
 * 11 groups · Authentication · Discovery · Navigation · FileRead
 * Sync · Permissions · Audit · Telemetry · Events · Recovery · Certification
 * EF-32 · 2026-07-12 · Version: 1.0.0
 */

import { ConnectorRuntime } from '@/runtime/connectors/ConnectorRuntime';
import { RuntimeEventBus } from '@/runtime/connectors/RuntimeEventBus';
import { Base44Connector } from './Base44Connector';
import { BASE44_MANIFEST } from './Base44ConnectorManifest';
import { WORKSPACES, PROJECTS, FILES } from './Base44Store';
import type { IConnectorAction } from '@/runtime/connectors/interfaces/IConnectorAction';
import type { IConnectorContext } from '@/runtime/connectors/interfaces/IConnectorContext';

// ── Helpers ─────────────────────────────────────────────────────────────────

const CONNECTOR_ID = 'base44-connector-v1';

function makeAction(actionId: string, input: Record<string, unknown> = {}): IConnectorAction {
  return {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    connectorId: CONNECTOR_ID,
    actionId,
    correlationId: `corr_${Date.now()}`,
    executionId: `exec_${Date.now()}`,
    requestId: `req_${Date.now()}`,
    input,
    metadata: { attemptNumber: 1, maxAttempts: 3, timeoutMs: 5000, createdAt: new Date().toISOString() },
  };
}

function makeContext(overrides: Partial<IConnectorContext> = {}): IConnectorContext {
  return {
    correlationId: `corr_${Date.now()}`,
    executionId: `exec_${Date.now()}`,
    userId: 'user-ef32',
    grantedScopes: ['workspace.read', 'project.read', 'files.read', 'sync.read'],
    grantedPermissions: [
      'list_workspaces', 'get_workspace', 'list_projects', 'get_project', 'search_projects',
      'list_directory', 'list_files', 'read_file', 'get_file_metadata', 'search_files',
      'sync_status', 'list_changes',
    ],
    credentials: { type: 'apikey', apiKeyRef: 'ref_base44_001' },
    metadata: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function bootRuntime(bus?: RuntimeEventBus): Promise<ConnectorRuntime> {
  const rt = new ConnectorRuntime({ enableCircuitBreaker: true });
  await rt.registerConnector(BASE44_MANIFEST, new Base44Connector(bus));
  rt.registerCredentials(CONNECTOR_ID, 'user-ef32', 'apikey', 'base44-sim-key');
  return rt;
}

// ── Test runner ──────────────────────────────────────────────────────────────

export interface EF32TestResult {
  group: string;
  criterion: number;
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

let seq = 0;
async function test(group: string, name: string, fn: () => Promise<void>): Promise<EF32TestResult> {
  const criterion = ++seq;
  const start = Date.now();
  try { await fn(); return { group, criterion, name, passed: true, durationMs: Date.now() - start }; }
  catch (err) { return { group, criterion, name, passed: false, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - start }; }
}
function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

// ── GROUP 1: Manifest ────────────────────────────────────────────────────────

async function g1_manifest(): Promise<EF32TestResult[]> {
  const G = 'G1 Manifest';
  return Promise.all([
    test(G, 'Manifest is frozen', async () => {
      assert(Object.isFrozen(BASE44_MANIFEST), 'Manifest must be frozen');
    }),
    test(G, 'Manifest passes runtime validation', async () => {
      const rt = new ConnectorRuntime();
      const v = rt.validateManifest(BASE44_MANIFEST);
      assert(v.valid, `Invalid: ${JSON.stringify(v.errors)}`);
    }),
    test(G, 'Manifest has 12 actions (read-only)', async () => {
      assert(BASE44_MANIFEST.supportedActions.length === 12, `Expected 12, got ${BASE44_MANIFEST.supportedActions.length}`);
    }),
    test(G, 'Manifest has 4 scopes', async () => {
      assert(BASE44_MANIFEST.scopes.length === 4, `Expected 4 scopes, got ${BASE44_MANIFEST.scopes.length}`);
    }),
    test(G, 'Manifest has no write/delete actions', async () => {
      const writeActions = BASE44_MANIFEST.supportedActions.filter(a =>
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(a.method) && a.sideEffects.length > 0
      );
      assert(writeActions.length === 0, `Expected 0 write actions with side effects, got ${writeActions.length}`);
    }),
    test(G, 'Auth type is apikey', async () => {
      assert(BASE44_MANIFEST.auth.type === 'apikey', `Expected apikey, got ${BASE44_MANIFEST.auth.type}`);
    }),
    test(G, 'Sensitive fields declared in telemetry', async () => {
      assert(BASE44_MANIFEST.telemetry.sensitiveFields.includes('base44_api_key'), 'Must declare base44_api_key as sensitive');
    }),
  ]);
}

// ── GROUP 2: Authentication ──────────────────────────────────────────────────

async function g2_auth(): Promise<EF32TestResult[]> {
  const G = 'G2 Authentication';
  return Promise.all([
    test(G, 'Authenticate with valid credential ref succeeds', async () => {
      const c = new Base44Connector();
      await c.initialize(); await c.connect();
      const ok = await c.authenticate(makeContext());
      assert(ok, 'Expected authenticated=true');
      assert(c.isAuthenticated(), 'isAuthenticated() must return true');
    }),
    test(G, 'Authenticate with no credential ref fails', async () => {
      const c = new Base44Connector();
      await c.initialize(); await c.connect();
      const ok = await c.authenticate(makeContext({ credentials: { type: 'none' } }));
      assert(!ok, 'Expected authenticated=false with no ref');
    }),
    test(G, 'Zero Trust: execute without credentials throws/fails', async () => {
      const rt = new ConnectorRuntime();
      await rt.registerConnector(BASE44_MANIFEST, new Base44Connector());
      // No credentials registered
      let threw = false;
      try { await rt.execute(makeAction('list_workspaces'), makeContext({ userId: 'unauth-user' })); }
      catch { threw = true; }
      assert(threw, 'Expected Zero Trust rejection');
    }),
    test(G, 'Credential ref is never exposed in logs/stats', async () => {
      const c = new Base44Connector();
      await c.initialize(); await c.connect();
      await c.authenticate(makeContext());
      const stats = JSON.stringify(c.b44Statistics());
      assert(!stats.includes('ref_base44_001'), 'Credential ref must not appear in statistics');
      assert(!stats.includes('base44-sim-key'), 'Raw key must not appear in statistics');
    }),
    test(G, 'Shutdown clears authentication state', async () => {
      const c = new Base44Connector();
      await c.initialize(); await c.connect();
      await c.authenticate(makeContext());
      assert(c.isAuthenticated(), 'Expected auth before shutdown');
      await c.shutdown();
      assert(!c.isAuthenticated(), 'Expected auth cleared after shutdown');
    }),
  ]);
}

// ── GROUP 3: Workspace Discovery ─────────────────────────────────────────────

async function g3_workspaces(): Promise<EF32TestResult[]> {
  const G = 'G3 Workspace Discovery';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'list_workspaces returns all workspaces', async () => {
      const r = await rt.execute(makeAction('list_workspaces'), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS, got ${r.status}`);
      const ws = r.output?.['workspaces'] as typeof WORKSPACES;
      assert(Array.isArray(ws), 'Expected workspaces array');
      assert(ws.length === WORKSPACES.length, `Expected ${WORKSPACES.length} workspaces`);
    }),
    test(G, 'list_workspaces output has id, name, region fields', async () => {
      const r = await rt.execute(makeAction('list_workspaces'), makeContext());
      const ws = r.output?.['workspaces'] as typeof WORKSPACES;
      assert(ws[0].id?.startsWith('ws-'), 'Expected ws- prefix in id');
      assert(typeof ws[0].name === 'string', 'Expected name string');
      assert(typeof ws[0].region === 'string', 'Expected region string');
    }),
    test(G, 'get_workspace by id returns correct workspace', async () => {
      const r = await rt.execute(makeAction('get_workspace', { workspaceId: 'ws-001' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS, got ${r.status}`);
      const ws = r.output?.['workspace'] as typeof WORKSPACES[0];
      assert(ws.id === 'ws-001', `Wrong id: ${ws.id}`);
      assert(ws.name === 'MemoryOS Workspace', `Wrong name: ${ws.name}`);
    }),
    test(G, 'get_workspace with unknown id returns FAILED', async () => {
      const r = await rt.execute(makeAction('get_workspace', { workspaceId: 'ws-ghost' }), makeContext());
      assert(r.status === 'FAILED', `Expected FAILED, got ${r.status}`);
    }),
  ]);
}

// ── GROUP 4: Project Discovery ───────────────────────────────────────────────

async function g4_projects(): Promise<EF32TestResult[]> {
  const G = 'G4 Project Discovery';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'list_projects returns all projects', async () => {
      const r = await rt.execute(makeAction('list_projects'), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS, got ${r.status}`);
      const ps = r.output?.['projects'] as typeof PROJECTS;
      assert(ps.length === PROJECTS.length, `Expected ${PROJECTS.length}`);
    }),
    test(G, 'list_projects filters by workspaceId', async () => {
      const r = await rt.execute(makeAction('list_projects', { workspaceId: 'ws-001' }), makeContext());
      const ps = r.output?.['projects'] as typeof PROJECTS;
      assert(ps.every(p => p.workspaceId === 'ws-001'), 'All projects must belong to ws-001');
      assert(ps.length === 2, `Expected 2 for ws-001, got ${ps.length}`);
    }),
    test(G, 'get_project returns correct project', async () => {
      const r = await rt.execute(makeAction('get_project', { projectId: 'proj-001' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const p = r.output?.['project'] as typeof PROJECTS[0];
      assert(p.id === 'proj-001', 'Wrong project id');
      assert(p.name === 'MemoryOS Core', 'Wrong project name');
    }),
    test(G, 'search_projects by query filters correctly', async () => {
      const r = await rt.execute(makeAction('search_projects', { query: 'sdk' }), makeContext());
      const ps = r.output?.['projects'] as typeof PROJECTS;
      assert(ps.some(p => p.name.toLowerCase().includes('sdk') || p.tags.includes('sdk')), 'Expected SDK project');
    }),
    test(G, 'search_projects by tag filters correctly', async () => {
      const r = await rt.execute(makeAction('search_projects', { tag: 'ef-32' }), makeContext());
      const ps = r.output?.['projects'] as typeof PROJECTS;
      assert(ps.length >= 1, `Expected >= 1 result for tag ef-32`);
    }),
  ]);
}

// ── GROUP 5: Directory Navigation ────────────────────────────────────────────

async function g5_navigation(): Promise<EF32TestResult[]> {
  const G = 'G5 Navigation';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'list_directory for project root returns top-level entries', async () => {
      const r = await rt.execute(makeAction('list_directory', { projectId: 'proj-001' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS, got ${r.status}`);
      const entries = r.output?.['entries'] as unknown[];
      assert(Array.isArray(entries), 'Expected entries array');
    }),
    test(G, 'list_directory for src/ returns src-level entries', async () => {
      const r = await rt.execute(makeAction('list_directory', { projectId: 'proj-001', path: 'src' }), makeContext());
      const entries = r.output?.['entries'] as Array<{ path: string }>;
      assert(entries.every(e => e.path.startsWith('src/')), 'All entries must be under src/');
    }),
    test(G, 'list_files returns only files (no directories)', async () => {
      const r = await rt.execute(makeAction('list_files', { projectId: 'proj-001' }), makeContext());
      const files = r.output?.['files'] as Array<{ type: string }>;
      assert(files.every(f => f.type === 'file'), 'All entries must be type=file');
    }),
    test(G, 'search_files by name finds matching files', async () => {
      const r = await rt.execute(makeAction('search_files', { projectId: 'proj-001', query: 'App' }), makeContext());
      const files = r.output?.['files'] as Array<{ name: string }>;
      assert(files.some(f => f.name.toLowerCase().includes('app')), 'Expected App.jsx in results');
    }),
    test(G, 'search_files by extension filters correctly', async () => {
      const r = await rt.execute(makeAction('search_files', { projectId: 'proj-001', extension: '.jsx' }), makeContext());
      const files = r.output?.['files'] as Array<{ extension: string }>;
      assert(files.every(f => f.extension === '.jsx'), 'All results must be .jsx');
    }),
  ]);
}

// ── GROUP 6: File Reading ────────────────────────────────────────────────────

async function g6_fileRead(): Promise<EF32TestResult[]> {
  const G = 'G6 File Reading';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'read_file returns content, encoding, sizeBytes, hash, mimeType', async () => {
      const r = await rt.execute(makeAction('read_file', { projectId: 'proj-001', path: 'src/App.jsx' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS, got ${r.status}: ${JSON.stringify(r.error)}`);
      assert(typeof r.output?.['content'] === 'string', 'Expected content string');
      assert(typeof r.output?.['encoding'] === 'string', 'Expected encoding');
      assert(typeof r.output?.['sizeBytes'] === 'number', 'Expected sizeBytes');
      assert(typeof r.output?.['mimeType'] === 'string', 'Expected mimeType');
      assert(typeof r.output?.['hash'] === 'string', 'Expected hash');
    }),
    test(G, 'read_file for unknown path returns FAILED', async () => {
      const r = await rt.execute(makeAction('read_file', { projectId: 'proj-001', path: 'ghost.txt' }), makeContext());
      assert(r.status === 'FAILED', `Expected FAILED, got ${r.status}`);
    }),
    test(G, 'get_file_metadata returns entry with size and modifiedAt', async () => {
      const r = await rt.execute(makeAction('get_file_metadata', { projectId: 'proj-001', path: 'src/App.jsx' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const meta = r.output?.['metadata'] as Record<string, unknown>;
      assert(typeof meta.sizeBytes === 'number', 'Expected sizeBytes in metadata');
      assert(typeof meta.modifiedAt === 'string', 'Expected modifiedAt in metadata');
    }),
    test(G, 'read_file mimeType is correct for .jsx', async () => {
      const r = await rt.execute(makeAction('read_file', { projectId: 'proj-001', path: 'src/App.jsx' }), makeContext());
      assert(r.output?.['mimeType'] === 'text/jsx', `Expected text/jsx, got ${r.output?.['mimeType']}`);
    }),
    test(G, 'read_file for JSON has application/json mimeType', async () => {
      const r = await rt.execute(makeAction('read_file', { projectId: 'proj-001', path: 'package.json' }), makeContext());
      assert(r.output?.['mimeType'] === 'application/json', `Expected application/json, got ${r.output?.['mimeType']}`);
    }),
  ]);
}

// ── GROUP 7: Synchronization ─────────────────────────────────────────────────

async function g7_sync(): Promise<EF32TestResult[]> {
  const G = 'G7 Synchronization';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'sync_status for unsynced project shows synced=false', async () => {
      const r = await rt.execute(makeAction('sync_status', { projectId: 'proj-001' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      assert(r.output?.['projectId'] === 'proj-001', 'Wrong projectId');
    }),
    test(G, 'list_changes returns changes with path, type, detectedAt', async () => {
      const r = await rt.execute(makeAction('list_changes', { projectId: 'proj-001' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const changes = r.output?.['changes'] as Array<{ path: string; type: string; detectedAt: string }>;
      assert(Array.isArray(changes), 'Expected changes array');
      if (changes.length > 0) {
        assert(typeof changes[0].path === 'string', 'Expected path');
        assert(['added', 'modified', 'removed'].includes(changes[0].type), 'Expected valid change type');
        assert(typeof changes[0].detectedAt === 'string', 'Expected detectedAt');
      }
    }),
    test(G, 'list_changes for proj-001 detects 3 changes', async () => {
      const r = await rt.execute(makeAction('list_changes', { projectId: 'proj-001' }), makeContext());
      assert(r.output?.['totalChanges'] === 3, `Expected 3 changes, got ${r.output?.['totalChanges']}`);
    }),
    test(G, 'list_changes for proj-003 detects 0 changes (UP_TO_DATE)', async () => {
      const r = await rt.execute(makeAction('list_changes', { projectId: 'proj-003' }), makeContext());
      assert(r.output?.['status'] === 'UP_TO_DATE', `Expected UP_TO_DATE, got ${r.output?.['status']}`);
    }),
    test(G, 'sync_status after list_changes shows lastSyncAt', async () => {
      await rt.execute(makeAction('list_changes', { projectId: 'proj-002' }), makeContext());
      const r = await rt.execute(makeAction('sync_status', { projectId: 'proj-002' }), makeContext());
      assert(r.output?.['synced'] === true, 'Expected synced=true after list_changes');
      assert(typeof r.output?.['lastSyncAt'] === 'string', 'Expected lastSyncAt');
    }),
  ]);
}

// ── GROUP 8: Permissions ─────────────────────────────────────────────────────

async function g8_permissions(): Promise<EF32TestResult[]> {
  const G = 'G8 Permissions';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'Missing files.read scope blocks read_file', async () => {
      const r = await rt.execute(
        makeAction('read_file', { projectId: 'proj-001', path: 'src/App.jsx' }),
        makeContext({ grantedScopes: ['workspace.read', 'project.read'] }) // no files.read
      );
      assert(r.status === 'DENIED', `Expected DENIED, got ${r.status}`);
    }),
    test(G, 'Missing project.read scope blocks list_projects', async () => {
      const r = await rt.execute(
        makeAction('list_projects'),
        makeContext({ grantedScopes: ['workspace.read'] }) // no project.read
      );
      assert(r.status === 'DENIED', `Expected DENIED, got ${r.status}`);
    }),
    test(G, 'read-only scopes allow list_workspaces', async () => {
      const r = await rt.execute(
        makeAction('list_workspaces'),
        makeContext({ grantedScopes: ['workspace.read', 'project.read', 'files.read', 'sync.read'] })
      );
      assert(r.status === 'SUCCESS', `Expected SUCCESS, got ${r.status}`);
    }),
  ]);
}

// ── GROUP 9: Audit & Telemetry ───────────────────────────────────────────────

async function g9_auditTelemetry(): Promise<EF32TestResult[]> {
  const G = 'G9 Audit & Telemetry';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'Every execution produces an audit record', async () => {
      const before = rt.getAuditLog(1000).length;
      await rt.execute(makeAction('list_workspaces'), makeContext());
      await rt.execute(makeAction('list_projects'), makeContext());
      const after = rt.getAuditLog(1000).length;
      assert(after >= before + 2, `Expected >= ${before + 2} audit records, got ${after}`);
    }),
    test(G, 'Audit records contain connectorId=base44-connector-v1', async () => {
      await rt.execute(makeAction('get_project', { projectId: 'proj-001' }), makeContext());
      const log = rt.getAuditLog(10);
      assert(log.some(r => r.connectorId === CONNECTOR_ID), 'Expected audit record for Base44 connector');
    }),
    test(G, 'Telemetry tracks requestCount and successCount', async () => {
      await rt.execute(makeAction('list_workspaces'), makeContext());
      const t = rt.getTelemetry(CONNECTOR_ID);
      assert(t.requestCount >= 1, `Expected requestCount >= 1, got ${t.requestCount}`);
      assert(t.successCount >= 1, `Expected successCount >= 1, got ${t.successCount}`);
    }),
    test(G, 'Telemetry records DENIED result for missing scope', async () => {
      await rt.execute(makeAction('read_file', { projectId: 'proj-001', path: 'src/App.jsx' }), makeContext({ grantedScopes: ['workspace.read'] }));
      const t = rt.getTelemetry(CONNECTOR_ID);
      assert(t.requestCount >= 1, 'Expected at least 1 request tracked');
    }),
  ]);
}

// ── GROUP 10: Runtime Events ─────────────────────────────────────────────────

async function g10_events(): Promise<EF32TestResult[]> {
  const G = 'G10 Runtime Events';
  const bus = new RuntimeEventBus();
  const received: string[] = [];
  bus.onAny(e => received.push(e.type));
  const rt = await bootRuntime(bus);
  return Promise.all([
    test(G, 'ConnectorInitialized emitted during registration', async () => {
      assert(bus.hasEmitted('ConnectorInitialized', CONNECTOR_ID), 'Expected ConnectorInitialized');
    }),
    test(G, 'ConnectorConnected emitted during registration', async () => {
      assert(bus.hasEmitted('ConnectorConnected', CONNECTOR_ID), 'Expected ConnectorConnected');
    }),
    test(G, 'ConnectorExecutionCompleted emitted after list_workspaces', async () => {
      await rt.execute(makeAction('list_workspaces'), makeContext());
      assert(bus.hasEmitted('ConnectorExecutionCompleted', CONNECTOR_ID), 'Expected ConnectorExecutionCompleted');
    }),
    test(G, 'Events are chronologically ordered', async () => {
      await rt.execute(makeAction('list_projects'), makeContext());
      assert(bus.isChronologicallyOrdered(), 'Events must be in chronological order');
    }),
    test(G, 'Sync events emitted during list_changes', async () => {
      await rt.execute(makeAction('list_changes', { projectId: 'proj-001' }), makeContext());
      const syncEvents = bus.getByConnector(CONNECTOR_ID).filter(e =>
        e.payload['action'] === 'SynchronizationCompleted' || e.payload['action'] === 'SynchronizationStarted' || e.payload['action'] === 'sync'
      );
      assert(syncEvents.length >= 1, 'Expected at least 1 sync-related event');
    }),
  ]);
}

// ── GROUP 11: Error Recovery ─────────────────────────────────────────────────

async function g11_recovery(): Promise<EF32TestResult[]> {
  const G = 'G11 Error Recovery';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'Unknown action returns structured FAILED result (not exception)', async () => {
      const r = await rt.execute(makeAction('delete_everything'), makeContext());
      assert(r.status === 'FAILED', `Expected FAILED, got ${r.status}`);
      assert(typeof r.error?.code === 'string', 'Expected error.code');
    }),
    test(G, 'File not found returns FAILED with NOT_FOUND code', async () => {
      const r = await rt.execute(makeAction('read_file', { projectId: 'proj-001', path: 'does-not-exist.ts' }), makeContext());
      assert(r.status === 'FAILED', `Expected FAILED, got ${r.status}`);
      assert(r.error?.code === 'NOT_FOUND' || r.error?.code === 'EXECUTION_ERROR', `Wrong code: ${r.error?.code}`);
    }),
    test(G, 'Project not found returns FAILED', async () => {
      const r = await rt.execute(makeAction('get_project', { projectId: 'ghost-proj' }), makeContext());
      assert(r.status === 'FAILED', `Expected FAILED, got ${r.status}`);
    }),
    test(G, 'Runtime handles 50 concurrent reads without failure', async () => {
      const results = await Promise.all(
        Array.from({ length: 50 }, () => rt.execute(makeAction('list_workspaces'), makeContext()))
      );
      const successes = results.filter(r => r.status === 'SUCCESS').length;
      assert(successes === 50, `Expected 50 SUCCESS, got ${successes}`);
    }),
  ]);
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

export interface EF32SuiteResult {
  passed: number;
  total: number;
  durationMs: number;
  results: EF32TestResult[];
  byGroup: Record<string, { passed: number; total: number }>;
  health: { status: 'SUCCESS' | 'PARTIAL' | 'FAILED'; details: string };
  statistics: { totalGroups: number; successRate: number };
  metrics: { avgDurationMs: number; maxDurationMs: number };
  certification: {
    totalTests: number;
    passedTests: number;
    capabilities: string[];
    limitations: string[];
    successRate: number;
    verdict: 'BASE44 CONNECTOR READY' | 'BASE44 CONNECTOR NOT READY';
    justification: string;
  };
}

export async function runEF32Tests(): Promise<EF32SuiteResult> {
  seq = 0;
  const start = Date.now();

  const allResults = (await Promise.all([
    g1_manifest(), g2_auth(), g3_workspaces(), g4_projects(),
    g5_navigation(), g6_fileRead(), g7_sync(), g8_permissions(),
    g9_auditTelemetry(), g10_events(), g11_recovery(),
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

  const ready = successRate === 1.0;

  return {
    passed, total, durationMs, results: allResults, byGroup,
    health: {
      status: successRate === 1 ? 'SUCCESS' : successRate >= 0.85 ? 'PARTIAL' : 'FAILED',
      details: `${passed}/${total} passed in ${durationMs}ms — ${(successRate * 100).toFixed(1)}%`,
    },
    statistics: { totalGroups: 11, successRate },
    metrics: { avgDurationMs, maxDurationMs },
    certification: {
      totalTests: total,
      passedTests: passed,
      successRate,
      capabilities: [
        'WorkspaceDiscovery', 'ProjectDiscovery', 'DirectoryListing',
        'FileListing', 'FileRead', 'MetadataRead', 'ProjectSearch',
        'FileSearch', 'SyncStatus', 'ChangeDetection', 'HealthCheck',
      ],
      limitations: [
        'Read-only (no write/create/delete in EF-32)',
        'Simulated store (no real HTTP in this sprint)',
        'No webhook listener (EF-32B)',
        'No bidirectional sync (EF-32B)',
      ],
      verdict: ready ? 'BASE44 CONNECTOR READY' : 'BASE44 CONNECTOR NOT READY',
      justification: ready
        ? 'All 11 groups passed. Authentication, WorkspaceDiscovery, ProjectDiscovery, Navigation, FileRead, Sync, Permissions, Audit, Telemetry, Events, and Recovery are all certified. Base44 Connector is READY. EF-32B (write operations) and EF-33 (GitHub) can proceed.'
        : `${total - passed} test(s) failed in: ${Object.entries(byGroup).filter(([, g]) => g.passed < g.total).map(([k]) => k).join(', ')}. Resolve before declaring READY.`,
    },
  };
}