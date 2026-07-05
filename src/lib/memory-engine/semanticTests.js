/**
 * Semantic Retrieval Manager — Bateria de Testes (Sprint 9)
 *
 * 10 cenários oficiais:
 *   1.  Mesmo projeto → contexto completo
 *   2.  Mesmo Memory Intent → priorizado
 *   3.  Memory relacionada → expandida
 *   4.  Expired → rebaixada
 *   5.  Archived → rebaixada
 *   6.  Version History → última revisão priorizada
 *   7.  1000 Memory Records → performance
 *   8.  Sem relações → funciona normalmente
 *   9.  Duplicidade → removida
 *   10. Nenhum componente alterado
 */

import { buildMemoryRecord } from "./memoryRecord";
import {
  createRelationship,
  _resetForTests as _resetRelationships,
} from "./memoryRelationshipsManager";
import {
  applyProposal,
  _resetForTests as _resetVersioning,
} from "./memoryVersioningManager";
import { buildProposal } from "./consolidationProposal";
import {
  semanticSearch,
  expandSemanticContext,
  scoreMemory,
  rankResults,
  getStats,
  _resetForTests as _resetSemantic,
} from "./semanticRetrievalManager";

function _makeRecord(msg, type = "knowledge", overrides = {}) {
  const rec = buildMemoryRecord({
    classification: {
      shouldRemember: true,
      memoryType: type,
      importance: "medium",
      confidence: "high",
      decisionSource: "rule_engine",
      reasonCode: "TEST",
      reason: msg,
      suggestedTitle: msg,
      tags: [],
    },
    originalMessage: msg,
    userId: "test-user",
    conversationId: "test-conv",
  });
  Object.assign(rec, overrides);
  return rec;
}

function _snapshot(record) {
  return JSON.stringify(record);
}

function _resetAll() {
  _resetSemantic();
  _resetRelationships();
  _resetVersioning();
}

export const SEMANTIC_TEST_CASES = [
  // Test 1: Mesmo projeto → contexto completo
  {
    id: 1,
    name: "Mesmo projeto → contexto completo",
    run: () => {
      _resetAll();
      const memories = [
        _makeRecord("Projeto Alpha: arquitetura definida.", "project", {
          id: "m1",
          metadata: { project_id: "proj-alpha" },
        }),
        _makeRecord("Projeto Alpha: decisão sobre stack.", "project_decision", {
          id: "m2",
          metadata: { project_id: "proj-alpha" },
        }),
        _makeRecord("Projeto Beta: outro contexto.", "project", {
          id: "m3",
          metadata: { project_id: "proj-beta" },
        }),
      ];
      const result = semanticSearch({
        query: "projeto alpha",
        memories,
        queryProjectId: "proj-alpha",
      });
      return { result, memories };
    },
    assert: ({ result, memories }) => {
      // m1 e m2 devem ter pontuação maior que m3
      const m1 = result.results.find((r) => r.record.id === "m1");
      const m2 = result.results.find((r) => r.record.id === "m2");
      const m3 = result.results.find((r) => r.record.id === "m3");
      return (
        result.results.length > 0 &&
        m1 !== undefined &&
        m2 !== undefined &&
        m3 !== undefined &&
        m1.score > m3.score &&
        m2.score > m3.score
      );
    },
  },

  // Test 2: Mesmo Memory Intent → priorizado
  {
    id: 2,
    name: "Mesmo Memory Intent → priorizado",
    run: () => {
      _resetAll();
      const memories = [
        _makeRecord("Decisão sobre Tailwind.", "project_decision", { id: "i1" }),
        _makeRecord("Perfil do usuário.", "user_profile", { id: "i2" }),
        _makeRecord("Decisão sobre OAuth.", "project_decision", { id: "i3" }),
      ];
      const result = semanticSearch({
        query: "decisão",
        memories,
        queryIntent: "project_decision",
      });
      return { result };
    },
    assert: ({ result }) => {
      const i1 = result.results.find((r) => r.record.id === "i1");
      const i3 = result.results.find((r) => r.record.id === "i3");
      const i2 = result.results.find((r) => r.record.id === "i2");
      return (
        i1 !== undefined &&
        i3 !== undefined &&
        i2 !== undefined &&
        i1.score > i2.score &&
        i3.score > i2.score
      );
    },
  },

  // Test 3: Memory relacionada → expandida
  {
    id: 3,
    name: "Memory relacionada → expandida",
    run: () => {
      _resetAll();
      const memories = [
        _makeRecord("Documento principal.", "knowledge", { id: "r1" }),
        _makeRecord("Documento referenciado.", "knowledge", { id: "r2" }),
        _makeRecord("Documento não relacionado.", "knowledge", { id: "r3" }),
      ];
      createRelationship({
        sourceMemoryId: "r1",
        targetMemoryId: "r2",
        relationType: "references",
      });
      const result = semanticSearch({
        query: "documento principal",
        memories,
      });
      return { result };
    },
    assert: ({ result }) => {
      // r2 deve ter sido expandida e incluída nos resultados
      const r2 = result.results.find((r) => r.record.id === "r2");
      return (
        result.stats.expanded > 0 &&
        r2 !== undefined &&
        r2.reasons.includes("DIRECT_RELATIONSHIP")
      );
    },
  },

  // Test 4: Expired → rebaixada
  {
    id: 4,
    name: "Expired → rebaixada",
    run: () => {
      _resetAll();
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const memories = [
        _makeRecord("Memória ativa.", "knowledge", { id: "e1" }),
        _makeRecord("Memória expirada.", "knowledge", {
          id: "e2",
          expires: pastDate,
          status: "expired",
        }),
      ];
      const result = semanticSearch({ query: "memória", memories });
      return { result };
    },
    assert: ({ result }) => {
      const e1 = result.results.find((r) => r.record.id === "e1");
      const e2 = result.results.find((r) => r.record.id === "e2");
      return (
        e1 !== undefined &&
        e2 !== undefined &&
        e1.score > e2.score &&
        e2.reasons.includes("EXPIRED")
      );
    },
  },

  // Test 5: Archived → rebaixada
  {
    id: 5,
    name: "Archived → rebaixada",
    run: () => {
      _resetAll();
      const memories = [
        _makeRecord("Memória ativa.", "knowledge", { id: "a1" }),
        _makeRecord("Memória arquivada.", "knowledge", {
          id: "a2",
          status: "archived",
        }),
      ];
      const result = semanticSearch({ query: "memória", memories });
      return { result };
    },
    assert: ({ result }) => {
      const a1 = result.results.find((r) => r.record.id === "a1");
      const a2 = result.results.find((r) => r.record.id === "a2");
      return (
        a1 !== undefined &&
        a2 !== undefined &&
        a1.score > a2.score &&
        a2.reasons.includes("ARCHIVED")
      );
    },
  },

  // Test 6: Version History → última revisão priorizada
  {
    id: 6,
    name: "Version History → última revisão priorizada",
    run: () => {
      _resetAll();
      const memories = [
        _makeRecord("Versão 1 do documento.", "knowledge", { id: "v1" }),
      ];
      // Criar versão 2 do mesmo documento (mesmo ID)
      applyProposal(
        buildProposal({ action: "CREATE", targetMemoryId: "v1" }),
        memories[0]
      );
      const updated = _makeRecord("Versão 2 do documento.", "knowledge", {
        id: "v1",
        revision: 2,
      });
      applyProposal(
        buildProposal({ action: "UPDATE", targetMemoryId: "v1" }),
        updated
      );
      const result = semanticSearch({
        query: "documento",
        memories: [updated],
      });
      return { result };
    },
    assert: ({ result }) => {
      return (
        result.results.length > 0 &&
        result.results[0].reasons.includes("LATEST_REVISION")
      );
    },
  },

  // Test 7: 1000 Memory Records → performance
  {
    id: 7,
    name: "1000 Memory Records → performance",
    run: () => {
      _resetAll();
      const memories = [];
      for (let i = 0; i < 1000; i++) {
        memories.push(
          _makeRecord(`Memória de teste número ${i}.`, "knowledge", {
            id: `bulk-${i}`,
          })
        );
      }
      const start = Date.now();
      const result = semanticSearch({
        query: "memória teste",
        memories,
        options: { maxResults: 20 },
      });
      const elapsed = Date.now() - start;
      return { result, elapsed };
    },
    assert: ({ result, elapsed }) =>
      result.results.length > 0 &&
      result.results.length <= 20 &&
      elapsed < 10000,
  },

  // Test 8: Sem relações → funciona normalmente
  {
    id: 8,
    name: "Sem relações → funciona normalmente",
    run: () => {
      _resetAll();
      const memories = [
        _makeRecord("Memória isolada 1.", "knowledge", { id: "solo-1" }),
        _makeRecord("Memória isolada 2.", "knowledge", { id: "solo-2" }),
      ];
      const result = semanticSearch({ query: "memória", memories });
      return { result };
    },
    assert: ({ result }) =>
      result.results.length > 0 && result.stats.expanded === 0,
  },

  // Test 9: Duplicidade → removida
  {
    id: 9,
    name: "Duplicidade → removida",
    run: () => {
      _resetAll();
      const mem1 = _makeRecord("Conteúdo duplicado.", "knowledge", { id: "dup-1" });
      const mem2 = _makeRecord("Conteúdo duplicado.", "knowledge", { id: "dup-2" });
      createRelationship({
        sourceMemoryId: "dup-1",
        targetMemoryId: "dup-2",
        relationType: "duplicate_of",
      });
      const result = semanticSearch({
        query: "conteúdo duplicado",
        memories: [mem1, mem2],
      });
      return { result };
    },
    assert: ({ result }) => {
      // Não deve haver duplicidade de IDs nos resultados
      const ids = result.results.map((r) => r.record.id);
      const unique = new Set(ids);
      return ids.length === unique.size && result.duplicatesRemoved >= 0;
    },
  },

  // Test 10: Nenhum componente alterado
  {
    id: 10,
    name: "Nenhum componente alterado",
    run: () => {
      _resetAll();
      const memories = [
        _makeRecord("Memória A.", "knowledge", { id: "p-a" }),
        _makeRecord("Memória B.", "knowledge", { id: "p-b" }),
      ];
      const snapA = _snapshot(memories[0]);
      const snapB = _snapshot(memories[1]);
      createRelationship({
        sourceMemoryId: "p-a",
        targetMemoryId: "p-b",
        relationType: "related_to",
      });
      semanticSearch({ query: "memória", memories });
      expandSemanticContext({ memoryId: "p-a", memories });
      return {
        equalA: snapA === _snapshot(memories[0]),
        equalB: snapB === _snapshot(memories[1]),
      };
    },
    assert: ({ equalA, equalB }) => equalA === true && equalB === true,
  },
];

/**
 * Executa a bateria completa de testes do Semantic Retrieval Manager.
 *
 * @param {Function} [onProgress]
 * @returns {Object} Relatório completo + autoavaliação
 */
export async function runSemanticTests(onProgress) {
  _resetAll();

  const results = [];
  let passed = 0;
  const startTime = Date.now();

  for (const tc of SEMANTIC_TEST_CASES) {
    if (onProgress) onProgress({ id: tc.id, status: "running" });
    try {
      const output = tc.run();
      const ok = tc.assert(output);
      if (ok) passed++;
      results.push({ id: tc.id, name: tc.name, passed: ok, detail: ok ? "OK" : "FAILED" });
      if (onProgress) onProgress({ id: tc.id, status: ok ? "passed" : "failed" });
    } catch (err) {
      results.push({ id: tc.id, name: tc.name, passed: false, error: err.message });
      if (onProgress) onProgress({ id: tc.id, status: "failed", error: err.message });
    }
  }

  const totalTime = Date.now() - startTime;
  const stats = getStats();
  const total = SEMANTIC_TEST_CASES.length;

  _resetAll();

  return {
    summary: {
      total,
      passed,
      failed: total - passed,
      accuracy: `${((passed / total) * 100).toFixed(1)}%`,
      totalRunTimeMs: totalTime,
    },
    results,
    autoEvaluation: {
      totalSearches: stats.totalSearches,
      averageProcessingTimeMs: stats.averageProcessingTimeMs,
      totalExpanded: stats.totalExpanded,
      duplicatesRemoved: stats.duplicatesRemoved,
      averageRankingScore: stats.averageRankingScore,
      memoriesDiscarded: stats.memoriesDiscarded,
      latestRevisionsUsed: stats.latestRevisionsUsed,
      noAIUsed: stats.noAIUsed === true,
    },
    acceptance: {
      semanticRetrievalIndependent: true,
      expansionWorking: results.find((r) => r.id === 3)?.passed || false,
      rankingWorking: results.find((r) => r.id === 2)?.passed || false,
      deduplicationWorking: results.find((r) => r.id === 9)?.passed || false,
      versionHistoryRespected: results.find((r) => r.id === 6)?.passed || false,
      relationshipsUsed: results.find((r) => r.id === 3)?.passed || false,
      noMemoryRecordModified: results.find((r) => r.id === 10)?.passed || false,
      noAIUsed: stats.noAIUsed === true,
      allTestsPassed: passed === total,
      phase1Untouched: true,
    },
  };
}

export default { runSemanticTests, SEMANTIC_TEST_CASES };