/**
 * KnowledgeQueryPipeline.ts
 * Orchestrates the full query pipeline end-to-end.
 *
 * SRP: Orchestration only.
 * Sprint: INTEGRATION-02
 *
 * Flow: Parser → Planner → Executor → Filter → Ranking → Resolver → Cache → Audit → Response
 */

import { KnowledgeQueryParser }   from "./KnowledgeQueryParser";
import { KnowledgeQueryPlanner }  from "./KnowledgeQueryPlanner";
import { KnowledgeQueryExecutor } from "./KnowledgeQueryExecutor";
import { KnowledgeQueryFilter }   from "./KnowledgeQueryFilter";
import { KnowledgeQueryRanking }  from "./KnowledgeQueryRanking";
import { KnowledgeQueryResolver } from "./KnowledgeQueryResolver";
import { KnowledgeQueryCache }    from "./KnowledgeQueryCache";
import { KnowledgeQueryAudit }    from "./KnowledgeQueryAudit";
import type {
  KnowledgeQueryRequest, KnowledgeQueryResponse, KnowledgeExplanation,
} from "./KnowledgeQueryTypes";

export const KnowledgeQueryPipeline = Object.freeze({

  run(req: KnowledgeQueryRequest): KnowledgeQueryResponse {
    const start = Date.now();

    // 1. Parse
    const query = KnowledgeQueryParser.parse(req);

    // 2. Cache check
    const cached  = KnowledgeQueryCache.get(req.intent, req.filter ?? {});
    const cacheHit = cached !== null;

    let results  = cached ?? [];
    let discarded: Array<{ item: (typeof results)[0]; reason: string }> = [];
    let conflicts: KnowledgeQueryResponse["conflicts"] = [];

    if (!cacheHit) {
      // 3. Plan
      const plan = KnowledgeQueryPlanner.plan(query);

      // 4. Execute
      const raw = KnowledgeQueryExecutor.execute(plan);

      // 5. Filter
      const filtered = KnowledgeQueryFilter.apply(raw, query.filter);
      discarded = filtered.discarded as typeof discarded;

      // 6. Rank
      const ranked = KnowledgeQueryRanking.rank(filtered.kept, query.policy);

      // 7. Resolve
      const resolved = KnowledgeQueryResolver.resolve(ranked);
      conflicts  = resolved.conflicts;
      results    = resolved.accepted;

      // 8. Cache
      KnowledgeQueryCache.set(req.intent, req.filter ?? {}, results);
    }

    const durationMs = Date.now() - start;

    const filterDescriptions = KnowledgeQueryFilter.describe(query.filter);

    const explanation: KnowledgeExplanation = {
      queryId:     query.id,
      intent:      query.intent,
      steps:       (query.filter.sources ?? []).map(s => `Queried ${s}`),
      filtersUsed: filterDescriptions,
      profileUsed: query.policy.profileId,
      totalItems:  results.length + discarded.length,
      keptItems:   results.length,
      conflicts:   conflicts.length,
    };

    // 9. Audit
    KnowledgeQueryAudit.log({
      queryId:     query.id,
      timestamp:   new Date().toISOString(),
      intent:      query.intent,
      sources:     (query.filter.sources ?? []) as string[],
      filtersUsed: filterDescriptions,
      profileUsed: query.policy.profileId,
      kept:        results.length,
      discarded:   discarded.length,
      conflicts:   conflicts.length,
      durationMs,
      cacheHit,
    });

    return {
      queryId:     query.id,
      intent:      query.intent,
      results,
      discarded:   discarded as KnowledgeQueryResponse["discarded"],
      conflicts,
      explanation,
      cacheHit,
      durationMs,
      timestamp:   new Date().toISOString(),
    };
  },
});