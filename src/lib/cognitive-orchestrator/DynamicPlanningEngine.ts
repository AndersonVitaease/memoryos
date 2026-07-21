/**
 * DynamicPlanningEngine.ts — Sprint EF-45 · Dynamic Planning Engine
 *
 * SRP: avaliar continuamente um CognitivePlan + PlanningState
 *      e produzir PlanningRevisions quando o plano precisa mudar.
 *
 * NÃO executa tarefas.
 * NÃO chama conectores.
 * NÃO modifica GoalEngine, PlannerEngine, ConnectorRouter ou ConnectorRuntime.
 *
 * Integração com EF-43:
 *   Input:  CognitivePlan (CognitiveOrchestrator output)
 *           PlanningState (estado atual da execução)
 *   Output: PlanningRevision → caller decide se passa novo plano ao Planner
 *
 * HMR-safe singleton via globalThis.
 */

import type { CognitivePlan, CognitiveTask } from "./COTypes";
import { makeCOId }                           from "./COTypes";
import { PlanningState, type NewInformation } from "./PlanningState";
import { computeProgress, type ExecutionProgress } from "./ExecutionProgress";
import { makeRevision, RevisionLog, type PlanningRevision, type RevisionKind, type RevisionTrigger } from "./PlanningRevision";
import { resolveDependencies }                from "./TaskDependencyResolver";

// ── Rebuild a CognitivePlan from a modified task list ─────────────────────────

function rebuildPlan(original: CognitivePlan, newTasks: readonly CognitiveTask[]): CognitivePlan {
  const resolution = resolveDependencies(newTasks);
  return Object.freeze({
    ...original,
    id:             makeCOId("cplan"),
    tasks:          Object.freeze(newTasks),
    orderedTaskIds: resolution.orderedIds,
    strategy:       resolution.strategy,
    canHandOff:     !resolution.hasCircular && newTasks.length > 0,
    durationMs:     0,
  });
}

// ── Decision rules ────────────────────────────────────────────────────────────

interface EvaluationContext {
  plan:     CognitivePlan;
  state:    PlanningState;
  progress: ExecutionProgress;
  log:      RevisionLog;
  t0:       number;
}

function ruleNoPath(ctx: EvaluationContext): PlanningRevision | null {
  const { plan, progress, t0 } = ctx;
  if (!progress.criticalPathBlocked && !progress.isStalled) return null;

  // Check if we have ANY pending task that can still proceed
  const hasSafeAlternative = progress.readyTaskIds.length > 0;
  if (hasSafeAlternative) return null;

  // Abort only when completely blocked
  return makeRevision({
    startedAt:      t0,
    planId:         plan.id,
    kind:           "abort",
    trigger:        progress.isStalled ? "stalled" : "critical_path_blocked",
    rationale:      progress.isStalled
      ? "Execution stalled: no pending task is ready and no task is running."
      : "Critical path blocked by task failure with no alternative path available.",
    affectedTaskIds: progress.failedCount > 0 ? Object.values(ctx.state.snapshot().taskRecords)
      .filter(r => r.status === "failed").map(r => r.taskId) : [],
    revisedPlan:     null,
    newTaskIds:      [],
    removedTaskIds:  [],
  });
}

function ruleSkipUnnecessaryTasks(ctx: EvaluationContext): PlanningRevision | null {
  const { plan, state, t0 } = ctx;
  const snap = state.snapshot();

  // A task is unnecessary if: it is pending, all its dependents are already completed,
  // and it has no successors that are still pending/running
  const completedIds = new Set(state.completedIds);
  const successorMap = new Map<string, string[]>();
  for (const t of plan.tasks) successorMap.set(t.id, []);
  for (const t of plan.tasks) {
    for (const dep of t.dependsOn) {
      successorMap.get(dep)?.push(t.id);
    }
  }

  const unnecessary = plan.tasks.filter(t => {
    const rec = snap.taskRecords[t.id];
    if (rec?.status !== "pending") return false;
    const successors = successorMap.get(t.id) ?? [];
    // All successors already completed — this task output is no longer needed
    return successors.length > 0 && successors.every(sid => completedIds.has(sid));
  });

  if (unnecessary.length === 0) return null;

  const skipIds = unnecessary.map(t => t.id);
  skipIds.forEach(id => state.markSkipped(id));

  const newTasks = plan.tasks.filter(t => !skipIds.includes(t.id));
  const revisedPlan = rebuildPlan(plan, newTasks);

  return makeRevision({
    startedAt:      t0,
    planId:         plan.id,
    kind:           "skip_task",
    trigger:        "task_became_unnecessary",
    rationale:      `${skipIds.length} task(s) became unnecessary because their successors are already completed.`,
    affectedTaskIds: skipIds,
    revisedPlan,
    newTaskIds:      [],
    removedTaskIds:  skipIds,
  });
}

function ruleParallelOpportunity(ctx: EvaluationContext): PlanningRevision | null {
  const { plan, progress, t0 } = ctx;
  if (progress.parallelOpportunities.length === 0) return null;
  if (ctx.log.hasTrigger("parallel_opportunity_detected")) return null; // already applied once

  const group  = progress.parallelOpportunities[0];
  // Nothing structural to change (tasks already have canParallelize=true),
  // but we emit a revision to inform the caller.
  return makeRevision({
    startedAt:      t0,
    planId:         plan.id,
    kind:           "reorder",
    trigger:        "parallel_opportunity_detected",
    rationale:      `${group.length} tasks are ready and can execute in parallel: ${group.join(", ")}`,
    affectedTaskIds: group,
    revisedPlan:     null,  // no structural change needed
    newTaskIds:      [],
    removedTaskIds:  [],
  });
}

function ruleHandleTaskFailure(ctx: EvaluationContext): PlanningRevision | null {
  const { plan, state, progress, t0 } = ctx;
  if (progress.failedCount === 0) return null;

  const snap     = state.snapshot();
  const failedId = Object.values(snap.taskRecords).find(r => r.status === "failed")?.taskId;
  if (!failedId) return null;

  const failedTask = plan.tasks.find(t => t.id === failedId);
  if (!failedTask) return null;

  const rec = snap.taskRecords[failedId];

  // Retry if < 2 attempts
  if ((rec?.attempts ?? 0) < 2) {
    state.markRetrying(failedId);
    return makeRevision({
      startedAt:      t0,
      planId:         plan.id,
      kind:           "retry_task",
      trigger:        "task_failed",
      rationale:      `Task '${failedTask.title}' failed (attempt ${rec?.attempts ?? 1}). Scheduling retry.`,
      affectedTaskIds: [failedId],
      revisedPlan:     null,
      newTaskIds:      [],
      removedTaskIds:  [],
    });
  }

  // Skip task and unblock successors — remove it from plan
  state.markSkipped(failedId);
  const newTasks   = plan.tasks.filter(t => t.id !== failedId);
  // Remove failed id from all dependsOn lists
  const cleanTasks = newTasks.map(t => ({
    ...t,
    dependsOn: t.dependsOn.filter(dep => dep !== failedId),
  })) as unknown as readonly CognitiveTask[];

  const revisedPlan = rebuildPlan(plan, cleanTasks);

  return makeRevision({
    startedAt:      t0,
    planId:         plan.id,
    kind:           "skip_task",
    trigger:        "task_failed",
    rationale:      `Task '${failedTask.title}' failed after max retries. Removed from plan to unblock successors.`,
    affectedTaskIds: [failedId],
    revisedPlan,
    newTaskIds:      [],
    removedTaskIds:  [failedId],
  });
}

function ruleInjectNewInformation(ctx: EvaluationContext): PlanningRevision | null {
  const { plan, state, t0 } = ctx;
  const snap = state.snapshot();
  if (snap.newInformation.length === 0) return null;
  if (ctx.log.hasTrigger("new_information_injected")) return null;

  // New information may have arrived — emit a revision to surface it.
  // Structural replan is only warranted if information changes the required tasks,
  // which is a GoalEngine/Orchestrator concern. Here we record the signal.
  return makeRevision({
    startedAt:      t0,
    planId:         plan.id,
    kind:           "full_replan",
    trigger:        "new_information_injected",
    rationale:      `${snap.newInformation.length} new information signal(s) received. Full replan recommended via CognitiveOrchestrator.`,
    affectedTaskIds: snap.newInformation.map(i => i.taskId).filter(Boolean) as string[],
    revisedPlan:     null,  // caller must invoke CognitiveOrchestrator.orchestrate() again
    newTaskIds:      [],
    removedTaskIds:  [],
  });
}

// Ordered rules: earlier rules = higher priority
const RULES = [
  ruleHandleTaskFailure,
  ruleInjectNewInformation,
  ruleSkipUnnecessaryTasks,
  ruleParallelOpportunity,
  ruleNoPath,
];

// ── DynamicPlanningEngine ─────────────────────────────────────────────────────

export interface EvaluationResult {
  readonly revision:    PlanningRevision;
  readonly activePlan:  CognitivePlan;   // may be the original or a revised plan
  readonly progress:    ExecutionProgress;
  readonly durationMs:  number;
}

class DynamicPlanningEngineImpl {

  private _logs = new Map<string, RevisionLog>();

  private getLog(planId: string): RevisionLog {
    if (!this._logs.has(planId)) this._logs.set(planId, new RevisionLog());
    return this._logs.get(planId)!;
  }

  /**
   * Evaluate the current plan against execution state.
   * Call this after each task status change.
   */
  evaluate(plan: CognitivePlan, state: PlanningState): EvaluationResult {
    const t0       = Date.now();
    const snap     = state.snapshot();
    const progress = computeProgress(plan, snap);
    const log      = this.getLog(plan.id);

    const ctx: EvaluationContext = { plan, state, progress, log, t0 };

    // Run rules in priority order — first match wins
    let revision: PlanningRevision | null = null;
    for (const rule of RULES) {
      revision = rule(ctx);
      if (revision) break;
    }

    // Default: no change
    if (!revision) {
      revision = makeRevision({
        startedAt:      t0,
        planId:         plan.id,
        kind:           "no_change",
        trigger:        "manual",
        rationale:      "Plan is valid and progressing normally.",
        affectedTaskIds: [],
        revisedPlan:     null,
        newTaskIds:      [],
        removedTaskIds:  [],
      });
    }

    log.append(revision);

    const activePlan = revision.revisedPlan ?? plan;

    return Object.freeze({
      revision,
      activePlan,
      progress,
      durationMs: Date.now() - t0,
    });
  }

  /**
   * Convenience: inject new information into state then evaluate.
   */
  injectAndEvaluate(plan: CognitivePlan, state: PlanningState, info: NewInformation): EvaluationResult {
    state.addInformation(info);
    return this.evaluate(plan, state);
  }

  /**
   * Get the full revision history for a plan.
   */
  getRevisionLog(planId: string): readonly PlanningRevision[] {
    return this.getLog(planId).all;
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __EF45_DPE__?: DynamicPlanningEngineImpl };
if (!G.__EF45_DPE__) G.__EF45_DPE__ = new DynamicPlanningEngineImpl();
export const DynamicPlanningEngine: DynamicPlanningEngineImpl = G.__EF45_DPE__;