/**
 * AI Provider Interface — Interface Oficial (MES §17)
 *
 * Conforme MAS §4.1 (Independência do Core) e MES §17 (AI Providers):
 * - Nenhuma Capability pode conhecer Base44 diretamente.
 * - Toda comunicação com LLM ocorre através desta interface.
 *
 * Interface oficial:
 *   interface AIProvider {
 *     id: string
 *     name: string
 *     version: string
 *     chat(prompt, schema?): Promise<string|object>
 *     summarize(text): Promise<string>
 *     embeddings(text): Promise<number[]>
 *   }
 *
 * Esta factory garante conformidade com a interface oficial.
 */

/**
 * Cria um AIProvider oficial.
 * @param {Object} def
 * @param {string} def.id
 * @param {string} def.name
 * @param {string} def.version
 * @param {(prompt:string, schema?:object, options?:object)=>Promise<any>} def.chat
 * @param {(text:string)=>Promise<string>} def.summarize
 * @param {(text:string)=>Promise<number[]>} def.embeddings
 * @returns {Object} AIProvider
 */
export function createAIProvider({ id, name, version, chat, summarize, embeddings }) {
  if (!id || !name || !version || typeof chat !== "function") {
    throw new Error(`AIProvider inválido: id, name, version e chat são obrigatórios (${id || name || "?"})`);
  }
  return {
    id,
    name,
    version,
    chat,
    summarize: typeof summarize === "function" ? summarize : async (text) => chat(`Resuma: ${text}`),
    embeddings: typeof embeddings === "function" ? embeddings : async () => [],
  };
}