/**
 * Official Library Capability (Reasoning Pipeline)
 *
 * Permite que o Planner decida quando uma solicitação do usuário necessita
 * consultar a Biblioteca Oficial do MemoryOS.
 *
 * A Capability consulta o OfficialLibraryManager, SELECIONA apenas os documentos
 * relevantes para aquela solicitação (não envia toda a Biblioteca) e retorna
 * metadados + conteúdo completo dos documentos selecionados ao Context Builder.
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
 */
export const OFFICIAL_LIBRARY_KEYWORDS = [
  "biblioteca oficial",
  "official library",
  "documentos oficiais",
  "versao da biblioteca",
  "versão da biblioteca",
  "biblioteca carregada",
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
  "especificacao oficial",
  "especificação oficial",
  "documentacao oficial do memoryos",
  "documentação oficial do memoryos",
  "segundo o mv",
  "segundo o mps",
  "segundo o mas",
  "segundo o mes",
  "segundo a mas",
  "segundo a mes",
  "segundo a mv",
  "segundo a mps",
  "service layer",
  "capability layer",
  "core layer",
  "connector layer",
  "specialist layer",
  "memory layer",
  "auditoria completa",
  "audit architecture",
  "architecture auditor",
  "auditoria arquitetural",
  "auditoria do core",
  "auditoria do memoryos",
  "missao do memoryos",
  "missão do memoryos",
  "responsabilidade do core",
  "responsabilidade do specialist",
];

/**
 * Mapa de intenção → documento(s) a carregar.
 * Permite seleção granular — não envia toda a Biblioteca em todas as perguntas.
 */
const DOC_SELECTION_RULES = [
  {
    docs: ["MV-MemoryOS-Vision"],
    keywords: ["mv memoryos", "memoryos vision", "missao do memoryos", "missão do memoryos", "segundo o mv", "segundo a mv", "visao do memoryos", "visão do memoryos"],
  },
  {
    docs: ["MPS-MemoryOS-Product-Specification"],
    keywords: ["mps memoryos", "memoryos product", "segundo o mps", "segundo a mps", "produto do memoryos", "especificacao de produto", "especificação de produto"],
  },
  {
    docs: ["MAS-MemoryOS-Architecture-Specification"],
    keywords: ["mas memoryos", "memoryos architecture", "segundo o mas", "segundo a mas", "arquitetura do memoryos", "service layer", "capability layer", "core layer", "connector layer", "specialist layer", "memory layer", "responsabilidade do core", "responsabilidade do specialist", "qual documento define o service layer", "qual documento define o capability layer"],
  },
  {
    docs: ["MES-MemoryOS-Engineering-Specification"],
    keywords: ["mes memoryos", "memoryos engineering", "segundo o mes", "segundo a mes", "engenharia do memoryos", "como deve funcionar o capability layer", "interface oficial", "request response", "contrato oficial"],
  },
  {
    docs: ["Architecture-Auditor-Specialist"],
    keywords: ["architecture auditor", "auditoria completa", "auditoria do core", "auditoria do memoryos", "audit architecture", "auditoria arquitetural", "especialista de auditoria"],
  },
];

const FULL_LIBRARY_DOC_NAMES = [
  "MV-MemoryOS-Vision",
  "MPS-MemoryOS-Product-Specification",
  "MAS-MemoryOS-Architecture-Specification",
  "MES-MemoryOS-Engineering-Specification",
  "Architecture-Auditor-Specialist",
];

const AUDIT_KEYWORDS = ["auditoria completa", "auditoria do core", "auditoria do memoryos", "audit architecture", "auditoria arquitetural"];

/**
 * Normaliza texto para matching (sem acentos, lowercase).
 */
function normalize(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Seleciona quais documentos carregar com base na mensagem do usuário.
 * Retorna um array de nomes de documentos (sem conteúdo).
 * Auditoria completa → todos os documentos.
 * Caso contrário → apenas os documentos cujas keywords aparecem na mensagem.
 */
function selectDocuments(message) {
  const normalized = normalize(message);

  // Auditoria completa → carregar toda a Biblioteca
  if (AUDIT_KEYWORDS.some((kw) => normalized.includes(normalize(kw)))) {
    return FULL_LIBRARY_DOC_NAMES;
  }

  const selected = new Set();
  for (const rule of DOC_SELECTION_RULES) {
    const matched = rule.keywords.some((kw) => normalized.includes(normalize(kw)));
    if (matched) {
      rule.docs.forEach((d) => selected.add(d));
    }
  }

  // FIX (auditoria cognição — continuação do IA-064): a lista de keywords
  // acima exige frases específicas ("mas memoryos", "segundo o mas") que
  // ninguém digita naturalmente — uso real é "aderência ao MAS/MES",
  // "arquitetura MAS". O IA-064 já corrigiu capabilityDetector.js pra
  // ATIVAR a capacidade nesses casos, mas esta função (que decide QUAL
  // documento carregar) tinha o mesmo problema e ficou de fora — mesmo
  // com a capacidade ativa, nenhum documento real era selecionado, e o
  // conteúdo verdadeiro de MAS/MES continuava fora do prompt. Mesma
  // checagem case-sensitive na mensagem ORIGINAL (sigla em maiúsculas
  // distingue de "mas"/conjunção e "mes"/mês do calendário).
  const ACRONYM_DOC_MAP = {
    MV:  "MV-MemoryOS-Vision",
    MPS: "MPS-MemoryOS-Product-Specification",
    MAS: "MAS-MemoryOS-Architecture-Specification",
    MES: "MES-MemoryOS-Engineering-Specification",
  };
  for (const [acronym, doc] of Object.entries(ACRONYM_DOC_MAP)) {
    if (new RegExp(`\\b${acronym}\\b`).test(message)) {
      selected.add(doc);
    }
  }

  return Array.from(selected);
}

/**
 * Executa a consulta à Biblioteca Oficial.
 *
 * @param {string} message - Mensagem original do usuário (para seleção de documentos)
 * @returns {Object} { ready, version, docNames, docCount, selectedDocs }
 *   - selectedDocs: Array<{ name, content }> — documentos selecionados com conteúdo completo
 */
export async function executeOfficialLibraryQuery(message) {
  const ready = OfficialLibraryManager.isReady();
  const version = OfficialLibraryManager.version;
  const docNames = ready ? OfficialLibraryManager.getDocNames() : [];
  const docCount = docNames.length;

  // Seleciona documentos relevantes com base na intenção da mensagem
  const targetDocNames = ready ? selectDocuments(message) : [];

  const selectedDocs = [];
  for (const name of targetDocNames) {
    const content = OfficialLibraryManager.getDoc(name);
    if (content) {
      selectedDocs.push({ name, content });
    }
  }

  return {
    ready,
    version,
    docNames,
    docCount,
    selectedDocs,
  };
}
