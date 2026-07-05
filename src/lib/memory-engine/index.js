/**
 * Memory Engine (Fase 2 · Sprint 1)
 *
 * Camada de inteligência de memória do MemoryOS.
 * A Fase 1 (Fundação Arquitetural) está congelada — nenhuma alteração
 * nos componentes existentes.
 *
 * Sprint 1 — Memory Classifier Estabilizado:
 *   - Pipeline de três níveis: Fast Path → Rule Engine → LLM
 *   - decisionSource em todas as respostas
 *   - reasonCode em todas as respostas
 *   - Observabilidade interna (logs, sem persistência)
 *   - Bateria de 45 testes
 *
 * Módulos NÃO implementados (próximas sprints):
 *   Memory Store, Memory Retrieval, Memory Relationships,
 *   Memory Consolidation, Memory Versioning, Memory Lifecycle,
 *   Embeddings, Busca Semântica, Persistência.
 *
 * Interface pública (usada pelo Core):
 *   MemoryEngine.classify({ userMessage, conversationHistory, currentContext })
 */

export {
  classify,
  MEMORY_TYPES,
  DECISION_SOURCES,
  REASON_CODES,
  getDecisionLog,
  clearDecisionLog,
} from "./classifier";

export { runClassifierTests, TEST_BATTERY } from "./tests";