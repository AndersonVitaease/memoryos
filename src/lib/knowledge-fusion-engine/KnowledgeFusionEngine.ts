/**
 * KnowledgeFusionEngine.ts — Sprint 8.12
 * Orchestrator: transforms a KFEInput (raw units) into an immutable UnifiedKnowledgeModel.
 *
 * Pipeline (all in-process, no I/O, no LLM):
 *   1. Deduplication      (KnowledgeDeduplicator)
 *   2. Entity building    (KnowledgeDeduplicator.toFusedEntity)
 *   3. Confidence scoring (KnowledgeConfidenceCalculator)
 *   4. Relationship build (KnowledgeRelationshipBuilder)
 *   5. Conflict detection (KnowledgeConflictResolver)
 *   6. Evidence assembly
 *   7. Statistics
 *
 * SRP: orchestration only — no domain logic.
 * MDS v2.0 compliant. Singleton via globalThis.
 */

import type {
  KFEInput,
  KFEResult,
  UnifiedKnowledgeModel,
  FusedEntity,
  EvidenceRecord,
  KFEStatistics,
  KnowledgeUnitType,
} from "./KFETypes";
import { knowledgeDeduplicator }         from "./KnowledgeDeduplicator";
import { knowledgeConflictResolver }      from "./KnowledgeConflictResolver";
import { knowledgeRelationshipBuilder }   from "./KnowledgeRelationshipBuilder";
import { knowledgeConfidenceCalculator }  from "./KnowledgeConfidenceCalculator";

// ── ID generator ──────────────────────────────────────────────────────────────

let _modelSeq = 0;
function makeModelId(): string {
  return `ukm-${Date.now()}-${++_modelSeq}`;
}
let _entitySeq = 0;
function makeFusedId(type: string): string {
  return `fused-${type}-${Date.now()}-${++_entitySeq}`;
}

// ── KnowledgeFusionEngine ─────────────────────────────────────────────────────

class KnowledgeFusionEngine {
  private _totalFusions = 0;
  private readonly _history: Array<{ modelId: string; durationMs: number; builtAt: number }> = [];

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Fuse raw knowledge units from a UnifiedContext into an UnifiedKnowledgeModel.
   * Pure computation — no async, no I/O, no side effects.
   * Never throws — always returns a KFEResult.
   */
  fuse(input: KFEInput): KFEResult {
    const t0 = Date.now();
    try {
      const model = this._build(input, t0);
      const durationMs = Date.now() - t0;
      this._totalFusions++;
      this._history.push({ modelId: model.modelId, durationMs, builtAt: model.builtAt });
      if (this._history.length > 100) this._history.shift();
      return Object.freeze({ success: true, model, durationMs });
    } catch (err) {
      const durationMs = Date.now() - t0;
      const emptyModel = this._emptyModel(input.buildId, durationMs);
      return Object.freeze({ success: false, model: emptyModel, durationMs, error: String(err) });
    }
  }

  get totalFusions(): number  { return this._totalFusions; }
  get recentHistory(): readonly { modelId: string; durationMs: number; builtAt: number }[] {
    return Object.freeze([...this._history]);
  }

  // ── Internal pipeline ───────────────────────────────────────────────────────

  private _build(input: KFEInput, t0: number): UnifiedKnowledgeModel {
    // ── 1. Deduplicate ──────────────────────────────────────────────────────
    const dedupResult = knowledgeDeduplicator.deduplicate(input.units);

    // ── 2. Build fused entities ────────────────────────────────────────────
    const rawFused: FusedEntity[] = dedupResult.groups.map((group) =>
      knowledgeDeduplicator.toFusedEntity(group, makeFusedId(group.canonicalUnit.type))
    );

    // ── 3. Recalculate confidence for each entity ──────────────────────────
    const recalcScores = knowledgeConfidenceCalculator.calculateAll(rawFused);
    const fused: FusedEntity[] = rawFused.map((e, i) =>
      Object.freeze({ ...e, confidence: recalcScores[i] })
    );

    // ── 4. Partition by type ───────────────────────────────────────────────
    const byType = (t: KnowledgeUnitType) =>
      Object.freeze(fused.filter((e) => e.type === t));

    const entities  = byType("entity");
    const topics    = byType("topic");
    const decisions = byType("decision");
    const tasks     = byType("task");

    // All fused for relationship + conflict analysis
    const allFused  = fused;

    // ── 5. Relationships ───────────────────────────────────────────────────
    const relationships = knowledgeRelationshipBuilder.build(allFused);

    // ── 6. Conflict detection ──────────────────────────────────────────────
    const conflicts = knowledgeConflictResolver.detect(allFused);

    // ── 7. Evidence (all unique source citations across all units) ─────────
    const evidenceMap = new Map<string, EvidenceRecord>();
    for (const entity of allFused) {
      for (const ev of entity.evidence) {
        if (!evidenceMap.has(ev.sourceId)) {
          evidenceMap.set(ev.sourceId, ev);
        }
      }
    }
    const evidence = Object.freeze(Array.from(evidenceMap.values()));

    // ── 8. Model confidence ────────────────────────────────────────────────
    const modelConfidence = knowledgeConfidenceCalculator.modelConfidence(allFused);
    const confidenceBySource = knowledgeConfidenceCalculator.confidenceBySource(allFused);

    // ── 9. Statistics ──────────────────────────────────────────────────────
    const sourcesUsed = Array.from(
      new Set(input.units.map((u) => u.sourceId))
    );
    const avgConfidence = allFused.length > 0
      ? allFused.reduce((s, e) => s + e.confidence, 0) / allFused.length
      : 0;

    const stats: KFEStatistics = Object.freeze({
      totalRawUnits:      input.units.length,
      totalEntities:      allFused.length,
      totalRelationships: relationships.length,
      totalConflicts:     conflicts.length,
      duplicatesRemoved:  dedupResult.duplicatesRemoved,
      averageConfidence:  Math.round(avgConfidence * 1000) / 1000,
      processingTimeMs:   Date.now() - t0,
      sourcesUsed:        Object.freeze(sourcesUsed),
      confidenceBySource,
    });

    // ── 10. Assemble model ─────────────────────────────────────────────────
    return Object.freeze({
      modelId:       makeModelId(),
      buildId:       input.buildId,
      entities,
      topics,
      decisions,
      tasks,
      relationships,
      conflicts,
      confidence:    modelConfidence,
      evidence,
      statistics:    stats,
      builtAt:       Date.now(),
    });
  }

  // ── Empty model on failure ──────────────────────────────────────────────────

  private _emptyModel(buildId: string, durationMs: number): UnifiedKnowledgeModel {
    const emptyStats: KFEStatistics = Object.freeze({
      totalRawUnits:      0,
      totalEntities:      0,
      totalRelationships: 0,
      totalConflicts:     0,
      duplicatesRemoved:  0,
      averageConfidence:  0,
      processingTimeMs:   durationMs,
      sourcesUsed:        Object.freeze([]),
      confidenceBySource: Object.freeze({}),
    });
    return Object.freeze({
      modelId:       makeModelId(),
      buildId,
      entities:      Object.freeze([]),
      topics:        Object.freeze([]),
      decisions:     Object.freeze([]),
      tasks:         Object.freeze([]),
      relationships: Object.freeze([]),
      conflicts:     Object.freeze([]),
      confidence:    0,
      evidence:      Object.freeze([]),
      statistics:    emptyStats,
      builtAt:       Date.now(),
    });
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__KFE_ENGINE__";
const g    = globalThis as Record<string, unknown>;
if (!g[_KEY]) g[_KEY] = new KnowledgeFusionEngine();
export const knowledgeFusionEngine = g[_KEY] as KnowledgeFusionEngine;
export { KnowledgeFusionEngine };