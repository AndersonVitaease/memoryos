/**
 * CognitiveIntegrator.ts — Goal Intelligence Engine
 * Phase 5 · 2026-07-13
 *
 * Integrates goals with the full cognitive architecture:
 *   KRE, KFE, IRE, PRE, CDL, CLE, Knowledge Graph, Timeline.
 * Append-only — never modifies existing cognitive records.
 * Pure in-memory integration model (engines run in separate sprints).
 */

import type { Goal, CognitiveIntegrationRecord } from "./GIETypes";
import { makeGIEId } from "./GIETypes";

export interface CognitiveContext {
  kreItemCount?: number;
  kfeRelationshipCount?: number;
  ireIdentityCount?: number;
  preComponentCount?: number;
  cdlPhaseCount?: number;
  cleRecordCount?: number;
  linkedLearningIds?: string[];
  linkedKnowledgeIds?: string[];
}

export class CognitiveIntegrator {
  integrate(goal: Goal, ctx: CognitiveContext = {}): CognitiveIntegrationRecord {
    // Graph nodes: goal node + decomposition items
    const decomp         = goal.decomposition;
    const graphNodes     = 1 + (decomp?.totalItems ?? 0);
    const timelineEvents = goal.transitions.filter(t => t.to !== "created").length;

    // Provenance records — one per linked cognitive source
    const provenance: Array<{ source: string; refId: string }> = [
      { source: "goal_engine",   refId: goal.id },
      ...(ctx.linkedKnowledgeIds ?? []).map(id => ({ source: "kre", refId: id })),
      ...(ctx.linkedLearningIds  ?? []).map(id => ({ source: "cle", refId: id })),
    ];
    if (decomp) provenance.push({ source: "decomposition", refId: decomp.id });

    return Object.freeze({
      id:                        makeGIEId("cogint"),
      integratedAt:              Date.now(),
      goalId:                    goal.id,
      kreItemsLinked:            ctx.kreItemCount ?? 0,
      kfeRelationshipsLinked:    ctx.kfeRelationshipCount ?? 0,
      ireIdentitiesLinked:       ctx.ireIdentityCount ?? 0,
      preComponentsLinked:       ctx.preComponentCount ?? 0,
      cdlPhasesLinked:           ctx.cdlPhaseCount ?? 0,
      cleRecordsLinked:          (ctx.linkedLearningIds ?? []).length,
      knowledgeGraphNodesAdded:  graphNodes,
      timelineEventsAdded:       timelineEvents,
      provenanceRecords:         provenance,
    });
  }
}