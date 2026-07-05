/**
 * Architecture Auditor Specialist
 *
 * Primeiro Especialista Oficial do MemoryOS.
 *
 * Conforme MAS §4.3 e MES §18:
 * - Specialist apenas interpreta, analisa, compara e recomenda.
 * - NUNCA acessa filesystem, glob, path, diretórios ou arquivos.
 * - NUNCA gera relatórios (responsabilidade do ReportBuilder).
 * - Toda leitura ocorre EXCLUSIVAMENTE através das Capabilities oficiais.
 *
 * Interface oficial do Specialist (Correção 5):
 *   analyze()    → executa a auditoria e retorna o MACR
 *   advise()     → extrai recomendações do MACR
 *   confidence() → retorna o nível de confiança da auditoria
 *
 * Fluxo oficial (Correção 3):
 *   Usuário
 *     → Architecture Auditor (Specialist)
 *     → ProjectReaderCapability
 *     → OfficialLibraryReaderCapability
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

// === SCOPES SUPORTADOS (Correção 7) ===
export const AUDIT_LEVELS = ["file", "module", "project", "pr"];

/**
 * analyze() — Executa a auditoria através das Capabilities oficiais.
 *
 * @param {Object} options
 * @param {Object} options.scope - { level: 'file'|'module'|'project'|'pr', target? }
 * @param {Function} options.onStage - Callback de progresso
 * @returns {Object} { macr, metadata }
 */
export async function analyze({ scope, onStage } = {}) {
  const auditScope = scope && scope.level ? scope : { level: "project" };

  // === ETAPA 1: PROJECT READER CAPABILITY ===
  onStage?.("reading-project");
  const projectSources = await ProjectReaderCapability.execute({ scope: auditScope });

  // === ETAPA 2: OFFICIAL LIBRARY READER CAPABILITY ===
  onStage?.("reading-library");
  const officialLibrary = await OfficialLibraryReaderCapability.execute({});

  // === ETAPA 3: CODE ANALYZER CAPABILITY ===
  onStage?.("analyzing");
  const consolidated = await CodeAnalyzerCapability.execute({
    sources: projectSources,
    docs: officialLibrary,
    onStage,
  });

  // === ETAPA 4: REPORT BUILDER CAPABILITY ===
  onStage?.("building-report");
  const macr = await ReportBuilderCapability.execute({ analysis: consolidated });

  onStage?.("done");

  const metadata = {
    scope: auditScope,
    fileCount: projectSources.fileCount,
    docCount: officialLibrary.docCount,
    moduleCount: consolidated.moduleCount || 0,
    confidence: confidence(projectSources.fileCount, officialLibrary.docCount),
    timestamp: new Date().toISOString(),
  };

  return { macr, metadata };
}

/**
 * advise() — Extrai recomendações do MACR.
 * Conforme MES §18 (Interface Oficial dos Specialists).
 */
export function advise(macr) {
  if (!macr) return [];
  const fromViolations = (macr.violacoes || [])
    .map((v) => v.correcao_recomendada)
    .filter(Boolean);
  const fromImprovements = macr.melhorias_recomendadas || [];
  return [...new Set([...fromViolations, ...fromImprovements])];
}

/**
 * confidence() — Retorna o nível de confiança da auditoria.
 * Conforme MES §18 (Interface Oficial dos Specialists).
 *
 * Máximo 95% — auditoria automatizada não substitui revisão humana.
 */
export function confidence(sourceCount, docsCount) {
  const sourceFactor = Math.min(0.35, sourceCount * 0.015);
  const docsFactor = docsCount >= 5 ? 0.6 : docsCount * 0.12;
  return Math.min(0.95, docsFactor + sourceFactor);
}

export default {
  id: "architecture-auditor",
  name: "Architecture Auditor",
  description: "Audita o projeto contra a Biblioteca Oficial do MemoryOS",
  // Interface oficial (Correção 5) — apenas estes três métodos:
  analyze,
  advise,
  confidence,
  // Constantes expostas para UI/docs
  AUDIT_LEVELS,
};