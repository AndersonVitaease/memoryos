/**
 * Memory Classifier (Memory Engine · Fase 2 · Módulo 1)
 *
 * Responsabilidade única:
 *   Decidir se uma informação deve ou não se tornar uma memória permanente.
 *
 * O que NÃO faz:
 *   - Não grava memória
 *   - Não consulta banco
 *   - Não faz busca
 *   - Não altera nenhum componente da Fase 1
 *
 * Fluxo:
 *   Usuário → Core → Memory Engine → Memory Classifier → Resultado da Classificação
 *
 * Contrato de saída:
 *   {
 *     shouldRemember: boolean,
 *     memoryType: string,
 *     confidence: "low" | "medium" | "high",
 *     reason: string,
 *     suggestedTitle: string,
 *     tags: string[],
 *     importance: "low" | "medium" | "high"
 *   }
 */

import { base44 } from "@/api/base44Client";

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

const VALID_CONFIDENCE = ["low", "medium", "high"];
const VALID_IMPORTANCE = ["low", "medium", "high"];

/**
 * Pre-filtro determinístico para mensagens óbvias que NÃO devem gerar memória.
 * Evita chamadas desnecessárias ao LLM para saudações, agradecimentos, cálculos, etc.
 */
const CASUAL_PATTERNS = [
  /^(bom dia|boa tarde|boa noite|ol[áa]|ola|oi|hey|hello|hi|eai|e a[ií])\b[!.?\s]*$/i,
  /^(obrigad[oa]|valeu|thanks|thank you|thx|vlw|agradecido)\b[!.?\s]*$/i,
  /^(tchau|at[ée]\s+mais|at[ée]\s+logo|bye|adeus)\b[!.?\s]*$/i,
  /^(ok|sim|n[ãa]o|ah|eh|hum|mmm|certo|beleza|blz|claro|com certeza)\b[!.?\s]*$/i,
  /^(conte|conta)\s+(uma\s+)?(piada|jogo|hist[óo]ria)/i,
  /^(qual\s+(é\s+)?o\s+clima|como\s+(est[áa]|t[áa]|vai)\s+(o\s+)?clima)/i,
  /^(qual\s+(é\s+)?a\s+previs[ãa]o)/i,
];

const MATH_PATTERN = /^(quanto\s+(é|e|s[ãa]o|sao)\s+)?[\d\s\+\-\*\/x×÷()]+=?\s*\??$/i;

function isObviousNonMemory(message) {
  const msg = (message || "").trim();
  if (!msg) return true;
  if (msg.length < 4) return true;
  if (CASUAL_PATTERNS.some((p) => p.test(msg))) return true;
  if (MATH_PATTERN.test(msg)) return true;
  return false;
}

const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    shouldRemember: { type: "boolean" },
    memoryType: { type: "string", enum: MEMORY_TYPES },
    confidence: { type: "string", enum: VALID_CONFIDENCE },
    reason: { type: "string" },
    suggestedTitle: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    importance: { type: "string", enum: VALID_IMPORTANCE },
  },
  required: [
    "shouldRemember",
    "memoryType",
    "confidence",
    "reason",
    "suggestedTitle",
    "tags",
    "importance",
  ],
};

function buildPrompt({ userMessage, conversationHistory, currentContext }) {
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
- Saudações ("Bom dia", "Olá")
- Agradecimentos ("Obrigado")
- Perguntas matemáticas temporárias ("Quanto é 2+2?")
- Pedidos de piada, clima, ou conteúdo casual
- Mensagens casuais sem informação permanente
- Pequenas conversas sem valor futuro

## MEMORY TYPES disponíveis
${MEMORY_TYPES.join(", ")}

## IMPORTÂNCIA
- low: Informação útil mas pouco recorrente.
- medium: Informação relevante para o contexto.
- high: Informação estrutural que deve permanecer disponível para consultas futuras.

## INSTRUÇÕES
- Analise a mensagem do usuário abaixo.
- Decida se deve ser lembrada.
- Se sim, classifique o tipo, importância, tags e sugira um título conciso.
- Se não, preencha: memoryType: "other", importance: "low", tags: [], suggestedTitle: "".
- O reason deve ser breve e objetivo, em português.
- confidence reflete o quão certo você está da decisão.

${historyText ? `## HISTÓRICO DA CONVERSA\n${historyText}\n` : ""}
${contextText ? `## CONTEXTO ATUAL\n${contextText}\n` : ""}
## MENSAGEM DO USUÁRIO
${userMessage}

Responda apenas com o JSON de classificação.`;
}

/**
 * Classifica se uma mensagem deve se tornar memória permanente.
 *
 * @param {Object} input
 * @param {string} input.userMessage - Mensagem atual do usuário
 * @param {Array<{role: string, content: string}>} [input.conversationHistory] - Histórico recente
 * @param {string|Object} [input.currentContext] - Contexto recuperado pelo Core
 * @returns {Promise<Object>} Resultado da classificação conforme contrato
 */
export async function classify({ userMessage, conversationHistory = [], currentContext = null }) {
  if (!userMessage || typeof userMessage !== "string") {
    throw new Error("MemoryClassifier: userMessage é obrigatório (string).");
  }

  // Fast path: mensagens óbvias que não geram memória pulam o LLM.
  if (isObviousNonMemory(userMessage)) {
    return {
      shouldRemember: false,
      memoryType: "other",
      confidence: "high",
      reason: "Mensagem casual ou temporária — não contém informação permanente.",
      suggestedTitle: "",
      tags: [],
      importance: "low",
    };
  }

  const prompt = buildPrompt({ userMessage, conversationHistory, currentContext });

  const result = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: CLASSIFICATION_SCHEMA,
  });

  return {
    shouldRemember: Boolean(result.shouldRemember),
    memoryType: MEMORY_TYPES.includes(result.memoryType) ? result.memoryType : "other",
    confidence: VALID_CONFIDENCE.includes(result.confidence) ? result.confidence : "low",
    reason: result.reason || "",
    suggestedTitle: result.suggestedTitle || "",
    tags: Array.isArray(result.tags) ? result.tags : [],
    importance: VALID_IMPORTANCE.includes(result.importance) ? result.importance : "low",
  };
}

export default { classify, MEMORY_TYPES };