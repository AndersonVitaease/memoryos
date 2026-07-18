/**
 * RuntimeRegistry.ts — Sprint EF-7.2.4
 *
 * Completely generic registry for IRuntimeProvider implementations.
 * Zero knowledge of Vite, Node, Base44, Discovery, Loader, or any concrete type.
 *
 * Selection is fully delegated to RuntimeScore — no if/else/switch branching.
 *
 * API: register · unregister · has · get · list · getActive · clear
 */

import type { IRuntimeProvider }  from "./IRuntimeProvider";
import { RuntimeScore }           from "./RuntimeScore";
import { RuntimeReason }          from "./RuntimeReason";
import type { RuntimeReasonResult } from "./RuntimeReason";

class RuntimeRegistryImpl {
  private readonly _providers = new Map<string, IRuntimeProvider>();
  private _activeId: string | null = null;

  // ── Mutation ───────────────────────────────────────────────────────────────

  register(provider: IRuntimeProvider): void {
    this._providers.set(provider.runtimeId, provider);
    this._activeId = null; // invalidate cache
  }

  unregister(runtimeId: string): boolean {
    const removed = this._providers.delete(runtimeId);
    if (removed && this._activeId === runtimeId) this._activeId = null;
    return removed;
  }

  clear(): void {
    this._providers.clear();
    this._activeId = null;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  has(runtimeId: string): boolean {
    return this._providers.has(runtimeId);
  }

  get(runtimeId: string): IRuntimeProvider | undefined {
    return this._providers.get(runtimeId);
  }

  list(): IRuntimeProvider[] {
    const all = [...this._providers.values()];
    const scores = RuntimeScore.scoreAll(all);
    return scores.map(s => this._providers.get(s.runtimeId)!).filter(Boolean);
  }

  get size(): number { return this._providers.size; }

  // ── Selection (score-based, no branching) ─────────────────────────────────

  getActive(): IRuntimeProvider {
    if (this._activeId) {
      const cached = this._providers.get(this._activeId);
      if (cached) return cached;
    }

    const all  = [...this._providers.values()];
    const best = RuntimeScore.selectBestAvailable(all);

    if (!best) throw new Error(
      "RuntimeRegistry: no provider registered. Import OfficialLibraryRuntime before use."
    );

    this._activeId = best.runtimeId;
    return best;
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  explain(): RuntimeReasonResult[] {
    const all     = [...this._providers.values()];
    const scores  = RuntimeScore.scoreAll(all);
    const active  = this.getActive();
    return RuntimeReason.explainAll(all, scores, active.runtimeId);
  }

  // ── Testing ───────────────────────────────────────────────────────────────

  _reset(): void { this.clear(); }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_RUNTIME_REGISTRY__?: RuntimeRegistryImpl };
if (!G.__OL_RUNTIME_REGISTRY__) G.__OL_RUNTIME_REGISTRY__ = new RuntimeRegistryImpl();
export const RuntimeRegistry: RuntimeRegistryImpl = G.__OL_RUNTIME_REGISTRY__;