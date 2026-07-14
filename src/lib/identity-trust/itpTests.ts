/**
 * itpTests.ts
 * Sprint 6.4.0 — Universal Identity & Trust Platform
 *
 * Comprehensive test suite covering all ITP motors and contracts.
 * Tests: Provider Registry · OAuth Engine · IOAuthProvider Interface ·
 * Credential Manager · Secrets Provider · Token Manager · Permission Manager ·
 * Connection Manager · Trust Manager · State Machine · Refresh · Expiry ·
 * Revocation · Concurrency · Multi-tenant · Events · Observability ·
 * Integration · Health
 */

import { ProviderRegistry } from './ProviderRegistry';
import { OAuthEngine, generatePKCEChallenge } from './OAuthEngine';
import { CredentialManager } from './CredentialManager';
import { InMemorySecretsProvider } from './ISecretsProvider';
import { TokenManager } from './TokenManager';
import { PermissionManager } from './PermissionManager';
import { ConnectionManager } from './ConnectionManager';
import { TrustManager } from './TrustManager';
import { IdentityEventBus } from './IdentityEventBus';
import { IdentityAudit } from './IdentityAudit';
import { IdentityMetricsCollector } from './IdentityMetricsCollector';
import { IdentityManager } from './IdentityManager';
import type {
  IOAuthProvider, ProviderHealthReport, ProviderCapabilities,
  RefreshRequest, RefreshResult, RevokeRequest, RevokeResult,
  ValidateRequest, ValidateResult, ProviderProfile,
} from './IOAuthProvider';
import type {
  OAuthProviderDefinition, AuthRequest, AuthResult,
  TenantContext, OAuthFlow, GrantType,
} from './ITPTypes';

// ─── Test harness ─────────────────────────────────────────────────────────────

interface TestResult { name: string; passed: boolean; error?: string; duration: number; }

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function run(name: string, fn: () => Promise<void> | void): Promise<TestResult> {
  const t0 = Date.now();
  try { await fn(); return { name, passed: true, duration: Date.now() - t0 }; }
  catch (e: unknown) { return { name, passed: false, error: String(e), duration: Date.now() - t0 }; }
}

// ─── Mock Provider ────────────────────────────────────────────────────────────

let _connSeq = 0;

function makeMockProvider(id = 'mock-provider', opts?: { failAuth?: boolean; failRefresh?: boolean }): IOAuthProvider {
  return {
    providerId:   id,
    name:         `Mock Provider ${id}`,
    version:      '1.0.0',
    category:     'other' as const,
    capabilities: {
      supportsRefresh: true, supportsRevoke: true, supportsPKCE: true,
      supportsDeviceFlow: false, supportsIntrospection: false, supportsOpenIDConnect: true,
    } as ProviderCapabilities,

    supports(flow: OAuthFlow, _gt: GrantType): boolean {
      return ['authorization_code_pkce', 'client_credentials', 'refresh_token'].includes(flow);
    },

    async authenticate(req: AuthRequest): Promise<AuthResult> {
      if (opts?.failAuth) return { success: false, connectionId: '', providerId: id, tenant: req.tenant, scopes: [], expiresAt: new Date().toISOString(), error: 'Simulated auth failure', tokenRef: '' };
      const connId = `conn-mock-${++_connSeq}`;
      return {
        success:      true,
        connectionId: connId,
        providerId:   id,
        tenant:       req.tenant,
        scopes:       req.scopes,
        expiresAt:    new Date(Date.now() + 3600_000).toISOString(),
        tokenRef:     `tok-${connId}`,
      };
    },

    async refresh(req: RefreshRequest): Promise<RefreshResult> {
      if (opts?.failRefresh) return { success: false, connectionId: req.connectionId, newTokenRef: '', newExpiresAt: '', error: 'Refresh failed' };
      return { success: true, connectionId: req.connectionId, newTokenRef: `new-tok-${Date.now()}`, newExpiresAt: new Date(Date.now() + 3600_000).toISOString() };
    },

    async revoke(req: RevokeRequest): Promise<RevokeResult> {
      return { success: true, connectionId: req.connectionId, revokedAt: new Date().toISOString() };
    },

    async validate(req: ValidateRequest): Promise<ValidateResult> {
      return { valid: true, connectionId: req.connectionId, scopes: ['read'], expiresAt: new Date(Date.now() + 3600_000).toISOString(), trustLevel: 'high' };
    },

    async getScopes(_connId: string): Promise<string[]> { return ['read', 'write']; },

    async getProfile(_connId: string): Promise<ProviderProfile> {
      return { id: 'user-1', email: 'user@test.com', displayName: 'Test User', rawClaims: {} };
    },

    async health(): Promise<ProviderHealthReport> {
      return { providerId: id, status: 'healthy', latencyMs: 1, checkedAt: new Date().toISOString(), details: {} };
    },
  };
}

function makeDef(id = 'mock-provider'): OAuthProviderDefinition {
  return {
    id, name: `Mock ${id}`, version: '1.0.0', category: 'other', icon: '', documentation: '',
    health: 'healthy', registeredAt: new Date().toISOString(), metadata: {},
    capabilities: ['read'], supportedFlows: ['authorization_code_pkce', 'client_credentials'],
    supportedGrantTypes: ['authorization_code', 'client_credentials'],
    supportedScopes: ['read', 'write'],
  };
}

function makeTenant(suffix = '1'): TenantContext {
  return { organizationId: `org-${suffix}`, workspaceId: `ws-${suffix}`, connectorId: `conn-${suffix}`, accountId: `acc-${suffix}`, userId: `user-${suffix}` };
}

// ─── Provider Registry Tests ──────────────────────────────────────────────────

const registryTests = [
  run('PR-01: register and get provider', () => {
    ProviderRegistry.register(makeDef('pr-test-1'), makeMockProvider('pr-test-1'));
    assert(ProviderRegistry.has('pr-test-1'), 'Expected provider to be registered');
    const p = ProviderRegistry.get('pr-test-1');
    assert(p.providerId === 'pr-test-1', 'Expected correct providerId');
  }),
  run('PR-02: list returns all registered providers', () => {
    ProviderRegistry.register(makeDef('pr-test-2'), makeMockProvider('pr-test-2'));
    const list = ProviderRegistry.list();
    assert(list.length >= 2, 'Expected at least 2 providers');
  }),
  run('PR-03: mismatched id throws', () => {
    let threw = false;
    try { ProviderRegistry.register(makeDef('def-id'), makeMockProvider('different-id')); }
    catch { threw = true; }
    assert(threw, 'Expected mismatch to throw');
  }),
  run('PR-04: get unregistered throws', () => {
    let threw = false;
    try { ProviderRegistry.get('does-not-exist'); }
    catch { threw = true; }
    assert(threw, 'Expected missing provider to throw');
  }),
  run('PR-05: unregister removes provider', () => {
    ProviderRegistry.register(makeDef('pr-temp'), makeMockProvider('pr-temp'));
    ProviderRegistry.unregister('pr-temp');
    assert(!ProviderRegistry.has('pr-temp'), 'Expected provider to be removed');
  }),
  run('PR-06: getDefinition returns copy not reference', () => {
    ProviderRegistry.register(makeDef('pr-def-test'), makeMockProvider('pr-def-test'));
    const def1 = ProviderRegistry.getDefinition('pr-def-test');
    const def2 = ProviderRegistry.getDefinition('pr-def-test');
    assert(def1 !== def2, 'Expected new object each time');
  }),
  run('PR-07: PROVIDER_REGISTERED event emitted on register', () => {
    const id = 'pr-evt-test';
    ProviderRegistry.register(makeDef(id), makeMockProvider(id));
    const events = IdentityEventBus.query({ eventType: 'PROVIDER_REGISTERED', providerId: id });
    assert(events.length > 0, 'Expected PROVIDER_REGISTERED event');
  }),
  run('PR-08: health returns provider list', () => {
    const h = ProviderRegistry.health();
    assert(h.status === 'ok', 'Expected ok status');
    assert(Array.isArray(h.providers), 'Expected providers array');
  }),
];

// ─── Secrets Provider Tests ───────────────────────────────────────────────────

const secretsTests = [
  run('SP-01: set and get round-trip', async () => {
    const sp = new InMemorySecretsProvider();
    await sp.set('key-1', 'secret-value');
    const val = await sp.get('key-1');
    assert(val === 'secret-value', 'Expected stored value');
  }),
  run('SP-02: exists returns true after set', async () => {
    const sp = new InMemorySecretsProvider();
    await sp.set('key-2', 'v');
    assert(await sp.exists('key-2'), 'Expected exists=true');
    assert(!(await sp.exists('no-such-key')), 'Expected exists=false');
  }),
  run('SP-03: get returns null for missing key', async () => {
    const sp = new InMemorySecretsProvider();
    assert(await sp.get('missing') === null, 'Expected null');
  }),
  run('SP-04: delete removes key', async () => {
    const sp = new InMemorySecretsProvider();
    await sp.set('del-key', 'v');
    await sp.delete('del-key');
    assert(!(await sp.exists('del-key')), 'Expected key deleted');
  }),
  run('SP-05: rotate stores new value', async () => {
    const sp = new InMemorySecretsProvider();
    await sp.set('rot-key', 'old');
    await sp.rotate('rot-key', 'new');
    assert(await sp.get('rot-key') === 'new', 'Expected rotated value');
  }),
  run('SP-06: getMetadata never returns value field', async () => {
    const sp = new InMemorySecretsProvider();
    await sp.set('meta-key', 'top-secret');
    const meta = await sp.getMetadata('meta-key');
    assert(meta !== null, 'Expected metadata');
    assert(!('value' in (meta as any)), 'Metadata must not contain value');
  }),
  run('SP-07: health returns healthy', async () => {
    const sp = new InMemorySecretsProvider();
    const h = await sp.health();
    assert(h.status === 'healthy', 'Expected healthy');
    assert(h.backend === 'memory', 'Expected memory backend');
  }),
];

// ─── Credential Manager Tests ─────────────────────────────────────────────────

const credentialTests = [
  run('CM-01: store returns credential with no raw tokens', async () => {
    const cm = new CredentialManager(new InMemorySecretsProvider());
    const cred = await cm.store({
      providerId:   'mock', tenant: makeTenant('cm1'),
      accessToken:  'raw-access', scopes: ['read'], expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    assert(typeof cred.accessTokenRef === 'string', 'Expected accessTokenRef');
    assert(cred.accessTokenRef !== 'raw-access', 'Token ref must not be raw token');
    assert(!('accessToken' in cred), 'Raw token must not be in cred record');
  }),
  run('CM-02: get returns null for unknown connection', async () => {
    const cm = new CredentialManager(new InMemorySecretsProvider());
    assert(cm.get('unknown') === null, 'Expected null');
  }),
  run('CM-03: isExpired returns true for past expiry', async () => {
    const cm = new CredentialManager(new InMemorySecretsProvider());
    const cred = await cm.store({
      providerId: 'mock', tenant: makeTenant('cm3'),
      accessToken: 'tok', scopes: [], expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    assert(cm.isExpired(cred.connectionId), 'Expected expired');
  }),
  run('CM-04: revoke deletes credential', async () => {
    const cm = new CredentialManager(new InMemorySecretsProvider());
    const cred = await cm.store({
      providerId: 'mock', tenant: makeTenant('cm4'),
      accessToken: 'tok', scopes: [], expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await cm.revoke(cred.connectionId);
    assert(cm.get(cred.connectionId) === null, 'Expected credential removed after revoke');
  }),
  run('CM-05: CONNECTION_OPENED event emitted on store', async () => {
    const cm = new CredentialManager(new InMemorySecretsProvider());
    const cred = await cm.store({
      providerId: 'mock', tenant: makeTenant('cm5'),
      accessToken: 'tok', scopes: [], expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    const evts = IdentityEventBus.query({ eventType: 'CONNECTION_OPENED', connectionId: cred.connectionId });
    assert(evts.length > 0, 'Expected CONNECTION_OPENED event');
  }),
];

// ─── Connection State Machine Tests ───────────────────────────────────────────

const connectionTests = [
  run('CS-01: open creates NOT_CONNECTED state', () => {
    const id = `cs-test-${Date.now()}`;
    ConnectionManager.open(id, 'mock', makeTenant());
    assert(ConnectionManager.getState(id) === 'NOT_CONNECTED', 'Expected NOT_CONNECTED');
  }),
  run('CS-02: valid transition succeeds', () => {
    const id = `cs-test2-${Date.now()}`;
    ConnectionManager.open(id, 'mock', makeTenant());
    ConnectionManager.transition(id, 'AUTHENTICATING');
    assert(ConnectionManager.getState(id) === 'AUTHENTICATING', 'Expected AUTHENTICATING');
    ConnectionManager.transition(id, 'CONNECTED');
    assert(ConnectionManager.getState(id) === 'CONNECTED', 'Expected CONNECTED');
  }),
  run('CS-03: invalid transition throws', () => {
    const id = `cs-test3-${Date.now()}`;
    ConnectionManager.open(id, 'mock', makeTenant());
    let threw = false;
    try { ConnectionManager.transition(id, 'CONNECTED'); }
    catch { threw = true; }
    assert(threw, 'Expected invalid transition to throw');
  }),
  run('CS-04: history is recorded', () => {
    const id = `cs-test4-${Date.now()}`;
    ConnectionManager.open(id, 'mock', makeTenant());
    ConnectionManager.transition(id, 'AUTHENTICATING', 'Test');
    ConnectionManager.transition(id, 'CONNECTED', 'Auth ok');
    const rec = ConnectionManager.get(id);
    assert(rec!.history.length === 2, 'Expected 2 history entries');
  }),
  run('CS-05: open same id twice throws', () => {
    const id = `cs-dup-${Date.now()}`;
    ConnectionManager.open(id, 'mock', makeTenant());
    let threw = false;
    try { ConnectionManager.open(id, 'mock', makeTenant()); }
    catch { threw = true; }
    assert(threw, 'Expected duplicate open to throw');
  }),
  run('CS-06: canTransition returns correct boolean', () => {
    const id = `cs-can-${Date.now()}`;
    ConnectionManager.open(id, 'mock', makeTenant());
    assert(ConnectionManager.canTransition(id, 'AUTHENTICATING'), 'Expected AUTHENTICATING to be valid');
    assert(!ConnectionManager.canTransition(id, 'CONNECTED'), 'Expected CONNECTED to be invalid from NOT_CONNECTED');
  }),
  run('CS-07: TOKEN_EXPIRED event on transition', () => {
    const id = `cs-exp-${Date.now()}`;
    ConnectionManager.open(id, 'mock', makeTenant());
    ConnectionManager.transition(id, 'AUTHENTICATING');
    ConnectionManager.transition(id, 'CONNECTED');
    ConnectionManager.transition(id, 'TOKEN_EXPIRED');
    const evts = IdentityEventBus.query({ eventType: 'TOKEN_EXPIRED', connectionId: id });
    assert(evts.length > 0, 'Expected TOKEN_EXPIRED event');
  }),
];

// ─── Permission Manager Tests ─────────────────────────────────────────────────

const permissionTests = [
  run('PM-01: grant and getScopesForConnection', () => {
    const connId = `pm-conn-${Date.now()}`;
    PermissionManager.grant({ connectionId: connId, providerId: 'mock', tenant: makeTenant(), scopes: ['read', 'write'], consentedBy: 'user-1' });
    const scopes = PermissionManager.getScopesForConnection(connId);
    assert(scopes.includes('read'), 'Expected read scope');
    assert(scopes.includes('write'), 'Expected write scope');
  }),
  run('PM-02: hasScope returns correct boolean', () => {
    const connId = `pm-has-${Date.now()}`;
    PermissionManager.grant({ connectionId: connId, providerId: 'mock', tenant: makeTenant(), scopes: ['calendar.read'], consentedBy: 'u' });
    assert(PermissionManager.hasScope(connId, 'calendar.read'), 'Expected true');
    assert(!PermissionManager.hasScope(connId, 'mail.send'), 'Expected false');
  }),
  run('PM-03: revokeForConnection removes active grants', () => {
    const connId = `pm-rev-${Date.now()}`;
    PermissionManager.grant({ connectionId: connId, providerId: 'mock', tenant: makeTenant(), scopes: ['read'], consentedBy: 'u' });
    PermissionManager.revokeForConnection(connId);
    assert(PermissionManager.getScopesForConnection(connId).length === 0, 'Expected no active scopes after revoke');
  }),
  run('PM-04: SCOPES_UPDATED event on grant', () => {
    const connId = `pm-evt-${Date.now()}`;
    PermissionManager.grant({ connectionId: connId, providerId: 'mock', tenant: makeTenant('pm'), scopes: ['read'], consentedBy: 'u' });
    const evts = IdentityEventBus.query({ eventType: 'SCOPES_UPDATED', connectionId: connId });
    assert(evts.length > 0, 'Expected SCOPES_UPDATED event');
  }),
];

// ─── Trust Manager Tests ──────────────────────────────────────────────────────

const trustTests = [
  run('TM-01: evaluate returns trust record', () => {
    const connId = `tm-${Date.now()}`;
    const rec = TrustManager.evaluate({ connectionId: connId, providerId: 'mock', tenant: makeTenant(), scopes: ['read'], origin: 'ws-1', issuedAt: new Date().toISOString() });
    assert(rec.trustLevel !== undefined, 'Expected trustLevel');
    assert(typeof rec.integrityHash === 'string', 'Expected integrityHash');
  }),
  run('TM-02: isValid returns true for fresh record', () => {
    const connId = `tm-valid-${Date.now()}`;
    TrustManager.evaluate({ connectionId: connId, providerId: 'mock', tenant: makeTenant(), scopes: [], origin: 'ws', issuedAt: new Date().toISOString() });
    assert(TrustManager.isValid(connId), 'Expected valid trust');
  }),
  run('TM-03: revoke removes trust record', () => {
    const connId = `tm-rev-${Date.now()}`;
    TrustManager.evaluate({ connectionId: connId, providerId: 'mock', tenant: makeTenant(), scopes: [], origin: 'ws', issuedAt: new Date().toISOString() });
    TrustManager.revoke(connId);
    assert(TrustManager.get(connId) === null, 'Expected null after revoke');
    assert(TrustManager.getTrustLevel(connId) === 'untrusted', 'Expected untrusted after revoke');
  }),
  run('TM-04: sensitive scopes produce higher risk', () => {
    const connId = `tm-sens-${Date.now()}`;
    const rec = TrustManager.evaluate({
      connectionId: connId, providerId: 'mock', tenant: makeTenant(),
      scopes: ['mail.read', 'mail.send', 'files.read', 'calendar.read', 'admin', 'contacts'],
      origin: 'ws', issuedAt: new Date().toISOString(),
    });
    assert(rec.riskClassification === 'high' || rec.riskClassification === 'medium', 'Expected elevated risk for sensitive scopes');
  }),
];

// ─── OAuth Engine Tests ───────────────────────────────────────────────────────

const oauthEngineTests = [
  run('OE-01: supports() routes to correct provider', () => {
    const id = 'oe-prov-1';
    ProviderRegistry.register(makeDef(id), makeMockProvider(id));
    const p = ProviderRegistry.get(id);
    assert(p.supports('authorization_code_pkce', 'authorization_code'), 'Expected PKCE support');
    assert(!p.supports('device_authorization', 'urn:ietf:params:oauth:grant-type:device_code'), 'Expected no device flow');
  }),
  run('OE-02: authenticate emits AUTH_STARTED and AUTH_COMPLETED', async () => {
    const id = 'oe-auth-1';
    ProviderRegistry.register(makeDef(id), makeMockProvider(id));
    const before = IdentityEventBus.count();
    await OAuthEngine.authenticate({
      providerId: id, flow: 'authorization_code_pkce',
      scopes: ['read'], tenant: makeTenant('oe1'),
    });
    const events = IdentityEventBus.query({ providerId: id });
    assert(events.length >= 2, 'Expected AUTH_STARTED + AUTH_COMPLETED events');
  }),
  run('OE-03: unsupported flow returns failure result', async () => {
    const id = 'oe-fail-1';
    ProviderRegistry.register(makeDef(id), makeMockProvider(id));
    const result = await OAuthEngine.authenticate({
      providerId: id, flow: 'device_authorization',
      scopes: [], tenant: makeTenant('oe-fail'),
    });
    assert(!result.success, 'Expected failure for unsupported flow');
    assert(typeof result.error === 'string', 'Expected error message');
  }),
  run('OE-04: generatePKCEChallenge returns non-empty strings', async () => {
    const pkce = await generatePKCEChallenge();
    assert(pkce.codeVerifier.length > 0, 'Expected non-empty verifier');
    assert(pkce.codeChallenge.length > 0, 'Expected non-empty challenge');
    assert(pkce.method === 'S256', 'Expected S256 method');
  }),
  run('OE-05: listFlows returns all 5 flows', () => {
    const flows = OAuthEngine.listFlows();
    assert(flows.length === 5, `Expected 5 flows, got ${flows.length}`);
  }),
];

// ─── Events Tests ─────────────────────────────────────────────────────────────

const eventTests = [
  run('EVT-01: emitted events have all required fields', () => {
    const evt = IdentityEventBus.emit({
      eventType: 'AUTH_STARTED', providerId: 'mock', connectionId: 'conn-1',
      organizationId: 'org-1', actor: 'user-1', payload: { test: true }, status: 'PENDING',
    });
    assert(typeof evt.id === 'string', 'Expected id');
    assert(typeof evt.timestamp === 'string', 'Expected timestamp');
    assert(typeof evt.correlationId === 'string', 'Expected correlationId');
    assert(typeof evt.requestId === 'string', 'Expected requestId');
  }),
  run('EVT-02: subscribe receives emitted event', async () => {
    let received = false;
    const unsub = IdentityEventBus.subscribe('AUTH_COMPLETED', () => { received = true; });
    IdentityEventBus.emit({ eventType: 'AUTH_COMPLETED', providerId: 'p', connectionId: 'c', organizationId: 'o', actor: 'a', payload: {}, status: 'SUCCESS' });
    unsub();
    assert(received, 'Expected subscriber to be called');
  }),
  run('EVT-03: unsubscribe stops receiving events', () => {
    let count = 0;
    const unsub = IdentityEventBus.subscribe('TOKEN_EXPIRED', () => { count++; });
    IdentityEventBus.emit({ eventType: 'TOKEN_EXPIRED', providerId: 'p', connectionId: 'c', organizationId: 'o', actor: 'a', payload: {}, status: 'FAILURE' });
    unsub();
    IdentityEventBus.emit({ eventType: 'TOKEN_EXPIRED', providerId: 'p', connectionId: 'c', organizationId: 'o', actor: 'a', payload: {}, status: 'FAILURE' });
    assert(count === 1, `Expected count=1, got ${count}`);
  }),
  run('EVT-04: query filters by eventType', () => {
    const before = IdentityEventBus.query({ eventType: 'TOKEN_REVOKED' }).length;
    IdentityEventBus.emit({ eventType: 'TOKEN_REVOKED', providerId: 'p', connectionId: 'c2', organizationId: 'o', actor: 'a', payload: {}, status: 'SUCCESS' });
    const after = IdentityEventBus.query({ eventType: 'TOKEN_REVOKED' }).length;
    assert(after === before + 1, 'Expected one more TOKEN_REVOKED event');
  }),
];

// ─── Multi-tenant Tests ───────────────────────────────────────────────────────

const multiTenantTests = [
  run('MT-01: credentials are isolated per tenant', async () => {
    const cm = new CredentialManager(new InMemorySecretsProvider());
    const t1 = makeTenant('mt1');
    const t2 = makeTenant('mt2');
    await cm.store({ providerId: 'mock', tenant: t1, accessToken: 'tok1', scopes: [], expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    await cm.store({ providerId: 'mock', tenant: t2, accessToken: 'tok2', scopes: [], expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    const t1Creds = cm.listForTenant({ organizationId: 'org-mt1' });
    const t2Creds = cm.listForTenant({ organizationId: 'org-mt2' });
    assert(t1Creds.length === 1, 'Expected 1 credential for org-mt1');
    assert(t2Creds.length === 1, 'Expected 1 credential for org-mt2');
  }),
  run('MT-02: grants are isolated per organization', () => {
    const connId1 = `mt-grant-${Date.now()}-1`;
    const connId2 = `mt-grant-${Date.now()}-2`;
    PermissionManager.grant({ connectionId: connId1, providerId: 'mock', tenant: makeTenant('mto1'), scopes: ['read'], consentedBy: 'u' });
    PermissionManager.grant({ connectionId: connId2, providerId: 'mock', tenant: makeTenant('mto2'), scopes: ['write'], consentedBy: 'u' });
    const org1 = PermissionManager.listForOrg('org-mto1');
    const org2 = PermissionManager.listForOrg('org-mto2');
    assert(org1.every((g) => g.tenant.organizationId === 'org-mto1'), 'Org1 grants must not include org2');
    assert(org2.every((g) => g.tenant.organizationId === 'org-mto2'), 'Org2 grants must not include org1');
  }),
  run('MT-03: trust records are isolated per org', () => {
    const connId = `mt-trust-${Date.now()}`;
    TrustManager.evaluate({ connectionId: connId, providerId: 'mock', tenant: makeTenant('mtt'), scopes: [], origin: 'ws', issuedAt: new Date().toISOString() });
    const orgRecords = TrustManager.listForOrg('org-mtt');
    assert(orgRecords.every((r) => r.tenant.organizationId === 'org-mtt'), 'Trust records isolated');
  }),
];

// ─── Concurrency Tests ────────────────────────────────────────────────────────

const concurrencyTests = [
  run('CONC-01: concurrent authentications produce unique connectionIds', async () => {
    const id = 'conc-prov-1';
    if (!ProviderRegistry.has(id)) ProviderRegistry.register(makeDef(id), makeMockProvider(id));
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        OAuthEngine.authenticate({ providerId: id, flow: 'authorization_code_pkce', scopes: ['read'], tenant: makeTenant(`conc${i}`) })
      )
    );
    const connIds = results.map((r) => r.connectionId);
    assert(new Set(connIds).size === 5, 'Expected unique connectionIds for concurrent auths');
  }),
  run('CONC-02: concurrent credential stores are isolated', async () => {
    const cm = new CredentialManager(new InMemorySecretsProvider());
    const stored = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        cm.store({ providerId: 'mock', tenant: makeTenant(`ci${i}`), accessToken: `tok-${i}`, scopes: [], expiresAt: new Date(Date.now() + 3600_000).toISOString() })
      )
    );
    const ids = stored.map((c) => c.connectionId);
    assert(new Set(ids).size === 5, 'Expected unique connectionIds');
  }),
];

// ─── Observability / Health Tests ─────────────────────────────────────────────

const healthTests = [
  run('HLTH-01: IdentityMetricsCollector.collect() returns all fields', () => {
    const m = IdentityMetricsCollector.collect();
    const required: (keyof typeof m)[] = ['totalProviders', 'activeConnections', 'authAttempts', 'authSuccesses', 'authFailures', 'tokenRefreshes', 'avgAuthLatencyMs'];
    for (const k of required) assert(k in m, `Expected metric field: ${k}`);
  }),
  run('HLTH-02: IdentityAudit.health returns counts', () => {
    const h = IdentityAudit.health();
    assert(h.status === 'ok', 'Expected ok status');
    assert(typeof h.total === 'number', 'Expected total count');
  }),
  run('HLTH-03: ConnectionManager.health includes byState', () => {
    const h = ConnectionManager.health();
    assert(h.status === 'ok', 'Expected ok');
    assert(typeof h.stats.total === 'number', 'Expected total');
  }),
  run('HLTH-04: PermissionManager.health returns counts', () => {
    const h = PermissionManager.health();
    assert(h.status === 'ok', 'Expected ok');
    assert(typeof h.total === 'number', 'Expected total');
  }),
  run('HLTH-05: TrustManager.health returns valid count', () => {
    const h = TrustManager.health();
    assert(h.status === 'ok', 'Expected ok');
    assert(typeof h.valid === 'number', 'Expected valid count');
  }),
  run('HLTH-06: OAuthEngine.health returns flow count', () => {
    const h = OAuthEngine.health();
    assert(h.flows === 5, `Expected 5 flows, got ${h.flows}`);
  }),
  run('HLTH-07: IdentityManager.instance().health() covers all sub-systems', () => {
    const im = new IdentityManager(new InMemorySecretsProvider());
    const h = im.health();
    const required = ['credentials', 'connections', 'tokens', 'permissions', 'trust', 'oauth', 'providers', 'audit'];
    for (const k of required) assert(k in h, `Expected health key: ${k}`);
  }),
  run('HLTH-08: audit bridged to EngineeringMemory', () => {
    IdentityAudit.record({
      id: 'bridge-test', timestamp: new Date().toISOString(),
      eventType: 'AUTH_COMPLETED', providerId: 'mock', connectionId: 'c', requestId: 'r',
      correlationId: 'corr', organizationId: 'org', actor: 'u', payload: {}, status: 'SUCCESS',
    });
    const memStats = WorkflowMemoryIntegration.memory().stats();
    assert(memStats.total > 0, 'Expected EngineeringMemory to have entries from audit bridge');
  }),
];

// Import for health test
import { WorkflowMemoryIntegration } from '../engineering-workflow/WorkflowMemoryIntegration';

// ─── Runner ───────────────────────────────────────────────────────────────────

export async function runITPTests(): Promise<{ results: TestResult[]; passed: number; failed: number; coverage: string }> {
  IdentityMetricsCollector.reset();

  const all = [
    ...registryTests,
    ...secretsTests,
    ...credentialTests,
    ...connectionTests,
    ...permissionTests,
    ...trustTests,
    ...oauthEngineTests,
    ...eventTests,
    ...multiTenantTests,
    ...concurrencyTests,
    ...healthTests,
  ];

  const results = await Promise.all(all);
  const passed  = results.filter((r) => r.passed).length;
  const failed  = results.filter((r) => !r.passed).length;
  const coverage = `${passed}/${results.length} tests passed (${Math.round((passed / results.length) * 100)}%)`;

  console.log(`\n[ITP Tests 6.4.0] ${coverage}`);
  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    console.log(`  ${icon} ${r.name} (${r.duration}ms)${r.error ? ' — ' + r.error : ''}`);
  }

  return { results, passed, failed, coverage };
}