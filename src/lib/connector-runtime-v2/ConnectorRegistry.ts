/**
 * ConnectorRegistry.ts
 * Sprint 6.4.1 — Universal Connector Runtime
 *
 * Dynamic registry for connector SDK instances and their manifests.
 * Supports hundreds of connectors. HMR-safe via globalThis anchor.
 * SRP: register · unregister · lookup · search · list — nothing else.
 */

import type { ConnectorManifest, ConnectorCategory, ConnectorCapability, ConnectorLifecycleState } from './UCRTypes';
import type { IConnectorSDK } from './IConnectorSDK';
import { ConnectorEventBus } from './ConnectorEventBus';

const REG_KEY = '__UCR_CONNECTOR_REGISTRY__';

interface RegistryEntry {
  manifest:  ConnectorManifest;
  connector: IConnectorSDK;
  state:     ConnectorLifecycleState;
  registeredAt: string;
}

function getStore(): Map<string, RegistryEntry> {
  if (!(globalThis as any)[REG_KEY]) (globalThis as any)[REG_KEY] = new Map();
  return (globalThis as any)[REG_KEY];
}

export class ConnectorRegistry {
  static register(connector: IConnectorSDK): void {
    const manifest = connector.manifest();
    if (!manifest.id || manifest.id !== connector.connectorId) {
      throw new Error(`[ConnectorRegistry] manifest.id "${manifest.id}" must equal connectorId "${connector.connectorId}"`);
    }

    const isNew = !getStore().has(manifest.id);
    getStore().set(manifest.id, {
      manifest,
      connector,
      state: 'REGISTERED',
      registeredAt: new Date().toISOString(),
    });

    ConnectorEventBus.emit({
      eventType:     'CONNECTOR_REGISTERED',
      connectorId:   manifest.id,
      connectionId:  '',
      organizationId: '',
      actor:         'system',
      payload:       { name: manifest.name, version: manifest.version, isNew },
      status:        'SUCCESS',
    });
  }

  static unregister(connectorId: string): boolean {
    return getStore().delete(connectorId);
  }

  static update(connectorId: string, connector: IConnectorSDK): void {
    if (!getStore().has(connectorId)) {
      throw new Error(`[ConnectorRegistry] Cannot update — connector not found: ${connectorId}`);
    }
    this.register(connector);
  }

  static lookup(connectorId: string): IConnectorSDK {
    const entry = getStore().get(connectorId);
    if (!entry) throw new Error(`[ConnectorRegistry] Connector not found: "${connectorId}"`);
    return entry.connector;
  }

  static getManifest(connectorId: string): ConnectorManifest {
    const entry = getStore().get(connectorId);
    if (!entry) throw new Error(`[ConnectorRegistry] Connector not found: "${connectorId}"`);
    return { ...entry.manifest };
  }

  static has(connectorId: string): boolean { return getStore().has(connectorId); }

  static list(): ConnectorManifest[] {
    return Array.from(getStore().values()).map((e) => ({ ...e.manifest }));
  }

  static listByCategory(category: ConnectorCategory): ConnectorManifest[] {
    return this.list().filter((m) => m.category === category);
  }

  static listByCapability(capability: ConnectorCapability): ConnectorManifest[] {
    return this.list().filter((m) => m.capabilities.includes(capability));
  }

  /** Full-text search across id, name, vendor, description, tags. */
  static search(query: string): ConnectorManifest[] {
    const q = query.toLowerCase();
    return this.list().filter((m) =>
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.vendor.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  static setLifecycleState(connectorId: string, state: ConnectorLifecycleState): void {
    const entry = getStore().get(connectorId);
    if (!entry) throw new Error(`[ConnectorRegistry] Connector not found: "${connectorId}"`);
    entry.state = state;
  }

  static getLifecycleState(connectorId: string): ConnectorLifecycleState {
    const entry = getStore().get(connectorId);
    if (!entry) throw new Error(`[ConnectorRegistry] Connector not found: "${connectorId}"`);
    return entry.state;
  }

  static count(): number { return getStore().size; }

  static health(): { status: 'ok'; total: number; connectors: string[] } {
    return {
      status:     'ok',
      total:      getStore().size,
      connectors: Array.from(getStore().keys()),
    };
  }
}