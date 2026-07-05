/**
 * Memory Relationships Manager (Sprint 8)
 *
 * Responsabilidade única: administrar relações entre memórias.
 *
 * Arquitetura:
 *   Memory Store
 *     ↓
 *   Memory Relationships Manager
 *     ↓
 *   Memory Retrieval (não modifica — apenas disponibiliza interface)
 *     ↓
 *   Memory Context Builder
 *     ↓
 *   Core
 *
 * Nunca:
 *   - cria Memory Records
 *   - altera Memory Records
 *   - altera versões (Versioning)
 *   - altera Lifecycle
 *   - responde ao usuário
 *   - realiza Retrieval
 *
 * As relações são entidades independentes, armazenadas separadamente.
 *
 * Consistência:
 *   - Não permite relationshipId duplicado
 *   - Não permite auto relacionamento (source == target)
 *   - Não permite relacionamentos órfãos (memória inexistente)
 *
 * expand(memoryId): retorna memória + relações diretas (apenas 1 nível).
 */

import {
  buildRelationship,
  validateRelationship,
  RELATION_TYPES,
} from "./memoryRelationship";

const STORAGE_KEY = "memoryos:relationships";

// === Observabilidade ===
const _stats = {
  relationshipCreated: 0,
  relationshipRemoved: 0,
  relationshipExpanded: 0,
  relationshipLookup: 0,
  rejectedAuto: 0,
  rejectedDuplicate: 0,
  rejectedOrphan: 0,
  totalProcessingTimeMs: 0,
  operations: 0,
};

const _decisionLog = [];

function _recordTime(startTime) {
  _stats.totalProcessingTimeMs += Date.now() - startTime;
}

// === Storage ===
function _readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function _writeStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage indisponível
  }
}

/**
 * Cria uma nova relação entre duas memórias.
 *
 * @param {Object} params
 * @param {string} params.sourceMemoryId
 * @param {string} params.targetMemoryId
 * @param {string} params.relationType
 * @param {string} [params.confidence]
 * @param {string} [params.reasonCode]
 * @param {Array} [knownMemoryIds] — IDs de memórias conhecidas (valida órfãos)
 * @returns {{ created: boolean, relationship: Object|null, reason: string, reasonCode: string }}
 */
export function createRelationship({
  sourceMemoryId,
  targetMemoryId,
  relationType,
  confidence = "medium",
  reasonCode = "MANUAL",
  knownMemoryIds = null,
}) {
  const startTime = Date.now();
  _stats.operations++;

  // Auto relacionamento
  if (sourceMemoryId && targetMemoryId && sourceMemoryId === targetMemoryId) {
    _stats.rejectedAuto++;
    _recordTime(startTime);
    _decisionLog.push({
      action: "REJECT_AUTO",
      sourceMemoryId,
      targetMemoryId,
      elapsed: Date.now() - startTime,
    });
    return {
      created: false,
      relationship: null,
      reason: "Auto relacionamento não permitido.",
      reasonCode: "AUTO_RELATIONSHIP",
    };
  }

  // Validar órfãos (se knownMemoryIds foi fornecido)
  if (knownMemoryIds && Array.isArray(knownMemoryIds)) {
    const knownSet = new Set(knownMemoryIds);
    if (!knownSet.has(sourceMemoryId)) {
      _stats.rejectedOrphan++;
      _recordTime(startTime);
      _decisionLog.push({
        action: "REJECT_ORPHAN",
        missing: sourceMemoryId,
        elapsed: Date.now() - startTime,
      });
      return {
        created: false,
        relationship: null,
        reason: `Memória de origem inexistente: ${sourceMemoryId}`,
        reasonCode: "ORPHAN_SOURCE",
      };
    }
    if (!knownSet.has(targetMemoryId)) {
      _stats.rejectedOrphan++;
      _recordTime(startTime);
      _decisionLog.push({
        action: "REJECT_ORPHAN",
        missing: targetMemoryId,
        elapsed: Date.now() - startTime,
      });
      return {
        created: false,
        relationship: null,
        reason: `Memória de destino inexistente: ${targetMemoryId}`,
        reasonCode: "ORPHAN_TARGET",
      };
    }
  }

  const rel = buildRelationship({
    sourceMemoryId,
    targetMemoryId,
    relationType,
    confidence,
    reasonCode,
  });

  const validation = validateRelationship(rel);
  if (!validation.valid) {
    _recordTime(startTime);
    _decisionLog.push({
      action: "REJECT_INVALID",
      errors: validation.errors,
      elapsed: Date.now() - startTime,
    });
    return {
      created: false,
      relationship: null,
      reason: validation.errors.join("; "),
      reasonCode: "INVALID",
    };
  }

  const relationships = _readStorage();

  // Duplicidade: mesmo source + target + type
  const isDuplicate = relationships.some(
    (r) =>
      r.sourceMemoryId === rel.sourceMemoryId &&
      r.targetMemoryId === rel.targetMemoryId &&
      r.relationType === rel.relationType
  );
  if (isDuplicate) {
    _stats.rejectedDuplicate++;
    _recordTime(startTime);
    _decisionLog.push({
      action: "REJECT_DUPLICATE",
      sourceMemoryId,
      targetMemoryId,
      relationType,
      elapsed: Date.now() - startTime,
    });
    return {
      created: false,
      relationship: null,
      reason: "Relação já existe (duplicidade).",
      reasonCode: "DUPLICATE",
    };
  }

  // relationshipId duplicado (extremamente improvável com UUID)
  const idExists = relationships.some(
    (r) => r.relationshipId === rel.relationshipId
  );
  if (idExists) {
    _stats.rejectedDuplicate++;
    _recordTime(startTime);
    return {
      created: false,
      relationship: null,
      reason: "relationshipId duplicado.",
      reasonCode: "DUPLICATE_ID",
    };
  }

  relationships.push(rel);
  _writeStorage(relationships);
  _stats.relationshipCreated++;

  _recordTime(startTime);
  _decisionLog.push({
    action: "CREATE",
    relationshipId: rel.relationshipId,
    sourceMemoryId,
    targetMemoryId,
    relationType,
    elapsed: Date.now() - startTime,
  });

  return {
    created: true,
    relationship: rel,
    reason: "Relação criada com sucesso.",
    reasonCode: "CREATED",
  };
}

/**
 * Remove uma relação pelo relationshipId.
 *
 * @param {string} relationshipId
 * @returns {{ removed: boolean, reason: string }}
 */
export function removeRelationship(relationshipId) {
  const startTime = Date.now();
  _stats.operations++;

  const relationships = _readStorage();
  const index = relationships.findIndex((r) => r.relationshipId === relationshipId);

  if (index === -1) {
    _recordTime(startTime);
    return { removed: false, reason: "Relação não encontrada." };
  }

  relationships.splice(index, 1);
  _writeStorage(relationships);
  _stats.relationshipRemoved++;

  _recordTime(startTime);
  _decisionLog.push({
    action: "REMOVE",
    relationshipId,
    elapsed: Date.now() - startTime,
  });

  return { removed: true, reason: "Relação removida." };
}

/**
 * Retorna todas as relações de uma memória (como origem ou destino).
 *
 * @param {string} memoryId
 * @param {Object} [filters] — ex: { relationType, direction: "outgoing"|"incoming"|"both" }
 * @returns {Array}
 */
export function getRelationships(memoryId, filters = {}) {
  _stats.relationshipLookup++;
  _stats.operations++;
  const startTime = Date.now();

  const relationships = _readStorage();
  const direction = filters.direction || "both";

  let result = relationships.filter((r) => {
    if (direction === "outgoing") return r.sourceMemoryId === memoryId;
    if (direction === "incoming") return r.targetMemoryId === memoryId;
    return r.sourceMemoryId === memoryId || r.targetMemoryId === memoryId;
  });

  if (filters.relationType) {
    result = result.filter((r) => r.relationType === filters.relationType);
  }

  _recordTime(startTime);
  return result;
}

/**
 * Retorna os "pais" de uma memória (relações incoming onde target == memoryId).
 *
 * @param {string} memoryId
 * @returns {Array}
 */
export function getParents(memoryId) {
  _stats.relationshipLookup++;
  _stats.operations++;
  const startTime = Date.now();
  const relationships = _readStorage();
  const result = relationships.filter((r) => r.targetMemoryId === memoryId);
  _recordTime(startTime);
  return result;
}

/**
 * Retorna os "filhos" de uma memória (relações outgoing onde source == memoryId).
 *
 * @param {string} memoryId
 * @returns {Array}
 */
export function getChildren(memoryId) {
  _stats.relationshipLookup++;
  _stats.operations++;
  const startTime = Date.now();
  const relationships = _readStorage();
  const result = relationships.filter((r) => r.sourceMemoryId === memoryId);
  _recordTime(startTime);
  return result;
}

/**
 * Retorna relações "related_to" de uma memória.
 *
 * @param {string} memoryId
 * @returns {Array}
 */
export function getRelated(memoryId) {
  _stats.relationshipLookup++;
  _stats.operations++;
  const startTime = Date.now();
  const relationships = _readStorage();
  const result = relationships.filter(
    (r) =>
      r.relationType === "related_to" &&
      (r.sourceMemoryId === memoryId || r.targetMemoryId === memoryId)
  );
  _recordTime(startTime);
  return result;
}

/**
 * Conta o total de relações.
 * Se memoryId for fornecido, conta apenas as dessa memória.
 *
 * @param {string} [memoryId]
 * @returns {number}
 */
export function countRelationships(memoryId) {
  const relationships = _readStorage();
  if (!memoryId) return relationships.length;
  return relationships.filter(
    (r) => r.sourceMemoryId === memoryId || r.targetMemoryId === memoryId
  ).length;
}

/**
 * Expande uma memória: retorna a memória + suas relações diretas (1 nível).
 * Não implementa expansão recursiva.
 *
 * @param {string} memoryId
 * @returns {{ memoryId: string, relationships: Array, directCount: number }}
 */
export function expand(memoryId) {
  _stats.relationshipExpanded++;
  _stats.operations++;
  const startTime = Date.now();

  const relationships = _readStorage();
  const direct = relationships.filter(
    (r) => r.sourceMemoryId === memoryId || r.targetMemoryId === memoryId
  );

  _recordTime(startTime);
  _decisionLog.push({
    action: "EXPAND",
    memoryId,
    directCount: direct.length,
    elapsed: Date.now() - startTime,
  });

  return {
    memoryId,
    relationships: direct,
    directCount: direct.length,
  };
}

// === Observabilidade ===

export function getStats() {
  return {
    ..._stats,
    averageProcessingTimeMs:
      _stats.operations > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.operations)
        : 0,
  };
}

export function getDecisionLog() {
  return [..._decisionLog];
}

export function _resetForTests() {
  _stats.relationshipCreated = 0;
  _stats.relationshipRemoved = 0;
  _stats.relationshipExpanded = 0;
  _stats.relationshipLookup = 0;
  _stats.rejectedAuto = 0;
  _stats.rejectedDuplicate = 0;
  _stats.rejectedOrphan = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.operations = 0;
  _decisionLog.length = 0;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

export { RELATION_TYPES } from "./memoryRelationship";

export default {
  createRelationship,
  removeRelationship,
  getRelationships,
  getParents,
  getChildren,
  getRelated,
  countRelationships,
  expand,
  getStats,
  getDecisionLog,
  _resetForTests,
};