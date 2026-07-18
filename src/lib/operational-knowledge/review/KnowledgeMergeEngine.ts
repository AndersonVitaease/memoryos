/**
 * KnowledgeMergeEngine.ts
 * Merges similar/duplicate knowledge captures.
 *
 * Authority: ENGINEERING
 * SRP: Merge logic only — no review decisions, no promotion.
 * Sprint: KB-04
 *
 * ALL original records are preserved in historyRefs.
 * Zero information loss. Full audit trail.
 */

import { KnowledgeReviewRegistry } from "./KnowledgeReviewRegistry";
import { KCECaptureStore }         from "../capture/KCECaptureStore";
import type { MergeRecord }        from "./KnowledgeReviewTypes";

function unique(arr: string[]): string[] {
  return [...new Set(arr.map(s => s.toLowerCase().trim()).filter(Boolean))];
}

export const KnowledgeMergeEngine = Object.freeze({

  mergeKeywords(a: string[], b: string[]): string[] {
    return unique([...a, ...b]);
  },

  mergeReferences(a: string[], b: string[]): string[] {
    return unique([...a, ...b]);
  },

  mergeComponents(a: string[], b: string[]): string[] {
    return unique([...a, ...b]);
  },

  mergeFiles(a: string[], b: string[]): string[] {
    return unique([...a, ...b]);
  },

  mergeLessons(primaryId: string, mergedIds: string[], reason = "Duplicate lesson detected"): MergeRecord | null {
    return KnowledgeMergeEngine._merge(primaryId, mergedIds, reason);
  },

  mergeBestPractices(primaryId: string, mergedIds: string[], reason = "Duplicate best practice detected"): MergeRecord | null {
    return KnowledgeMergeEngine._merge(primaryId, mergedIds, reason);
  },

  mergeKnownIssues(primaryId: string, mergedIds: string[], reason = "Duplicate known issue detected"): MergeRecord | null {
    return KnowledgeMergeEngine._merge(primaryId, mergedIds, reason);
  },

  mergeEvidence(primaryId: string, mergedIds: string[], reason = "Duplicate evidence detected"): MergeRecord | null {
    return KnowledgeMergeEngine._merge(primaryId, mergedIds, reason);
  },

  _merge(primaryId: string, mergedIds: string[], reason: string): MergeRecord | null {
    const primary = KCECaptureStore.getById(primaryId);
    if (!primary) return null;

    const allIds  = [primaryId, ...mergedIds];
    const captures = allIds.map(id => KCECaptureStore.getById(id)).filter(Boolean) as any[];

    const allKeywords   = captures.flatMap(c => [...(c.raw.tags ?? []), ...(c.classification?.keywords ?? [])]);
    const allComponents = captures.flatMap(c => c.raw.components ?? []);
    const allFiles      = captures.flatMap(c => c.raw.files      ?? []);
    const allRefs       = captures.flatMap(c => [
      ...(c.classification?.suggestedTargets ?? []),
    ]);

    return KnowledgeReviewRegistry.createMerge({
      primaryId,
      mergedIds,
      mergedKeywords:   unique(allKeywords),
      mergedComponents: unique(allComponents),
      mergedFiles:      unique(allFiles),
      mergedReferences: unique(allRefs),
      historyRefs:      allIds,
      mergedAt:         new Date().toISOString().split("T")[0],
      mergedBy:         "SYSTEM",
      reason,
    });
  },
});