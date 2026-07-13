/**
 * GoalMonitor.ts — Goal Intelligence Engine
 * Phase 5 · 2026-07-13
 *
 * Continuously evaluates goal progress, risk, dependencies, and completion prediction.
 * Read-only — observes goal state, never modifies it.
 */

import type { Goal, GoalMonitorSnapshot, ProgressSample } from "./GIETypes";
import { makeGIEId } from "./GIETypes";

function addDays(ms: number, days: number): string {
  return new Date(ms + days * 86400000).toISOString().split("T")[0];
}

export class GoalMonitor {
  private _history: Map<string, ProgressSample[]> = new Map();

  snapshot(goal: Goal): GoalMonitorSnapshot {
    const decomp    = goal.decomposition;
    const tasks     = decomp?.tasks ?? [];
    const totalItems = decomp?.totalItems ?? 1;

    // Estimate progress from status + transitions
    let progressPct = 0;
    let completedItems = 0;

    if (goal.status === "completed") {
      progressPct = 100; completedItems = totalItems;
    } else if (goal.status === "executing" || goal.status === "waiting") {
      // Count transitions as proxy for progress
      const execTransitions = goal.transitions.filter(t => t.to !== "created" && t.to !== "validated").length;
      progressPct = Math.min(80, execTransitions * 15);
      completedItems = Math.floor(progressPct / 100 * totalItems);
    } else if (goal.status === "planned") {
      progressPct = 10;
    } else if (goal.status === "validated") {
      progressPct = 5;
    } else if (goal.status === "blocked") {
      progressPct = Math.max(0, (goal.latestMonitor?.progressPct ?? 0));
    }

    // Determine risk
    const recentReplans = goal.replanEvents.filter(e => Date.now() - e.triggeredAt < 86400000 * 7).length;
    const riskLevel: GoalMonitorSnapshot["riskLevel"] =
      goal.status === "blocked"             ? "high"
      : recentReplans >= 3                  ? "high"
      : recentReplans >= 1                  ? "medium"
      : goal.priority === "critical"        ? "medium"
      : "low";

    // Blocked items
    const blockedItems: string[] = [];
    if (goal.status === "blocked") {
      blockedItems.push(...tasks.slice(0, 2).map(t => t.title));
    }

    // Confidence: higher when progressing, lower when blocked
    const confidence =
      goal.status === "completed"  ? 1.0
      : goal.status === "blocked"  ? 0.2
      : goal.status === "cancelled"? 0.0
      : Math.max(0.3, Math.min(0.95, 0.5 + progressPct / 200));

    // Completion prediction
    let completionPrediction: string | null = null;
    if (goal.status !== "completed" && goal.status !== "cancelled" && decomp) {
      const remaining = Math.max(1, decomp.estimatedCompletionDays * (1 - progressPct / 100));
      completionPrediction = addDays(Date.now(), Math.ceil(remaining));
    }

    // Warnings
    const warnings: string[] = [];
    if (recentReplans > 2) warnings.push(`Goal replanned ${recentReplans}x recently — instability detected`);
    if (goal.status === "blocked") warnings.push("Goal is blocked — dependencies unresolved");
    if (progressPct === 0 && goal.status === "executing") warnings.push("Goal executing but no progress detected");

    const sample: ProgressSample = {
      sampledAt: Date.now(), progressPct, completedItems, totalItems,
      confidence, blockedCount: blockedItems.length,
    };

    const history = this._history.get(goal.id) ?? [];
    history.push(sample);
    this._history.set(goal.id, history);

    return {
      id:                  makeGIEId("monitor"),
      goalId:              goal.id,
      snapshotAt:          Date.now(),
      progressPct,
      confidence,
      riskLevel,
      blockedItems,
      completionPrediction,
      progressHistory:     [...history].slice(-10),
      warnings,
    };
  }
}