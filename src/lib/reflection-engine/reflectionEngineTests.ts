// Reflection Engine v1.0 — Test Suite
// Foundation v1.0 · Engineering First
// 16 criterios de aceitacao + 8 hardening = 24 cenarios

import { GoalRuntime }         from "@/lib/goal-runtime-v01/GoalRuntime";
import { GoalRegistryService } from "@/lib/goal-registry-service/GoalRegistryService";
import { DecisionEngine }      from "@/lib/decision-engine/DecisionEngine";
import { PlanningEngine }      from "@/lib/planning-engine/PlanningEngine";
import { ReflectionEngine }    from "./ReflectionEngine";
import type { ExecutionMetrics, ExecutionResult } from "./ReflectionEngineTypes";
import type { GoalMetadata }   from "@/lib/goal-runtime-v01/GoalTypes";
import type { DecisionCandidate } from "@/lib/decision-engine/DecisionEngineTypes";
import type { ExecutionPlan }  from "@/lib/planning-engine/PlanningEngineTypes";

export interface ReflTestResult {
  criterion:  number;
  name:       string;
  passed:     boolean;
  durationMs: number;
  detail?:    string;
  error?:     string;
}

export interface ReflSuiteResult {
  results:    ReflTestResult[];
  passed:     number;
  total:      number;
  durationMs: number;
  statistics: ReturnType<ReflectionEngine["statistics"]>;
  health:     ReturnType<ReflectionEngine["health"]>;
  metrics:    ReturnType<ReflectionEngine["getMetrics"]>;
}

async function run(n: number, name: string, fn: () => Promise<{ detail?: string }>): Promise<ReflTestResult> {
  const t = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, passed: true, durationMs: Date.now() - t, ...out };
  } catch (err) {
    return { criterion: n, name, passed: false, durationMs: Date.now() - t,
      error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeExecResult(overrides?: Partial<ExecutionResult>): ExecutionResult {
  return {
    executionId:     "exec-001",
    goalId:          "goal-001",
    planId:          "plan-001",
    status:          "SUCCESS",
    stepsExecuted:   4,
    stepsSkipped:    0,
    stepsTotal:      4,
    fallbacksUsed:   0,
    errorMessages:   [],
    warningMessages: [],
    durationMs:      350,
    startedAt:       Date.now() - 350,
    completedAt:     Date.now(),
    ...overrides,
  };
}

function makeMetrics(overrides?: Partial<ExecutionMetrics>): ExecutionMetrics {
  return {
    executionId:  "exec-001",
    cpuScore:     0.8,
    memoryScore:  0.9,
    latencyMs:    200,
    throughput:   4,
    errorRate:    0,
    successRate:  1.0,
    ...overrides,
  };
}

async function makePlan(pe: PlanningEngine, goalId: string): Promise<ExecutionPlan> {
  const r = pe.plan(goalId, { priority: "MEDIUM" });
  if (!r.success || !r.plan) throw new Error(`Plan failed: ${r.error}`);
  return r.plan;
}

async function makeDecision(de: DecisionEngine, goalId: string) {
  const candidates: DecisionCandidate[] = [{
    candidateId: "cand-001", goalId, label: "Primary", description: "Primary path",
    score: 0.85, confidence: 0.9, priority: "MEDIUM", reason: "Best fit", createdAt: Date.now(),
  }];
  const r = de.selectBest(candidates);
  if (!r.success || !r.result) throw new Error(`Decision failed: ${r.error}`);
  return r.result;
}

// ── Test Suite ────────────────────────────────────────────────────────────

export async function runReflectionEngineTests(): Promise<ReflSuiteResult> {
  const start  = Date.now();
  const rt     = new GoalRuntime();
  const svc    = new GoalRegistryService();
  const de     = new DecisionEngine();
  const pe     = new PlanningEngine(svc);
  const engine = new ReflectionEngine(pe, de);
  const results: ReflTestResult[] = [];

  async function makeGoal(overrides?: Partial<GoalMetadata>): Promise<string> {
    const r = await rt.create({
      title: "RE Test Goal", description: "test", priority: "MEDIUM",
      origin: "USER", userId: "u1", projectId: "p1", sessionId: "s1",
      tags: ["reflection"], ...overrides,
    });
    if (!r.success) throw new Error(`Runtime: ${r.error}`);
    const goal = rt.get(r.goalId)!;
    svc.register(goal);
    return r.goalId;
  }

  // ── C1: Reflection criada com sucesso ─────────────────────────────────────
  results.push(await run(1, "Reflection e criada com sucesso", async () => {
    const goalId   = await makeGoal({ title: "C1 Reflect" });
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const result   = makeExecResult({ goalId, planId: plan.planId });
    const r = engine.reflect(result, plan, decision);
    if (!r.success)       throw new Error(r.error);
    if (!r.reflectionId)  throw new Error("reflectionId absent");
    if (!r.reflection)    throw new Error("reflection absent");
    if (!engine.exists(r.reflectionId)) throw new Error("Reflection not found after reflect()");
    return { detail: `reflectionId=${r.reflectionId} confidence=${r.reflection.confidence} risk=${r.reflection.riskLevel}` };
  }));

  // ── C2: Reflection e imutavel ─────────────────────────────────────────────
  results.push(await run(2, "Reflection e imutavel — Object.freeze()", async () => {
    const goalId   = await makeGoal({ title: "C2 Immutable" });
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const r = engine.reflect(makeExecResult({ goalId, planId: plan.planId }), plan, decision);
    if (!r.success) throw new Error(r.error);
    if (!Object.isFrozen(r.reflection))            throw new Error("Reflection is not frozen");
    if (!Object.isFrozen(r.reflection!.successes)) throw new Error("successes not frozen");
    if (!Object.isFrozen(r.reflection!.failures))  throw new Error("failures not frozen");
    if (!Object.isFrozen(r.reflection!.recommendations)) throw new Error("recommendations not frozen");
    return { detail: `reflectionId=${r.reflectionId} — all arrays and object are Object.freeze()` };
  }));

  // ── C3: Summary correto ────────────────────────────────────────────────────
  results.push(await run(3, "summary contem informacoes corretas", async () => {
    const goalId   = await makeGoal({ title: "C3 Summary" });
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const r = engine.reflect(makeExecResult({ goalId, planId: plan.planId }), plan, decision);
    if (!r.success) throw new Error(r.error);
    const s = r.reflection!.summary;
    if (!s.includes(goalId))          throw new Error("summary missing goalId");
    if (!s.includes("confidence="))   throw new Error("summary missing confidence");
    if (!s.includes("risk="))         throw new Error("summary missing riskLevel");
    return { detail: s };
  }));

  // ── C4: confidence HIGH em execucao bem-sucedida ──────────────────────────
  results.push(await run(4, "confidence=HIGH em execucao bem-sucedida", async () => {
    const goalId   = await makeGoal({ title: "C4 Confidence" });
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const r = engine.reflect(
      makeExecResult({ goalId, planId: plan.planId, status: "SUCCESS" }),
      plan, decision, makeMetrics({ successRate: 1.0, errorRate: 0 }),
    );
    if (!r.success) throw new Error(r.error);
    if (r.reflection!.confidence !== "HIGH") throw new Error(`Expected HIGH, got ${r.reflection!.confidence}`);
    return { detail: `confidence=${r.reflection!.confidence} score=${r.reflection!.confidenceScore}` };
  }));

  // ── C5: confidence LOW em falha ───────────────────────────────────────────
  results.push(await run(5, "confidence=LOW em execucao com falha", async () => {
    const goalId   = await makeGoal({ title: "C5 ConfidenceLow" });
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const r = engine.reflect(
      makeExecResult({ goalId, planId: plan.planId, status: "FAILED", stepsExecuted: 0, errorMessages: ["Fatal error"] }),
      plan, decision, makeMetrics({ successRate: 0, errorRate: 1 }),
    );
    if (!r.success) throw new Error(r.error);
    if (r.reflection!.confidence !== "LOW") throw new Error(`Expected LOW, got ${r.reflection!.confidence}`);
    return { detail: `confidence=${r.reflection!.confidence} score=${r.reflection!.confidenceScore}` };
  }));

  // ── C6: riskLevel CRITICAL em falha severa ────────────────────────────────
  results.push(await run(6, "riskLevel=CRITICAL em falha severa", async () => {
    const goalId   = await makeGoal({ title: "C6 RiskCritical" });
    const plan     = await makePlan(pe, goalId, );
    const decision = await makeDecision(de, goalId);
    const r = engine.reflect(
      makeExecResult({ goalId, planId: plan.planId, status: "FAILED", fallbacksUsed: 3, stepsSkipped: 4, errorMessages: ["E1","E2","E3"] }),
      plan, decision, makeMetrics({ errorRate: 0.9 }),
    );
    if (!r.success) throw new Error(r.error);
    if (r.reflection!.riskLevel !== "CRITICAL") throw new Error(`Expected CRITICAL, got ${r.reflection!.riskLevel}`);
    return { detail: `risk=${r.reflection!.riskLevel} score=${r.reflection!.riskScore}` };
  }));

  // ── C7: riskLevel LOW em execucao limpa ───────────────────────────────────
  results.push(await run(7, "riskLevel=LOW em execucao limpa", async () => {
    const goalId   = await makeGoal({ title: "C7 RiskLow" });
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const r = engine.reflect(
      makeExecResult({ goalId, planId: plan.planId, status: "SUCCESS", fallbacksUsed: 0, stepsSkipped: 0 }),
      plan, decision, makeMetrics({ errorRate: 0, successRate: 1 }),
    );
    if (!r.success) throw new Error(r.error);
    if (r.reflection!.riskLevel !== "LOW") throw new Error(`Expected LOW, got ${r.reflection!.riskLevel}`);
    return { detail: `risk=${r.reflection!.riskLevel} score=${r.reflection!.riskScore}` };
  }));

  // ── C8: successes populados corretamente ──────────────────────────────────
  results.push(await run(8, "successes sao populados corretamente", async () => {
    const goalId   = await makeGoal({ title: "C8 Successes" });
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const r = engine.reflect(makeExecResult({ goalId, planId: plan.planId }), plan, decision);
    if (!r.success) throw new Error(r.error);
    if (r.reflection!.successes.length === 0) throw new Error("Expected at least 1 success");
    return { detail: `successes=${r.reflection!.successes.length}: ${r.reflection!.successes[0]}` };
  }));

  // ── C9: failures populados corretamente ──────────────────────────────────
  results.push(await run(9, "failures sao populados corretamente", async () => {
    const goalId   = await makeGoal({ title: "C9 Failures" });
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const r = engine.reflect(
      makeExecResult({ goalId, planId: plan.planId, status: "FAILED", errorMessages: ["Critical failure"] }),
      plan, decision,
    );
    if (!r.success) throw new Error(r.error);
    if (r.reflection!.failures.length === 0) throw new Error("Expected at least 1 failure");
    return { detail: `failures=${r.reflection!.failures.length}: ${r.reflection!.failures[0]}` };
  }));

  // ── C10: recommendations presentes ────────────────────────────────────────
  results.push(await run(10, "recommendations sao geradas automaticamente", async () => {
    const goalId   = await makeGoal({ title: "C10 Recs" });
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const r = engine.reflect(makeExecResult({ goalId, planId: plan.planId }), plan, decision);
    if (!r.success) throw new Error(r.error);
    if (r.reflection!.recommendations.length === 0) throw new Error("Expected at least 1 recommendation");
    return { detail: `recommendations=${r.reflection!.recommendations.length}` };
  }));

  // ── C11: MDS v1.7 forward-compat fields presentes ─────────────────────────
  results.push(await run(11, "Campos forward-compat MDS v1.7 estao presentes", async () => {
    const goalId   = await makeGoal({ title: "C11 FwdCompat" });
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const r = engine.reflect(makeExecResult({ goalId, planId: plan.planId }), plan, decision);
    if (!r.success) throw new Error(r.error);
    const ref = r.reflection!;
    if (!Array.isArray(ref.requiredCapabilities))    throw new Error("requiredCapabilities missing");
    if (!Array.isArray(ref.usedCapabilities))        throw new Error("usedCapabilities missing");
    if (!Array.isArray(ref.usedConnectors))          throw new Error("usedConnectors missing");
    if (typeof ref.dependencyGraph !== "object")     throw new Error("dependencyGraph missing");
    if (typeof ref.performanceScore !== "number")    throw new Error("performanceScore missing");
    if (typeof ref.qualityScore !== "number")        throw new Error("qualityScore missing");
    if (typeof ref.reliabilityScore !== "number")    throw new Error("reliabilityScore missing");
    if (typeof ref.retryCount !== "number")          throw new Error("retryCount missing");
    if (typeof ref.rollbackExecuted !== "boolean")   throw new Error("rollbackExecuted missing");
    if (!ref.improvementPriority)                    throw new Error("improvementPriority missing");
    return { detail: `perf=${ref.performanceScore} quality=${ref.qualityScore} reliability=${ref.reliabilityScore} priority=${ref.improvementPriority}` };
  }));

  // ── C12: invalidate() funciona ────────────────────────────────────────────
  results.push(await run(12, "invalidate() muda status para INVALIDATED", async () => {
    const goalId   = await makeGoal({ title: "C12 Invalidate" });
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const r = engine.reflect(makeExecResult({ goalId, planId: plan.planId }), plan, decision);
    if (!r.success) throw new Error(r.error);
    const inv = engine.invalidate(r.reflectionId!);
    if (!inv.success) throw new Error(`invalidate failed: ${inv.error}`);
    const ref = engine.getReflection(r.reflectionId!);
    if (ref?.status !== "INVALIDATED") throw new Error(`Expected INVALIDATED, got ${ref?.status}`);
    return { detail: `reflectionId=${r.reflectionId} status=INVALIDATED` };
  }));

  // ── C13: archive() funciona ───────────────────────────────────────────────
  results.push(await run(13, "archive() muda status para ARCHIVED", async () => {
    const goalId   = await makeGoal({ title: "C13 Archive" });
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const r = engine.reflect(makeExecResult({ goalId, planId: plan.planId }), plan, decision);
    if (!r.success) throw new Error(r.error);
    const arc = engine.archive(r.reflectionId!);
    if (!arc.success) throw new Error(`archive failed: ${arc.error}`);
    const ref = engine.getReflection(r.reflectionId!);
    if (ref?.status !== "ARCHIVED") throw new Error(`Expected ARCHIVED, got ${ref?.status}`);
    return { detail: `reflectionId=${r.reflectionId} status=ARCHIVED` };
  }));

  // ── C14: Statistics corretas ──────────────────────────────────────────────
  results.push(await run(14, "Statistics sao corretas e atualizadas", async () => {
    const s = engine.statistics();
    if (s.totalGenerated <= 0)   throw new Error("totalGenerated = 0");
    if (s.totalInvalidated <= 0) throw new Error("totalInvalidated = 0 (expected from C12)");
    if (s.totalArchived <= 0)    throw new Error("totalArchived = 0 (expected from C13)");
    if (typeof s.avgConfidenceScore !== "number") throw new Error("avgConfidenceScore missing");
    return { detail: `generated=${s.totalGenerated} invalidated=${s.totalInvalidated} archived=${s.totalArchived} avgConf=${s.avgConfidenceScore}` };
  }));

  // ── C15: Health retorna SUCCESS ───────────────────────────────────────────
  results.push(await run(15, "Health retorna SUCCESS", async () => {
    const hc = engine.health();
    if (hc.status !== "SUCCESS") throw new Error(`health=${hc.status}: ${hc.details}`);
    if (!hc.checks.reflectionIntegrity) throw new Error("reflectionIntegrity failed");
    if (!hc.checks.scoreIntegrity)      throw new Error("scoreIntegrity failed");
    if (!hc.checks.immutabilityCheck)   throw new Error("immutabilityCheck failed");
    if (!hc.checks.consistencyCheck)    throw new Error("consistencyCheck failed");
    return { detail: hc.details };
  }));

  // ── C16: Logs e Metrics produzidos ────────────────────────────────────────
  results.push(await run(16, "Logs e Metrics sao produzidos automaticamente", async () => {
    const logs = engine.getLogs();
    const m    = engine.getMetrics();
    if (logs.length === 0)         throw new Error("No logs");
    if (!logs[0].executionId)      throw new Error("executionId absent");
    if (!logs[0].operation)        throw new Error("operation absent");
    if (m.generateTotal <= 0)      throw new Error("generateTotal = 0");
    if (typeof m.avgDurationMs !== "number") throw new Error("avgDurationMs missing");
    const ops = [...new Set(logs.map(l => l.operation))];
    return { detail: `logs=${logs.length} ops=${ops.join(",")} generated=${m.generateTotal} avg=${m.avgDurationMs}ms` };
  }));

  // ── H1: executionId ausente rejeitado ─────────────────────────────────────
  results.push(await run(17, "[Hardening] result.executionId ausente e rejeitado", async () => {
    const goalId   = await makeGoal({ title: "H1" });
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const r = engine.reflect({ ...makeExecResult({ goalId }), executionId: "" } as ExecutionResult, plan, decision);
    if (r.success) throw new Error("Expected failure");
    return { detail: `rejected: "${r.error}"` };
  }));

  // ── H2: planId ausente rejeitado ─────────────────────────────────────────
  results.push(await run(18, "[Hardening] plan.planId ausente e rejeitado", async () => {
    const goalId   = await makeGoal({ title: "H2" });
    const decision = await makeDecision(de, goalId);
    const fakePlan = { planId: "", goalId, steps: [], status: "READY", priority: "MEDIUM", estimatedMs: 400, complexity: "LOW", reason: "", createdAt: Date.now() } as any;
    const r = engine.reflect(makeExecResult({ goalId }), fakePlan, decision);
    if (r.success) throw new Error("Expected failure");
    return { detail: `rejected: "${r.error}"` };
  }));

  // ── H3: Reflection nao modifica Goal ─────────────────────────────────────
  results.push(await run(19, "[Hardening] ReflectionEngine nao modifica Goal", async () => {
    const goalId       = await makeGoal({ title: "H3 Immutability" });
    const goal         = rt.get(goalId)!;
    const statusBefore = goal.getStatus();
    const titleBefore  = goal.metadata().title;
    const plan         = await makePlan(pe, goalId);
    const decision     = await makeDecision(de, goalId);
    engine.reflect(makeExecResult({ goalId, planId: plan.planId }), plan, decision);
    engine.list(); engine.statistics(); engine.health();
    if (goal.getStatus()      !== statusBefore) throw new Error("Engine modified Goal status");
    if (goal.metadata().title !== titleBefore)  throw new Error("Engine modified Goal title");
    return { detail: `Goal ${goalId} status=${statusBefore} unchanged — SRP confirmed` };
  }));

  // ── H4: Reflection nao modifica DecisionResult ───────────────────────────
  results.push(await run(20, "[Hardening] ReflectionEngine nao modifica DecisionResult", async () => {
    const goalId   = await makeGoal({ title: "H4 DecisionImmut" });
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const before   = JSON.stringify(decision);
    engine.reflect(makeExecResult({ goalId, planId: plan.planId }), plan, decision);
    if (JSON.stringify(decision) !== before) throw new Error("Engine modified DecisionResult");
    return { detail: "DecisionResult unchanged after reflect()" };
  }));

  // ── H5: Reflection nao modifica ExecutionPlan ────────────────────────────
  results.push(await run(21, "[Hardening] ReflectionEngine nao modifica ExecutionPlan", async () => {
    const goalId   = await makeGoal({ title: "H5 PlanImmut" });
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const before   = JSON.stringify(plan);
    engine.reflect(makeExecResult({ goalId, planId: plan.planId }), plan, decision);
    if (JSON.stringify(plan) !== before) throw new Error("Engine modified ExecutionPlan");
    return { detail: "ExecutionPlan unchanged after reflect()" };
  }));

  // ── H6: invalidate duplo falha graciosamente ──────────────────────────────
  results.push(await run(22, "[Hardening] invalidate() duplo falha graciosamente", async () => {
    const goalId   = await makeGoal({ title: "H6 DblInvalidate" });
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const r = engine.reflect(makeExecResult({ goalId, planId: plan.planId }), plan, decision);
    if (!r.success) throw new Error(r.error);
    engine.invalidate(r.reflectionId!);
    const r2 = engine.invalidate(r.reflectionId!);
    if (r2.success) throw new Error("Expected second invalidate to fail");
    return { detail: `rejected: "${r2.error}"` };
  }));

  // ── H7: clear() restaura estado limpo ────────────────────────────────────
  results.push(await run(23, "[Hardening] clear() restaura estado completamente limpo", async () => {
    const tmp  = new ReflectionEngine();
    const plan = { planId: "p1", goalId: "g1", steps: [], status: "READY", priority: "MEDIUM", estimatedMs: 400, complexity: "LOW", reason: "", createdAt: Date.now() } as any;
    const dec  = { decisionId: "d1", goalId: "g1", selectedCandidateId: "c1", score: 0.8, confidence: 0.8, decisionReason: "ok", timestamp: Date.now() };
    tmp.reflect(makeExecResult(), plan, dec);
    tmp.clear();
    const s  = tmp.statistics();
    const hc = tmp.health();
    if (s.totalGenerated !== 0) throw new Error(`Expected 0, got ${s.totalGenerated}`);
    if (hc.status !== "SUCCESS") throw new Error("Health failed after clear");
    return { detail: `clear() → generated=0 health=${hc.status}` };
  }));

  // ── H8: Health em estado vazio ────────────────────────────────────────────
  results.push(await run(24, "[Hardening] Health consistente em estado vazio", async () => {
    const empty = new ReflectionEngine();
    const hc    = empty.health();
    if (hc.status !== "SUCCESS") throw new Error(`Health failed on empty engine: ${hc.details}`);
    if (!hc.checks.consistencyCheck) throw new Error("consistencyCheck failed");
    return { detail: `empty engine health=${hc.status}` };
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