/**
 * Base Capability — Interface Oficial (MES §19)
 *
 * Toda Capability do MemoryOS deve implementar:
 *   id: string
 *   name: string
 *   version: string
 *   execute(request): Promise<response>
 *   validate(request): Promise<boolean>
 *
 * Nenhuma Capability deve utilizar interfaces próprias.
 * Todas utilizam o Contrato Oficial Request/Response (MES §5, §6).
 */

/**
 * Cria uma Capability oficial.
 * @param {Object} def
 * @param {string} def.id
 * @param {string} def.name
 * @param {string} def.version
 * @param {(request)=>Promise<boolean>} def.validate
 * @param {(request)=>Promise<{status,result,events,logs,memoryUpdates}>} def.execute
 * @returns {Object} Capability
 */
export function createCapability({ id, name, version = "1.0", validate, execute }) {
  if (!id || !name || !version || typeof execute !== "function") {
    throw new Error(`Capability inválida: id, name, version e execute são obrigatórios (${id || name || "?"})`);
  }
  return {
    id,
    name,
    version,
    validate: typeof validate === "function" ? validate : async () => true,
    execute,
  };
}