/**
 * ConnectorRegistry.ts — Sprint 6.3.0
 * Central registry for all connectors. Auto-discovery support.
 */

import type { ConnectorDescriptor, ConnectorLifecycleState, ConnectorHealthState } from "./UCPTypes";

export class ConnectorRegistry {
  private _registry = new Map<string, ConnectorDescriptor>();

  register(descriptor: ConnectorDescriptor): void {
    this._registry.set(descriptor.id, { ...descriptor });
  }

  update(connectorId: string, partial: Partial<ConnectorDescriptor>): void {
    const existing = this._registry.get(connectorId);
    if (!existing) throw new Error(`Connector ${connectorId} not found in registry`);
    this._registry.set(connectorId, { ...existing, ...partial, updatedAt: Date.now() });
  }

  get(connectorId: string): ConnectorDescriptor | undefined {
    return this._registry.get(connectorId);
  }

  has(connectorId: string): boolean {
    return this._registry.has(connectorId);
  }

  remove(connectorId: string): void {
    this._registry.delete(connectorId);
  }

  all(): ConnectorDescriptor[] {
    return [...this._registry.values()];
  }

  count(): number { return this._registry.size; }

  // Auto-discovery: find by lifecycle state
  discover(lifecycle?: ConnectorLifecycleState): ConnectorDescriptor[] {
    if (!lifecycle) return this.all();
    return this.all().filter(c => c.lifecycle === lifecycle);
  }

  // Filter by health
  byHealth(state: ConnectorHealthState): ConnectorDescriptor[] {
    return this.all().filter(c => c.health.state === state);
  }

  // Filter by provider
  byProvider(provider: string): ConnectorDescriptor[] {
    return this.all().filter(c => c.provider === provider);
  }
}