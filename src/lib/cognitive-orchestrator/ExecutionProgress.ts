/**
 * ExecutionProgress.ts — Sprint EF-45 · Dynamic Planning Engine
 *
 * SRP: calcular métricas de progresso a partir de um PlanningStateSnapshot.
 *
 * Responde perguntas de progresso que o DynamicPlanningEngine usa
 * para decidir se o plano precisa ser revisado.
 *
 * Imutável — sem side effects.
 */

import type { PlanningStateSnapshot } from "./PlanningState";
import type { CognitivePlan, CognitiveTask } from "./COTypes";

// ── Progress metrics ──────────────────────────────────────────────────────────

export interface ExecutionProgress {
  readonly totalTasks:      number;
  readonly completedCount:  number;
  readonly failedCount:     number;
  readonly skippedCount:    number;
  readonly pendingCount:    number;
  readonly runningCount:    number;
  readonly completionPct:   number;   // 0–100
  readonly isStalled:       boolean;  // all pending tasks blocked by failures
  readonly isComplete:      boolean;  // all tasks done or skipped
  readonly criticalPathBlocked: boolean;  // a task on the critical path failed
  readonly parallelOpportunities: readonly string[][];  // task id groups ready to run in parallel
  readonly readyTaskIds:    readonly string[];           // pending tasks whose deps are all complete
  readonly blockedTaskIds:  readonly string[];           // pending tasks with failed deps
  readonly elapsedMs:       number;
}

// ── Critical path (longest dependency chain) ──────────────────────────────────

function computeCriticalPath(plan: CognitivePlan): Set<string> {
  const taskMap = new Map(plan.tasks.map(t => [t.id, t]));

  function depth(taskId: string, memo: Map<string, number>): number {
    if (memo.has(taskId)) return memo.get(taskId)!;
    const t = taskMap.get(taskId);
    if (!t || t.dependsOn.length === 0) { memo.set(taskId, 0); return 0; }
    const d = 1 + Math.max(...t.dependsOn.map(dep => depth(dep, memo)));
    memo.set(taskId, d);
    return d;
  }

  const memo = new Map<string, number>();
  let maxDepth = 0;
  for (const t of plan.tasks) maxDepth = Math.max(maxDepth, depth(t.id, memo));

  // All tasks at max depth are on the critical path
  const critical = new Set<string>();
  for (const t of plan.tasks) {
    if ((memo.get(t.id) ?? 0) === maxDepth) critical.add(t.id);
  }
  return critical;
}

// ── Ready task finder ─────────────────────────────────────────────────────────

function findReadyTasks(
  plan: CognitivePlan,
  snapshot: PlanningStateSnapshot,
): string[] {
  const completedOrSkipped = new Set<string>();
  for (const [id, rec] of Object.entries(snapshot.taskRecords)) {
    if (rec.status === "completed" || rec.status === "skipped") completedOrSkipped.add(id);
  }

  return plan.tasks
    .filter(t => {
      const rec = snapshot.taskRecords[t.id];
      if (!rec || rec.status !== "pending") return false;
      // All deps must be completed or skipped
      return t.dependsOn.every(dep => completedOrSkipped.has(dep));
    })
    .map(t => t.id);
}

// ── Blocked task finder ───────────────────────────────────────────────────────

function findBlockedTasks(
  plan: CognitivePlan,
  snapshot: PlanningStateSnapshot,
): string[] {
  const failedIds = new Set(
    Object.values(snapshot.taskRecords).filter(r => r.status === "failed").map(r => r.taskId)
  );

  return plan.tasks
    .filter(t => {
      const rec = snapshot.taskRecords[t.id];
      if (!rec || rec.status !== "pending") return false;
      return t.dependsOn.some(dep => failedIds.has(dep));
    })
    .map(t => t.id);
}

// ── Parallel opportunity finder ───────────────────────────────────────────────

function findParallelOpportunities(
  readyIds: string[],
  plan: CognitivePlan,
): string[][] {
  if (readyIds.length < 2) return [];
  const taskMap = new Map(plan.tasks.map(t => [t.id, t]));

  const parallelable = readyIds.filter(id => taskMap.get(id)?.canParallelize);
  if (parallelable.length >= 2) return [parallelable];
  return [];
}

// ── Public API ────────────────────────────────────────────────────────────────

export function computeProgress(
  plan: CognitivePlan,
  snapshot: PlanningStateSnapshot,
): ExecutionProgress {
  const records = Object.values(snapshot.taskRecords);

  const completedCount = records.filter(r => r.status === "completed").length;
  const failedCount    = records.filter(r => r.status === "failed").length;
  const skippedCount   = records.filter(r => r.status === "skipped").length;
  const pendingCount   = records.filter(r => r.status === "pending").length;
  const runningCount   = records.filter(r => r.status === "running" || r.status === "retrying").length;
  const totalTasks     = plan.tasks.length;

  const effectiveDone  = completedCount + skippedCount;
  const completionPct  = totalTasks > 0 ? Math.round((effectiveDone / totalTasks) * 100) : 0;
  const isComplete     = effectiveDone === totalTasks;

  const readyTaskIds   = findReadyTasks(plan, snapshot);
  const blockedTaskIds = findBlockedTasks(plan, snapshot);
  const isStalled      = !isComplete && runningCount === 0 && readyTaskIds.length === 0 && pendingCount > 0;

  const criticalPath   = computeCriticalPath(plan);
  const criticalPathBlocked = [...Object.values(snapshot.taskRecords)]
    .some(r => r.status === "failed" && criticalPath.has(r.taskId));

  const parallelOpportunities = findParallelOpportunities(readyTaskIds, plan);

  return Object.freeze({
    totalTasks,
    completedCount,
    failedCount,
    skippedCount,
    pendingCount,
    runningCount,
    completionPct,
    isStalled,
    isComplete,
    criticalPathBlocked,
    parallelOpportunities,
    readyTaskIds:    Object.freeze(readyTaskIds),
    blockedTaskIds:  Object.freeze(blockedTaskIds),
    elapsedMs:       snapshot.elapsedMs,
  });
}