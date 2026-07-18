/**
 * MemoryFusionEngine.ts — UCME v1.0
 * Sprint 7.0.0
 *
 * Merges, deduplicates, and ranks evidence from multiple providers.
 * Uses confidence × relevance × recency weighting.
 * No knowledge of specific providers.
 */

import type { MemoryEvidence } from "./UCMETypes";

// ── Recency scoring ───────────────────────────────────────────────────────────
// Maps age (ms) to 0–1. Fresh = 1, older = decays.

function recencyScore(lastUpdatedISO: string): number {
  try {
    const ageMs = Date.now() - new Date(lastUpdatedISO).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours <= 1)  return 1.0;
    if (ageHours <= 24) return 0.9;
    if (ageHours <= 72) return 0.75;
    if (ageHours <= 168) return 0.6;
    if (ageHours <= 720) return 0.4;
    return 0.2;
  } catch {
    return 0.5;
  }
}

// ── Weight formula ────────────────────────────────────────────────────────────

function computeWeight(ev: MemoryEvidence): number {
  return Math.round(
    (ev.confidence * 0.4 + ev.relevance * 0.4 + ev.recency * 0.2) * 1000
  ) / 1000;
}

// ── Deduplication key ─────────────────────────────────────────────────────────
// Two items are "duplicates" if their content is very similar.
// Use first 120 chars normalised as key.

function dupKey(ev: MemoryEvidence): string {
  return ev.content.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
}

// ── Public API ────────────────────────────────────────────────────────────────

export const MemoryFusionEngine = {

  /**
   * Merge evidence from multiple providers:
   * 1. Assign recency score
   * 2. Compute final weight
   * 3. Deduplicate (keep highest weight per dup-key)
   * 4. Sort by weight desc
   * 5. Cap at maxResults
   */
  fuse(allEvidence: MemoryEvidence[], maxResults = 20): MemoryEvidence[] {
    // 1 & 2 — enrich with recency + weight
    const enriched = allEvidence.map(ev => {
      const recency = recencyScore(ev.lastUpdated);
      const enriched = { ...ev, recency };
      return { ...enriched, weight: computeWeight(enriched) };
    });

    // 3 — dedup: keep highest weight per content key
    const bestByKey = new Map<string, MemoryEvidence>();
    for (const ev of enriched) {
      const key = dupKey(ev);
      const existing = bestByKey.get(key);
      if (!existing || ev.weight > existing.weight) {
        bestByKey.set(key, ev);
      }
    }

    // 4 & 5 — sort and cap
    return [...bestByKey.values()]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, maxResults);
  },

  /** Build a plain text context block from ranked evidence */
  buildContext(query: string, evidence: MemoryEvidence[]): string {
    if (evidence.length === 0) {
      return `[MEMORIA] Nenhuma informacao relevante encontrada para: "${query}"`;
    }
    const lines: string[] = [
      `[CONTEXTO DE MEMORIA — "${query}"]`,
      "",
    ];
    for (const ev of evidence.slice(0, 10)) {
      lines.push(`## ${ev.providerName} (confianca: ${(ev.confidence * 100).toFixed(0)}%)`);
      lines.push(ev.content);
      lines.push(`_Fonte: ${ev.providerId} | Atualizado: ${ev.lastUpdated}_`);
      lines.push("");
    }
    return lines.join("\n");
  },
};