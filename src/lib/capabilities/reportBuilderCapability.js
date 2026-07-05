/**
 * ReportBuilderCapability
 *
 * Única responsável por gerar o MemoryOS Architecture Compliance Report (MACR).
 *
 * Conforme MAS §4.4 e Correção 4:
 * - Recebe APENAS o resultado consolidado da análise (do CodeAnalyzer).
 * - NUNCA acessa código-fonte nem filesystem.
 * - NUNCA acessa a Biblioteca Oficial diretamente.
 *
 * Formato oficial do MACR (Correção 10):
 *   - Resultado Geral
 *   - Resumo Executivo
 *   - Pontuação por categoria
 *   - Violações (documento, seção, impacto, correção recomendada, prioridade)
 *   - Riscos arquiteturais
 *   - Dívida técnica
 *   - Melhorias recomendadas
 *   - Documentação que precisa ser atualizada
 *   - Conclusão
 */

import { createCapability } from "./baseCapability";
import { base44 } from "@/api/base44Client";

const SYNTHESIS_SCHEMA = {
  type: "object",
  properties: {
    resultado_geral: { type: "string" },
    resumo_executivo: { type: "string" },
    conclusao: { type: "string" },
  },
};

export const ReportBuilderCapability = createCapability({
  id: "report-builder",
  name: "Report Builder",
  validate: async (input) => {
    if (!input || !input.analysis) return false;
    return typeof input.analysis === "object";
  },
  execute: async (input) => {
    const { analysis } = input;

    // Síntese narrativa via LLM (uma única chamada) — apenas para os campos
    // que exigem linguagem natural. Dados estruturados são preservados do CodeAnalyzer.
    const prompt = `Você é o construtor de relatórios do Architecture Auditor do MemoryOS.

Abaixo está o resultado consolidado da auditoria de conformidade arquitetural.

Escreva, em português, três campos:
1. resultado_geral — parágrafo curto com o veredito da auditoria (aprovado / parcial / reprovado) e motivo.
2. resumo_executivo — 3 a 5 bullets consolidando os achados mais relevantes.
3. conclusao — avaliação final da conformidade do projeto com o MAS e MES.

Dados consolidados:
${JSON.stringify(analysis, null, 2)}`;

    const synthesis = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: SYNTHESIS_SCHEMA,
    });
    const synth = typeof synthesis === "string" ? JSON.parse(synthesis) : synthesis;

    // === MONTAGEM DO MACR OFICIAL ===
    return {
      resultado_geral: synth.resultado_geral || "",
      resumo_executivo: synth.resumo_executivo || "",
      pontuacao: analysis.pontuacao || [],
      violacoes: analysis.violacoes || [],
      riscos_arquiteturais: analysis.riscos_arquiteturais || [],
      divida_tecnica: analysis.divida_tecnica || [],
      melhorias_recomendadas: analysis.melhorias_recomendadas || [],
      documentacao_para_atualizar: analysis.documentacao_para_atualizar || [],
      conclusao: synth.conclusao || "",
      metadata: {
        moduleCount: analysis.moduleCount || 0,
        modules: analysis.modules || [],
        violationCount: (analysis.violacoes || []).length,
      },
    };
  },
});

export default ReportBuilderCapability;