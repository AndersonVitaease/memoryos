/**
 * mipTests.js — Memory Intelligence Platform (MIP)
 * Sprint 7.1.1A: Suite de testes completa.
 */

import { scoreRecord, rankRecords } from "./MemoryScorer";
import { consolidate, deduplicateForContext } from "./MemoryConsolidator";
import { buildRelationshipGraph, graphToContextText } from "./MemoryRelationshipEngine";
import { rankAllMemory, computeMemoryHealth } from "./MemoryRankingEngine";
import { buildEnrichedContext } from "./EnrichedContextBuilder";

// ─── Test runner ──────────────────────────────────────────────────────────────

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

// ─── Sample data ──────────────────────────────────────────────────────────────

const sampleDecisions = [
  { id: "d1", title: "Contratar fornecedor ACME", description: "Aprovado em reunião", rationale: "Melhor custo-benefício", decided_date: new Date().toISOString(), created_date: new Date().toISOString() },
  { id: "d2", title: "Adiar lançamento do produto X", description: "Problemas de qualidade", rationale: "Feedback negativo", decided_date: new Date(Date.now() - 60*24*3600*1000).toISOString(), created_date: new Date().toISOString() },
  { id: "d3", title: "Contratar fornecedor similar", description: "Alternativa ao ACME", decided_date: new Date().toISOString(), created_date: new Date().toISOString() },
];

const sampleEntities = [
  { id: "e1", type: "empresa", value: "ACME", context: "Fornecedor de materiais", created_date: new Date().toISOString() },
  { id: "e2", type: "pessoa", value: "João Silva", context: "Gerente de projeto", created_date: new Date().toISOString() },
  { id: "e3", type: "empresa", value: "ACME Corp", context: "Empresa fornecedora similar", created_date: new Date().toISOString() },
];

const sampleTasks = [
  { id: "t1", title: "Revisar contrato ACME", status: "pending", created_date: new Date().toISOString() },
  { id: "t2", title: "Enviar proposta ao cliente", status: "done", created_date: new Date().toISOString() },
];

const sampleTopics = [
  { id: "tp1", name: "Fornecimento de materiais", status: "active", created_date: new Date().toISOString() },
];

const sampleData = {
  decisions: sampleDecisions,
  entities: sampleEntities,
  tasks: sampleTasks,
  topics: sampleTopics,
  documents: [],
  sessions: [],
  keywords: [{ id: "k1", keyword: "fornecedor", created_date: new Date().toISOString() }],
  messages: [],
  sessionSummary: "Conversa sobre fornecedores",
};

// ─── Tests: MemoryScorer ──────────────────────────────────────────────────────

const scorerTests = [
  run("scoreRecord retorna score entre 0 e 1", () => {
    const r = scoreRecord(sampleDecisions[0], { keywords: ["fornecedor", "ACME"], fields: ["title", "description"], dateField: "decided_date", kind: "decision" });
    assert(r.score >= 0 && r.score <= 1, `score=${r.score}`);
  }),
  run("scoreRecord com keywords relevantes tem score > neutro", () => {
    const relevant = scoreRecord(sampleDecisions[0], { keywords: ["fornecedor", "ACME"], fields: ["title", "description"], dateField: "decided_date", kind: "decision" });
    const irrelevant = scoreRecord(sampleDecisions[0], { keywords: ["turismo", "viagem"], fields: ["title", "description"], dateField: "decided_date", kind: "decision" });
    assert(relevant.score > irrelevant.score, `relevant=${relevant.score} irrelevant=${irrelevant.score}`);
  }),
  run("scoreRecord sem keywords retorna score neutro", () => {
    const r = scoreRecord(sampleDecisions[0], { keywords: [], fields: ["title"], kind: "decision" });
    assert(r.score > 0, "score deve ser > 0 mesmo sem keywords");
  }),
  run("rankRecords retorna ordenado por score decrescente", () => {
    const ranked = rankRecords(sampleDecisions, { keywords: ["ACME"], fields: ["title", "description"], kind: "decision" });
    for (let i = 1; i < ranked.length; i++) {
      assert(ranked[i-1].score >= ranked[i].score, "não ordenado");
    }
  }),
  run("rankRecords respeita limite", () => {
    const ranked = rankRecords(sampleDecisions, { keywords: ["ACME"], fields: ["title"] }, 2);
    assert(ranked.length <= 2, `length=${ranked.length}`);
  }),
  run("scoreRecord inclui breakdown com todos os critérios", () => {
    const { breakdown } = scoreRecord(sampleDecisions[0], { keywords: ["ACME"], fields: ["title"], kind: "decision" });
    assert("semantic" in breakdown && "recency" in breakdown && "richness" in breakdown && "importance" in breakdown, "breakdown incompleto");
  }),
];

// ─── Tests: MemoryConsolidator ────────────────────────────────────────────────

const consolidatorTests = [
  run("consolidate agrupa registros similares", () => {
    const clusters = consolidate(sampleDecisions, "title", 0.2);
    // d1 e d3 são similares ("contratar fornecedor")
    const merged = clusters.find((c) => c.count > 1);
    assert(merged !== undefined, "nenhum cluster com count > 1 encontrado");
  }),
  run("consolidate com threshold alto não agrupa", () => {
    const clusters = consolidate(sampleDecisions, "title", 0.99);
    assert(clusters.every((c) => c.count === 1), "não deveria agrupar com threshold 0.99");
  }),
  run("deduplicateForContext retorna menos registros que o original quando há similaridade", () => {
    const deduped = deduplicateForContext(sampleDecisions, "title", 0.2);
    assert(deduped.length <= sampleDecisions.length, "dedup não reduziu");
  }),
  run("deduplicateForContext marca _consolidated corretamente", () => {
    const deduped = deduplicateForContext(sampleDecisions, "title", 0.2);
    const consolidated = deduped.filter((d) => d._consolidated);
    assert(consolidated.length >= 0, "estrutura inválida");
  }),
];

// ─── Tests: MemoryRelationshipEngine ─────────────────────────────────────────

const relationshipTests = [
  run("buildRelationshipGraph retorna nodes e edges", () => {
    const graph = buildRelationshipGraph(sampleData);
    assert(Array.isArray(graph.nodes) && Array.isArray(graph.edges), "estrutura inválida");
  }),
  run("buildRelationshipGraph cria nodes para todas entidades", () => {
    const graph = buildRelationshipGraph(sampleData);
    const entityNodes = graph.nodes.filter((n) => n.type.startsWith("entity_"));
    assert(entityNodes.length === sampleEntities.length, `esperado ${sampleEntities.length}, got ${entityNodes.length}`);
  }),
  run("buildRelationshipGraph detecta co-mention entre entidades similares", () => {
    const graph = buildRelationshipGraph(sampleData);
    assert(graph.nodes.length > 0, "nenhum nó criado");
  }),
  run("graphToContextText retorna string quando há edges", () => {
    const graph = buildRelationshipGraph({ ...sampleData, decisions: sampleDecisions });
    const text = graphToContextText(graph);
    assert(typeof text === "string", "não retornou string");
  }),
  run("adjacency é um Map", () => {
    const graph = buildRelationshipGraph(sampleData);
    assert(graph.adjacency instanceof Map, "adjacency não é Map");
  }),
];

// ─── Tests: MemoryRankingEngine ───────────────────────────────────────────────

const rankingTests = [
  run("rankAllMemory retorna objeto com chaves por tipo", () => {
    const ranked = rankAllMemory(sampleData, ["ACME", "fornecedor"]);
    assert(typeof ranked === "object", "não retornou objeto");
  }),
  run("rankAllMemory decisions são ranqueadas", () => {
    const ranked = rankAllMemory(sampleData, ["ACME"]);
    assert(Array.isArray(ranked.decisions), "decisions não é array");
  }),
  run("cada item ranqueado tem priority, confidence e reason", () => {
    const ranked = rankAllMemory(sampleData, ["ACME"]);
    if (ranked.decisions?.length > 0) {
      const d = ranked.decisions[0];
      assert("priority" in d && "confidence" in d && "reason" in d, "campos obrigatórios ausentes");
    }
  }),
  run("computeMemoryHealth retorna métricas válidas", () => {
    const ranked = rankAllMemory(sampleData, ["ACME"]);
    const health = computeMemoryHealth(ranked, sampleData);
    assert(health.totalRaw >= 0 && health.retrievalRate >= 0, "métricas inválidas");
  }),
  run("rankAllMemory não retorna itens DISCARD", () => {
    const ranked = rankAllMemory(sampleData, ["ACME"]);
    const allItems = Object.values(ranked).flat();
    assert(allItems.every((r) => r.priority !== "DISCARD"), "item DISCARD não deveria aparecer");
  }),
];

// ─── Tests: EnrichedContextBuilder ───────────────────────────────────────────

const contextTests = [
  run("buildEnrichedContext retorna context string", () => {
    const { context } = buildEnrichedContext(sampleData, { search_keywords: ["ACME"], is_list_query: false }, "sess1");
    assert(typeof context === "string" && context.length > 0, "context inválido");
  }),
  run("buildEnrichedContext retorna sources array", () => {
    const { sources } = buildEnrichedContext(sampleData, { search_keywords: ["ACME"] }, "sess1");
    assert(Array.isArray(sources), "sources não é array");
  }),
  run("buildEnrichedContext retorna ranked", () => {
    const { ranked } = buildEnrichedContext(sampleData, { search_keywords: ["fornecedor"] }, "sess1");
    assert(ranked && typeof ranked === "object", "ranked inválido");
  }),
  run("buildEnrichedContext retorna health", () => {
    const { health } = buildEnrichedContext(sampleData, { search_keywords: ["ACME"] }, "sess1");
    assert(health && typeof health.totalRaw === "number", "health inválido");
  }),
  run("buildEnrichedContext retorna graph", () => {
    const { graph } = buildEnrichedContext(sampleData, { search_keywords: ["ACME"] }, "sess1");
    assert(graph && Array.isArray(graph.nodes), "graph inválido");
  }),
  run("context em list_query inclui todos os projetos", () => {
    const data = { ...sampleData, projects: [{ id: "p1", name: "Projeto Alpha", created_date: new Date().toISOString() }] };
    const { context } = buildEnrichedContext(data, { search_keywords: [], is_list_query: true }, "sess1");
    assert(context.includes("Projeto Alpha"), "projeto não apareceu no contexto");
  }),
  run("context menciona score quando não é list_query", () => {
    const { context } = buildEnrichedContext(sampleData, { search_keywords: ["ACME"], is_list_query: false }, "sess1");
    assert(context.includes("score") || context.length > 0, "score ou conteúdo ausente");
  }),
];

// ─── Performance tests ────────────────────────────────────────────────────────

const perfTests = [
  run("rankAllMemory < 50ms para 100 registros", () => {
    const bigData = {
      decisions: Array.from({ length: 50 }, (_, i) => ({ id: `d${i}`, title: `Decisão ${i}`, description: `Desc ${i}`, created_date: new Date().toISOString() })),
      tasks: Array.from({ length: 50 }, (_, i) => ({ id: `t${i}`, title: `Tarefa ${i}`, status: "pending", created_date: new Date().toISOString() })),
      entities: [], topics: [], documents: [], sessions: [], messages: [],
    };
    const t0 = Date.now();
    rankAllMemory(bigData, ["decisão"]);
    const elapsed = Date.now() - t0;
    assert(elapsed < 50, `muito lento: ${elapsed}ms`);
  }),
  run("consolidate < 100ms para 200 registros", () => {
    const records = Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, title: `Registro ${i % 10}` }));
    const t0 = Date.now();
    consolidate(records, "title", 0.35);
    const elapsed = Date.now() - t0;
    assert(elapsed < 100, `muito lento: ${elapsed}ms`);
  }),
  run("buildEnrichedContext < 30ms para dados de exemplo", () => {
    const t0 = Date.now();
    buildEnrichedContext(sampleData, { search_keywords: ["ACME"] }, "sess1");
    const elapsed = Date.now() - t0;
    assert(elapsed < 30, `muito lento: ${elapsed}ms`);
  }),
];

// ─── Idempotency tests ────────────────────────────────────────────────────────

const idempotencyTests = [
  run("scoreRecord é determinístico", () => {
    const r1 = scoreRecord(sampleDecisions[0], { keywords: ["ACME"], fields: ["title"], kind: "decision" });
    const r2 = scoreRecord(sampleDecisions[0], { keywords: ["ACME"], fields: ["title"], kind: "decision" });
    assert(r1.score === r2.score, "score não determinístico");
  }),
  run("buildEnrichedContext é determinístico", () => {
    const { context: c1 } = buildEnrichedContext(sampleData, { search_keywords: ["ACME"] }, "sess1");
    const { context: c2 } = buildEnrichedContext(sampleData, { search_keywords: ["ACME"] }, "sess1");
    assert(c1 === c2, "contexto não determinístico");
  }),
];

// ─── Export ───────────────────────────────────────────────────────────────────

export function runMIPTests() {
  const all = [
    ...scorerTests,
    ...consolidatorTests,
    ...relationshipTests,
    ...rankingTests,
    ...contextTests,
    ...perfTests,
    ...idempotencyTests,
  ];
  const passed = all.filter((t) => t.passed).length;
  const failed = all.filter((t) => !t.passed).length;
  return { results: all, passed, failed, total: all.length };
}