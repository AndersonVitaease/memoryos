/**
 * Architecture Auditor Specialist — v4.0 (ESTÁVEL)
 *
 * Evolução final antes do congelamento definitivo.
 *
 * Novidades v4.0:
 *   1. Quatro modos oficiais: Specification, Behavioral, Code, Runtime
 *   2. Seleção automática de modo (AuditModeDetector)
 *   3. Transparência obrigatória (Audit Modes executados no início do MACR)
 *   4. Evidências obrigatórias (toda conclusão informa origem)
 *   5. Classificação: EVIDÊNCIA | COMPORTAMENTO OBSERVADO | INFERÊNCIA
 *   6. MACR revisado: Audit Modes → Evidence Base → Limitations → ...
 *   7. Honestidade: nunca preenche lacunas com inferência
 *
 * Compatibilidade (não altera):
 *   MV, MPS, MAS, MES, Official Library, Official Library Manager,
 *   Core, Planner, Capabilities oficiais, Specialists, Policy Engine, Connector Manager.
 *
 * Interface oficial do Specialist (preservada):
 *   analyze()    → executa a auditoria e retorna o MACR
 *   advise()     → extrai recomendações do MACR
 *   confidence() → retorna o nível de confiança da auditoria
 */

import { ProjectReaderCapability } from "@/lib/capabilities/projectReaderCapability";
import { OfficialLibraryReaderCapability } from "@/lib/capabilities/officialLibraryReaderCapability";
import { CodeAnalyzerCapability } from "@/lib/capabilities/codeAnalyzerCapability";
import { ReportBuilderCapability } from "@/lib/auditor/reportBuilderV4Capability";
import { PolicyEngine } from "@/lib/policies/policyEngine";
import { Base44Provider } from "@/lib/providers/base44Provider";
import { createRequest } from "@/lib/capabilities/requestResponse";
import { emit, AUDIT_EVENTS } from "@/lib/capabilities/eventEmitter";

import { detectAuditModes, AUDIT_MODES } from "@/lib/auditor/auditModeDetector";
import { SpecificationAuditCapability } from "@/lib/auditor/specificationAuditCapability";
import { BehavioralAuditCapability } from "@/lib/auditor/behavioralAuditCapability";
import { RuntimeAuditCapability } from "@/lib/auditor/runtimeAuditCapability";

export const AUDIT_LEVELS = ["file", "module", "project", "pr"];
export const VERSION = "4.0";
const DEFAULT_PROVIDER = Base44Provider;

/**
 * analyze() — Executa auditoria multi-modo com seleção automática.
 *
 * @param {Object} options
 * @param {Object} options.scope - { level, target? }
 * @param {Object} options.aiProvider - Provider injetável
 * @param {Function} options.onStage - Callback de progresso
 * @param {string[]} options.requestedModes - Modos explicitamente solicitados
 * @param {Object} options.runtimeData - Dados de runtime para Runtime Audit
 * @param {string} options.observedBehavior - Comportamento observado para Behavioral Audit
 * @returns {Object} { macr, metadata }
 */
export async function analyze({ scope, aiProvider, onStage, requestedModes, runtimeData, observedBehavior } = {}) {
  const auditScope = scope && scope.level ? scope : { level: "project" };
  const provider = aiProvider || DEFAULT_PROVIDER;

  emit(AUDIT_EVENTS.STARTED, { scope: auditScope, providerId: provider.id });

  try {
    // === ETAPA 1: PROJECT READER (para detectar disponibilidade de código) ===
    onStage?.("reading-project");
    let projectResp = null;
    try {
      const projectReq = createRequest({ goal: "read-project-source", context: { scope: auditScope } });
      projectResp = await ProjectReaderCapability.execute(projectReq);
    } catch {
      // Código indisponível — Code Audit será marcado como indisponível
    }

    // === ETAPA 2: OFFICIAL LIBRARY READER ===
    onStage?.("reading-library");
    const libraryReq = createRequest({ goal: "read-official-library" });
    const libraryResp = await OfficialLibraryReaderCapability.execute(libraryReq);

    // === ETAPA 3: POLICY ENGINE ===
    onStage?.("authorizing");
    const policyReq = createRequest({
      goal: "audit-authorization",
      context: {
        fileCount: projectResp?.result?.fileCount || 0,
        docCount: libraryResp.result.docCount,
      },
    });
    const policyDecision = await PolicyEngine.authorize(policyReq);
    if (!policyDecision.allow) {
      throw new Error(`PolicyEngine negou a execução: ${policyDecision.reason || "sem motivo"}`);
    }

    // === ETAPA 4: AUDIT MODE DETECTION (v4.0 — seleção automática) ===
    onStage?.("detecting-modes");
    const { modes, sources, limitations } = detectAuditModes({
      projectFiles: projectResp?.result,
      runtimeData,
      requestedModes,
    });

    // === ETAPA 5: EXECUTAR MODOS DISPONÍVEIS ===
    const modeResults = [];
    const docs = libraryResp.result;

    // 5a. SPECIFICATION AUDIT (se biblioteca disponível)
    if (modes.find((m) => m.id === AUDIT_MODES.SPECIFICATION && m.available && !m.skipped)) {
      onStage?.("specification-audit");
      try {
        const specReq = createRequest({
          goal: "specification-audit",
          context: { aiProvider: provider, docs },
        });
        const specResp = await SpecificationAuditCapability.execute(specReq);
        modeResults.push(specResp.result);
      } catch (err) {
        modeResults.push({
          mode: "specification",
          conclusions: [],
          evidenceBase: "Erro durante execução",
          error: err.message,
        });
      }
    }

    // 5b. BEHAVIORAL AUDIT (se biblioteca disponível)
    if (modes.find((m) => m.id === AUDIT_MODES.BEHAVIORAL && m.available && !m.skipped)) {
      onStage?.("behavioral-audit");
      try {
        const behReq = createRequest({
          goal: "behavioral-audit",
          context: { aiProvider: provider, docs, observedBehavior },
        });
        const behResp = await BehavioralAuditCapability.execute(behReq);
        modeResults.push(behResp.result);
      } catch (err) {
        modeResults.push({
          mode: "behavioral",
          conclusions: [],
          evidenceBase: "Erro durante execução",
          error: err.message,
        });
      }
    }

    // 5c. CODE AUDIT (se código disponível)
    if (modes.find((m) => m.id === AUDIT_MODES.CODE && m.available && !m.skipped)) {
      onStage?.("analyzing");
      try {
        const analyzerReq = createRequest({
          goal: "analyze-architecture-compliance",
          context: {
            sources: projectResp.result,
            docs: libraryResp.result,
            aiProvider: provider,
            onStage,
          },
        });
        const analyzerResp = await CodeAnalyzerCapability.execute(analyzerReq);
        // Code Audit produz análise consolidada (formato legado) — converte para conclusions
        const codeConclusions = [];
        for (const v of analyzerResp.result.violacoes || []) {
          codeConclusions.push({
            tipo: "EVIDÊNCIA",
            item: `Violação: ${v.impacto || "—"}`,
            status: "NÃO CONFORME",
            origem: `Arquivo: ${v.arquivo || "—"} · ${v.documento || "—"} ${v.secao || ""}`,
            detalhe: v.correcao_recomendada || "",
          });
        }
        for (const c of analyzerResp.result.conformidade || []) {
          codeConclusions.push({
            tipo: "EVIDÊNCIA",
            item: c.categoria,
            status: c.status,
            origem: "Análise de código-fonte",
            detalhe: c.comentario || "",
          });
        }
        modeResults.push({
          mode: "code",
          conclusions: codeConclusions,
          evidenceBase: `Código-fonte (${projectResp.result.fileCount} arquivos) + Biblioteca Oficial`,
          raw: analyzerResp.result,
        });
      } catch (err) {
        modeResults.push({
          mode: "code",
          conclusions: [],
          evidenceBase: "Erro durante execução",
          error: err.message,
        });
      }
    }

    // 5d. RUNTIME AUDIT (se runtime disponível)
    if (modes.find((m) => m.id === AUDIT_MODES.RUNTIME && m.available && !m.skipped)) {
      onStage?.("runtime-audit");
      try {
        const rtReq = createRequest({
          goal: "runtime-audit",
          context: { aiProvider: provider, docs, runtimeData },
        });
        const rtResp = await RuntimeAuditCapability.execute(rtReq);
        modeResults.push(rtResp.result);
      } catch (err) {
        modeResults.push({
          mode: "runtime",
          conclusions: [],
          evidenceBase: "Erro durante execução",
          error: err.message,
        });
      }
    }

    // === ETAPA 6: REPORT BUILDER (v4.0) ===
    onStage?.("building-report");
    const analysisData = modeResults.find((r) => r.mode === "code" && r.raw)?.raw || {};
    const reportReq = createRequest({
      goal: "build-macr",
      context: {
        analysis: analysisData,
        aiProvider: provider,
        modeResults,
        sources: { modes, ...sources },
        limitations,
      },
    });
    const reportResp = await ReportBuilderCapability.execute(reportReq);

    onStage?.("done");

    emit(AUDIT_EVENTS.COMPLETED, {
      scope: auditScope,
      fileCount: projectResp?.result?.fileCount || 0,
      moduleCount: analysisData.moduleCount || 0,
      violationCount: reportResp.result.metadata.violationCount,
      modesExecuted: modeResults.map((r) => r.mode),
    });

    const metadata = {
      scope: auditScope,
      fileCount: projectResp?.result?.fileCount || 0,
      docCount: libraryResp.result.docCount,
      moduleCount: analysisData.moduleCount || 0,
      violationCount: reportResp.result.metadata.violationCount,
      providerId: provider.id,
      providerVersion: provider.version,
      policyDecision: policyDecision.reason,
      auditorVersion: VERSION,
      timestamp: new Date().toISOString(),
      modesExecuted: modeResults.map((r) => r.mode),
      modesAvailable: modes.filter((m) => m.available).map((m) => m.id),
      limitations,
    };

    return { macr: reportResp.result, metadata };
  } catch (err) {
    emit(AUDIT_EVENTS.FAILED, { scope: auditScope, error: err.message });
    throw err;
  }
}

/**
 * advise() — Extrai recomendações do MACR.
 */
export function advise(macr) {
  if (!macr) return [];
  const fromViolations = (macr.violacoes || []).map((v) => v.correcao_recomendada).filter(Boolean);
  const fromImprovements = macr.melhorias_recomendadas || [];
  return [...new Set([...fromViolations, ...fromImprovements])];
}

/**
 * confidence() — Retorna o nível de confiança da auditoria.
 * v4.0 — Baseado nos modos executados e evidências disponíveis.
 */
export function confidence(sourceCount, docsCount) {
  if (docsCount >= 5 && sourceCount >= 10) return "ALTA";
  if (docsCount >= 3 && sourceCount >= 3) return "MÉDIA";
  return "BAIXA";
}

export default {
  id: "architecture-auditor",
  name: "Architecture Auditor",
  version: VERSION,
  analyze,
  advise,
  confidence,
  AUDIT_LEVELS,
  AUDIT_MODES,
};