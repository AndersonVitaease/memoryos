/**
 * Specialist Registry (MAS §4.3 — Registro Central de Specialists)
 *
 * Responsabilidade única:
 *   Registrar todos os Specialists oficiais do MemoryOS.
 *
 * Princípios:
 *   - O Registry é o ÚNICO local que conhece imports diretos de Specialists.
 *   - Nenhum arquivo fora do Registry pode importar um Specialist diretamente.
 *   - Para adicionar um novo Specialist:
 *       1. Criar o Specialist (conforme MES §18).
 *       2. Importá-lo aqui e registrá-lo com um goalId.
 *       3. Pronto — nenhum outro arquivo precisa ser alterado.
 *
 * Interface oficial:
 *   SpecialistRegistry.get(goalId)     → Specialist | null
 *   SpecialistRegistry.all()          → Specialist[]
 *   SpecialistRegistry.register(entry) → void
 */

import architectureAuditor from "@/lib/auditor/architectureAuditorV4";

/**
 * Registro oficial.
 * Cada entrada mapeia um goalId (detectado pelo Goal Detector) a um Specialist.
 */
const _registry = [
  {
    goalId: "audit_architecture",
    specialist: architectureAuditor,
    confidence: "ALTA",
    reason: "Goal de auditoria arquitetural mapeia diretamente ao Architecture Auditor Specialist (v4.0 — Estável).",
  },
];

/**
 * Retorna o Specialist registrado para um determinado goalId.
 * @param {string} goalId
 * @returns {Object|null} { specialist, confidence, reason } ou null
 */
function get(goalId) {
  const entry = _registry.find((e) => e.goalId === goalId);
  if (!entry) return null;
  return {
    specialist: entry.specialist,
    confidence: entry.confidence || "MÉDIA",
    reason: entry.reason || "Specialist registrado para este goal.",
  };
}

/**
 * Retorna todos os Specialists registrados.
 * @returns {Array} Array de entradas { goalId, specialist, confidence, reason }
 */
function all() {
  return [..._registry];
}

/**
 * Registra um novo Specialist dinamicamente.
 * Permite extensibilidade sem alterar o arquivo (embora o registro estático
 * seja o padrão recomendado).
 * @param {Object} entry - { goalId, specialist, confidence?, reason? }
 */
function register(entry) {
  if (!entry || !entry.goalId || !entry.specialist) return;
  const existing = _registry.findIndex((e) => e.goalId === entry.goalId);
  if (existing >= 0) {
    _registry[existing] = entry;
  } else {
    _registry.push(entry);
  }
}

export const SpecialistRegistry = {
  id: "specialist-registry",
  version: "1.0",
  get,
  all,
  register,
};

export default SpecialistRegistry;