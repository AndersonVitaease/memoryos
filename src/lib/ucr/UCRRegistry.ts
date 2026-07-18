/**
 * UCRRegistry.ts — Universal Connector Runtime v1.0
 * Sprint EF-6.4.0
 *
 * Central registry of all connector adapters.
 * Plugin model: new adapters call UCRRegistry.register() — nothing else changes.
 * Open/Closed Principle: open for extension, closed for modification.
 */

import type { ConnectorAdapter } from "./UCRTypes";

class UCRRegistryClass {
  private readonly _adapters = new Map<string, ConnectorAdapter>();

  /**
   * Register an adapter. Idempotent — duplicate registrations are ignored.
   * Called by each adapter module at import time.
   */
  register(adapter: ConnectorAdapter): void {
    if (this._adapters.has(adapter.id)) return;
    this._adapters.set(adapter.id, adapter);
  }

  /** Resolve an adapter by id. Returns null if not registered. */
  get(connectorId: string): ConnectorAdapter | null {
    return this._adapters.get(connectorId) ?? null;
  }

  /** All registered connector IDs (sorted). */
  listIds(): string[] {
    return [...this._adapters.keys()].sort();
  }

  /** All registered adapters. */
  listAll(): ConnectorAdapter[] {
    return [...this._adapters.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  has(connectorId: string): boolean {
    return this._adapters.has(connectorId);
  }

  get size(): number {
    return this._adapters.size;
  }
}

// ── Singleton via globalThis (HMR-safe) ───────────────────────────────────────

const _KEY = "__UCR_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new UCRRegistryClass();
}

export const UCRRegistry: UCRRegistryClass = (
  globalThis as unknown as Record<string, UCRRegistryClass>
)[_KEY];