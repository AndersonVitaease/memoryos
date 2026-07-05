/**
 * ReportBuilderCapability
 *
 * Única responsável por gerar o MemoryOS Architecture Compliance Report (MACR).
 *
 * Recebe APENAS o resultado consolidado da análise (do CodeAnalyzer).
 * NUNCA acessa código-fonte nem filesystem.
 * NUNCA acessa a Biblioteca Oficial diretamente.
 * NUNCA conhece Base44 — recebe AIProvider via request.context.aiProvider.
 *
 * Interface oficial (MES §19): { id, name, version, execute, validate }
 * Contrato oficial (MES §5, §6): Request/Response padronizado.
 */

import { createCapability } from "./baseCapability";
import { successResponse } from "./requestResponse";

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
  version: "1.0",
  validate: async (request) => {
    if (!request || !request.context) return false;
    return !!(request.context.analysis && request.context.aiProvider);
  },
  execute: async (request) => {
    const { analysis, aiProvider } = request.context;

    const prompt = `Você é o construtor de relatórios do Architecture Auditor do MemoryOS.

Abaixo está o resultado consolidado da auditoria de conformidade arquitetural.

Escreva, em português, três campos:
1. resultado_geral — parágrafo curto com o veredito da auditoria (aprovado / parcial / reprovado) e motivo.
2. resumo_executivo — 3 a 5 bullets consolidando os achados mais relevantes.
3. conclusao — avaliação final da conformidade do projeto com o MAS e MES.

Dados consolidados:
${JSON.stringify(analysis, null, 2)}`;

    const synthesis = await aiProvider.chat(prompt, SYNTHESIS_SCHEMA);
    const synth = typeof synthesis === "string" ? JSON.parse(synthesis) : synthesis;

    const macr = {
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

    return successResponse(macr, { logs: [`violations:${macr.metadata.violationCount}`] });
  },
});

export default ReportBuilderCapability;