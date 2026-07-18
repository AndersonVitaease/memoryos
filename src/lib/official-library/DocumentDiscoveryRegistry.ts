/**
 * DocumentDiscoveryRegistry.ts — Sprint EF-7.2.2
 *
 * Registry + Factory for IDocumentDiscovery implementations.
 *
 * Responsibilities:
 *   - Register discovery implementations by runtimeId
 *   - Auto-select the best available implementation
 *   - Allow explicit injection (DI)
 *   - Never instantiate concrete classes outside this file
 *
 * Factory pattern: callers depend only on IDocumentDiscovery.
 * Extending: register a new impl via DocumentDiscoveryRegistry.register(impl).
 */

import type { IDocumentDiscovery } from "./DocumentDiscovery";

class DocumentDiscoveryRegistryImpl {
  private readonly _implementations = new Map<string, IDocumentDiscovery>();
  private _active: IDocumentDiscovery | null = null;

  /** Register a discovery implementation. Last-registered wins for same runtimeId. */
  register(impl: IDocumentDiscovery): void {
    this._implementations.set(impl.runtimeId, impl);
  }

  /** Explicitly set the active discovery implementation (DI entry point). */
  setActive(impl: IDocumentDiscovery): void {
    if (!this._implementations.has(impl.runtimeId)) {
      this._implementations.set(impl.runtimeId, impl);
    }
    this._active = impl;
  }

  /**
   * Get the active implementation.
   * If none explicitly set, auto-selects the first available one in priority order.
   * Priority: explicitly registered order → isAvailable check.
   */
  getActive(): IDocumentDiscovery {
    if (this._active) return this._active;

    for (const impl of this._implementations.values()) {
      if (impl.isAvailable) {
        this._active = impl;
        return impl;
      }
    }

    // Fallback: return first registered regardless of availability
    const first = this._implementations.values().next().value;
    if (first) { this._active = first; return first; }

    throw new Error("DocumentDiscoveryRegistry: no discovery implementation registered. Call register() before use.");
  }

  /** Get a specific implementation by runtimeId. */
  get(runtimeId: string): IDocumentDiscovery | undefined {
    return this._implementations.get(runtimeId);
  }

  /** List all registered runtimeIds. */
  listIds(): string[] {
    return [...this._implementations.keys()];
  }

  /** How many implementations are registered. */
  get size(): number { return this._implementations.size; }

  /** Reset for testing. */
  _reset(): void {
    this._implementations.clear();
    this._active = null;
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_DISCOVERY_REGISTRY__?: DocumentDiscoveryRegistryImpl };
if (!G.__OL_DISCOVERY_REGISTRY__) G.__OL_DISCOVERY_REGISTRY__ = new DocumentDiscoveryRegistryImpl();
export const DocumentDiscoveryRegistry: DocumentDiscoveryRegistryImpl = G.__OL_DISCOVERY_REGISTRY__;