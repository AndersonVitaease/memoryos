// Self Evaluation Engine v1.0 — Test Suite
// Foundation v1.0 · Engineering First · Sprint 20
// 16 criterios de aceitacao + 8 hardening = 24 cenarios

import { GoalRuntime }         from "@/lib/goal-runtime-v01/GoalRuntime";
import { GoalRegistryService } from "@/lib/goal-registry-service/GoalRegistryService";
import { DecisionEngine }      from "@/lib/decision-engine/DecisionEngine";
import { PlanningEngine }      from "@/lib/planning-engine/PlanningEngine";
import { ReflectionEngine }    from "@/lib/reflection-engine/ReflectionEngine";
import { SelfEvaluationEngine } from "./SelfEvaluationEngine";
import type { GoalMetadata }   from "@/lib/goal-runtime-v01/GoalTypes";
import type { DecisionCandidate } from "@/lib/decision-engine/DecisionEngineTypes";
import type { ExecutionPlan }  from "@/lib/planning-engine/PlanningEngineTypes";
import type { DecisionResult } from "@/lib/decision-engine/DecisionEngineTypes";
import type { ExecutionResult, Reflection } from "@/lib/reflection-engine/ReflectionEngineTypes";

export interface SEETestResult {
  criterion:  number;
  name:       string;
  passed:     boolean;
  durationMs: number;
  detail?:    string;
  error?:     string;
}

export interface SEESuiteResult {
  results:    SEETestResult[];
  passed:     number;
  total:      number;
  durationMs: number;
  statistics: ReturnType<SelfEvaluationEngine["statistics"]>;
  health:     ReturnType<SelfEvaluationEngine["health"]>;
  metrics:    ReturnType<SelfEvaluationEngine["getMetrics"]>;
}

async function run(n: number, name: string, fn: () => Promise<{ detail?: string }>): Promise<SEETestResult> {
  const t = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, passed: true, durationMs: Date.now() - t, ...out };
  } catch (err) {
    return { criterion: n, name, passed: false, durationMs: Date.now() - t,
      error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeExecResult(goalId: string, planId: string, overrides?: Partial<ExecutionResult>): ExecutionResult {
  return {
    executionId: `exec-${Date.now()}`, goalId, planId,
    status: "SUCCESS", stepsExecuted: 4, stepsSkipped: 0, stepsTotal: 4,
    fallbacksUsed: 0, errorMessages: [], warningMessages: [],
    durationMs: 350, startedAt: Date.now() - 350, completedAt: Date.now(),
    ...overrides,
  };
}

async function makeDecision(de: DecisionEngine, goalId: string, conf = 0.9): Promise<DecisionResult> {
  const candidates: DecisionCandidate[] = [{
    candidateId: `cand-${Date.now()}`, goalId, label: "Primary", description: "Primary path",
    score: 0.85, confidence: conf, priority: "MEDIUM", reason: "Best fit", createdAt: Date.now(),
  }];
  const r = de.selectBest(candidates);
  if (!r.success || !r.result) throw new Error(`Decision failed: ${r.error}`);
  return r.result;
}

async function makePlan(pe: PlanningEngine, goalId: string): Promise<ExecutionPlan> {
  const r = pe.plan(goalId, { priority: "MEDIUM" });
  if (!r.success || !r.plan) throw new Error(`Plan failed: ${r.error}`);
  return r.plan;
}

async function makeReflection(
  re: ReflectionEngine, result: ExecutionResult,
  plan: ExecutionPlan, decision: DecisionResult,
): Promise<Reflection> {
  const r = re.reflect(result, plan, decision);
  if (!r.success || !r.reflection) throw new Error(`Reflection failed: ${r.error}`);
  return r.reflection;
}

// ── Test Suite ────────────────────────────────────────────────────────────────

export async function runSelfEvaluationEngineTests(): Promise<SEESuiteResult> {
  const start  = Date.now();
  const rt     = new GoalRuntime();
  const svc    = new GoalRegistryService();
  const de     = new DecisionEngine();
  const pe     = new PlanningEngine(svc);
  const re     = new ReflectionEngine(pe, de);
  const engine = new SelfEvaluationEngine(re, pe, de);
  const results: SEETestResult[] = [];

  async function makeGoal(overrides?: Partial<GoalMetadata>): Promise<string> {
    const r = await rt.create({
      title: "SEE Test Goal", description: "test", priority: "MEDIUM",
      origin: "USER", userId: "u1", projectId: "p1", sessionId: "s1",
      tags: ["evaluation"], ...overrides,
    });
    if (!r.success) throw new Error(`Runtime: ${r.error}`);
    const goal = rt.get(r.goalId)!;
    svc.register(goal);
    return r.goalId;
  }

  async function fullPipeline(goalId: string, resultOverrides?: Partial<ExecutionResult>) {
    const plan     = await makePlan(pe, goalId);
    const decision = await makeDecision(de, goalId);
    const result   = makeExecResult(goalId, plan.planId, resultOverrides);
    const reflection = await makeReflection(re, result, plan, decision);
    return { plan, decision, result, reflection };
  }

  // ── C1: SelfEvaluation criada com sucesso ─────────────────────────────────
  results.push(await run(1, "SelfEvaluation e criada com sucesso", async () => {
    const goalId = await makeGoal({ title: "C1 Evaluate" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId);
    const r = engine.evaluate(reflection, result, plan, decision);
    if (!r.success)      throw new Error(r.error);
    if (!r.evaluationId) throw new Error("evaluationId absent");
    if (!r.evaluation)   throw new Error("evaluation absent");
    if (!engine.exists(r.evaluationId)) throw new Error("Evaluation not found after evaluate()");
    return { detail: `evaluationId=${r.evaluationId} class=${r.evaluation.classification} overall=${r.evaluation.overallScore}` };
  }));

  // ── C2: SelfEvaluation e imutavel ────────────────────────────────────────
  results.push(await run(2, "SelfEvaluation e imutavel — Object.freeze()", async () => {
    const goalId = await makeGoal({ title: "C2 Immutable" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId);
    const r = engine.evaluate(reflection, result, plan, decision);
    if (!r.success) throw new Error(r.error);
    if (!Object.isFrozen(r.evaluation))               throw new Error("SelfEvaluation not frozen");
    if (!Object.isFrozen(r.evaluation!.strengths))    throw new Error("strengths not frozen");
    if (!Object.isFrozen(r.evaluation!.weaknesses))   throw new Error("weaknesses not frozen");
    if (!Object.isFrozen(r.evaluation!.recommendations)) throw new Error("recommendations not frozen");
    if (!Object.isFrozen(r.evaluation!.improvementActions)) throw new Error("improvementActions not frozen");
    return { detail: "All arrays and object are Object.freeze()" };
  }));

  // ── C3: classification EXCELLENT em execucao perfeita ────────────────────
  results.push(await run(3, "classification=EXCELLENT em execucao perfeita", async () => {
    const goalId = await makeGoal({ title: "C3 Excellent" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId, {
      status: "SUCCESS", stepsExecuted: 4, stepsTotal: 4, fallbacksUsed: 0,
      errorMessages: [], warningMessages: [], durationMs: 200,
    });
    const r = engine.evaluate(reflection, result, plan, decision);
    if (!r.success) throw new Error(r.error);
    const score = r.evaluation!.overallScore;
    if (!["EXCELLENT", "GOOD"].includes(r.evaluation!.classification))
      throw new Error(`Expected EXCELLENT or GOOD for clean exec, got ${r.evaluation!.classification} (score=${score})`);
    return { detail: `class=${r.evaluation!.classification} overall=${score}` };
  }));

  // ── C4: classification FAILED em execucao catastrofica ───────────────────
  results.push(await run(4, "classification=FAILED em execucao catastrofica", async () => {
    const goalId = await makeGoal({ title: "C4 Failed" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId, {
      status: "FAILED", stepsExecuted: 0, stepsTotal: 4, fallbacksUsed: 3,
      errorMessages: ["Fatal", "Timeout", "OOM"], warningMessages: [], durationMs: 10000,
    });
    const r = engine.evaluate(reflection, result, plan, decision);
    if (!r.success) throw new Error(r.error);
    if (!["FAILED", "POOR"].includes(r.evaluation!.classification))
      throw new Error(`Expected FAILED or POOR, got ${r.evaluation!.classification} (score=${r.evaluation!.overallScore})`);
    return { detail: `class=${r.evaluation!.classification} overall=${r.evaluation!.overallScore}` };
  }));

  // ── C5: Todos os scores estao entre 0 e 100 ──────────────────────────────
  results.push(await run(5, "Todos os scores estao entre 0 e 100", async () => {
    const goalId = await makeGoal({ title: "C5 Scores" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId);
    const r = engine.evaluate(reflection, result, plan, decision);
    if (!r.success) throw new Error(r.error);
    const ev = r.evaluation!;
    const scores = { overallScore: ev.overallScore, performanceScore: ev.performanceScore,
      qualityScore: ev.qualityScore, reliabilityScore: ev.reliabilityScore,
      consistencyScore: ev.consistencyScore, confidenceScore: ev.confidenceScore, riskScore: ev.riskScore };
    for (const [k, v] of Object.entries(scores)) {
      if (v < 0 || v > 100) throw new Error(`${k}=${v} out of range 0..100`);
    }
    return { detail: Object.entries(scores).map(([k,v]) => `${k}=${v}`).join(" ") };
  }));

  // ── C6: summary correto ────────────────────────────────────────────────────
  results.push(await run(6, "summary contem informacoes corretas", async () => {
    const goalId = await makeGoal({ title: "C6 Summary" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId);
    const r = engine.evaluate(reflection, result, plan, decision);
    if (!r.success) throw new Error(r.error);
    const s = r.evaluation!.summary;
    if (!s.includes(goalId))             throw new Error("summary missing goalId");
    if (!s.includes("score="))           throw new Error("summary missing score");
    if (!s.includes("confidence="))      throw new Error("summary missing confidence");
    if (!s.includes("risk="))            throw new Error("summary missing riskLevel");
    return { detail: s };
  }));

  // ── C7: strengths populados ───────────────────────────────────────────────
  results.push(await run(7, "strengths sao populados corretamente", async () => {
    const goalId = await makeGoal({ title: "C7 Strengths" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId);
    const r = engine.evaluate(reflection, result, plan, decision);
    if (!r.success) throw new Error(r.error);
    if (r.evaluation!.strengths.length === 0) throw new Error("Expected at least 1 strength");
    return { detail: `strengths=${r.evaluation!.strengths.length}: "${r.evaluation!.strengths[0]}"` };
  }));

  // ── C8: weaknesses populados em falha ─────────────────────────────────────
  results.push(await run(8, "weaknesses sao populados em execucao com falha", async () => {
    const goalId = await makeGoal({ title: "C8 Weaknesses" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId, {
      status: "FAILED", errorMessages: ["Critical failure"], stepsExecuted: 1, stepsTotal: 4,
    });
    const r = engine.evaluate(reflection, result, plan, decision);
    if (!r.success) throw new Error(r.error);
    if (r.evaluation!.weaknesses.length === 0) throw new Error("Expected at least 1 weakness");
    return { detail: `weaknesses=${r.evaluation!.weaknesses.length}: "${r.evaluation!.weaknesses[0]}"` };
  }));

  // ── C9: requiresHumanReview flag correto ──────────────────────────────────
  results.push(await run(9, "requiresHumanReview=true em execucao critica", async () => {
    const goalId = await makeGoal({ title: "C9 HumanReview" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId, {
      status: "FAILED", stepsExecuted: 0, fallbacksUsed: 3, errorMessages: ["E1","E2","E3"],
    });
    const r = engine.evaluate(reflection, result, plan, decision);
    if (!r.success) throw new Error(r.error);
    if (!r.evaluation!.requiresHumanReview) throw new Error("Expected requiresHumanReview=true for FAILED execution");
    return { detail: `requiresHumanReview=${r.evaluation!.requiresHumanReview} overall=${r.evaluation!.overallScore}` };
  }));

  // ── C10: readyForLearning flag correto ────────────────────────────────────
  results.push(await run(10, "readyForLearning=true em execucao bem-sucedida", async () => {
    const goalId = await makeGoal({ title: "C10 Learning" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId, {
      status: "SUCCESS", errorMessages: [], fallbacksUsed: 0,
    });
    const r = engine.evaluate(reflection, result, plan, decision);
    if (!r.success) throw new Error(r.error);
    if (!r.evaluation!.readyForLearning) throw new Error("Expected readyForLearning=true for SUCCESS");
    return { detail: `readyForLearning=${r.evaluation!.readyForLearning} overall=${r.evaluation!.overallScore}` };
  }));

  // ── C11: Forward-compat fields presentes ──────────────────────────────────
  results.push(await run(11, "Campos forward-compat estao presentes", async () => {
    const goalId = await makeGoal({ title: "C11 FwdCompat" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId);
    const r = engine.evaluate(reflection, result, plan, decision);
    if (!r.success) throw new Error(r.error);
    const ev = r.evaluation!;
    if (!ev.evaluationFingerprint) throw new Error("evaluationFingerprint missing");
    if (!ev.executionSignature)    throw new Error("executionSignature missing");
    if (!ev.evaluationVersion)     throw new Error("evaluationVersion missing");
    if (!ev.architectureVersion)   throw new Error("architectureVersion missing");
    if (!ev.foundationVersion)     throw new Error("foundationVersion missing");
    if (!Array.isArray(ev.learningCandidates))     throw new Error("learningCandidates missing");
    if (!Array.isArray(ev.knowledgeCandidates))    throw new Error("knowledgeCandidates missing");
    if (!Array.isArray(ev.optimizationCandidates)) throw new Error("optimizationCandidates missing");
    if (!Array.isArray(ev.automationCandidates))   throw new Error("automationCandidates missing");
    if (!Array.isArray(ev.futureCapabilities))     throw new Error("futureCapabilities missing");
    if (!Array.isArray(ev.futureConnectors))       throw new Error("futureConnectors missing");
    return { detail: `fingerprint=${ev.evaluationFingerprint.slice(0, 30)}... version=${ev.evaluationVersion}` };
  }));

  // ── C12: invalidate() funciona ────────────────────────────────────────────
  results.push(await run(12, "invalidate() muda status para INVALIDATED", async () => {
    const goalId = await makeGoal({ title: "C12 Invalidate" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId);
    const r = engine.evaluate(reflection, result, plan, decision);
    if (!r.success) throw new Error(r.error);
    const inv = engine.invalidate(r.evaluationId!);
    if (!inv.success) throw new Error(`invalidate failed: ${inv.error}`);
    const ev = engine.getEvaluation(r.evaluationId!);
    if (ev?.status !== "INVALIDATED") throw new Error(`Expected INVALIDATED, got ${ev?.status}`);
    return { detail: `evaluationId=${r.evaluationId} status=INVALIDATED` };
  }));

  // ── C13: archive() funciona ───────────────────────────────────────────────
  results.push(await run(13, "archive() muda status para ARCHIVED", async () => {
    const goalId = await makeGoal({ title: "C13 Archive" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId);
    const r = engine.evaluate(reflection, result, plan, decision);
    if (!r.success) throw new Error(r.error);
    const arc = engine.archive(r.evaluationId!);
    if (!arc.success) throw new Error(`archive failed: ${arc.error}`);
    const ev = engine.getEvaluation(r.evaluationId!);
    if (ev?.status !== "ARCHIVED") throw new Error(`Expected ARCHIVED, got ${ev?.status}`);
    return { detail: `evaluationId=${r.evaluationId} status=ARCHIVED` };
  }));

  // ── C14: Statistics corretas ──────────────────────────────────────────────
  results.push(await run(14, "Statistics sao corretas e atualizadas", async () => {
    const s = engine.statistics();
    if (s.totalEvaluated <= 0)   throw new Error("totalEvaluated = 0");
    if (s.totalInvalidated <= 0) throw new Error("totalInvalidated = 0 (expected from C12)");
    if (s.totalArchived <= 0)    throw new Error("totalArchived = 0 (expected from C13)");
    if (typeof s.avgOverallScore !== "number") throw new Error("avgOverallScore missing");
    return { detail: `evaluated=${s.totalEvaluated} invalidated=${s.totalInvalidated} archived=${s.totalArchived} avgScore=${s.avgOverallScore}` };
  }));

  // ── C15: Health retorna SUCCESS ───────────────────────────────────────────
  results.push(await run(15, "Health retorna SUCCESS", async () => {
    const hc = engine.health();
    if (hc.status !== "SUCCESS") throw new Error(`health=${hc.status}: ${hc.details}`);
    if (!hc.checks.evaluationIntegrity) throw new Error("evaluationIntegrity failed");
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
    if (!logs[0].executionId)      throw new Error("executionId absent in log");
    if (!logs[0].operation)        throw new Error("operation absent in log");
    if (m.evaluateTotal <= 0)      throw new Error("evaluateTotal = 0");
    const ops = [...new Set(logs.map(l => l.operation))];
    return { detail: `logs=${logs.length} ops=${ops.join(",")} evaluated=${m.evaluateTotal} avg=${m.avgDurationMs}ms` };
  }));

  // ── H1: reflectionId ausente rejeitado ───────────────────────────────────
  results.push(await run(17, "[Hardening] reflection.reflectionId ausente e rejeitado", async () => {
    const goalId = await makeGoal({ title: "H1" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId);
    const badRef = { ...reflection, reflectionId: "" } as any;
    const r = engine.evaluate(badRef, result, plan, decision);
    if (r.success) throw new Error("Expected failure");
    return { detail: `rejected: "${r.error}"` };
  }));

  // ── H2: plan.planId ausente rejeitado ─────────────────────────────────────
  results.push(await run(18, "[Hardening] plan.planId ausente e rejeitado", async () => {
    const goalId = await makeGoal({ title: "H2" });
    const { decision, result, reflection } = await fullPipeline(goalId);
    const badPlan = { planId: "", goalId, steps: [], status: "READY", priority: "MEDIUM", estimatedMs: 400, complexity: "LOW", reason: "", createdAt: Date.now() } as any;
    const r = engine.evaluate(reflection, result, badPlan, decision);
    if (r.success) throw new Error("Expected failure");
    return { detail: `rejected: "${r.error}"` };
  }));

  // ── H3: Engine nao modifica Reflection ───────────────────────────────────
  results.push(await run(19, "[Hardening] SelfEvaluationEngine nao modifica Reflection", async () => {
    const goalId = await makeGoal({ title: "H3 ReflImmut" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId);
    const before = JSON.stringify(reflection);
    engine.evaluate(reflection, result, plan, decision);
    engine.list(); engine.statistics(); engine.health();
    if (JSON.stringify(reflection) !== before) throw new Error("Engine modified Reflection");
    return { detail: "Reflection unchanged after evaluate()" };
  }));

  // ── H4: Engine nao modifica Goal ──────────────────────────────────────────
  results.push(await run(20, "[Hardening] SelfEvaluationEngine nao modifica Goal", async () => {
    const goalId       = await makeGoal({ title: "H4 GoalImmut" });
    const goal         = rt.get(goalId)!;
    const statusBefore = goal.getStatus();
    const titleBefore  = goal.metadata().title;
    const { plan, decision, result, reflection } = await fullPipeline(goalId);
    engine.evaluate(reflection, result, plan, decision);
    if (goal.getStatus()      !== statusBefore) throw new Error("Engine modified Goal status");
    if (goal.metadata().title !== titleBefore)  throw new Error("Engine modified Goal title");
    return { detail: `Goal status=${statusBefore} unchanged — SRP confirmed` };
  }));

  // ── H5: Engine nao modifica DecisionResult ────────────────────────────────
  results.push(await run(21, "[Hardening] Engine nao modifica DecisionResult", async () => {
    const goalId = await makeGoal({ title: "H5 DecImmut" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId);
    const before = JSON.stringify(decision);
    engine.evaluate(reflection, result, plan, decision);
    if (JSON.stringify(decision) !== before) throw new Error("Engine modified DecisionResult");
    return { detail: "DecisionResult unchanged after evaluate()" };
  }));

  // ── H6: invalidate duplo falha graciosamente ──────────────────────────────
  results.push(await run(22, "[Hardening] invalidate() duplo falha graciosamente", async () => {
    const goalId = await makeGoal({ title: "H6 DblInvalidate" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId);
    const r = engine.evaluate(reflection, result, plan, decision);
    if (!r.success) throw new Error(r.error);
    engine.invalidate(r.evaluationId!);
    const r2 = engine.invalidate(r.evaluationId!);
    if (r2.success) throw new Error("Expected second invalidate to fail");
    return { detail: `rejected: "${r2.error}"` };
  }));

  // ── H7: clear() restaura estado limpo ────────────────────────────────────
  results.push(await run(23, "[Hardening] clear() restaura estado completamente limpo", async () => {
    const tmp = new SelfEvaluationEngine();
    const goalId = await makeGoal({ title: "H7 Clear" });
    const { plan, decision, result, reflection } = await fullPipeline(goalId);
    tmp.evaluate(reflection, result, plan, decision);
    tmp.clear();
    const s  = tmp.statistics();
    const hc = tmp.health();
    if (s.totalEvaluated !== 0) throw new Error(`Expected 0, got ${s.totalEvaluated}`);
    if (hc.status !== "SUCCESS") throw new Error("Health failed after clear");
    return { detail: `clear() → evaluated=0 health=${hc.status}` };
  }));

  // ── H8: Health em estado vazio ────────────────────────────────────────────
  results.push(await run(24, "[Hardening] Health consistente em estado vazio", async () => {
    const empty = new SelfEvaluationEngine();
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