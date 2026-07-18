/**
 * KnowledgeQueryMetrics.ts
 * Read-only aggregation of knowledge query runtime metrics.
 *
 * SRP: Metrics only.
 * Sprint: INTEGRATION-02
 */

import { KnowledgeQueryAudit } from "./KnowledgeQueryAudit";
import { KnowledgeQueryCache }  from "./KnowledgeQueryCache";
import type { KnowledgeQueryMetrics } from "./KnowledgeQueryTypes";

export const KnowledgeQueryMetricsEngine = Object.freeze({

  snapshot(): KnowledgeQueryMetrics {
    const audits  = KnowledgeQueryAudit.getAll();
    const cache   = KnowledgeQueryCache.stats();
    const total   = audits.length;

    const avgDurationMs = total > 0
      ? Math.round(audits.reduce((s, a) => s + a.durationMs, 0) / total)
      : 0;

    const totalKept      = audits.reduce((s, a) => s + a.kept,      0);
    const totalDiscarded = audits.reduce((s, a) => s + a.discarded, 0);
    const totalConflicts = audits.reduce((s, a) => s + a.conflicts, 0);

    // Top sources
    const srcHits: Record<string, number> = {};
    for (const a of audits) for (const s of a.sources) srcHits[s] = (srcHits[s] ?? 0) + 1;
    const topSources = Object.entries(srcHits)
      .sort(([,a],[,b]) => b - a).slice(0, 5)
      .map(([source, count]) => ({ source, count }));

    return {
      totalQueries:   total,
      avgDurationMs,
      cacheHitRate:   cache.hitRate,
      totalKept,
      totalDiscarded,
      totalConflicts,
      topSources,
      topCategories:  [],
      topComponents:  [],
    };
  },
});