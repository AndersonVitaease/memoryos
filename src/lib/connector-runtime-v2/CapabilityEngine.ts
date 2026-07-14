/**
 * CapabilityEngine.ts
 * Sprint 6.4.1 — Universal Connector Runtime
 *
 * Resolves which connectors and connections can serve a given capability.
 * Supports capability-based routing and auto-selection.
 * SRP: capability resolution — nothing else.
 */

import type { ConnectorCapability, ConnectorOperation } from './UCRTypes';
import { ConnectorRegistry } from './ConnectorRegistry';
import { ConnectionRegistry } from './ConnectionRegistry';

export interface CapabilityResolution {
  capability:      ConnectorCapability;
  connectorIds:    string[];
  connectionCount: number;
  operations:      ConnectorOperation[];
  available:       boolean;
}

export class CapabilityEngine {
  /**
   * Returns all connectors that support the given capability,
   * along with the number of active connections.
   */
  static resolve(capability: ConnectorCapability): CapabilityResolution {
    const manifests   = ConnectorRegistry.listByCapability(capability);
    const connectorIds = manifests.map((m) => m.id);

    const operations: ConnectorOperation[] = manifests.flatMap((m) =>
      m.operations.filter((op) => op.capability === capability)
    );

    let connectionCount = 0;
    for (const id of connectorIds) {
      connectionCount += ConnectionRegistry.listByConnector(id)
        .filter((c) => c.state === 'ACTIVE').length;
    }

    return {
      capability,
      connectorIds,
      connectionCount,
      operations,
      available: connectionCount > 0,
    };
  }

  /**
   * Returns all available capabilities across all registered connectors,
   * with their resolution status.
   */
  static resolveAll(): CapabilityResolution[] {
    const allCapabilities = new Set<ConnectorCapability>();
    for (const m of ConnectorRegistry.list()) {
      for (const c of m.capabilities) allCapabilities.add(c);
    }
    return Array.from(allCapabilities).map((c) => this.resolve(c));
  }

  /**
   * Returns the best connector for a given capability (most active connections).
   */
  static bestConnector(capability: ConnectorCapability): string | null {
    const resolution = this.resolve(capability);
    if (!resolution.available) return null;

    let best: string | null = null;
    let bestCount = 0;
    for (const id of resolution.connectorIds) {
      const count = ConnectionRegistry.listByConnector(id)
        .filter((c) => c.state === 'ACTIVE').length;
      if (count > bestCount) { bestCount = count; best = id; }
    }
    return best;
  }

  /**
   * Returns the operation definition for a given connector + operationId.
   */
  static getOperation(connectorId: string, operationId: string): ConnectorOperation | null {
    const m = ConnectorRegistry.getManifest(connectorId);
    return m.operations.find((op) => op.id === operationId) ?? null;
  }

  /**
   * Validates that a connector supports the given operation.
   */
  static supportsOperation(connectorId: string, operationId: string): boolean {
    return this.getOperation(connectorId, operationId) !== null;
  }

  static health(): { status: 'ok'; capabilities: number; resolved: number } {
    const all = this.resolveAll();
    return {
      status:       'ok',
      capabilities: all.length,
      resolved:     all.filter((r) => r.available).length,
    };
  }
}