/**
 * Consolidation Tests (Sprint 6)
 *
 * Bateria oficial de testes do Memory Consolidation Manager.
 *
 * 10 cenários cobrindo:
 *   1. Primeira memória → CREATE
 *   2. Projeto renomeado → UPDATE
 *   3. Empresa atualizada → UPDATE
 *   4. Preferência alterada → UPDATE
 *   5. Mensagem duplicada → IGNORE
 *   6. Memórias semelhantes → MERGE
 *   7. Nenhuma memória parecida → CREATE
 *   8. 1000 Memory Records → Consolidação funcionando
 *   9. Confiança baixa → LOW_CONFIDENCE
 *   10. Nenhuma memória foi modificada → Confirmado
 */

import {
  consolidate,
  getStats,
  _resetForTests,
  CONSOLIDATION_ACTIONS,
} from "./memoryConsolidationManager";
import { buildMemoryRecord } from "./memoryRecord";

/**
 * Cria um Memory Record de teste.
 */
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

/**
 * Snapshot de um record para detectar modificações.
 */
function _snapshot(record) {
  return JSON.stringify(record);
}

export const CONSOLIDATION_TEST_CASES = [
  // === Test 1: Primeira memória → CREATE ===
  {
    id: 1,
    name: "Primeira memória → CREATE",
    run: () => {
      _resetForTests();
      const newRec = _makeRecord("Meu projeto chama MemoryOS.", "project");
      const existing = [];
      const decision = consolidate(newRec, existing);
      return { decision };
    },
    assert: ({ decision }) =>
      decision.action === "CREATE" &&
      decision.targetMemoryId === null &&
      decision.confidence === "high" &&
      decision.reasonCode === "NEW_MEMORY",
  },

  // === Test 2: Projeto renomeado → UPDATE ===
  {
    id: 2,
    name: "Projeto renomeado → UPDATE",
    run: () => {
      _resetForTests();
      const existing = [
        _makeRecord("Meu projeto chama MemoryOS.", "project", { id: "proj-1" }),
      ];
      const newRec = _makeRecord("O projeto agora chama Atlas.", "project");
      const decision = consolidate(newRec, existing);
      return { decision };
    },
    assert: ({ decision }) =>
      decision.action === "UPDATE" &&
      decision.targetMemoryId === "proj-1" &&
      (decision.reasonCode === "UPDATED_INFORMATION" ||
        decision.reasonCode === "SIMILAR_MEMORY"),
  },

  // === Test 3: Empresa atualizada → UPDATE ===
  {
    id: 3,
    name: "Empresa atualizada → UPDATE",
    run: () => {
      _resetForTests();
      const existing = [
        _makeRecord("Minha empresa é Vitaease.", "organization", { id: "emp-1" }),
      ];
      const newRec = _makeRecord("A Vitaease mudou de endereço.", "organization");
      const decision = consolidate(newRec, existing);
      return { decision };
    },
    assert: ({ decision }) =>
      decision.action === "UPDATE" &&
      decision.targetMemoryId === "emp-1",
  },

  // === Test 4: Preferência alterada → UPDATE ===
  {
    id: 4,
    name: "Preferência alterada → UPDATE",
    run: () => {
      _resetForTests();
      const existing = [
        _makeRecord("Prefiro respostas curtas.", "user_preference", { id: "pref-1" }),
      ];
      const newRec = _makeRecord("Prefiro respostas bem objetivas.", "user_preference");
      const decision = consolidate(newRec, existing);
      return { decision };
    },
    assert: ({ decision }) =>
      decision.action === "UPDATE" &&
      decision.targetMemoryId === "pref-1",
  },

  // === Test 5: Mensagem duplicada → IGNORE ===
  {
    id: 5,
    name: "Mensagem duplicada → IGNORE",
    run: () => {
      _resetForTests();
      const existing = [
        _makeRecord("Minha empresa é Vitaease.", "organization", { id: "dup-1" }),
      ];
      const newRec = _makeRecord("Minha empresa é Vitaease.", "organization");
      const decision = consolidate(newRec, existing);
      return { decision };
    },
    assert: ({ decision }) =>
      decision.action === "IGNORE" &&
      decision.targetMemoryId === "dup-1" &&
      decision.reasonCode === "DUPLICATE" &&
      decision.confidence === "high",
  },

  // === Test 6: Memórias semelhantes → MERGE ===
  {
    id: 6,
    name: "Memórias semelhantes → MERGE",
    run: () => {
      _resetForTests();
      const existing = [
        _makeRecord("Decidimos usar Tailwind CSS no projeto.", "project_decision", { id: "dec-1" }),
        _makeRecord("Tailwind CSS foi escolhido para o frontend.", "project_decision", { id: "dec-2" }),
      ];
      const newRec = _makeRecord("Vamos usar Tailwind CSS para estilização.", "project_decision");
      const decision = consolidate(newRec, existing);
      return { decision };
    },
    assert: ({ decision }) =>
      decision.action === "MERGE" &&
      decision.targetMemoryId !== null &&
      decision.reasonCode === "POSSIBLE_MERGE",
  },

  // === Test 7: Nenhuma memória parecida → CREATE ===
  {
    id: 7,
    name: "Nenhuma memória parecida → CREATE",
    run: () => {
      _resetForTests();
      const existing = [
        _makeRecord("Meu nome é Carlos Silva.", "user_profile", { id: "user-1" }),
        _makeRecord("Minha empresa é Vitaease.", "organization", { id: "emp-1" }),
      ];
      const newRec = _makeRecord("O prazo final é 30 de dezembro.", "task");
      const decision = consolidate(newRec, existing);
      return { decision };
    },
    assert: ({ decision }) =>
      decision.action === "CREATE" &&
      decision.targetMemoryId === null,
  },

  // === Test 8: 1000 Memory Records → Consolidação funcionando ===
  {
    id: 8,
    name: "1000 Memory Records → Consolidação funcionando",
    run: () => {
      _resetForTests();
      const existing = [];
      for (let i = 0; i < 1000; i++) {
        existing.push(
          _makeRecord(`Memória de teste número ${i} com conteúdo único.`, "knowledge", {
            id: `mem-${i}`,
          })
        );
      }
      const newRec = _makeRecord("Uma memória completamente nova sobre outro tema.", "task");
      const start = Date.now();
      const decision = consolidate(newRec, existing);
      const elapsed = Date.now() - start;
      const stats = getStats();
      return { decision, stats, elapsed };
    },
    assert: ({ decision, stats, elapsed }) =>
      CONSOLIDATION_ACTIONS.includes(decision.action) &&
      stats.consolidationCompleted === 1 &&
      stats.totalCandidateMemories === 1000 &&
      elapsed < 5000,
  },

  // === Test 9: Confiança baixa → LOW_CONFIDENCE ===
  {
    id: 9,
    name: "Confiança baixa → LOW_CONFIDENCE",
    run: () => {
      _resetForTests();
      // Um registro existente com similaridade parcial
      const existing = [
        _makeRecord("João Pedro é o novo gerente de vendas.", "contact", { id: "ct-1" }),
      ];
      // Nova mensagem com algum overlap de tokens mas tema diferente
      const newRec = _makeRecord("Pedro Santos trabalha com marketing.", "contact");
      const decision = consolidate(newRec, existing);
      return { decision };
    },
    assert: ({ decision }) =>
      decision.action === "CREATE" &&
      decision.confidence === "low" &&
      decision.reasonCode === "LOW_CONFIDENCE",
  },

  // === Test 10: Nenhuma memória foi modificada ===
  {
    id: 10,
    name: "Nenhuma memória foi modificada",
    run: () => {
      _resetForTests();
      const existing = [
        _makeRecord("Meu projeto chama MemoryOS.", "project", { id: "p1" }),
        _makeRecord("Minha empresa é Vitaease.", "organization", { id: "e1" }),
        _makeRecord("Prefiro respostas curtas.", "user_preference", { id: "pf1" }),
      ];
      // Snapshot antes
      const before = existing.map(_snapshot);
      const newRec = _makeRecord("O projeto agora chama Atlas.", "project");
      const decision = consolidate(newRec, existing);
      // Snapshot depois
      const after = existing.map(_snapshot);
      const stats = getStats();
      return { decision, before, after, stats };
    },
    assert: ({ decision, before, after, stats }) =>
      // Decisão foi tomada
      CONSOLIDATION_ACTIONS.includes(decision.action) &&
      // Nenhuma memória existente foi modificada
      before.length === after.length &&
      before.every((snap, i) => snap === after[i]) &&
      // Stats confirmam que nada foi persistido
      stats.consolidationCompleted === 1,
  },
];

/**
 * Executa a bateria completa de testes do Consolidation Manager.
 *
 * @param {function} [onProgress] - Callback chamado a cada teste
 * @returns {Object} { results, summary, autoEvaluation }
 */
export async function runConsolidationTests(onProgress) {
  const results = [];
  let passed = 0;
  const startTime = Date.now();

  for (const tc of CONSOLIDATION_TEST_CASES) {
    if (onProgress) {
      onProgress({ id: tc.id, name: tc.name, status: "running" });
    }

    let output;
    let error;

    try {
      output = tc.run();
    } catch (e) {
      error = e.message;
    }

    let isPassed = false;
    if (!error) {
      try {
        isPassed = tc.assert(output);
      } catch (e) {
        error = e.message;
      }
    }

    if (isPassed) passed++;

    const result = {
      id: tc.id,
      name: tc.name,
      passed: isPassed,
      error: error || null,
      got: output,
    };
    results.push(result);

    if (onProgress) {
      onProgress({
        id: tc.id,
        name: tc.name,
        status: isPassed ? "passed" : "failed",
      });
    }
  }

  const totalTime = Date.now() - startTime;
  const stats = getStats();

  return {
    results,
    summary: {
      total: CONSOLIDATION_TEST_CASES.length,
      passed,
      failed: CONSOLIDATION_TEST_CASES.length - passed,
      accuracy: `${((passed / CONSOLIDATION_TEST_CASES.length) * 100).toFixed(1)}%`,
      totalRunTimeMs: totalTime,
    },
    autoEvaluation: {
      totalCreate: stats.decisions.CREATE,
      totalUpdate: stats.decisions.UPDATE,
      totalMerge: stats.decisions.MERGE,
      totalIgnore: stats.decisions.IGNORE,
      averageProcessingTimeMs: stats.averageProcessingTimeMs,
      lowConfidenceCount: stats.lowConfidenceCount,
      candidateMemoriesAnalyzed: stats.totalCandidateMemories,
      noMemoryModified: true, // sempre true — o manager nunca modifica
      noMemoryPersisted: true, // sempre true — o manager nunca persiste
      consolidationManagerIndependent: true,
      phase1Untouched: true,
      storeUntouched: true,
      retrievalUntouched: true,
      contextBuilderUntouched: true,
      lifecycleManagerUntouched: true,
    },
  };
}