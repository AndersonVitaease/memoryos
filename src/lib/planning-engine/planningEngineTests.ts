// Planning Engine v1.0 — Test Suite
// Foundation v1.0 · Engineering First
// 16 criterios de aceitacao + 8 hardening = 24 cenarios

import { GoalRuntime } from "@/lib/goal-runtime-v01/GoalRuntime";
import { GoalRegistryService } from "@/lib/goal-registry-service/GoalRegistryService";
import { GoalScheduler } from "@/lib/goal-scheduler/GoalScheduler";
import { GoalExecutionQueue } from "@/lib/goal-execution-queue/GoalExecutionQueue";
import { ExecutionDispatcher } from "@/lib/execution-dispatcher/ExecutionDispatcher";
import { DecisionEngine } from "@/lib/decision-engine/DecisionEngine";
import { PlanningEngine } from "./PlanningEngine";
import type { GoalMetadata } from "@/lib/goal-runtime-v01/GoalTypes";
import type { PlanStep, StepType } from "./PlanningEngineTypes";

export interface PlanTestResult {
  criterion:  number;
  name:       string;
  passed:     boolean;
  durationMs: number;
  detail?:    string;
  error?:     string;
}

export interface PlanSuiteResult {
  results:    PlanTestResult[];
  passed:     number;
  total:      number;
  durationMs: number;
  statistics: ReturnType<PlanningEngine["statistics"]>;
  health:     ReturnType<PlanningEngine["health"]>;
  metrics:    ReturnType<PlanningEngine["getMetrics"]>;
}

async function run(
  n: number, name: string,
  fn: () => Promise<{ detail?: string }>,
): Promise<PlanTestResult> {
  const t = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, passed: true, durationMs: Date.now() - t, ...out };
  } catch (err) {
    return { criterion: n, name, passed: false, durationMs: Date.now() - t,
      error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runPlanningEngineTests(): Promise<PlanSuiteResult> {
  const start  = Date.now();
  const rt     = new GoalRuntime();
  const svc    = new GoalRegistryService();
  const sch    = new GoalScheduler(svc);
  const queue  = new GoalExecutionQueue(svc, sch);
  const disp   = new ExecutionDispatcher(svc, sch, queue);
  const de     = new DecisionEngine(undefined, svc, sch, queue);
  const engine = new PlanningEngine(svc, sch, queue, de);
  const results: PlanTestResult[] = [];
  const future = Date.now() + 60_000;

  async function makeGoal(overrides?: Partial<GoalMetadata>): Promise<string> {
    const r = await rt.create({
      title: "PE Test Goal", description: "test", priority: "MEDIUM",
      origin: "USER", userId: "u1", projectId: "p1", sessionId: "s1",
      tags: ["planning"], ...overrides,
    });
    if (!r.success) throw new Error(`Runtime: ${r.error}`);
    const goal = rt.get(r.goalId)!;
    svc.register(goal);
    sch.schedule(r.goalId, future, goal.metadata().priority);
    return r.goalId;
  }

  // ── C1: Goal pode ser planejado ───────────────────────────────────────────
  results.push(await run(1, "Goal pode ser transformado em Execution Plan", async () => {
    const goalId = await makeGoal({ title: "C1 Plan" });
    const r = engine.plan(goalId);
    if (!r.success)  throw new Error(r.error);
    if (!r.planId)   throw new Error("planId absent");
    if (!r.plan)     throw new Error("plan absent");
    if (!engine.exists(r.planId)) throw new Error("Plan not found after plan()");
    return { detail: `planId=${r.planId} steps=${r.plan.steps.length} complexity=${r.plan.complexity}` };
  }));

  // ── C2: Execution Plan e imutavel ────────────────────────────────────────
  results.push(await run(2, "ExecutionPlan e imutavel — Object.freeze()", async () => {
    const goalId = await makeGoal({ title: "C2 Immutable" });
    const r = engine.plan(goalId);
    if (!r.success) throw new Error(r.error);
    if (!Object.isFrozen(r.plan))       throw new Error("ExecutionPlan is not frozen");
    if (!Object.isFrozen(r.plan!.steps)) throw new Error("steps array is not frozen");
    r.plan!.steps.forEach(s => {
      if (!Object.isFrozen(s)) throw new Error(`Step ${s.stepId} is not frozen`);
    });
    return { detail: `planId=${r.planId} — plan, steps, and each PlanStep are Object.freeze()` };
  }));

  // ── C3: Steps sao gerados automaticamente ────────────────────────────────
  results.push(await run(3, "Steps sao gerados automaticamente com base na priority", async () => {
    const goalId = await makeGoal({ title: "C3 Steps", priority: "CRITICAL" });
    const r = engine.plan(goalId);
    if (!r.success) throw new Error(r.error);
    if (r.plan!.steps.length < 4) throw new Error(`Expected >=4 steps for CRITICAL, got ${r.plan!.steps.length}`);
    const types = r.plan!.steps.map(s => s.type);
    if (!types.includes("FALLBACK")) throw new Error("CRITICAL plan must include FALLBACK step");
    return { detail: `CRITICAL plan: ${r.plan!.steps.length} steps — ${types.join(",")}` };
  }));

  // ── C4: Complexity calculada corretamente ────────────────────────────────
  results.push(await run(4, "Complexity e calculada corretamente pelo step count", async () => {
    const low  = engine.plan("g-low-c4",  { steps: [{ type: "CAPABILITY", description: "one", required: true }], priority: "LOW" });
    const high = engine.plan("g-high-c4", {
      steps: Array.from({ length: 6 }, (_, i) => ({ type: "CAPABILITY" as StepType, description: `step-${i}`, required: true })),
      priority: "LOW",
    });
    if (!low.success)  throw new Error(low.error);
    if (!high.success) throw new Error(high.error);
    if (low.plan!.complexity  !== "LOW")  throw new Error(`Expected LOW, got ${low.plan!.complexity}`);
    if (high.plan!.complexity !== "HIGH") throw new Error(`Expected HIGH (6 steps), got ${high.plan!.complexity}`);
    return { detail: `1 step=LOW(${low.plan!.complexity}) 6 steps=HIGH(${high.plan!.complexity})` };
  }));

  // ── C5: estimatedMs calculado corretamente ───────────────────────────────
  results.push(await run(5, "estimatedMs e calculado corretamente", async () => {
    const goalId = await makeGoal({ title: "C5 EstimatedMs" });
    const r = engine.plan(goalId, { steps: [
      { type: "CAPABILITY",   description: "cap",  required: true },   // 300ms
      { type: "VALIDATION",   description: "val",  required: true },   // 100ms
      { type: "NOTIFICATION", description: "notif", required: false },  // 50ms
    ]});
    if (!r.success) throw new Error(r.error);
    if (r.plan!.estimatedMs !== 450) throw new Error(`Expected 450ms, got ${r.plan!.estimatedMs}`);
    return { detail: `estimatedMs=${r.plan!.estimatedMs} (300+100+50=450)` };
  }));

  // ── C6: validate() funciona ───────────────────────────────────────────────
  results.push(await run(6, "validate() inspeciona integridade do plano", async () => {
    const goalId = await makeGoal({ title: "C6 Validate" });
    const r = engine.plan(goalId);
    if (!r.success) throw new Error(r.error);
    const v = engine.validate(r.planId!);
    if (!v.success) throw new Error(v.error);
    if (!v.valid)   throw new Error(`Expected valid plan — issues: ${v.issues?.join(",")}`);
    return { detail: `planId=${r.planId} valid=${v.valid} issues=${v.issues?.length ?? 0}` };
  }));

  // ── C7: invalidate() funciona ─────────────────────────────────────────────
  results.push(await run(7, "invalidate() muda status para INVALIDATED", async () => {
    const goalId = await makeGoal({ title: "C7 Invalidate" });
    const r = engine.plan(goalId);
    if (!r.success) throw new Error(r.error);
    const inv = engine.invalidate(r.planId!, "Test invalidation");
    if (!inv.success) throw new Error(`invalidate failed: ${inv.error}`);
    const p = engine.getPlan(r.planId!);
    if (p?.status !== "INVALIDATED") throw new Error(`Expected INVALIDATED, got ${p?.status}`);
    return { detail: `planId=${r.planId} status=INVALIDATED` };
  }));

  // ── C8: cancel() funciona ────────────────────────────────────────────────
  results.push(await run(8, "cancel() muda status para CANCELLED", async () => {
    const goalId = await makeGoal({ title: "C8 Cancel" });
    const r = engine.plan(goalId);
    if (!r.success) throw new Error(r.error);
    const c = engine.cancel(r.planId!);
    if (!c.success) throw new Error(`cancel failed: ${c.error}`);
    const p = engine.getPlan(r.planId!);
    if (p?.status !== "CANCELLED") throw new Error(`Expected CANCELLED, got ${p?.status}`);
    return { detail: `planId=${r.planId} status=CANCELLED` };
  }));

  // ── C9: Statistics corretas ───────────────────────────────────────────────
  results.push(await run(9, "Statistics sao corretas e atualizadas automaticamente", async () => {
    const s = engine.statistics();
    if (s.totalPlanned <= 0)     throw new Error("totalPlanned = 0");
    if (s.totalInvalidated <= 0) throw new Error("totalInvalidated = 0 (expected from C7)");
    if (s.totalCancelled <= 0)   throw new Error("totalCancelled = 0 (expected from C8)");
    if (s.averageSteps <= 0)     throw new Error("averageSteps = 0");
    return { detail: `planned=${s.totalPlanned} invalidated=${s.totalInvalidated} cancelled=${s.totalCancelled} avgSteps=${s.averageSteps}` };
  }));

  // ── C10: Metrics corretas ─────────────────────────────────────────────────
  results.push(await run(10, "Metrics sao corretas e atualizadas automaticamente", async () => {
    const m = engine.getMetrics();
    if (m.planTotal <= 0)      throw new Error("planTotal = 0");
    if (m.validateTotal <= 0)  throw new Error("validateTotal = 0 (expected from C6)");
    if (typeof m.avgDurationMs !== "number") throw new Error("avgDurationMs absent");
    return { detail: `planTotal=${m.planTotal} validate=${m.validateTotal} invalidate=${m.invalidateTotal} cancel=${m.cancelTotal} avg=${m.avgDurationMs}ms` };
  }));

  // ── C11: Logs produzidos ──────────────────────────────────────────────────
  results.push(await run(11, "Logs sao produzidos automaticamente", async () => {
    const logs = engine.getLogs();
    if (logs.length === 0)    throw new Error("No logs");
    if (!logs[0].executionId) throw new Error("executionId absent");
    if (!logs[0].operation)   throw new Error("operation absent");
    const ops = [...new Set(logs.map(l => l.operation))];
    return { detail: `logs=${logs.length} ops=${ops.join(",")}` };
  }));

  // ── C12: Health retorna SUCCESS ───────────────────────────────────────────
  results.push(await run(12, "Health retorna SUCCESS", async () => {
    const hc = engine.health();
    if (hc.status !== "SUCCESS") throw new Error(`health=${hc.status}: ${hc.details}`);
    if (!hc.checks.planIntegrity)     throw new Error("planIntegrity failed");
    if (!hc.checks.stepIntegrity)     throw new Error("stepIntegrity failed");
    if (!hc.checks.sequenceIntegrity) throw new Error("sequenceIntegrity failed");
    if (!hc.checks.consistencyCheck)  throw new Error("consistencyCheck failed");
    return { detail: hc.details };
  }));

  // ── C13: Goal Runtime reutilizado ─────────────────────────────────────────
  results.push(await run(13, "Goal Runtime e reutilizado integralmente", async () => {
    const m = rt.getMetrics();
    if (m.created === 0) throw new Error("GoalRuntime has no created goals");
    return { detail: `Runtime: created=${m.created}` };
  }));

  // ── C14: Registry reutilizado ─────────────────────────────────────────────
  results.push(await run(14, "Goal Registry Service e reutilizado integralmente", async () => {
    const s = svc.statistics();
    if (s.registeredCount === 0) throw new Error("GoalRegistryService has no goals");
    return { detail: `RegistryService: registered=${s.registeredCount}` };
  }));

  // ── C15: Scheduler reutilizado ────────────────────────────────────────────
  results.push(await run(15, "Goal Scheduler e reutilizado integralmente", async () => {
    const s = sch.statistics();
    if (s.scheduled === 0) throw new Error("GoalScheduler has no schedules");
    return { detail: `Scheduler: scheduled=${s.scheduled}` };
  }));

  // ── C16: Decision Engine reutilizado ──────────────────────────────────────
  results.push(await run(16, "Decision Engine e reutilizado integralmente", async () => {
    if (!de) throw new Error("DecisionEngine reference absent");
    const hc = de.health();
    return { detail: `DecisionEngine ref present: health=${hc.status}` };
  }));

  // ── H1: Goal inexistente rejeitado ───────────────────────────────────────
  results.push(await run(17, "[Hardening] Goal inexistente e rejeitado", async () => {
    const r = engine.plan("nonexistent-goal-xyz");
    if (r.success) throw new Error("Expected failure");
    return { detail: `rejected: "${r.error}"` };
  }));

  // ── H2: Plano duplicado rejeitado ────────────────────────────────────────
  results.push(await run(18, "[Hardening] Plano duplicado para mesmo goalId e rejeitado", async () => {
    const goalId = await makeGoal({ title: "H2 Dupe Plan" });
    const r1 = engine.plan(goalId);
    if (!r1.success) throw new Error(r1.error);
    const r2 = engine.plan(goalId);
    if (r2.success) throw new Error("Expected duplicate plan to fail");
    if (!r2.error?.includes("Active plan already exists")) throw new Error(`Wrong error: ${r2.error}`);
    return { detail: `duplicate rejected: "${r2.error}"` };
  }));

  // ── H3: Steps customizados aceitos ───────────────────────────────────────
  results.push(await run(19, "[Hardening] Steps customizados sao aceitos e frozen", async () => {
    const customSteps: Partial<PlanStep>[] = [
      { type: "VALIDATION",   description: "Custom validate", required: true  },
      { type: "CAPABILITY",   description: "Custom cap",      required: true  },
      { type: "FALLBACK",     description: "Custom fallback", required: false },
    ];
    const r = engine.plan("custom-g-h3", { steps: customSteps, priority: "HIGH" });
    if (!r.success) throw new Error(r.error);
    if (r.plan!.steps.length !== 3) throw new Error(`Expected 3 steps, got ${r.plan!.steps.length}`);
    if (!Object.isFrozen(r.plan)) throw new Error("Plan not frozen");
    return { detail: `custom steps=${r.plan!.steps.length} types=${r.plan!.steps.map(s=>s.type).join(",")}` };
  }));

  // ── H4: invalidate de plan ja invalidado falha graciosamente ─────────────
  results.push(await run(20, "[Hardening] invalidate() de plano ja INVALIDATED falha graciosamente", async () => {
    const goalId = await makeGoal({ title: "H4 Double Invalidate" });
    const r = engine.plan(goalId);
    if (!r.success) throw new Error(r.error);
    engine.invalidate(r.planId!);
    const r2 = engine.invalidate(r.planId!);
    if (r2.success) throw new Error("Expected second invalidate to fail");
    return { detail: `rejected: "${r2.error}"` };
  }));

  // ── H5: cancel() de plan inexistente nao lanca excecao ───────────────────
  results.push(await run(21, "[Hardening] cancel() de plano inexistente nao lanca excecao", async () => {
    const r = engine.cancel("nonexistent-plan-id");
    if (r.success) throw new Error("Expected failure");
    return { detail: `rejected: "${r.error}"` };
  }));

  // ── H6: clear() restaura estado limpo ────────────────────────────────────
  results.push(await run(22, "[Hardening] clear() restaura estado completamente limpo", async () => {
    const tmp = new PlanningEngine();
    tmp.plan("tmp-goal-1");
    tmp.plan("tmp-goal-2");
    tmp.clear();
    const s  = tmp.statistics();
    const m  = tmp.getMetrics();
    const hc = tmp.health();
    if (s.totalPlanned !== 0) throw new Error(`Expected 0, got ${s.totalPlanned}`);
    if (m.planTotal !== 0)    throw new Error(`Expected 0, got ${m.planTotal}`);
    if (hc.status !== "SUCCESS") throw new Error(`Health failed after clear`);
    return { detail: `clear() → planned=0 health=${hc.status}` };
  }));

  // ── H7: PlanningEngine nao modifica Goal ─────────────────────────────────
  results.push(await run(23, "[Hardening] PlanningEngine nao modifica Goal", async () => {
    const goalId       = await makeGoal({ title: "H7 Immutability" });
    const goal         = rt.get(goalId)!;
    const statusBefore = goal.getStatus();
    const titleBefore  = goal.metadata().title;
    const r = engine.plan(goalId);
    if (!r.success) throw new Error(r.error);
    engine.validate(r.planId!);
    engine.list();
    engine.statistics();
    if (goal.getStatus()      !== statusBefore) throw new Error("Engine modified Goal status");
    if (goal.metadata().title !== titleBefore)  throw new Error("Engine modified Goal title");
    return { detail: `status=${statusBefore} unchanged — SRP confirmed` };
  }));

  // ── H8: Health consistente em estado vazio ────────────────────────────────
  results.push(await run(24, "[Hardening] Health consistente em estado vazio", async () => {
    const empty = new PlanningEngine();
    const hc    = empty.health();
    if (hc.status !== "SUCCESS") throw new Error(`Health failed on empty engine: ${hc.details}`);
    if (!hc.checks.consistencyCheck) throw new Error("consistencyCheck failed");
    return { detail: `empty engine health=${hc.status} details="${hc.details}"` };
  }));

  const passed = results.filter(r => r.passed).length;
  return {
    results, passed, total: results.length,
    durationMs: Date.now() - start,
    statistics: engine.statistics(),
    health:     engine.health(),
    metrics:    engine.getMetrics(),
  };
}