/**
 * OutcomeEvaluator.ts — Cognitive Learning Engine
 * Beta-03.2 · 2026-07-13
 *
 * Compares ExecutionPlan (expected) vs ExecutionRecord (observed).
 * Produces a structured OutcomeComparison — no connector calls, no side effects.
 */

import type { ExecutionPlan, ExecutionRecord, PlanStep, StepExecutionResult } from "../cognitive-dev-loop/CDLTypes";
import type { OutcomeComparison, StepComparison, DeviationType, OutcomeStatus } from "./CLETypes";
import { makeCLEId } from "./CLETypes";

function classifyDeviation(
  step: PlanStep,
  result: StepExecutionResult,
): { deviation: DeviationType; magnitude: number } {
  if (result.status === "failed" && result.error) {
    return { deviation: "step_failed", magnitude: 1.0 };
  }
  if (result.status === "skipped") {
    return { deviation: "step_skipped", magnitude: 0.5 };
  }
  if (result.warnings.length > 0) {
    return { deviation: "unexpected_warning", magnitude: 0.2 };
  }
  const ratio = result.durationMs / Math.max(step.estimatedDurationMs, 1);
  if (ratio > 2.0) {
    return { deviation: "duration_over", magnitude: Math.min((ratio - 1) / 5, 1.0) };
  }
  if (ratio < 0.1 && result.durationMs < 10) {
    return { deviation: "duration_under", magnitude: 0.1 };
  }
  return { deviation: "none", magnitude: 0.0 };
}

export class OutcomeEvaluator {
  evaluate(plan: ExecutionPlan, record: ExecutionRecord): OutcomeComparison {
    const stepMap = new Map<string, StepExecutionResult>();
    for (const r of record.stepResults) stepMap.set(r.stepId, r);

    const stepComparisons: StepComparison[] = plan.steps.map(step => {
      const result = stepMap.get(step.id);
      if (!result) {
        return {
          stepId: step.id, stepTitle: step.title,
          expectedConnector: step.connector, expectedDurationMs: step.estimatedDurationMs,
          expectedImpact: step.expectedImpact, observedStatus: "missing",
          observedDurationMs: 0, observedError: "Step result not found",
          observedWarnings: [], deviation: "step_skipped", deviationMagnitude: 0.8,
          met: false,
        } satisfies StepComparison;
      }
      const { deviation, magnitude } = classifyDeviation(step, result);
      return {
        stepId: step.id, stepTitle: step.title,
        expectedConnector: step.connector, expectedDurationMs: step.estimatedDurationMs,
        expectedImpact: step.expectedImpact, observedStatus: result.status,
        observedDurationMs: result.durationMs, observedError: result.error,
        observedWarnings: result.warnings, deviation, deviationMagnitude: magnitude,
        met: result.status === "complete",
      } satisfies StepComparison;
    });

    const stepsMet     = stepComparisons.filter(s => s.met).length;
    const stepsFailed  = stepComparisons.filter(s => s.observedStatus === "failed").length;
    const stepsSkipped = stepComparisons.filter(s => s.observedStatus === "skipped" || s.observedStatus === "missing").length;
    const successRate  = plan.steps.length > 0 ? stepsMet / plan.steps.length : 0;

    const totalExpectedMs = plan.steps.reduce((s, x) => s + x.estimatedDurationMs, 0);
    const totalObservedMs = record.durationMs;
    const durationDeviation = totalExpectedMs > 0 ? totalObservedMs / totalExpectedMs : 1;

    const unexpectedEffects: string[] = [];
    const missingEffects: string[] = [];

    for (const s of stepComparisons) {
      if (s.observedWarnings.length > 0) unexpectedEffects.push(`Step "${s.stepTitle}": ${s.observedWarnings.join(", ")}`);
      if (!s.met && s.expectedImpact) missingEffects.push(`Expected: ${s.expectedImpact}`);
    }

    let overallOutcome: OutcomeStatus;
    if (record.overallSuccess && stepsFailed === 0) {
      overallOutcome = unexpectedEffects.length > 0 ? "UNEXPECTED_EFFECT" : "SUCCESS";
    } else if (successRate >= 0.5) {
      overallOutcome = missingEffects.length > 0 ? "MISSING_EFFECT" : "PARTIAL_SUCCESS";
    } else {
      overallOutcome = "FAILURE";
    }

    return {
      id:                 makeCLEId("outcome"),
      comparedAt:         Date.now(),
      executionId:        record.id,
      planId:             plan.id,
      overallOutcome,
      stepsCompared:      stepComparisons.length,
      stepsMet,
      stepsFailed,
      stepsSkipped,
      stepComparisons,
      totalExpectedMs,
      totalObservedMs,
      durationDeviation,
      unexpectedEffects,
      missingEffects,
      successRate,
    };
  }
}