/**
 * Memory Storage (Sprint 22 — Memory Engine)
 *
 * Storage determinístico em memória para persistência de memórias.
 * IDs são determinísticos (contadores via buildPersistedMemory).
 *
 * NÃO usa estado global compartilhado fora deste módulo.
 * NÃO chama LLM, NÃO executa HTTP, NÃO acessa APIs externas.
 */

import { buildPersistedMemory } from "./memoryResult";
import { normalizeContent } from "./memoryDeduplicator";

const _store = new Map();

/**
 * Persiste uma memória no storage.
 * Se já existe uma duplicata, faz merge (atualiza tags e confiança).
 */
export function store(memoryData) {
  if (!memoryData || !memoryData.content) {
    throw new Error("memory content is required for storage");
  }

  // Check for existing duplicate by content
  const existing = findByContent(memoryData.content);
  if (existing.length > 0) {
    const existingMem = existing[0];

    // Merge tags (union)
    const mergedTags = [...new Set([...(existingMem.tags || []), ...(memoryData.tags || [])])];

    // Upgrade confidence (keep the higher one)
    const confidenceOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    const mergedConfidence =
      (confidenceOrder[memoryData.confidence] || 0) >
      (confidenceOrder[existingMem.confidence] || 0)
        ? memoryData.confidence
        : existingMem.confidence;

    const updated = Object.freeze({
      ...existingMem,
      tags: Object.freeze(mergedTags),
      confidence: mergedConfidence,
      updatedAt: new Date().toISOString(),
    });

    _store.set(existingMem.memoryId, updated);
    return updated;
  }

  // Create new memory
  const memory = buildPersistedMemory({
    memoryType: memoryData.memoryType,
    content: memoryData.content,
    tags: memoryData.tags,
    confidence: memoryData.confidence,
    source: memoryData.source || "proposal",
  });

  _store.set(memory.memoryId, memory);
  return memory;
}

/**
 * Encontra memórias por conteúdo normalizado.
 */
export function findByContent(content) {
  if (!content) return [];
  const normalized = normalizeContent(content);

  const results = [];
  for (const memory of _store.values()) {
    if (normalizeContent(memory.content) === normalized) {
      results.push(memory);
    }
  }
  return results;
}

/**
 * Lista todas as memórias persistidas.
 */
export function list() {
  return Array.from(_store.values());
}

/**
 * Retorna o número de memórias no storage.
 */
export function size() {
  return _store.size;
}

/**
 * Busca uma memória por ID.
 */
export function getById(id) {
  return _store.get(id) || null;
}

/**
 * Limpa todo o storage (para testes).
 */
export function clear() {
  _store.clear();
}