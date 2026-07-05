/**
 * Memory Record (Sprint 2 + Sprint 3) — Contrato Oficial
 *
 * O Memory Record é o único formato aceito pelo Memory Store.
 * Nunca é uma mensagem do usuário. É sempre produto do Memory Classifier.
 *
 * Sprint 3 — Evolução do contrato (retrocompatível):
 *   - status: "active" | "archived" | "superseded" | "expired" | "deleted"
 *   - revision: number (inicial 1)
 *   - relations: array (inicial [])
 *   - source: "conversation" | "future_gmail" | "future_document" | "future_web" | "future_whatsapp"
 *
 * Estrutura oficial:
 *   {
 *     id: UUID,
 *     userId: string,
 *     conversationId: string,
 *     shouldRemember: true,
 *     memoryType: string,
 *     memoryIntent: string,
 *     importance: "low" | "medium" | "high",
 *     confidence: "low" | "medium" | "high",
 *     decisionSource: "fast_path" | "rule_engine" | "llm",
 *     reasonCode: string,
 *     reason: string,
 *     suggestedTitle: string,
 *     tags: string[],
 *     originalMessage: string,
 *     normalizedContent: string,
 *     expires: string | null,
 *     createdAt: datetime,
 *     updatedAt: datetime,
 *     metadata: {},
 *     // === Sprint 3 ===
 *     status: "active" | "archived" | "superseded" | "expired" | "deleted",
 *     revision: number,
 *     relations: array,
 *     source: "conversation" | "future_gmail" | "future_document" | "future_web" | "future_whatsapp"
 *     // === Sprint 4 ===
 *     lastAccessedAt: string | null
 *   }
 */

import { MEMORY_TYPES, DECISION_SOURCES } from "./classifier";
import { MEMORY_INTENTS, memoryTypeToIntent } from "./memoryIntents";

const VALID_IMPORTANCE = ["low", "medium", "high"];
const VALID_CONFIDENCE = ["low", "medium", "high"];

// === Sprint 3: Novos campos ===
export const MEMORY_STATUSES = ["active", "archived", "superseded", "expired", "deleted"];
export const MEMORY_SOURCES = [
  "conversation",
  "future_gmail",
  "future_document",
  "future_web",
  "future_whatsapp",
];
export const DEFAULT_STATUS = "active";
export const DEFAULT_REVISION = 1;
export const DEFAULT_RELATIONS = [];
export const DEFAULT_SOURCE = "conversation";

/**
 * Gera um UUID v4 (com fallback se crypto.randomUUID não existir).
 */
function generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback RFC4122 v4 simplificado
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Normaliza o conteúdo da mensagem para persistência.
 * Remove espaços excessivos, mas preserva o sentido.
 */
function normalizeContent(message) {
  if (!message || typeof message !== "string") return "";
  return message.trim().replace(/\s+/g, " ");
}

// === DETECÇÃO DE EXPIRAÇÃO ===
// Heurística simples para memórias temporárias.
// Não interpreta — apenas identifica marcadores temporais.
const TEMPORAL_PATTERNS = [
  /amanh[ãa]/i,
  /hoje/i,
  /agora/i,
  /daqui\s+a\s+(uma|1|duas|2|tr[êe]s|3|quatro|4|cinco|5)\s+(hora|horas|minuto|minutos|dia|dias|semana|semanas|m[êe]s|meses)/i,
  /pr[óo]xim[ao]s?\s+(hora|dia|semana|m[êe]s|ano|reuni[ãa]o|encontro)/i,
  /[\d]{1,2}h\b/i,
  /às\s+[\d]{1,2}(:[\d]{2})?\s*(h|horas)?/i,
  /daqui\s+a\s+[\d]+\s+(minutos|horas|dias|semanas)/i,
  /esta\s+(manh[ãa]|tarde|noite|semana)/i,
  /semana\s+(que\s+vem|passada|pr[óo]xima)/i,
  /m[êe]s\s+(que\s+vem|passado|pr[óo]ximo)/i,
  /(\d{1,2})\/(\d{1,2})(\/\d{2,4})?/,
];

/**
 * Detecta se a mensagem contém marcador temporal.
 * Retorna ISO date string estimada, ou null se não for temporária.
 *
 * O Memory Store NÃO interpreta nem remove — apenas grava.
 */
function detectExpiration(message) {
  if (!message || typeof message !== "string") return null;
  const hasTemporal = TEMPORAL_PATTERNS.some((p) => p.test(message));
  if (!hasTemporal) return null;

  // Estimativa simples: 24h a partir de agora.
  // O objetivo é validar o fluxo — não calcular datas exatas.
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return expires.toISOString();
}

/**
 * Constrói um Memory Record a partir da saída do Memory Classifier.
 *
 * O Classifier (Sprint 1, congelado) produz a decisão.
 * Este builder traduz a decisão em um Memory Record válido.
 *
 * @param {Object} params
 * @param {Object} params.classification - Saída do classify()
 * @param {string} params.originalMessage - Mensagem original do usuário
 * @param {string} params.userId - ID do usuário
 * @param {string} params.conversationId - ID da conversa
 * @param {Object} [params.metadata] - Metadados adicionais
 * @param {string} [params.source] - Origem da memória (default: "conversation")
 * @returns {Object} Memory Record (antes da validação do Store)
 */
export function buildMemoryRecord({ classification, originalMessage, userId, conversationId, metadata = {}, source }) {
  if (!classification || typeof classification !== "object") {
    throw new Error("MemoryRecord: classification é obrigatório.");
  }
  if (!originalMessage || typeof originalMessage !== "string") {
    throw new Error("MemoryRecord: originalMessage é obrigatório (string).");
  }

  const now = new Date().toISOString();
  const uuid = generateUUID();

  return {
    id: uuid,
    userId: userId || "anonymous",
    conversationId: conversationId || "default",
    shouldRemember: classification.shouldRemember === true,
    memoryType: classification.memoryType || "other",
    memoryIntent: memoryTypeToIntent(classification.memoryType),
    importance: VALID_IMPORTANCE.includes(classification.importance)
      ? classification.importance
      : "low",
    confidence: VALID_CONFIDENCE.includes(classification.confidence)
      ? classification.confidence
      : "low",
    decisionSource: DECISION_SOURCES.includes(classification.decisionSource)
      ? classification.decisionSource
      : "fast_path",
    reasonCode: classification.reasonCode || "OTHER",
    reason: classification.reason || "",
    suggestedTitle: classification.suggestedTitle || "",
    tags: Array.isArray(classification.tags) ? classification.tags : [],
    originalMessage,
    normalizedContent: normalizeContent(originalMessage),
    expires: detectExpiration(originalMessage),
    createdAt: now,
    updatedAt: now,
    metadata: typeof metadata === "object" && metadata !== null ? metadata : {},
    // === Sprint 3: Novos campos (com defaults para retrocompatibilidade) ===
    status: DEFAULT_STATUS,
    revision: DEFAULT_REVISION,
    relations: DEFAULT_RELATIONS,
    source: MEMORY_SOURCES.includes(source) ? source : DEFAULT_SOURCE,
    // === Sprint 4: Controle de acesso ===
    lastAccessedAt: null,
  };
}

/**
 * Valida um Memory Record antes da persistência.
 *
 * Regras:
 *   1. shouldRemember === true
 *   2. id preenchido
 *   3. memoryType válido
 *   4. memoryIntent válido
 *   5. createdAt preenchido
 *
 * @param {Object} record
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMemoryRecord(record) {
  const errors = [];

  if (!record || typeof record !== "object") {
    return { valid: false, errors: ["Memory Record ausente ou inválido."] };
  }

  if (record.shouldRemember !== true) {
    errors.push("shouldRemember deve ser true — o Store não aceita memórias rejeitadas pelo Classifier.");
  }
  if (!record.id || typeof record.id !== "string") {
    errors.push("id é obrigatório (UUID).");
  }
  if (!MEMORY_TYPES.includes(record.memoryType)) {
    errors.push(`memoryType inválido: "${record.memoryType}".`);
  }
  if (!MEMORY_INTENTS.includes(record.memoryIntent)) {
    errors.push(`memoryIntent inválido: "${record.memoryIntent}".`);
  }
  if (!record.createdAt || typeof record.createdAt !== "string") {
    errors.push("createdAt é obrigatório (ISO datetime).");
  }

  return { valid: errors.length === 0, errors };
}

export const MEMORY_RECORD_FIELDS = [
  "id",
  "userId",
  "conversationId",
  "shouldRemember",
  "memoryType",
  "memoryIntent",
  "importance",
  "confidence",
  "decisionSource",
  "reasonCode",
  "reason",
  "suggestedTitle",
  "tags",
  "originalMessage",
  "normalizedContent",
  "expires",
  "createdAt",
  "updatedAt",
  "metadata",
  // === Sprint 3 ===
  "status",
  "revision",
  "relations",
  "source",
  // === Sprint 4 ===
  "lastAccessedAt",
];

/**
 * Normaliza um Memory Record legado (pré-Sprint 3) garantindo
 * que os novos campos existam com seus valores padrão.
 *
 * Nenhum Memory Record existente é invalidado — apenas complementado.
 *
 * @param {Object} record - Memory Record possivelmente legado
 * @returns {Object} Memory Record normalizado
 */
export function normalizeLegacyRecord(record) {
  if (!record || typeof record !== "object") return record;
  return {
    ...record,
    status: MEMORY_STATUSES.includes(record.status) ? record.status : DEFAULT_STATUS,
    revision: typeof record.revision === "number" ? record.revision : DEFAULT_REVISION,
    relations: Array.isArray(record.relations) ? record.relations : DEFAULT_RELATIONS,
    source: MEMORY_SOURCES.includes(record.source) ? record.source : DEFAULT_SOURCE,
    lastAccessedAt: record.lastAccessedAt !== undefined ? record.lastAccessedAt : null,
  };
}

export default {
  buildMemoryRecord,
  validateMemoryRecord,
  normalizeLegacyRecord,
  MEMORY_RECORD_FIELDS,
  MEMORY_STATUSES,
  MEMORY_SOURCES,
  DEFAULT_STATUS,
  DEFAULT_REVISION,
  DEFAULT_RELATIONS,
  DEFAULT_SOURCE,
};