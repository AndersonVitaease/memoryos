/**
 * Memory Store (Sprint 2)
 *
 * Primeiro componente de persistência do Memory Engine.
 *
 * Responsabilidade única: PERSISTIR Memory Records.
 *
 * O QUE FAZ:
 *   - create(memoryRecord)  → valida e persiste
 *   - getById(id)           → recupera por ID
 *   - list()                → lista todos
 *   - count()               → total armazenado
 *
 * O QUE NÃO FAZ:
 *   - update(), delete(), merge(), archive()
 *   - versioning(), retrieval(), ranking()
 *   - interpretar mensagens
 *   - reclassificar decisões
 *   - alterar a decisão do Classifier
 *
 * O Store nunca recebe mensagens do usuário.
 * Recebe apenas Memory Records produzidos pelo Memory Classifier.
 *
 * Persistência: localStorage temporário (validação de fluxo).
 * Não é banco definitivo — será substituído na próxima sprint.
 */

import { validateMemoryRecord } from "./memoryRecord";

const STORAGE_KEY = "memoryos:memory-store:v1";

// === Observabilidade interna ===
const _stats = {
  memoryCreated: 0,
  memoryRejected: 0,
  totalProcessingTimeMs: 0,
  operations: 0,
};

const _rejectLog = [];

function _log(event, data) {
  // eslint-disable-next-line no-console
  console.debug(`[MemoryStore:${event}]`, data);
}

function _getStorage() {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function _loadAll() {
  const storage = _getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function _saveAll(records) {
  const storage = _getStorage();
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

/**
 * Cria (persiste) um Memory Record.
 *
 * Fluxo:
 *   1. Valida o registro
 *   2. Se inválido → rejeita (memoryRejected), NÃO persiste
 *   3. Se válido → persiste (memoryCreated)
 *
 * @param {Object} memoryRecord - Memory Record produzido pelo Builder
 * @returns {Object} { success: boolean, record?, error?, errors? }
 */
export function create(memoryRecord) {
  const startTime = Date.now();

  const { valid, errors } = validateMemoryRecord(memoryRecord);

  if (!valid) {
    _stats.memoryRejected++;
    _rejectLog.push({
      timestamp: new Date().toISOString(),
      recordId: memoryRecord?.id || null,
      errors,
    });
    _log("memoryRejected", { recordId: memoryRecord?.id, errors });
    const elapsed = Date.now() - startTime;
    _stats.totalProcessingTimeMs += elapsed;
    _stats.operations++;
    return { success: false, error: "Memory Record rejeitado.", errors };
  }

  const records = _loadAll();
  records.push(memoryRecord);
  _saveAll(records);

  const elapsed = Date.now() - startTime;
  _stats.memoryCreated++;
  _stats.totalProcessingTimeMs += elapsed;
  _stats.operations++;

  _log("memoryCreated", {
    recordId: memoryRecord.id,
    memoryType: memoryRecord.memoryType,
    memoryIntent: memoryRecord.memoryIntent,
    expires: memoryRecord.expires,
    processingTimeMs: elapsed,
    storeSize: records.length,
  });

  return { success: true, record: memoryRecord };
}

/**
 * Recupera um Memory Record pelo ID.
 *
 * @param {string} id
 * @returns {Object|null}
 */
export function getById(id) {
  if (!id) return null;
  const records = _loadAll();
  return records.find((r) => r.id === id) || null;
}

/**
 * Lista todos os Memory Records persistidos.
 *
 * @param {Object} [options]
 * @param {number} [options.limit] - Limite opcional
 * @param {string} [options.userId] - Filtrar por usuário (opcional)
 * @returns {Object[]}
 */
export function list(options = {}) {
  let records = _loadAll();
  if (options.userId) {
    records = records.filter((r) => r.userId === options.userId);
  }
  if (options.limit && typeof options.limit === "number") {
    records = records.slice(0, options.limit);
  }
  return records;
}

/**
 * Retorna o total de Memory Records persistidos.
 *
 * @returns {number}
 */
export function count() {
  return _loadAll().length;
}

/**
 * Retorna estatísticas de observabilidade.
 * Apenas logs internos — nenhum evento externo.
 */
export function getStats() {
  return {
    ..._stats,
    storeSize: count(),
    averageProcessingTimeMs: _stats.operations > 0
      ? Math.round(_stats.totalProcessingTimeMs / _stats.operations)
      : 0,
    rejectLog: [..._rejectLog],
  };
}

/**
 * Limpa o store e zera as estatísticas.
 * Usado apenas pelos testes para garantir isolamento.
 */
export function _resetForTests() {
  const storage = _getStorage();
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  _stats.memoryCreated = 0;
  _stats.memoryRejected = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.operations = 0;
  _rejectLog.length = 0;
}

export default {
  create,
  getById,
  list,
  count,
  getStats,
  _resetForTests,
};