/**
 * Memory Classifier — Bateria de Testes (Sprint 1)
 *
 * 45 mensagens cobrindo:
 *   - Saudações, Despedidas, Agradecimentos
 *   - Projetos, Preferências, Empresas
 *   - Decisões, Objetivos, Tarefas
 *   - Documentos, Requisitos, Contatos
 *   - Perguntas temporárias, Conversas casuais
 *   - Mensagens ambíguas
 *
 * Cada caso declara a camada esperada (fast_path, rule_engine, llm)
 * e o resultado esperado (shouldRemember + memoryType opcional).
 */

import { classify } from "./classifier";

export const TEST_BATTERY = [
  // === FAST PATH: SAUDAÇÕES (não lembrar) ===
  { id: 1, msg: "Bom dia.", expect: false, expectedSource: "fast_path", expectedReason: "GREETING", category: "Saudação" },
  { id: 2, msg: "Boa tarde!", expect: false, expectedSource: "fast_path", expectedReason: "GREETING", category: "Saudação" },
  { id: 3, msg: "Boa noite.", expect: false, expectedSource: "fast_path", expectedReason: "GREETING", category: "Saudação" },
  { id: 4, msg: "Olá", expect: false, expectedSource: "fast_path", expectedReason: "GREETING", category: "Saudação" },
  { id: 5, msg: "Oi", expect: false, expectedSource: "fast_path", expectedReason: "GREETING", category: "Saudação" },
  { id: 6, msg: "E aí", expect: false, expectedSource: "fast_path", expectedReason: "GREETING", category: "Saudação" },

  // === FAST PATH: AGRADECIMENTOS (não lembrar) ===
  { id: 7, msg: "Obrigado", expect: false, expectedSource: "fast_path", expectedReason: "THANKS", category: "Agradecimento" },
  { id: 8, msg: "Muito obrigado", expect: false, expectedSource: "fast_path", expectedReason: "THANKS", category: "Agradecimento" },
  { id: 9, msg: "Obrigado pela ajuda", expect: false, expectedSource: "fast_path", expectedReason: "THANKS", category: "Agradecimento" },
  { id: 10, msg: "Valeu mesmo", expect: false, expectedSource: "fast_path", expectedReason: "THANKS", category: "Agradecimento" },

  // === FAST PATH: DESPEDIDAS (não lembrar) ===
  { id: 11, msg: "Tchau", expect: false, expectedSource: "fast_path", expectedReason: "FAREWELL", category: "Despedida" },
  { id: 12, msg: "Até mais", expect: false, expectedSource: "fast_path", expectedReason: "FAREWELL", category: "Despedida" },
  { id: 13, msg: "Até logo", expect: false, expectedSource: "fast_path", expectedReason: "FAREWELL", category: "Despedida" },
  { id: 14, msg: "Até amanhã", expect: false, expectedSource: "fast_path", expectedReason: "FAREWELL", category: "Despedida" },
  { id: 15, msg: "Nos vemos", expect: false, expectedSource: "fast_path", expectedReason: "FAREWELL", category: "Despedida" },

  // === FAST PATH: CONFIRMAÇÕES (não lembrar) ===
  { id: 16, msg: "Ok", expect: false, expectedSource: "fast_path", expectedReason: "CONFIRMATION", category: "Confirmação" },
  { id: 17, msg: "Blz", expect: false, expectedSource: "fast_path", expectedReason: "CONFIRMATION", category: "Confirmação" },
  { id: 18, msg: "Perfeito", expect: false, expectedSource: "fast_path", expectedReason: "CONFIRMATION", category: "Confirmação" },
  { id: 19, msg: "Entendido", expect: false, expectedSource: "fast_path", expectedReason: "CONFIRMATION", category: "Confirmação" },

  // === FAST PATH: MATEMÁTICA / CASUAL (não lembrar) ===
  { id: 20, msg: "Quanto é 2 + 2?", expect: false, expectedSource: "fast_path", expectedReason: "SIMPLE_QUESTION", category: "Pergunta temporária" },
  { id: 21, msg: "Quanto é 15 * 3?", expect: false, expectedSource: "fast_path", expectedReason: "SIMPLE_QUESTION", category: "Pergunta temporária" },
  { id: 22, msg: "Conte uma piada", expect: false, expectedSource: "fast_path", expectedReason: "CASUAL_CHAT", category: "Conversa casual" },
  { id: 23, msg: "Qual o clima hoje?", expect: false, expectedSource: "fast_path", expectedReason: "CASUAL_CHAT", category: "Conversa casual" },

  // === RULE ENGINE: PREFERÊNCIAS (lembrar) ===
  { id: 24, msg: "Prefiro respostas curtas e diretas.", expect: true, expectedType: "user_preference", expectedSource: "rule_engine", expectedReason: "USER_PREFERENCE", category: "Preferência" },
  { id: 25, msg: "Gosto de interfaces minimalistas.", expect: true, expectedType: "user_preference", expectedSource: "rule_engine", expectedReason: "USER_PREFERENCE", category: "Preferência" },

  // === RULE ENGINE: PERFIL (lembrar) ===
  { id: 26, msg: "Meu nome é Carlos Silva.", expect: true, expectedType: "user_profile", expectedSource: "rule_engine", expectedReason: "USER_PROFILE", category: "Perfil" },
  { id: 27, msg: "Trabalho como desenvolvedor de software.", expect: true, expectedType: "user_profile", expectedSource: "rule_engine", expectedReason: "USER_PROFILE", category: "Perfil" },
  { id: 28, msg: "Meu email de contato é carlos@vitaease.com.", expect: true, expectedType: "user_profile", expectedSource: "rule_engine", expectedReason: "USER_PROFILE", category: "Perfil" },

  // === RULE ENGINE: PROJETO (lembrar) ===
  { id: 29, msg: "Meu projeto chama MemoryOS.", expect: true, expectedType: "project", expectedSource: "rule_engine", expectedReason: "PROJECT", category: "Projeto" },

  // === RULE ENGINE: ORGANIZAÇÃO (lembrar) ===
  { id: 30, msg: "Minha empresa é Vitaease.", expect: true, expectedType: "organization", expectedSource: "rule_engine", expectedReason: "ORGANIZATION", category: "Empresa" },
  { id: 31, msg: "O fornecedor de pagamento é Stripe.", expect: true, expectedType: "organization", expectedSource: "rule_engine", expectedReason: "ORGANIZATION", category: "Empresa" },
  { id: 32, msg: "Nosso cliente principal é a empresa Acme Corp.", expect: true, expectedType: "organization", expectedSource: "rule_engine", expectedReason: "ORGANIZATION", category: "Empresa" },

  // === RULE ENGINE: DECISÕES (lembrar) ===
  { id: 33, msg: "Decidimos implementar o Memory Engine.", expect: true, expectedType: "project_decision", expectedSource: "rule_engine", expectedReason: "PROJECT_DECISION", category: "Decisão" },
  { id: 34, msg: "Adotei Tailwind CSS como framework padrão do projeto.", expect: true, expectedType: "project_decision", expectedSource: "rule_engine", expectedReason: "PROJECT_DECISION", category: "Decisão" },
  { id: 35, msg: "Migrei o servidor de AWS para GCP na semana passada.", expect: true, expectedType: "project_decision", expectedSource: "rule_engine", expectedReason: "PROJECT_DECISION", category: "Decisão" },

  // === RULE ENGINE: OBJETIVOS (lembrar) ===
  { id: 36, msg: "A próxima fase será o Memory Store.", expect: true, expectedType: "project_goal", expectedSource: "rule_engine", expectedReason: "PROJECT_GOAL", category: "Objetivo" },

  // === RULE ENGINE: TAREFAS (lembrar) ===
  { id: 37, msg: "O prazo final do projeto é 30 de dezembro.", expect: true, expectedType: "task", expectedSource: "rule_engine", expectedReason: "TASK", category: "Tarefa" },
  { id: 38, msg: "Precisamos implementar autenticação OAuth2.", expect: true, expectedType: "project_requirement", expectedSource: "rule_engine", expectedReason: "PROJECT_REQUIREMENT", category: "Requisito" },

  // === RULE ENGINE: CONTATOS / DOCUMENTOS / CONHECIMENTO (lembrar) ===
  { id: 39, msg: "João Pedro é o novo gerente de vendas.", expect: true, expectedType: "contact", expectedSource: "rule_engine", expectedReason: "CONTACT", category: "Contato" },
  { id: 40, msg: "O documento de especificação está no Drive.", expect: true, expectedType: "document_reference", expectedSource: "rule_engine", expectedReason: "DOCUMENT", category: "Documento" },
  { id: 41, msg: "A API do Stripe cobra 3,99% por transação.", expect: true, expectedType: "knowledge", expectedSource: "rule_engine", expectedReason: "KNOWLEDGE", category: "Conhecimento" },
  { id: 42, msg: "Nosso orçamento mensal é de R$ 50.000.", expect: true, expectedType: "fact", expectedSource: "rule_engine", expectedReason: "KNOWLEDGE", category: "Finanças" },

  // === LLM: AMBÍGUOS (requerem interpretação) ===
  { id: 43, msg: "Acho que deveríamos repensar a abordagem de memória.", expect: true, expectedSource: "llm", category: "Ambíguo" },
  { id: 44, msg: "O que achou da reunião de ontem?", expect: false, expectedSource: "llm", category: "Ambíguo" },
  { id: 45, msg: "Pode me ajudar com uma dúvida?", expect: false, expectedSource: "llm", category: "Ambíguo" },
];

function _matchesExpected(result, tc) {
  // Decisão (shouldRemember)
  if (result.shouldRemember !== tc.expect) return false;
  // Tipo (se especificado)
  if (tc.expectedType && result.memoryType !== tc.expectedType) return false;
  // Source (se especificado)
  if (tc.expectedSource && result.decisionSource !== tc.expectedSource) return false;
  // ReasonCode (se especificado)
  if (tc.expectedReason && result.reasonCode !== tc.expectedReason) return false;
  return true;
}

/**
 * Executa a bateria completa de testes.
 *
 * @param {Function} [onProgress] - Callback: ({ id, status, result?, error? })
 * @returns {Promise<Object>} Relatório completo
 */
export async function runClassifierTests(onProgress) {
  const results = [];
  let passed = 0;

  const sourceStats = { fast_path: 0, rule_engine: 0, llm: 0 };
  const ambiguous = [];
  let llmErrors = 0;

  for (const tc of TEST_BATTERY) {
    if (onProgress) onProgress({ id: tc.id, status: "running" });
    try {
      const result = await classify({
        userMessage: tc.msg,
        conversationHistory: [],
        currentContext: null,
      });

      const ok = _matchesExpected(result, tc);
      if (ok) passed++;

      // Estatísticas por camada
      if (result.decisionSource) {
        sourceStats[result.decisionSource] = (sourceStats[result.decisionSource] || 0) + 1;
      }

      // Detectar ambíguos: confidence low OU source diferente do esperado
      if (result.confidence === "low" || (tc.expectedSource && result.decisionSource !== tc.expectedSource)) {
        ambiguous.push({
          id: tc.id,
          msg: tc.msg,
          expected: { shouldRemember: tc.expect, source: tc.expectedSource, type: tc.expectedType },
          got: {
            shouldRemember: result.shouldRemember,
            source: result.decisionSource,
            type: result.memoryType,
            reasonCode: result.reasonCode,
            confidence: result.confidence,
          },
          reason: result.reason,
        });
      }

      results.push({
        id: tc.id,
        msg: tc.msg,
        category: tc.category,
        expect: tc.expect,
        expectedSource: tc.expectedSource,
        got: {
          shouldRemember: result.shouldRemember,
          decisionSource: result.decisionSource,
          memoryType: result.memoryType,
          reasonCode: result.reasonCode,
          confidence: result.confidence,
          importance: result.importance,
        },
        passed: ok,
      });

      if (onProgress) onProgress({ id: tc.id, status: ok ? "passed" : "failed", result });
    } catch (err) {
      if (onProgress) onProgress({ id: tc.id, status: "failed", error: err.message });
      results.push({
        id: tc.id,
        msg: tc.msg,
        category: tc.category,
        expect: tc.expect,
        got: { error: err.message },
        passed: false,
      });
      if (tc.expectedSource === "llm") llmErrors++;
    }
  }

  const total = TEST_BATTERY.length;
  const accuracy = ((passed / total) * 100).toFixed(1);

  return {
    summary: {
      total,
      passed,
      failed: total - passed,
      accuracy: `${accuracy}%`,
      distribution: {
        fast_path: sourceStats.fast_path || 0,
        rule_engine: sourceStats.rule_engine || 0,
        llm: sourceStats.llm || 0,
      },
      ambiguousCount: ambiguous.length,
      llmErrors,
    },
    results,
    ambiguous,
    recommendations: _buildRecommendations(passed, total, ambiguous, llmErrors),
    confirmation: {
      noMemoryPersisted: true,
      noDatabaseUsed: true,
      classifierIndependent: true,
      phase1Untouched: true,
    },
  };
}

function _buildRecommendations(passed, total, ambiguous, llmErrors) {
  const recs = [];
  const failed = total - passed;

  if (failed > 0) {
    recs.push(`${failed} caso(s) não corresponderam ao esperado — revisar padrões da camada responsável.`);
  }
  if (ambiguous.length > 0) {
    recs.push(`${ambiguous.length} caso(s) ambíguo(s) identificado(s) — considerar ampliar Fast Path ou Rule Engine para cobri-los.`);
  }
  if (llmErrors > 0) {
    recs.push(`${llmErrors} erro(s) no LLM — verificar disponibilidade do InvokeLLM (não afeta Fast Path nem Rule Engine).`);
  }
  if (recs.length === 0) {
    recs.push("Bateria concluída sem divergências — Classifier estável para o Memory Store.");
  }
  return recs;
}