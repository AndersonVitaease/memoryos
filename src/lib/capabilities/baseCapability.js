/**
 * Base Capability — Interface Oficial (MES §19)
 *
 * Toda Capability do MemoryOS deve implementar:
 *   id: string
 *   name: string
 *   execute(input): Promise<output>
 *   validate(input): Promise<boolean>
 *
 * Nenhuma Capability deve utilizar interfaces próprias.
 * Este factory garante conformidade com a interface oficial.
 */

/**
 * Cria uma Capability oficial.
 * @param {Object} def
 * @param {string} def.id
 * @param {string} def.name
 * @param {(input:any)=>Promise<boolean>} def.validate
 * @param {(input:any)=>Promise<any>} def.execute
 * @returns {Object} Capability
 */
export function createCapability({ id, name, validate, execute }) {
  if (!id || !name || typeof execute !== "function") {
    throw new Error(`Capability inválida: id, name e execute são obrigatórios (${id || name || "?"})`);
  }
  return {
    id,
    name,
    validate: typeof validate === "function" ? validate : async () => true,
    execute,
  };
}