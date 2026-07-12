/**
 * ConnectorSessionManager.ts
 * Manages connector session lifecycle: create, renew, expire, close.
 * EF-31 · 2026-07-12 · Version: 1.0.0
 */

import type { IConnectorSession, SessionStatus, SessionRenewalResult } from './interfaces/IConnectorSession';
import type { IConnectorContext } from './interfaces/IConnectorContext';

function generateId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function addSeconds(isoDate: string, seconds: number): string {
  return new Date(new Date(isoDate).getTime() + seconds * 1000).toISOString();
}

class MutableSession implements IConnectorSession {
  id: string;
  connectorId: string;
  userId: string;
  correlationId: string;
  status: SessionStatus;
  grantedScopes: ReadonlyArray<string>;
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string;
  actionCount: number;
  errorCount: number;
  metadata: Readonly<Record<string, string>>;

  constructor(data: IConnectorSession) {
    this.id = data.id;
    this.connectorId = data.connectorId;
    this.userId = data.userId;
    this.correlationId = data.correlationId;
    this.status = data.status;
    this.grantedScopes = data.grantedScopes;
    this.createdAt = data.createdAt;
    this.expiresAt = data.expiresAt;
    this.lastActivityAt = data.lastActivityAt;
    this.actionCount = data.actionCount;
    this.errorCount = data.errorCount;
    this.metadata = data.metadata;
  }
}

export class ConnectorSessionManager {
  private readonly sessions = new Map<string, MutableSession>();
  private readonly DEFAULT_SESSION_TTL_SECONDS = 3600;
  private createTotal = 0;
  private expireTotal = 0;
  private closeTotal = 0;
  private renewTotal = 0;

  create(connectorId: string, context: IConnectorContext, ttlSeconds?: number): IConnectorSession {
    this.createTotal++;
    const now = new Date().toISOString();
    const ttl = ttlSeconds ?? this.DEFAULT_SESSION_TTL_SECONDS;
    const session = new MutableSession({
      id: generateId(),
      connectorId,
      userId: context.userId,
      correlationId: context.correlationId,
      status: 'ACTIVE',
      grantedScopes: context.grantedScopes,
      createdAt: now,
      expiresAt: addSeconds(now, ttl),
      lastActivityAt: now,
      actionCount: 0,
      errorCount: 0,
      metadata: {},
    });
    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): IConnectorSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  isActive(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    if (session.status !== 'ACTIVE') return false;
    if (new Date(session.expiresAt) <= new Date()) {
      session.status = 'EXPIRED';
      this.expireTotal++;
      return false;
    }
    return true;
  }

  recordActivity(sessionId: string, hasError: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.lastActivityAt = new Date().toISOString();
    session.actionCount++;
    if (hasError) session.errorCount++;
  }

  renew(sessionId: string, ttlSeconds?: number): SessionRenewalResult {
    const session = this.sessions.get(sessionId);
    if (!session) return { sessionId, renewed: false, reason: 'SESSION_NOT_FOUND' };
    if (session.status !== 'ACTIVE' && session.status !== 'EXPIRED') {
      return { sessionId, renewed: false, reason: 'SESSION_NOT_RENEWABLE' };
    }

    this.renewTotal++;
    const ttl = ttlSeconds ?? this.DEFAULT_SESSION_TTL_SECONDS;
    const newExpiresAt = addSeconds(new Date().toISOString(), ttl);
    session.expiresAt = newExpiresAt;
    session.status = 'ACTIVE';
    session.lastActivityAt = new Date().toISOString();

    return { sessionId, renewed: true, newExpiresAt };
  }

  close(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.status = 'CLOSED';
    this.closeTotal++;
    return true;
  }

  fail(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.status = 'FAILED';
  }

  purgeExpired(): number {
    const now = new Date();
    let count = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (session.status === 'ACTIVE' && new Date(session.expiresAt) <= now) {
        session.status = 'EXPIRED';
        this.expireTotal++;
        count++;
      }
      // Remove closed/failed sessions older than 1 hour
      if (
        (session.status === 'CLOSED' || session.status === 'FAILED' || session.status === 'EXPIRED') &&
        new Date(session.lastActivityAt).getTime() < now.getTime() - 3600_000
      ) {
        this.sessions.delete(id);
      }
    }
    return count;
  }

  listActive(connectorId: string): IConnectorSession[] {
    return [...this.sessions.values()].filter(
      s => s.connectorId === connectorId && s.status === 'ACTIVE',
    );
  }

  statistics() {
    const byStatus: Record<SessionStatus, number> = { ACTIVE: 0, EXPIRED: 0, CLOSED: 0, FAILED: 0 };
    for (const s of this.sessions.values()) byStatus[s.status]++;
    return {
      totalSessions: this.sessions.size,
      byStatus,
      createTotal: this.createTotal,
      expireTotal: this.expireTotal,
      closeTotal: this.closeTotal,
      renewTotal: this.renewTotal,
    };
  }

  health() {
    const active = [...this.sessions.values()].filter(s => s.status === 'ACTIVE').length;
    return {
      status: 'HEALTHY' as const,
      details: `${active} active sessions`,
      checks: { storeIntact: true },
      checkedAt: new Date().toISOString(),
    };
  }
}