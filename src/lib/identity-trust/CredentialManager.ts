/**
 * CredentialManager.ts
 * Sprint 6.4.0 — Universal Identity & Trust Platform
 *
 * Manages credential lifecycle: storage, lookup, expiry, and state.
 * Raw tokens are NEVER returned via public API — only opaque references.
 * All writes go through ISecretsProvider.
 *
 * SRP: credential CRUD + expiry — nothing else.
 */

import type { CredentialRecord, TenantContext, ConnectionState } from './ITPTypes';
import type { ISecretsProvider } from './ISecretsProvider';
import { InMemorySecretsProvider } from './ISecretsProvider';
import { IdentityEventBus } from './IdentityEventBus';

let _seq = 0;
function makeCredId(): string { return `cred-${Date.now()}-${++_seq}`; }
function makeConnId(): string { return `conn-${Date.now()}-${++_seq}`; }
function makeRef(prefix: string): string { return `${prefix}-ref-${Date.now()}-${++_seq}`; }

const STORE_KEY = '__ITP_CREDENTIAL_STORE__';

function getStore(): Map<string, CredentialRecord> {
  if (!(globalThis as any)[STORE_KEY]) (globalThis as any)[STORE_KEY] = new Map();
  return (globalThis as any)[STORE_KEY];
}

export class CredentialManager {
  private readonly _secrets: ISecretsProvider;

  constructor(secrets?: ISecretsProvider) {
    this._secrets = secrets ?? new InMemorySecretsProvider();
  }

  /**
   * Stores a new credential pair, persisting raw tokens only in SecretsProvider.
   * Returns the CredentialRecord with opaque token references — never raw values.
   */
  async store(opts: {
    providerId:    string;
    tenant:        TenantContext;
    accessToken:   string;
    refreshToken?: string;
    scopes:        string[];
    expiresAt:     string;
    metadata?:     Record<string, unknown>;
  }): Promise<CredentialRecord> {
    const connId      = makeConnId();
    const aRef        = makeRef('at');
    const rRef        = opts.refreshToken ? makeRef('rt') : null;

    await this._secrets.set(aRef, opts.accessToken);
    if (opts.refreshToken && rRef) {
      await this._secrets.set(rRef, opts.refreshToken);
    }

    const cred: CredentialRecord = {
      id:              makeCredId(),
      connectionId:    connId,
      providerId:      opts.providerId,
      tenant:          opts.tenant,
      accessTokenRef:  aRef,
      refreshTokenRef: rRef,
      scopes:          [...opts.scopes],
      expiresAt:       opts.expiresAt,
      issuedAt:        new Date().toISOString(),
      state:           'CONNECTED',
      metadata:        opts.metadata ?? {},
    };

    getStore().set(connId, cred);

    IdentityEventBus.emit({
      eventType:      'CONNECTION_OPENED',
      providerId:     opts.providerId,
      connectionId:   connId,
      organizationId: opts.tenant.organizationId,
      actor:          opts.tenant.userId,
      payload:        { scopes: opts.scopes, expiresAt: opts.expiresAt },
      status:         'SUCCESS',
    });

    return { ...cred };
  }

  /**
   * Updates the access token for an existing connection.
   * Raw old token is deleted from SecretsProvider.
   */
  async updateAccessToken(connectionId: string, accessToken: string, expiresAt: string): Promise<void> {
    const cred = getStore().get(connectionId);
    if (!cred) throw new Error(`[CredentialManager] Connection not found: ${connectionId}`);

    const newRef = makeRef('at');
    await this._secrets.delete(cred.accessTokenRef);
    await this._secrets.set(newRef, accessToken);

    cred.accessTokenRef = newRef;
    cred.expiresAt      = expiresAt;
    getStore().set(connectionId, cred);

    IdentityEventBus.emit({
      eventType:      'TOKEN_REFRESHED',
      providerId:     cred.providerId,
      connectionId,
      organizationId: cred.tenant.organizationId,
      actor:          'system',
      payload:        { expiresAt },
      status:         'SUCCESS',
    });
  }

  /** Returns credential metadata — never the raw token values. */
  get(connectionId: string): CredentialRecord | null {
    const c = getStore().get(connectionId);
    return c ? { ...c } : null;
  }

  /** Checks whether the access token for a connection is currently expired. */
  isExpired(connectionId: string): boolean {
    const cred = getStore().get(connectionId);
    if (!cred) return true;
    return new Date().toISOString() >= cred.expiresAt;
  }

  /** Updates the state of a credential record. */
  setState(connectionId: string, state: ConnectionState): void {
    const cred = getStore().get(connectionId);
    if (!cred) throw new Error(`[CredentialManager] Connection not found: ${connectionId}`);
    cred.state = state;
    getStore().set(connectionId, cred);
  }

  /**
   * Deletes credential record and both token secrets.
   * Called on revocation or disconnection.
   */
  async revoke(connectionId: string): Promise<void> {
    const cred = getStore().get(connectionId);
    if (!cred) return;

    await this._secrets.delete(cred.accessTokenRef);
    if (cred.refreshTokenRef) await this._secrets.delete(cred.refreshTokenRef);
    getStore().delete(connectionId);

    IdentityEventBus.emit({
      eventType:      'TOKEN_REVOKED',
      providerId:     cred.providerId,
      connectionId,
      organizationId: cred.tenant.organizationId,
      actor:          'system',
      payload:        { revokedAt: new Date().toISOString() },
      status:         'SUCCESS',
    });
  }

  /**
   * @internal — returns the raw access token for internal ITP use ONLY.
   * Must never be called from public-facing APIs.
   */
  async _resolveAccessToken(connectionId: string): Promise<string | null> {
    const cred = getStore().get(connectionId);
    if (!cred) return null;
    return this._secrets.get(cred.accessTokenRef);
  }

  /**
   * @internal — returns the raw refresh token for internal ITP use ONLY.
   */
  async _resolveRefreshToken(connectionId: string): Promise<string | null> {
    const cred = getStore().get(connectionId);
    if (!cred || !cred.refreshTokenRef) return null;
    return this._secrets.get(cred.refreshTokenRef);
  }

  listForTenant(tenant: Partial<TenantContext>): CredentialRecord[] {
    const results: CredentialRecord[] = [];
    for (const cred of getStore().values()) {
      const match =
        (!tenant.organizationId || cred.tenant.organizationId === tenant.organizationId) &&
        (!tenant.workspaceId    || cred.tenant.workspaceId    === tenant.workspaceId) &&
        (!tenant.userId         || cred.tenant.userId         === tenant.userId);
      if (match) results.push({ ...cred });
    }
    return results;
  }

  stats(): { total: number; active: number; expired: number } {
    const all = Array.from(getStore().values());
    const now = new Date().toISOString();
    return {
      total:   all.length,
      active:  all.filter((c) => c.state === 'CONNECTED' && c.expiresAt > now).length,
      expired: all.filter((c) => c.expiresAt <= now).length,
    };
  }

  health(): { status: 'ok'; stats: ReturnType<CredentialManager['stats']> } {
    return { status: 'ok', stats: this.stats() };
  }
}