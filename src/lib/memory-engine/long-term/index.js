/**
 * Long-Term Memory — Sprint 23 (LTM)
 *
 * Primeira camada da Long-Term Memory do MemoryOS.
 * Cria apenas a infraestrutura de representação de memórias permanentes.
 *
 * NÃO existe recuperação, busca, ranking, similaridade, embeddings,
 * vetores ou IA nesta Sprint.
 *
 * Sprint anterior (Memory Engine) permanece intacta.
 * Nenhuma Sprint anterior é modificada.
 * Todos os arquivos desta Sprint existem apenas nesta pasta.
 */

// === Contract ===
export {
  buildLongTermMemory,
  validateLongTermMemory,
  LONG_TERM_MEMORY_FIELDS,
  LONG_TERM_MEMORY_TYPES,
  LONG_TERM_MEMORY_STATUSES,
  LONG_TERM_MEMORY_SOURCES,
  LONG_TERM_MEMORY_CONFIDENCE_LEVELS,
  _resetIdsForTests,
} from "./longTermMemory";

// === Engine ===
export {
  persist,
  load,
  describe,
  validate,
  getStats,
  _resetForTests,
} from "./longTermMemoryEngine";

// === Tests ===
export { runLongTermMemoryTests, LONG_TERM_MEMORY_TEST_CASES } from "./longTermMemoryTests";