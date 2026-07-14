/**
 * ConnectorSessionManager.ts
 * Sprint 6.4.1 — Universal Connector Runtime
 *
 * Manages connector sessions: lifecycle, cache, context, expiry, refresh.
 * Each session is scoped to one connectionId — fully multi-tenant.
 * SRP: session CRUD + cache + expiry — nothing else.
 */

import type { ConnectorSession, ConnectorContext } from './UCRTypes';
import { ConnectorEventBus } from './ConnectorEventBus';

const SESSION_KEY = '__UCR_SESSION_STORE__';
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getStore(): Map<string, ConnectorSession> {
  if (!(globalThis as any)[SESSION_KEY]) (globalThis as any)[SESSION_KEY] = new Map();
  return (globalThis as any)[SESSION_KEY];
}

let _seq = 0;
function makeId(): string { return `sess-${Date.now()}-${++_seq}`; }

export class ConnectorSessionManager {
  /**
   * Creates or returns an existing active session for a connectionId.
   */
  static start(context: ConnectorContext, ttlMs = DEFAULT_SESSION_TTL_MS): ConnectorSession {
    // Return existing active session if present.
    const existing = this.getActiveSession(context.connectionId);
    if (existing) {
      existing.lastActiveAt = new Date().toISOString();
      getStore().set(existing.id, existing);
      return { ...existing, cache: new Map(existing.cache) };
    }

    const now       = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    const session: ConnectorSession = {
      id:           makeId(),
      connectorId:  context.connectorId,
      connectionId: context.connectionId,
      context,
      startedAt:    now,
      lastActiveAt: now,
      expiresAt,
      state:        'active',
      cache:        new Map(),
    };

    getStore().set(session.id, session);

    ConnectorEventBus.emit({
      eventType:     'SESSION_STARTED',
      connectorId:   context.connectorId,
      connectionId:  context.connectionId,
      organizationId: context.organizationId,
      actor:         context.userId,
      payload:       { sessionId: session.id, expiresAt },
      status:        'SUCCESS',
    });

    return { ...session, cache: new Map(session.cache) };
  }

  static end(sessionId: string): void {
    const session = getStore().get(sessionId);
    if (!session) return;
    session.state = 'expired';
    getStore().set(sessionId, session);

    ConnectorEventBus.emit({
      eventType:     'SESSION_ENDED',
      connectorId:   session.connectorId,
      connectionId:  session.connectionId,
      organizationId: session.context.organizationId,
      actor:         'system',
      payload:       { sessionId, duration: Date.now() - new Date(session.startedAt).getTime() },
      status:        'SUCCESS',
    });
  }

  static getActiveSession(connectionId: string): ConnectorSession | null {
    const now = new Date().toISOString();
    for (const s of getStore().values()) {
      if (s.connectionId === connectionId && s.state === 'active' && s.expiresAt > now) {
        return s;
      }
    }
    return null;
  }

  static get(sessionId: string): ConnectorSession | null {
    return getStore().get(sessionId) ?? null;
  }

  /** Stores a value in the session cache. */
  static cacheSet(sessionId: string, key: string, value: unknown, ttlMs = 5 * 60 * 1000): void {
    const session = getStore().get(sessionId);
    if (!session) return;
    session.cache.set(key, { value, expiresAt: new Date(Date.now() + ttlMs).toISOString() });
    getStore().set(sessionId, session);
  }

  /** Retrieves a value from the session cache. Returns null if missing or expired. */
  static cacheGet(sessionId: string, key: string): unknown | null {
    const session = getStore().get(sessionId);
    if (!session) return null;
    const entry = session.cache.get(key);
    if (!entry || entry.expiresAt < new Date().toISOString()) return null;
    return entry.value;
  }

  /** Sweeps expired sessions. Returns count removed. */
  static sweepExpired(): number {
    const now = new Date().toISOString();
    let count = 0;
    for (const [id, s] of getStore().entries()) {
      if (s.expiresAt < now && s.state === 'active') {
        s.state = 'expired';
        getStore().set(id, s);
        count++;
      }
    }
    return count;
  }

  static listForConnection(connectionId: string): ConnectorSession[] {
    return Array.from(getStore().values())
      .filter((s) => s.connectionId === connectionId);
  }

  static stats(): { total: number; active: number; expired: number } {
    const all = Array.from(getStore().values());
    const now = new Date().toISOString();
    return {
      total:   all.length,
      active:  all.filter((s) => s.state === 'active' && s.expiresAt > now).length,
      expired: all.filter((s) => s.state === 'expired' || s.expiresAt <= now).length,
    };
  }

  static health(): { status: 'ok'; stats: ReturnType<typeof ConnectorSessionManager.stats> } {
    return { status: 'ok', stats: this.stats() };
  }
}