/**
 * LearningRecordFactory.ts — Cognitive Learning Engine
 * Beta-03.2 · 2026-07-13
 *
 * Generates immutable LearningRecord objects from OutcomeComparison.
 * Every record includes root cause, evidence, and provenance.
 * Read-only — no connector calls, no state mutation.
 */

import type { OutcomeComparison, LearningRecord, LearningType, LearningImportance, LearningEvidence, LearningProvenance } from "./CLETypes";
import { makeCLEId } from "./CLETypes";

const ENGINE_VERSION = "1.0.0";

function makeProvenance(cdlReportId: string | null): LearningProvenance {
  return {
    engineVersion:   ENGINE_VERSION,
    generatedBy:     "CognitiveLearningEngine",
    cdlReportId,
    generatedAt:     Date.now(),
  };
}

function makeEvidence(source: string, refId: string, obs: unknown, exp: unknown, explanation: string): LearningEvidence {
  return { source, referenceId: refId, observedValue: obs, expectedValue: exp, explanation };
}

export class LearningRecordFactory {
  generate(outcome: OutcomeComparison, cdlReportId: string | null = null): LearningRecord[] {
    const records: LearningRecord[] = [];
    const prov = makeProvenance(cdlReportId);

    // ── Record 1: Overall outcome ──────────────────────────────────────────

    const successPct = Math.round(outcome.successRate * 100);
    const outcomeLearningType: LearningType = outcome.overallOutcome === "SUCCESS" ? "success_pattern"
      : outcome.overallOutcome === "FAILURE" ? "failure_pattern" : "planning_accuracy";

    const importance: LearningImportance = outcome.overallOutcome === "FAILURE" ? "high"
      : outcome.overallOutcome === "PARTIAL_SUCCESS" ? "medium" : "low";

    records.push(Object.freeze({
      id:             makeCLEId("lr"),
      createdAt:      Date.now(),
      executionId:    outcome.executionId,
      planId:         outcome.planId,
      learningType:   outcomeLearningType,
      importance,
      title:          `Execution outcome: ${outcome.overallOutcome} (${successPct}% steps met)`,
      description:    `Evaluated ${outcome.stepsCompared} steps. ${outcome.stepsMet} met expectations, ${outcome.stepsFailed} failed, ${outcome.stepsSkipped} skipped.`,
      expectedResult: `All ${outcome.stepsCompared} steps complete successfully`,
      observedResult: `${outcome.stepsMet}/${outcome.stepsCompared} steps met, ${outcome.stepsFailed} failed`,
      deviation:      outcome.overallOutcome === "SUCCESS" ? "none" : `${outcome.stepsFailed} step(s) failed, ${outcome.stepsSkipped} skipped`,
      rootCause:      outcome.stepsFailed > 0
        ? `${outcome.stepsFailed} step(s) returned error status. Review connector responses.`
        : outcome.stepsSkipped > 0
        ? `${outcome.stepsSkipped} step(s) were skipped — plan may have overestimated availability.`
        : "All steps completed — no root cause to investigate.",
      confidenceDelta: outcome.overallOutcome === "SUCCESS" ? 0.05 : outcome.overallOutcome === "FAILURE" ? -0.1 : -0.02,
      riskDelta:       outcome.overallOutcome === "SUCCESS" ? -0.03 : outcome.overallOutcome === "FAILURE" ? 0.1 : 0.02,
      recommendation:  outcome.overallOutcome === "SUCCESS"
        ? "Continue using current planning approach — validated by execution."
        : outcome.overallOutcome === "FAILURE"
        ? "Review failed steps before next execution. Consider reducing plan scope."
        : "Investigate skipped/failed steps. Plan may need risk-level adjustment.",
      evidence: [makeEvidence("outcome_comparison", outcome.id, outcome.successRate, 1.0,
        `Success rate ${successPct}% vs expected 100%`)],
      provenance: prov,
      tags: [outcome.overallOutcome, `steps:${outcome.stepsCompared}`, `success:${successPct}%`],
    } as LearningRecord));

    // ── Record 2: Duration performance ────────────────────────────────────

    if (outcome.durationDeviation > 1.5 || outcome.durationDeviation < 0.5) {
      const over = outcome.durationDeviation > 1.5;
      records.push(Object.freeze({
        id:             makeCLEId("lr"),
        createdAt:      Date.now(),
        executionId:    outcome.executionId,
        planId:         outcome.planId,
        learningType:   "performance_insight",
        importance:     over ? "medium" : "low",
        title:          `Execution ${over ? "significantly slower" : "faster"} than planned`,
        description:    `Observed ${outcome.totalObservedMs}ms vs expected ${outcome.totalExpectedMs}ms (${(outcome.durationDeviation * 100).toFixed(0)}%).`,
        expectedResult: `Total duration ~${outcome.totalExpectedMs}ms`,
        observedResult: `Total duration ${outcome.totalObservedMs}ms`,
        deviation:      `Duration ratio: ${outcome.durationDeviation.toFixed(2)}`,
        rootCause:      over
          ? "Connector operations took longer than estimated. Consider increasing estimated durations in future plans."
          : "Operations completed faster than estimated — estimates may be conservative.",
        confidenceDelta: over ? -0.02 : 0.01,
        riskDelta:       over ? 0.02 : -0.01,
        recommendation:  over
          ? "Calibrate planning estimates with observed p95 durations."
          : "Planning estimates are conservative — can reduce buffer in low-risk operations.",
        evidence: [makeEvidence("duration_analysis", outcome.id, outcome.totalObservedMs, outcome.totalExpectedMs,
          `Duration deviation factor: ${outcome.durationDeviation.toFixed(2)}`)],
        provenance: prov,
        tags: ["performance", "duration", over ? "over_budget" : "under_budget"],
      } as LearningRecord));
    }

    // ── Record 3: Per-step failures ────────────────────────────────────────

    for (const sc of outcome.stepComparisons.filter(s => !s.met && s.observedError)) {
      records.push(Object.freeze({
        id:             makeCLEId("lr"),
        createdAt:      Date.now(),
        executionId:    outcome.executionId,
        planId:         outcome.planId,
        learningType:   "connector_reliability",
        importance:     "high",
        title:          `Step failure: "${sc.stepTitle}"`,
        description:    `Step using connector "${sc.expectedConnector}" failed: ${sc.observedError}`,
        expectedResult: sc.expectedImpact,
        observedResult: `Step failed — ${sc.observedError}`,
        deviation:      `Step deviation type: ${sc.deviation}`,
        rootCause:      `Connector "${sc.expectedConnector}" operation did not complete. Error: ${sc.observedError}`,
        confidenceDelta: -0.05,
        riskDelta:       0.05,
        recommendation:  `Verify "${sc.expectedConnector}" connector health before planning steps that depend on it.`,
        evidence: [makeEvidence("step_comparison", sc.stepId, sc.observedStatus, "complete",
          `Step "${sc.stepTitle}" expected complete, got ${sc.observedStatus}: ${sc.observedError}`)],
        provenance: prov,
        tags: ["step_failure", sc.expectedConnector, "connector_reliability"],
      } as LearningRecord));
    }

    // ── Record 4: Unexpected warnings ─────────────────────────────────────

    if (outcome.unexpectedEffects.length > 0) {
      records.push(Object.freeze({
        id:             makeCLEId("lr"),
        createdAt:      Date.now(),
        executionId:    outcome.executionId,
        planId:         outcome.planId,
        learningType:   "planning_accuracy",
        importance:     "medium",
        title:          `${outcome.unexpectedEffects.length} unexpected effect(s) observed`,
        description:    `Execution produced warnings/effects not predicted by the plan: ${outcome.unexpectedEffects.slice(0, 3).join("; ")}`,
        expectedResult: "Clean execution with no warnings",
        observedResult: `${outcome.unexpectedEffects.length} unexpected effect(s)`,
        deviation:      "Plan did not anticipate all side effects",
        rootCause:      "Planning model may be missing connector-level detail. Risk assessment should include warning probability.",
        confidenceDelta: -0.03,
        riskDelta:       0.03,
        recommendation:  "Add warning-detection step to pre-execution validation. Improve plan completeness.",
        evidence: outcome.unexpectedEffects.map((e, i) =>
          makeEvidence("unexpected_effect", `ue_${i}`, e, null, `Unexpected: ${e}`)),
        provenance: prov,
        tags: ["unexpected_effect", "planning_accuracy"],
      } as LearningRecord));
    }

    return records;
  }
}