// Connector Runtime — ConnectorRegistry
// Foundation v1.0 · Engineering First
//
// Responsavel por registrar, localizar e consultar Connectors.

import type { IConnector } from "./IConnector";
import type { ConnectorMetadata } from "./ConnectorTypes";

interface RegistryEntry {
  connector: IConnector;
  registeredAt: number;
}

export class ConnectorRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  register(connector: IConnector): void {
    if (this.entries.has(connector.id)) {
      throw new Error(`ConnectorRegistry: duplicate connector id "${connector.id}"`);
    }
    this.entries.set(connector.id, { connector, registeredAt: Date.now() });
  }

  unregister(id: string): void {
    this.entries.delete(id);
  }

  get(id: string): IConnector | undefined {
    return this.entries.get(id)?.connector;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  listAll(): ConnectorMetadata[] {
    return Array.from(this.entries.values()).map(e => e.connector.metadata());
  }

  count(): number {
    return this.entries.size;
  }

  list(): string[] {
    return Array.from(this.entries.keys());
  }

  listCapabilities(): string[] {
    const caps: string[] = [];
    for (const { connector } of this.entries.values()) {
      caps.push(...connector.metadata().capabilities);
    }
    return caps;
  }

  statistics(): {
    connectorsLoaded: number;
    capabilitiesLoaded: number;
    connectorIds: readonly string[];
    capabilityIds: readonly string[];
  } {
    const connectorIds  = this.list();
    const capabilityIds = this.listCapabilities();
    return Object.freeze({
      connectorsLoaded:   connectorIds.length,
      capabilitiesLoaded: capabilityIds.length,
      connectorIds:       Object.freeze(connectorIds),
      capabilityIds:      Object.freeze(capabilityIds),
    });
  }
}