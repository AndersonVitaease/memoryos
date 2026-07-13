/**
 * GoalReplanner.ts — Goal Intelligence Engine
 * Phase 5 · 2026-07-13
 *
 * Evaluates goals whenever new knowledge or learning arrives.
 * Detects priority changes, new risks, opportunities, dependency changes.
 * Generates ReplanEvents with explicit reasoning — no opaque logic.
 * Read-only — produces events, never modifies goals.
 */

import type { Goal, ReplanEvent, ReplanTrigger } from "./GIETypes";
import { makeGIEId } from "./GIETypes";

export interface ReplanInput {
  trigger: ReplanTrigger;
  description: string;
  knowledgeUpdated?: boolean;
  learningUpdated?: boolean;
  newRisks?: string[];
  newOpportunities?: string[];
  dependencyChanges?: string[];
}

export class GoalReplanner {
  evaluateGoal(goal: Goal, input: ReplanInput): ReplanEvent | null {
    // Don't replan completed/cancelled/archived goals
    if (goal.status === "completed" || goal.status === "cancelled" || goal.status === "archived") {
      return null;
    }

    const newRisks: string[]         = input.newRisks ?? [];
    const newOpps: string[]          = input.newOpportunities ?? [];
    const depChanges: string[]       = input.dependencyChanges ?? [];
    let priorityChanged              = false;
    const reasoning: string[]        = [];

    // Priority escalation conditions
    if (goal.priority === "high" && newRisks.length > 1) {
      priorityChanged = true;
      reasoning.push(`Escalating to critical — ${newRisks.length} new risks detected`);
    }

    if (input.learningUpdated && goal.replanEvents.length === 0) {
      reasoning.push("First learning update — re-evaluating decomposition accuracy");
    }

    if (input.knowledgeUpdated) {
      reasoning.push("Knowledge graph updated — checking for new dependencies and opportunities");
    }

    if (depChanges.length > 0) {
      reasoning.push(`${depChanges.length} dependency change(s): ${depChanges.slice(0, 2).join(", ")}`);
    }

    if (newOpps.length > 0) {
      reasoning.push(`${newOpps.length} new opportunity(ies): ${newOpps.slice(0, 2).join(", ")}`);
    }

    // Progress stall detection
    const monitor = goal.latestMonitor;
    if (monitor && monitor.progressPct < 10 && goal.status === "executing") {
      newRisks.push("Progress stall detected — goal executing but no measurable progress");
      reasoning.push("Progress stall: no advancement after execution started");
    }

    // Only emit replan if there is something worth noting
    if (reasoning.length === 0 && newRisks.length === 0 && newOpps.length === 0 && depChanges.length === 0) {
      return null;
    }

    return Object.freeze({
      id:                       makeGIEId("replan"),
      goalId:                   goal.id,
      triggeredAt:              Date.now(),
      trigger:                  input.trigger,
      description:              input.description,
      priorityChanged,
      newRisks,
      newOpportunities:         newOpps,
      dependencyChanges:        depChanges,
      updatedDecompositionId:   null,
      reasoning:                reasoning.join(". ") || "Routine replan evaluation.",
    });
  }

  evaluateAll(goals: Goal[], input: ReplanInput): Map<string, ReplanEvent> {
    const out = new Map<string, ReplanEvent>();
    for (const g of goals) {
      const ev = this.evaluateGoal(g, input);
      if (ev) out.set(g.id, ev);
    }
    return out;
  }
}