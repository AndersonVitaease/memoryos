/**
 * KCEPipeline.ts
 * Orchestrates the full Knowledge Capture Engine pipeline:
 *   RawCapture → Store → Classify → Promote → Result
 *
 * Authority: ENGINEERING
 * SRP: Pipeline orchestration only — delegates to Store, Classifier, Promoter.
 * Sprint: KB-03
 */

import { KCECaptureStore }  from "./KCECaptureStore";
import { KCEClassifier }    from "./KCEClassifier";
import { KCEPromoter }      from "./KCEPromoter";
import type { KCERawCapture, KCEPipelineResult, KCEStats } from "./KCETypes";

export const KCEPipeline = Object.freeze({
  /**
   * Run the full pipeline for a single raw capture.
   */
  run(raw: KCERawCapture): KCEPipelineResult {
    const start  = Date.now();
    const errors: string[] = [];

    // 1. Store
    const capture = KCECaptureStore.create(raw);

    // 2. Classify
    const classification = KCEClassifier.classify(capture.id, raw);
    const classified     = KCECaptureStore.classify(capture.id, classification);
    if (!classified) {
      errors.push(`classify: capture ${capture.id} not found in store after create`);
      return { capture, classification, promotion: null, durationMs: Date.now() - start, success: false, errors };
    }

    // 3. Promote
    let promotion = null;
    if (classification.suggestedTargets.length > 0) {
      promotion = KCEPromoter.promote(classified, classification);
      KCECaptureStore.promote(capture.id, promotion);
    }

    const final = KCECaptureStore.getById(capture.id)!;

    return {
      capture:        final,
      classification,
      promotion,
      durationMs:     Date.now() - start,
      success:        errors.length === 0,
      errors,
    };
  },

  /**
   * Get runtime stats across all captures.
   */
  getStats(): KCEStats {
    const all = KCECaptureStore.getAll();

    const byStatus:   Partial<Record<string, number>> = {};
    const byPriority: Partial<Record<string, number>> = {};
    const bySource:   Partial<Record<string, number>> = {};
    const targetCount: Record<string, number>         = {};

    let totalConfidence = 0;
    let confCount       = 0;

    for (const c of all) {
      byStatus[c.status]        = (byStatus[c.status]             ?? 0) + 1;
      byPriority[c.raw.priority]= (byPriority[c.raw.priority]     ?? 0) + 1;
      bySource[c.raw.sourceType]= (bySource[c.raw.sourceType]     ?? 0) + 1;
      if (c.classification) {
        totalConfidence += c.classification.confidence;
        confCount++;
        for (const t of c.classification.suggestedTargets) {
          targetCount[t] = (targetCount[t] ?? 0) + 1;
        }
      }
    }

    const topTargets = Object.entries(targetCount)
      .sort(([,a],[,b]) => b - a).slice(0, 5)
      .map(([target, count]) => ({ target: target as any, count }));

    return {
      total:          all.length,
      byStatus:       byStatus as any,
      byPriority:     byPriority as any,
      bySource:       bySource as any,
      promotedCount:  all.filter(c => c.status === "PROMOTED").length,
      avgConfidence:  confCount > 0 ? Math.round((totalConfidence / confCount) * 100) / 100 : 0,
      topTargets,
      recentCaptures: all.slice(0, 5),
    };
  },
});