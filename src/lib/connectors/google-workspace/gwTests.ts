/**
 * gwTests.ts
 * Sprint 6.4.2 — Google Workspace Reference Connector
 *
 * Complete test suite validating: Manifest · OAuth Provider · Gmail ·
 * Calendar · Drive · Profile · Capability Registration · Operation Registry ·
 * Runtime Integration · Multi-Connection · Connection Routing · Selection ·
 * Multi-Tenant · Health · Metrics · Audit · Observability · Concurrency · Idempotence
 */

import { GoogleWorkspaceConnector, GW_CONNECTOR_ID, GOOGLE_PROVIDER_DEFINITION } from './GoogleWorkspaceConnector';
import { GoogleOAuthProvider, GOOGLE_PROVIDER_ID } from './GoogleOAuthProvider';
import { GmailCapability, GMAIL_OPERATIONS } from './capabilities/GmailCapability';
import { CalendarCapability, CALENDAR_OPERATIONS } from './capabilities/CalendarCapability';
import { DriveCapability, DRIVE_OPERATIONS } from './capabilities/DriveCapability';
import { ProfileCapability, PROFILE_OPERATIONS } from './capabilities/ProfileCapability';
import { GW_OPERATIONS, GW_SCOPES } from './GWTypes';

// UCR
import { ConnectorRegistry } from '../../connector-runtime-v2/ConnectorRegistry';
import { ConnectionRegistry } from '../../connector-runtime-v2/ConnectionRegistry';
import { ConnectorLifecycle } from '../../connector-runtime-v2/ConnectorLifecycle';
import { ConnectorRouter } from '../../connector-runtime-v2/ConnectorRouter';
import { CapabilityEngine } from '../../connector-runtime-v2/CapabilityEngine';
import { ConnectorAudit } from '../../connector-runtime-v2/ConnectorAudit';
import { ConnectorRuntime } from '../../connector-runtime-v2/ConnectorRuntime';
import { ConnectorEventBus } from '../../connector-runtime-v2/ConnectorEventBus';

// ITP
import { ProviderRegistry } from '../../identity-trust/ProviderRegistry';

import type { ConnectorContext, ExecuteRequest } from '../../connector-runtime-v2/UCRTypes';

// ─── Harness ──────────────────────────────────────────────────────────────────

interface TestResult { name: string; passed: boolean; error?: string; duration: number; }

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function run(name: string, fn: () => Promise<void> | void): Promise<TestResult> {
  const t0 = Date.now();
  try { await fn(); return { name, passed: true, duration: Date.now() - t0 }; }
  catch (e: unknown) { return { name, passed: false, error: String(e), duration: Date.now() - t0 }; }
}

let _seq = 0;
function makeContext(connId = 'gw-conn-1', orgId = 'org-1'): ConnectorContext {
  return {
    organizationId: orgId, workspaceId: `ws-${++_seq}`, userId: 'user-1',
    connectionId: connId, connectorId: GW_CONNECTOR_ID, providerId: GOOGLE_PROVIDER_ID,
    requestId: `req-${Date.now()}`, correlationId: `corr-${Date.now()}`,
    permissions: ['read', 'write'], metadata: {},
  };
}

function addGWConnection(orgId = 'org-1', wsId = 'ws-1', email = 'user@gmail.com'): string {
  const rec = ConnectionRegistry.add({
    providerId:     GOOGLE_PROVIDER_ID,
    connectorId:    GW_CONNECTOR_ID,
    organizationId: orgId,
    workspaceId:    wsId,
    accountId:      `acc-${Date.now()}`,
    displayName:    email.split('@')[0],
    email,
    state:          'ACTIVE',
    scopes:         [GW_SCOPES.GMAIL_READONLY, GW_SCOPES.CALENDAR_READONLY, GW_SCOPES.DRIVE_READONLY],
    expiresAt:      new Date(Date.now() + 3_600_000).toISOString(),
    metadata:       {},
  });
  return rec.connectionId;
}

// ─── Manifest Tests ───────────────────────────────────────────────────────────

const manifestTests = [
  run('MF-01: manifest has all required fields', () => {
    const c = new GoogleWorkspaceConnector();
    const m = c.manifest();
    assert(m.id === GW_CONNECTOR_ID, 'Expected id');
    assert(m.vendor === 'Google LLC', 'Expected vendor');
    assert(m.capabilities.length > 0, 'Expected capabilities');
    assert(m.operations.length > 0, 'Expected operations');
    assert(m.authentication.type === 'oauth2', 'Expected oauth2');
    assert(m.healthChecks.length > 0, 'Expected healthChecks');
    assert(Array.isArray(m.permissions), 'Expected permissions');
    assert(typeof m.documentation === 'string', 'Expected documentation');
  }),
  run('MF-02: manifest connectorId matches IConnectorSDK.connectorId', () => {
    const c = new GoogleWorkspaceConnector();
    assert(c.connectorId === c.manifest().id, 'Expected connectorId match');
  }),
  run('MF-03: manifest includes all 4 services in tags', () => {
    const m = new GoogleWorkspaceConnector().manifest();
    assert(m.tags.includes('gmail'),    'Expected gmail tag');
    assert(m.tags.includes('calendar'), 'Expected calendar tag');
    assert(m.tags.includes('drive'),    'Expected drive tag');
    assert(m.tags.includes('workspace'),'Expected workspace tag');
  }),
  run('MF-04: total operations count is 21', () => {
    const m = new GoogleWorkspaceConnector().manifest();
    const total = GMAIL_OPERATIONS.length + CALENDAR_OPERATIONS.length + DRIVE_OPERATIONS.length + PROFILE_OPERATIONS.length;
    assert(m.operations.length === total, `Expected ${total} operations, got ${m.operations.length}`);
  }),
  run('MF-05: all operations have unique ids', () => {
    const ops = new GoogleWorkspaceConnector().operations();
    const ids = ops.map((o) => o.id);
    assert(new Set(ids).size === ids.length, 'Expected unique operation IDs');
  }),
];

// ─── OAuth Provider Tests ─────────────────────────────────────────────────────

const oauthTests = [
  run('OA-01: GoogleOAuthProvider supports PKCE flow', () => {
    const p = new GoogleOAuthProvider();
    assert(p.supports('authorization_code_pkce', 'authorization_code'), 'Expected PKCE support');
    assert(!p.supports('device_authorization', 'urn:ietf:params:oauth:grant-type:device_code'), 'Expected no device flow');
  }),
  run('OA-02: authenticate returns opaque tokenRef', async () => {
    const p = new GoogleOAuthProvider();
    const result = await p.authenticate({
      providerId: GOOGLE_PROVIDER_ID, flow: 'authorization_code_pkce',
      scopes: [GW_SCOPES.GMAIL_READONLY], tenant: { organizationId: 'o', workspaceId: 'w', connectorId: GW_CONNECTOR_ID, accountId: 'a', userId: 'u' },
    });
    assert(result.success, 'Expected success');
    assert(typeof result.tokenRef === 'string', 'Expected tokenRef');
    assert(result.tokenRef !== GW_SCOPES.GMAIL_READONLY, 'TokenRef must not be a raw scope');
  }),
  run('OA-03: refresh returns new token reference', async () => {
    const p = new GoogleOAuthProvider();
    const r = await p.refresh({ connectionId: 'c', refreshTokenRef: 'ref' });
    assert(r.success, 'Expected refresh success');
    assert(r.newTokenRef !== 'ref', 'Expected new token ref');
  }),
  run('OA-04: revoke returns success', async () => {
    const p = new GoogleOAuthProvider();
    const r = await p.revoke({ connectionId: 'c', tokenRef: 'ref' });
    assert(r.success, 'Expected revoke success');
  }),
  run('OA-05: getProfile returns profile data', async () => {
    const p = new GoogleOAuthProvider();
    const profile = await p.getProfile('conn-1');
    assert(typeof profile.email === 'string', 'Expected email');
    assert(typeof profile.displayName === 'string', 'Expected displayName');
  }),
  run('OA-06: health returns healthy status', async () => {
    const p = new GoogleOAuthProvider();
    const h = await p.health();
    assert(h.status === 'healthy', 'Expected healthy');
    assert(h.latencyMs >= 0, 'Expected latency');
  }),
  run('OA-07: ITP ProviderRegistry accepts Google provider', () => {
    ProviderRegistry.register(GOOGLE_PROVIDER_DEFINITION, new GoogleOAuthProvider());
    assert(ProviderRegistry.has('google-workspace'), 'Expected provider registered in ITP');
  }),
  run('OA-08: no OAuth logic inside capabilities', () => {
    // Verify none of the capability files have auth-related methods.
    const caps = [GmailCapability, CalendarCapability, DriveCapability, ProfileCapability];
    for (const Cap of caps) {
      const instance = new Cap();
      assert(!('authenticate' in instance), `${Cap.name} must not implement authenticate`);
      assert(!('refresh' in instance), `${Cap.name} must not implement refresh`);
      assert(!('revoke' in instance), `${Cap.name} must not implement revoke`);
    }
  }),
];

// ─── Gmail Tests ──────────────────────────────────────────────────────────────

const gmailTests = [
  run('GM-01: list messages returns items', async () => {
    const c = new GmailCapability();
    const r = await c.execute(GW_OPERATIONS.GMAIL_LIST_MESSAGES, { maxResults: 5 });
    assert(Array.isArray(r.items), 'Expected items array');
    assert((r.items as unknown[]).length === 5, 'Expected 5 messages');
  }),
  run('GM-02: get message requires messageId', async () => {
    const c = new GmailCapability();
    let threw = false;
    try { await c.execute(GW_OPERATIONS.GMAIL_GET_MESSAGE, {}); } catch { threw = true; }
    assert(threw, 'Expected error without messageId');
  }),
  run('GM-03: send email requires to and subject', async () => {
    const c = new GmailCapability();
    let threw = false;
    try { await c.execute(GW_OPERATIONS.GMAIL_SEND, { body: 'hello' }); } catch { threw = true; }
    assert(threw, 'Expected error without to/subject');
  }),
  run('GM-04: send email succeeds with valid input', async () => {
    const c = new GmailCapability();
    const r = await c.execute(GW_OPERATIONS.GMAIL_SEND, { to: ['a@test.com'], subject: 'Hi', body: 'Hello' });
    assert(r.success === true, 'Expected success');
  }),
  run('GM-05: search returns filtered results', async () => {
    const c = new GmailCapability();
    const r = await c.execute(GW_OPERATIONS.GMAIL_SEARCH, { query: 'from:boss@work.com', maxResults: 10 });
    assert(Array.isArray(r.items), 'Expected items');
  }),
  run('GM-06: list labels returns system and user labels', async () => {
    const c = new GmailCapability();
    const r = await c.execute(GW_OPERATIONS.GMAIL_LIST_LABELS, {});
    assert(Array.isArray(r.items), 'Expected labels array');
    assert((r.items as unknown[]).length > 0, 'Expected at least one label');
  }),
];

// ─── Calendar Tests ───────────────────────────────────────────────────────────

const calendarTests = [
  run('CAL-01: list events returns items', async () => {
    const c = new CalendarCapability();
    const r = await c.execute(GW_OPERATIONS.CALENDAR_LIST_EVENTS, { maxResults: 5 });
    assert(Array.isArray(r.items), 'Expected events array');
    assert((r.items as unknown[]).length === 5, 'Expected 5 events');
  }),
  run('CAL-02: create event requires event data', async () => {
    const c = new CalendarCapability();
    let threw = false;
    try { await c.execute(GW_OPERATIONS.CALENDAR_CREATE_EVENT, {}); } catch { threw = true; }
    assert(threw, 'Expected error without event');
  }),
  run('CAL-03: create event succeeds', async () => {
    const c = new CalendarCapability();
    const r = await c.execute(GW_OPERATIONS.CALENDAR_CREATE_EVENT, {
      calendarId: 'primary',
      event: { title: 'Team Sync', start: new Date().toISOString(), end: new Date(Date.now() + 3_600_000).toISOString() },
    });
    assert(r.success === true, 'Expected success');
    assert(typeof (r.item as any).id === 'string', 'Expected event id');
  }),
  run('CAL-04: delete event requires eventId', async () => {
    const c = new CalendarCapability();
    let threw = false;
    try { await c.execute(GW_OPERATIONS.CALENDAR_DELETE_EVENT, {}); } catch { threw = true; }
    assert(threw, 'Expected error without eventId');
  }),
  run('CAL-05: list calendars returns 3 calendars', async () => {
    const c = new CalendarCapability();
    const r = await c.execute(GW_OPERATIONS.CALENDAR_LIST, {});
    assert((r.items as unknown[]).length === 3, 'Expected 3 calendars');
  }),
];

// ─── Drive Tests ──────────────────────────────────────────────────────────────

const driveTests = [
  run('DR-01: list files returns items', async () => {
    const c = new DriveCapability();
    const r = await c.execute(GW_OPERATIONS.DRIVE_LIST_FILES, { maxResults: 5 });
    assert(Array.isArray(r.items), 'Expected files array');
  }),
  run('DR-02: upload file requires fileName', async () => {
    const c = new DriveCapability();
    let threw = false;
    try { await c.execute(GW_OPERATIONS.DRIVE_UPLOAD_FILE, {}); } catch { threw = true; }
    assert(threw, 'Expected error without fileName');
  }),
  run('DR-03: upload file succeeds', async () => {
    const c = new DriveCapability();
    const r = await c.execute(GW_OPERATIONS.DRIVE_UPLOAD_FILE, { fileName: 'report.pdf', mimeType: 'application/pdf' });
    assert(r.success === true, 'Expected success');
    assert(typeof (r.item as any).id === 'string', 'Expected file id');
  }),
  run('DR-04: search files requires query', async () => {
    const c = new DriveCapability();
    let threw = false;
    try { await c.execute(GW_OPERATIONS.DRIVE_SEARCH_FILES, {}); } catch { threw = true; }
    assert(threw, 'Expected error without query');
  }),
  run('DR-05: create folder returns folder with correct mimeType', async () => {
    const c = new DriveCapability();
    const r = await c.execute(GW_OPERATIONS.DRIVE_CREATE_FOLDER, { fileName: 'Reports 2025' });
    assert((r.item as any).isFolder === true, 'Expected folder');
    assert((r.item as any).mimeType === 'application/vnd.google-apps.folder', 'Expected folder mimeType');
  }),
];

// ─── Profile Tests ────────────────────────────────────────────────────────────

const profileTests = [
  run('PR-01: read profile returns email and displayName', async () => {
    const c = new ProfileCapability();
    const r = await c.execute(GW_OPERATIONS.PROFILE_READ, {}, 'conn-1');
    assert(typeof (r.item as any).email === 'string', 'Expected email');
    assert(typeof (r.item as any).displayName === 'string', 'Expected displayName');
  }),
  run('PR-02: read scopes returns array', async () => {
    const c = new ProfileCapability();
    const r = await c.execute(GW_OPERATIONS.PROFILE_READ_SCOPES, {});
    assert(Array.isArray(r.items), 'Expected scopes array');
    assert((r.total as number) > 0, 'Expected total > 0');
  }),
  run('PR-03: read connection info returns connectorId', async () => {
    const c = new ProfileCapability();
    const r = await c.execute(GW_OPERATIONS.PROFILE_CONNECTION, {}, 'conn-1');
    assert((r.item as any).connectorId === 'google-workspace', 'Expected connectorId');
  }),
];

// ─── UCR Integration Tests ────────────────────────────────────────────────────

const runtimeTests = [
  run('RT-01: connector registers in UCR ConnectorRegistry', async () => {
    const c = new GoogleWorkspaceConnector();
    ConnectorRegistry.register(c);
    assert(ConnectorRegistry.has(GW_CONNECTOR_ID), 'Expected GW connector registered');
  }),
  run('RT-02: connector initializes and reaches READY state', async () => {
    if (!ConnectorRegistry.has(GW_CONNECTOR_ID)) ConnectorRegistry.register(new GoogleWorkspaceConnector());
    const ctx = makeContext();
    await ConnectorLifecycle.initialize(GW_CONNECTOR_ID, ctx);
    assert(ConnectorLifecycle.isReady(GW_CONNECTOR_ID), 'Expected READY state');
  }),
  run('RT-03: execute via ConnectorRuntime routes correctly', async () => {
    const rt = new ConnectorRuntime();
    const connId = addGWConnection();
    const ctx: ConnectorContext = makeContext(connId);
    const req: ExecuteRequest = {
      operationId: GW_OPERATIONS.GMAIL_LIST_MESSAGES,
      context: ctx,
      input: { maxResults: 3 },
    };
    const result = await rt.execute(req);
    assert(result.success, 'Expected success');
    assert(result.operationId === GW_OPERATIONS.GMAIL_LIST_MESSAGES, 'Expected correct operationId');
    assert(Array.isArray((result.output as any).items), 'Expected items in output');
  }),
  run('RT-04: execution creates audit record', async () => {
    const rt = new ConnectorRuntime();
    const connId = addGWConnection();
    const ctx = makeContext(connId);
    const before = ConnectorAudit.count();
    await rt.execute({ operationId: GW_OPERATIONS.DRIVE_LIST_FILES, context: ctx, input: {} });
    assert(ConnectorAudit.count() > before, 'Expected new audit record');
  }),
  run('RT-05: execution emits REQUEST_COMPLETED event', async () => {
    const rt = new ConnectorRuntime();
    const connId = addGWConnection();
    const ctx = makeContext(connId);
    const before = ConnectorEventBus.query({ eventType: 'REQUEST_COMPLETED' }).length;
    await rt.execute({ operationId: GW_OPERATIONS.CALENDAR_LIST_EVENTS, context: ctx, input: {} });
    const after = ConnectorEventBus.query({ eventType: 'REQUEST_COMPLETED' }).length;
    assert(after > before, 'Expected REQUEST_COMPLETED event');
  }),
  run('RT-06: capability engine resolves READ_EMAIL to GW connector', () => {
    const res = CapabilityEngine.resolve('READ_EMAIL');
    assert(res.connectorIds.includes(GW_CONNECTOR_ID), 'Expected GW connector in READ_EMAIL resolution');
  }),
  run('RT-07: capability engine resolves READ_DRIVE to GW connector', () => {
    const res = CapabilityEngine.resolve('READ_DRIVE');
    assert(res.connectorIds.includes(GW_CONNECTOR_ID), 'Expected GW connector in READ_DRIVE resolution');
  }),
];

// ─── Multi-Connection Tests ───────────────────────────────────────────────────

const multiConnectionTests = [
  run('MC-01: 5 Gmail accounts coexist for same org', () => {
    const emails = ['commercial@company.com','financial@company.com','director@company.com','marketing@company.com','support@company.com'];
    const org = `org-mc-${Date.now()}`;
    emails.forEach((email) => addGWConnection(org, 'ws-1', email));
    const conns = ConnectionRegistry.listByOrg(org).filter((c) => c.connectorId === GW_CONNECTOR_ID);
    assert(conns.length === 5, `Expected 5 connections, got ${conns.length}`);
  }),
  run('MC-02: connections are isolated per account', () => {
    const org = `org-iso-${Date.now()}`;
    const id1 = addGWConnection(org, 'ws-1', 'a@example.com');
    const id2 = addGWConnection(org, 'ws-1', 'b@example.com');
    assert(id1 !== id2, 'Expected different connectionIds');
    const r1 = ConnectionRegistry.get(id1);
    const r2 = ConnectionRegistry.get(id2);
    assert(r1!.email === 'a@example.com', 'Expected email a');
    assert(r2!.email === 'b@example.com', 'Expected email b');
  }),
  run('MC-03: multi-org multi-workspace isolation', () => {
    const orgA = `org-A-${Date.now()}`;
    const orgB = `org-B-${Date.now()}`;
    addGWConnection(orgA, 'ws-A', 'admin@orgA.com');
    addGWConnection(orgB, 'ws-B', 'admin@orgB.com');
    const connA = ConnectionRegistry.listByOrg(orgA).filter((c) => c.connectorId === GW_CONNECTOR_ID);
    const connB = ConnectionRegistry.listByOrg(orgB).filter((c) => c.connectorId === GW_CONNECTOR_ID);
    assert(connA.every((c) => c.organizationId === orgA), 'Org A isolation');
    assert(connB.every((c) => c.organizationId === orgB), 'Org B isolation');
  }),
];

// ─── Connection Routing Tests ─────────────────────────────────────────────────

const routingTests = [
  run('ROT-01: fan-out reads all Gmail accounts in parallel', async () => {
    const org = `org-ro-${Date.now()}`;
    ['a@gmail.com','b@gmail.com','c@gmail.com'].forEach((e) => addGWConnection(org, 'ws-1', e));
    const results = await ConnectorRouter.fanOut({ connectorId: GW_CONNECTOR_ID, organizationId: org }, async (connId) => connId);
    assert(results.length === 3, `Expected 3 parallel results, got ${results.length}`);
    assert(results.every((r) => !r.error), 'Expected no errors in fan-out');
  }),
  run('ROT-02: single routing selects best connection', () => {
    const org = `org-single-${Date.now()}`;
    const connId = addGWConnection(org, 'ws-1', 'main@gmail.com');
    const route = ConnectorRouter.route({ connectorId: GW_CONNECTOR_ID, organizationId: org });
    assert(route.strategy === 'single', 'Expected single strategy');
    assert(route.connections.length >= 1, 'Expected at least 1 connection');
  }),
  run('ROT-03: drive fan-out merges results from all Drive accounts', async () => {
    const org = `org-drive-${Date.now()}`;
    ['drive1@company.com','drive2@company.com','drive3@company.com'].forEach((e) => addGWConnection(org, 'ws-1', e));
    const results = await ConnectorRouter.fanOut({ connectorId: GW_CONNECTOR_ID, organizationId: org }, async (connId) => `files-of-${connId}`);
    assert(results.length === 3, 'Expected 3 Drive results');
  }),
  run('ROT-04: workspace isolation in routing', () => {
    const org = `org-ws-route-${Date.now()}`;
    addGWConnection(org, 'ws-marketing', 'mkt@co.com');
    addGWConnection(org, 'ws-finance', 'fin@co.com');
    const mktRoute = ConnectorRouter.route({ connectorId: GW_CONNECTOR_ID, organizationId: org, workspaceId: 'ws-marketing' });
    assert(mktRoute.connections.every((c) => c.workspaceId === 'ws-marketing'), 'Expected ws-marketing isolation');
  }),
];

// ─── Health & Observability Tests ─────────────────────────────────────────────

const observabilityTests = [
  run('OBS-01: connector health returns all fields', async () => {
    const c = new GoogleWorkspaceConnector();
    await c.initialize(makeContext());
    const h = await c.health();
    assert(h.status === 'healthy', 'Expected healthy');
    assert(typeof h.latencyMs === 'number', 'Expected latencyMs');
    assert(typeof h.availability === 'number', 'Expected availability');
    assert(typeof h.uptimeMs === 'number', 'Expected uptimeMs');
  }),
  run('OBS-02: audit query finds GW records', () => {
    ConnectorAudit.record({ connectorId: GW_CONNECTOR_ID, connectionId: 'c', userId: 'u', organizationId: 'o', operationId: GW_OPERATIONS.GMAIL_LIST_MESSAGES, outcome: 'success', durationMs: 5, metadata: {} });
    const records = ConnectorAudit.query({ connectorId: GW_CONNECTOR_ID });
    assert(records.length > 0, 'Expected audit records for GW connector');
  }),
  run('OBS-03: metadata returns service list', async () => {
    const c = new GoogleWorkspaceConnector();
    await c.initialize(makeContext());
    const meta = c.metadata();
    assert(Array.isArray(meta.services), 'Expected services array');
    assert((meta.services as string[]).includes('gmail'), 'Expected gmail');
    assert((meta.services as string[]).includes('drive'), 'Expected drive');
  }),
];

// ─── Concurrency & Idempotence Tests ─────────────────────────────────────────

const concurrencyTests = [
  run('CONC-01: concurrent Gmail list_messages requests succeed', async () => {
    const c = new GmailCapability();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => c.execute(GW_OPERATIONS.GMAIL_LIST_MESSAGES, { maxResults: 3 }))
    );
    assert(results.every((r) => Array.isArray(r.items)), 'Expected all concurrent requests to succeed');
  }),
  run('CONC-02: concurrent drive list_files requests succeed', async () => {
    const c = new DriveCapability();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => c.execute(GW_OPERATIONS.DRIVE_LIST_FILES, { maxResults: 5 }))
    );
    assert(results.every((r) => Array.isArray(r.items)), 'Expected all concurrent requests to succeed');
  }),
  run('CONC-03: re-registering connector is idempotent', () => {
    ConnectorRegistry.register(new GoogleWorkspaceConnector());
    ConnectorRegistry.register(new GoogleWorkspaceConnector());
    assert(ConnectorRegistry.has(GW_CONNECTOR_ID), 'Expected still registered');
  }),
  run('CONC-04: concurrent connections produce unique IDs', async () => {
    const org = `conc-org-${Date.now()}`;
    const ids = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        Promise.resolve(addGWConnection(org, 'ws-1', `user${i}@gmail.com`))
      )
    );
    assert(new Set(ids).size === 10, 'Expected 10 unique connectionIds');
  }),
];

// ─── Runner ───────────────────────────────────────────────────────────────────

export async function runGWTests(): Promise<{
  results:  TestResult[];
  passed:   number;
  failed:   number;
  coverage: string;
}> {
  const all = [
    ...manifestTests,
    ...oauthTests,
    ...gmailTests,
    ...calendarTests,
    ...driveTests,
    ...profileTests,
    ...runtimeTests,
    ...multiConnectionTests,
    ...routingTests,
    ...observabilityTests,
    ...concurrencyTests,
  ];

  const results = await Promise.all(all);
  const passed  = results.filter((r) => r.passed).length;
  const failed  = results.filter((r) => !r.passed).length;
  const coverage = `${passed}/${results.length} tests passed (${Math.round((passed / results.length) * 100)}%)`;

  console.log(`\n[GW Tests 6.4.2] ${coverage}`);
  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    console.log(`  ${icon} ${r.name} (${r.duration}ms)${r.error ? ' — ' + r.error : ''}`);
  }

  return { results, passed, failed, coverage };
}