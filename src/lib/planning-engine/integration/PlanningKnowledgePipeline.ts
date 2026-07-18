/**
 * PlanningKnowledgePipeline.ts
 * Orchestrates the full Knowledge-Aware Planning pipeline.
 *
 * SRP: Orchestration only — delegates everything to focused modules.
 * Sprint: INTEGRATION-01
 *
 * Flow:
 *   Goal → Context → Provider → Filter → Ranking → Resolver → Advisor → Audit
 *
 * The Planning Engine itself is never modified; it receives the Advisory
 * as enriched context via the PlanningAdvisory output.
 */

import { PlanningKnowledgeContextBuilder } from "./PlanningKnowledgeContext";
import { PlanningKnowledgeProvider }        from "./PlanningKnowledgeProvider";
import { PlanningKnowledgeFilter }          from "./PlanningKnowledgeFilter";
import { PlanningKnowledgeRanking }         from "./PlanningKnowledgeRanking";
import { PlanningKnowledgeResolver }        from "./PlanningKnowledgeResolver";
import { PlanningKnowledgeAdvisor }         from "./PlanningKnowledgeAdvisor";
import { PlanningKnowledgeCache }           from "./PlanningKnowledgeCache";
import { PlanningKnowledgeAudit }           from "./PlanningKnowledgeAudit";
import { PlanningKnowledgeMetrics }         from "./PlanningKnowledgeMetrics";
import type { PlanningGoalInput }           from "./PlanningKnowledgeContext";
import type { PlanningAdvisory }            from "./PlanningKnowledgeAdvisor";
import type { ConflictRecord }              from "./PlanningKnowledgeResolver";
import type { FilterResult }               from "./PlanningKnowledgeFilter";

export interface PlanningKnowledgePipelineResult {
  readonly advisory:   PlanningAdvisory;
  readonly conflicts:  ConflictRecord[];
  readonly filtered:   FilterResult;
  readonly durationMs: number;
  readonly cacheHit:   boolean;
  readonly itemCount:  { total: number; kept: number; ranked: number; accepted: number };
}

export const PlanningKnowledgePipeline = Object.freeze({

  run(input: PlanningGoalInput): PlanningKnowledgePipelineResult {
    const start = Date.now();

    // 1. Build context
    const ctx = PlanningKnowledgeContextBuilder.build(input);

    // 2. Check cache
    const cached = PlanningKnowledgeCache.get(ctx.goalId, ctx.sprint, ctx.components);
    const cacheHit = cached !== null;

    // 3. Fetch knowledge (from cache or live)
    const bundle = cached ?? PlanningKnowledgeProvider.fetch(ctx);
    if (!cacheHit) {
      PlanningKnowledgeCache.set(ctx.goalId, ctx.sprint, ctx.components, bundle);
    }

    // 4. Filter
    const filtered = PlanningKnowledgeFilter.filter(bundle.all, ctx);

    // 5. Rank
    const ranked = PlanningKnowledgeRanking.rank(filtered.kept, ctx);

    // 6. Resolve conflicts
    const { accepted, conflicts } = PlanningKnowledgeResolver.resolve(ranked);

    // 7. Generate advisory
    const advisory = PlanningKnowledgeAdvisor.advise(accepted, ctx);

    const durationMs = Date.now() - start;

    // 8. Audit
    PlanningKnowledgeAudit.log({
      goalId:          ctx.goalId,
      timestamp:       new Date().toISOString(),
      knowledgeUsed:   accepted.map(r => r.item.id),
      knowledgeDropped:filtered.removed.map(r => ({ id: r.item.id, reason: r.reason })),
      conflicts:       conflicts.length,
      recommendations: advisory.recommendedPractices.length + advisory.importantLessons.length,
      governanceUsed:  advisory.governanceRequirements.map(g => g.policyId),
      evidenceScores:  accepted.map(r => r.item.evidenceScore),
      durationMs,
    });

    return {
      advisory,
      conflicts,
      filtered,
      durationMs,
      cacheHit,
      itemCount: {
        total:    bundle.all.length,
        kept:     filtered.kept.length,
        ranked:   ranked.length,
        accepted: accepted.length,
      },
    };
  },

  getMetrics() {
    return PlanningKnowledgeMetrics.snapshot();
  },

  invalidateCache() {
    PlanningKnowledgeCache.invalidate();
  },
});