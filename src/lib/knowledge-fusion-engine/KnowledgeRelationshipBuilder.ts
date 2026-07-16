/**
 * KnowledgeRelationshipBuilder.ts — Sprint 8.12
 * SRP: discover and record relationships between fused entities.
 * No LLM. No network. Signal-based pattern matching only. Deterministic.
 * MDS v2.0 compliant.
 */

import type { FusedEntity, KnowledgeRelationship, RelationshipType } from "./KFETypes";

let _relSeq = 0;
function makeRelId(): string {
  return `rel-${Date.now()}-${++_relSeq}`;
}

// ── Relationship signal rules ────────────────────────────────────────────────

interface RelationshipSignal {
  readonly fromPattern: readonly string[];
  readonly toPattern:   readonly string[];
  readonly type:        RelationshipType;
  readonly confidence:  number;
}

const RELATIONSHIP_SIGNALS: readonly RelationshipSignal[] = [
  // Planning → Execution
  { fromPattern: ["planning", "planner"], toPattern: ["execution", "executionplan", "plan"], type: "produces",   confidence: 0.90 },
  // Execution → Runtime
  { fromPattern: ["executionplan", "plan"], toPattern: ["runtime", "engine"],                 type: "consumed_by", confidence: 0.88 },
  // Runtime → Connector
  { fromPattern: ["runtime"],             toPattern: ["connector"],                           type: "depends_on", confidence: 0.85 },
  // Connector → Capability
  { fromPattern: ["connector"],           toPattern: ["capability"],                          type: "produces",   confidence: 0.82 },
  // Capability → Registry
  { fromPattern: ["capability"],          toPattern: ["registry"],                            type: "part_of",    confidence: 0.78 },
  // Router → Pipeline
  { fromPattern: ["router"],              toPattern: ["pipeline"],                            type: "part_of",    confidence: 0.80 },
  // Goal → Planning
  { fromPattern: ["goal"],                toPattern: ["planning", "planner"],                 type: "precedes",   confidence: 0.87 },
  // Bridge → Goal
  { fromPattern: ["bridge"],              toPattern: ["goal"],                                type: "produces",   confidence: 0.83 },
  // Context → Engine
  { fromPattern: ["context", "unified"],  toPattern: ["engine", "fusion"],                   type: "precedes",   confidence: 0.75 },
  // Memory → Context
  { fromPattern: ["memory", "session"],   toPattern: ["context"],                             type: "part_of",    confidence: 0.70 },
  // Gmail → Connector
  { fromPattern: ["gmail"],               toPattern: ["connector"],                           type: "part_of",    confidence: 0.85 },
  // Drive → Connector
  { fromPattern: ["drive"],               toPattern: ["connector"],                           type: "part_of",    confidence: 0.85 },
  // Calendar → Connector
  { fromPattern: ["calendar"],            toPattern: ["connector"],                           type: "part_of",    confidence: 0.85 },
];

// ── KnowledgeRelationshipBuilder ─────────────────────────────────────────────

export class KnowledgeRelationshipBuilder {
  /**
   * Scan all fused entities for signal-based relationships.
   * O(n² × signals) — bounded by small, deduplicated entity count.
   * Returns immutable KnowledgeRelationship[]. Never throws.
   */
  build(entities: readonly FusedEntity[]): readonly KnowledgeRelationship[] {
    const relationships: KnowledgeRelationship[] = [];
    const seen = new Set<string>(); // prevent duplicate pairs

    for (const from of entities) {
      for (const to of entities) {
        if (from.fusedId === to.fusedId) continue;

        const pairKey = `${from.fusedId}→${to.fusedId}`;
        if (seen.has(pairKey)) continue;

        const fromNorm = this._norm(from.canonicalValue);
        const toNorm   = this._norm(to.canonicalValue);

        for (const signal of RELATIONSHIP_SIGNALS) {
          const fromMatch = signal.fromPattern.some((p) => fromNorm.includes(p));
          const toMatch   = signal.toPattern.some((p) => toNorm.includes(p));

          if (fromMatch && toMatch) {
            seen.add(pairKey);

            // Blend signal confidence with entity confidences
            const blended = signal.confidence * 0.6 +
              (from.confidence + to.confidence) / 2 * 0.4;

            const mergedSources = Array.from(
              new Set([...from.sources, ...to.sources])
            );

            relationships.push(Object.freeze({
              relationshipId: makeRelId(),
              fromEntityId:   from.fusedId,
              toEntityId:     to.fusedId,
              type:           signal.type,
              confidence:     Math.min(1, Math.round(blended * 100) / 100),
              sources:        Object.freeze(mergedSources),
            }));
            break; // one relationship per pair per pass
          }
        }
      }
    }

    return Object.freeze(relationships);
  }

  private _norm(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
  }
}

// Singleton
const _KEY = "__KFE_RELATIONSHIP_BUILDER__";
const g    = globalThis as Record<string, unknown>;
if (!g[_KEY]) g[_KEY] = new KnowledgeRelationshipBuilder();
export const knowledgeRelationshipBuilder = g[_KEY] as KnowledgeRelationshipBuilder;