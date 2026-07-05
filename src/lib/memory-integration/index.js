// Memory Integration Layer (Fase 3 — Sprint 21)
// Transforma Learning Result em Memory Update Proposal. Não grava memória.

export {
  buildMemoryUpdateProposal,
  buildKnowledgeItem,
  buildSuggestedMemory,
  buildConflict,
  validateMemoryUpdateProposal,
  validateKnowledgeItem,
  MEMORY_UPDATE_PROPOSAL_FIELDS,
  KNOWLEDGE_ITEM_FIELDS,
  PROPOSAL_TYPES,
  PROPOSAL_PRIORITIES,
  PROPOSAL_CONFIDENCE_LEVELS,
} from "./memoryUpdateProposal";

export {
  createProposal,
  extractKnowledge,
  classifyKnowledge,
  prioritizeKnowledge,
  detectConflicts,
  calculateProposalConfidence,
  describeProposal,
  validateProposal,
  getStats as getMemoryIntegrationStats,
  getDecisionLog as getMemoryIntegrationDecisionLog,
  _resetForTests as _resetMemoryIntegrationForTests,
} from "./memoryIntegrationEngine";

export { runMemoryIntegrationTests, MEMORY_INTEGRATION_TEST_CASES } from "./memoryIntegrationTests";