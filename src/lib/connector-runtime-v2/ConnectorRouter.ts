/**
 * ConnectorRouter.ts
 * Sprint 6.4.1 — Universal Connector Runtime
 *
 * Automatically selects the correct connection(s) for a given route query.
 * Supports single-connection routing and fan-out (all matching connections).
 * SRP: routing logic — nothing else.
 */

import type { RouteQuery, RouteResult, ConnectorCapability } from './UCRTypes';
import { ConnectionRegistry } from './ConnectionRegistry';
import { ConnectorRegistry } from './ConnectorRegistry';

export class ConnectorRouter {
  /**
   * Resolves a route query to one or more connections.
   * If query.all = true, returns ALL matching active connections (fan-out).
   * If query.connectionId is specified, returns that exact connection.
   */
  static route(query: RouteQuery): RouteResult {
    // Direct connectionId lookup — bypass all other routing logic.
    if (query.connectionId) {
      const conn = ConnectionRegistry.get(query.connectionId);
      if (!conn) {
        return { connections: [], strategy: 'single', reason: `Connection not found: ${query.connectionId}` };
      }
      return { connections: [conn], strategy: 'single', reason: 'Direct connectionId match' };
    }

    // Build filter from query.
    let candidates = ConnectionRegistry.listByQuery({
      connectorId:    query.connectorId,
      providerId:     query.providerId,
      organizationId: query.organizationId,
      workspaceId:    query.workspaceId,
      state:          'ACTIVE',
    });

    // Further filter by capability.
    if (query.capability) {
      const capableConnectors = ConnectorRegistry.listByCapability(query.capability)
        .map((m) => m.id);
      candidates = candidates.filter((c) => capableConnectors.includes(c.connectorId));
    }

    if (candidates.length === 0) {
      return {
        connections: [],
        strategy:    'single',
        reason:      `No active connections match query: ${JSON.stringify(query)}`,
      };
    }

    if (query.all) {
      return {
        connections: candidates,
        strategy:    'fan_out',
        reason:      `Fan-out: ${candidates.length} connections matched`,
      };
    }

    // Single routing — return the most recently synced active connection.
    const sorted = candidates.sort((a, b) => {
      const at = a.lastSync ?? a.createdAt;
      const bt = b.lastSync ?? b.createdAt;
      return bt.localeCompare(at);
    });

    return {
      connections: [sorted[0]],
      strategy:    'single',
      reason:      `Best match selected from ${candidates.length} candidates`,
    };
  }

  /**
   * Fan-out: executes a callback for all connections matching the query in parallel.
   * Returns an array of results, including any errors per connection (never throws).
   */
  static async fanOut<T>(
    query: Omit<RouteQuery, 'all'>,
    fn: (connectionId: string) => Promise<T>
  ): Promise<Array<{ connectionId: string; result?: T; error?: string }>> {
    const route = this.route({ ...query, all: true });

    return Promise.all(
      route.connections.map(async (conn) => {
        try {
          const result = await fn(conn.connectionId);
          return { connectionId: conn.connectionId, result };
        } catch (e) {
          return { connectionId: conn.connectionId, error: String(e) };
        }
      })
    );
  }

  static health(): { status: 'ok'; totalConnections: number } {
    return { status: 'ok', totalConnections: ConnectionRegistry.count() };
  }
}