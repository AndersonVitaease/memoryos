/**
 * HypothesisGenerator.ts — MRE v1.0
 * Sprint 7.1.0
 *
 * Generates hypotheses when evidence is insufficient.
 * Every hypothesis is explicitly marked isHypothesis=true.
 * Never presented as fact.
 */

import type { MemoryEvidence } from "@/lib/ucme/UCMETypes";
import type { ReasoningHypothesis } from "./MRETypes";

let _seq = 1;
function hid() { return `hyp-${Date.now()}-${_seq++}`; }

// ── Patterns that trigger hypothesis generation ───────────────────────────────

interface HypothesisPattern {
  name:    string;
  detect:  (evidence: MemoryEvidence[], query: string) => boolean;
  build:   (evidence: MemoryEvidence[], query: string) => Omit<ReasoningHypothesis, "id" | "isHypothesis">;
}

const PATTERNS: HypothesisPattern[] = [

  {
    name:   "single_source",
    detect: (ev) => ev.length === 1,
    build:  (ev) => ({
      statement:    `Based on a single source (${ev[0].providerName}), ${ev[0].summary}`,
      probability:  ev[0].confidence * 0.6,
      evidenceIds:  [ev[0].memoryId],
      limitations:  "Only one memory source found. Result may be incomplete.",
    }),
  },

  {
    name:   "low_confidence",
    detect: (ev) => ev.length > 0 && ev.every(e => e.confidence < 0.5),
    build:  (ev) => ({
      statement:    `Uncertain result for query. Best available: "${ev[0].summary}"`,
      probability:  Math.max(...ev.map(e => e.confidence)) * 0.7,
      evidenceIds:  ev.map(e => e.memoryId),
      limitations:  "All available evidence has confidence below 50%.",
    }),
  },

  {
    name:   "temporal_gap",
    detect: (ev) => {
      if (ev.length < 2) return false;
      const dates = ev.map(e => { try { return new Date(e.lastUpdated).getTime(); } catch { return 0; } }).filter(d => d > 0);
      if (dates.length < 2) return false;
      const maxGapDays = (Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24);
      return maxGapDays > 30;
    },
    build:  (ev) => ({
      statement:    "Evidence spans a significant time gap. Situation may have changed.",
      probability:  0.6,
      evidenceIds:  ev.map(e => e.memoryId),
      limitations:  "Evidence from different time periods. Most recent data preferred.",
    }),
  },
];

export const HypothesisGenerator = {

  /**
   * Generate hypotheses when evidence is incomplete or uncertain.
   * Returns empty array when evidence is sufficient.
   */
  generate(evidence: MemoryEvidence[], query: string): ReasoningHypothesis[] {
    if (evidence.length === 0) {
      return [{
        id:          hid(),
        statement:   `No memory found for: "${query}". This information may not be stored yet.`,
        probability: 0.1,
        evidenceIds: [],
        limitations: "No evidence available. Result is a best-guess placeholder.",
        isHypothesis: true,
      }];
    }

    const triggered = PATTERNS.filter(p => p.detect(evidence, query));
    if (triggered.length === 0) return []; // sufficient evidence — no hypothesis needed

    return triggered.map(p => ({
      id:           hid(),
      ...p.build(evidence, query),
      isHypothesis: true as const,
    }));
  },
};