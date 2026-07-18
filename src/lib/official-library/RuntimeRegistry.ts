/**
 * RuntimeRegistry.ts — Sprint EF-7.2.5
 *
 * Generic registry for IRuntimeProvider implementations.
 * Zero knowledge of Vite, Node, Base44, Discovery, Loader, or any concrete type.
 *
 * EF-7.2.5 hardening:
 * - Selection delegated to RuntimeSelector (not RuntimeScore)
 * - No internal state exposed externally
 * - Public API: refresh(), clearSelection(), invalidate()
 * - No direct _activeId access from outside
 * - Registry telemetry: selectionCount, refreshCount, lastSelectedId
 *
 * API: register · unregister · has · get · list · getActive
 *    · refresh · clearSelection · invalidate · explain
 */

import type { IRuntimeProvider }  from "./IRuntimeProvider";
import { RuntimeSelector }        from "./RuntimeSelector";
import { RuntimeScore }           from "./RuntimeScore";
import { RuntimeReason }          from "./RuntimeReason";
import type { RuntimeReasonResult } from "./RuntimeReason";

class RuntimeRegistryImpl {
  private readonly _providers   = new Map<string, IRuntimeProvider>();
  private _activeId:            string | null = null;
  private _selectionCount       = 0;
  private _refreshCount         = 0;
  private _lastSelectedAt:      string | null = null;

  // ── Mutation ───────────────────────────────────────────────────────────────

  register(provider: IRuntimeProvider): void {
    this._providers.set(provider.runtimeId, provider);
    this.clearSelection(); // invalidate cache on change
  }

  unregister(runtimeId: string): boolean {
    const removed = this._providers.delete(runtimeId);
    if (removed) this.clearSelection();
    return removed;
  }

  clear(): void {
    this._providers.clear();
    this.clearSelection();
  }

  // ── Cache management (public API — no internal state leaked) ──────────────

  /** Clear the active selection cache — triggers re-evaluation on next getActive(). */
  clearSelection(): void {
    this._activeId = null;
  }

  /** Alias for clearSelection() — semantically "invalidate stale selection". */
  invalidate(): void {
    this.clearSelection();
  }

  /** Clear selection and increment refreshCount. */
  refresh(): void {
    this.clearSelection();
    this._refreshCount++;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  has(runtimeId: string): boolean {
    return this._providers.has(runtimeId);
  }

  get(runtimeId: string): IRuntimeProvider | undefined {
    return this._providers.get(runtimeId);
  }

  /** Returns all providers sorted by score descending. */
  list(): IRuntimeProvider[] {
    return RuntimeSelector.sort([...this._providers.values()]);
  }

  get size(): number { return this._providers.size; }

  // ── Telemetry (read-only, no internal state leaked) ───────────────────────

  get selectionCount(): number  { return this._selectionCount; }
  get refreshCount(): number    { return this._refreshCount; }
  get lastSelectedAt(): string | null { return this._lastSelectedAt; }
  get lastSelectedId(): string | null { return this._activeId; }

  // ── Selection ──────────────────────────────────────────────────────────────

  getActive(): IRuntimeProvider {
    if (this._activeId) {
      const cached = this._providers.get(this._activeId);
      if (cached) return cached;
      // Cached id no longer registered — fall through to re-select
      this._activeId = null;
    }

    const all  = [...this._providers.values()];
    const best = RuntimeSelector.select(all);

    if (!best) throw new Error(
      "RuntimeRegistry: no provider registered. Import OfficialLibraryRuntime before use."
    );

    this._activeId      = best.runtimeId;
    this._selectionCount++;
    this._lastSelectedAt = new Date().toISOString();
    return best;
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  explain(): RuntimeReasonResult[] {
    const all    = [...this._providers.values()];
    const scores = all.map(p => RuntimeScore.score(p));
    const active = this.getActive();
    return RuntimeReason.explainAll(all, scores, active.runtimeId);
  }

  // ── Testing ───────────────────────────────────────────────────────────────

  _reset(): void { this.clear(); }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_RUNTIME_REGISTRY__?: RuntimeRegistryImpl };
if (!G.__OL_RUNTIME_REGISTRY__) G.__OL_RUNTIME_REGISTRY__ = new RuntimeRegistryImpl();
export const RuntimeRegistry: RuntimeRegistryImpl = G.__OL_RUNTIME_REGISTRY__;