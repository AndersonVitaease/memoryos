/**
 * KnowledgeQueryCache.ts
 * Shared LRU-like cache for knowledge query responses.
 *
 * SRP: Caching only.
 * Sprint: INTEGRATION-02
 */

import type { KnowledgeResultItem } from "./KnowledgeQueryTypes";

interface CacheEntry {
  items:     KnowledgeResultItem[];
  cachedAt:  number;
  ttlMs:     number;
  hits:      number;
}

const MAX_ENTRIES   = 50;
const DEFAULT_TTL   = 5 * 60 * 1000; // 5 min

const _cache = new Map<string, CacheEntry>();
let   _totalHits   = 0;
let   _totalMisses = 0;

function makeKey(intent: string, filterHash: string): string {
  return `${intent}::${filterHash}`;
}

function filterHash(obj: object): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

function evictLRU(): void {
  if (_cache.size < MAX_ENTRIES) return;
  const oldest = [..._cache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0];
  if (oldest) _cache.delete(oldest[0]);
}

export const KnowledgeQueryCache = Object.freeze({

  get(intent: string, filter: object): KnowledgeResultItem[] | null {
    const key   = makeKey(intent, filterHash(filter));
    const entry = _cache.get(key);
    if (!entry) { _totalMisses++; return null; }
    if (Date.now() - entry.cachedAt > entry.ttlMs) { _cache.delete(key); _totalMisses++; return null; }
    entry.hits++;
    _totalHits++;
    return entry.items;
  },

  set(intent: string, filter: object, items: KnowledgeResultItem[], ttlMs = DEFAULT_TTL): void {
    evictLRU();
    const key = makeKey(intent, filterHash(filter));
    _cache.set(key, { items, cachedAt: Date.now(), ttlMs, hits: 0 });
  },

  invalidate(): void { _cache.clear(); },

  stats(): { size: number; maxSize: number; totalHits: number; totalMisses: number; hitRate: number } {
    const total = _totalHits + _totalMisses;
    return {
      size:       _cache.size,
      maxSize:    MAX_ENTRIES,
      totalHits:  _totalHits,
      totalMisses:_totalMisses,
      hitRate:    total > 0 ? Math.round((_totalHits / total) * 100) / 100 : 0,
    };
  },
});