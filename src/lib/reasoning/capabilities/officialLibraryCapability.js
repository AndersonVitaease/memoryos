/**
 * Official Library Capability (Reasoning Pipeline)
 *
 * Permite que o Planner decida quando uma solicitação do usuário necessita
 * consultar a Biblioteca Oficial do MemoryOS.
 *
 * A Capability consulta o OfficialLibraryManager e retorna dados estruturados
 * (estado, versão, lista de documentos) para o Context Builder.
 *
 * O Context Builder permanece agnóstico — apenas renderiza os dados recebidos.
 * O OfficialLibraryManager permanece encapsulado aqui — nenhum outro arquivo
 * do pipeline de raciocínio o importa diretamente.
 *
 * Conformidade: MAS §4.4 (Interface Única), MES §19 (Capability Interface).
 */

import { OfficialLibraryManager } from "@/lib/officialLibraryManager";

/**
 * Keywords que indicam que a pergunta pode necessitar da Biblioteca Oficial.
 * Deve ser específico o suficiente para não ativar em perguntas genéricas.
 */
export const OFFICIAL_LIBRARY_KEYWORDS = [
  "biblioteca oficial",
  "official library",
  "documentos oficiais",
  "versao da biblioteca",
  "versão da biblioteca",
  "biblioteca carregada",
  "versao carregada",
  "versão carregada",
  "quais documentos oficiais",
  "documentos do memoryos",
  "mv memoryos",
  "mps memoryos",
  "mas memoryos",
  "mes memoryos",
  "memoryos vision",
  "memoryos product",
  "memoryos architecture",
  "memoryos engineering",
  "memoryos architecture specification",
  "memoryos engineering specification",
  "memoryos product specification",
  "architecture auditor specialist",
  "especificacao oficial",
  "especificação oficial",
  "documentacao oficial do memoryos",
  "documentação oficial do memoryos",
];

/**
 * Executa a consulta à Biblioteca Oficial.
 *
 * @param {string} message - Mensagem original do usuário (para contexto)
 * @returns {Object} { ready, version, docNames, docCount }
 */
export async function executeOfficialLibraryQuery(message) {
  const ready = OfficialLibraryManager.isReady();
  const version = OfficialLibraryManager.version;
  const docNames = ready ? OfficialLibraryManager.getDocNames() : [];
  const docCount = docNames.length;

  return {
    ready,
    version,
    docNames,
    docCount,
  };
}