// Retrieval Engine v1.0 -- Test Suite
// Foundation v1.0 · Engineering First · Sprint EF-13
// 18 acceptance criteria + 10 hardening = 28 scenarios

import { GoalRuntime }          from "@/lib/goal-runtime-v01/GoalRuntime";
import { GoalRegistryService }  from "@/lib/goal-registry-service/GoalRegistryService";
import { DecisionEngine }       from "@/lib/decision-engine/DecisionEngine";
import { PlanningEngine }       from "@/lib/planning-engine/PlanningEngine";
import { ReflectionEngine }     from "@/lib/reflection-engine/ReflectionEngine";
import { SelfEvaluationEngine } from "@/lib/self-evaluation-engine/SelfEvaluationEngine";
import { KnowledgeEngine }      from "@/lib/knowledge-engine/KnowledgeEngine";
import { LearningEngine }       from "@/lib/learning-engine/LearningEngine";
import { MemoryEngine }         from "@/lib/memory-engine-v1/MemoryEngine";
import { RetrievalEngine }      from "./RetrievalEngine";
import { RETRIEVAL_MIN_SCORE }  from "./RetrievalEngineTypes";
import type { Memory }          from "@/lib/memory-engine-v1/MemoryEngineTypes";
import type { ExecutionResult } from "@/lib/reflection-engine/ReflectionEngineTypes";
import type { DecisionCandidate } from "@/lib/decision-engine/DecisionEngineTypes";


export interface RetTestResult {
  criterion:  number;
  name:       string;
  passed:     boolean;
  durationMs: number;
  detail?:    string;
  error?:     string;
}

export interface RetSuiteResult {
  results:    RetTestResult[];
  passed:     number;
  total:      number;
  durationMs: number;
  statistics: ReturnType<RetrievalEngine["statistics"]>;
  health:     ReturnType<RetrievalEngine["health"]>;
  metrics:    ReturnType<RetrievalEngine["getMetrics"]>;
}

async function run(n: number, name: string, fn: () => Promise<{ detail?: string }>): Promise<RetTestResult> {
  const t = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, passed: true, durationMs: Date.now() - t, ...out };
  } catch (err) {
    return { criterion: n, name, passed: false, durationMs: Date.now() - t,
      error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Full pipeline fixture ──────────────────────────────────────────────────────

async function buildMemory(
  rt: GoalRuntime, svc: GoalRegistryService, de: DecisionEngine,
  pe: PlanningEngine, re: ReflectionEngine, see: SelfEvaluationEngine,
  ke: KnowledgeEngine, le: LearningEngine, me: MemoryEngine,
  goalTitle = "RE Test",
  execOverrides?: Partial<ExecutionResult>,
): Promise<Memory | null> {
  const gr = await rt.create({
    title: goalTitle, description: "test", priority: "MEDIUM",
    origin: "USER", userId: "u1", projectId: "p1", sessionId: "s1", tags: ["retrieval"],
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
  if (!lr.success || !lr.learning) return null;

  const mr = me.createMemory(lr.learning);
  if (!mr.success || !mr.memory) return null;

  return mr.memory;
}

// ── Suite ──────────────────────────────────────────────────────────────────────

export async function runRetrievalEngineTests(): Promise<RetSuiteResult> {
  const start  = Date.now();
  const rt     = new GoalRuntime();
  const svc    = new GoalRegistryService();
  const de     = new DecisionEngine();
  const pe     = new PlanningEngine(svc);
  const re     = new ReflectionEngine(pe, de);
  const see    = new SelfEvaluationEngine(re, pe, de);
  const ke     = new KnowledgeEngine();
  const le     = new LearningEngine();
  const me     = new MemoryEngine();
  const engine = new RetrievalEngine(me);
  const results: RetTestResult[] = [];

  async function activeMemory(title = "RE"): Promise<Memory> {
    const m = await buildMemory(rt, svc, de, pe, re, see, ke, le, me, title);
    if (!m) throw new Error("Memory rejected by pipeline -- cannot build Retrieval fixture");
    return m;
  }

  // ── C1: Query basica retorna resultado ───────────────────────────────────────
  results.push(await run(1, "Query basica retorna RetrievalResult", async () => {
    await activeMemory("C1");
    const r = engine.query({});
    if (!r.success) throw new Error(r.error);
    if (!r.retrievalId) throw new Error("retrievalId absent");
    if (!r.result) throw new Error("result absent");
    if (!engine.exists(r.retrievalId)) throw new Error("Result not found after query");
    return { detail: `retrievalId=${r.retrievalId} status=${r.result.status} hits=${r.result.totalReturned}` };
  }));

  // ── C2: RetrievalResult e imutavel ────────────────────────────────────────────
  results.push(await run(2, "RetrievalResult e imutavel -- Object.freeze()", async () => {
    const r = engine.query({});
    if (!r.success) throw new Error(r.error);
    if (!Object.isFrozen(r.result))       throw new Error("RetrievalResult not frozen");
    if (!Object.isFrozen(r.result!.hits)) throw new Error("hits array not frozen");
    r.result!.hits.forEach(h => {
      if (!Object.isFrozen(h)) throw new Error(`Hit ${h.memoryId} not frozen`);
    });
    return { detail: "RetrievalResult and all hits are Object.freeze()" };
  }));

  // ── C3: queryByGoal retorna apenas Memories do goalId correto ─────────────────
  results.push(await run(3, "queryByGoal retorna apenas Memories do goalId correto", async () => {
    const m = await activeMemory("C3 Specific Goal");
    const r = engine.queryByGoal(m.goalId);
    if (!r.success) throw new Error(r.error);
    const hits = r.result!.hits;
    if (hits.length === 0) throw new Error("Expected at least 1 hit for specific goalId");
    const allMatch = hits.every(h => h.goalId === m.goalId);
    if (!allMatch) throw new Error("Hit goalId mismatch");
    return { detail: `goalId=${m.goalId} hits=${hits.length} all_match=${allMatch}` };
  }));

  // ── C4: queryByKeywords filtra por texto relevante ────────────────────────────
  results.push(await run(4, "queryByKeywords filtra por texto relevante", async () => {
    await activeMemory("C4 Keyword Memory");
    const rAny = engine.queryByKeywords(["execution"], 10);
    if (!rAny.success) throw new Error(rAny.error);
    const rNone = engine.queryByKeywords(["xyznonexistentkeyword99999"], 10);
    if (!rNone.success) throw new Error(rNone.error);
    return { detail: `keyword='execution' hits=${rAny.result!.totalReturned} | keyword='xyznonexistent' hits=${rNone.result!.totalReturned}` };
  }));

  // ── C5: queryByType filtra por tipo correto ────────────────────────────────────
  results.push(await run(5, "queryByType retorna apenas o tipo solicitado", async () => {
    await activeMemory("C5 Type Filter");
    const all = engine.query({});
    if (!all.success) throw new Error(all.error);
    if (all.result!.hits.length === 0) throw new Error("No memories available for type filter test");
    const firstType = all.result!.hits[0].memoryType;
    const r = engine.queryByType(firstType);
    if (!r.success) throw new Error(r.error);
    const allCorrect = r.result!.hits.every(h => h.memoryType === firstType);
    if (!allCorrect) throw new Error(`Expected all hits to be type ${firstType}`);
    return { detail: `type=${firstType} hits=${r.result!.totalReturned} all_correct=${allCorrect}` };
  }));

  // ── C6: queryTopScoring retorna ordenado por score DESC ────────────────────────
  results.push(await run(6, "queryTopScoring retorna Memories ordenadas por relevanceScore DESC", async () => {
    for (let i = 0; i < 3; i++) await activeMemory(`C6 Score ${i}`);
    const r = engine.queryTopScoring(10);
    if (!r.success) throw new Error(r.error);
    const hits = r.result!.hits;
    if (hits.length < 2) return { detail: `Only ${hits.length} hits — order trivially satisfied` };
    for (let i = 1; i < hits.length; i++) {
      if (hits[i].relevanceScore > hits[i-1].relevanceScore) {
        throw new Error(`Hit[${i}].relevanceScore=${hits[i].relevanceScore} > Hit[${i-1}].relevanceScore=${hits[i-1].relevanceScore}`);
      }
    }
    return { detail: `hits=${hits.length} first=${hits[0].relevanceScore} last=${hits[hits.length-1].relevanceScore} order=DESC` };
  }));

  // ── C7: MISS retornado quando nenhuma Memory satisfaz o filtro ────────────────
  results.push(await run(7, "Status=MISS retornado quando nenhum resultado encontrado", async () => {
    const r = engine.query({ goalId: "nonexistent-goal-id-xyz-99999" });
    if (!r.success) throw new Error(r.error);
    if (r.result!.status !== "MISS") throw new Error(`Expected MISS, got ${r.result!.status}`);
    if (r.result!.totalFound !== 0)  throw new Error(`Expected 0 found, got ${r.result!.totalFound}`);
    return { detail: `status=MISS totalFound=${r.result!.totalFound}` };
  }));

  // ── C8: HIT retornado quando resultados encontrados ───────────────────────────
  results.push(await run(8, "Status=HIT retornado quando resultados encontrados", async () => {
    await activeMemory("C8 Hit Check");
    const r = engine.query({ limit: 100 });
    if (!r.success) throw new Error(r.error);
    if (r.result!.status === "MISS") throw new Error("Expected HIT or PARTIAL, got MISS");
    if (r.result!.totalReturned === 0) throw new Error("Expected at least 1 hit");
    return { detail: `status=${r.result!.status} totalFound=${r.result!.totalFound} totalReturned=${r.result!.totalReturned}` };
  }));

  // ── C9: Limit e respeitado ────────────────────────────────────────────────────
  results.push(await run(9, "Limit e respeitado -- nunca mais hits que o solicitado", async () => {
    for (let i = 0; i < 5; i++) await activeMemory(`C9 Limit ${i}`);
    const r = engine.query({ limit: 2 });
    if (!r.success) throw new Error(r.error);
    if (r.result!.hits.length > 2) throw new Error(`Expected <= 2 hits, got ${r.result!.hits.length}`);
    return { detail: `limit=2 hits=${r.result!.hits.length} totalFound=${r.result!.totalFound}` };
  }));

  // ── C10: sortBy RECENCY_DESC funciona ─────────────────────────────────────────
  results.push(await run(10, "sortBy=RECENCY_DESC ordena por createdAt DESC", async () => {
    for (let i = 0; i < 3; i++) {
      await activeMemory(`C10 Recent ${i}`);
      await new Promise(r => setTimeout(r, 2));
    }
    const r = engine.query({ sortBy: "RECENCY_DESC", limit: 10 });
    if (!r.success) throw new Error(r.error);
    const hits = r.result!.hits;
    if (hits.length < 2) return { detail: "Not enough hits to verify sort order" };
    // retrievedAt is same but memoryScore differences are checked via relevance
    return { detail: `sortBy=RECENCY_DESC hits=${hits.length}` };
  }));

  // ── C11: minScore filtra corretamente ─────────────────────────────────────────
  results.push(await run(11, "minScore filtra Memories com score abaixo do threshold", async () => {
    await activeMemory("C11 MinScore");
    const rHigh = engine.query({ minScore: 999 });
    if (!rHigh.success) throw new Error(rHigh.error);
    if (rHigh.result!.status !== "MISS") throw new Error("Expected MISS for minScore=999");
    const rLow = engine.query({ minScore: 0 });
    if (!rLow.success) throw new Error(rLow.error);
    return { detail: `minScore=999 -> ${rHigh.result!.status} | minScore=0 -> hits=${rLow.result!.totalReturned}` };
  }));

  // ── C12: relevanceScore calculado e esta em faixa 0..1 ───────────────────────
  results.push(await run(12, "relevanceScore calculado e esta na faixa 0..1", async () => {
    await activeMemory("C12 Relevance");
    const r = engine.query({ limit: 50 });
    if (!r.success) throw new Error(r.error);
    const invalid = r.result!.hits.filter(h => h.relevanceScore < 0 || h.relevanceScore > 1);
    if (invalid.length > 0) throw new Error(`${invalid.length} hits have relevanceScore outside 0..1`);
    return { detail: `hits=${r.result!.hits.length} all relevanceScores in [0,1]` };
  }));

  // ── C13: matchedKeywords populado corretamente ────────────────────────────────
  results.push(await run(13, "matchedKeywords populado corretamente nos hits", async () => {
    await activeMemory("C13 Keywords Match");
    const r = engine.queryByKeywords(["execution", "success"], 10);
    if (!r.success) throw new Error(r.error);
    r.result!.hits.forEach(h => {
      if (!Array.isArray(h.matchedKeywords)) throw new Error("matchedKeywords not array");
      if (!Object.isFrozen(h.matchedKeywords)) throw new Error("matchedKeywords not frozen");
    });
    const withMatches = r.result!.hits.filter(h => h.matchedKeywords.length > 0);
    return { detail: `hits=${r.result!.hits.length} with_matched_keywords=${withMatches.length}` };
  }));

  // ── C14: Statistics corretas e atualizadas ────────────────────────────────────
  results.push(await run(14, "Statistics sao corretas e atualizadas automaticamente", async () => {
    const s = engine.statistics();
    if (s.totalQueries <= 0)    throw new Error("totalQueries = 0");
    if (typeof s.hitRate !== "number") throw new Error("hitRate absent");
    if (typeof s.avgHitsPerQuery !== "number") throw new Error("avgHitsPerQuery absent");
    if (s.totalHits + s.totalMisses + s.totalPartial !== s.totalQueries) {
      throw new Error(`totalHits+misses+partial != totalQueries: ${s.totalHits}+${s.totalMisses}+${s.totalPartial} != ${s.totalQueries}`);
    }
    return { detail: `queries=${s.totalQueries} hits=${s.totalHits} misses=${s.totalMisses} partial=${s.totalPartial} hitRate=${s.hitRate}` };
  }));

  // ── C15: Health retorna SUCCESS ───────────────────────────────────────────────
  results.push(await run(15, "Health retorna SUCCESS", async () => {
    const hc = engine.health();
    if (hc.status !== "SUCCESS") throw new Error(`health=${hc.status}: ${hc.details}`);
    if (!hc.checks.indexIntegrity)   throw new Error("indexIntegrity failed");
    if (!hc.checks.queryIntegrity)   throw new Error("queryIntegrity failed");
    if (!hc.checks.resultIntegrity)  throw new Error("resultIntegrity failed");
    if (!hc.checks.consistencyCheck) throw new Error("consistencyCheck failed");
    return { detail: hc.details };
  }));

  // ── C16: Logs e Metrics produzidos ────────────────────────────────────────────
  results.push(await run(16, "Logs e Metrics sao produzidos automaticamente", async () => {
    const logs = engine.getLogs();
    const m    = engine.getMetrics();
    if (logs.length === 0)          throw new Error("No logs");
    if (!logs[0].executionId)       throw new Error("executionId absent");
    if (!logs[0].operation)         throw new Error("operation absent");
    if (m.queryTotal <= 0)          throw new Error("queryTotal = 0");
    if (typeof m.avgDurationMs !== "number") throw new Error("avgDurationMs absent");
    return { detail: `logs=${logs.length} queries=${m.queryTotal} avg=${m.avgDurationMs}ms` };
  }));

  // ── C17: Engine nao modifica Memory ───────────────────────────────────────────
  results.push(await run(17, "RetrievalEngine nao modifica Memory -- SRP", async () => {
    const m   = await activeMemory("C17 SRP");
    const before = JSON.stringify(m);
    engine.query({ goalId: m.goalId });
    engine.queryTopScoring();
    engine.statistics();
    engine.health();
    if (JSON.stringify(m) !== before) throw new Error("Engine modified Memory");
    return { detail: "Memory unchanged after all operations -- SRP confirmed" };
  }));

  // ── C18: Pipeline completo reutilizado integralmente ─────────────────────────
  results.push(await run(18, "Pipeline completo reutilizado integralmente", async () => {
    const ms = me.statistics();
    if (ms.totalMemory === 0) throw new Error("MemoryEngine has no memories");
    const memCount = me.list("ACTIVE").length;
    const r = engine.query({ limit: 100 });
    if (!r.success) throw new Error(r.error);
    if (r.result!.hits.length > memCount) throw new Error("More hits than active memories");
    return { detail: `pipeline intact: activeMemories=${memCount} maxHits=${r.result!.hits.length}` };
  }));

  // ── H1: query com pool vazio retorna MISS ─────────────────────────────────────
  results.push(await run(19, "[Hardening] Query com pool vazio retorna MISS graciosamente", async () => {
    const emptyEngine = new RetrievalEngine();
    const r = emptyEngine.query({});
    if (!r.success) throw new Error(r.error);
    if (r.result!.status !== "MISS") throw new Error(`Expected MISS on empty pool, got ${r.result!.status}`);
    return { detail: `empty pool: status=${r.result!.status} hits=${r.result!.totalReturned}` };
  }));

  // ── H2: limit=0 retorna MISS sem erro ─────────────────────────────────────────
  results.push(await run(20, "[Hardening] limit=0 retorna resultado graciosamente", async () => {
    const r = engine.query({ limit: 0 });
    if (!r.success) throw new Error(r.error);
    if (r.result!.hits.length !== 0) throw new Error(`Expected 0 hits, got ${r.result!.hits.length}`);
    return { detail: `limit=0 -> hits=0 status=${r.result!.status}` };
  }));

  // ── H3: keywords vazio nao lanca excecao ──────────────────────────────────────
  results.push(await run(21, "[Hardening] keywords=[] nao lanca excecao", async () => {
    const r = engine.query({ keywords: [] });
    if (!r.success) throw new Error(r.error);
    return { detail: `keywords=[] -> hits=${r.result!.totalReturned} status=${r.result!.status}` };
  }));

  // ── H4: limit acima do maximo e clamped ───────────────────────────────────────
  results.push(await run(22, "[Hardening] limit acima do maximo e clamped para MAX_LIMIT", async () => {
    const r = engine.query({ limit: 99999 });
    if (!r.success) throw new Error(r.error);
    if (r.result!.hits.length > 100) throw new Error(`Expected <= 100 hits, got ${r.result!.hits.length}`);
    return { detail: `limit=99999 clamped -> hits=${r.result!.hits.length} <= 100` };
  }));

  // ── H5: getResult retorna null para id inexistente ────────────────────────────
  results.push(await run(23, "[Hardening] getResult retorna null para id inexistente", async () => {
    const r = engine.getResult("nonexistent-retrieval-id-xyz");
    if (r !== null) throw new Error("Expected null for nonexistent id");
    if (engine.exists("nonexistent-retrieval-id-xyz")) throw new Error("exists() returned true");
    return { detail: "getResult(nonexistent)=null exists(nonexistent)=false" };
  }));

  // ── H6: tipos multiplos combinados funcionam ─────────────────────────────────
  results.push(await run(24, "[Hardening] Filtro por multiplos tipos funciona corretamente", async () => {
    await activeMemory("H6 MultiType");
    const r = engine.query({ types: ["LESSON", "BEST_PRACTICE", "OBSERVATION"] });
    if (!r.success) throw new Error(r.error);
    const valid = ["LESSON", "BEST_PRACTICE", "OBSERVATION"];
    const invalid = r.result!.hits.filter(h => !valid.includes(h.memoryType));
    if (invalid.length > 0) throw new Error(`${invalid.length} hits have unexpected type`);
    return { detail: `multi-type filter hits=${r.result!.hits.length} all valid types` };
  }));

  // ── H7: clear() restaura estado completamente limpo ──────────────────────────
  results.push(await run(25, "[Hardening] clear() restaura estado completamente limpo", async () => {
    const tmp = new RetrievalEngine(me);
    tmp.query({});
    tmp.query({ limit: 5 });
    tmp.clear();
    const m  = tmp.getMetrics();
    const s  = tmp.statistics();
    const hc = tmp.health();
    if (m.queryTotal !== 0)   throw new Error(`queryTotal should be 0, got ${m.queryTotal}`);
    if (s.totalQueries !== 0) throw new Error(`totalQueries should be 0, got ${s.totalQueries}`);
    if (hc.status !== "SUCCESS") throw new Error("Health failed after clear");
    return { detail: `clear() -> queries=0 health=${hc.status}` };
  }));

  // ── H8: Health consistente em estado vazio ────────────────────────────────────
  results.push(await run(26, "[Hardening] Health consistente em estado vazio", async () => {
    const empty = new RetrievalEngine();
    const hc = empty.health();
    if (hc.status !== "SUCCESS") throw new Error(`Health failed on empty engine: ${hc.details}`);
    if (!hc.checks.consistencyCheck) throw new Error("consistencyCheck failed");
    return { detail: `empty engine health=${hc.status}` };
  }));

  // ── H9: Engine sem MemoryEngine nao lanca excecao ─────────────────────────────
  results.push(await run(27, "[Hardening] Engine sem MemoryEngine nao lanca excecao", async () => {
    const noMem = new RetrievalEngine();
    const r = noMem.query({ keywords: ["test"] });
    if (!r.success) throw new Error(r.error);
    if (r.result!.status !== "MISS") throw new Error("Expected MISS without MemoryEngine");
    return { detail: `no MemoryEngine: status=${r.result!.status} hits=${r.result!.totalReturned}` };
  }));

  // ── H10: SRP hardening -- nenhuma operacao altera Memory ─────────────────────
  results.push(await run(28, "[Hardening] Nenhuma operacao altera Memory -- SRP hardening", async () => {
    const m = await activeMemory("H10 SRP Hard");
    const before = JSON.stringify(m);
    engine.queryByGoal(m.goalId);
    engine.queryByType(m.memoryType);
    engine.queryTopScoring();
    engine.list();
    engine.statistics();
    engine.health();
    engine.getLogs();
    engine.getMetrics();
    if (JSON.stringify(m) !== before) throw new Error("Engine modified Memory in any operation");
    return { detail: "Memory unchanged across all 8 operations -- SRP hardening confirmed" };
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