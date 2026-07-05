/**
 * Memory Engine (Fase 2)
 *
 * Camada de inteligência de memória do MemoryOS.
 * A Fase 1 (Fundação Arquitetural) está congelada — nenhuma alteração
 * nos componentes existentes.
 *
 * Sprint 1 — Memory Classifier Estabilizado (CONGELADO):
 *   - Pipeline de três níveis: Fast Path → Rule Engine → LLM
 *   - decisionSource em todas as respostas
 *   - reasonCode em todas as respostas
 *   - Observabilidade interna (logs, sem persistência)
 *   - Bateria de 45 testes
 *
 * Sprint 2 — Memory Record & Memory Store:
 *   - Contrato oficial Memory Record
 *   - Conceito Memory Intent
 *   - Suporte a expires (memórias temporárias)
 *   - Memory Store: create(), getById(), list(), count()
 *   - Validações antes da persistência
 *   - Observabilidade: memoryCreated, memoryRejected, processingTime, storeSize
 *   - Persistência local temporária (validação de fluxo)
 *   - Bateria de 10 testes (5 oficiais + 5 complementares)
 *
 * Interface pública:
 *   Sprint 1: MemoryEngine.classify(...)
 *   Sprint 2: MemoryStore.create(record), .getById(id), .list(), .count()
 *             buildMemoryRecord(...), validateMemoryRecord(record)
 */

// === Sprint 1 (congelado) ===
export {
  classify,
  MEMORY_TYPES,
  DECISION_SOURCES,
  REASON_CODES,
  getDecisionLog,
  clearDecisionLog,
} from "./classifier";

export { runClassifierTests, TEST_BATTERY } from "./tests";

// === Sprint 2 ===
export { MEMORY_INTENTS, memoryTypeToIntent } from "./memoryIntents";

export {
  buildMemoryRecord,
  validateMemoryRecord,
  normalizeLegacyRecord,
  MEMORY_RECORD_FIELDS,
  MEMORY_STATUSES,
  MEMORY_SOURCES,
  DEFAULT_STATUS,
  DEFAULT_REVISION,
  DEFAULT_SOURCE,
} from "./memoryRecord";

export {
  create,
  getById,
  list,
  count,
  getStats,
  _resetForTests,
} from "./memoryStore";

export { runStoreTests, STORE_TEST_CASES } from "./storeTests";

// === Sprint 3 ===
export {
  findById,
  findByTag,
  findByType,
  findByIntent,
  search,
  getRetrievalStats,
  _resetRetrievalStats,
} from "./memoryRetrieval";

export { runRetrievalTests, RETRIEVAL_TEST_CASES } from "./retrievalTests";

// === Sprint 4 ===
export {
  buildContext,
  getContextStats,
  _resetContextStats,
  DEFAULT_CONTEXT_CONFIG,
} from "./memoryContextBuilder";

export { runContextBuilderTests, CONTEXT_TEST_CASES } from "./contextBuilderTests";