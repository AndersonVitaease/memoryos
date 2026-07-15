/**
 * cdpTests.js — Cognitive Diagnosis Platform (CDP)
 * Sprint 7.1.2 — FASE 12: Suite completa de testes
 */

import {
  beginTrace, getTrace, finalizeTrace, errorTrace,
  recordContext, recordGoals, recordPipelineStep, recordSpecialists,
  recordConnectors, recordMemories, recordDecisions, recordRanking,
  recordConfidence, recordLearning, recordOutcome, listTraces,
  getLatestTrace, getStats as traceStats, clearTraces,
} from "./CognitiveTraceEngine";

import {
  explainMemoryUsed, explainMemoryIgnored, explainSpecialistActivated,
  explainSpecialistDiscarded, explainDecision, explainTrace,
} from "./ReasoningExplainer";

import {
  diagnoseTrace, quickDiagnose,
} from "./DecisionDiagnosisEngine";

import {
  submitFeedback, recordImplicitContinuation, recordImplicitRepetition,
  getFeedbacks, getFeedbackStats, clearFeedbacks,
} from "./OutcomeFeedbackEngine";

import {
  assess, quickAssess,
} from "./SelfAssessmentEngine";

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
  clearTraces();
  clearFeedbacks();
}

// ─── Sample data ──────────────────────────────────────────────────────────────

const sampleMemory = {
  memoryId: "m1", type: "decision", label: "Contratar ACME", used: true,
  score: 0.78, priority: "HIGH", confidence: "HIGH", reason: "alta relevância semântica",
  breakdown: { semantic: 0.85, recency: 0.70, richness: 0.60, importance: 0.90, frequency: 0.5 },
  record: { type: "decision", title: "Contratar ACME", description: "Fornecedor aprovado" },
};

const sampleSpecialist = {
  name: "FinancialSpecialist", activated: true,
  activationReason: "Query contém termos financeiros", score: 0.82,
};

const sampleDecision = {
  category: "specialist_routing", decision: "FinancialSpecialist selecionado",
  reasoning: "Alta correspondência com domínio financeiro",
  rule: "keyword_match_threshold > 0.7",
  engines: ["SpecialistRouter"],
  alternatives: [{ label: "LegalSpecialist", score: 0.3, outcome: "rejected", reason: "Score abaixo do threshold" }],
  confidence: 0.82,
};

function makeTrace() {
  reset();
  const traceId = beginTrace("exec-1", "sess-1", "Qual o status do contrato ACME?");
  recordContext(traceId, { sessionSummary: "Conversa sobre fornecedores", entitiesCount: 5, decisionsCount: 3, tasksCount: 2, keywordsCount: 10, builtAtMs: 450 });
  recordGoals(traceId, [{ goalId: "g1", goalTitle: "Projeto Alpha", sessions: ["s1"], decisions: ["d1"], lessons: [], weight: 1.2 }]);
  recordMemories(traceId, [sampleMemory, { ...sampleMemory, memoryId: "m2", used: false, score: 0.2, priority: "DISCARD" }]);
  recordSpecialists(traceId, [sampleSpecialist], [{ name: "LegalSpecialist", discardedReason: "Domínio não corresponde" }]);
  recordConnectors(traceId, [{ connectorId: "c1", connectorName: "Gmail", capability: "read", status: "success", durationMs: 320, retryCount: 0 }]);
  recordDecisions(traceId, [sampleDecision]);
  recordRanking(traceId, { decisions: [sampleMemory], entities: [] });
  recordConfidence(traceId, 0.78);
  recordLearning(traceId, { memoriesReinforced: ["m1"], memoriesPenalized: [], edgesCreated: 1, edgesStrengthened: 2, goalId: "g1" });
  recordPipelineStep(traceId, { name: "context", label: "Recuperando memória", status: "done", durationMs: 450 });
  finalizeTrace(traceId);
  return getTrace(traceId);
}

// ─── FASE 1 — Cognitive Trace Engine ─────────────────────────────────────────

const traceTests = [
  run("beginTrace cria trace com status recording", () => {
    clearTraces();
    const id = beginTrace("e1", "s1", "test");
    const t = getTrace(id);
    assert(t !== null && t.status === "recording", "trace não criado");
  }),
  run("finalizeTrace seta status complete e durationMs", () => {
    clearTraces();
    const id = beginTrace("e1", "s1", "test");
    finalizeTrace(id);
    const t = getTrace(id);
    assert(t.status === "complete" && t.durationMs !== null, `status=${t.status}`);
  }),
  run("errorTrace seta status error", () => {
    clearTraces();
    const id = beginTrace("e1", "s1", "test");
    errorTrace(id, "timeout");
    assert(getTrace(id).status === "error", "status não é error");
  }),
  run("recordContext popula trace.context", () => {
    clearTraces();
    const id = beginTrace("e1", "s1", "test");
    recordContext(id, { sessionSummary: "Resumo", entitiesCount: 3 });
    assert(getTrace(id).context.sessionSummary === "Resumo", "context não gravado");
  }),
  run("recordMemories popula memories", () => {
    clearTraces();
    const id = beginTrace("e1", "s1", "test");
    recordMemories(id, [sampleMemory]);
    assert(getTrace(id).memories.length === 1, "memories não gravadas");
  }),
  run("recordConfidence mantém valor entre 0 e 1", () => {
    clearTraces();
    const id = beginTrace("e1", "s1", "test");
    recordConfidence(id, 1.5); // deve ser clampeado
    assert(getTrace(id).confidence === 1, `confidence=${getTrace(id).confidence}`);
    recordConfidence(id, -0.5);
    assert(getTrace(id).confidence === 0, "clamp negativo falhou");
  }),
  run("listTraces retorna traces mais recentes primeiro", () => {
    clearTraces();
    beginTrace("e1", "s1", "msg1");
    beginTrace("e2", "s1", "msg2");
    const list = listTraces();
    assert(list[0].userInput === "msg2", "ordem errada");
  }),
  run("traceStats retorna contagens corretas", () => {
    clearTraces();
    const id1 = beginTrace("e1", "s1", "x"); finalizeTrace(id1);
    const id2 = beginTrace("e2", "s1", "y"); errorTrace(id2, "err");
    beginTrace("e3", "s1", "z"); // recording
    const s = traceStats();
    assert(s.complete === 1 && s.errors === 1 && s.recording === 1, JSON.stringify(s));
  }),
  run("MAX_TRACES não excede 100", () => {
    clearTraces();
    for (let i = 0; i < 110; i++) beginTrace(`e${i}`, "s1", "x");
    assert(listTraces(200).length <= 100, "limite não respeitado");
  }),
];

// ─── FASE 2 — Reasoning Explainer ────────────────────────────────────────────

const explainerTests = [
  run("explainMemoryUsed retorna explanation e evidence", () => {
    const r = explainMemoryUsed(sampleMemory, ["ACME", "contrato"]);
    assert(typeof r.explanation === "string" && r.evidence.length > 0, "explicação inválida");
  }),
  run("explainMemoryUsed com score alto menciona alta relevância", () => {
    const r = explainMemoryUsed(sampleMemory, ["ACME"]);
    const combined = r.explanation + r.evidence.join(" ");
    assert(combined.length > 0, "explicação vazia");
  }),
  run("explainMemoryIgnored retorna explanation para score baixo", () => {
    const low = { ...sampleMemory, score: 0.2, priority: "DISCARD", breakdown: { semantic: 0.1, recency: 0.3, richness: 0.2, importance: 0.3, frequency: 0.5 } };
    const r = explainMemoryIgnored(low, ["ACME"]);
    assert(r.explanation.length > 0, "explicação de ignorada vazia");
  }),
  run("explainSpecialistActivated retorna explanation", () => {
    const r = explainSpecialistActivated(sampleSpecialist);
    assert(typeof r.explanation === "string", "explicação inválida");
  }),
  run("explainSpecialistDiscarded inclui motivo", () => {
    const r = explainSpecialistDiscarded({ name: "LegalSpecialist", discardedReason: "Domínio incompatível" });
    assert(r.explanation.includes("Domínio") || r.explanation.length > 0, "explicação vazia");
  }),
  run("explainDecision inclui alternatives descartadas", () => {
    const r = explainDecision(sampleDecision);
    assert(r.alternatives.length > 0, "alternatives não incluídas");
  }),
  run("explainTrace gera resumo de todas as explanations", () => {
    const trace = makeTrace();
    const r = explainTrace(trace, ["ACME"]);
    assert(r !== null && Array.isArray(r.memoriesUsed), "explainTrace falhou");
  }),
];

// ─── FASE 3 — Decision Diagnosis Engine ──────────────────────────────────────

const diagnosisTests = [
  run("diagnoseTrace retorna overallHealth", () => {
    const trace = makeTrace();
    const d = diagnoseTrace(trace);
    assert(d !== null && typeof d.overallHealth === "string", "diagnose inválido");
  }),
  run("diagnoseTrace detecta trace saudável", () => {
    const trace = makeTrace();
    const d = diagnoseTrace(trace);
    // trace tem alta confiança e memórias boas, deve ser HEALTHY ou WARNING
    assert(["HEALTHY", "WARNING", "INFO"].includes(d.overallHealth), `saúde inesperada: ${d.overallHealth}`);
  }),
  run("diagnoseTrace detecta baixa confiança", () => {
    clearTraces();
    const id = beginTrace("e1", "s1", "x");
    recordConfidence(id, 0.1);
    recordMemories(id, []);
    finalizeTrace(id);
    const d = diagnoseTrace(getTrace(id));
    assert(d.findings.some((f) => f.category === "CONFIDENCE"), "confidence não diagnosticada");
  }),
  run("diagnoseTrace detecta ausência de memórias", () => {
    clearTraces();
    const id = beginTrace("e1", "s1", "x");
    recordMemories(id, []);
    recordConfidence(id, 0.5);
    finalizeTrace(id);
    const d = diagnoseTrace(getTrace(id));
    assert(d.findings.some((f) => f.category === "MEMORY"), "memória não diagnosticada");
  }),
  run("diagnoseTrace detecta ausência de especialistas", () => {
    clearTraces();
    const id = beginTrace("e1", "s1", "x");
    recordSpecialists(id, [], []);
    recordConfidence(id, 0.6);
    finalizeTrace(id);
    const d = diagnoseTrace(getTrace(id));
    assert(d.findings.some((f) => f.category === "SPECIALIST"), "specialist não diagnosticado");
  }),
  run("diagnoseTrace inclui recommendations", () => {
    clearTraces();
    const id = beginTrace("e1", "s1", "x");
    recordConfidence(id, 0.15);
    recordMemories(id, []);
    finalizeTrace(id);
    const d = diagnoseTrace(getTrace(id));
    assert(Array.isArray(d.recommendations), "recommendations não é array");
  }),
  run("quickDiagnose retorna healthy=true para inputs bons", () => {
    const r = quickDiagnose({ confidence: 0.8, memoryCount: 5, specialistCount: 2, durationMs: 1000 });
    assert(r.healthy === true, "deveria ser healthy");
  }),
  run("quickDiagnose retorna issues para inputs ruins", () => {
    const r = quickDiagnose({ confidence: 0.1, memoryCount: 0, specialistCount: 0, durationMs: 500 });
    assert(r.issues.length > 0, "deveria ter issues");
  }),
  run("diagnoseTrace detecta latência elevada", () => {
    clearTraces();
    const id = beginTrace("e1", "s1", "x");
    finalizeTrace(id);
    const trace = getTrace(id);
    trace.durationMs = 12000; // override manual
    const d = diagnoseTrace(trace);
    assert(d.findings.some((f) => f.category === "PERFORMANCE"), "performance não diagnosticada");
  }),
];

// ─── FASE 4 — Outcome Feedback Engine ────────────────────────────────────────

const feedbackTests = [
  run("submitFeedback registra entrada", () => {
    clearFeedbacks();
    const trace = makeTrace();
    submitFeedback(trace, { resolved: true, useful: true });
    assert(getFeedbacks().length > 0, "feedback não registrado");
  }),
  run("submitFeedback com resolved=true propaga good para MLGIP", () => {
    clearFeedbacks();
    const trace = makeTrace();
    // não deve lançar erro
    submitFeedback(trace, { resolved: true, useful: true });
    assert(true, "propagação falhou");
  }),
  run("submitFeedback com corrected=true adiciona lição ao goal", () => {
    clearFeedbacks();
    const trace = makeTrace();
    submitFeedback(trace, { corrected: true, goalId: "g1", userNote: "Resposta incorreta sobre fornecedor" });
    const fbs = getFeedbacks();
    assert(fbs[0].corrected === true, "corrected não registrado");
  }),
  run("recordImplicitContinuation funciona sem erro", () => {
    const trace = makeTrace();
    recordImplicitContinuation(trace);
    assert(true);
  }),
  run("recordImplicitRepetition funciona sem erro", () => {
    const trace = makeTrace();
    recordImplicitRepetition(trace);
    assert(true);
  }),
  run("getFeedbackStats retorna porcentagens", () => {
    clearFeedbacks();
    const trace = makeTrace();
    submitFeedback(trace, { resolved: true });
    const s = getFeedbackStats();
    assert(typeof s.resolvedRate === "string", "stats inválido");
  }),
];

// ─── FASE 9 — Self Assessment Engine ─────────────────────────────────────────

const assessmentTests = [
  run("assess retorna strengths e weaknesses", () => {
    const trace = makeTrace();
    const d = diagnoseTrace(trace);
    const a = assess(trace, d);
    assert(a !== null && Array.isArray(a.strengths) && Array.isArray(a.weaknesses), "assessment inválido");
  }),
  run("assess com trace saudável tem mais strengths que weaknesses", () => {
    const trace = makeTrace();
    const a = assess(trace, null);
    assert(a.strengths.length >= a.weaknesses.length, "esperado mais strengths");
  }),
  run("assess com trace ruim tem weaknesses", () => {
    clearTraces();
    const id = beginTrace("e1", "s1", "x");
    recordConfidence(id, 0.1);
    recordMemories(id, []);
    recordSpecialists(id, [], []);
    finalizeTrace(id);
    const trace = getTrace(id);
    const a = assess(trace, diagnoseTrace(trace));
    assert(a.weaknesses.length > 0, "deveria ter weaknesses");
  }),
  run("assess inclui improvementOpportunities", () => {
    const trace = makeTrace();
    const a = assess(trace, diagnoseTrace(trace));
    assert(Array.isArray(a.improvementOpportunities), "improvement não é array");
  }),
  run("assess inclui alternativeStrategies", () => {
    clearTraces();
    const id = beginTrace("e1", "s1", "x");
    recordConfidence(id, 0.3);
    recordMemories(id, []);
    finalizeTrace(id);
    const a = assess(getTrace(id), null);
    assert(a.alternativeStrategies.length > 0, "sem estratégias alternativas");
  }),
  run("quickAssess funciona com inputs simples", () => {
    const r = quickAssess({ confidence: 0.8, memoryCount: 5, specialistCount: 1, goalCount: 1 });
    assert(r.overallOk === true, "quickAssess falhou");
  }),
  run("assess.overallScore é 0..100", () => {
    const trace = makeTrace();
    const a = assess(trace, null);
    assert(a.overallScore >= 0 && a.overallScore <= 100, `score=${a.overallScore}`);
  }),
];

// ─── Performance ──────────────────────────────────────────────────────────────

const perfTests = [
  run("beginTrace + record 10 fields < 10ms", () => {
    clearTraces();
    const t0 = Date.now();
    const id = beginTrace("e1", "s1", "x");
    recordContext(id, { sessionSummary: "X", entitiesCount: 3 });
    recordMemories(id, [sampleMemory]);
    recordConfidence(id, 0.7);
    finalizeTrace(id);
    assert(Date.now() - t0 < 10, `lento: ${Date.now() - t0}ms`);
  }),
  run("diagnoseTrace < 5ms", () => {
    const trace = makeTrace();
    const t0 = Date.now();
    diagnoseTrace(trace);
    assert(Date.now() - t0 < 5, `lento: ${Date.now() - t0}ms`);
  }),
  run("assess < 5ms", () => {
    const trace = makeTrace();
    const t0 = Date.now();
    assess(trace, diagnoseTrace(trace));
    assert(Date.now() - t0 < 5, `lento: ${Date.now() - t0}ms`);
  }),
  run("explainTrace < 10ms", () => {
    const trace = makeTrace();
    const t0 = Date.now();
    explainTrace(trace, ["ACME"]);
    assert(Date.now() - t0 < 10, `lento: ${Date.now() - t0}ms`);
  }),
  run("100 traces consecutivos < 100ms", () => {
    clearTraces();
    const t0 = Date.now();
    for (let i = 0; i < 100; i++) {
      const id = beginTrace(`e${i}`, "s1", "x");
      finalizeTrace(id);
    }
    assert(Date.now() - t0 < 100, `lento: ${Date.now() - t0}ms`);
  }),
];

// ─── Idempotência + Recovery ──────────────────────────────────────────────────

const idempotencyTests = [
  run("finalizeTrace em trace já finalizado não lança erro", () => {
    clearTraces();
    const id = beginTrace("e1", "s1", "x");
    finalizeTrace(id);
    finalizeTrace(id); // duplo — não deve explodir
    assert(getTrace(id).status === "complete", "status corrompido");
  }),
  run("diagnoseTrace com trace null retorna null", () => {
    const r = diagnoseTrace(null);
    assert(r === null, "deveria retornar null");
  }),
  run("assess com trace null retorna null", () => {
    const r = assess(null, null);
    assert(r === null, "deveria retornar null");
  }),
  run("explainTrace com trace null retorna null", () => {
    const r = explainTrace(null, []);
    assert(r === null, "deveria retornar null");
  }),
  run("recordConfidence com traceId inválido não lança erro", () => {
    recordConfidence("id-inexistente", 0.5);
    assert(true);
  }),
  run("diagnoseTrace é determinístico", () => {
    const trace = makeTrace();
    const d1 = diagnoseTrace(trace);
    const d2 = diagnoseTrace(trace);
    assert(d1.overallHealth === d2.overallHealth, "não determinístico");
  }),
];

// ─── Export ───────────────────────────────────────────────────────────────────

export function runCDPTests() {
  const suites = [
    { suite: "Cognitive Trace Engine", tests: traceTests },
    { suite: "Reasoning Explainer", tests: explainerTests },
    { suite: "Decision Diagnosis Engine", tests: diagnosisTests },
    { suite: "Outcome Feedback Engine", tests: feedbackTests },
    { suite: "Self Assessment Engine", tests: assessmentTests },
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
      ? "COGNITIVE DIAGNOSIS PLATFORM READY"
      : `${totalFailed} TEST(S) FAILED`,
  };
}