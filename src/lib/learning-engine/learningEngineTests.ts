// Learning Engine v1.0 -- Test Suite
// Foundation v1.0 · Engineering First · Sprint 22
// 18 acceptance criteria + 10 hardening = 28 scenarios

import { GoalRuntime }          from "@/lib/goal-runtime-v01/GoalRuntime";
import { GoalRegistryService }  from "@/lib/goal-registry-service/GoalRegistryService";
import { DecisionEngine }       from "@/lib/decision-engine/DecisionEngine";
import { PlanningEngine }       from "@/lib/planning-engine/PlanningEngine";
import { ReflectionEngine }     from "@/lib/reflection-engine/ReflectionEngine";
import { SelfEvaluationEngine } from "@/lib/self-evaluation-engine/SelfEvaluationEngine";
import { KnowledgeEngine }      from "@/lib/knowledge-engine/KnowledgeEngine";
import { LearningEngine }       from "./LearningEngine";
import { LEARNING_QUALITY_THRESHOLD } from "./LearningEngineTypes";
import type { Knowledge }        from "@/lib/knowledge-engine/KnowledgeEngineTypes";
import type { ExecutionResult }  from "@/lib/reflection-engine/ReflectionEngineTypes";
import type { DecisionCandidate } from "@/lib/decision-engine/DecisionEngineTypes";

export interface LETestResult {
  criterion:  number;
  name:       string;
  passed:     boolean;
  durationMs: number;
  detail?:    string;
  error?:     string;
}

export interface LESuiteResult {
  results:    LETestResult[];
  passed:     number;
  total:      number;
  durationMs: number;
  statistics: ReturnType<LearningEngine["statistics"]>;
  health:     ReturnType<LearningEngine["health"]>;
  metrics:    ReturnType<LearningEngine["getMetrics"]>;
}

async function run(n: number, name: string, fn: () => Promise<{ detail?: string }>): Promise<LETestResult> {
  const t = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, passed: true, durationMs: Date.now() - t, ...out };
  } catch (err) {
    return { criterion: n, name, passed: false, durationMs: Date.now() - t,
      error: err instanceof Error ? err.message : String(err) };
  }
}

// ---- Full pipeline fixture --------------------------------------------------

async function buildKnowledge(
  rt: GoalRuntime, svc: GoalRegistryService, de: DecisionEngine,
  pe: PlanningEngine, re: ReflectionEngine, see: SelfEvaluationEngine,
  ke: KnowledgeEngine, goalTitle = "LE Test",
  execOverrides?: Partial<ExecutionResult>,
): Promise<Knowledge | null> {
  const gr = await rt.create({
    title: goalTitle, description: "test", priority: "MEDIUM",
    origin: "USER", userId: "u1", projectId: "p1", sessionId: "s1", tags: ["learning"],
  });
  if (!gr.success) throw new Error(`Goal: ${gr.error}`);
  svc.register(rt.get(gr.goalId)!);

  const planR = pe.plan(gr.goalId, { priority: "MEDIUM" });
  if (!planR.success || !planR.plan) throw new Error(`Plan: ${planR.error}`);

  const cands: DecisionCandidate[] = [{
    candidateId: `c-${Date.now()}`, goalId: gr.goalId, label: "Primary", description: "Primary",
    score: 0.85, confidence: 0.9, priority: "MEDIUM", reason: "Best fit", createdAt: Date.now(),
  }];
  const decR = de.selectBest(cands);
  if (!decR.success || !decR.result) throw new Error(`Decision: ${decR.error}`);

  const execResult: ExecutionResult = {
    executionId: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    goalId: gr.goalId, planId: planR.plan.planId, status: "SUCCESS",
    stepsExecuted: 4, stepsSkipped: 0, stepsTotal: 4,
    fallbacksUsed: 0, errorMessages: [], warningMessages: [],
    durationMs: 300, startedAt: Date.now() - 300, completedAt: Date.now(),
    ...execOverrides,
  };

  const refR = re.reflect(execResult, planR.plan, decR.result);
  if (!refR.success || !refR.reflection) throw new Error(`Reflection: ${refR.error}`);

  const evalR = see.evaluate(refR.reflection, execResult, planR.plan, decR.result);
  if (!evalR.success || !evalR.evaluation) throw new Error(`Evaluation: ${evalR.error}`);

  const kr = ke.createKnowledge(evalR.evaluation, refR.reflection, execResult, planR.plan, decR.result);
  if (!kr.success) throw new Error(`Knowledge: ${kr.error}`);
  return kr.knowledge ?? null;
}

// ---- Suite -----------------------------------------------------------------

export async function runLearningEngineTests(): Promise<LESuiteResult> {
  const start  = Date.now();
  const rt     = new GoalRuntime();
  const svc    = new GoalRegistryService();
  const de     = new DecisionEngine();
  const pe     = new PlanningEngine(svc);
  const re     = new ReflectionEngine(pe, de);
  const see    = new SelfEvaluationEngine(re, pe, de);
  const ke     = new KnowledgeEngine();
  const engine = new LearningEngine();
  const results: LETestResult[] = [];

  async function activeKnowledge(title = "LE"): Promise<Knowledge> {
    const k = await buildKnowledge(rt, svc, de, pe, re, see, ke, title);
    if (!k) throw new Error("Knowledge rejected by quality gate -- cannot proceed");
    return k;
  }

  // C1
  results.push(await run(1, "Learning e criado com sucesso a partir de Knowledge ACTIVE", async () => {
    const k = await activeKnowledge("C1");
    const r = engine.createLearning(k);
    if (!r.success || !r.learning) throw new Error(r.error ?? "no learning");
    return { detail: `learningId=${r.learningId} type=${r.learning.learningType} score=${r.learning.learningScore}` };
  }));

  // C2
  results.push(await run(2, "Learning e totalmente imutavel -- Object.freeze()", async () => {
    const k = await activeKnowledge("C2");
    const r = engine.createLearning(k);
    if (!r.success || !r.learning) throw new Error(r.error ?? "no learning");
    if (!Object.isFrozen(r.learning))                throw new Error("Learning not frozen");
    if (!Object.isFrozen(r.learning.metadata))       throw new Error("metadata not frozen");
    if (!Object.isFrozen(r.learning.insights))       throw new Error("insights not frozen");
    if (!Object.isFrozen(r.learning.patterns))       throw new Error("patterns not frozen");
    if (!Object.isFrozen(r.learning.recommendations)) throw new Error("recommendations not frozen");
    return { detail: "All nested objects frozen" };
  }));

  // C3
  results.push(await run(3, "Quality Gate rejeita Knowledge com status != ACTIVE", async () => {
    const k = await activeKnowledge("C3");
    const r = engine.createLearning(Object.freeze({ ...k, status: "ARCHIVED" as const }));
    if (!r.rejected) throw new Error("Expected LearningRejected");
    if (!r.rejected.reason.includes("ARCHIVED")) throw new Error(`Wrong reason: ${r.rejected.reason}`);
    return { detail: `rejected: "${r.rejected.reason}"` };
  }));

  // C4
  results.push(await run(4, "Quality Gate rejeita knowledgeScore < 60", async () => {
    const k = await activeKnowledge("C4");
    const r = engine.createLearning(Object.freeze({ ...k, knowledgeScore: LEARNING_QUALITY_THRESHOLD - 1 }));
    if (!r.rejected) throw new Error("Expected LearningRejected");
    return { detail: `rejected: "${r.rejected.reason}"` };
  }));

  // C5
  results.push(await run(5, "learningType herdado diretamente de knowledgeType", async () => {
    const k = await activeKnowledge("C5");
    const r = engine.createLearning(k);
    if (!r.success || !r.learning) throw new Error(r.error ?? "no learning");
    if (r.learning.learningType !== k.knowledgeType) throw new Error(`mismatch: ${r.learning.learningType} != ${k.knowledgeType}`);
    return { detail: `learningType=${r.learning.learningType}` };
  }));

  // C6
  results.push(await run(6, "learningScore herdado diretamente de knowledgeScore", async () => {
    const k = await activeKnowledge("C6");
    const r = engine.createLearning(k);
    if (!r.success || !r.learning) throw new Error(r.error ?? "no learning");
    if (r.learning.learningScore !== k.knowledgeScore) throw new Error(`mismatch: ${r.learning.learningScore} != ${k.knowledgeScore}`);
    return { detail: `learningScore=${r.learning.learningScore}` };
  }));

  // C7
  results.push(await run(7, "confidence herdada diretamente do Knowledge", async () => {
    const k = await activeKnowledge("C7");
    const r = engine.createLearning(k);
    if (!r.success || !r.learning) throw new Error(r.error ?? "no learning");
    if (r.learning.confidence !== k.confidence) throw new Error(`mismatch: ${r.learning.confidence} != ${k.confidence}`);
    return { detail: `confidence=${r.learning.confidence}` };
  }));

  // C8
  results.push(await run(8, "importance herdada diretamente do Knowledge", async () => {
    const k = await activeKnowledge("C8");
    const r = engine.createLearning(k);
    if (!r.success || !r.learning) throw new Error(r.error ?? "no learning");
    if (r.learning.importance !== k.importance) throw new Error(`mismatch: ${r.learning.importance} != ${k.importance}`);
    return { detail: `importance=${r.learning.importance}` };
  }));

  // C9
  results.push(await run(9, "metadata populada com sourceEngine=KnowledgeEngine", async () => {
    const k = await activeKnowledge("C9");
    const r = engine.createLearning(k);
    if (!r.success || !r.learning) throw new Error(r.error ?? "no learning");
    const m = r.learning.metadata;
    if (m.sourceEngine !== "KnowledgeEngine") throw new Error(`sourceEngine=${m.sourceEngine}`);
    if (m.author !== "LearningEngine")        throw new Error(`author=${m.author}`);
    return { detail: `sourceEngine=${m.sourceEngine} v=${m.version}` };
  }));

  // C10
  results.push(await run(10, "insights populados de evidence.lessonsLearned + strengths", async () => {
    const k = await activeKnowledge("C10");
    const r = engine.createLearning(k);
    if (!r.success || !r.learning) throw new Error(r.error ?? "no learning");
    const exp = k.evidence.lessonsLearned.length + k.evidence.strengths.length;
    if (r.learning.insights.length !== exp) throw new Error(`insights=${r.learning.insights.length} expected=${exp}`);
    return { detail: `insights=${r.learning.insights.length}` };
  }));

  // C11
  results.push(await run(11, "patterns populados de improvementPatterns + bestPractices", async () => {
    const k = await activeKnowledge("C11");
    const r = engine.createLearning(k);
    if (!r.success || !r.learning) throw new Error(r.error ?? "no learning");
    const exp = k.evidence.improvementPatterns.length + k.evidence.bestPractices.length;
    if (r.learning.patterns.length !== exp) throw new Error(`patterns=${r.learning.patterns.length} expected=${exp}`);
    return { detail: `patterns=${r.learning.patterns.length}` };
  }));

  // C12
  results.push(await run(12, "recommendations populadas de evidence.recommendations", async () => {
    const k = await activeKnowledge("C12");
    const r = engine.createLearning(k);
    if (!r.success || !r.learning) throw new Error(r.error ?? "no learning");
    if (r.learning.recommendations.length !== k.evidence.recommendations.length)
      throw new Error("recommendations length mismatch");
    return { detail: `recommendations=${r.learning.recommendations.length}` };
  }));

  // C13
  results.push(await run(13, "Campos forward-compat presentes e frozen", async () => {
    const k = await activeKnowledge("C13");
    const r = engine.createLearning(k);
    if (!r.success || !r.learning) throw new Error(r.error ?? "no learning");
    const l = r.learning;
    if (!l.learningFingerprint)                  throw new Error("learningFingerprint missing");
    if (!Array.isArray(l.learningEmbedding))     throw new Error("learningEmbedding missing");
    if (!Object.isFrozen(l.learningEmbedding))   throw new Error("learningEmbedding not frozen");
    if (!Array.isArray(l.futureCapabilities))    throw new Error("futureCapabilities missing");
    return { detail: `fp=${l.learningFingerprint.slice(0, 30)}...` };
  }));

  // C14
  results.push(await run(14, "reject() muda status para REJECTED", async () => {
    const k = await activeKnowledge("C14");
    const r = engine.createLearning(k);
    if (!r.success || !r.learning) throw new Error(r.error ?? "no learning");
    const rej = engine.reject(r.learningId!);
    if (!rej.success) throw new Error(rej.error);
    if (engine.getLearning(r.learningId!)?.status !== "REJECTED") throw new Error("Expected REJECTED");
    return { detail: `status=REJECTED` };
  }));

  // C15
  results.push(await run(15, "archive() muda status para ARCHIVED", async () => {
    const k = await activeKnowledge("C15");
    const r = engine.createLearning(k);
    if (!r.success || !r.learning) throw new Error(r.error ?? "no learning");
    const arc = engine.archive(r.learningId!);
    if (!arc.success) throw new Error(arc.error);
    if (engine.getLearning(r.learningId!)?.status !== "ARCHIVED") throw new Error("Expected ARCHIVED");
    return { detail: `status=ARCHIVED` };
  }));

  // C16
  results.push(await run(16, "statistics() retorna dados corretos", async () => {
    const s = engine.statistics();
    if (typeof s.totalLearning !== "number") throw new Error("totalLearning missing");
    if (s.totalRejected <= 0) throw new Error("Expected rejections from C3/C4");
    return { detail: `learning=${s.totalLearning} rejected=${s.totalRejected} readyForMemory=${s.readyForMemory}` };
  }));

  // C17
  results.push(await run(17, "health() retorna SUCCESS", async () => {
    const hc = engine.health();
    if (hc.status !== "SUCCESS") throw new Error(`health=${hc.status}: ${hc.details}`);
    return { detail: hc.details };
  }));

  // C18
  results.push(await run(18, "LearningEngine nao modifica o Knowledge (SRP)", async () => {
    const k = await activeKnowledge("C18");
    const before = JSON.stringify(k);
    engine.createLearning(k);
    engine.list(); engine.statistics(); engine.health();
    if (JSON.stringify(k) !== before) throw new Error("Engine modified Knowledge");
    return { detail: "Knowledge unchanged -- SRP confirmed" };
  }));

  // H1
  results.push(await run(19, "[Hardening] Knowledge nulo rejeitado graciosamente", async () => {
    const r = engine.createLearning(null as any);
    if (r.success && !r.rejected) throw new Error("Expected failure");
    return { detail: `error: "${r.error}"` };
  }));

  // H2
  results.push(await run(20, "[Hardening] knowledgeId ausente rejeitado", async () => {
    const k = await activeKnowledge("H2");
    const r = engine.createLearning({ ...k, knowledgeId: "" } as any);
    if (r.success && !r.rejected) throw new Error("Expected failure");
    return { detail: `error: "${r.error}"` };
  }));

  // H3
  results.push(await run(21, "[Hardening] Knowledge REJECTED status rejeitado pelo gate", async () => {
    const k = await activeKnowledge("H3");
    const r = engine.createLearning(Object.freeze({ ...k, status: "REJECTED" as const }));
    if (!r.rejected) throw new Error("Expected LearningRejected");
    return { detail: `rejected: "${r.rejected.reason}"` };
  }));

  // H4
  results.push(await run(22, "[Hardening] score=59 rejeitado (abaixo do limite)", async () => {
    const k = await activeKnowledge("H4");
    const r = engine.createLearning(Object.freeze({ ...k, knowledgeScore: 59 }));
    if (!r.rejected) throw new Error("Expected rejection at score=59");
    return { detail: `threshold=${LEARNING_QUALITY_THRESHOLD} score=59 => rejected` };
  }));

  // H5 -- duplicate (same knowledge creates new learningId each time, so not a duplicate issue; test reject on already-rejected)
  results.push(await run(23, "[Hardening] reject() duplo falha graciosamente", async () => {
    const k = await activeKnowledge("H5");
    const r = engine.createLearning(k);
    if (!r.success || !r.learning) throw new Error("No learning created");
    engine.reject(r.learningId!);
    const r2 = engine.reject(r.learningId!);
    if (r2.success) throw new Error("Expected second reject to fail");
    return { detail: `second reject: "${r2.error}"` };
  }));

  // H6
  results.push(await run(24, "[Hardening] archive() duplo falha graciosamente", async () => {
    const k = await activeKnowledge("H6");
    const r = engine.createLearning(k);
    if (!r.success || !r.learning) throw new Error("No learning created");
    engine.archive(r.learningId!);
    const r2 = engine.archive(r.learningId!);
    if (r2.success) throw new Error("Expected second archive to fail");
    return { detail: `second archive: "${r2.error}"` };
  }));

  // H7
  results.push(await run(25, "[Hardening] clear() restaura estado limpo", async () => {
    const tmp = new LearningEngine();
    const k   = await activeKnowledge("H7");
    tmp.createLearning(k);
    tmp.clear();
    if (tmp.statistics().totalLearning !== 0) throw new Error("Expected 0 after clear");
    if (tmp.health().status !== "SUCCESS")    throw new Error("Health failed after clear");
    return { detail: "clear() -> totalLearning=0 health=SUCCESS" };
  }));

  // H8
  results.push(await run(26, "[Hardening] Engine vazio tem health=SUCCESS", async () => {
    const empty = new LearningEngine();
    const hc = empty.health();
    if (hc.status !== "SUCCESS") throw new Error(`Health failed: ${hc.details}`);
    return { detail: `empty engine health=${hc.status}` };
  }));

  // H9
  results.push(await run(27, "[Hardening] Engine nao altera Knowledge em nenhuma operacao", async () => {
    const k = await activeKnowledge("H9");
    const before = JSON.stringify(k);
    const r = engine.createLearning(k);
    engine.list(); engine.statistics(); engine.health(); engine.getLogs(); engine.getMetrics();
    if (r.learning) { engine.reject(r.learningId! + "-bad"); engine.archive(r.learningId! + "-bad"); }
    if (JSON.stringify(k) !== before) throw new Error("Engine modified Knowledge");
    return { detail: "Knowledge unchanged -- SRP confirmed" };
  }));

  // H10
  results.push(await run(28, "[Hardening] score=60 (boundary) e aceito", async () => {
    const k = await activeKnowledge("H10");
    const r = engine.createLearning(Object.freeze({ ...k, knowledgeScore: LEARNING_QUALITY_THRESHOLD }));
    if (!r.success) throw new Error(r.error);
    if (r.rejected) throw new Error(`Expected accept at score=${LEARNING_QUALITY_THRESHOLD}`);
    if (!r.learning) throw new Error("Expected learning at boundary");
    return { detail: `score=${LEARNING_QUALITY_THRESHOLD} => ACCEPTED learningId=${r.learningId}` };
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