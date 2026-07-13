/**
 * GIERecommendationEngine.ts — Goal Intelligence Engine
 * Phase 5 · 2026-07-13
 *
 * Generates GIERecommendation objects from goal state.
 * Every recommendation includes explicit reasoning + actionable steps.
 * Read-only — no state mutations, no connector calls.
 */

import type { Goal, GIERecommendation } from "./GIETypes";
import { makeGIEId } from "./GIETypes";

export class GIERecommendationEngine {
  generate(goal: Goal): GIERecommendation[] {
    const recs: GIERecommendation[] = [];
    const monitor = goal.latestMonitor;

    // Blocked → unblock
    if (goal.status === "blocked") {
      recs.push({
        id:             makeGIEId("gierec"),
        generatedAt:    Date.now(),
        goalId:         goal.id,
        type:           "unblock",
        title:          `Unblock "${goal.title}"`,
        reasoning:      `Goal is in BLOCKED status${monitor?.blockedItems.length ? ` — ${monitor.blockedItems.length} blocked item(s): ${monitor.blockedItems.slice(0,2).join(", ")}` : ""}.`,
        priority:       "high",
        actionableSteps: [
          "Identify and resolve blocking dependency",
          "Check connector health for required connectors",
          "Consider reducing scope to unblock immediate progress",
        ],
      });
    }

    // Low progress while executing
    if (goal.status === "executing" && monitor && monitor.progressPct < 20) {
      recs.push({
        id:             makeGIEId("gierec"),
        generatedAt:    Date.now(),
        goalId:         goal.id,
        type:           "reprioritize",
        title:          `Review execution progress for "${goal.title}"`,
        reasoning:      `Goal is executing but progress is only ${monitor.progressPct}%. Execution may be stalled.`,
        priority:       "medium",
        actionableSteps: [
          "Check if first task has started",
          "Verify connector availability",
          "Reduce task scope or split into smaller chunks",
        ],
      });
    }

    // High complexity → decompose further
    if ((goal.decomposition?.complexityScore ?? 0) > 75) {
      recs.push({
        id:             makeGIEId("gierec"),
        generatedAt:    Date.now(),
        goalId:         goal.id,
        type:           "decompose_further",
        title:          `Decompose "${goal.title}" further`,
        reasoning:      `Complexity score is ${goal.decomposition?.complexityScore}/100. High-complexity goals benefit from further decomposition.`,
        priority:       "medium",
        actionableSteps: [
          "Break high-effort tasks into smaller units",
          "Create subgoals for each major objective",
          "Add validation checkpoints between milestones",
        ],
      });
    }

    // Multiple replan events → instability
    if (goal.replanEvents.length >= 3) {
      recs.push({
        id:             makeGIEId("gierec"),
        generatedAt:    Date.now(),
        goalId:         goal.id,
        type:           "reduce_scope",
        title:          `Reduce scope of "${goal.title}"`,
        reasoning:      `Goal has been replanned ${goal.replanEvents.length} times — indicating scope instability or unclear requirements.`,
        priority:       "high",
        actionableSteps: [
          "Narrow goal to a single, well-defined outcome",
          "Defer secondary objectives to follow-up goals",
          "Clarify acceptance criteria before next execution",
        ],
      });
    }

    // Linked learning records → leverage learning
    if (goal.linkedLearningRecords.length > 0) {
      recs.push({
        id:             makeGIEId("gierec"),
        generatedAt:    Date.now(),
        goalId:         goal.id,
        type:           "leverage_learning",
        title:          `Apply learning to "${goal.title}"`,
        reasoning:      `${goal.linkedLearningRecords.length} learning record(s) linked — apply insights to improve planning accuracy.`,
        priority:       "low",
        actionableSteps: [
          "Review linked learning records for relevant patterns",
          "Adjust risk estimates based on observed outcomes",
          "Reuse validated execution patterns from prior goals",
        ],
      });
    }

    // Critical with no decomposition → add dependency analysis
    if (goal.priority === "critical" && !goal.decomposition) {
      recs.push({
        id:             makeGIEId("gierec"),
        generatedAt:    Date.now(),
        goalId:         goal.id,
        type:           "add_dependency",
        title:          `Add dependency analysis for critical goal "${goal.title}"`,
        reasoning:      "Critical goals without dependency analysis are at high risk of unexpected blocking.",
        priority:       "high",
        actionableSteps: [
          "Run goal decomposition",
          "Identify all connector dependencies",
          "Validate dependencies before execution",
        ],
      });
    }

    return recs;
  }
}