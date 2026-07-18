/**
 * KnowledgeDuplicateDetector.ts
 * Detects duplicate knowledge captures using multi-signal similarity scoring.
 *
 * Authority: ENGINEERING
 * SRP: Duplicate detection only — no storage, no review, no promotion.
 * Sprint: KB-04
 *
 * All scores are deterministic. Zero AI dependency.
 */

import type { DuplicateMatch } from "./KnowledgeReviewTypes";
import type { KCECapture }    from "../capture/KCETypes";

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(s: string): string { return s.toLowerCase().trim(); }
function tokenize(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[\s,._\-/()]+/).filter(t => t.length > 2));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = [...a].filter(t => b.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function arraySimilarity(a: string[], b: string[]): number {
  return jaccardSimilarity(new Set(a.map(normalize)), new Set(b.map(normalize)));
}

function stringSimilarity(a: string, b: string): number {
  return jaccardSimilarity(tokenize(a), tokenize(b));
}

// ── Detector ──────────────────────────────────────────────────────────────────

export const KnowledgeDuplicateDetector = Object.freeze({

  compareTitles(a: KCECapture, b: KCECapture): number {
    return stringSimilarity(a.raw.title, b.raw.title);
  },

  compareKeywords(a: KCECapture, b: KCECapture): number {
    const kA = [...(a.raw.tags ?? []), ...(a.classification?.keywords ?? [])];
    const kB = [...(b.raw.tags ?? []), ...(b.classification?.keywords ?? [])];
    return arraySimilarity(kA, kB);
  },

  compareComponents(a: KCECapture, b: KCECapture): number {
    return arraySimilarity(a.raw.components ?? [], b.raw.components ?? []);
  },

  compareFiles(a: KCECapture, b: KCECapture): number {
    return arraySimilarity(a.raw.files ?? [], b.raw.files ?? []);
  },

  compareRootCause(a: KCECapture, b: KCECapture): number {
    return stringSimilarity(a.raw.why, b.raw.why);
  },

  compareSolution(a: KCECapture, b: KCECapture): number {
    return stringSimilarity(a.raw.how, b.raw.how);
  },

  calculateSimilarity(a: KCECapture, b: KCECapture): DuplicateMatch {
    const titleSim       = KnowledgeDuplicateDetector.compareTitles(a, b);
    const keywordOverlap = KnowledgeDuplicateDetector.compareKeywords(a, b);
    const componentOverlap = KnowledgeDuplicateDetector.compareComponents(a, b);
    const fileSim        = KnowledgeDuplicateDetector.compareFiles(a, b);
    const rootCauseSim   = KnowledgeDuplicateDetector.compareRootCause(a, b);
    const solutionSim    = KnowledgeDuplicateDetector.compareSolution(a, b);

    // Weighted composite score
    const overall =
      titleSim        * 0.30 +
      keywordOverlap  * 0.20 +
      rootCauseSim    * 0.25 +
      solutionSim     * 0.15 +
      componentOverlap* 0.07 +
      fileSim         * 0.03;

    return {
      originalId:           a.id,
      duplicateId:          b.id,
      titleSimilarity:      Math.round(titleSim * 100) / 100,
      keywordOverlap:       Math.round(keywordOverlap * 100) / 100,
      componentOverlap:     Math.round(componentOverlap * 100) / 100,
      fileSimilarity:       Math.round(fileSim * 100) / 100,
      rootCauseSimilarity:  Math.round(rootCauseSim * 100) / 100,
      solutionSimilarity:   Math.round(solutionSim * 100) / 100,
      overallScore:         Math.round(overall * 100) / 100,
      mergeRecommended:     overall >= 0.55,
    };
  },

  /**
   * Find all duplicates for a given capture from a pool.
   * Threshold: overallScore >= 0.40.
   */
  findDuplicates(target: KCECapture, pool: KCECapture[]): DuplicateMatch[] {
    return pool
      .filter(c => c.id !== target.id)
      .map(c => KnowledgeDuplicateDetector.calculateSimilarity(target, c))
      .filter(m => m.overallScore >= 0.40)
      .sort((a, b) => b.overallScore - a.overallScore);
  },
});