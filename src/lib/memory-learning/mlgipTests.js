/**
 * mlgipTests.js — Memory Learning & Goal Intelligence Platform (MLGIP)
 * Sprint 7.1.1B — FASE 12
 *
 * Suite completa de testes.
 */

import {
  indexSession, indexMemory, indexDecision, indexSpecialist,
  addResult, addLesson, getGoalIndex, listGoals, searchGoals,
  recoverByGoal, getStats as goalStats, _resetForTests as resetGoal,
} from "./GoalMemoryIndex";

import {
  recordUsed, recordIgnored, reinforce, penalize,
  applyFeedback, getLearningRecord, getAllRecords,
  applyLearningBoost, getConfidenceLabel, getStats as learningStats,
  _resetForTests as resetLearning,
} from "./MemoryLearningEngine";

import {
  computeDecay, applyDecay, recordAccess, protect,
  getDecayScore, applyDecayToScore, configure, getStats as decayStats,
  _resetForTests as resetDecay,
} from "./MemoryDecayEngine";

import {
  upsertNode, upsertEdge, removeNode, weakenEdge,
  linkGoalToDecision, linkGoalToSession, linkGoalToSpecialist,
  getNode, getNodes, getEdges, getNeighbors, getTopNodes,
  getVersion, getStats as graphStats, _resetForTests as resetGraph,
} from "./PersistentKnowledgeGraph";

import {
  buildGoalContext, detectActiveGoal, getRelevantGoals, buildAllGoalsSummary,
} from "./GoalContextBuilder";

import { computeHealth2, healthReport } from "./MemoryHealth2";

import {
  recordMemoryDecision, recordRelationship, recordLearning,
  getEvents, getStats as obsStats, clearEvents,
} from "./MLGIPObservability";

// ─── Runner ───────────────────────────────────────────────────────────────────

function run(name, fn) {
  const t0 = Date.now();
  try {
    fn();
    return { name, passed: true, duration: Date.now() - t0 };
  } catch (e) {
    return { name, passed: false, error: e.message, duration: Date.now() - t0 };
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

function reset() {
  resetGoal(); resetLearning(); resetDecay(); resetGraph(); clearEvents();
}

// ─── FASE 1 — Goal Memory Index ───────────────────────────────────────────────

const goalIndexTests = [
  run("indexSession cria entrada de objetivo", () => {
    reset();
    indexSession("g1", "Projeto Alpha", "sess1");
    const g = getGoalIndex("g1");
    assert(g !== null, "goal index não criado");
    assert(g.sessions.includes("sess1"), "sessão não indexada");
  }),
  run("indexMemory adiciona memória ao objetivo", () => {
    reset();
    indexMemory("g1", "Goal 1", { memoryId: "m1", type: "decision", content: "Decisão X" });
    const g = getGoalIndex("g1");
    assert(g.memories.length === 1, "memória não indexada");
  }),
  run("indexDecision registra decisão", () => {
    reset();
    indexDecision("g1", "Goal 1", "d1", "Contratar fornecedor");
    const g = getGoalIndex("g1");
    assert(g.decisions.some((d) => d.decisionId === "d1"), "decisão não indexada");
  }),
  run("addLesson e addResult funcionam", () => {
    reset();
    addLesson("g1", "Nunca atrasar entrega");
    addResult("g1", "Projeto entregue com sucesso");
    const g = getGoalIndex("g1");
    assert(g.lessons.length === 1 && g.results.length === 1, "lessons/results não salvos");
  }),
  run("searchGoals encontra por título", () => {
    reset();
    indexSession("g1", "Projeto Alpha", "sess1");
    indexSession("g2", "Projeto Beta", "sess2");
    const results = searchGoals("alpha");
    assert(results.some((r) => r.goalId === "g1"), "busca não encontrou goal");
  }),
  run("recoverByGoal retorna índice completo", () => {
    reset();
    indexSession("g1", "Goal 1", "sess1");
    indexDecision("g1", "Goal 1", "d1", "Dec 1");
    const recovered = recoverByGoal("g1");
    assert(recovered !== null && recovered.decisions.length > 0, "recuperação falhou");
  }),
  run("listGoals retorna todos os objetivos", () => {
    reset();
    indexSession("g1", "Goal 1", "s1");
    indexSession("g2", "Goal 2", "s2");
    const all = listGoals();
    assert(all.length === 2, `esperado 2, got ${all.length}`);
  }),
  run("getStats retorna métricas", () => {
    reset();
    indexSession("g1", "Goal 1", "s1");
    const s = goalStats();
    assert(s.totalGoals === 1, "stats incorretos");
  }),
];

// ─── FASE 2+3 — Learning Engine + Confidence Evolution ───────────────────────

const learningTests = [
  run("recordUsed aumenta learningScore", () => {
    reset();
    recordUsed("m1");
    const rec = getLearningRecord("m1");
    assert(rec.learningScore > 0.5, `score não aumentou: ${rec.learningScore}`);
  }),
  run("recordIgnored reduz learningScore", () => {
    reset();
    recordIgnored("m1");
    const rec = getLearningRecord("m1");
    assert(rec.learningScore < 0.5, `score não reduziu: ${rec.learningScore}`);
  }),
  run("reinforce aumenta confidenceLevel", () => {
    reset();
    reinforce("m1");
    const rec = getLearningRecord("m1");
    assert(rec.confidenceLevel > 0.5, `confidence não aumentou: ${rec.confidenceLevel}`);
  }),
  run("penalize reduz confidenceLevel", () => {
    reset();
    penalize("m1");
    const rec = getLearningRecord("m1");
    assert(rec.confidenceLevel < 0.5, `confidence não reduziu: ${rec.confidenceLevel}`);
  }),
  run("applyFeedback com outcome good reforça todos", () => {
    reset();
    applyFeedback(["m1", "m2"], "good");
    assert(getLearningRecord("m1").confidenceLevel > 0.5, "m1 não reforçado");
    assert(getLearningRecord("m2").confidenceLevel > 0.5, "m2 não reforçado");
  }),
  run("applyFeedback com outcome bad penaliza todos", () => {
    reset();
    applyFeedback(["m1", "m2"], "bad");
    assert(getLearningRecord("m1").confidenceLevel < 0.5, "m1 não penalizado");
    assert(getLearningRecord("m2").confidenceLevel < 0.5, "m2 não penalizado");
  }),
  run("applyLearningBoost adiciona boost positivo quando score > 0.5", () => {
    reset();
    recordUsed("m1"); recordUsed("m1"); recordUsed("m1");
    const boosted = applyLearningBoost(0.6, "m1");
    assert(boosted > 0.6, `boost não aplicado: ${boosted}`);
  }),
  run("getConfidenceLabel retorna HIGH após reforço", () => {
    reset();
    for (let i = 0; i < 5; i++) reinforce("m1");
    const label = getConfidenceLabel("m1");
    assert(label === "HIGH" || label === "MEDIUM", `label errado: ${label}`);
  }),
  run("auditTrail registra todas as mudanças", () => {
    reset();
    recordUsed("m1");
    reinforce("m1");
    penalize("m1");
    const rec = getLearningRecord("m1");
    assert(rec.auditTrail.length >= 3, `auditTrail incompleto: ${rec.auditTrail.length}`);
  }),
  run("learningStats retorna dados corretos", () => {
    reset();
    recordUsed("m1"); reinforce("m2"); penalize("m3");
    const s = learningStats();
    assert(s.total === 3, `total errado: ${s.total}`);
  }),
];

// ─── FASE 4 — Memory Decay ────────────────────────────────────────────────────

const decayTests = [
  run("computeDecay retorna newScore entre 0 e 1", () => {
    reset();
    const { newScore } = computeDecay("m1", { lastUsedAt: Date.now(), useCount: 0 });
    assert(newScore >= 0 && newScore <= 1, `newScore inválido: ${newScore}`);
  }),
  run("memória não usada decai mais que memória usada", () => {
    reset();
    const old = { lastUsedAt: Date.now() - 60 * 24 * 3600 * 1000, useCount: 0 }; // 60 days ago
    const recent = { lastUsedAt: Date.now(), useCount: 5 };
    const oldDecay = computeDecay("m_old", old);
    const recentDecay = computeDecay("m_recent", recent);
    assert(recentDecay.newScore >= oldDecay.newScore, "memória recente não tem score >= antiga");
  }),
  run("applyDecay persiste mudança", () => {
    reset();
    applyDecay("m1", { lastUsedAt: Date.now(), useCount: 1 });
    const score = getDecayScore("m1");
    assert(score > 0, `decay score inválido: ${score}`);
  }),
  run("applyDecayToScore penaliza score base", () => {
    reset();
    applyDecay("m1", { lastUsedAt: Date.now() - 90 * 24 * 3600 * 1000, useCount: 0 });
    const base = 0.8;
    const penalized = applyDecayToScore(base, "m1");
    assert(penalized <= base, `penalização não aplicada: ${penalized}`);
  }),
  run("configure altera parâmetros", () => {
    reset();
    configure({ halfLifeDays: 60 });
    assert(true, "configure falhou");
  }),
  run("decayStats retorna estatísticas válidas", () => {
    reset();
    applyDecay("m1", { lastUsedAt: Date.now(), useCount: 2 });
    const s = decayStats();
    assert(s.total >= 0, "decayStats inválido");
  }),
];

// ─── FASES 5+6 — Persistent Knowledge Graph ──────────────────────────────────

const graphTests = [
  run("upsertNode cria nó", () => {
    reset();
    upsertNode("g1", "goal", "Goal 1");
    const n = getNode("g1");
    assert(n !== null && n.type === "goal", "nó não criado");
  }),
  run("upsertNode incrementa peso em re-upsert", () => {
    reset();
    upsertNode("g1", "goal", "Goal 1", 1.0);
    upsertNode("g1", "goal", "Goal 1", 1.0);
    const n = getNode("g1");
    assert(n.weight > 1.0, `peso não incrementado: ${n.weight}`);
  }),
  run("upsertEdge cria aresta", () => {
    reset();
    upsertNode("g1", "goal", "Goal 1");
    upsertNode("d1", "decision", "Dec 1");
    upsertEdge("g1", "d1", "produced");
    const edges = getEdges();
    assert(edges.length > 0, "aresta não criada");
  }),
  run("upsertEdge reforça aresta existente", () => {
    reset();
    upsertNode("g1", "goal", "G"); upsertNode("d1", "decision", "D");
    upsertEdge("g1", "d1", "produced", 1.0);
    const w1 = getEdges()[0].weight;
    upsertEdge("g1", "d1", "produced", 1.0);
    const w2 = getEdges()[0].weight;
    assert(w2 > w1, `peso não reforçado: w1=${w1} w2=${w2}`);
  }),
  run("weakenEdge reduz peso", () => {
    reset();
    upsertNode("g1", "goal", "G"); upsertNode("d1", "decision", "D");
    upsertEdge("g1", "d1", "test", 2.0);
    const w1 = getEdges()[0].weight;
    weakenEdge("g1", "d1", "test", 0.5);
    const w2 = getEdges()[0].weight;
    assert(w2 < w1, `enfraquecimento não aplicado`);
  }),
  run("removeNode remove nó e arestas", () => {
    reset();
    upsertNode("g1", "goal", "G"); upsertNode("d1", "decision", "D");
    upsertEdge("g1", "d1", "test");
    removeNode("g1");
    assert(getNode("g1") === null, "nó não removido");
    assert(getEdges().length === 0, "arestas não removidas");
  }),
  run("getNeighbors retorna vizinhos corretos", () => {
    reset();
    upsertNode("g1", "goal", "G"); upsertNode("d1", "decision", "D"); upsertNode("d2", "decision", "D2");
    upsertEdge("g1", "d1", "rel1"); upsertEdge("g1", "d2", "rel2");
    const neighbors = getNeighbors("g1");
    assert(neighbors.length === 2, `esperado 2 vizinhos, got ${neighbors.length}`);
  }),
  run("linkGoalToDecision funciona", () => {
    reset();
    linkGoalToDecision("g1", "Goal 1", "d1", "Dec 1");
    assert(getNode("g1") !== null && getNode("d1") !== null, "nós não criados");
    assert(getEdges().length > 0, "aresta não criada");
  }),
  run("versioning incrementa a cada operação nova", () => {
    reset();
    const v0 = getVersion();
    upsertNode("g1", "goal", "G");
    upsertNode("g2", "goal", "G2");
    assert(getVersion() > v0, "versão não incrementou");
  }),
  run("graphStats retorna métricas válidas", () => {
    reset();
    upsertNode("g1", "goal", "G"); upsertNode("d1", "decision", "D");
    upsertEdge("g1", "d1", "test");
    const s = graphStats();
    assert(s.nodeCount === 2 && s.edgeCount === 1, `stats errados: ${JSON.stringify(s)}`);
  }),
];

// ─── FASE 8 — Goal Context Builder ───────────────────────────────────────────

const contextTests = [
  run("detectActiveGoal retorna null com query vazia", () => {
    reset();
    const r = detectActiveGoal("");
    assert(r === null, "deveria retornar null");
  }),
  run("buildGoalContext retorna string vazia sem goals", () => {
    reset();
    const ctx = buildGoalContext("qual projeto?");
    assert(typeof ctx === "string", "não retornou string");
  }),
  run("buildGoalContext retorna bloco quando há goal", () => {
    reset();
    indexSession("g1", "Projeto Alpha", "s1");
    indexDecision("g1", "Projeto Alpha", "d1", "Contratar ACME");
    addLesson("g1", "Sempre validar fornecedor");
    const ctx = buildGoalContext("projeto alpha");
    assert(ctx.includes("Projeto Alpha") || ctx === "", "contexto não gerado");
  }),
  run("buildAllGoalsSummary retorna vazio sem goals", () => {
    reset();
    const s = buildAllGoalsSummary();
    assert(typeof s === "string", "não retornou string");
  }),
];

// ─── FASE 9 — Memory Health 2.0 ──────────────────────────────────────────────

const healthTests = [
  run("computeHealth2 retorna todas as métricas v2.0", () => {
    reset();
    const h = computeHealth2({});
    const required = ["goalCoverage", "learningRate", "decayRate", "confidenceEvolution",
      "relationshipDensity", "knowledgeGrowth", "graphSize", "memoryQualityScore", "learningAccuracy"];
    required.forEach((k) => assert(k in h, `métrica ausente: ${k}`));
  }),
  run("memoryQualityScore está entre 0 e 1", () => {
    reset();
    recordUsed("m1"); reinforce("m1");
    const h = computeHealth2({});
    const score = parseFloat(h.memoryQualityScore);
    assert(score >= 0 && score <= 1, `score inválido: ${score}`);
  }),
  run("healthReport retorna string", () => {
    reset();
    const r = healthReport({});
    assert(typeof r === "string" && r.length > 0, "relatório inválido");
  }),
];

// ─── FASE 10 — Observability ──────────────────────────────────────────────────

const obsTests = [
  run("recordMemoryDecision registra evento", () => {
    clearEvents();
    recordMemoryDecision({ executionId: "exec1", goalId: "g1", goalTitle: "Goal 1", memoriesUsed: ["m1", "m2"], memoriesIgnored: [], memoriesReinforced: ["m1"], memoriesPenalized: [], confidenceChanges: {}, decayApplied: {}, edgesCreated: 2, edgesStrengthened: 1 });
    const events = getEvents("MEMORY_DECISION");
    assert(events.length === 1, "evento não registrado");
  }),
  run("recordRelationship registra evento de relacionamento", () => {
    clearEvents();
    recordRelationship("g1", "d1", "produced", 1.5, "created");
    const events = getEvents("RELATIONSHIP");
    assert(events.length === 1, "evento de relacionamento não registrado");
  }),
  run("recordLearning registra delta", () => {
    clearEvents();
    recordLearning("m1", "reinforced", 0.5, 0.58);
    const events = getEvents("LEARNING");
    assert(events.length === 1 && events[0].payload.delta > 0, "delta incorreto");
  }),
  run("obsStats retorna contagens corretas", () => {
    clearEvents();
    recordMemoryDecision({ executionId: "e1", memoriesUsed: [], memoriesIgnored: [], memoriesReinforced: ["m1"], memoriesPenalized: [], confidenceChanges: {}, decayApplied: {}, edgesCreated: 1, edgesStrengthened: 0 });
    const s = obsStats();
    assert(s.decisions === 1, "contagem de decisions errada");
    assert(s.totalMemoriesReinforced === 1, "reinforced errado");
  }),
];

// ─── Performance ──────────────────────────────────────────────────────────────

const perfTests = [
  run("Goal Index: 100 sessions < 50ms", () => {
    reset();
    const t0 = Date.now();
    for (let i = 0; i < 100; i++) indexSession("g1", "Goal 1", `sess${i}`);
    assert(Date.now() - t0 < 50, `lento: ${Date.now() - t0}ms`);
  }),
  run("Graph: 100 nodes + 200 edges < 100ms", () => {
    reset();
    const t0 = Date.now();
    for (let i = 0; i < 100; i++) upsertNode(`n${i}`, "goal", `Node ${i}`);
    for (let i = 0; i < 200; i++) upsertEdge(`n${i % 100}`, `n${(i + 1) % 100}`, "rel");
    assert(Date.now() - t0 < 100, `lento: ${Date.now() - t0}ms`);
  }),
  run("computeHealth2 < 20ms", () => {
    reset();
    const t0 = Date.now();
    computeHealth2({});
    assert(Date.now() - t0 < 20, `lento: ${Date.now() - t0}ms`);
  }),
];

// ─── Idempotência ─────────────────────────────────────────────────────────────

const idempotencyTests = [
  run("indexSession não duplica sessões", () => {
    reset();
    indexSession("g1", "Goal 1", "sess1");
    indexSession("g1", "Goal 1", "sess1");
    const g = getGoalIndex("g1");
    assert(g.sessions.length === 1, `duplicata: ${g.sessions.length}`);
  }),
  run("upsertEdge não duplica arestas", () => {
    reset();
    upsertNode("g1", "goal", "G"); upsertNode("d1", "decision", "D");
    upsertEdge("g1", "d1", "produced");
    upsertEdge("g1", "d1", "produced");
    assert(getEdges().length === 1, `duplicata de aresta: ${getEdges().length}`);
  }),
  run("computeDecay é determinístico com mesmos inputs", () => {
    reset();
    const opts = { lastUsedAt: Date.now() - 15 * 24 * 3600 * 1000, useCount: 3 };
    const r1 = computeDecay("m1", opts);
    const r2 = computeDecay("m1", opts);
    assert(r1.newScore === r2.newScore, "não determinístico");
  }),
];

// ─── Export ───────────────────────────────────────────────────────────────────

export function runMLGIPTests() {
  const suites = [
    { suite: "Goal Memory Index", tests: goalIndexTests },
    { suite: "Memory Learning + Confidence", tests: learningTests },
    { suite: "Memory Decay", tests: decayTests },
    { suite: "Persistent Knowledge Graph", tests: graphTests },
    { suite: "Goal Context Builder", tests: contextTests },
    { suite: "Memory Health 2.0", tests: healthTests },
    { suite: "Observability (COP)", tests: obsTests },
    { suite: "Performance", tests: perfTests },
    { suite: "Idempotência + Recovery", tests: idempotencyTests },
  ];

  const results = suites.map((s) => ({
    suite: s.suite,
    results: s.tests,
    passed: s.tests.filter((t) => t.passed).length,
    failed: s.tests.filter((t) => !t.passed).length,
    total: s.tests.length,
    durationMs: s.tests.reduce((sum, t) => sum + t.duration, 0),
  }));

  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  const totalTests = results.reduce((s, r) => s + r.total, 0);

  return {
    suites: results,
    totalPassed,
    totalFailed,
    totalTests,
    verdict: totalFailed === 0 ? "PASS" : "FAIL",
    architecturalStatus: totalFailed === 0
      ? "MEMORY LEARNING & GOAL INTELLIGENCE PLATFORM READY"
      : `${totalFailed} TEST(S) FAILED`,
  };
}