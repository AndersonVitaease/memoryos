/**
 * OAuthQualification.ts
 * Sprint 6.4.2A — Real OAuth Validation
 *
 * Validates: Authorization Code · PKCE · Refresh · Revoke · Expiry · Recovery
 * Delegates to GoogleOAuthProvider → ITP. No raw token logic here.
 */

import { GoogleOAuthProvider, GOOGLE_PROVIDER_ID } from '../GoogleOAuthProvider';
import { GW_SCOPES } from '../GWTypes';
import type { QualResult } from './QualificationTypes';

const TENANT = { organizationId: 'qual-org', workspaceId: 'qual-ws', connectorId: 'google-workspace', accountId: 'qual-acc', userId: 'qual-user' };

function qr(id: string, name: string, status: import('./QualificationTypes').QualStatus, durationMs: number, meta?: Record<string, unknown>, error?: string): QualResult {
  return { id, name, category: 'oauth', status, durationMs, metadata: meta, error };
}

async function run<T>(id: string, name: string, fn: () => Promise<T>): Promise<QualResult> {
  const t0 = Date.now();
  try {
    const result = await fn();
    return qr(id, name, 'pass', Date.now() - t0, typeof result === 'object' ? result as Record<string, unknown> : { value: result });
  } catch (e: unknown) {
    return qr(id, name, 'fail', Date.now() - t0, undefined, String(e));
  }
}

export async function runOAuthQualification(): Promise<QualResult[]> {
  const provider = new GoogleOAuthProvider();
  let connId = '';

  const results: QualResult[] = [];

  // OA-Q-01: Authorization Code + PKCE
  const authResult = await run('OA-Q-01', 'Authorization Code + PKCE flow', async () => {
    const r = await provider.authenticate({ providerId: GOOGLE_PROVIDER_ID, flow: 'authorization_code_pkce', scopes: [GW_SCOPES.GMAIL_READONLY, GW_SCOPES.CALENDAR_READONLY, GW_SCOPES.DRIVE_READONLY], tenant: TENANT });
    if (!r.success) throw new Error('Authentication failed');
    if (!r.connectionId) throw new Error('No connectionId returned');
    if (!r.tokenRef) throw new Error('No tokenRef returned');
    if (r.tokenRef === GW_SCOPES.GMAIL_READONLY) throw new Error('TokenRef must not be a raw scope');
    connId = r.connectionId;
    return { connectionId: r.connectionId, hasTokenRef: !!r.tokenRef, expiresAt: r.expiresAt };
  });
  results.push(authResult);

  // OA-Q-02: Scope validation
  results.push(await run('OA-Q-02', 'Granted scopes include all requested scopes', async () => {
    const scopes = await provider.getScopes(connId || 'test-conn');
    if (!scopes.includes(GW_SCOPES.GMAIL_READONLY)) throw new Error('Missing GMAIL_READONLY');
    if (!scopes.includes(GW_SCOPES.PROFILE)) throw new Error('Missing PROFILE');
    return { scopeCount: scopes.length, scopes };
  }));

  // OA-Q-03: Profile retrieval
  results.push(await run('OA-Q-03', 'Profile retrieval after authentication', async () => {
    const p = await provider.getProfile(connId || 'test-conn');
    if (!p.email) throw new Error('No email in profile');
    if (!p.displayName) throw new Error('No displayName in profile');
    return p;
  }));

  // OA-Q-04: Token validation
  results.push(await run('OA-Q-04', 'Token validation returns trust level', async () => {
    const v = await provider.validate({ connectionId: connId || 'test-conn', tokenRef: 'ref' });
    if (!v.valid) throw new Error('Token should be valid');
    if (!v.trustLevel) throw new Error('No trustLevel returned');
    if (!v.expiresAt) throw new Error('No expiresAt returned');
    return { valid: v.valid, trustLevel: v.trustLevel };
  }));

  // OA-Q-05: Refresh token
  results.push(await run('OA-Q-05', 'Refresh token returns new token reference', async () => {
    const r = await provider.refresh({ connectionId: connId || 'test-conn', refreshTokenRef: 'refresh-ref-1' });
    if (!r.success) throw new Error('Refresh failed');
    if (!r.newTokenRef) throw new Error('No newTokenRef');
    if (r.newTokenRef === 'refresh-ref-1') throw new Error('newTokenRef must differ from old ref');
    return { newTokenRef: r.newTokenRef, newExpiresAt: r.newExpiresAt };
  }));

  // OA-Q-06: Refresh idempotence — refresh twice
  results.push(await run('OA-Q-06', 'Consecutive refreshes produce different token refs', async () => {
    const r1 = await provider.refresh({ connectionId: connId || 'test-conn', refreshTokenRef: 'ref-A' });
    const r2 = await provider.refresh({ connectionId: connId || 'test-conn', refreshTokenRef: 'ref-B' });
    if (r1.newTokenRef === r2.newTokenRef) throw new Error('Consecutive refreshes should produce different token refs');
    return { r1: r1.newTokenRef, r2: r2.newTokenRef };
  }));

  // OA-Q-07: Revocation
  results.push(await run('OA-Q-07', 'Token revocation succeeds', async () => {
    const r = await provider.revoke({ connectionId: connId || 'test-conn', tokenRef: 'stale-ref' });
    if (!r.success) throw new Error('Revoke failed');
    if (!r.revokedAt) throw new Error('No revokedAt timestamp');
    return r;
  }));

  // OA-Q-08: Provider health
  results.push(await run('OA-Q-08', 'OAuth provider health endpoint responds', async () => {
    const h = await provider.health();
    if (h.status !== 'healthy') throw new Error(`Unhealthy: ${h.status}`);
    if (h.latencyMs < 0) throw new Error('Negative latency');
    return { status: h.status, latencyMs: h.latencyMs };
  }));

  // OA-Q-09: Expiry simulation — simulate expired token recovery
  results.push(await run('OA-Q-09', 'Expired token triggers refresh and recovery', async () => {
    // Simulate: token is marked expired, refresh is triggered, new auth is established.
    const expiredTokenRef = 'expired-tok-sim';
    const refreshResult = await provider.refresh({ connectionId: 'recovery-conn', refreshTokenRef: expiredTokenRef });
    if (!refreshResult.success) throw new Error('Recovery via refresh failed');
    const newValidation = await provider.validate({ connectionId: 'recovery-conn', tokenRef: refreshResult.newTokenRef! });
    if (!newValidation.valid) throw new Error('New token should be valid after refresh');
    return { recovered: true, newTokenRef: refreshResult.newTokenRef };
  }));

  // OA-Q-10: Parallel auth (3 accounts simultaneously)
  results.push(await run('OA-Q-10', '3 simultaneous authentications — parallel', async () => {
    const [a, b, c] = await Promise.all([
      provider.authenticate({ providerId: GOOGLE_PROVIDER_ID, flow: 'authorization_code_pkce', scopes: [GW_SCOPES.GMAIL_READONLY], tenant: { ...TENANT, accountId: 'acc-1' } }),
      provider.authenticate({ providerId: GOOGLE_PROVIDER_ID, flow: 'authorization_code_pkce', scopes: [GW_SCOPES.CALENDAR_READONLY], tenant: { ...TENANT, accountId: 'acc-2' } }),
      provider.authenticate({ providerId: GOOGLE_PROVIDER_ID, flow: 'authorization_code_pkce', scopes: [GW_SCOPES.DRIVE_READONLY], tenant: { ...TENANT, accountId: 'acc-3' } }),
    ]);
    if (!a.success || !b.success || !c.success) throw new Error('One or more parallel auths failed');
    const ids = new Set([a.connectionId, b.connectionId, c.connectionId]);
    if (ids.size !== 3) throw new Error('Parallel auths must produce unique connectionIds');
    return { count: 3, unique: true };
  }));

  return results;
}