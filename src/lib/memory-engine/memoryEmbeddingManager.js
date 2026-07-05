/**
 * Memory Embedding Manager (Sprint 10)
 *
 * Responsabilidade única: GERAR e MANTER embeddings das memórias.
 *
 * O QUE FAZ:
 *   - Recebe Memory Records
 *   - Gera embeddings via Provider
 *   - Persiste embeddings + metadata
 *   - Mantém histórico de embeddings (revisões antigas preservadas)
 *   - Cache via checksum (não regenera se conteúdo não mudou)
 *   - Reindexação manual (queue, generate, reindexMemory, reindexAll)
 *
 * O QUE NÃO FAZ:
 *   - Retrieval / busca semântica vetorial
 *   - Cosine similarity
 *   - Hybrid retrieval
 *   - ANN index
 *   - Vector database
 *   - Modificar Memory Records
 *   - Lifecycle, Relationships, Version History
 *   - Responder perguntas
 *
 * Arquitetura:
 *   Memory Record → Embedding Manager → Embedding Store
 *
 * Nenhuma IA externa é utilizada.
 */

import {
  buildMemoryEmbedding,
  validateMemoryEmbedding,
} from "./memoryEmbedding";
import { createStubProvider } from "./embeddingProvider";

// === Embedding Store (persistência local temporária) ===
const STORAGE_KEY = "memoryos_embedding_store";
const QUEUE_KEY = "memoryos_embedding_queue";

function _loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { embeddings: {}, byMemory: {} };
  } catch {
    return { embeddings: {}, byMemory: {} };
  }
}

function _saveStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota
  }
}

function _loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function _saveQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

// === Checksum ===
export function checksum(text) {
  if (!text || typeof text !== "string") return "";
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) + hash + text.charCodeAt(i);
    hash = hash & hash; // 32-bit
  }
  return `cs_${(hash >>> 0).toString(36)}`;
}

// === Observabilidade ===
const _stats = {
  embeddingQueued: 0,
  embeddingGenerated: 0,
  embeddingSkipped: 0,
  embeddingReindexed: 0,
  totalProcessingTimeMs: 0,
  operations: 0,
  cacheHits: 0,
  cacheMisses: 0,
  embeddingsPreserved: 0,
  externalAIUsed: false,
};

const _decisionLog = [];

function _log(event, data) {
  // eslint-disable-next-line no-console
  console.debug(`[EmbeddingManager:${event}]`, data);
}

// === Provider ===
let _provider = null;

export function setProvider(provider) {
  if (provider && typeof provider.generate === "function") {
    _provider = provider;
  }
}

export function getProvider() {
  if (!_provider) {
    _provider = createStubProvider();
  }
  return _provider;
}

// === Helpers ===
function _getContent(record) {
  return record.normalizedContent || record.originalMessage || "";
}

function _findActiveEmbedding(store, memoryId) {
  const ids = store.byMemory[memoryId] || [];
  for (const id of ids) {
    const emb = store.embeddings[id];
    if (emb && emb.status === "active") return emb;
  }
  return null;
}

function _supersedeActive(store, memoryId) {
  const ids = store.byMemory[memoryId] || [];
  for (const id of ids) {
    if (store.embeddings[id] && store.embeddings[id].status === "active") {
      store.embeddings[id].status = "superseded";
      _stats.embeddingsPreserved++;
    }
  }
}

// === API pública ===

/**
 * Adiciona um Memory Record à fila de embedding.
 * Não executa automaticamente.
 */
export function queueEmbedding(memoryRecord) {
  _stats.operations++;
  if (!memoryRecord || typeof memoryRecord !== "object") {
    return { queued: false, reasonCode: "INVALID_RECORD" };
  }
  const content = _getContent(memoryRecord);
  const cs = checksum(content);
  const queue = _loadQueue();
  const entry = {
    queueId: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    memoryId: memoryRecord.id,
    revision: memoryRecord.revision || 1,
    content,
    checksum: cs,
    queuedAt: new Date().toISOString(),
  };
  queue.push(entry);
  _saveQueue(queue);
  _stats.embeddingQueued++;
  _log("embeddingQueued", { memoryId: memoryRecord.id, checksum: cs });
  _decisionLog.push({
    event: "embeddingQueued",
    memoryId: memoryRecord.id,
    checksum: cs,
  });
  return { queued: true, queueId: entry.queueId, checksum: cs };
}

/**
 * Processa a fila de embeddings.
 * Gera embeddings para entradas pendentes.
 * Se checksum não mudou → reutiliza (cache hit).
 */
export function generateEmbedding(maxItems = 100) {
  const startTime = Date.now();
  _stats.operations++;
  const queue = _loadQueue();
  const store = _loadStore();
  const provider = getProvider();
  const results = [];
  let processed = 0;

  const toProcess = queue.slice(0, maxItems);

  for (const entry of toProcess) {
    processed++;

    // Cache check: existe embedding active com mesmo checksum?
    const active = _findActiveEmbedding(store, entry.memoryId);
    if (active && active.checksum === entry.checksum) {
      _stats.cacheHits++;
      _stats.embeddingSkipped++;
      _log("embeddingSkipped", { memoryId: entry.memoryId, reason: "CACHE_HIT" });
      _decisionLog.push({
        event: "embeddingSkipped",
        memoryId: entry.memoryId,
        reason: "CACHE_HIT",
      });
      results.push({
        memoryId: entry.memoryId,
        action: "REUSED",
        embeddingId: active.embeddingId,
      });
      continue;
    }

    _stats.cacheMisses++;

    // Supersede active anterior (preserva o antigo)
    if (active) {
      _supersedeActive(store, entry.memoryId);
    }

    // Gerar embedding
    const { vector, dimensions } = provider.generate(entry.content);
    const embedding = buildMemoryEmbedding({
      memoryId: entry.memoryId,
      revision: entry.revision,
      provider: provider.name,
      dimensions,
      vector,
      checksum: entry.checksum,
      status: "active",
    });

    const validation = validateMemoryEmbedding(embedding);
    if (!validation.valid) {
      _stats.embeddingSkipped++;
      _log("embeddingRejected", {
        memoryId: entry.memoryId,
        errors: validation.errors,
      });
      results.push({
        memoryId: entry.memoryId,
        action: "REJECTED",
        errors: validation.errors,
      });
      continue;
    }

    store.embeddings[embedding.embeddingId] = embedding;
    if (!store.byMemory[entry.memoryId]) store.byMemory[entry.memoryId] = [];
    store.byMemory[entry.memoryId].push(embedding.embeddingId);
    _stats.embeddingGenerated++;
    _log("embeddingGenerated", {
      memoryId: entry.memoryId,
      embeddingId: embedding.embeddingId,
    });
    _decisionLog.push({
      event: "embeddingGenerated",
      memoryId: entry.memoryId,
      embeddingId: embedding.embeddingId,
    });
    results.push({
      memoryId: entry.memoryId,
      action: "GENERATED",
      embeddingId: embedding.embeddingId,
    });
  }

  // Remover entradas processadas
  const remaining = queue.slice(processed);
  _saveQueue(remaining);
  _saveStore(store);

  const elapsed = Date.now() - startTime;
  _stats.totalProcessingTimeMs += elapsed;
  return { processed, results, remaining: remaining.length };
}

/**
 * Reindexa uma memória específica.
 * Gera novo embedding para o registro fornecido.
 */
export function reindexMemory(memoryId, memoryRecord) {
  const startTime = Date.now();
  _stats.operations++;
  if (!memoryId || !memoryRecord) {
    return { reindexed: false, reasonCode: "INVALID_INPUT" };
  }
  queueEmbedding(memoryRecord);
  generateEmbedding(1);
  _stats.embeddingReindexed++;
  const elapsed = Date.now() - startTime;
  _stats.totalProcessingTimeMs += elapsed;
  _log("embeddingReindexed", { memoryId });
  _decisionLog.push({ event: "embeddingReindexed", memoryId });
  return { reindexed: true, memoryId };
}

/**
 * Reindexa todas as memórias fornecidas.
 */
export function reindexAll(memoryRecords) {
  const startTime = Date.now();
  _stats.operations++;
  if (!Array.isArray(memoryRecords) || memoryRecords.length === 0) {
    return { reindexed: 0 };
  }
  for (const rec of memoryRecords) {
    queueEmbedding(rec);
  }
  const result = generateEmbedding(memoryRecords.length);
  _stats.embeddingReindexed += result.processed;
  const elapsed = Date.now() - startTime;
  _stats.totalProcessingTimeMs += elapsed;
  _log("reindexAll", { count: result.processed });
  return { reindexed: result.processed, results: result.results };
}

// === Queries ===

export function getEmbedding(embeddingId) {
  const store = _loadStore();
  return store.embeddings[embeddingId] || null;
}

export function getActiveEmbedding(memoryId) {
  const store = _loadStore();
  return _findActiveEmbedding(store, memoryId);
}

export function getEmbeddingHistory(memoryId) {
  const store = _loadStore();
  const ids = store.byMemory[memoryId] || [];
  return ids.map((id) => store.embeddings[id]).filter(Boolean);
}

export function countEmbeddings() {
  const store = _loadStore();
  return Object.keys(store.embeddings).length;
}

export function getQueueSize() {
  return _loadQueue().length;
}

// === Observabilidade ===

export function getStats() {
  return {
    ..._stats,
    totalEmbeddings: countEmbeddings(),
    queueSize: getQueueSize(),
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
  _stats.embeddingQueued = 0;
  _stats.embeddingGenerated = 0;
  _stats.embeddingSkipped = 0;
  _stats.embeddingReindexed = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.operations = 0;
  _stats.cacheHits = 0;
  _stats.cacheMisses = 0;
  _stats.embeddingsPreserved = 0;
  _stats.externalAIUsed = false;
  _decisionLog.length = 0;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // ignore
  }
  _provider = null;
}

export default {
  queueEmbedding,
  generateEmbedding,
  reindexMemory,
  reindexAll,
  checksum,
  setProvider,
  getProvider,
  getEmbedding,
  getActiveEmbedding,
  getEmbeddingHistory,
  countEmbeddings,
  getQueueSize,
  getStats,
  getDecisionLog,
  _resetForTests,
};