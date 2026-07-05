/**
 * Specialist Router (MAS §4.3 — Roteamento Oficial de Specialists)
 *
 * Responsabilidade única:
 *   Receber um Goal detectado pelo Core e decidir qual Specialist utilizar.
 *
 * O Specialist Router NUNCA:
 *   - executa lógica de negócio;
 *   - chama o LLM diretamente;
 *   - conhece detalhes internos de um Specialist;
 *   - importa Specialists diretamente (consulta apenas o Registry).
 *
 * Interface oficial:
 *   SpecialistRouter.route(goal, context) → { specialist, confidence, reason } | null
 *
 * Pipeline oficial do Core:
 *   Usuário → Core → Goal Detector → Context Builder → Planner
 *     → Specialist Router (ESTA CAMADA)
 *     → Specialist → Capabilities → Service Layer → Connector Manager
 *     → Provider → Resultado → Planner → Usuário
 *
 * Escalabilidade:
 *   Para adicionar um novo Specialist, basta registrá-lo no Registry.
 *   O Router e o Planner NÃO precisam ser alterados.
 */

import { SpecialistRegistry } from "@/lib/specialists/registry";

/**
 * Decide qual Specialist deve ser utilizado para um determinado goal.
 *
 * @param {Object} goal - Objetivo detectado pelo Goal Detector { id, type, priority, metadata }
 * @param {Object} context - Contexto adicional (memória, sessão, etc.) — opcional
 * @returns {Object|null} { specialist, confidence, reason } ou null se nenhum Specialist aplicar
 */
export function route(goal, context = {}) {
  if (!goal || !goal.id) return null;

  // Apenas goals do tipo "specialist" são roteáveis.
  // Goals "general" seguem o fluxo padrão (LLM com contexto).
  if (goal.type && goal.type !== "specialist") return null;

  const entry = SpecialistRegistry.get(goal.id);
  if (!entry) return null;

  return {
    specialist: entry.specialist,
    confidence: entry.confidence,
    reason: entry.reason,
  };
}

export const SpecialistRouter = {
  id: "specialist-router",
  version: "1.0",
  route,
};

export default SpecialistRouter;