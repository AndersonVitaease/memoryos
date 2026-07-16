/**
 * KnowledgeConfidenceCalculator.ts — Sprint 8.12
 * SRP: calculate per-entity and model-level confidence scores.
 * Deterministic. No LLM. No randomness. No side effects.
 * MDS v2.0 compliant.
 */

import type { FusedEntity, KnowledgeSourceId } from "./KFETypes";

// ── Source trust weights (fixed, deterministic) ───────────────────────────────

const SOURCE_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  "official_library":       1.00,
  "github_connector":       0.85,
  "memory.session_summary": 0.70,
  "memory.decisions":       0.80,
  "memory.topics":          0.65,
  "memory.entities":        0.65,
  "memory.tasks":           0.60,
  "memory.keywords":        0.50,
  "working_memory":         0.55,
  "gmail_connector":        0.75,
  "drive_connector":        0.75,
  "calendar_connector":     0.75,
  "base44_connector":       0.80,
});

const DEFAULT_SOURCE_WEIGHT = 0.45;

// ── KnowledgeConfidenceCalculator ────────────────────────────────────────────

export class KnowledgeConfidenceCalculator {
  /**
   * Recalculate confidence for a fused entity based on:
   *   1. Source trust weights (deterministic per-source constants)
   *   2. Source multiplicity bonus (more corroborating sources → higher confidence)
   *   3. Raw confidence from the canonical unit
   *
   * Formula (deterministic):
   *   baseWeight   = average(sourceWeights for entity.sources)
   *   multiBonus   = min(0.15, (sources.length - 1) * 0.05)
   *   rawInfluence = entity.confidence * 0.20
   *   final        = clamp(baseWeight + multiBonus + rawInfluence, 0, 1)
   */
  calculate(entity: FusedEntity): number {
    const sources = entity.sources as readonly KnowledgeSourceId[];
    if (sources.length === 0) return 0;

    const avgWeight = sources.reduce((sum, src) => {
      return sum + (SOURCE_WEIGHTS[src] ?? DEFAULT_SOURCE_WEIGHT);
    }, 0) / sources.length;

    const multiBonus   = Math.min(0.15, (sources.length - 1) * 0.05);
    const rawInfluence = entity.confidence * 0.20;
    const final        = Math.min(1, avgWeight + multiBonus + rawInfluence);

    return Math.round(final * 1000) / 1000; // 3 decimal precision
  }

  /**
   * Recalculate confidence for an array of entities (mutating-free).
   * Returns a parallel array of recalculated scores.
   */
  calculateAll(entities: readonly FusedEntity[]): readonly number[] {
    return Object.freeze(entities.map((e) => this.calculate(e)));
  }

  /**
   * Overall model confidence = weighted average of all entity confidences.
   * Returns 0 if no entities.
   */
  modelConfidence(entities: readonly FusedEntity[]): number {
    if (entities.length === 0) return 0;
    const scores = entities.map((e) => this.calculate(e));
    const avg    = scores.reduce((s, c) => s + c, 0) / scores.length;
    return Math.round(avg * 1000) / 1000;
  }

  /**
   * Per-source average confidence across all entities that include that source.
   */
  confidenceBySource(entities: readonly FusedEntity[]): Readonly<Record<string, number>> {
    const sums: Record<string, number>  = {};
    const counts: Record<string, number> = {};

    for (const entity of entities) {
      const score = this.calculate(entity);
      for (const src of entity.sources) {
        sums[src]   = (sums[src]   ?? 0) + score;
        counts[src] = (counts[src] ?? 0) + 1;
      }
    }

    const result: Record<string, number> = {};
    for (const src of Object.keys(sums)) {
      result[src] = Math.round((sums[src] / counts[src]) * 1000) / 1000;
    }
    return Object.freeze(result);
  }

  /**
   * Returns the source weight for a given sourceId (for transparency/testing).
   */
  sourceWeight(sourceId: string): number {
    return SOURCE_WEIGHTS[sourceId] ?? DEFAULT_SOURCE_WEIGHT;
  }
}

// Singleton
const _KEY = "__KFE_CONFIDENCE_CALCULATOR__";
const g    = globalThis as Record<string, unknown>;
if (!g[_KEY]) g[_KEY] = new KnowledgeConfidenceCalculator();
export const knowledgeConfidenceCalculator = g[_KEY] as KnowledgeConfidenceCalculator;