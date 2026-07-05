/**
 * Architecture Auditor Specialist
 *
 * Primeiro Especialista Oficial do MemoryOS.
 * Audita o projeto contra a Biblioteca Oficial (docs/00-official-library/).
 *
 * Conforme MAS §4.3 e MES §18:
 * - Specialists fornecem conhecimento, nunca executam integrações.
 * - Interface oficial: analyze(), advise(), confidence().
 *
 * O Architecture Auditor nunca altera código.
 * Apenas analisa e produz recomendações (MACR).
 */

import { base44 } from "@/api/base44Client";

// === BIBLIOTECA OFICIAL (carregada em build via Vite ?raw) ===
const DOC_MODULES = import.meta.glob("/src/docs/00-official-library/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

const DOC_ORDER = [
  "MV-MemoryOS-Vision",
  "MPS-MemoryOS-Product-Specification",
  "MAS-MemoryOS-Architecture-Specification",
  "MES-MemoryOS-Engineering-Specification",
  "Architecture-Auditor-Specialist",
];

// === CÓDIGO-FONTE DO PROJETO (carregado em build via Vite ?raw) ===
const SOURCE_MODULES = import.meta.glob(["/src/lib/**/*.js", "/src/App.jsx"], {
  query: "?raw",
  import: "default",
  eager: true,
});

const MAX_SOURCE_CHARS = 80000;

// === CATEGORIAS DE AUDITORIA ===
const AUDIT_CATEGORIES = [
  "Separação de Responsabilidades (MAS §3, §6)",
  "Independência do Core (MAS §4.1, MES §2.5)",
  "Service Layer (MAS §4.5)",
  "Connector Manager (MAS §4.8)",
  "Specialists (MAS §4.3)",
  "Capability Layer (MAS §4.4)",
  "Memory Layer (MAS §4.2)",
  "Observabilidade & Eventos (MES §21, §22)",
  "Segurança & Privacidade (MES §24)",
  "Engineering Standards (MES §2)",
];

// === SCHEMA DO MACR ===
const MACR_SCHEMA = {
  type: "object",
  properties: {
    resultado_geral: { type: "string", description: "Resumo executivo da auditoria" },
    pontuacao: {
      type: "array",
      items: {
        type: "object",
        properties: {
          categoria: { type: "string" },
          pontuacao: { type: "number" },
          comentario: { type: "string" },
        },
      },
    },
    violacoes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          documento: { type: "string", description: "Documento oficial violado (ex: MAS, MES)" },
          secao: { type: "string", description: "Seção violada (ex: §4.1)" },
          descricao: { type: "string" },
          severidade: { type: "string", enum: ["crítica", "alta", "média", "baixa"] },
          correcao_recomendada: { type: "string" },
        },
      },
    },
    divida_tecnica: { type: "array", items: { type: "string" } },
    melhorias_sugeridas: { type: "array", items: { type: "string" } },
    conclusao_final: { type: "string" },
  },
};

/**
 * Carrega a Biblioteca Oficial.
 * @returns {Object} { docName: content }
 */
export function loadOfficialLibrary() {
  const docs = {};
  for (const name of DOC_ORDER) {
    const key = `/src/docs/00-official-library/${name}.md`;
    if (DOC_MODULES[key]) {
      docs[name] = DOC_MODULES[key];
    }
  }
  return docs;
}

/**
 * Coleta o código-fonte do projeto para análise.
 * Trunca se exceder MAX_SOURCE_CHARS.
 * @returns {Array} [{ path, content }]
 */
export function collectProjectSource() {
  const entries = Object.entries(SOURCE_MODULES)
    .map(([path, content]) => ({
      path: path.replace("/src/", ""),
      content,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  let total = 0;
  const result = [];
  for (const entry of entries) {
    if (total + entry.content.length > MAX_SOURCE_CHARS) {
      const remaining = MAX_SOURCE_CHARS - total;
      if (remaining > 500) {
        result.push({
          ...entry,
          content: entry.content.substring(0, remaining) + "\n// ... [truncado]",
        });
      }
      break;
    }
    result.push(entry);
    total += entry.content.length;
  }
  return result;
}

/**
 * Monta o prompt de auditoria.
 */
function buildAuditPrompt(docs, sources) {
  const docsText = DOC_ORDER.filter((name) => docs[name])
    .map((name) => `### ${name}\n\n${docs[name]}`)
    .join("\n\n---\n\n");

  const sourceText = sources
    .map((s) => `// === ${s.path} ===\n${s.content}`)
    .join("\n\n");

  return `Você é o Architecture Auditor Specialist — o primeiro Especialista Oficial do MemoryOS.

Sua missão é auditar a implementação atual do projeto MemoryOS contra a Biblioteca Oficial.

## PRINCÍPIOS

1. A Biblioteca Oficial é a fonte da verdade. O código deve conformar-se a ela — não o contrário.
2. Você nunca altera código. Apenas identifica divergências e recomenda correções.
3. Cada violação deve citar o documento oficial e a seção violados.
4. Seja objetivo e específico. Não generalize — aponte o arquivo e a linha de raciocínio.

## BIBLIOTECA OFICIAL (FONTE DA VERDADE)

${docsText}

## CÓDIGO-FONTE DO PROJETO

${sourceText}

## INSTRUÇÕES DE AUDITORIA

Analise cada arquivo de código contra os documentos oficiais.

Para cada categoria abaixo, atribua uma pontuação de 0 a 10:
${AUDIT_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Identifique violações específicas, citando:
- O documento oficial violado (ex: "MAS", "MES")
- A seção violada (ex: "§4.1", "§3.1")
- A descrição da divergência
- A severidade: "crítica", "alta", "média" ou "baixa"
- A correção recomendada

Liste também:
- Dívida técnica identificada
- Melhorias sugeridas (não obrigatórias, mas recomendadas)

Por fim, escreva uma conclusão final com a avaliação geral da conformidade do projeto.

Retorne o resultado como um MemoryOS Architecture Compliance Report (MACR) no formato JSON especificado.`;
}

/**
 * analyze() — Executa a auditoria.
 *
 * Conforme MES §18 (Interface Oficial dos Specialists).
 *
 * @param {Object} params
 * @param {Object} params.docs - Biblioteca Oficial carregada
 * @param {Array} params.sources - Código-fonte coletado
 * @returns {Object} MACR (MemoryOS Architecture Compliance Report)
 */
export async function analyze({ docs, sources }) {
  const prompt = buildAuditPrompt(docs, sources);
  const result = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: MACR_SCHEMA,
  });
  return typeof result === "string" ? JSON.parse(result) : result;
}

/**
 * advise() — Extrai recomendações do MACR.
 * Conforme MES §18 (Interface Oficial dos Specialists).
 */
export function advise(macr) {
  if (!macr?.violacoes) return [];
  return macr.violacoes.map((v) => v.correcao_recomendada).filter(Boolean);
}

/**
 * confidence() — Retorna o nível de confiança da auditoria.
 * Conforme MES §18 (Interface Oficial dos Specialists).
 *
 * Máximo 95% — a auditoria automatizada não substitui revisão humana.
 */
export function confidence(sourceCount, docsCount) {
  const sourceFactor = Math.min(0.35, sourceCount * 0.015);
  const docsFactor = docsCount >= 5 ? 0.6 : docsCount * 0.12;
  return Math.min(0.95, docsFactor + sourceFactor);
}

/**
 * runAudit() — Ponto de entrada principal.
 *
 * Carrega a Biblioteca Oficial, coleta o código-fonte, executa a auditoria
 * e retorna o MACR completo com metadados.
 *
 * @param {Function} onStage - Callback de progresso (stage: string)
 * @returns {Object} { macr, metadata }
 */
export async function runAudit(onStage) {
  onStage?.("loading");
  const docs = loadOfficialLibrary();
  const docsCount = Object.keys(docs).length;

  onStage?.("collecting");
  const sources = collectProjectSource();
  const sourceCount = sources.length;

  onStage?.("analyzing");
  const macr = await analyze({ docs, sources });

  onStage?.("done");

  return {
    macr,
    metadata: {
      docsLoaded: docsCount,
      sourceFilesAnalyzed: sourceCount,
      confidence: confidence(sourceCount, docsCount),
      timestamp: new Date().toISOString(),
    },
  };
}

export default {
  id: "architecture-auditor",
  name: "Architecture Auditor",
  description: "Audita o projeto contra a Biblioteca Oficial do MemoryOS",
  loadOfficialLibrary,
  collectProjectSource,
  analyze,
  advise,
  confidence,
  runAudit,
  AUDIT_CATEGORIES,
};