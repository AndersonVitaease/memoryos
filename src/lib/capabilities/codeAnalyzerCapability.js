/**
 * CodeAnalyzerCapability
 *
 * Responsável por (MAS §4.4):
 *   - dividir o projeto em módulos;
 *   - comparar código e documentação;
 *   - identificar violações;
 *   - consolidar resultados.
 *
 * NUNCA gera relatórios (responsabilidade do ReportBuilder).
 * NUNCA acessa filesystem (responsabilidade do ProjectReader).
 * NUNCA conhece Base44 — recebe AIProvider via request.context.aiProvider.
 *
 * v3.1 — Correção 1: Removida pontuação numérica.
 *        Substituída por classificação objetiva: CONFORME | PARCIALMENTE CONFORME | NÃO CONFORME
 *
 * Interface oficial (MES §19): { id, name, version, execute, validate }
 * Contrato oficial (MES §5, §6): Request/Response padronizado.
 */

import { createCapability } from "./baseCapability";
import { successResponse } from "./requestResponse";

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

// v3.1 — Classificações objetivas substituem pontuação numérica.
export const COMPLIANCE_STATUS = {
  CONFORME: "CONFORME",
  PARCIALMENTE: "PARCIALMENTE CONFORME",
  NAO_CONFORME: "NÃO CONFORME",
};

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
    conformidade: {
      type: "array",
      items: {
        type: "object",
        properties: {
          categoria: { type: "string" },
          status: { type: "string", enum: ["CONFORME", "PARCIALMENTE CONFORME", "NÃO CONFORME"] },
          comentario: { type: "string" },
        },
      },
    },
    pendencias_planejadas: { type: "array", items: { type: "string" } },
    melhorias_recomendadas: { type: "array", items: { type: "string" } },
    documentacao_para_atualizar: { type: "array", items: { type: "string" } },
    riscos_arquiteturais: { type: "array", items: { type: "string" } },
  },
};

const MAX_CHARS_PER_BATCH = 35000;

function splitIntoModules(files) {
  const groups = {};
  for (const file of files) {
    const parts = file.path.split("/");
    const moduleName = parts.length > 1 ? parts.slice(0, 2).join("/") : parts[0];
    if (!groups[moduleName]) groups[moduleName] = [];
    groups[moduleName].push(file);
  }
  return Object.entries(groups).map(([name, files]) => ({ name, files }));
}

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
  const codeText = batchFiles.map((f) => `// === ${f.path} ===\n${f.content}`).join("\n\n");
  return `Você é o módulo analisador do Architecture Auditor Specialist do MemoryOS (v3.1).

## PRINCÍPIOS
1. A Biblioteca Oficial abaixo é a fonte da verdade.
2. Você NUNCA altera código — apenas identifica divergências.
3. Cada violação deve citar o documento oficial e a seção violados.
4. NÃO atribua pontuação numérica. Use classificação objetiva: CONFORME, PARCIALMENTE CONFORME ou NÃO CONFORME.

## BIBLIOTECA OFICIAL
${docsText}

## MÓDULO: ${moduleName}

## CÓDIGO-FONTE
${codeText}

## INSTRUÇÕES
Analise ESTE módulo contra a Biblioteca Oficial.

Para cada categoria abaixo, atribua UMA das três classificações objetivas (CONFORME / PARCIALMENTE CONFORME / NÃO CONFORME):
${AUDIT_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Identifique violações com: arquivo, documento, seção, impacto, prioridade e correção recomendada.
Liste também: pendências planejadas (itens do roadmap, NÃO violações), melhorias recomendadas, documentação a atualizar e riscos arquiteturais.

IMPORTANTE: Pendências planejadas (Policy Engine completo, Event Bus completo, Providers ativos, Conectores adicionais) NÃO são violações — devem ir em "pendencias_planejadas".

Retorne JSON conforme o schema.`;
}

function consolidate(moduleResults) {
  const consolidated = {
    violacoes: [],
    conformidade: [],
    pendencias_planejadas: [],
    melhorias_recomendadas: [],
    documentacao_para_atualizar: [],
    riscos_arquiteturais: [],
    moduleCount: moduleResults.length,
    modules: moduleResults.map((m) => m.modulo),
  };

  for (const result of moduleResults) {
    if (result.violacoes) consolidated.violacoes.push(...result.violacoes);
    if (result.pendencias_planejadas) consolidated.pendencias_planejadas.push(...result.pendencias_planejadas);
    if (result.melhorias_recomendadas) consolidated.melhorias_recomendadas.push(...result.melhorias_recomendadas);
    if (result.documentacao_para_atualizar) consolidated.documentacao_para_atualizar.push(...result.documentacao_para_atualizar);
    if (result.riscos_arquiteturais) consolidated.riscos_arquiteturais.push(...result.riscos_arquiteturais);
  }

  // v3.1 — Consolida classificação objetiva por categoria (sem pontuação numérica).
  const statusByCategory = {};
  for (const result of moduleResults) {
    if (!result.conformidade) continue;
    for (const c of result.conformidade) {
      if (!statusByCategory[c.categoria]) statusByCategory[c.categoria] = { statuses: [], comentarios: [] };
      statusByCategory[c.categoria].statuses.push(c.status);
      if (c.comentario) statusByCategory[c.categoria].comentarios.push(c.comentario);
    }
  }

  const STATUS_RANK = { "NÃO CONFORME": 0, "PARCIALMENTE CONFORME": 1, "CONFORME": 2 };
  for (const [categoria, data] of Object.entries(statusByCategory)) {
    // Pior status entre módulos determina o status consolidado
    const worst = data.statuses.reduce((min, s) => (STATUS_RANK[s] < STATUS_RANK[min] ? s : min), "CONFORME");
    consolidated.conformidade.push({
      categoria,
      status: worst,
      comentario: data.comentarios[0] || "",
    });
  }

  consolidated.pendencias_planejadas = [...new Set(consolidated.pendencias_planejadas)];
  consolidated.melhorias_recomendadas = [...new Set(consolidated.melhorias_recomendadas)];
  consolidated.documentacao_para_atualizar = [...new Set(consolidated.documentacao_para_atualizar)];
  consolidated.riscos_arquiteturais = [...new Set(consolidated.riscos_arquiteturais)];

  return consolidated;
}

export const CodeAnalyzerCapability = createCapability({
  id: "code-analyzer",
  name: "Code Analyzer",
  version: "1.0",
  validate: async (request) => {
    if (!request || !request.context) return false;
    return !!(request.context.sources && request.context.docs && request.context.aiProvider);
  },
  execute: async (request) => {
    const { sources, docs, aiProvider, onStage } = request.context;
    const docsMap = docs.docs;

    onStage?.("splitting");
    const modules = splitIntoModules(sources.files);

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
        const result = await aiProvider.chat(prompt, MODULE_ANALYSIS_SCHEMA);
        moduleResults.push(typeof result === "string" ? JSON.parse(result) : result);
      }
    }

    onStage?.("consolidating");
    const consolidated = consolidate(moduleResults);
    return successResponse(consolidated, {
      logs: [`modules_analyzed:${moduleResults.length}`],
    });
  },
});

export default CodeAnalyzerCapability;