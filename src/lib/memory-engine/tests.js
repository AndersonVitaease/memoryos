/**
 * Memory Classifier — Testes Automáticos
 *
 * Executa os 5 casos de teste oficiais definidos na especificação da Fase 2.
 * Cada teste envia uma entrada ao classifier e valida a saída contra o esperado.
 */

import { classify } from "./classifier";

export const CLASSIFIER_TEST_CASES = [
  {
    id: 1,
    input: { userMessage: "Bom dia.", conversationHistory: [], currentContext: null },
    expect: { shouldRemember: false },
    description: "Saudação não deve gerar memória",
  },
  {
    id: 2,
    input: { userMessage: "Meu projeto chama MemoryOS.", conversationHistory: [], currentContext: null },
    expect: { shouldRemember: true, memoryType: "project" },
    description: "Nome de projeto deve gerar memória do tipo project",
  },
  {
    id: 3,
    input: { userMessage: "Minha empresa é Vitaease.", conversationHistory: [], currentContext: null },
    expect: { shouldRemember: true, memoryType: "organization" },
    description: "Nome de empresa deve gerar memória do tipo organization",
  },
  {
    id: 4,
    input: { userMessage: "Decidimos implementar o Memory Engine.", conversationHistory: [], currentContext: null },
    expect: { shouldRemember: true, memoryType: "project_decision" },
    description: "Decisão de projeto deve gerar memória do tipo project_decision",
  },
  {
    id: 5,
    input: { userMessage: "Quanto é 2 + 2?", conversationHistory: [], currentContext: null },
    expect: { shouldRemember: false },
    description: "Pergunta matemática temporária não deve gerar memória",
  },
];

function matchesExpected(result, expect) {
  if (expect.shouldRemember !== undefined && result.shouldRemember !== expect.shouldRemember) return false;
  if (expect.memoryType && result.memoryType !== expect.memoryType) return false;
  return true;
}

/**
 * Executa todos os testes automáticos do Memory Classifier.
 *
 * @param {Function} [onProgress] - Callback chamado a cada teste: ({ id, status, result?, error? })
 * @returns {Promise<{ total, passed, failed, results, allPassed }>}
 */
export async function runClassifierTests(onProgress) {
  const results = [];
  let passed = 0;

  for (const tc of CLASSIFIER_TEST_CASES) {
    if (onProgress) onProgress({ id: tc.id, status: "running" });
    try {
      const result = await classify(tc.input);
      const ok = matchesExpected(result, tc.expect);
      if (ok) passed++;
      const entry = {
        id: tc.id,
        description: tc.description,
        input: tc.input.userMessage,
        expect: tc.expect,
        result,
        passed: ok,
      };
      results.push(entry);
      if (onProgress) onProgress({ id: tc.id, status: ok ? "passed" : "failed", result });
    } catch (err) {
      const entry = {
        id: tc.id,
        description: tc.description,
        input: tc.input.userMessage,
        expect: tc.expect,
        result: null,
        passed: false,
        error: err.message,
      };
      results.push(entry);
      if (onProgress) onProgress({ id: tc.id, status: "failed", error: err.message });
    }
  }

  return {
    total: CLASSIFIER_TEST_CASES.length,
    passed,
    failed: CLASSIFIER_TEST_CASES.length - passed,
    results,
    allPassed: passed === CLASSIFIER_TEST_CASES.length,
  };
}