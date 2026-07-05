/**
 * PolicyEngine — Stub Oficial (MAS §4.6)
 *
 * Conforme MAS §4.6 (Policy Engine) e MES §24 (Security):
 * - Toda execução deve passar pela autorização do Policy Engine.
 * - Nesta primeira versão: stub que sempre autoriza (allow = true).
 * - Implementação completa fica para uma fase futura.
 *
 * Interface oficial:
 *   interface PolicyEngine {
 *     authorize(request): Promise<{ allow: boolean, reason?: string }>
 *   }
 *
 * O PolicyEngine é a única camada responsável por autorização.
 * Nenhuma outra camada toma decisões de autorização.
 */

export const PolicyEngine = {
  id: "policy-engine",
  name: "Policy Engine",
  version: "1.0",
  authorize: async (request) => {
    // STUB — sempre autoriza.
    // Implementação futura: validar escopo, permissões, dados sensíveis.
    return { allow: true, reason: "stub-allow" };
  },
};

export default PolicyEngine;