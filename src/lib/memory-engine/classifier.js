/**
 * Memory Classifier (Sprint 1 · Estabilização)
 *
 * Pipeline de decisão de três níveis:
 *
 *   Mensagem → Fast Path → Rule Engine → LLM → Resultado
 *
 * Cada nível só é acionado quando o anterior não consegue decidir com segurança.
 *
 * Contrato de saída (enriquecido com decisionSource e reasonCode):
 *   {
 *     shouldRemember: boolean,
 *     decisionSource: "fast_path" | "rule_engine" | "llm",
 *     memoryType: string,
 *     reasonCode: string,
 *     confidence: "low" | "medium" | "high",
 *     importance: "low" | "medium" | "high",
 *     reason: string,
 *     suggestedTitle: string,
 *     tags: string[],
 *   }
 *
 * Observabilidade:
 *   Cada decisão registra internamente: decisionSource, reasonCode,
 *   confidence e tempo de processamento (ms). Nenhum dado é persistido.
 *
 * Independência:
 *   Este módulo NÃO grava memória, NÃO consulta banco, NÃO busca,
 *   NÃO altera nenhum componente da Fase 1.
 */

import { base44 } from "@/api/base44Client";
import { evaluateFastPath } from "./fastPath";
import { evaluateRuleEngine } from "./ruleEngine";

export const MEMORY_TYPES = [
  "user_profile",
  "user_preference",
  "project",
  "project_decision",
  "project_goal",
  "project_requirement",
  "task",
  "contact",
  "organization",
  "knowledge",
  "document_reference",
  "conversation_context",
  "fact",
  "other",
];

export const DECISION_SOURCES = ["fast_path", "rule_engine", "llm"];

export const REASON_CODES = [
  "GREETING",
  "FAREWELL",
  "THANKS",
  "CASUAL_CHAT",
  "SIMPLE_QUESTION",
  "CONFIRMATION",
  "USER_PREFERENCE",
  "USER_PROFILE",
  "PROJECT",
  "PROJECT_DECISION",
  "PROJECT_GOAL",
  "PROJECT_REQUIREMENT",
  "ORGANIZATION",
  "TASK",
  "CONTACT",
  "DOCUMENT",
  "KNOWLEDGE",
  "FACT",
  "OTHER",
];

const VALID_CONFIDENCE = ["low", "medium", "high"];
const VALID_IMPORTANCE = ["low", "medium", "high"];

// === Observabilidade (logs internos, sem persistência) ===
const _logBuffer = [];
const _MAX_LOG = 200;

function _logDecision(entry) {
  _logBuffer.push(entry);
  if (_logBuffer.length > _MAX_LOG) _logBuffer.shift();
  // eslint-disable-next-line no-console
  console.debug("[MemoryClassifier]", entry);
}

/**
 * Retorna os logs internos (para relatórios e depuração).
 * Não persiste — apenas memória volátil do módulo.
 */
export function getDecisionLog() {
  return [..._logBuffer];
}

export function clearDecisionLog() {
  _logBuffer.length = 0;
}

// === Esquema JSON para o LLM ===
const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    shouldRemember: { type: "boolean" },
    memoryType: { type: "string", enum: MEMORY_TYPES },
    confidence: { type: "string", enum: VALID_CONFIDENCE },
    reasonCode: { type: "string", enum: REASON_CODES },
    reason: { type: "string" },
    suggestedTitle: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    importance: { type: "string", enum: VALID_IMPORTANCE },
  },
  required: [
    "shouldRemember",
    "memoryType",
    "confidence",
    "reasonCode",
    "reason",
    "suggestedTitle",
    "tags",
    "importance",
  ],
};

function buildLLMPrompt({ userMessage, conversationHistory, currentContext }) {
  const historyText = (conversationHistory || [])
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Usuário" : "MemoryOS"}: ${m.content}`)
    .join("\n");

  const contextText = typeof currentContext === "string"
    ? currentContext
    : currentContext
      ? JSON.stringify(currentContext, null, 2)
      : "";

  return `Você é o Memory Classifier — um módulo do Memory Engine do MemoryOS.

Sua única responsabilidade é decidir se uma informação deve ou não se tornar uma memória permanente.

Você NÃO grava memória. NÃO consulta banco. NÃO faz busca. Apenas classifica.

## CRITÉRIOS

### DEVEM gerar memória (shouldRemember = true):
- Informações sobre o usuário (perfil, preferências, empresa, projetos)
- Decisões tomadas em conversas
- Objetivos e metas de projetos
- Requisitos e tarefas
- Contatos e organizações mencionados
- Conhecimento factual permanente
- Referências a documentos importantes
- Contexto de conversa relevante para o futuro

### NÃO devem gerar memória (shouldRemember = false):
- Saudações, agradecimentos, despedidas
- Perguntas matemáticas temporárias
- Pedidos de piada, clima, ou conteúdo casual
- Mensagens casuais sem informação permanente

## MEMORY TYPES disponíveis
${MEMORY_TYPES.join(", ")}

## REASON CODES disponíveis
${REASON_CODES.join(", ")}

## IMPORTÂNCIA
- low: Informação útil mas pouco recorrente.
- medium: Informação relevante para o contexto.
- high: Informação estrutural que deve permanecer disponível.

## INSTRUÇÕES
- Analise a mensagem do usuário abaixo.
- Decida se deve ser lembrada.
- Se sim, classifique tipo, importância, tags, reasonCode e sugira um título.
- Se não, preencha: memoryType: "other", importance: "low", reasonCode: "OTHER", tags: [], suggestedTitle: "".
- O reason deve ser breve e objetivo, em português.

${historyText ? `## HISTÓRICO DA CONVERSA\n${historyText}\n` : ""}
${contextText ? `## CONTEXTO ATUAL\n${contextText}\n` : ""}
## MENSAGEM DO USUÁRIO
${userMessage}

Responda apenas com o JSON de classificação.`;
}

/**
 * Classifica se uma mensagem deve se tornar memória permanente.
 *
 * Pipeline: Fast Path → Rule Engine → LLM
 *
 * @param {Object} input
 * @param {string} input.userMessage - Mensagem atual do usuário
 * @param {Array<{role: string, content: string}>} [input.conversationHistory]
 * @param {string|Object} [input.currentContext]
 * @returns {Promise<Object>} Decisão conforme contrato oficial
 */
export async function classify({ userMessage, conversationHistory = [], currentContext = null }) {
  if (!userMessage || typeof userMessage !== "string") {
    throw new Error("MemoryClassifier: userMessage é obrigatório (string).");
  }

  const startTime = Date.now();

  // === NÍVEL 1: FAST PATH ===
  const fastResult = evaluateFastPath(userMessage);
  if (fastResult) {
    const result = { ...fastResult, decisionSource: "fast_path" };
    _logDecision({
      decisionSource: "fast_path",
      reasonCode: result.reasonCode,
      confidence: result.confidence,
      processingTimeMs: Date.now() - startTime,
    });
    return result;
  }

  // === NÍVEL 2: RULE ENGINE ===
  const ruleResult = evaluateRuleEngine(userMessage);
  if (ruleResult) {
    const result = { ...ruleResult, decisionSource: "rule_engine" };
    _logDecision({
      decisionSource: "rule_engine",
      reasonCode: result.reasonCode,
      confidence: result.confidence,
      processingTimeMs: Date.now() - startTime,
    });
    return result;
  }

  // === NÍVEL 3: LLM (FALLBACK) ===
  const prompt = buildLLMPrompt({ userMessage, conversationHistory, currentContext });
  const raw = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: CLASSIFICATION_SCHEMA,
  });

  const result = {
    shouldRemember: Boolean(raw.shouldRemember),
    memoryType: MEMORY_TYPES.includes(raw.memoryType) ? raw.memoryType : "other",
    confidence: VALID_CONFIDENCE.includes(raw.confidence) ? raw.confidence : "low",
    reasonCode: REASON_CODES.includes(raw.reasonCode) ? raw.reasonCode : "OTHER",
    reason: raw.reason || "",
    suggestedTitle: raw.suggestedTitle || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    importance: VALID_IMPORTANCE.includes(raw.importance) ? raw.importance : "low",
    decisionSource: "llm",
  };

  _logDecision({
    decisionSource: "llm",
    reasonCode: result.reasonCode,
    confidence: result.confidence,
    processingTimeMs: Date.now() - startTime,
  });

  return result;
}

export default { classify, MEMORY_TYPES, DECISION_SOURCES, REASON_CODES, getDecisionLog, clearDecisionLog };