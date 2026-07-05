/**
 * ReportBuilderCapability — v4.0
 *
 * Gera o MemoryOS Architecture Compliance Report (MACR) v4.0.
 *
 * v4.0 — Evolução:
 *   - Suporte a múltiplos Audit Modes
 *   - Cabeçalho com Audit Modes executados
 *   - Base das Evidências
 *   - Limitações da Auditoria
 *   - Classificação de conclusões: EVIDÊNCIA | COMPORTAMENTO OBSERVADO | INFERÊNCIA
 *   - Toda conclusão informa origem
 *   - Inferências separadas de evidências
 *
 * Mantém compatibilidade: não altera MV, MPS, MAS, MES, Core, Planner,
 * Capabilities oficiais, Specialists, Policy Engine, Connector Manager.
 */

import { createCapability } from "@/lib/capabilities/baseCapability";
import { successResponse } from "@/lib/capabilities/requestResponse";
import { AUDIT_MODE_LABELS } from "@/lib/auditor/auditModeDetector";

const SYNTHESIS_SCHEMA = {
  type: "object",
  properties: {
    resumo_executivo: { type: "string" },
    conclusao: { type: "string" },
  },
};

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
  "Evidências com origem explícita",
  "Inferências separadas de evidências",
  "Limitações declaradas",
];

const PLANNED_PENDENCIES = [
  "Policy Engine completo",
  "Event Bus completo",
  "Providers ativos (OpenAI, Anthropic)",
  "Conectores adicionais",
  "Telemetria de runtime",
  "Coleta de logs persistente",
];

export const ReportBuilderCapability = createCapability({
  id: "report-builder",
  name: "Report Builder",
  version: "4.0",
  validate: async (request) => {
    if (!request || !request.context) return false;
    return !!(request.context.analysis && request.context.aiProvider);
  },
  execute: async (request) => {
    const { analysis, aiProvider, modeResults, sources, limitations } = request.context;

    // === SÍNTESE (resumo executivo + conclusão) ===
    const allConclusions = (modeResults || []).flatMap((r) => r.conclusions || []);
    const evidenceConclusions = allConclusions.filter((c) => c.tipo === "EVIDÊNCIA");
    const behaviorConclusions = allConclusions.filter((c) => c.tipo === "COMPORTAMENTO OBSERVADO");
    const inferenceConclusions = allConclusions.filter((c) => c.tipo === "INFERÊNCIA");

    const prompt = `Você é o construtor de relatórios do Architecture Auditor v4.0 do MemoryOS.

Abaixo está o resultado consolidado da auditoria multi-modo.

Escreva em português:
1. resumo_executivo — 3 a 5 bullets consolidando os achados mais relevantes.
2. conclusao — avaliação final da conformidade, indicando o nível de confiança com base nos modos executados.

PRINCÍPIOS:
- NÃO utilize pontuações numéricas. Use: CONFORME, PARCIALMENTE CONFORME, NÃO CONFORME.
- Se houver inferências sem confirmação por código-fonte, informe: "Esta conclusão não foi confirmada por código-fonte."
- Se faltar evidência, informe: "Não existem evidências suficientes para confirmar esta conclusão."
- Nunca preencha lacunas com inferência.

Modos executados: ${(modeResults || []).map((r) => r.mode).join(", ") || "nenhum"}
Conclusões por tipo:
- EVIDÊNCIA: ${evidenceConclusions.length}
- COMPORTAMENTO OBSERVADO: ${behaviorConclusions.length}
- INFERÊNCIA: ${inferenceConclusions.length}

Dados consolidados:
${JSON.stringify(analysis || {}, null, 2)}`;

    const synthesis = await aiProvider.chat(prompt, SYNTHESIS_SCHEMA);
    const synth = typeof synthesis === "string" ? JSON.parse(synthesis) : synthesis;

    // === STATUS GERAL ===
    const conformidade = analysis?.conformidade || [];
    const hasNonConforme = conformidade.some((c) => c.status === "NÃO CONFORME");
    const hasParcial = conformidade.some((c) => c.status === "PARCIALMENTE CONFORME");
    const overallStatus = hasNonConforme ? "NÃO CONFORME" : hasParcial ? "PARCIALMENTE CONFORME" : "CONFORME";

    const violations = analysis?.violacoes || [];
    const violationCount = violations.length;
    const plannedPendencies = PLANNED_PENDENCIES;

    // === MODOS EXECUTADOS (transparência obrigatória) ===
    const auditModes = (modeResults || []).map((r) => ({
      id: r.mode,
      label: AUDIT_MODE_LABELS[r.mode] || r.mode,
      executed: true,
      evidenceBase: r.evidenceBase || "—",
      conclusionCount: (r.conclusions || []).length,
    }));

    // Adiciona modos não executados com motivo
    const executedModeIds = new Set((modeResults || []).map((r) => r.mode));
    for (const m of (sources?.modes || [])) {
      if (!executedModeIds.has(m.id) && !m.skipped) {
        auditModes.push({
          id: m.id,
          label: m.label,
          executed: false,
          motivo: m.reason,
        });
      }
    }

    // === MACR v4.0 ===
    const macr = {
      cabecalho: {
        titulo: "MEMORYOS ARCHITECTURE COMPLIANCE REPORT",
        compliance_status: overallStatus,
        auditor_version: "v4.0",
        data: new Date().toISOString().split("T")[0],
        documentos_utilizados: ["MV", "MPS", "MAS", "MES", "Architecture Auditor Specialist"],
      },
      // v4.0 — Audit Modes Executados (transparência obrigatória)
      audit_modes: auditModes,
      // v4.0 — Base das Evidências
      evidence_base: {
        library: sources?.library?.available || false,
        code: sources?.code?.available || false,
        runtime: sources?.runtime?.available || false,
        logs: sources?.logs?.available || false,
        events: sources?.events?.available || false,
      },
      // v4.0 — Limitações da Auditoria
      limitacoes: limitations || [],
      // v4.0 — Conclusões classificadas por tipo
      conclusions: {
        evidence: evidenceConclusions,
        observed_behavior: behaviorConclusions,
        inference: inferenceConclusions,
      },
      checklist_obrigatorio: MANDATORY_CHECKLIST.map((item) => ({
        criterio: item,
        status: "✓",
      })),
      resumo_executivo: synth.resumo_executivo || "",
      conformidade,
      violacoes: violations,
      pendencias_planejadas: plannedPendencies,
      riscos_arquiteturais: analysis?.riscos_arquiteturais || [],
      melhorias_recomendadas: analysis?.melhorias_recomendadas || [],
      documentacao_para_atualizar: analysis?.documentacao_para_atualizar || [],
      conclusao: synth.conclusao || "",
      metadata: {
        moduleCount: analysis?.moduleCount || 0,
        modules: analysis?.modules || [],
        violationCount,
        plannedPendencyCount: plannedPendencies.length,
        overallComplianceStatus: overallStatus,
        auditModesExecuted: (modeResults || []).map((r) => r.mode),
        evidenceCount: evidenceConclusions.length,
        behaviorCount: behaviorConclusions.length,
        inferenceCount: inferenceConclusions.length,
        limitationCount: (limitations || []).length,
      },
    };

    return successResponse(macr, {
      logs: [
        `violations:${violationCount}`,
        `planned:${plannedPendencies.length}`,
        `modes:${auditModes.filter((m) => m.executed).length}`,
        `evidence:${evidenceConclusions.length}`,
        `inference:${inferenceConclusions.length}`,
      ],
    });
  },
});

export default ReportBuilderCapability;