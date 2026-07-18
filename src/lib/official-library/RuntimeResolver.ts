/**
 * RuntimeResolver.ts — Sprint EF-7.2.6
 *
 * Concrete implementation of IRuntimeResolver.
 * Encapsulates RuntimeRegistry — only class the Provider needs.
 *
 * OfficialLibraryRuntimeProvider depends only on IRuntimeResolver.
 * RuntimeRegistry is invisible beyond this boundary.
 *
 * SRP: runtime resolution only.
 * Telemetry: cacheHits, cacheMisses, selectionDurationMs, lastResolutionAt, lastRefreshAt.
 */

import type { IRuntimeResolver }   from "./IRuntimeResolver";
import type { IRuntimeProvider }   from "./IRuntimeProvider";
import type { RuntimeReasonResult } from "./RuntimeReason";
import { RuntimeRegistry }          from "./RuntimeRegistry";
import { RuntimeScore }             from "./RuntimeScore";
import { RuntimeReason }            from "./RuntimeReason";
import { detectEnvironment }        from "./RuntimeEnvironment";

class RuntimeResolverImpl implements IRuntimeResolver {
  private _cacheHits           = 0;
  private _cacheMisses         = 0;
  private _totalSelectionMs    = 0;
  private _lastResolutionAt:   string | null = null;
  private _lastRefreshAt:      string | null = null;
  private _resolutionCount     = 0;

  getActive(): IRuntimeProvider {
    const t0      = Date.now();
    const wasCold = RuntimeRegistry.lastSelectedId === null;

    const provider = RuntimeRegistry.getActive();

    const dur = Date.now() - t0;
    this._totalSelectionMs += dur;
    this._lastResolutionAt  = new Date().toISOString();
    this._resolutionCount++;

    if (wasCold) this._cacheMisses++;
    else         this._cacheHits++;

    return provider;
  }

  refresh(): IRuntimeProvider {
    RuntimeRegistry.refresh();
    this._lastRefreshAt = new Date().toISOString();
    return this.getActive();
  }

  list(): readonly IRuntimeProvider[] {
    return RuntimeRegistry.list();
  }

  explain(): readonly RuntimeReasonResult[] {
    const all    = [...RuntimeRegistry.list()];
    const scores = all.map(p => RuntimeScore.score(p));
    const active = RuntimeRegistry.getActive();
    const env    = detectEnvironment();
    return RuntimeReason.explainAll(all, scores, active.runtimeId, env);
  }

  // ── Telemetry ──────────────────────────────────────────────────────────────

  get cacheHits():        number       { return this._cacheHits; }
  get cacheMisses():      number       { return this._cacheMisses; }
  get resolutionCount():  number       { return this._resolutionCount; }
  get avgSelectionMs():   number       { return this._resolutionCount > 0 ? +(this._totalSelectionMs / this._resolutionCount).toFixed(2) : 0; }
  get lastResolutionAt(): string|null  { return this._lastResolutionAt; }
  get lastRefreshAt():    string|null  { return this._lastRefreshAt; }
  get registrySize():     number       { return RuntimeRegistry.size; }
  get selectionCount():   number       { return RuntimeRegistry.selectionCount; }
  get refreshCount():     number       { return RuntimeRegistry.refreshCount; }
  get confidence():       number       { try { return RuntimeScore.score(RuntimeRegistry.getActive()).confidence; } catch { return 0; } }
}

const G = globalThis as typeof globalThis & { __RUNTIME_RESOLVER__?: RuntimeResolverImpl };
if (!G.__RUNTIME_RESOLVER__) G.__RUNTIME_RESOLVER__ = new RuntimeResolverImpl();
export const RuntimeResolver: RuntimeResolverImpl = G.__RUNTIME_RESOLVER__;