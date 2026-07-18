/**
 * EvidenceAnalyzer.ts — MRE v1.1 (Sprint EF-7.1.1)
 *
 * Consumes SimilarityEngine — never implements similarity directly.
 * Detects relationships, conflicts, and duplicates between evidence items.
 */

import type { MemoryEvidence } from "@/lib/ucme/UCMETypes";
import type { EvidenceRelationship } from "./MRETypes";
import { defaultSimilarityEngine, type SimilarityEngine } from "./similarity/SimilarityEngine";
import { DEFAULT_CONFIDENCE_POLICY, type ConfidencePolicy } from "./policies/ConfidencePolicy";

// ── Text helpers (summary similarity for topic overlap detection) ─────────────

import { tokenize } from "./similarity/SimilarityEngine";

function textSimilarity(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  const intersection = [...sa].filter(w => sb.has(w)).length;
  const union        = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : intersection / union;
}

function parseDate(iso: string): number {
  try { return new Date(iso).getTime(); } catch { return 0; }
}

// ── EvidenceAnalyzer ──────────────────────────────────────────────────────────

export const EvidenceAnalyzer = {

  /** Find all pairwise relationships between evidence items. */
  analyzeRelationships(
    evidence: MemoryEvidence[],
    engine: SimilarityEngine = defaultSimilarityEngine,
    policy: ConfidencePolicy = DEFAULT_CONFIDENCE_POLICY,
  ): Map<string, EvidenceRelationship[]> {
    const result = new Map<string, EvidenceRelationship[]>();
    for (const ev of evidence) result.set(ev.memoryId, []);

    for (let i = 0; i < evidence.length; i++) {
      for (let j = i + 1; j < evidence.length; j++) {
        const a   = evidence[i];
        const b   = evidence[j];
        const sim = engine.similarity(a, b);

        if (sim >= policy.duplicateThreshold) {
          const rel: EvidenceRelationship = {
            type: "duplicates", targetId: b.memoryId, strength: sim,
            explanation: `Content is ${(sim * 100).toFixed(0)}% similar`,
          };
          result.get(a.memoryId)!.push(rel);
          result.get(b.memoryId)!.push({ ...rel, targetId: a.memoryId });
        } else if (sim >= policy.complementThreshold) {
          const rel: EvidenceRelationship = {
            type: "complements", targetId: b.memoryId, strength: sim,
            explanation: `Overlapping topics (${(sim * 100).toFixed(0)}% similarity)`,
          };
          result.get(a.memoryId)!.push(rel);
          result.get(b.memoryId)!.push({ ...rel, targetId: a.memoryId });
        }

        // Temporal ordering
        const ta = parseDate(a.lastUpdated);
        const tb = parseDate(b.lastUpdated);
        if (ta > 0 && tb > 0 && Math.abs(ta - tb) > 60000) {
          const [earlier, later] = ta < tb ? [a, b] : [b, a];
          result.get(earlier.memoryId)!.push({
            type: "precedes", targetId: later.memoryId, strength: 0.8,
            explanation: `"${earlier.providerName}" predates "${later.providerName}"`,
          });
        }
      }
    }

    return result;
  },

  /** Detect conflicting pairs: same topic, different provider, divergent content. */
  detectConflicts(
    evidence: MemoryEvidence[],
    engine: SimilarityEngine = defaultSimilarityEngine,
    policy: ConfidencePolicy = DEFAULT_CONFIDENCE_POLICY,
  ): Array<{ a: MemoryEvidence; b: MemoryEvidence; sim: number }> {
    const conflicts: Array<{ a: MemoryEvidence; b: MemoryEvidence; sim: number }> = [];
    for (let i = 0; i < evidence.length; i++) {
      for (let j = i + 1; j < evidence.length; j++) {
        const a = evidence[i];
        const b = evidence[j];
        if (a.providerId === b.providerId) continue;
        const topicOverlap  = textSimilarity(a.summary, b.summary);
        const contentSim    = engine.similarity(a, b);
        if (topicOverlap >= policy.conflictTopicOverlap && contentSim < policy.conflictContentMax) {
          conflicts.push({ a, b, sim: contentSim });
        }
      }
    }
    return conflicts;
  },

  areDuplicates(
    a: MemoryEvidence,
    b: MemoryEvidence,
    engine: SimilarityEngine = defaultSimilarityEngine,
    policy: ConfidencePolicy = DEFAULT_CONFIDENCE_POLICY,
  ): boolean {
    return engine.similarity(a, b) >= policy.duplicateThreshold;
  },

  similarity(
    a: MemoryEvidence,
    b: MemoryEvidence,
    engine: SimilarityEngine = defaultSimilarityEngine,
  ): number {
    return engine.similarity(a, b);
  },
};