// Memory Engine v1.0 -- Test Suite
// Foundation v1.0 · Engineering First · Sprint 23
// 18 acceptance criteria + 10 hardening = 28 scenarios

import { GoalRuntime }          from "@/lib/goal-runtime-v01/GoalRuntime";
import { GoalRegistryService }  from "@/lib/goal-registry-service/GoalRegistryService";
import { DecisionEngine }       from "@/lib/decision-engine/DecisionEngine";
import { PlanningEngine }       from "@/lib/planning-engine/PlanningEngine";
import { ReflectionEngine }     from "@/lib/reflection-engine/ReflectionEngine";
import { SelfEvaluationEngine } from "@/lib/self-evaluation-engine/SelfEvaluationEngine";
import { KnowledgeEngine }      from "@/lib/knowledge-engine/KnowledgeEngine";
import { LearningEngine }       from "@/lib/learning-engine/LearningEngine";
import { MemoryEngine }         from "./MemoryEngine";
import { MEMORY_QUALITY_THRESHOLD } from "./MemoryEngineTypes";
import type { Learning }         from "@/lib/learning-engine/LearningEngineTypes";
import type { ExecutionResult }  from "@/lib/reflection-engine/ReflectionEngineTypes";
import type { DecisionCandidate } from "@/lib/decision-engine/DecisionEngineTypes";

export interface METestResult {
  criterion:  number;
  name:       string;
  passed:     boolean;
  durationMs: number;
  detail?:    string;
  error?:     string;
}

export interface MESuiteResult {
  results:    METestResult[];
  passed:     number;
  total:      number;
  durationMs: number;
  statistics: ReturnType<MemoryEngine["statistics"]>;
  health:     ReturnType<MemoryEngine["health"]>;
  metrics:    ReturnType<MemoryEngine["getMetrics"]>;
}

async function run(n: number, name: string, fn: () => Promise<{ detail?: string }>): Promise<METestResult> {
  const t = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, passed: true, durationMs: Date.now() - t, ...out };
  } catch (err) {
    return { criterion: n, name, passed: false, durationMs: Date.now() - t,
      error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Full pipeline fixture ─────────────────────────────────────────────────────

async function buildLearning(
  rt: GoalRuntime, svc: GoalRegistryService, de: DecisionEngine,
  pe: PlanningEngine, re: ReflectionEngine, see: SelfEvaluationEngine,
  ke: KnowledgeEngine, le: LearningEngine,
  goalTitle = "ME Test",
  execOverrides?: Partial<ExecutionResult>,
): Promise<Learning | null> {
  const gr = await rt.create({
    title: goalTitle, description: "test", priority: "MEDIUM",
    origin: "USER", userId: "u1", projectId: "p1", sessionId: "s1", tags: ["memory"],
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
  if (!kr.success || !kr.knowledge) throw new Error(`Knowledge: ${kr.error}`);

  const lr = le.createLearning(kr.knowledge);
  if (!lr.success) {
    // Quality gate may reject — return null to skip
    return null;
  }
  return lr.learning ?? null;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

export async function runMemoryEngineTests(): Promise<MESuiteResult> {
  const start  = Date.now();
  const rt     = new GoalRuntime();
  const svc    = new GoalRegistryService();
  const de     = new DecisionEngine();
  const pe     = new PlanningEngine(svc);
  const re     = new ReflectionEngine(pe, de);
  const see    = new SelfEvaluationEngine(re, pe, de);
  const ke     = new KnowledgeEngine();
  const le     = new LearningEngine();
  const engine = new MemoryEngine();
  const results: METestResult[] = [];

  async function activeLearning(title = "ME"): Promise<Learning> {
    const l = await buildLearning(rt, svc, de, pe, re, see, ke, le, title);
    if (!l) throw new Error("Learning rejected by quality gate -- cannot build Memory fixture");
    return l;
  }

  // ── C1: Criação básica ────────────────────────────────────────────────────────
  results.push(await run(1, "Memory e criada com sucesso a partir de Learning ACTIVE", async () => {
    const l = await activeLearning("C1");
    const r = engine.createMemory(l);
    if (!r.success || !r.memory) throw new Error(r.error ?? "no memory");
    return { detail: `memoryId=${r.memoryId} type=${r.memory.memoryType} score=${r.memory.memoryScore}` };
  }));

  // ── C2: Imutabilidade ────────────────────────────────────────────────────────
  results.push(await run(2, "Memory e totalmente imutavel -- Object.freeze()", async () => {
    const l = await activeLearning("C2");
    const r = engine.createMemory(l);
    if (!r.success || !r.memory) throw new Error(r.error ?? "no memory");
    if (!Object.isFrozen(r.memory))           throw new Error("Memory not frozen");
    if (!Object.isFrozen(r.memory.evidence))  throw new Error("evidence not frozen");
    if (!Object.isFrozen(r.memory.metadata))  throw new Error("metadata not frozen");
    if (!Object.isFrozen(r.memory.evidence.insights))        throw new Error("insights not frozen");
    if (!Object.isFrozen(r.memory.evidence.patterns))        throw new Error("patterns not frozen");
    if (!Object.isFrozen(r.memory.evidence.recommendations)) throw new Error("recommendations not frozen");
    return { detail: "All nested objects frozen" };
  }));

  // ── C3: Memory Gate — status != ACTIVE ────────────────────────────────────────
  results.push(await run(3, "Memory Gate rejeita Learning com status != ACTIVE", async () => {
    const l = await activeLearning("C3");
    const r = engine.createMemory(Object.freeze({ ...l, status: "ARCHIVED" as const }));
    if (!r.rejected) throw new Error("Expected MemoryRejected");
    if (!r.rejected.reason.includes("ARCHIVED")) throw new Error(`Wrong reason: ${r.rejected.reason}`);
    return { detail: `rejected: "${r.rejected.reason}"` };
  }));

  // ── C4: Memory Gate — score abaixo do limiar ──────────────────────────────────
  results.push(await run(4, "Memory Gate rejeita learningScore < 70", async () => {
    const l = await activeLearning("C4");
    const r = engine.createMemory(Object.freeze({ ...l, learningScore: MEMORY_QUALITY_THRESHOLD - 1 }));
    if (!r.rejected) throw new Error("Expected MemoryRejected");
    return { detail: `rejected: "${r.rejected.reason}"` };
  }));

  // ── C5: Mirror — memoryType ───────────────────────────────────────────────────
  results.push(await run(5, "memoryType espelha learningType (Mirror Principle)", async () => {
    const l = await activeLearning("C5");
    const r = engine.createMemory(l);
    if (!r.success || !r.memory) throw new Error(r.error ?? "no memory");
    if (r.memory.memoryType !== l.learningType) throw new Error(`mismatch: ${r.memory.memoryType} != ${l.learningType}`);
    return { detail: `memoryType=${r.memory.memoryType}` };
  }));

  // ── C6: Mirror — memoryScore ──────────────────────────────────────────────────
  results.push(await run(6, "memoryScore espelha learningScore (Mirror Principle)", async () => {
    const l = await activeLearning("C6");
    const r = engine.createMemory(l);
    if (!r.success || !r.memory) throw new Error(r.error ?? "no memory");
    if (r.memory.memoryScore !== l.learningScore) throw new Error(`mismatch: ${r.memory.memoryScore} != ${l.learningScore}`);
    return { detail: `memoryScore=${r.memory.memoryScore}` };
  }));

  // ── C7: Mirror — importance ───────────────────────────────────────────────────
  results.push(await run(7, "importance espelha Learning.importance (Mirror Principle)", async () => {
    const l = await activeLearning("C7");
    const r = engine.createMemory(l);
    if (!r.success || !r.memory) throw new Error(r.error ?? "no memory");
    if (r.memory.importance !== l.importance) throw new Error(`mismatch: ${r.memory.importance} != ${l.importance}`);
    return { detail: `importance=${r.memory.importance}` };
  }));

  // ── C8: Mirror — confidence ───────────────────────────────────────────────────
  results.push(await run(8, "confidence espelha Learning.confidence (Mirror Principle)", async () => {
    const l = await activeLearning("C8");
    const r = engine.createMemory(l);
    if (!r.success || !r.memory) throw new Error(r.error ?? "no memory");
    if (r.memory.confidence !== l.confidence) throw new Error(`mismatch: ${r.memory.confidence} != ${l.confidence}`);
    return { detail: `confidence=${r.memory.confidence}` };
  }));

  // ── C9: Evidence — insights ────────────────────────────────────────────────────
  results.push(await run(9, "evidence.insights espelha Learning.insights", async () => {
    const l = await activeLearning("C9");
    const r = engine.createMemory(l);
    if (!r.success || !r.memory) throw new Error(r.error ?? "no memory");
    if (r.memory.evidence.insights.length !== l.insights.length)
      throw new Error(`insights length mismatch: ${r.memory.evidence.insights.length} != ${l.insights.length}`);
    return { detail: `insights=${r.memory.evidence.insights.length}` };
  }));

  // ── C10: Evidence — patterns ──────────────────────────────────────────────────
  results.push(await run(10, "evidence.patterns espelha Learning.patterns", async () => {
    const l = await activeLearning("C10");
    const r = engine.createMemory(l);
    if (!r.success || !r.memory) throw new Error(r.error ?? "no memory");
    if (r.memory.evidence.patterns.length !== l.patterns.length)
      throw new Error(`patterns length mismatch: ${r.memory.evidence.patterns.length} != ${l.patterns.length}`);
    return { detail: `patterns=${r.memory.evidence.patterns.length}` };
  }));

  // ── C11: Evidence — recommendations ───────────────────────────────────────────
  results.push(await run(11, "evidence.recommendations espelha Learning.recommendations", async () => {
    const l = await activeLearning("C11");
    const r = engine.createMemory(l);
    if (!r.success || !r.memory) throw new Error(r.error ?? "no memory");
    if (r.memory.evidence.recommendations.length !== l.recommendations.length)
      throw new Error(`recommendations length mismatch`);
    return { detail: `recommendations=${r.memory.evidence.recommendations.length}` };
  }));

  // ── C12: Metadata ─────────────────────────────────────────────────────────────
  results.push(await run(12, "metadata populada com sourceEngine=LearningEngine", async () => {
    const l = await activeLearning("C12");
    const r = engine.createMemory(l);
    if (!r.success || !r.memory) throw new Error(r.error ?? "no memory");
    const m = r.memory.metadata;
    if (m.sourceEngine !== "LearningEngine") throw new Error(`sourceEngine=${m.sourceEngine}`);
    if (m.author !== "MemoryEngine")         throw new Error(`author=${m.author}`);
    if (m.createdBy !== "MemoryEngine v1.0") throw new Error(`createdBy=${m.createdBy}`);
    return { detail: `sourceEngine=${m.sourceEngine} v=${m.version}` };
  }));

  // ── C13: Forward-compatibility ────────────────────────────────────────────────
  results.push(await run(13, "Campos forward-compat presentes e frozen", async () => {
    const l = await activeLearning("C13");
    const r = engine.createMemory(l);
    if (!r.success || !r.memory) throw new Error(r.error ?? "no memory");
    const m = r.memory;
    if (!m.memoryFingerprint)                throw new Error("memoryFingerprint missing");
    if (!Array.isArray(m.memoryEmbedding))   throw new Error("memoryEmbedding missing");
    if (!Object.isFrozen(m.memoryEmbedding)) throw new Error("memoryEmbedding not frozen");
    if (!Array.isArray(m.futureCapabilities))throw new Error("futureCapabilities missing");
    if (!m.memoryVersion)                    throw new Error("memoryVersion missing");
    if (!m.foundationVersion)                throw new Error("foundationVersion missing");
    if (!m.architectureVersion)              throw new Error("architectureVersion missing");
    return { detail: `fp=${m.memoryFingerprint.slice(0, 30)}... v=${m.memoryVersion}` };
  }));

  // ── C14: reject() ─────────────────────────────────────────────────────────────
  results.push(await run(14, "reject() muda status para REJECTED", async () => {
    const l = await activeLearning("C14");
    const r = engine.createMemory(l);
    if (!r.success || !r.memory) throw new Error(r.error ?? "no memory");
    const rej = engine.reject(r.memoryId!);
    if (!rej.success) throw new Error(rej.error);
    if (engine.getMemory(r.memoryId!)?.status !== "REJECTED") throw new Error("Expected REJECTED");
    return { detail: "status=REJECTED" };
  }));

  // ── C15: archive() ────────────────────────────────────────────────────────────
  results.push(await run(15, "archive() muda status para ARCHIVED", async () => {
    const l = await activeLearning("C15");
    const r = engine.createMemory(l);
    if (!r.success || !r.memory) throw new Error(r.error ?? "no memory");
    const arc = engine.archive(r.memoryId!);
    if (!arc.success) throw new Error(arc.error);
    if (engine.getMemory(r.memoryId!)?.status !== "ARCHIVED") throw new Error("Expected ARCHIVED");
    return { detail: "status=ARCHIVED" };
  }));

  // ── C16: statistics() ─────────────────────────────────────────────────────────
  results.push(await run(16, "statistics() retorna dados corretos", async () => {
    const s = engine.statistics();
    if (typeof s.totalMemory !== "number") throw new Error("totalMemory missing");
    if (s.totalRejected <= 0) throw new Error("Expected rejections from C3/C4");
    return { detail: `memory=${s.totalMemory} rejected=${s.totalRejected} ready=${s.readyForRetrieval}` };
  }));

  // ── C17: health() ─────────────────────────────────────────────────────────────
  results.push(await run(17, "health() retorna SUCCESS", async () => {
    const hc = engine.health();
    if (hc.status !== "SUCCESS") throw new Error(`health=${hc.status}: ${hc.details}`);
    return { detail: hc.details };
  }));

  // ── C18: SRP — Learning nao modificado ────────────────────────────────────────
  results.push(await run(18, "MemoryEngine nao modifica o Learning (SRP)", async () => {
    const l = await activeLearning("C18");
    const before = JSON.stringify(l);
    engine.createMemory(l);
    engine.list(); engine.statistics(); engine.health();
    if (JSON.stringify(l) !== before) throw new Error("Engine modified Learning");
    return { detail: "Learning unchanged -- SRP confirmed" };
  }));

  // ── H1: Learning nulo ─────────────────────────────────────────────────────────
  results.push(await run(19, "[Hardening] Learning nulo rejeitado graciosamente", async () => {
    const r = engine.createMemory(null as any);
    if (r.success && !r.rejected) throw new Error("Expected failure");
    return { detail: `error: "${r.error}"` };
  }));

  // ── H2: learningId ausente ────────────────────────────────────────────────────
  results.push(await run(20, "[Hardening] learningId ausente rejeitado", async () => {
    const l = await activeLearning("H2");
    const r = engine.createMemory({ ...l, learningId: "" } as any);
    if (r.success && !r.rejected) throw new Error("Expected failure");
    return { detail: `error: "${r.error}"` };
  }));

  // ── H3: status REJECTED ───────────────────────────────────────────────────────
  results.push(await run(21, "[Hardening] Learning REJECTED status rejeitado pelo gate", async () => {
    const l = await activeLearning("H3");
    const r = engine.createMemory(Object.freeze({ ...l, status: "REJECTED" as const }));
    if (!r.rejected) throw new Error("Expected MemoryRejected");
    return { detail: `rejected: "${r.rejected.reason}"` };
  }));

  // ── H4: score=69 (abaixo do limiar) ──────────────────────────────────────────
  results.push(await run(22, "[Hardening] score=69 rejeitado (abaixo do limite)", async () => {
    const l = await activeLearning("H4");
    const r = engine.createMemory(Object.freeze({ ...l, learningScore: 69 }));
    if (!r.rejected) throw new Error("Expected rejection at score=69");
    return { detail: `threshold=${MEMORY_QUALITY_THRESHOLD} score=69 => rejected` };
  }));

  // ── H5: reject() duplo ────────────────────────────────────────────────────────
  results.push(await run(23, "[Hardening] reject() duplo falha graciosamente", async () => {
    const l = await activeLearning("H5");
    const r = engine.createMemory(l);
    if (!r.success || !r.memory) throw new Error("No memory created");
    engine.reject(r.memoryId!);
    const r2 = engine.reject(r.memoryId!);
    if (r2.success) throw new Error("Expected second reject to fail");
    return { detail: `second reject: "${r2.error}"` };
  }));

  // ── H6: archive() duplo ───────────────────────────────────────────────────────
  results.push(await run(24, "[Hardening] archive() duplo falha graciosamente", async () => {
    const l = await activeLearning("H6");
    const r = engine.createMemory(l);
    if (!r.success || !r.memory) throw new Error("No memory created");
    engine.archive(r.memoryId!);
    const r2 = engine.archive(r.memoryId!);
    if (r2.success) throw new Error("Expected second archive to fail");
    return { detail: `second archive: "${r2.error}"` };
  }));

  // ── H7: clear() ───────────────────────────────────────────────────────────────
  results.push(await run(25, "[Hardening] clear() restaura estado limpo", async () => {
    const tmp = new MemoryEngine();
    const l   = await activeLearning("H7");
    tmp.createMemory(l);
    tmp.clear();
    if (tmp.statistics().totalMemory !== 0) throw new Error("Expected 0 after clear");
    if (tmp.health().status !== "SUCCESS")  throw new Error("Health failed after clear");
    return { detail: "clear() -> totalMemory=0 health=SUCCESS" };
  }));

  // ── H8: Engine vazio ──────────────────────────────────────────────────────────
  results.push(await run(26, "[Hardening] Engine vazio tem health=SUCCESS", async () => {
    const empty = new MemoryEngine();
    const hc = empty.health();
    if (hc.status !== "SUCCESS") throw new Error(`Health failed: ${hc.details}`);
    return { detail: `empty engine health=${hc.status}` };
  }));

  // ── H9: SRP hardening ─────────────────────────────────────────────────────────
  results.push(await run(27, "[Hardening] Engine nao altera Learning em nenhuma operacao", async () => {
    const l = await activeLearning("H9");
    const before = JSON.stringify(l);
    const r = engine.createMemory(l);
    engine.list(); engine.statistics(); engine.health(); engine.getLogs(); engine.getMetrics();
    if (r.memory) { engine.reject(r.memoryId! + "-bad"); engine.archive(r.memoryId! + "-bad"); }
    if (JSON.stringify(l) !== before) throw new Error("Engine modified Learning");
    return { detail: "Learning unchanged -- SRP hardening confirmed" };
  }));

  // ── H10: score=70 (boundary) ──────────────────────────────────────────────────
  results.push(await run(28, "[Hardening] score=70 (boundary) e aceito", async () => {
    const l = await activeLearning("H10");
    const r = engine.createMemory(Object.freeze({ ...l, learningScore: MEMORY_QUALITY_THRESHOLD }));
    if (!r.success) throw new Error(r.error);
    if (r.rejected) throw new Error(`Expected accept at score=${MEMORY_QUALITY_THRESHOLD}`);
    if (!r.memory)  throw new Error("Expected memory at boundary");
    return { detail: `score=${MEMORY_QUALITY_THRESHOLD} => ACCEPTED memoryId=${r.memoryId}` };
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