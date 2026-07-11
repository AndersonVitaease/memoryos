// Planning Engine v1.0
// Foundation v1.0 · Engineering First
// Responsabilidade UNICA: transformar um Goal em um Execution Plan imutavel.
// Nao executa Goals. Nao interpreta intencao. Nao conversa com LLM.
// Nao agenda. Nao despacha. Nao decide. Nao modifica Goal.

import type { GoalRegistryService } from "@/lib/goal-registry-service/GoalRegistryService";
import type { GoalScheduler } from "@/lib/goal-scheduler/GoalScheduler";
import type { GoalExecutionQueue } from "@/lib/goal-execution-queue/GoalExecutionQueue";
import type { DecisionEngine } from "@/lib/decision-engine/DecisionEngine";
import type { GoalPriority } from "@/lib/goal-runtime-v01/GoalTypes";
import {
  COMPLEXITY_THRESHOLDS,
  type ExecutionPlan,
  type PlanHealth,
  type PlanLog,
  type PlanMetrics,
  type PlanStatistics,
  type PlanStatus,
  type PlanStep,
  type StepType,
} from "./PlanningEngineTypes";

function uid(): string {
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function stepUid(): string {
  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const VALID_PRIORITIES: GoalPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const MS_PER_STEP: Record<string, number> = {
  CAPABILITY:   300,
  VALIDATION:   100,
  DECISION:     150,
  NOTIFICATION: 50,
  CONDITION:    80,
  FALLBACK:     200,
};

export class PlanningEngine {
  private _plans    = new Map<string, ExecutionPlan>();
  private _logs:      PlanLog[] = [];
  private _durations: number[]  = [];
  private _metrics: PlanMetrics = {
    planTotal: 0, invalidateTotal: 0, cancelTotal: 0,
    validateTotal: 0, avgDurationMs: 0,
  };

  constructor(
    private readonly registryService?: GoalRegistryService,
    private readonly scheduler?: GoalScheduler,
    private readonly queue?: GoalExecutionQueue,
    private readonly decisionEngine?: DecisionEngine,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  plan(goalId: string, options?: { steps?: Partial<PlanStep>[]; priority?: GoalPriority }): {
    success: boolean; plan?: ExecutionPlan; planId?: string; error?: string;
  } {
    const start  = Date.now();
    const execId = uid();
    const planId = uid();
    try {
      if (!goalId || typeof goalId !== "string") {
        return this._fail(execId, planId, goalId, "plan", start, "goalId is required");
      }

      // Optional: validate goal exists in registry
      if (this.registryService && !this.registryService.exists(goalId)) {
        return this._fail(execId, planId, goalId, "plan", start, `Goal not found in registry: ${goalId}`);
      }

      // Prevent duplicate active plans for same goalId
      const existing = this._findActivePlanByGoalId(goalId);
      if (existing) {
        return this._fail(execId, planId, goalId, "plan", start, `Active plan already exists for goalId: ${goalId}`);
      }

      // Resolve priority
      let priority: GoalPriority = options?.priority ?? "MEDIUM";
      if (this.registryService) {
        const goal = this.registryService.find(goalId);
        if (goal) priority = goal.metadata().priority;
      }
      if (!VALID_PRIORITIES.includes(priority)) {
        return this._fail(execId, planId, goalId, "plan", start, `Invalid priority: ${priority}`);
      }

      // Build steps
      const rawSteps = options?.steps?.length
        ? options.steps
        : this._defaultSteps(priority);

      const steps: Readonly<PlanStep>[] = rawSteps.map((s, i) =>
        Object.freeze<PlanStep>({
          stepId:      s.stepId      ?? stepUid(),
          sequence:    s.sequence    ?? i + 1,
          type:        s.type        ?? "CAPABILITY",
          description: s.description ?? `Step ${i + 1}`,
          required:    s.required    ?? true,
          metadata:    Object.freeze(s.metadata ?? {}),
        }),
      );

      const complexity  = this._computeComplexity(steps.length);
      const estimatedMs = steps.reduce((acc, s) => acc + (MS_PER_STEP[s.type] ?? 200), 0);

      const executionPlan = Object.freeze<ExecutionPlan>({
        planId,
        goalId,
        status:      "READY" as PlanStatus,
        priority,
        steps:       Object.freeze(steps),
        estimatedMs,
        complexity,
        reason:      `Plan for goal ${goalId} — ${steps.length} steps — complexity=${complexity}`,
        createdAt:   Date.now(),
      });

      this._plans.set(planId, executionPlan);
      this._metrics.planTotal++;
      this._log(execId, planId, goalId, "plan", start, true);
      return { success: true, plan: executionPlan, planId };
    } catch (err) {
      return this._fail(execId, planId, goalId, "plan", start, String(err));
    }
  }

  validate(planId: string): { success: boolean; valid?: boolean; issues?: string[]; error?: string } {
    const start  = Date.now();
    const execId = uid();
    try {
      const p = this._plans.get(planId);
      if (!p) {
        return this._fail(execId, planId, "unknown", "validate", start, `Plan not found: ${planId}`);
      }
      const issues: string[] = [];
      if (!p.goalId)          issues.push("goalId missing");
      if (p.steps.length === 0) issues.push("No steps defined");
      // Sequence integrity
      const seqs = p.steps.map(s => s.sequence);
      const sorted = [...seqs].sort((a, b) => a - b);
      if (JSON.stringify(seqs) !== JSON.stringify(sorted)) issues.push("Steps not in sequence order");
      // Unique stepIds
      const ids = p.steps.map(s => s.stepId);
      if (new Set(ids).size !== ids.length) issues.push("Duplicate stepIds");

      const valid = issues.length === 0;
      this._metrics.validateTotal++;
      this._log(execId, planId, p.goalId, "validate", start, true);
      return { success: true, valid, issues };
    } catch (err) {
      return this._fail(execId, planId, "unknown", "validate", start, String(err));
    }
  }

  invalidate(planId: string, reason?: string): { success: boolean; error?: string } {
    const start  = Date.now();
    const execId = uid();
    try {
      const p = this._plans.get(planId);
      if (!p) {
        return this._fail(execId, planId, "unknown", "invalidate", start, `Plan not found: ${planId}`);
      }
      if (p.status === "INVALIDATED" || p.status === "CANCELLED") {
        return this._fail(execId, planId, p.goalId, "invalidate", start, `Cannot invalidate plan in status ${p.status}`);
      }
      const updated = Object.freeze({ ...p, status: "INVALIDATED" as PlanStatus, reason: reason ?? "Invalidated" });
      this._plans.set(planId, updated);
      this._metrics.invalidateTotal++;
      this._log(execId, planId, p.goalId, "invalidate", start, true);
      return { success: true };
    } catch (err) {
      return this._fail(execId, planId, "unknown", "invalidate", start, String(err));
    }
  }

  cancel(planId: string): { success: boolean; error?: string } {
    const start  = Date.now();
    const execId = uid();
    try {
      const p = this._plans.get(planId);
      if (!p) {
        return this._fail(execId, planId, "unknown", "cancel", start, `Plan not found: ${planId}`);
      }
      if (p.status === "CANCELLED") {
        return this._fail(execId, planId, p.goalId, "cancel", start, "Plan already cancelled");
      }
      const updated = Object.freeze({ ...p, status: "CANCELLED" as PlanStatus });
      this._plans.set(planId, updated);
      this._metrics.cancelTotal++;
      this._log(execId, planId, p.goalId, "cancel", start, true);
      return { success: true };
    } catch (err) {
      return this._fail(execId, planId, "unknown", "cancel", start, String(err));
    }
  }

  getPlan(planId: string): ExecutionPlan | null {
    return this._plans.get(planId) ?? null;
  }

  exists(planId: string): boolean {
    return this._plans.has(planId);
  }

  list(filterStatus?: PlanStatus): ExecutionPlan[] {
    const all = [...this._plans.values()];
    return filterStatus ? all.filter(p => p.status === filterStatus) : all;
  }

  statistics(): PlanStatistics {
    const all     = [...this._plans.values()];
    const avgSteps = all.length
      ? all.reduce((s, p) => s + p.steps.length, 0) / all.length : 0;
    const avgMs    = all.length
      ? all.reduce((s, p) => s + p.estimatedMs, 0) / all.length  : 0;
    const breakdown: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    all.forEach(p => { breakdown[p.complexity] = (breakdown[p.complexity] ?? 0) + 1; });
    return Object.freeze({
      totalPlanned:       this._metrics.planTotal,
      totalInvalidated:   this._metrics.invalidateTotal,
      totalCancelled:     this._metrics.cancelTotal,
      averageSteps:       Math.round(avgSteps * 10) / 10,
      averageEstimatedMs: Math.round(avgMs),
      complexityBreakdown: Object.freeze(breakdown),
      planRate:           this._metrics.planTotal,
    });
  }

  health(): PlanHealth {
    try {
      const all = [...this._plans.values()];

      const planIntegrity = all.every(p =>
        p.planId && p.goalId && p.createdAt > 0 && p.status,
      );

      const stepIntegrity = all.every(p =>
        p.steps.every(s => s.stepId && s.sequence > 0 && s.type && s.description),
      );

      const sequenceIntegrity = all.every(p => {
        const seqs = p.steps.map(s => s.sequence);
        for (let i = 1; i < seqs.length; i++) {
          if (seqs[i] <= seqs[i - 1]) return false;
        }
        return true;
      });

      const consistencyCheck =
        this._metrics.planTotal >= this._metrics.invalidateTotal + this._metrics.cancelTotal;

      const ok = planIntegrity && stepIntegrity && sequenceIntegrity && consistencyCheck;
      return {
        status: ok ? "SUCCESS" : "FAILED",
        checks: { planIntegrity, stepIntegrity, sequenceIntegrity, consistencyCheck },
        details: `plans=${all.length} planned=${this._metrics.planTotal} invalidated=${this._metrics.invalidateTotal} cancelled=${this._metrics.cancelTotal}`,
      };
    } catch (err) {
      return {
        status: "FAILED",
        checks: { planIntegrity: false, stepIntegrity: false, sequenceIntegrity: false, consistencyCheck: false },
        details: String(err),
      };
    }
  }

  getLogs(): PlanLog[] { return [...this._logs]; }

  getMetrics(): PlanMetrics { return Object.freeze({ ...this._metrics }); }

  clear(): void {
    this._plans.clear();
    this._logs      = [];
    this._durations = [];
    this._metrics   = {
      planTotal: 0, invalidateTotal: 0, cancelTotal: 0,
      validateTotal: 0, avgDurationMs: 0,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _defaultSteps(priority: GoalPriority): Partial<PlanStep>[] {
    const base: Partial<PlanStep>[] = [
      { type: "VALIDATION",   description: "Validate goal preconditions",   required: true  },
      { type: "CAPABILITY",   description: "Execute primary capability",     required: true  },
      { type: "DECISION",     description: "Evaluate execution result",      required: true  },
      { type: "NOTIFICATION", description: "Notify completion",              required: false },
    ];
    if (priority === "HIGH" || priority === "CRITICAL") {
      base.splice(2, 0,
        { type: "CONDITION", description: "Check execution conditions", required: true },
      );
    }
    if (priority === "CRITICAL") {
      base.push({ type: "FALLBACK", description: "Execute fallback on failure", required: false });
    }
    return base;
  }

  private _computeComplexity(stepCount: number): ExecutionPlan["complexity"] {
    if (stepCount <= COMPLEXITY_THRESHOLDS.LOW)    return "LOW";
    if (stepCount <= COMPLEXITY_THRESHOLDS.MEDIUM) return "MEDIUM";
    if (stepCount <= COMPLEXITY_THRESHOLDS.HIGH)   return "HIGH";
    return "CRITICAL";
  }

  private _findActivePlanByGoalId(goalId: string): ExecutionPlan | null {
    for (const p of this._plans.values()) {
      if (p.goalId === goalId && (p.status === "READY" || p.status === "DRAFT")) return p;
    }
    return null;
  }

  private _log(
    executionId: string, planId: string, goalId: string,
    operation: string, start: number, success: boolean, error?: string,
  ): void {
    const duration = Date.now() - start;
    this._durations.push(duration);
    this._metrics.avgDurationMs = Math.round(
      this._durations.reduce((a, b) => a + b, 0) / this._durations.length,
    );
    this._logs.push(Object.freeze({
      executionId, planId, goalId, operation,
      status: success ? "SUCCESS" : "FAILED",
      timestamp: Date.now(), duration, error,
    }));
  }

  private _fail(
    execId: string, planId: string, goalId: string,
    operation: string, start: number, error: string,
  ): { success: boolean; error: string } {
    this._log(execId, planId, goalId, operation, start, false, error);
    return { success: false, error };
  }
}