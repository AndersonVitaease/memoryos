/**
 * Long-Term Memory Engine (Sprint 23 — LTM)
 *
 * Camada extremamente simples que apenas recebe um objeto válido e o devolve.
 *
 * O QUE FAZ:
 *   - persist()  — devolve o contrato congelado (não grava em banco/disco/vetor/JSON)
 *   - load()     — retorna null (até a Sprint de Retrieval)
 *   - describe() — produz descrição legível
 *   - validate() — valida a estrutura
 *   - getStats() — retorna estatísticas simples
 *   - _resetForTests() — reseta contadores
 *
 * O QUE NÃO FAZ:
 *   - Gravar banco
 *   - Gravar disco
 *   - Gravar vetor
 *   - Gravar JSON
 *   - Recuperar memórias
 *   - Buscar memórias
 *   - Ranking
 *   - Similaridade
 *   - Embeddings
 *   - IA
 *   - Decisões cognitivas
 *   - Modificar o Memory Engine existente
 *   - Modificar qualquer Sprint anterior
 */

import {
  buildLongTermMemory,
  validateLongTermMemory,
  LONG_TERM_MEMORY_FIELDS,
  _resetIdsForTests,
} from "./longTermMemory";

// === Observability ===

const _stats = {
  persisted: 0,
  validated: 0,
  rejected: 0,
  described: 0,
  totalProcessingTimeMs: 0,
  eventLog: [],
};

function _log(event, data) {
  _stats.eventLog.push({ event, ...data, timestamp: new Date().toISOString() });
}

// === persist() ===

/**
 * Recebe um objeto e devolve o contrato congelado.
 * NÃO grava em banco, disco, vetor ou JSON.
 * Apenas constrói e retorna a Long-Term Memory imutável.
 *
 * @param {Object} input — dados da memória
 * @returns {Object} LongTermMemory congelada
 */
export function persist(input = {}) {
  const startTime = Date.now();

  let memory;
  try {
    memory = buildLongTermMemory(input);
  } catch (err) {
    _stats.rejected++;
    _log("persistRejected", { error: err.message });
    throw err;
  }

  _stats.persisted++;
  _stats.totalProcessingTimeMs += Date.now() - startTime;
  _log("persisted", { memoryId: memory.memoryId, memoryRecordId: memory.memoryRecordId });

  return memory;
}

// === load() ===

/**
 * Não busca nada. Apenas retorna null.
 * A recuperação será implementada na Sprint de Retrieval.
 *
 * @returns {null}
 */
export function load() {
  return null;
}

// === describe() ===

/**
 * Produz descrição legível da memória.
 */
export function describe(memory) {
  if (!memory) return null;

  _stats.described++;

  const lines = [
    `Memória ${memory.memoryId}`,
    `  Registro: ${memory.memoryRecordId}`,
    `  Tipo: ${memory.memoryType}`,
    `  Status: ${memory.status}`,
    `  Confiança: ${memory.confidence}`,
    `  Origem: ${memory.source}`,
    `  Conteúdo: ${memory.content}`,
    `  Criada em: ${memory.createdAt}`,
    `  Atualizada em: ${memory.updatedAt}`,
  ];

  if (memory.tags.length > 0) {
    lines.push(`  Tags: ${memory.tags.join(", ")}`);
  } else {
    lines.push(`  Tags: —`);
  }

  const meta = memory.metadata;
  if (meta && Object.keys(meta).length > 0) {
    lines.push(`  Metadados:`);
    for (const [k, v] of Object.entries(meta)) {
      lines.push(`    ${k}: ${v ?? "—"}`);
    }
  }

  return lines.join("\n");
}

// === validate() ===

/**
 * Valida a estrutura da memória.
 */
export function validate(memory) {
  const result = validateLongTermMemory(memory);
  _stats.validated++;
  if (!result.valid) {
    _stats.rejected++;
    _log("validateRejected", { error: result.error });
  }
  return result;
}

// === getStats() ===

/**
 * Retorna estatísticas simples.
 */
export function getStats() {
  return {
    persisted: _stats.persisted,
    validated: _stats.validated,
    rejected: _stats.rejected,
    described: _stats.described,
    averageProcessingTime:
      _stats.persisted > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.persisted)
        : 0,
    eventLog: [..._stats.eventLog],
  };
}

// === _resetForTests() ===

/**
 * Reseta todos os contadores para manter os testes determinísticos.
 */
export function _resetForTests() {
  _stats.persisted = 0;
  _stats.validated = 0;
  _stats.rejected = 0;
  _stats.described = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.eventLog.length = 0;
  _resetIdsForTests();
}

export { LONG_TERM_MEMORY_FIELDS };

export default {
  persist,
  load,
  describe,
  validate,
  getStats,
  _resetForTests,
};