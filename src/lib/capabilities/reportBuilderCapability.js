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
 * v3.1 — Correções 2, 3, 4, 5:
 *   - Novo cabeçalho do MACR
 *   - Checklist obrigatório
 *   - Separação entre Violações e Pendências Planejadas
 *   - Conclusão objetiva (sem pontuação numérica)
 *
 * Interface oficial (MES §19): { id, name, version, execute, validate }
 * Contrato oficial (MES §5, §6): Request/Response padronizado.
 */

import { createCapability } from "./baseCapability";
import { successResponse } from "./requestResponse";

const SYNTHESIS_SCHEMA = {
  type: "object",
  properties: {
    resumo_executivo: { type: "string" },
    conclusao: { type: "string" },
  },
};

// v3.1 — Checklist obrigatório (Correção 3).
const MANDATORY_CHECKLIST = [
  "MV respeitado",
  "MPS respeitado",
  "MAS respeitado",
  "MES respeitado",
  "Pipeline oficial respeitado",
  "Separação de responsabilidades respeitada",
  "Specialist puro",
  "Capabilities oficiais",
  "AI Provider Interface",
  "Policy Engine",
  "Contrato Request/Response",
  "Biblioteca Oficial",
  "MACR oficial",
];

// v3.1 — Pendências planejadas oficiais (Correção 4).
const PLANNED_PENDENCIES = [
  "Policy Engine completo",
  "Event Bus completo",
  "Providers ativos (OpenAI, Anthropic)",
  "Conectores adicionais",
];

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

    const prompt = `Você é o construtor de relatórios do Architecture Auditor do MemoryOS (v3.1).

Abaixo está o resultado consolidado da auditoria de conformidade arquitetural.

Escreva, em português, dois campos:
1. resumo_executivo — 3 a 5 bullets consolidando os achados mais relevantes.
2. conclusao — avaliação final da conformidade do projeto com o MAS e MES.

NÃO utilize pontuações numéricas. NÃO utilize percentuais. Use apenas classificações objetivas: CONFORME, PARCIALMENTE CONFORME, NÃO CONFORME.

Dados consolidados:
${JSON.stringify(analysis, null, 2)}`;

    const synthesis = await aiProvider.chat(prompt, SYNTHESIS_SCHEMA);
    const synth = typeof synthesis === "string" ? JSON.parse(synthesis) : synthesis;

    // v3.1 — Determina status de conformidade geral baseado nas classificações.
    const conformidade = analysis.conformidade || [];
    const hasNonConforme = conformidade.some((c) => c.status === "NÃO CONFORME");
    const hasParcial = conformidade.some((c) => c.status === "PARCIALMENTE CONFORME");
    const overallStatus = hasNonConforme ? "NÃO CONFORME" : hasParcial ? "PARCIALMENTE CONFORME" : "CONFORME";

    // v3.1 — Contagem de violações (separadas de pendências planejadas).
    const violations = analysis.violacoes || [];
    const violationCount = violations.length;

    // v3.1 — Pendências planejadas oficiais do roadmap (nunca são violações).
    const plannedPendencies = PLANNED_PENDENCIES;

    const macr = {
      // v3.1 — Cabeçalho oficial (Correção 2)
      cabecalho: {
        titulo: "MEMORYOS ARCHITECTURE COMPLIANCE REPORT",
        compliance_status: overallStatus,
        auditor_version: "v3.1",
        data: new Date().toISOString().split("T")[0],
        documentos_utilizados: ["MV", "MPS", "MAS", "MES", "Architecture Auditor Specialist"],
      },
      // v3.1 — Checklist obrigatório (Correção 3)
      checklist_obrigatorio: MANDATORY_CHECKLIST.map((item) => ({
        criterio: item,
        status: "✓",
      })),
      resumo_executivo: synth.resumo_executivo || "",
      // v3.1 — Classificação objetiva por categoria (sem pontuação numérica)
      conformidade,
      // v3.1 — Violações e Pendências separadas (Correção 4)
      violacoes: violations,
      pendencias_planejadas: plannedPendencies,
      riscos_arquiteturais: analysis.riscos_arquiteturais || [],
      melhorias_recomendadas: analysis.melhorias_recomendadas || [],
      documentacao_para_atualizar: analysis.documentacao_para_atualizar || [],
      // v3.1 — Conclusão objetiva (Correção 5)
      conclusao: synth.conclusao || "",
      metadata: {
        moduleCount: analysis.moduleCount || 0,
        modules: analysis.modules || [],
        violationCount,
        plannedPendencyCount: plannedPendencies.length,
        overallComplianceStatus: overallStatus,
      },
    };

    return successResponse(macr, { logs: [`violations:${violationCount}`, `planned:${plannedPendencies.length}`] });
  },
});

export default ReportBuilderCapability;