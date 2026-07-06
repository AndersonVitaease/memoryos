/**
 * Long-Term Memory Retrieval — Sprint 25 (LTM Retrieval)
 *
 * Infraestrutura de recuperação determinística de memórias permanentes.
 * NÃO utiliza IA, embeddings, vetores, similaridade, ranking, busca semântica,
 * LLM, banco de dados ou algoritmos cognitivos.
 */

// === Contract ===
export {
  buildRetrievalRequest,
  buildRetrievalResult,
  validateRetrievalRequest,
  validateRetrievalResult,
  LTM_RETRIEVAL_REQUEST_FIELDS,
  LTM_RETRIEVAL_RESULT_FIELDS,
  DEFAULT_LIMIT,
  DEFAULT_OFFSET,
  _resetIdsForTests,
} from "./longTermRetrieval";

// === Engine ===
export {
  retrieve,
  retrieveByMemoryId,
  retrieveByType,
  retrieveByTag,
  retrieveByStatus,
  retrieveBySource,
  describeResult,
  validateRequest,
  validateResult,
  getStats,
  _resetForTests,
} from "./longTermRetrievalEngine";

// === Tests ===
export { runLongTermRetrievalTests, LTM_RETRIEVAL_TEST_CASES } from "./longTermRetrievalTests";