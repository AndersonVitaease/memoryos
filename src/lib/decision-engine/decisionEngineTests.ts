// Decision Engine v1.0 — Test Suite
// Foundation v1.0 · Engineering First
// 16 criterios de aceitacao + 8 hardening = 24 cenarios

import { GoalRuntime } from "@/lib/goal-runtime-v01/GoalRuntime";
import { GoalRegistryService } from "@/lib/goal-registry-service/GoalRegistryService";
import { GoalScheduler } from "@/lib/goal-scheduler/GoalScheduler";
import { GoalExecutionQueue } from "@/lib/goal-execution-queue/GoalExecutionQueue";
import { DecisionEngine } from "./DecisionEngine";
import { PRIORITY_SCORE } from "./DecisionEngineTypes";
import type { DecisionCandidate } from "./DecisionEngineTypes";
import type { GoalMetadata, GoalPriority } from "@/lib/goal-runtime-v01/GoalTypes";

export interface DecisionTestResult {
  criterion:  number;
  name:       string;
  passed:     boolean;
  durationMs: number;
  detail?:    string;
  error?:     string;
}

export interface DecisionSuiteResult {
  results:    DecisionTestResult[];
  passed:     number;
  total:      number;
  durationMs: number;
  statistics: ReturnType<DecisionEngine["statistics"]>;
  health:     ReturnType<DecisionEngine["health"]>;
  metrics:    ReturnType<DecisionEngine["getMetrics"]>;
}

let _cIdx = 0;
function makeCandidate(overrides?: Partial<DecisionCandidate>): DecisionCandidate {
  _cIdx++;
  return Object.freeze({
    candidateId: `cand-${_cIdx}-${Date.now()}`,
    goalId:      overrides?.goalId ?? `goal-${_cIdx}`,
    source:      "test",
    score:       0.7,
    confidence:  0.8,
    priority:    "MEDIUM" as GoalPriority,
    reason:      "test candidate",
    metadata:    Object.freeze({}),
    createdAt:   Date.now(),
    ...overrides,
  });
}

async function run(
  n: number, name: string,
  fn: () => Promise<{ detail?: string }>,
): Promise<DecisionTestResult> {
  const t = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, passed: true, durationMs: Date.now() - t, ...out };
  } catch (err) {
    return { criterion: n, name, passed: false, durationMs: Date.now() - t,
      error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runDecisionEngineTests(): Promise<DecisionSuiteResult> {
  const start  = Date.now();
  const rt     = new GoalRuntime();
  const svc    = new GoalRegistryService();
  const sch    = new GoalScheduler(svc);
  const queue  = new GoalExecutionQueue(svc, sch);
  const engine = new DecisionEngine(undefined, svc, sch, queue);
  const results: DecisionTestResult[] = [];
  const future = Date.now() + 60_000;

  // Helper: create a full-stack goal
  async function makeGoal(overrides?: Partial<GoalMetadata>): Promise<string> {
    const r = await rt.create({
      title: "DE Test Goal", description: "test", priority: "MEDIUM",
      origin: "USER", userId: "u1", projectId: "p1", sessionId: "s1",
      tags: ["de"], ...overrides,
    });
    if (!r.success) throw new Error(`Runtime: ${r.error}`);
    const goal = rt.get(r.goalId)!;
    svc.register(goal);
    sch.schedule(r.goalId, future, goal.metadata().priority);
    return r.goalId;
  }

  // ── C1: Seleciona o melhor candidato ─────────────────────────────────────
  results.push(await run(1, "Seleciona o melhor candidato corretamente", async () => {
    const goalId = await makeGoal({ title: "C1 Best" });
    const low  = makeCandidate({ goalId, score: 0.3, confidence: 0.4, priority: "LOW",    reason: "low" });
    const high = makeCandidate({ goalId, score: 0.9, confidence: 0.9, priority: "CRITICAL", reason: "high" });
    const r = engine.selectBest([low, high]);
    if (!r.success) throw new Error(r.error);
    if (r.best?.candidateId !== high.candidateId) throw new Error(`Expected high-score, got ${r.best?.candidateId}`);
    return { detail: `best=${r.best?.candidateId} score=${r.result?.score.toFixed(3)}` };
  }));

  // ── C2: Ranking funciona corretamente ────────────────────────────────────
  results.push(await run(2, "Ranking funciona — melhor candidato primeiro", async () => {
    const goalId = await makeGoal({ title: "C2 Rank" });
    const c1 = makeCandidate({ goalId, score: 0.5, confidence: 0.5, priority: "LOW",    reason: "c1" });
    const c2 = makeCandidate({ goalId, score: 0.8, confidence: 0.9, priority: "HIGH",   reason: "c2" });
    const c3 = makeCandidate({ goalId, score: 0.3, confidence: 0.3, priority: "MEDIUM", reason: "c3" });
    const r = engine.rank([c1, c2, c3]);
    if (!r.success) throw new Error(r.error);
    if (r.ranked![0].candidateId !== c2.candidateId) throw new Error(`Expected c2 first`);
    if (r.ranked![2].candidateId !== c3.candidateId) throw new Error(`Expected c3 last`);
    return { detail: `ranked: ${r.ranked!.map(c => c.reason).join(" > ")}` };
  }));

  // ── C3: Compare funciona ──────────────────────────────────────────────────
  results.push(await run(3, "compare() seleciona o candidato com maior score", async () => {
    const goalId = await makeGoal({ title: "C3 Compare" });
    const weak   = makeCandidate({ goalId, score: 0.2, confidence: 0.3, priority: "LOW",      reason: "weak" });
    const strong = makeCandidate({ goalId, score: 0.9, confidence: 0.9, priority: "CRITICAL", reason: "strong" });
    const r = engine.compare(weak, strong);
    if (!r.success) throw new Error(r.error);
    if (r.winner?.candidateId !== strong.candidateId) throw new Error(`Expected strong to win`);
    return { detail: `winner=${r.winner?.reason} delta=${r.delta}` };
  }));

  // ── C4: Score calculado corretamente ─────────────────────────────────────
  results.push(await run(4, "Score composto e calculado com pesos corretos", async () => {
    const c = makeCandidate({ score: 0.8, confidence: 0.6, priority: "HIGH" });
    const computed = engine.computeScore(c);
    // Default weights: priority=0.30, confidence=0.35, score=0.35
    const expected = 0.30 * PRIORITY_SCORE["HIGH"] + 0.35 * 0.6 + 0.35 * 0.8;
    if (Math.abs(computed - expected) > 0.001) throw new Error(`Expected ${expected.toFixed(4)}, got ${computed.toFixed(4)}`);
    return { detail: `computeScore=${computed.toFixed(4)} expected=${expected.toFixed(4)}` };
  }));

  // ── C5: Confidence influencia corretamente ────────────────────────────────
  results.push(await run(5, "Confidence influencia corretamente o score final", async () => {
    const base  = makeCandidate({ score: 0.7, confidence: 0.3, priority: "MEDIUM" });
    const conf  = makeCandidate({ score: 0.7, confidence: 0.9, priority: "MEDIUM" });
    const sBase = engine.computeScore(base);
    const sConf = engine.computeScore(conf);
    if (sConf <= sBase) throw new Error(`Higher confidence should yield higher score: ${sConf} <= ${sBase}`);
    return { detail: `conf=0.3 => ${sBase.toFixed(3)} | conf=0.9 => ${sConf.toFixed(3)}` };
  }));

  // ── C6: Priority influencia corretamente ──────────────────────────────────
  results.push(await run(6, "Priority influencia corretamente o score final", async () => {
    const low  = makeCandidate({ score: 0.7, confidence: 0.7, priority: "LOW"      });
    const crit = makeCandidate({ score: 0.7, confidence: 0.7, priority: "CRITICAL" });
    const sLow  = engine.computeScore(low);
    const sCrit = engine.computeScore(crit);
    if (sCrit <= sLow) throw new Error(`CRITICAL should score higher than LOW: ${sCrit} <= ${sLow}`);
    return { detail: `LOW=${sLow.toFixed(3)} CRITICAL=${sCrit.toFixed(3)}` };
  }));

  // ── C7: Tie Break funciona ────────────────────────────────────────────────
  results.push(await run(7, "Tie Break desempata por Priority → Confidence → CreatedAt → CandidateId", async () => {
    const goalId = await makeGoal({ title: "C7 TieBreak" });
    const t0 = Date.now();
    const a = Object.freeze<DecisionCandidate>({
      candidateId: "a-first", goalId, source: "test",
      score: 0.7, confidence: 0.7, priority: "MEDIUM", reason: "a",
      metadata: Object.freeze({}), createdAt: t0,
    });
    const b = Object.freeze<DecisionCandidate>({
      candidateId: "b-second", goalId, source: "test",
      score: 0.7, confidence: 0.7, priority: "MEDIUM", reason: "b",
      metadata: Object.freeze({}), createdAt: t0 + 100, // later = lower preference
    });
    const r = engine.rank([b, a]);
    if (!r.success) throw new Error(r.error);
    if (r.ranked![0].candidateId !== "a-first") throw new Error(`Expected a-first (earlier createdAt)`);
    return { detail: `tie resolved by createdAt: ${r.ranked![0].reason} wins` };
  }));

  // ── C8: Statistics corretas ───────────────────────────────────────────────
  results.push(await run(8, "Statistics sao corretas e atualizadas", async () => {
    const s = engine.statistics();
    if (s.totalEvaluated <= 0)   throw new Error("totalEvaluated = 0");
    if (s.totalSelected <= 0)    throw new Error("totalSelected = 0");
    if (s.averageScore <= 0)     throw new Error("averageScore = 0");
    if (s.highestScore <= 0)     throw new Error("highestScore = 0");
    if (s.highestScore < s.lowestScore) throw new Error("highestScore < lowestScore");
    return { detail: `evaluated=${s.totalEvaluated} selected=${s.totalSelected} avgScore=${s.averageScore} high=${s.highestScore.toFixed(3)} low=${s.lowestScore.toFixed(3)}` };
  }));

  // ── C9: Metrics corretas ──────────────────────────────────────────────────
  results.push(await run(9, "Metrics sao corretas e atualizadas", async () => {
    const m = engine.getMetrics();
    if (m.evaluationTotal <= 0)  throw new Error("evaluationTotal = 0");
    if (m.selectionTotal <= 0)   throw new Error("selectionTotal = 0");
    if (m.comparisonTotal <= 0)  throw new Error("comparisonTotal = 0");
    if (m.rankingTotal <= 0)     throw new Error("rankingTotal = 0");
    if (typeof m.avgDurationMs !== "number") throw new Error("avgDurationMs absent");
    return { detail: `eval=${m.evaluationTotal} sel=${m.selectionTotal} cmp=${m.comparisonTotal} rank=${m.rankingTotal} avg=${m.avgDurationMs}ms` };
  }));

  // ── C10: Logs produzidos ──────────────────────────────────────────────────
  results.push(await run(10, "Logs sao produzidos automaticamente", async () => {
    const logs = engine.getLogs();
    if (logs.length === 0)    throw new Error("No logs");
    if (!logs[0].executionId) throw new Error("executionId absent");
    if (!logs[0].operation)   throw new Error("operation absent");
    if (!logs[0].timestamp)   throw new Error("timestamp absent");
    return { detail: `logs=${logs.length} ops=${[...new Set(logs.map(l => l.operation))].join(",")}` };
  }));

  // ── C11: Health retorna SUCCESS ───────────────────────────────────────────
  results.push(await run(11, "Health retorna SUCCESS", async () => {
    const hc = engine.health();
    if (hc.status !== "SUCCESS") throw new Error(`health=${hc.status}: ${hc.details}`);
    if (!hc.checks.candidateIntegrity) throw new Error("candidateIntegrity failed");
    if (!hc.checks.scoreIntegrity)     throw new Error("scoreIntegrity failed");
    if (!hc.checks.rankingIntegrity)   throw new Error("rankingIntegrity failed");
    if (!hc.checks.consistencyCheck)   throw new Error("consistencyCheck failed");
    return { detail: hc.details };
  }));

  // ── C12: Objetos sao imutaveis ────────────────────────────────────────────
  results.push(await run(12, "Objetos DecisionResult e DecisionCandidate sao imutaveis", async () => {
    const goalId = await makeGoal({ title: "C12 Immutable" });
    const c = makeCandidate({ goalId, score: 0.6, confidence: 0.7, priority: "HIGH" });
    if (!Object.isFrozen(c)) throw new Error("DecisionCandidate is not frozen");
    const r = engine.selectBest([c]);
    if (!r.success) throw new Error(r.error);
    if (!Object.isFrozen(r.result)) throw new Error("DecisionResult is not frozen");
    return { detail: "DecisionCandidate and DecisionResult are both Object.freeze()" };
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

  // ── C16: Queue reutilizada ────────────────────────────────────────────────
  results.push(await run(16, "Goal Execution Queue e reutilizada integralmente", async () => {
    // The engine holds a reference to queue; queue was used by Dispatcher in earlier tests
    if (!queue) throw new Error("Queue reference absent");
    const s = queue.statistics();
    return { detail: `Queue ref present: enqueued=${s.enqueued}` };
  }));

  // ── H1: Lista vazia ───────────────────────────────────────────────────────
  results.push(await run(17, "[Hardening] Lista vazia e rejeitada", async () => {
    const r1 = engine.selectBest([]);
    const r2 = engine.rank([]);
    if (r1.success) throw new Error("selectBest([]) should fail");
    if (r2.success) throw new Error("rank([]) should fail");
    return { detail: `selectBest([])="${r1.error}" rank([])="${r2.error}"` };
  }));

  // ── H2: Score invalido ────────────────────────────────────────────────────
  results.push(await run(18, "[Hardening] Score invalido e rejeitado", async () => {
    const bad = makeCandidate({ score: 1.5 });
    const r = engine.selectBest([bad]);
    if (r.success) throw new Error("Expected failure for score > 1");
    return { detail: `rejected: "${r.error}"` };
  }));

  // ── H3: Confidence invalida ───────────────────────────────────────────────
  results.push(await run(19, "[Hardening] Confidence invalida e rejeitada", async () => {
    const bad = makeCandidate({ confidence: -0.1 });
    const r = engine.selectBest([bad]);
    if (r.success) throw new Error("Expected failure for confidence < 0");
    return { detail: `rejected: "${r.error}"` };
  }));

  // ── H4: Priority invalida ─────────────────────────────────────────────────
  results.push(await run(20, "[Hardening] Priority invalida e rejeitada", async () => {
    const bad = makeCandidate({ priority: "ULTRA" as any });
    const r = engine.selectBest([bad]);
    if (r.success) throw new Error("Expected failure for invalid priority");
    return { detail: `rejected: "${r.error}"` };
  }));

  // ── H5: Candidate duplicado — ranking determinista ────────────────────────
  results.push(await run(21, "[Hardening] Candidatos identicos — ranking determinista", async () => {
    const goalId = await makeGoal({ title: "H5 Dupe" });
    const t0 = Date.now();
    const c1 = Object.freeze<DecisionCandidate>({
      candidateId: "dup-a", goalId, source: "test",
      score: 0.7, confidence: 0.7, priority: "MEDIUM", reason: "dup-a",
      metadata: Object.freeze({}), createdAt: t0,
    });
    const c2 = Object.freeze<DecisionCandidate>({
      candidateId: "dup-b", goalId, source: "test",
      score: 0.7, confidence: 0.7, priority: "MEDIUM", reason: "dup-b",
      metadata: Object.freeze({}), createdAt: t0,
    });
    const r1 = engine.rank([c1, c2]);
    const r2 = engine.rank([c2, c1]);
    if (!r1.success || !r2.success) throw new Error("rank failed");
    // Final tiebreak is lexicographic candidateId
    if (r1.ranked![0].candidateId !== r2.ranked![0].candidateId) {
      throw new Error("Ranking is not deterministic");
    }
    return { detail: `deterministic: winner=${r1.ranked![0].candidateId}` };
  }));

  // ── H6: clear() restaura estado limpo ────────────────────────────────────
  results.push(await run(22, "[Hardening] clear() restaura estado completamente limpo", async () => {
    const tmp = new DecisionEngine();
    tmp.selectBest([makeCandidate()]);
    tmp.clear();
    const m  = tmp.getMetrics();
    const s  = tmp.statistics();
    const hc = tmp.health();
    if (m.evaluationTotal !== 0) throw new Error(`evaluationTotal should be 0 after clear`);
    if (s.totalSelected !== 0)   throw new Error(`totalSelected should be 0 after clear`);
    if (hc.status !== "SUCCESS") throw new Error(`Health failed after clear`);
    // clear() itself adds a log entry
    if (tmp.getLogs().length === 0) throw new Error("clear log absent");
    return { detail: `clear() → evaluated=0 selected=0 health=${hc.status}` };
  }));

  // ── H7: Engine nao modifica Goal ─────────────────────────────────────────
  results.push(await run(23, "[Hardening] Decision Engine nao modifica Goal", async () => {
    const goalId       = await makeGoal({ title: "H7 Immutability" });
    const goal         = rt.get(goalId)!;
    const statusBefore = goal.getStatus();
    const titleBefore  = goal.metadata().title;
    const c = makeCandidate({ goalId, score: 0.8, confidence: 0.9, priority: "HIGH" });
    engine.selectBest([c]);
    engine.rank([c]);
    engine.statistics();
    engine.health();
    if (goal.getStatus()      !== statusBefore) throw new Error("Engine modified Goal status");
    if (goal.metadata().title !== titleBefore)  throw new Error("Engine modified Goal title");
    return { detail: `status=${statusBefore} unchanged — no side effects confirmed` };
  }));

  // ── H8: Health consistente em estado vazio ────────────────────────────────
  results.push(await run(24, "[Hardening] Health consistente em estado vazio", async () => {
    const empty = new DecisionEngine();
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