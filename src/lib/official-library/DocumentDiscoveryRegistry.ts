/**
 * DocumentDiscoveryRegistry.ts — Sprint EF-7.2.3
 *
 * Generic registry + factory for IDocumentDiscovery implementations.
 *
 * EF-7.2.3 changes:
 * - Auto-selection is now priority-based (highest priority.isAvailable wins)
 * - registerWithPriority() lets callers override priority at registration time
 * - has() added for test convenience
 * - _reset() reinitializes cleanly without breaking singleton
 */

import type { IDocumentDiscovery } from "./DocumentDiscovery";

class DocumentDiscoveryRegistryImpl {
  private readonly _implementations = new Map<string, IDocumentDiscovery>();
  private _active: IDocumentDiscovery | null = null;

  /** Register a discovery implementation. */
  register(impl: IDocumentDiscovery): void {
    this._implementations.set(impl.runtimeId, impl);
    // Invalidate cached active so next getActive() re-evaluates priority
    this._active = null;
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
   * If none explicitly set via setActive(), auto-selects the highest-priority
   * available implementation.
   */
  getActive(): IDocumentDiscovery {
    if (this._active) return this._active;

    // Priority-based auto-selection
    let best: IDocumentDiscovery | null = null;
    for (const impl of this._implementations.values()) {
      if (!impl.isAvailable) continue;
      if (!best || impl.priority > best.priority) best = impl;
    }

    if (best) { this._active = best; return best; }

    // Fallback: highest priority regardless of availability
    let fallback: IDocumentDiscovery | null = null;
    for (const impl of this._implementations.values()) {
      if (!fallback || impl.priority > fallback.priority) fallback = impl;
    }
    if (fallback) { this._active = fallback; return fallback; }

    throw new Error(
      "DocumentDiscoveryRegistry: no discovery implementation registered. " +
      "Import OfficialLibraryRuntime before using the Official Library."
    );
  }

  /** Get a specific implementation by runtimeId. */
  get(runtimeId: string): IDocumentDiscovery | undefined {
    return this._implementations.get(runtimeId);
  }

  /** Check if a runtimeId is registered. */
  has(runtimeId: string): boolean {
    return this._implementations.has(runtimeId);
  }

  /** List all registered runtimeIds ordered by priority descending. */
  listIds(): string[] {
    return [...this._implementations.values()]
      .sort((a, b) => b.priority - a.priority)
      .map(i => i.runtimeId);
  }

  /** All registered implementations ordered by priority descending. */
  listAll(): IDocumentDiscovery[] {
    return [...this._implementations.values()]
      .sort((a, b) => b.priority - a.priority);
  }

  get size(): number { return this._implementations.size; }

  _reset(): void {
    this._implementations.clear();
    this._active = null;
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_DISCOVERY_REGISTRY__?: DocumentDiscoveryRegistryImpl };
if (!G.__OL_DISCOVERY_REGISTRY__) G.__OL_DISCOVERY_REGISTRY__ = new DocumentDiscoveryRegistryImpl();
export const DocumentDiscoveryRegistry: DocumentDiscoveryRegistryImpl = G.__OL_DISCOVERY_REGISTRY__;