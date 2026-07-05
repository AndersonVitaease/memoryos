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
 *   Sprint 7: applyProposal(proposal, record), getLatest(key), getRevision(key, rev),
 *             getHistory(key), countRevisions(key), buildProposal(...)
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

// === Sprint 5 ===
export {
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
  getStats as getLifecycleStats,
  _resetForTests as _resetLifecycleForTests,
} from "./memoryLifecycleManager";

export { runLifecycleTests, LIFECYCLE_TEST_CASES } from "./lifecycleTests";

// === Sprint 6 ===
export {
  consolidate,
  getStats as getConsolidationStats,
  getDecisionLog as getConsolidationDecisionLog,
  _resetForTests as _resetConsolidationForTests,
  CONSOLIDATION_ACTIONS,
  CONSOLIDATION_REASON_CODES,
} from "./memoryConsolidationManager";

export { runConsolidationTests, CONSOLIDATION_TEST_CASES } from "./consolidationTests";

// === Sprint 7 ===
export {
  buildProposal,
  validateProposal,
  PROPOSAL_ACTIONS,
  PROPOSAL_FIELDS,
} from "./consolidationProposal";

export {
  applyProposal,
  getLatest,
  getRevision,
  getHistory,
  countRevisions,
  getStats as getVersioningStats,
  getDecisionLog as getVersioningDecisionLog,
  _resetForTests as _resetVersioningForTests,
} from "./memoryVersioningManager";

export { runVersioningTests, VERSIONING_TEST_CASES } from "./versioningTests";

// === Sprint 8 ===
export {
  buildRelationship,
  validateRelationship,
  RELATION_TYPES,
  RELATIONSHIP_FIELDS,
} from "./memoryRelationship";

export {
  createRelationship,
  removeRelationship,
  getRelationships,
  getParents,
  getChildren,
  getRelated,
  countRelationships,
  expand,
  getStats as getRelationshipsStats,
  getDecisionLog as getRelationshipsDecisionLog,
  _resetForTests as _resetRelationshipsForTests,
} from "./memoryRelationshipsManager";

export { runRelationshipsTests, RELATIONSHIPS_TEST_CASES } from "./relationshipsTests";

// === Sprint 9 ===
export {
  semanticSearch,
  expandSemanticContext,
  scoreMemory,
  rankResults,
  setScoreTable,
  getScoreTable,
  getStats as getSemanticStats,
  getDecisionLog as getSemanticDecisionLog,
  _resetForTests as _resetSemanticForTests,
  DEFAULT_SCORE_TABLE,
} from "./semanticRetrievalManager";

export { runSemanticTests, SEMANTIC_TEST_CASES } from "./semanticTests";