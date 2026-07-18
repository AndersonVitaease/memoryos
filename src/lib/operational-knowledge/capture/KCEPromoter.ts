/**
 * KCEPromoter.ts
 * Promotes classified captures to KB targets, generating new entry IDs.
 *
 * Authority: ENGINEERING
 * SRP: Promotion only — translates classification into actionable KB IDs.
 * Sprint: KB-03
 *
 * Does NOT write files. Does NOT modify Official Library.
 * Generates ID assignments that could be applied to KB documents in future sprints.
 */

import type { KCECapture, KCEClassification, KCEPromotion, KCECaptureTarget } from "./KCETypes";

// Simple sequential counters per target namespace
const counters: Record<string, number> = {};

function nextTargetId(prefix: string): string {
  counters[prefix] = (counters[prefix] ?? 100) + 1;
  return `${prefix}-${counters[prefix]}`;
}

function nowIso(): string {
  return new Date().toISOString().split("T")[0];
}

function buildSummary(capture: KCECapture, targets: KCECaptureTarget[]): string {
  return `Promoted "${capture.raw.title}" → [${targets.join(", ")}] on ${nowIso()}`;
}

export const KCEPromoter = Object.freeze({
  /**
   * Promote a classified capture. Returns a KCEPromotion record.
   * Does not persist — caller is responsible for storing via KCECaptureStore.
   */
  promote(capture: KCECapture, classification: KCEClassification): KCEPromotion {
    const generatedIds: string[] = [];
    const promotedTargets: KCECaptureTarget[] = [...classification.suggestedTargets];

    for (const target of promotedTargets) {
      switch (target) {
        case "LESSONS_LEARNED":
          generatedIds.push(nextTargetId("LL"));
          break;
        case "ANTI_PATTERNS":
          generatedIds.push(nextTargetId("AP"));
          break;
        case "BEST_PRACTICES":
          generatedIds.push(nextTargetId("BP"));
          break;
        case "KNOWN_ISSUES":
          generatedIds.push(nextTargetId("KI"));
          break;
        case "TROUBLESHOOTING":
          generatedIds.push(nextTargetId("TG"));
          break;
        case "ENGINEERING_JOURNAL":
          generatedIds.push(nextTargetId("EJ"));
          break;
        case "EVIDENCE":
          generatedIds.push(nextTargetId("EVD"));
          break;
        default:
          break;
      }
    }

    return {
      captureId:       capture.id,
      promotedTargets,
      generatedIds,
      promotedAt:      nowIso(),
      summary:         buildSummary(capture, promotedTargets),
    };
  },

  /**
   * Reset counters (for testing).
   */
  resetCounters(): void {
    for (const key of Object.keys(counters)) delete counters[key];
  },
});