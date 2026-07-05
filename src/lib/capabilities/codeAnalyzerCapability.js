/**
 * CodeAnalyzerCapability
 *
 * Responsável por:
 *   - dividir o projeto em módulos;
 *   - comparar código e documentação;
 *   - identificar violações;
 *   - consolidar resultados.
 *
 * Conforme MAS §4.4 e Correção 6:
 * - Pipeline escalável: Indexação → Divisão em módulos → Análise módulo por módulo → Consolidação.
 * - NUNCA gera relatórios (responsabilidade do ReportBuilder).
 * - NUNCA acessa filesystem (responsabilidade do ProjectReader).
 *
 * A análise é feita em lotes por módulo para suportar projetos grandes,
 * evitando estouro de contexto do LLM.
 */

import { createCapability } from "./baseCapability";
import { base44 } from "@/api/base44Client";

// === CATEGORIAS OFICIAIS DE AUDITORIA ===
export const AUDIT_CATEGORIES = [
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

// === SCHEMA DA ANÁLISE POR MÓDULO ===
const MODULE_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    modulo: { type: "string" },
    violacoes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          arquivo: { type: "string" },
          documento: { type: "string" },
          secao: { type: "string" },
          impacto: { type: "string" },
          prioridade: { type: "string", enum: ["crítica", "alta", "média", "baixa"] },
          correcao_recomendada: { type: "string" },
        },
      },
    },
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
    divida_tecnica: { type: "array", items: { type: "string" } },
    melhorias_recomendadas: { type: "array", items: { type: "string" } },
    documentacao_para_atualizar: { type: "array", items: { type: "string" } },
    riscos_arquiteturais: { type: "array", items: { type: "string" } },
  },
};

const MAX_CHARS_PER_BATCH = 35000;

/**
 * Divide os arquivos em módulos (agrupados por diretório de primeiro nível).
 */
function splitIntoModules(files) {
  const groups = {};
  for (const file of files) {
    const parts = file.path.split("/");
    const moduleName = parts.length > 1 ? parts.slice(0, 2).join("/") : parts[0];
    if (!groups[moduleName]) groups[moduleName] = [];
    groups[moduleName].push(file);
  }
  return Object.entries(groups).map(([moduleName, modFiles]) => ({
    name: moduleName,
    files: modFiles,
  }));
}

/**
 * Divide um módulo em lotes que respeitem o orçamento de caracteres.
 */
function batchModuleFiles(files) {
  const batches = [];
  let current = [];
  let currentSize = 0;
  for (const file of files) {
    if (currentSize + file.content.length > MAX_CHARS_PER_BATCH && current.length > 0) {
      batches.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(file);
    currentSize += file.content.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function buildModulePrompt(moduleName, batchFiles, docs) {
  const docsText = Object.entries(docs)
    .map(([name, content]) => `### ${name}\n\n${content}`)
    .join("\n\n---\n\n");

  const codeText = batchFiles
    .map((f) => `// === ${f.path} ===\n${f.content}`)
    .join("\n\n");

  return `Você é o módulo analisador do Architecture Auditor Specialist do MemoryOS.

## PRINCÍPIOS
1. A Biblioteca Oficial abaixo é a fonte da verdade.
2. Você NUNCA altera código — apenas identifica divergências.
3. Cada violação deve citar o documento oficial e a seção violados.
4. Seja objetivo e específico — aponte o arquivo e a divergência concreta.

## BIBLIOTECA OFICIAL
${docsText}

## MÓDULO: ${moduleName}

## CÓDIGO-FONTE
${codeText}

## INSTRUÇÕES
Analise ESTE módulo contra a Biblioteca Oficial.

Para cada categoria abaixo, atribua pontuação de 0 a 10:
${AUDIT_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Identifique violações com: arquivo, documento, seção, impacto, prioridade e correção recomendada.

Liste também: dívida técnica, melhorias recomendadas, documentação a atualizar e riscos arquiteturais detectados neste módulo.

Retorne JSON conforme o schema.`;
}

/**
 * Consolida resultados de múltiplos módulos em uma análise unificada.
 * Determinístico — sem LLM.
 */
function consolidate(moduleResults) {
  const consolidated = {
    violacoes: [],
    pontuacao: [],
    divida_tecnica: [],
    melhorias_recomendadas: [],
    documentacao_para_atualizar: [],
    riscos_arquiteturais: [],
    moduleCount: moduleResults.length,
    modules: moduleResults.map((m) => m.modulo),
  };

  // Acumula violações
  for (const result of moduleResults) {
    if (result.violacoes) {
      consolidated.violacoes.push(...result.violacoes);
    }
    if (result.divida_tecnica) consolidated.divida_tecnica.push(...result.divida_tecnica);
    if (result.melhorias_recomendadas) consolidated.melhorias_recomendadas.push(...result.melhorias_recomendadas);
    if (result.documentacao_para_atualizar) consolidated.documentacao_para_atualizar.push(...result.documentacao_para_atualizar);
    if (result.riscos_arquiteturais) consolidated.riscos_arquiteturais.push(...result.riscos_arquiteturais);
  }

  // Consolida pontuações por categoria (média)
  const scoreByCategory = {};
  for (const result of moduleResults) {
    if (!result.pontuacao) continue;
    for (const p of result.pontuacao) {
      if (!scoreByCategory[p.categoria]) {
        scoreByCategory[p.categoria] = { sum: 0, count: 0, comentarios: [] };
      }
      scoreByCategory[p.categoria].sum += p.pontuacao || 0;
      scoreByCategory[p.categoria].count += 1;
      if (p.comentario) scoreByCategory[p.categoria].comentarios.push(p.comentario);
    }
  }
  for (const [categoria, data] of Object.entries(scoreByCategory)) {
    consolidated.pontuacao.push({
      categoria,
      pontuacao: Math.round((data.sum / data.count) * 10) / 10,
      comentario: data.comentarios[0] || "",
    });
  }

  // Dedupe
  consolidated.divida_tecnica = [...new Set(consolidated.divida_tecnica)];
  consolidated.melhorias_recomendadas = [...new Set(consolidated.melhorias_recomendadas)];
  consolidated.documentacao_para_atualizar = [...new Set(consolidated.documentacao_para_atualizar)];
  consolidated.riscos_arquiteturais = [...new Set(consolidated.riscos_arquiteturais)];

  return consolidated;
}

export const CodeAnalyzerCapability = createCapability({
  id: "code-analyzer",
  name: "Code Analyzer",
  validate: async (input) => {
    if (!input || !input.sources || !input.docs) return false;
    return Array.isArray(input.sources.files) && typeof input.docs.docs === "object";
  },
  execute: async (input) => {
    const { sources, docs, onStage } = input;
    const docsMap = docs.docs;

    // === ETAPA 1: DIVISÃO EM MÓDULOS ===
    onStage?.("splitting");
    const modules = splitIntoModules(sources.files);

    // === ETAPA 2: ANÁLISE MÓDULO POR MÓDULO ===
    const moduleResults = [];
    for (const mod of modules) {
      const batches = batchModuleFiles(mod.files);
      for (let i = 0; i < batches.length; i++) {
        onStage?.(`analyzing:${mod.name}`);
        const prompt = buildModulePrompt(
          batches.length > 1 ? `${mod.name} (lote ${i + 1})` : mod.name,
          batches[i],
          docsMap
        );
        const result = await base44.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: MODULE_ANALYSIS_SCHEMA,
        });
        moduleResults.push(typeof result === "string" ? JSON.parse(result) : result);
      }
    }

    // === ETAPA 3: CONSOLIDAÇÃO ===
    onStage?.("consolidating");
    const consolidated = consolidate(moduleResults);
    return consolidated;
  },
});

export default CodeAnalyzerCapability;