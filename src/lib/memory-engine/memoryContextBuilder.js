/**
 * Memory Context Builder (Sprint 4)
 *
 * Componente responsável por preparar o contexto de memória enviado ao Core.
 *
 * O Memory Retrieval (Sprint 3, congelado) encontra memórias.
 * O Memory Context Builder decide quais memórias realmente serão utilizadas.
 *
 * O Core nunca recebe o resultado bruto do Retrieval.
 *
 * O QUE FAZ:
 *   - buildContext({ memories, conversationContext, query, config })
 *     → seleciona, elimina duplicidades, organiza, limita
 *     → retorna Memory Context
 *
 * O QUE NÃO FAZ:
 *   - Interpretar mensagens do usuário
 *   - Alterar Memory Records (exceto lastAccessedAt)
 *   - Modificar o ranking do Retrieval
 *   - Embeddings, Semantic Search, Versioning, Lifecycle, Relationships
 *   - Merge, AI Ranking, Context Compression por IA
 *
 * SAÍDA:
 *   {
 *     memories: [],          // memórias selecionadas e organizadas
 *     totalRetrieved: number, // total recebido do Retrieval
 *     totalSelected: number,  // total selecionado
 *     discarded: number,      // total descartado
 *     contextSize: number,    // tamanho em caracteres
 *   }
 */

import { normalizeLegacyRecord } from "./memoryRecord";

// === Configuração padrão ===
export const DEFAULT_CONTEXT_CONFIG = {
  maxMemories: 20,
  maxCharacters: 8000,
  maxEstimatedTokens: 2000,
};

// === Prioridade de organização ===
// Projeto → Objetivos → Decisões → Preferências → Tarefas → Conhecimento → Outros
const PRIORITY_MAP = {
  project: 1,
  project_identity: 1,
  project_goal: 2,
  project_decision: 3,
  user_preference: 4,
  task: 5,
  project_requirement: 5,
  knowledge: 6,
  fact: 6,
  user_profile: 7,
  organization: 7,
  contact: 7,
  document_reference: 7,
  conversation_context: 7,
  other: 7,
};

function _getPriority(record) {
  const intent = record.memoryIntent;
  const type = record.memoryType;
  return PRIORITY_MAP[intent] || PRIORITY_MAP[type] || 7;
}

// === Observabilidade ===
const _stats = {
  contextStarted: 0,
  contextCompleted: 0,
  retrieved: 0,
  selected: 0,
  discarded: 0,
  duplicatesRemoved: 0,
  expiredRemoved: 0,
  lastAccessedUpdated: 0,
  totalProcessingTimeMs: 0,
  totalEstimatedTokens: 0,
  operations: 0,
};

function _log(event, data) {
  // eslint-disable-next-line no-console
  console.debug(`[MemoryContextBuilder:${event}]`, data);
}

// === Estimativa de tokens (simplificada) ===
// ~4 caracteres por token (média para português/inglês)
const CHARS_PER_TOKEN = 4;

function _estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function _recordToText(record) {
  const parts = [
    record.suggestedTitle || "",
    record.normalizedContent || record.originalMessage || "",
    record.reason || "",
  ];
  return parts.join(" ").trim();
}

// === Storage (para atualizar lastAccessedAt) ===
// O Store (Sprint 2, congelado) não tem update().
// O Context Builder atualiza APENAS lastAccessedAt diretamente no storage,
// sem alterar a lógica do Store ou reclassificar registros.
const STORE_KEY = "memoryos:memory-store:v1";

function _getStorage() {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function _loadStoreRecords() {
  const storage = _getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function _saveStoreRecords(records) {
  const storage = _getStorage();
  if (!storage) return false;
  try {
    storage.setItem(STORE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

/**
 * Atualiza APENAS lastAccessedAt nos registros selecionados.
 *
 * Nenhum outro campo é alterado. Nenhuma reclassificação ocorre.
 * O Store permanece sem lógica de update — apenas o campo lastAccessedAt
 * (introduzido no Sprint 4) é atualizado.
 *
 * @param {Object[]} selectedRecords - Memórias que serão enviadas ao Core
 */
function _updateLastAccessedAt(selectedRecords) {
  if (!selectedRecords || selectedRecords.length === 0) return;
  const idsToUpdate = new Set(selectedRecords.map((r) => r.id));
  const now = new Date().toISOString();
  const allRecords = _loadStoreRecords();
  let updated = false;
  for (const record of allRecords) {
    if (idsToUpdate.has(record.id)) {
      record.lastAccessedAt = now;
      _stats.lastAccessedUpdated++;
      updated = true;
    }
  }
  if (updated) {
    _saveStoreRecords(allRecords);
  }
}

// === SELEÇÃO ===

/**
 * Verifica se um registro está expirado.
 */
function _isExpired(record) {
  if (!record.expires) return false;
  try {
    return new Date(record.expires).getTime() < Date.now();
  } catch {
    return false;
  }
}

/**
 * Remove duplicidades baseadas em normalizedContent.
 * Mantém o registro com maior prioridade de ranking (primeiro na lista ordenada).
 *
 * @param {Object[]} records - Já ranqueados pelo Retrieval
 * @returns {Object[]} - Lista sem duplicatas
 */
function _removeDuplicates(records) {
  const seen = new Set();
  const result = [];
  for (const record of records) {
    const key = (record.normalizedContent || record.originalMessage || "").toLowerCase().trim();
    if (key && seen.has(key)) {
      _stats.duplicatesRemoved++;
      continue;
    }
    if (key) seen.add(key);
    result.push(record);
  }
  return result;
}

// === ORGANIZAÇÃO ===

/**
 * Organiza as memórias por prioridade de categoria.
 *
 * Projeto → Objetivos → Decisões → Preferências → Tarefas → Conhecimento → Outros
 *
 * Dentro de cada categoria, mantém a ordem do ranking do Retrieval.
 *
 * IMPORTANTE: Não modifica o ranking — reorganiza por categoria preservando
 * a ordem relativa dentro de cada categoria.
 */
function _organizeByPriority(records) {
  // Agrupa mantendo ordem relativa
  const groups = {};
  for (const record of records) {
    const priority = _getPriority(record);
    if (!groups[priority]) groups[priority] = [];
    groups[priority].push(record);
  }
  // Concatena em ordem de prioridade
  const sorted = [];
  const priorities = Object.keys(groups).sort((a, b) => Number(a) - Number(b));
  for (const p of priorities) {
    sorted.push(...groups[p]);
  }
  return sorted;
}

// === BUILD CONTEXT ===

/**
 * Constrói o Memory Context a partir das memórias recuperadas.
 *
 * @param {Object} input
 * @param {Object[]} input.memories - Lista de Memory Records do Retrieval
 * @param {string|Object} [input.conversationContext] - Contexto da conversa
 * @param {string} [input.query] - Consulta do usuário
 * @param {Object} [input.config] - Configurações de limite
 * @param {number} [input.config.maxMemories]
 * @param {number} [input.config.maxCharacters]
 * @param {number} [input.config.maxEstimatedTokens]
 * @returns {Object} Memory Context
 */
export function buildContext({
  memories,
  conversationContext = null,
  query = "",
  config = {},
}) {
  const startTime = Date.now();
  _stats.contextStarted++;
  _stats.operations++;
  _log("contextStarted", { retrieved: memories?.length || 0, hasQuery: !!query });

  const cfg = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  const totalRetrieved = memories?.length || 0;
  _stats.retrieved += totalRetrieved;

  if (!memories || !Array.isArray(memories) || memories.length === 0) {
    const elapsed = Date.now() - startTime;
    _stats.contextCompleted++;
    _stats.totalProcessingTimeMs += elapsed;
    _log("contextCompleted", { selected: 0, elapsed });
    return {
      memories: [],
      totalRetrieved: 0,
      totalSelected: 0,
      discarded: 0,
      contextSize: 0,
    };
  }

  // Normaliza todos os registros (garante campos Sprint 3/4)
  let records = memories.map(normalizeLegacyRecord);

  // === FILTRO: apenas status === "active" ===
  const beforeStatusFilter = records.length;
  records = records.filter((r) => (r.status || "active") === "active");
  _stats.discarded += beforeStatusFilter - records.length;

  // === FILTRO: remover expirados ===
  const beforeExpiredFilter = records.length;
  records = records.filter((r) => {
    if (_isExpired(r)) {
      _stats.expiredRemoved++;
      return false;
    }
    return true;
  });
  _stats.discarded += beforeExpiredFilter - records.length;

  // === ELIMINAR DUPLICIDADES ===
  records = _removeDuplicates(records);

  // === ORGANIZAR POR PRIORIDADE ===
  records = _organizeByPriority(records);

  // === APLICAR LIMITES ===
  let selected = [];
  let totalChars = 0;
  let totalTokens = 0;

  for (const record of records) {
    if (selected.length >= cfg.maxMemories) break;

    const text = _recordToText(record);
    const recordTokens = _estimateTokens(text);
    const recordChars = text.length;

    if (totalTokens + recordTokens > cfg.maxEstimatedTokens) break;
    if (totalChars + recordChars > cfg.maxCharacters) break;

    selected.push(record);
    totalChars += recordChars;
    totalTokens += recordTokens;
  }

  _stats.discarded += records.length - selected.length;

  // === ATUALIZAR lastAccessedAt (APENAS este campo) ===
  _updateLastAccessedAt(selected);

  const elapsed = Date.now() - startTime;
  _stats.contextCompleted++;
  _stats.selected += selected.length;
  _stats.totalProcessingTimeMs += elapsed;
  _stats.totalEstimatedTokens += totalTokens;

  _log("contextCompleted", {
    selected: selected.length,
    discarded: totalRetrieved - selected.length,
    contextSize: totalChars,
    estimatedTokens: totalTokens,
    elapsed,
  });

  return {
    memories: selected,
    totalRetrieved,
    totalSelected: selected.length,
    discarded: totalRetrieved - selected.length,
    contextSize: totalChars,
    estimatedTokens: totalTokens,
  };
}

/**
 * Retorna estatísticas de observabilidade do Context Builder.
 */
export function getContextStats() {
  return {
    ..._stats,
    averageProcessingTimeMs: _stats.operations > 0
      ? Math.round(_stats.totalProcessingTimeMs / _stats.operations)
      : 0,
    averageEstimatedTokens: _stats.contextCompleted > 0
      ? Math.round(_stats.totalEstimatedTokens / _stats.contextCompleted)
      : 0,
  };
}

/**
 * Reseta as estatísticas (para testes).
 */
export function _resetContextStats() {
  _stats.contextStarted = 0;
  _stats.contextCompleted = 0;
  _stats.retrieved = 0;
  _stats.selected = 0;
  _stats.discarded = 0;
  _stats.duplicatesRemoved = 0;
  _stats.expiredRemoved = 0;
  _stats.lastAccessedUpdated = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.totalEstimatedTokens = 0;
  _stats.operations = 0;
}

export default {
  buildContext,
  getContextStats,
  _resetContextStats,
  DEFAULT_CONTEXT_CONFIG,
};