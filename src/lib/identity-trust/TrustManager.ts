/**
 * TrustManager.ts
 * Sprint 6.4.0 — Universal Identity & Trust Platform
 *
 * Evaluates and tracks trust, validity, integrity, origin, and risk for
 * every connection. Architecture is prepared for future policy expansion.
 *
 * SRP: trust classification and record management — nothing else.
 */

import type { TrustRecord, TrustLevel, RiskClassification, TenantContext } from './ITPTypes';

const TRUST_STORE_KEY = '__ITP_TRUST_STORE__';

function getStore(): Map<string, TrustRecord> {
  if (!(globalThis as any)[TRUST_STORE_KEY]) (globalThis as any)[TRUST_STORE_KEY] = new Map();
  return (globalThis as any)[TRUST_STORE_KEY];
}

/** Simple deterministic trust score based on scopes and provider. */
function classifyTrust(scopes: string[], providerId: string): { trust: TrustLevel; risk: RiskClassification } {
  const sensitiveScopes = ['mail.read', 'mail.send', 'files.read', 'calendar.read', 'admin'];
  const hasSensitive = scopes.some((s) => sensitiveScopes.some((ss) => s.toLowerCase().includes(ss)));

  if (hasSensitive && scopes.length > 5) return { trust: 'medium', risk: 'high' };
  if (hasSensitive) return { trust: 'medium', risk: 'medium' };
  if (scopes.length === 0) return { trust: 'low', risk: 'low' };
  return { trust: 'high', risk: 'low' };
}

/** Deterministic integrity hash — for real use, replace with HMAC-SHA256. */
function computeHash(connectionId: string, providerId: string, issuedAt: string): string {
  const raw = `${connectionId}:${providerId}:${issuedAt}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  return `hash-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

export class TrustManager {
  /**
   * Evaluates and stores a trust record for a connection.
   * Called after successful authentication.
   */
  static evaluate(opts: {
    connectionId: string;
    providerId:   string;
    tenant:       TenantContext;
    scopes:       string[];
    origin:       string;
    issuedAt:     string;
    ttlMs?:       number;
  }): TrustRecord {
    const { trust, risk } = classifyTrust(opts.scopes, opts.providerId);
    const now = new Date().toISOString();
    const ttl = opts.ttlMs ?? 60 * 60 * 1000; // default 1 hour
    const validUntil = new Date(new Date(opts.issuedAt).getTime() + ttl).toISOString();

    const reasons: string[] = [];
    if (trust === 'high')   reasons.push('Standard scopes — low risk profile');
    if (trust === 'medium') reasons.push('Sensitive scopes detected — elevated monitoring');
    if (trust === 'low')    reasons.push('No scopes granted — minimal trust');

    const record: TrustRecord = {
      connectionId:       opts.connectionId,
      providerId:         opts.providerId,
      tenant:             opts.tenant,
      trustLevel:         trust,
      riskClassification: risk,
      verifiedAt:         now,
      validUntil,
      integrityHash:      computeHash(opts.connectionId, opts.providerId, opts.issuedAt),
      origin:             opts.origin,
      reasons,
    };

    getStore().set(opts.connectionId, record);
    return { ...record };
  }

  /** Returns the trust record for a connection, or null if not evaluated. */
  static get(connectionId: string): TrustRecord | null {
    const r = getStore().get(connectionId);
    return r ? { ...r } : null;
  }

  /** Returns true if the trust record is still valid (not expired). */
  static isValid(connectionId: string): boolean {
    const r = getStore().get(connectionId);
    if (!r) return false;
    return new Date().toISOString() < r.validUntil;
  }

  /** Returns the effective trust level, 'untrusted' if record is missing or expired. */
  static getTrustLevel(connectionId: string): TrustLevel {
    if (!this.isValid(connectionId)) return 'untrusted';
    return getStore().get(connectionId)!.trustLevel;
  }

  /** Returns the effective risk classification, 'critical' if no record. */
  static getRisk(connectionId: string): RiskClassification {
    const r = getStore().get(connectionId);
    if (!r || !this.isValid(connectionId)) return 'critical';
    return r.riskClassification;
  }

  /** Revokes trust for a connection (e.g., on security event). */
  static revoke(connectionId: string): void {
    getStore().delete(connectionId);
  }

  /** Lists all trust records for an organization. */
  static listForOrg(organizationId: string): TrustRecord[] {
    return Array.from(getStore().values())
      .filter((r) => r.tenant.organizationId === organizationId)
      .map((r) => ({ ...r }));
  }

  static health(): { status: 'ok'; total: number; valid: number } {
    const all = Array.from(getStore().values());
    const now = new Date().toISOString();
    return {
      status: 'ok',
      total:  all.length,
      valid:  all.filter((r) => r.validUntil > now).length,
    };
  }
}