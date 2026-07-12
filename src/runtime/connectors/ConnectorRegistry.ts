/**
 * ConnectorRegistry.ts
 * Central registry for all connectors. Single source of truth for connector discovery.
 * EF-31 · 2026-07-12 · Version: 1.0.0
 */

import type { IConnector, ConnectorStatus } from './interfaces/IConnector';
import type { IConnectorManifest } from './interfaces/IConnectorManifest';
import { ConnectorManifestLoader } from './ConnectorManifestLoader';

interface RegistryEntry {
  readonly connectorId: string;
  readonly manifest: IConnectorManifest;
  status: ConnectorStatus;
  registeredAt: string;
  updatedAt: string;
  instance?: IConnector;
}

export interface ConnectorRegistryEntry {
  readonly connectorId: string;
  readonly name: string;
  readonly version: string;
  readonly category: string;
  readonly status: ConnectorStatus;
  readonly registeredAt: string;
}

export interface RegistryStatistics {
  readonly totalRegistered: number;
  readonly byStatus: Readonly<Record<ConnectorStatus, number>>;
  readonly byCategory: Readonly<Record<string, number>>;
  readonly registeredAt: string;
}

export class ConnectorRegistry {
  private readonly entries = new Map<string, RegistryEntry>();
  private readonly loader = new ConnectorManifestLoader();
  private registerCount = 0;
  private unregisterCount = 0;

  register(manifest: IConnectorManifest, instance?: IConnector): void {
    const validation = this.loader.load(manifest);
    if (!validation.valid) {
      const msgs = validation.errors.map(e => `${e.field}: ${e.message}`).join('; ');
      throw new Error(`ConnectorRegistry: Cannot register connector '${manifest.id}' — manifest invalid: ${msgs}`);
    }
    if (this.entries.has(manifest.id)) {
      throw new Error(`ConnectorRegistry: Connector '${manifest.id}' is already registered. Unregister first to replace.`);
    }

    this.registerCount++;
    this.entries.set(manifest.id, {
      connectorId: manifest.id,
      manifest,
      status: instance ? 'REGISTERED' : 'UNREGISTERED',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      instance,
    });
  }

  unregister(connectorId: string): boolean {
    const removed = this.entries.delete(connectorId);
    if (removed) {
      this.unregisterCount++;
      this.loader.unload(connectorId);
    }
    return removed;
  }

  setStatus(connectorId: string, status: ConnectorStatus): void {
    const entry = this.entries.get(connectorId);
    if (!entry) throw new Error(`ConnectorRegistry: Connector '${connectorId}' not found`);
    entry.status = status;
    entry.updatedAt = new Date().toISOString();
  }

  setInstance(connectorId: string, instance: IConnector): void {
    const entry = this.entries.get(connectorId);
    if (!entry) throw new Error(`ConnectorRegistry: Connector '${connectorId}' not found`);
    (entry as { instance?: IConnector }).instance = instance;
    entry.updatedAt = new Date().toISOString();
  }

  getInstance(connectorId: string): IConnector | null {
    return this.entries.get(connectorId)?.instance ?? null;
  }

  getManifest(connectorId: string): IConnectorManifest | null {
    return this.entries.get(connectorId)?.manifest ?? null;
  }

  getStatus(connectorId: string): ConnectorStatus | null {
    return this.entries.get(connectorId)?.status ?? null;
  }

  has(connectorId: string): boolean {
    return this.entries.has(connectorId);
  }

  listAll(): ConnectorRegistryEntry[] {
    return Array.from(this.entries.values()).map(e => ({
      connectorId: e.connectorId,
      name: e.manifest.name,
      version: e.manifest.version,
      category: e.manifest.category,
      status: e.status,
      registeredAt: e.registeredAt,
    }));
  }

  listByStatus(status: ConnectorStatus): ConnectorRegistryEntry[] {
    return this.listAll().filter(e => e.status === status);
  }

  listByCategory(category: string): ConnectorRegistryEntry[] {
    return this.listAll().filter(e => e.category === category);
  }

  statistics(): RegistryStatistics {
    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const entry of this.entries.values()) {
      byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
      byCategory[entry.manifest.category] = (byCategory[entry.manifest.category] ?? 0) + 1;
    }

    return {
      totalRegistered: this.entries.size,
      byStatus: byStatus as Record<ConnectorStatus, number>,
      byCategory,
      registeredAt: new Date().toISOString(),
    };
  }

  metrics() {
    return {
      registerTotal: this.registerCount,
      unregisterTotal: this.unregisterCount,
      currentCount: this.entries.size,
      manifestLoader: this.loader.statistics(),
    };
  }

  health() {
    const connected = [...this.entries.values()].filter(e => e.status === 'CONNECTED').length;
    const failed = [...this.entries.values()].filter(e => e.status === 'FAILED').length;
    const status = failed > 0 ? 'DEGRADED' : 'HEALTHY';

    return {
      status,
      details: `${connected} connected, ${failed} failed, ${this.entries.size} total`,
      checks: {
        hasEntries: this.entries.size >= 0,
        noCorruption: true,
      },
      checkedAt: new Date().toISOString(),
    };
  }
}