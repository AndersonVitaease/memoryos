/**
 * RecommendationEngine.ts — Cognitive Learning Engine
 * Beta-03.2 · 2026-07-13
 *
 * Generates actionable recommendations from LearningRecords.
 * Every recommendation includes explicit reasoning — no opaque suggestions.
 * Read-only — no connector calls.
 */

import type { LearningRecord, CLERecommendation, RecommendationCategory, LearningEvidence } from "./CLETypes";
import { makeCLEId } from "./CLETypes";

function makeEvidence(src: string, ref: string, obs: unknown, exp: unknown, expl: string): LearningEvidence {
  return { source: src, referenceId: ref, observedValue: obs, expectedValue: exp, explanation: expl };
}

export class RecommendationEngine {
  generate(records: LearningRecord[]): CLERecommendation[] {
    const recs: CLERecommendation[] = [];

    for (const lr of records) {
      // ── Failure pattern → avoid repeated mistake ────────────────────────
      if (lr.learningType === "failure_pattern") {
        recs.push({
          id:            makeCLEId("rec"),
          generatedAt:   Date.now(),
          category:      "avoid_mistake" as RecommendationCategory,
          title:         `Avoid repeating: ${lr.title}`,
          reasoning:     `A failure pattern was detected with importance "${lr.importance}". Root cause: ${lr.rootCause}`,
          priority:      lr.importance === "critical" || lr.importance === "high" ? "high" : "medium",
          evidence:      lr.evidence,
          actionableSteps: [
            `Review root cause before next execution: ${lr.rootCause}`,
            lr.recommendation,
            "Add a pre-execution check for this condition",
          ],
          linkedLearningId: lr.id,
        });
      }

      // ── Connector reliability → improve connector ────────────────────────
      if (lr.learningType === "connector_reliability") {
        const connTag = lr.tags.find(t => ["github", "base44", "github_connector", "base44_connector"].includes(t));
        recs.push({
          id:            makeCLEId("rec"),
          generatedAt:   Date.now(),
          category:      "improve_connector",
          title:         `Improve ${connTag ?? "connector"} reliability`,
          reasoning:     `Connector unreliability detected: ${lr.description}. Confidence delta applied: ${lr.confidenceDelta.toFixed(2)}.`,
          priority:      "high",
          evidence:      [makeEvidence("learning_record", lr.id, lr.observedResult, lr.expectedResult, lr.description)],
          actionableSteps: [
            `Validate ${connTag ?? "connector"} credentials and scopes`,
            "Run connector health check before planning",
            "Add retry logic for transient connector failures",
            lr.recommendation,
          ],
          linkedLearningId: lr.id,
        });
      }

      // ── Performance insight → improve planning ───────────────────────────
      if (lr.learningType === "performance_insight") {
        recs.push({
          id:            makeCLEId("rec"),
          generatedAt:   Date.now(),
          category:      "improve_planning",
          title:         `Calibrate duration estimates`,
          reasoning:     `Observed duration deviated significantly from planned. ${lr.description}`,
          priority:      "medium",
          evidence:      lr.evidence,
          actionableSteps: [
            "Use observed p95 durations from execution history",
            "Add 20% buffer to connector-dependent steps",
            "Track duration per connector separately",
          ],
          linkedLearningId: lr.id,
        });
      }

      // ── Planning accuracy / unexpected effects → increase validation ─────
      if (lr.learningType === "planning_accuracy" && lr.title.includes("unexpected")) {
        recs.push({
          id:            makeCLEId("rec"),
          generatedAt:   Date.now(),
          category:      "increase_validation",
          title:         "Add pre-execution side-effect validation",
          reasoning:     `${lr.unexpectedEffects?.length ?? lr.evidence.length} unexpected effect(s) observed. Planning model missing connector-level detail.`,
          priority:      "medium",
          evidence:      lr.evidence,
          actionableSteps: [
            "Run dry-run mode before full execution",
            "Validate connector operation idempotency",
            "Add warning-detection step to pre-execution checklist",
          ],
          linkedLearningId: lr.id,
        });
      }

      // ── Success pattern → reuse solution ────────────────────────────────
      if (lr.learningType === "success_pattern" && lr.importance === "low") {
        recs.push({
          id:            makeCLEId("rec"),
          generatedAt:   Date.now(),
          category:      "reuse_solution",
          title:         "Reuse validated execution pattern",
          reasoning:     `This execution succeeded fully. The plan can be reused as a template for similar operations.`,
          priority:      "low",
          evidence:      lr.evidence,
          actionableSteps: [
            "Store this plan as a template in the knowledge graph",
            "Tag successful steps for future reference",
          ],
          linkedLearningId: lr.id,
        });
      }
    }

    // ── Cross-record: risk calibration ────────────────────────────────────
    const failures = records.filter(r => r.learningType === "failure_pattern").length;
    if (failures > 1) {
      recs.push({
        id:            makeCLEId("rec"),
        generatedAt:   Date.now(),
        category:      "reduce_risk",
        title:         `Reduce risk — ${failures} failure patterns detected`,
        reasoning:     `Multiple failure patterns in the same execution session indicate systemic risk. Reduce plan scope or add validation gates.`,
        priority:      "high",
        evidence:      [makeEvidence("aggregate", "session", failures, 0, `${failures} failure patterns detected in this session`)],
        actionableSteps: [
          "Break large plans into smaller validated increments",
          "Add approval checkpoint after each connector-dependent step",
          "Run a health check on all required connectors before execution",
        ],
        linkedLearningId: records.find(r => r.learningType === "failure_pattern")?.id ?? "",
      });
    }

    return recs;
  }
}