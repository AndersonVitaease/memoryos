/**
 * Memory Intent (Sprint 2)
 *
 * Novo conceito introduzido na Sprint 2.
 * Representa a intenção semântica da memória — diferente de memoryType.
 *
 * O memoryType (produzido pelo Classifier) descreve a categoria técnica.
 * O memoryIntent descreve a intenção de uso futuro pelo Retrieval Engine.
 *
 * Valores iniciais oficiais:
 */
export const MEMORY_INTENTS = [
  "user_profile",
  "user_preference",
  "project_identity",
  "project_decision",
  "project_goal",
  "project_requirement",
  "task",
  "organization",
  "contact",
  "knowledge",
  "document_reference",
  "conversation_context",
  "fact",
  "other",
];

/**
 * Mapeia memoryType (saída do Classifier — Sprint 1, congelado)
 * para memoryIntent (Sprint 2).
 *
 * O Classifier não conhece memoryIntent — ele apenas produz memoryType.
 * O Memory Record Builder faz a tradução.
 *
 * @param {string} memoryType
 * @returns {string} memoryIntent
 */
export function memoryTypeToIntent(memoryType) {
  if (memoryType === "project") return "project_identity";
  if (MEMORY_INTENTS.includes(memoryType)) return memoryType;
  return "other";
}

export default { MEMORY_INTENTS, memoryTypeToIntent };