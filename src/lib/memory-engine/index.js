/**
 * Memory Engine (Fase 2)
 *
 * Nova camada do MemoryOS responsável pela inteligência de memória.
 * A Fase 1 (Fundação Arquitetural) está congelada — nenhuma alteração
 * nos componentes existentes.
 *
 * Módulos implementados:
 *   - Memory Classifier (Módulo 1): decide se uma informação deve se tornar memória.
 *
 * Módulos NÃO implementados nesta fase:
 *   - Memory Store
 *   - Memory Retrieval
 *   - Memory Relationships
 *   - Memory Consolidation
 *   - Memory Versioning
 *   - Memory Lifecycle
 *   - Ranking / Embeddings / Busca Semântica / Persistência
 *
 * Interface pública (usada pelo Core):
 *   MemoryEngine.classify({ userMessage, conversationHistory, currentContext })
 *     → { shouldRemember, memoryType, confidence, reason, suggestedTitle, tags, importance }
 */

export { classify, MEMORY_TYPES } from "./classifier";
export { runClassifierTests, CLASSIFIER_TEST_CASES } from "./tests";