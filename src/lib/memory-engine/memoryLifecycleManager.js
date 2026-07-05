/**
 * Memory Lifecycle Manager (Sprint 5)
 *
 * Responsabilidade única: ADMINISTRAR O CICLO DE VIDA DAS MEMÓRIAS.
 *
 * O QUE FAZ:
 *   - Transições de status (active → archived, active → expired, etc.)
 *   - Expiração automática (expires < agora → status = expired)
 *   - Arquivamento manual
 *   - Substituição (superseded)
 *   - Reativação (archived → active)
 *   - Controle de utilização (accessCount++, lastAccessedAt)
 *   - Consultas por status
 *   - cleanupPreview() — apenas informa, nunca remove
 *
 * O QUE NÃO FAZ:
 *   - Criar memórias
 *   - Recuperar memórias (busca/ranking)
 *   - Responder ao usuário
 *   - Alterar conteúdo de um Memory Record
 *   - Reclassificar memórias
 *   - Remover fisicamente
 *   - Versioning, Merge, Relationships, Embeddings, Semantic Search
 *
 * Arquitetura:
 *   Memory Store → Memory Lifecycle Manager → Memory Retrieval → Memory Context Builder → Core
 *
 * O Lifecycle Manager acessa o mesmo storage do Memory Store (localStorage)
 * para atualizar o estado dos registros. Nunca modifica o Store.
 */

import { normalizeLegacyRecord, MEMORY_STATUSES, DEFAULT_STATUS } from "./memoryRecord";

const STORAGE_KEY = "memoryos:memory-store:v1";

// === Transições válidas (oficiais Sprint 5) ===
const VALID_TRANSITIONS = {
  active: ["archived", "expired", "superseded"],
  archived: ["active"],
  expired: [],
  superseded: [],
  deleted: [],
};

// === Observabilidade interna ===
const _stats = {
  memoryActivated: 0,
  memoryArchived: 0,
  memoryExpired: 0,
  memorySuperseded: 0,
  memoryAccessed: 0,
  totalProcessingTimeMs: 0,
  operations: 0,
};

function _log(event, data) {
  // eslint-disable-next-line no-console
  console.debug(`[LifecycleManager:${event}]`, data);
}

// === Storage helpers (mesma chave do Memory Store) ===
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

// === Validação de transição ===
function _isValidTransition(fromStatus, toStatus) {
  const allowed = VALID_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

// === Transição genérica ===
function _transition(id, toStatus, eventName) {
  const startTime = Date.now();
  _stats.operations++;

  const records = _loadAll();
  const idx = records.findIndex((r) => r.id === id);

  if (idx === -1) {
    const elapsed = Date.now() - startTime;
    _stats.totalProcessingTimeMs += elapsed;
    return { success: false, error: "Memory Record não encontrado." };
  }

  const record = records[idx];
  const fromStatus = record.status || DEFAULT_STATUS;

  // No-op se já está no status desejado
  if (fromStatus === toStatus) {
    const elapsed = Date.now() - startTime;
    _stats.totalProcessingTimeMs += elapsed;
    return { success: true, record: normalizeLegacyRecord(record), noOp: true };
  }

  if (!_isValidTransition(fromStatus, toStatus)) {
    const elapsed = Date.now() - startTime;
    _stats.totalProcessingTimeMs += elapsed;
    _log("transitionRejected", { recordId: id, from: fromStatus, to: toStatus });
    return {
      success: false,
      error: `Transição inválida: ${fromStatus} → ${toStatus}.`,
      fromStatus,
      toStatus,
    };
  }

  // Aplicar transição — apenas status e updatedAt
  record.status = toStatus;
  record.updatedAt = new Date().toISOString();
  records[idx] = record;
  _saveAll(records);

  // Atualizar estatísticas
  if (toStatus === "active") _stats.memoryActivated++;
  if (toStatus === "archived") _stats.memoryArchived++;
  if (toStatus === "expired") _stats.memoryExpired++;
  if (toStatus === "superseded") _stats.memorySuperseded++;

  const elapsed = Date.now() - startTime;
  _stats.totalProcessingTimeMs += elapsed;

  _log(eventName, { recordId: id, from: fromStatus, to: toStatus, processingTimeMs: elapsed });

  return { success: true, record: normalizeLegacyRecord(record) };
}

// === API PÚBLICA — TRANSIÇÕES ===

/**
 * Arquiva uma memória (active → archived).
 */
export function archive(id) {
  return _transition(id, "archived", "memoryArchived");
}

/**
 * Expira uma memória manualmente (active → expired).
 */
export function expire(id) {
  return _transition(id, "expired", "memoryExpired");
}

/**
 * Marca uma memória como substituída (active → superseded).
 */
export function supersede(id) {
  return _transition(id, "superseded", "memorySuperseded");
}

/**
 * Reativa uma memória arquivada (archived → active).
 */
export function activate(id) {
  return _transition(id, "active", "memoryActivated");
}

// === EXPIRAÇÃO AUTOMÁTICA ===

/**
 * Processa expirações: todas as memórias ativas com expires < agora
 * são marcadas como expired. Não remove registros.
 *
 * @returns {{ expiredCount: number }}
 */
export function processExpirations() {
  const startTime = Date.now();
  _stats.operations++;

  const records = _loadAll();
  const now = Date.now();
  let expiredCount = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const status = record.status || DEFAULT_STATUS;

    // Só expira memórias ativas
    if (status !== "active") continue;
    if (!record.expires) continue;

    let expTime;
    try {
      expTime = new Date(record.expires).getTime();
    } catch {
      continue;
    }
    if (isNaN(expTime)) continue;

    if (expTime < now) {
      record.status = "expired";
      record.updatedAt = new Date().toISOString();
      expiredCount++;
      _stats.memoryExpired++;
      _log("memoryExpired", {
        recordId: record.id,
        expires: record.expires,
        source: "auto",
      });
    }
  }

  if (expiredCount > 0) {
    _saveAll(records);
  }

  const elapsed = Date.now() - startTime;
  _stats.totalProcessingTimeMs += elapsed;

  return { expiredCount };
}

// === CONTROLE DE UTILIZAÇÃO ===

/**
 * Registra o acesso a uma memória.
 * Incrementa accessCount e atualiza lastAccessedAt.
 * Não altera conteúdo, classificação, tags ou memoryIntent.
 *
 * @param {string} id
 * @returns {{ success: boolean, record?: Object, error?: string }}
 */
export function recordAccess(id) {
  const startTime = Date.now();
  _stats.operations++;

  const records = _loadAll();
  const idx = records.findIndex((r) => r.id === id);

  if (idx === -1) {
    const elapsed = Date.now() - startTime;
    _stats.totalProcessingTimeMs += elapsed;
    return { success: false, error: "Memory Record não encontrado." };
  }

  const record = records[idx];
  // Apenas accessCount e lastAccessedAt — nada mais
  record.accessCount = (typeof record.accessCount === "number" ? record.accessCount : 0) + 1;
  record.lastAccessedAt = new Date().toISOString();
  records[idx] = record;
  _saveAll(records);

  _stats.memoryAccessed++;
  const elapsed = Date.now() - startTime;
  _stats.totalProcessingTimeMs += elapsed;

  _log("memoryAccessed", {
    recordId: id,
    accessCount: record.accessCount,
    processingTimeMs: elapsed,
  });

  return { success: true, record: normalizeLegacyRecord(record) };
}

// === CONSULTAS ===

/**
 * Lista memórias por status.
 * @param {string} status
 * @returns {Object[]}
 */
export function listByStatus(status) {
  const records = _loadAll().map(normalizeLegacyRecord);
  return records.filter((r) => (r.status || DEFAULT_STATUS) === status);
}

/**
 * Lista memórias ativas.
 */
export function listActive() {
  return listByStatus("active");
}

/**
 * Lista memórias expiradas.
 */
export function listExpired() {
  return listByStatus("expired");
}

/**
 * Lista memórias arquivadas.
 */
export function listArchived() {
  return listByStatus("archived");
}

/**
 * Lista memórias substituídas.
 */
export function listSuperseded() {
  return listByStatus("superseded");
}

// === CLEANUP PREVIEW ===

/**
 * Apenas informa quantas memórias poderiam ser removidas.
 * NUNCA remove nesta Sprint.
 *
 * Memórias elegíveis: expired, superseded, deleted (estados terminais).
 *
 * @returns {{ expired: number, superseded: number, deleted: number, totalEligible: number, wouldRemove: boolean }}
 */
export function cleanupPreview() {
  const records = _loadAll().map(normalizeLegacyRecord);

  const expired = records.filter((r) => (r.status || DEFAULT_STATUS) === "expired");
  const superseded = records.filter((r) => (r.status || DEFAULT_STATUS) === "superseded");
  const deleted = records.filter((r) => (r.status || DEFAULT_STATUS) === "deleted");

  const totalEligible = expired.length + superseded.length + deleted.length;

  return {
    expired: expired.length,
    superseded: superseded.length,
    deleted: deleted.length,
    totalEligible,
    wouldRemove: false, // nunca nesta Sprint
  };
}

// === OBSERVABILIDADE ===

/**
 * Retorna estatísticas de observabilidade do Lifecycle Manager.
 */
export function getStats() {
  const records = _loadAll().map(normalizeLegacyRecord);

  const active = records.filter((r) => (r.status || DEFAULT_STATUS) === "active");
  const archived = records.filter((r) => (r.status || DEFAULT_STATUS) === "archived");
  const expired = records.filter((r) => (r.status || DEFAULT_STATUS) === "expired");
  const superseded = records.filter((r) => (r.status || DEFAULT_STATUS) === "superseded");

  const accessCounts = records.map((r) =>
    typeof r.accessCount === "number" ? r.accessCount : 0
  );
  const avgAccessCount =
    accessCounts.length > 0
      ? Math.round((accessCounts.reduce((a, b) => a + b, 0) / accessCounts.length) * 100) / 100
      : 0;

  const lastAccessedUpdated = records.filter((r) => r.lastAccessedAt != null).length;

  return {
    ..._stats,
    totalActive: active.length,
    totalArchived: archived.length,
    totalExpired: expired.length,
    totalSuperseded: superseded.length,
    totalRecords: records.length,
    averageAccessCount: avgAccessCount,
    lastAccessedUpdated,
    averageProcessingTimeMs:
      _stats.operations > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.operations)
        : 0,
    eligibleForCleanup: expired.length + superseded.length,
    physicallyRemoved: 0, // sempre 0 nesta Sprint
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
  _stats.memoryActivated = 0;
  _stats.memoryArchived = 0;
  _stats.memoryExpired = 0;
  _stats.memorySuperseded = 0;
  _stats.memoryAccessed = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.operations = 0;
}

export default {
  archive,
  expire,
  supersede,
  activate,
  processExpirations,
  recordAccess,
  listByStatus,
  listActive,
  listExpired,
  listArchived,
  listSuperseded,
  cleanupPreview,
  getStats,
  _resetForTests,
};