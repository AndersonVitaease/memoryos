/**
 * PermissionManager.ts
 * Sprint 6.4.0 — Universal Identity & Trust Platform
 *
 * Centralises scopes, consents, grants, granted permissions, pending grants.
 * Multi-tenant: all grants are keyed by tenant context.
 * SRP: scope/permission lifecycle — nothing else.
 */

import type { ScopeGrant, TenantContext } from './ITPTypes';
import { IdentityEventBus } from './IdentityEventBus';

let _grantSeq = 0;
function makeGrantId(): string { return `grant-${Date.now()}-${++_grantSeq}`; }

const GRANT_STORE_KEY = '__ITP_GRANT_STORE__';

function getStore(): Map<string, ScopeGrant> {
  if (!(globalThis as any)[GRANT_STORE_KEY]) (globalThis as any)[GRANT_STORE_KEY] = new Map();
  return (globalThis as any)[GRANT_STORE_KEY];
}

export class PermissionManager {
  /** Records a new scope grant after successful authentication. */
  static grant(opts: {
    connectionId: string;
    providerId:   string;
    tenant:       TenantContext;
    scopes:       string[];
    consentedBy:  string;
    expiresAt?:   string;
  }): ScopeGrant {
    const grant: ScopeGrant = {
      id:           makeGrantId(),
      connectionId: opts.connectionId,
      providerId:   opts.providerId,
      tenant:       opts.tenant,
      scopes:       [...opts.scopes],
      grantedAt:    new Date().toISOString(),
      expiresAt:    opts.expiresAt,
      consentedBy:  opts.consentedBy,
      status:       'active',
    };

    getStore().set(grant.id, grant);

    IdentityEventBus.emit({
      eventType:      'SCOPES_UPDATED',
      providerId:     opts.providerId,
      connectionId:   opts.connectionId,
      organizationId: opts.tenant.organizationId,
      actor:          opts.consentedBy,
      payload:        { scopes: opts.scopes, grantId: grant.id },
      status:         'SUCCESS',
    });

    return { ...grant };
  }

  /** Revokes all active grants for a connection. */
  static revokeForConnection(connectionId: string): number {
    let count = 0;
    for (const [id, grant] of getStore().entries()) {
      if (grant.connectionId === connectionId && grant.status === 'active') {
        grant.status = 'revoked';
        getStore().set(id, grant);
        count++;
      }
    }
    return count;
  }

  /** Returns all active grants for a connection. */
  static getGrantsForConnection(connectionId: string): ScopeGrant[] {
    return Array.from(getStore().values())
      .filter((g) => g.connectionId === connectionId && g.status === 'active')
      .map((g) => ({ ...g }));
  }

  /** Returns all scopes currently granted for a connection. */
  static getScopesForConnection(connectionId: string): string[] {
    const grants = this.getGrantsForConnection(connectionId);
    return [...new Set(grants.flatMap((g) => g.scopes))];
  }

  /** Checks whether a specific scope is granted for a connection. */
  static hasScope(connectionId: string, scope: string): boolean {
    return this.getScopesForConnection(connectionId).includes(scope);
  }

  /** Returns all grants for an org, optionally filtered by status. */
  static listForOrg(organizationId: string, status?: ScopeGrant['status']): ScopeGrant[] {
    return Array.from(getStore().values())
      .filter((g) =>
        g.tenant.organizationId === organizationId &&
        (!status || g.status === status)
      )
      .map((g) => ({ ...g }));
  }

  /** Sweeps and marks expired grants. Returns count of expired grants. */
  static sweepExpired(): number {
    const now = new Date().toISOString();
    let count = 0;
    for (const [id, g] of getStore().entries()) {
      if (g.status === 'active' && g.expiresAt && g.expiresAt < now) {
        g.status = 'expired';
        getStore().set(id, g);
        count++;
      }
    }
    return count;
  }

  static health(): { status: 'ok'; total: number; active: number; revoked: number } {
    const all = Array.from(getStore().values());
    return {
      status:  'ok',
      total:   all.length,
      active:  all.filter((g) => g.status === 'active').length,
      revoked: all.filter((g) => g.status === 'revoked').length,
    };
  }
}