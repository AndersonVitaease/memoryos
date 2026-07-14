/**
 * ConnectionManager.ts
 * Sprint 6.4.0 — Universal Identity & Trust Platform
 *
 * Explicit state machine for every connection lifecycle.
 * Invalid transitions throw — no silent state corruption.
 * Multi-tenant: all state is keyed by connectionId, no global state.
 *
 * SRP: connection state transitions + lifecycle — nothing else.
 */

import { CONNECTION_TRANSITIONS } from './ITPTypes';
import type { ConnectionState, TenantContext } from './ITPTypes';
import { IdentityEventBus } from './IdentityEventBus';

export interface ConnectionRecord {
  id:          string;
  providerId:  string;
  tenant:      TenantContext;
  state:       ConnectionState;
  history:     Array<{ from: ConnectionState; to: ConnectionState; at: string; reason?: string }>;
  openedAt:    string;
  closedAt?:   string;
  error?:      string;
}

const CONN_STORE_KEY = '__ITP_CONNECTION_STORE__';

function getStore(): Map<string, ConnectionRecord> {
  if (!(globalThis as any)[CONN_STORE_KEY]) (globalThis as any)[CONN_STORE_KEY] = new Map();
  return (globalThis as any)[CONN_STORE_KEY];
}

export class ConnectionManager {
  /**
   * Registers a new connection in NOT_CONNECTED state.
   * Returns the connection record for caller tracking.
   */
  static open(connectionId: string, providerId: string, tenant: TenantContext): ConnectionRecord {
    if (getStore().has(connectionId)) {
      throw new Error(`[ConnectionManager] Connection already exists: ${connectionId}`);
    }

    const record: ConnectionRecord = {
      id:         connectionId,
      providerId,
      tenant,
      state:      'NOT_CONNECTED',
      history:    [],
      openedAt:   new Date().toISOString(),
    };

    getStore().set(connectionId, record);
    return { ...record, history: [] };
  }

  /**
   * Applies a state transition. Throws for any invalid transition.
   */
  static transition(connectionId: string, nextState: ConnectionState, reason?: string): ConnectionRecord {
    const record = getStore().get(connectionId);
    if (!record) throw new Error(`[ConnectionManager] Connection not found: ${connectionId}`);

    const allowed = CONNECTION_TRANSITIONS[record.state];
    if (!allowed.includes(nextState)) {
      throw new Error(
        `[ConnectionManager] Invalid transition: ${record.state} → ${nextState} ` +
        `for connection ${connectionId}. Allowed: [${allowed.join(', ')}]`
      );
    }

    const historyEntry = { from: record.state, to: nextState, at: new Date().toISOString(), reason };
    record.history = [...record.history, historyEntry];
    record.state   = nextState;
    if (record.error) delete record.error;

    if (nextState === 'ERROR' && reason) record.error = reason;
    if (nextState === 'DISCONNECTED' || nextState === 'REVOKED') {
      record.closedAt = new Date().toISOString();
    }

    getStore().set(connectionId, record);

    // Emit lifecycle event.
    if (nextState === 'CONNECTED') {
      IdentityEventBus.emit({
        eventType:      'CONNECTION_OPENED',
        providerId:     record.providerId,
        connectionId,
        organizationId: record.tenant.organizationId,
        actor:          'system',
        payload:        { from: historyEntry.from, reason },
        status:         'SUCCESS',
      });
    } else if (nextState === 'DISCONNECTED' || nextState === 'REVOKED') {
      IdentityEventBus.emit({
        eventType:      'CONNECTION_CLOSED',
        providerId:     record.providerId,
        connectionId,
        organizationId: record.tenant.organizationId,
        actor:          'system',
        payload:        { from: historyEntry.from, reason, state: nextState },
        status:         'SUCCESS',
      });
    } else if (nextState === 'TOKEN_EXPIRED') {
      IdentityEventBus.emit({
        eventType:      'TOKEN_EXPIRED',
        providerId:     record.providerId,
        connectionId,
        organizationId: record.tenant.organizationId,
        actor:          'system',
        payload:        { reason },
        status:         'FAILURE',
      });
    }

    return { ...record, history: [...record.history] };
  }

  /** Returns the current state of a connection. */
  static getState(connectionId: string): ConnectionState {
    const r = getStore().get(connectionId);
    if (!r) throw new Error(`[ConnectionManager] Connection not found: ${connectionId}`);
    return r.state;
  }

  static get(connectionId: string): ConnectionRecord | null {
    const r = getStore().get(connectionId);
    return r ? { ...r, history: [...r.history] } : null;
  }

  static canTransition(connectionId: string, nextState: ConnectionState): boolean {
    const r = getStore().get(connectionId);
    if (!r) return false;
    return CONNECTION_TRANSITIONS[r.state]?.includes(nextState) ?? false;
  }

  /** Returns true if the connection is in a terminal (non-recoverable) state. */
  static isTerminal(connectionId: string): boolean {
    const r = getStore().get(connectionId);
    if (!r) return true;
    const terminal: ConnectionState[] = ['REVOKED', 'DISCONNECTED'];
    return terminal.includes(r.state);
  }

  static listForTenant(tenant: Partial<TenantContext>): ConnectionRecord[] {
    const results: ConnectionRecord[] = [];
    for (const r of getStore().values()) {
      const match =
        (!tenant.organizationId || r.tenant.organizationId === tenant.organizationId) &&
        (!tenant.workspaceId    || r.tenant.workspaceId    === tenant.workspaceId);
      if (match) results.push({ ...r, history: [...r.history] });
    }
    return results;
  }

  static stats(): { total: number; byState: Record<ConnectionState, number> } {
    const byState = {} as Record<ConnectionState, number>;
    for (const r of getStore().values()) {
      byState[r.state] = (byState[r.state] ?? 0) + 1;
    }
    return { total: getStore().size, byState };
  }

  static health(): { status: 'ok'; stats: ReturnType<typeof ConnectionManager.stats> } {
    return { status: 'ok', stats: this.stats() };
  }
}