/**
 * SimilarityEngine.ts — MRE v1.1 (Sprint EF-7.1.1)
 *
 * Interface contract for all similarity algorithms.
 * EvidenceAnalyzer consumes this interface — never a concrete algorithm.
 * Swap to Embeddings / BM25 / LLM Scoring without touching the Analyzer.
 */

import type { MemoryEvidence } from "@/lib/ucme/UCMETypes";

export interface SimilarityEngine {
  readonly algorithmId: string;
  similarity(a: MemoryEvidence, b: MemoryEvidence): number;
}

// ── Tokenizer (shared utility — not exported from this package) ──────────────

export function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9áàâãéèêíìîóòôõúùûç\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 3)
  );
}

// ── JaccardSimilarityEngine ───────────────────────────────────────────────────

export class JaccardSimilarityEngine implements SimilarityEngine {
  readonly algorithmId = "jaccard-v1";

  similarity(a: MemoryEvidence, b: MemoryEvidence): number {
    const sa = tokenize(a.content);
    const sb = tokenize(b.content);
    if (sa.size === 0 && sb.size === 0) return 1;
    const intersection = [...sa].filter(w => sb.has(w)).length;
    const union        = new Set([...sa, ...sb]).size;
    return union === 0 ? 0 : intersection / union;
  }
}

// ── Default shared instance (singleton — safe to share across modules) ────────

export const defaultSimilarityEngine: SimilarityEngine = new JaccardSimilarityEngine();