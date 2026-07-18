/**
 * EvidenceAnalyzer.ts — MRE v1.0
 * Sprint 7.1.0
 *
 * Analyzes relationships between evidence items:
 *   - Semantic similarity (keyword overlap)
 *   - Temporal ordering
 *   - Duplicate detection
 *   - Complementarity detection
 */

import type { MemoryEvidence } from "@/lib/ucme/UCMETypes";
import type { EvidenceRelationship } from "./MRETypes";

// ── Text helpers ──────────────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9áàâãéèêíìîóòôõúùûç\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 3)
  );
}

function jaccardSimilarity(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  const intersection = [...sa].filter(w => sb.has(w)).length;
  const union        = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseDate(iso: string): number {
  try { return new Date(iso).getTime(); }
  catch { return 0; }
}

// ── EvidenceAnalyzer ──────────────────────────────────────────────────────────

export const EvidenceAnalyzer = {

  /** Find all pairwise relationships between evidence items. */
  analyzeRelationships(evidence: MemoryEvidence[]): Map<string, EvidenceRelationship[]> {
    const result = new Map<string, EvidenceRelationship[]>();
    for (const ev of evidence) result.set(ev.memoryId, []);

    for (let i = 0; i < evidence.length; i++) {
      for (let j = i + 1; j < evidence.length; j++) {
        const a = evidence[i];
        const b = evidence[j];
        const sim = jaccardSimilarity(a.content, b.content);

        // Duplicate / complement / conflict
        if (sim >= 0.75) {
          const rel: EvidenceRelationship = { type: "duplicates", targetId: b.memoryId, strength: sim, explanation: `Content is ${(sim * 100).toFixed(0)}% similar` };
          result.get(a.memoryId)!.push(rel);
          result.get(b.memoryId)!.push({ ...rel, targetId: a.memoryId });
        } else if (sim >= 0.35) {
          const rel: EvidenceRelationship = { type: "complements", targetId: b.memoryId, strength: sim, explanation: `Overlapping topics (${(sim * 100).toFixed(0)}% similarity)` };
          result.get(a.memoryId)!.push(rel);
          result.get(b.memoryId)!.push({ ...rel, targetId: a.memoryId });
        }

        // Temporal ordering
        const ta = parseDate(a.lastUpdated);
        const tb = parseDate(b.lastUpdated);
        if (ta > 0 && tb > 0 && Math.abs(ta - tb) > 60000) {
          const [earlier, later] = ta < tb ? [a, b] : [b, a];
          result.get(earlier.memoryId)!.push({ type: "precedes", targetId: later.memoryId, strength: 0.8, explanation: `"${earlier.providerName}" predates "${later.providerName}"` });
        }
      }
    }

    return result;
  },

  /** Detect conflicting pairs: same topic, different provider, low similarity. */
  detectConflicts(evidence: MemoryEvidence[]): Array<{ a: MemoryEvidence; b: MemoryEvidence; sim: number }> {
    const conflicts: Array<{ a: MemoryEvidence; b: MemoryEvidence; sim: number }> = [];
    for (let i = 0; i < evidence.length; i++) {
      for (let j = i + 1; j < evidence.length; j++) {
        const a = evidence[i];
        const b = evidence[j];
        if (a.providerId === b.providerId) continue; // same source — not a cross-provider conflict
        const queryOverlap = jaccardSimilarity(a.summary, b.summary);
        const contentDiff  = jaccardSimilarity(a.content, b.content);
        // High topic overlap but low content similarity = potential conflict
        if (queryOverlap >= 0.4 && contentDiff < 0.3) {
          conflicts.push({ a, b, sim: contentDiff });
        }
      }
    }
    return conflicts;
  },

  /** Check if two evidence items are semantic duplicates. */
  areDuplicates(a: MemoryEvidence, b: MemoryEvidence): boolean {
    return jaccardSimilarity(a.content, b.content) >= 0.75;
  },

  /** Compute semantic similarity between two evidence items (0–1). */
  similarity(a: MemoryEvidence, b: MemoryEvidence): number {
    return jaccardSimilarity(a.content, b.content);
  },
};