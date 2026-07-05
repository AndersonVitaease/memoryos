/**
 * Architecture Auditor Specialist
 *
 * Primeiro Especialista Oficial do MemoryOS.
 *
 * Conforme MAS §4.3 e MES §18:
 * - Specialist apenas interpreta, analisa, compara e recomenda.
 * - NUNCA acessa filesystem, glob, path, diretórios ou arquivos.
 * - NUNCA conhece Providers (recebe via injeção).
 * - NUNCA gera relatórios (responsabilidade do ReportBuilder).
 *
 * Interface oficial do Specialist (Correção 5):
 *   analyze()    → executa a auditoria e retorna o MACR
 *   advise()     → extrai recomendações do MACR
 *   confidence() → retorna o nível de confiança da auditoria
 *
 * Pipeline oficial (Correção 7):
 *   Usuário
 *     → Architecture Auditor (Specialist)
 *     → ProjectReaderCapability
 *     → OfficialLibraryReaderCapability
 *     → PolicyEngine
 *     → CodeAnalyzerCapability
 *     → ReportBuilderCapability
 *     → MACR
 *     → Usuário
 *
 * O Specialist NUNCA modifica código (Correção 9).
 */

import { ProjectReaderCapability } from "@/lib/capabilities/projectReaderCapability";
import { OfficialLibraryReaderCapability } from "@/lib/capabilities/officialLibraryReaderCapability";
import { CodeAnalyzerCapability } from "@/lib/capabilities/codeAnalyzerCapability";
import { ReportBuilderCapability } from "@/lib/capabilities/reportBuilderCapability";
import { PolicyEngine } from "@/lib/policies/policyEngine";
import { Base44Provider } from "@/lib/providers/base44Provider";
import { createRequest } from "@/lib/capabilities/requestResponse";
import { emit, AUDIT_EVENTS } from "@/lib/capabilities/eventEmitter";

export const AUDIT_LEVELS = ["file", "module", "project", "pr"];

// Versão oficial do Specialist (v3.1 — Estável)
export const VERSION = "3.1";

// AIProvider padrão — injetável para testes e futura troca de Provider.
const DEFAULT_PROVIDER = Base44Provider;

/**
 * analyze() — Executa a auditoria através das Capabilities oficiais.
 *
 * @param {Object} options
 * @param {Object} options.scope - { level: 'file'|'module'|'project'|'pr', target? }
 * @param {Object} options.aiProvider - Provider injetável (default: Base44Provider)
 * @param {Function} options.onStage - Callback de progresso
 * @returns {Object} { macr, metadata }
 */
export async function analyze({ scope, aiProvider, onStage } = {}) {
  const auditScope = scope && scope.level ? scope : { level: "project" };
  const provider = aiProvider || DEFAULT_PROVIDER;

  // === EVENTO: audit.started ===
  emit(AUDIT_EVENTS.STARTED, { scope: auditScope, providerId: provider.id });

  try {
    // === ETAPA 1: PROJECT READER CAPABILITY ===
    onStage?.("reading-project");
    const projectReq = createRequest({
      goal: "read-project-source",
      context: { scope: auditScope },
    });
    const projectResp = await ProjectReaderCapability.execute(projectReq);

    // === ETAPA 2: OFFICIAL LIBRARY READER CAPABILITY ===
    onStage?.("reading-library");
    const libraryReq = createRequest({ goal: "read-official-library" });
    const libraryResp = await OfficialLibraryReaderCapability.execute(libraryReq);

    // === ETAPA 3: POLICY ENGINE ===
    onStage?.("authorizing");
    const policyReq = createRequest({
      goal: "audit-authorization",
      context: {
        fileCount: projectResp.result.fileCount,
        docCount: libraryResp.result.docCount,
      },
    });
    const policyDecision = await PolicyEngine.authorize(policyReq);
    if (!policyDecision.allow) {
      throw new Error(`PolicyEngine negou a execução: ${policyDecision.reason || "sem motivo"}`);
    }

    // === ETAPA 4: CODE ANALYZER CAPABILITY ===
    onStage?.("analyzing");
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

    // === ETAPA 5: REPORT BUILDER CAPABILITY ===
    onStage?.("building-report");
    const reportReq = createRequest({
      goal: "build-macr",
      context: {
        analysis: analyzerResp.result,
        aiProvider: provider,
      },
    });
    const reportResp = await ReportBuilderCapability.execute(reportReq);

    onStage?.("done");

    // === EVENTO: audit.completed ===
    emit(AUDIT_EVENTS.COMPLETED, {
      scope: auditScope,
      fileCount: projectResp.result.fileCount,
      moduleCount: analyzerResp.result.moduleCount,
      violationCount: reportResp.result.metadata.violationCount,
    });

    const metadata = {
      scope: auditScope,
      fileCount: projectResp.result.fileCount,
      docCount: libraryResp.result.docCount,
      moduleCount: analyzerResp.result.moduleCount || 0,
      violationCount: reportResp.result.metadata.violationCount,
      providerId: provider.id,
      providerVersion: provider.version,
      policyDecision: policyDecision.reason,
      auditorVersion: VERSION,
      timestamp: new Date().toISOString(),
    };

    return { macr: reportResp.result, metadata };
  } catch (err) {
    // === EVENTO: audit.failed ===
    emit(AUDIT_EVENTS.FAILED, {
      scope: auditScope,
      error: err.message,
    });
    throw err;
  }
}

/**
 * advise() — Extrai recomendações do MACR.
 * Conforme MES §18 (Interface Oficial dos Specialists).
 */
export function advise(macr) {
  if (!macr) return [];
  const fromViolations = (macr.violacoes || []).map((v) => v.correcao_recomendada).filter(Boolean);
  const fromImprovements = macr.melhorias_recomendadas || [];
  return [...new Set([...fromViolations, ...fromImprovements])];
}

/**
 * confidence() — Retorna o nível de confiança da auditoria.
 * Conforme MES §18 (Interface Oficial dos Specialists).
 * v3.1 — Classificação objetiva (sem percentual):
 * ALTA | MÉDIA | BAIXA
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
  // Interface oficial (Correção 5) — apenas estes três métodos:
  analyze,
  advise,
  confidence,
  // Constantes expostas para UI/docs
  AUDIT_LEVELS,
};