/**
 * MemoryFusionEngine.ts — UCME v1.2
 * Sprint EF-7.2.1 — Structural authority ranking
 *
 * Ranking: Authority → Confidence → Relevance → Recency
 * Authority is PRIORITY (structural sort key), NOT a numeric bonus.
 * Backward compatible: evidence without metadata.authority is treated as EXTERNAL.
 */

import type { MemoryEvidence } from "./UCMETypes";

// ── Authority rank (structural priority, not additive score) ──────────────────

const AUTHORITY_PRIORITY: Record<string, number> = {
  OFFICIAL:  5,
  VERIFIED:  4,
  LEARNED:   3,
  USER:      2,
  EXTERNAL:  1,
};

function authorityPriority(ev: MemoryEvidence): number {
  const authority = (ev.metadata?.authority ?? "EXTERNAL") as string;
  return AUTHORITY_PRIORITY[authority] ?? 1;
}

// ── Recency scoring ───────────────────────────────────────────────────────────

function recencyScore(lastUpdatedISO: string): number {
  try {
    const ageMs    = Date.now() - new Date(lastUpdatedISO).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours <= 1)   return 1.0;
    if (ageHours <= 24)  return 0.9;
    if (ageHours <= 72)  return 0.75;
    if (ageHours <= 168) return 0.6;
    if (ageHours <= 720) return 0.4;
    return 0.2;
  } catch {
    return 0.5;
  }
}

// ── Weight formula (confidence × relevance × recency — no authority modifier) ─

function computeWeight(ev: MemoryEvidence): number {
  return Math.round(
    (ev.confidence * 0.4 + ev.relevance * 0.4 + ev.recency * 0.2) * 1000
  ) / 1000;
}

// ── Sort comparator: Authority → weight ───────────────────────────────────────

function sortEvidence(a: MemoryEvidence, b: MemoryEvidence): number {
  const authDiff = authorityPriority(b) - authorityPriority(a);
  if (authDiff !== 0) return authDiff;
  return b.weight - a.weight;
}

// ── Deduplication key ─────────────────────────────────────────────────────────

function dupKey(ev: MemoryEvidence): string {
  return ev.content.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
}

// ── Public API ────────────────────────────────────────────────────────────────

export const MemoryFusionEngine = {

  /**
   * Merge evidence from multiple providers:
   * 1. Assign recency score
   * 2. Compute weight (confidence × relevance × recency)
   * 3. Deduplicate (keep highest-priority per dup-key — authority wins ties)
   * 4. Sort: Authority first, then weight
   * 5. Cap at maxResults
   */
  fuse(allEvidence: MemoryEvidence[], maxResults = 20): MemoryEvidence[] {
    const enriched = allEvidence.map(ev => {
      const recency = recencyScore(ev.lastUpdated);
      const updated = { ...ev, recency };
      return { ...updated, weight: computeWeight(updated) };
    });

    // Dedup: prefer higher authority within the same content key
    const bestByKey = new Map<string, MemoryEvidence>();
    for (const ev of enriched) {
      const key      = dupKey(ev);
      const existing = bestByKey.get(key);
      if (!existing) {
        bestByKey.set(key, ev);
      } else {
        const authNew = authorityPriority(ev);
        const authOld = authorityPriority(existing);
        if (authNew > authOld || (authNew === authOld && ev.weight > existing.weight)) {
          bestByKey.set(key, ev);
        }
      }
    }

    return [...bestByKey.values()]
      .sort(sortEvidence)
      .slice(0, maxResults);
  },

  /** Build a plain text context block from ranked evidence */
  buildContext(query: string, evidence: MemoryEvidence[]): string {
    if (evidence.length === 0) {
      return `[MEMORIA] Nenhuma informacao relevante encontrada para: "${query}"`;
    }
    const lines: string[] = [`[CONTEXTO DE MEMORIA — "${query}"]`, ""];
    for (const ev of evidence.slice(0, 10)) {
      const auth = (ev.metadata?.authority as string | undefined) ?? "";
      const authLabel = auth ? ` [${auth}]` : "";
      lines.push(`## ${ev.providerName}${authLabel} (confianca: ${(ev.confidence * 100).toFixed(0)}%)`);
      lines.push(ev.content);
      lines.push(`_Fonte: ${ev.providerId} | Atualizado: ${ev.lastUpdated}_`);
      lines.push("");
    }
    return lines.join("\n");
  },
};