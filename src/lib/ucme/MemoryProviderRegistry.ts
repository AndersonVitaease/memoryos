/**
 * MemoryProviderRegistry.ts — UCME v1.0
 * Sprint 7.0.0
 *
 * Central registry for all MemoryProviders.
 * Providers self-register on import (plugin model).
 * The Engine queries the registry — it never imports providers directly.
 */

import type { MemoryProvider } from "./UCMETypes";

class MemoryProviderRegistryImpl {
  private readonly _providers = new Map<string, MemoryProvider>();

  register(provider: MemoryProvider): void {
    if (this._providers.has(provider.id)) {
      // Allow hot-reload replacement
      console.warn(`[UCME] Provider "${provider.id}" already registered — replacing`);
    }
    this._providers.set(provider.id, provider);
  }

  get(id: string): MemoryProvider | null {
    return this._providers.get(id) ?? null;
  }

  has(id: string): boolean {
    return this._providers.has(id);
  }

  getAll(): MemoryProvider[] {
    return [...this._providers.values()];
  }

  listIds(): string[] {
    return [...this._providers.keys()].sort();
  }

  get size(): number {
    return this._providers.size;
  }

  unregister(id: string): void {
    this._providers.delete(id);
  }
}

// ── HMR-safe singleton ─────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __UCME_PROVIDER_REGISTRY__?: MemoryProviderRegistryImpl };
if (!G.__UCME_PROVIDER_REGISTRY__) {
  G.__UCME_PROVIDER_REGISTRY__ = new MemoryProviderRegistryImpl();
}

export const MemoryProviderRegistry = G.__UCME_PROVIDER_REGISTRY__;