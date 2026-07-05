/**
 * Memory Vector Index Manager (Sprint 11)
 *
 * Responsabilidade única: INDEXAR embeddings.
 *
 * O QUE FAZ:
 *   - Recebe Memory Embeddings
 *   - Mantém um índice vetorial determinístico em memória
 *   - addToIndex(), removeFromIndex(), rebuildIndex()
 *   - validateIndex() (consistência: sem duplicatas, sem órfãos, dimensões corretas)
 *   - getIndexStats()
 *
 * O QUE NÃO FAZ:
 *   - Gerar embeddings
 *   - Realizar buscas / cosine similarity
 *   - Hybrid retrieval
 *   - Modificar Memory Records, Relationships, Lifecycle, Version History, Embeddings
 *
 * Arquitetura:
 *   Embedding Manager → Vector Index Manager → Hybrid Retrieval (Sprint futura)
 *
 * Nenhuma IA externa é utilizada. Nenhum ANN/HNSW/FAISS/banco vetorial.
 */

import {
  buildMemoryVectorIndex,
  validateMemoryVectorIndex,
} from "./memoryVectorIndex";

// === Índice em memória ===
let _index = null; // { ...indexMeta, entries: { embeddingId: { embeddingId, memoryId, revision, dimensions, vector, checksum, indexedAt } } }
let _embeddingRegistry = null; // Referência externa para validação de órfãos

// === Observabilidade ===
const _stats = {
  indexCreated: 0,
  embeddingIndexed: 0,
  embeddingRemoved: 0,
  embeddingRejected: 0,
  indexValidated: 0,
  indexRebuilt: 0,
  totalProcessingTimeMs: 0,
  operations: 0,
};

const _decisionLog = [];

function _log(event, data) {
  // eslint-disable-next-line no-console
  console.debug(`[VectorIndexManager:${event}]`, data);
}

// === Checksum do índice ===
function _computeIndexChecksum(entries) {
  const ids = Object.keys(entries).sort();
  let hash = 5381;
  for (const id of ids) {
    for (let i = 0; i < id.length; i++) {
      hash = (hash << 5) + hash + id.charCodeAt(i);
      hash = hash & hash;
    }
  }
  return `idx_${(hash >>> 0).toString(36)}_${ids.length}`;
}

// === API pública ===

/**
 * Define o registro de embeddings externo para validação de órfãos.
 * O Vector Index Manager não modifica o registro — apenas lê.
 */
export function setEmbeddingRegistry(registry) {
  _embeddingRegistry = registry;
}

/**
 * Cria um novo índice vetorial.
 */
export function createIndex({ provider = "deterministic", dimensions = 0 } = {}) {
  _stats.operations++;
  const now = new Date().toISOString();
  const entries = {};
  const meta = buildMemoryVectorIndex({
    provider,
    dimensions,
    embeddingCount: 0,
    checksum: _computeIndexChecksum(entries),
    status: "active",
  });
  _index = { ...meta, createdAt: now, entries };
  _stats.indexCreated++;
  _log("indexCreated", { indexId: _index.indexId, provider, dimensions });
  _decisionLog.push({ event: "indexCreated", indexId: _index.indexId });
  return { created: true, indexId: _index.indexId };
}

/**
 * Adiciona um embedding ao índice.
 * Rejeita duplicatas, órfãos, e dimensões incorretas.
 */
export function addToIndex(embedding) {
  _stats.operations++;
  if (!_index) {
    return { indexed: false, reasonCode: "NO_INDEX" };
  }
  if (!embedding || typeof embedding !== "object") {
    _stats.embeddingRejected++;
    return { indexed: false, reasonCode: "INVALID_EMBEDDING" };
  }
  if (!embedding.embeddingId) {
    _stats.embeddingRejected++;
    return { indexed: false, reasonCode: "MISSING_EMBEDDING_ID" };
  }

  // Rejeitar duplicata
  if (_index.entries[embedding.embeddingId]) {
    _stats.embeddingRejected++;
    _log("embeddingRejected", {
      embeddingId: embedding.embeddingId,
      reason: "DUPLICATE",
    });
    _decisionLog.push({
      event: "embeddingRejected",
      embeddingId: embedding.embeddingId,
      reason: "DUPLICATE",
    });
    return { indexed: false, reasonCode: "DUPLICATE" };
  }

  // Rejeitar órfão (embedding não existe no registro externo)
  if (_embeddingRegistry && typeof _embeddingRegistry.has === "function") {
    if (!_embeddingRegistry.has(embedding.embeddingId)) {
      _stats.embeddingRejected++;
      _log("embeddingRejected", {
        embeddingId: embedding.embeddingId,
        reason: "ORPHAN",
      });
      _decisionLog.push({
        event: "embeddingRejected",
        embeddingId: embedding.embeddingId,
        reason: "ORPHAN",
      });
      return { indexed: false, reasonCode: "ORPHAN" };
    }
  }

  // Validar dimensões
  const dims = Array.isArray(embedding.vector)
    ? embedding.vector.length
    : embedding.dimensions || 0;
  if (_index.dimensions > 0 && dims !== _index.dimensions) {
    _stats.embeddingRejected++;
    _log("embeddingRejected", {
      embeddingId: embedding.embeddingId,
      reason: "DIMENSION_MISMATCH",
      expected: _index.dimensions,
      got: dims,
    });
    _decisionLog.push({
      event: "embeddingRejected",
      embeddingId: embedding.embeddingId,
      reason: "DIMENSION_MISMATCH",
      expected: _index.dimensions,
      got: dims,
    });
    return { indexed: false, reasonCode: "DIMENSION_MISMATCH" };
  }

  // Indexar (cópia defensiva — não modifica o embedding original)
  _index.entries[embedding.embeddingId] = {
    embeddingId: embedding.embeddingId,
    memoryId: embedding.memoryId,
    revision: embedding.revision,
    dimensions: dims,
    checksum: embedding.checksum,
    indexedAt: new Date().toISOString(),
  };
  _index.embeddingCount++;
  _index.checksum = _computeIndexChecksum(_index.entries);
  _stats.embeddingIndexed++;
  _log("embeddingIndexed", { embeddingId: embedding.embeddingId });
  _decisionLog.push({
    event: "embeddingIndexed",
    embeddingId: embedding.embeddingId,
  });
  return { indexed: true, embeddingId: embedding.embeddingId };
}

/**
 * Remove um embedding do índice.
 */
export function removeFromIndex(embeddingId) {
  _stats.operations++;
  if (!_index) {
    return { removed: false, reasonCode: "NO_INDEX" };
  }
  if (!embeddingId || !_index.entries[embeddingId]) {
    return { removed: false, reasonCode: "NOT_FOUND" };
  }
  delete _index.entries[embeddingId];
  _index.embeddingCount--;
  _index.checksum = _computeIndexChecksum(_index.entries);
  _stats.embeddingRemoved++;
  _log("embeddingRemoved", { embeddingId });
  _decisionLog.push({ event: "embeddingRemoved", embeddingId });
  return { removed: true, embeddingId };
}

/**
 * Reconstrói o índice a partir de uma lista de embeddings.
 */
export function rebuildIndex(embeddings) {
  _stats.operations++;
  if (!Array.isArray(embeddings)) {
    return { rebuilt: false, reasonCode: "INVALID_INPUT" };
  }

  const startTime = Date.now();

  // Determinar dimensões a partir do primeiro embedding válido
  let dimensions = _index?.dimensions || 0;
  if (dimensions === 0 && embeddings.length > 0) {
    const first = embeddings.find((e) => e && Array.isArray(e.vector));
    if (first) dimensions = first.vector.length;
  }

  // Criar novo índice
  const oldIndexId = _index?.indexId;
  _index = null;
  createIndex({ provider: "deterministic", dimensions });

  // Re-indexar todos
  let indexed = 0;
  let rejected = 0;
  for (const emb of embeddings) {
    const result = addToIndex(emb);
    if (result.indexed) indexed++;
    else rejected++;
  }

  const elapsed = Date.now() - startTime;
  _stats.indexRebuilt++;
  _stats.totalProcessingTimeMs += elapsed;
  _log("indexRebuilt", { oldIndexId, newIndexId: _index.indexId, indexed, rejected });
  _decisionLog.push({
    event: "indexRebuilt",
    oldIndexId,
    newIndexId: _index.indexId,
    indexed,
    rejected,
  });
  return { rebuilt: true, indexId: _index.indexId, indexed, rejected };
}

/**
 * Valida a consistência do índice.
 * Verifica: duplicatas, órfãos, dimensões, contagem.
 */
export function validateIndex() {
  _stats.operations++;
  if (!_index) {
    return { valid: false, errors: ["Índice não existe."] };
  }

  const errors = [];
  const entryIds = Object.keys(_index.entries);
  const seenIds = new Set();
  let dimMismatches = 0;
  let orphans = 0;

  for (const id of entryIds) {
    const entry = _index.entries[id];

    // Duplicata (não deveria acontecer em objeto, mas valida)
    if (seenIds.has(id)) {
      errors.push(`Duplicata detectada: ${id}`);
    }
    seenIds.add(id);

    // Verificar órfão no registro externo
    if (_embeddingRegistry && typeof _embeddingRegistry.has === "function") {
      if (!_embeddingRegistry.has(id)) {
        orphans++;
        errors.push(`Embedding órfão: ${id}`);
      }
    }

    // Validar dimensões
    if (_index.dimensions > 0 && entry.dimensions !== _index.dimensions) {
      dimMismatches++;
      errors.push(
        `Dimensão incorreta para ${id}: esperado ${_index.dimensions}, obtido ${entry.dimensions}`
      );
    }
  }

  // Validar contagem
  if (_index.embeddingCount !== entryIds.length) {
    errors.push(
      `Contagem incorreta: meta=${_index.embeddingCount}, real=${entryIds.length}`
    );
  }

  // Validar checksum
  const computedChecksum = _computeIndexChecksum(_index.entries);
  if (_index.checksum !== computedChecksum) {
    errors.push("Checksum do índice inconsistente.");
  }

  // Validar contrato
  const contractValidation = validateMemoryVectorIndex({
    indexId: _index.indexId,
    provider: _index.provider,
    dimensions: _index.dimensions,
    embeddingCount: _index.embeddingCount,
    checksum: _index.checksum,
    createdAt: _index.createdAt,
    status: _index.status,
  });
  if (!contractValidation.valid) {
    errors.push(...contractValidation.errors);
  }

  _stats.indexValidated++;
  _log("indexValidated", {
    valid: errors.length === 0,
    errorCount: errors.length,
  });
  _decisionLog.push({
    event: "indexValidated",
    valid: errors.length === 0,
    errorCount: errors.length,
  });

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      totalEntries: entryIds.length,
      orphans,
      dimMismatches,
      duplicates: 0,
    },
  };
}

/**
 * Retorna estatísticas do índice.
 */
export function getIndexStats() {
  _stats.operations++;
  if (!_index) {
    return {
      exists: false,
      indexId: null,
      embeddingCount: 0,
      dimensions: 0,
      status: null,
      checksum: null,
    };
  }
  return {
    exists: true,
    indexId: _index.indexId,
    provider: _index.provider,
    dimensions: _index.dimensions,
    embeddingCount: _index.embeddingCount,
    checksum: _index.checksum,
    createdAt: _index.createdAt,
    status: _index.status,
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
    decisionLog: [..._decisionLog],
  };
}

export function getDecisionLog() {
  return [..._decisionLog];
}

export function _resetForTests() {
  _index = null;
  _embeddingRegistry = null;
  _stats.indexCreated = 0;
  _stats.embeddingIndexed = 0;
  _stats.embeddingRemoved = 0;
  _stats.embeddingRejected = 0;
  _stats.indexValidated = 0;
  _stats.indexRebuilt = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.operations = 0;
  _decisionLog.length = 0;
}

export default {
  setEmbeddingRegistry,
  createIndex,
  addToIndex,
  removeFromIndex,
  rebuildIndex,
  validateIndex,
  getIndexStats,
  getStats,
  getDecisionLog,
  _resetForTests,
};