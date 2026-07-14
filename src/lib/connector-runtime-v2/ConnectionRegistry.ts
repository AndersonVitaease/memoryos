/**
 * ConnectionRegistry.ts
 * Sprint 6.4.1 — Universal Connector Runtime
 *
 * Registry of authenticated connections.
 * One connection = one authenticated account.
 * Multiple connections per connector and per provider are fully supported.
 * HMR-safe via globalThis anchor.
 *
 * SRP: connection CRUD + lookup — nothing else.
 */

import type { ConnectionRecord, ConnectionState } from './UCRTypes';
import { ConnectorEventBus } from './ConnectorEventBus';

const CONN_KEY = '__UCR_CONNECTION_REGISTRY__';

function getStore(): Map<string, ConnectionRecord> {
  if (!(globalThis as any)[CONN_KEY]) (globalThis as any)[CONN_KEY] = new Map();
  return (globalThis as any)[CONN_KEY];
}

let _seq = 0;
function makeId(): string { return `ucr-conn-${Date.now()}-${++_seq}`; }

export class ConnectionRegistry {
  static add(opts: Omit<ConnectionRecord, 'connectionId' | 'createdAt' | 'health' | 'lastSync'>): ConnectionRecord {
    const record: ConnectionRecord = {
      ...opts,
      connectionId: makeId(),
      health:       'unknown',
      lastSync:     null,
      createdAt:    new Date().toISOString(),
    };

    getStore().set(record.connectionId, record);

    ConnectorEventBus.emit({
      eventType:     'CONNECTION_ADDED',
      connectorId:   record.connectorId,
      connectionId:  record.connectionId,
      organizationId: record.organizationId,
      actor:         'system',
      payload:       { displayName: record.displayName, email: record.email },
      status:        'SUCCESS',
    });

    return { ...record };
  }

  static remove(connectionId: string): boolean {
    const r = getStore().get(connectionId);
    if (!r) return false;
    getStore().delete(connectionId);
    ConnectorEventBus.emit({
      eventType:     'CONNECTION_REMOVED',
      connectorId:   r.connectorId,
      connectionId,
      organizationId: r.organizationId,
      actor:         'system',
      payload:       {},
      status:        'SUCCESS',
    });
    return true;
  }

  static get(connectionId: string): ConnectionRecord | null {
    const r = getStore().get(connectionId);
    return r ? { ...r } : null;
  }

  static has(connectionId: string): boolean { return getStore().has(connectionId); }

  static setState(connectionId: string, state: ConnectionState): void {
    const r = getStore().get(connectionId);
    if (!r) throw new Error(`[ConnectionRegistry] Connection not found: ${connectionId}`);
    r.state = state;
    getStore().set(connectionId, r);
  }

  static setHealth(connectionId: string, health: ConnectionRecord['health'], lastSync?: string): void {
    const r = getStore().get(connectionId);
    if (!r) return;
    r.health  = health;
    if (lastSync) r.lastSync = lastSync;
    getStore().set(connectionId, r);
  }

  /** All connections for a connector (any account). */
  static listByConnector(connectorId: string): ConnectionRecord[] {
    return Array.from(getStore().values())
      .filter((r) => r.connectorId === connectorId)
      .map((r) => ({ ...r }));
  }

  /** All connections for a provider (across all connectors). */
  static listByProvider(providerId: string): ConnectionRecord[] {
    return Array.from(getStore().values())
      .filter((r) => r.providerId === providerId)
      .map((r) => ({ ...r }));
  }

  /** All connections scoped to an organization. */
  static listByOrg(organizationId: string): ConnectionRecord[] {
    return Array.from(getStore().values())
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({ ...r }));
  }

  /** All connections in a workspace. */
  static listByWorkspace(workspaceId: string): ConnectionRecord[] {
    return Array.from(getStore().values())
      .filter((r) => r.workspaceId === workspaceId)
      .map((r) => ({ ...r }));
  }

  /** Connections that match connector + org + workspace (for fan-out routing). */
  static listByQuery(opts: {
    connectorId?:    string;
    providerId?:     string;
    organizationId?: string;
    workspaceId?:    string;
    state?:          ConnectionState;
  }): ConnectionRecord[] {
    return Array.from(getStore().values())
      .filter((r) =>
        (!opts.connectorId    || r.connectorId    === opts.connectorId) &&
        (!opts.providerId     || r.providerId     === opts.providerId) &&
        (!opts.organizationId || r.organizationId === opts.organizationId) &&
        (!opts.workspaceId    || r.workspaceId    === opts.workspaceId) &&
        (!opts.state          || r.state          === opts.state)
      )
      .map((r) => ({ ...r }));
  }

  static count(): number { return getStore().size; }

  static stats(): {
    total:     number;
    byState:   Record<string, number>;
    byConnector: Record<string, number>;
  } {
    const all = Array.from(getStore().values());
    const byState:     Record<string, number> = {};
    const byConnector: Record<string, number> = {};
    for (const r of all) {
      byState[r.state]         = (byState[r.state] ?? 0) + 1;
      byConnector[r.connectorId] = (byConnector[r.connectorId] ?? 0) + 1;
    }
    return { total: all.length, byState, byConnector };
  }

  static health(): { status: 'ok'; stats: ReturnType<typeof ConnectionRegistry.stats> } {
    return { status: 'ok', stats: this.stats() };
  }
}