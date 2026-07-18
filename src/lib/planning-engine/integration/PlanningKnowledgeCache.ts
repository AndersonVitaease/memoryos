/**
 * PlanningKnowledgeCache.ts
 * Read-only cache for planning knowledge bundles.
 *
 * SRP: Caching only — no evaluation, no modification.
 * Sprint: INTEGRATION-01
 *
 * Key: goalId + sprint + components hash.
 * Invalidated on demand (e.g. new knowledge promotion).
 */

import type { RawKnowledgeBundle } from "./PlanningKnowledgeProvider";

interface CacheEntry {
  readonly bundle:    RawKnowledgeBundle;
  readonly cachedAt:  number;
  readonly ttlMs:     number;
}

const _cache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

function makeKey(goalId: string, sprint: string, components: readonly string[]): string {
  return `${goalId}::${sprint}::${[...components].sort().join(",")}`;
}

export const PlanningKnowledgeCache = Object.freeze({

  get(goalId: string, sprint: string, components: readonly string[]): RawKnowledgeBundle | null {
    const entry = _cache.get(makeKey(goalId, sprint, components));
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      _cache.delete(makeKey(goalId, sprint, components));
      return null;
    }
    return entry.bundle;
  },

  set(goalId: string, sprint: string, components: readonly string[], bundle: RawKnowledgeBundle, ttlMs = DEFAULT_TTL_MS): void {
    _cache.set(makeKey(goalId, sprint, components), { bundle, cachedAt: Date.now(), ttlMs });
  },

  /** Invalidate all entries — call after new knowledge promotion */
  invalidate(): void {
    _cache.clear();
  },

  size(): number { return _cache.size; },

  stats(): { size: number; keys: string[] } {
    return { size: _cache.size, keys: [..._cache.keys()] };
  },
});