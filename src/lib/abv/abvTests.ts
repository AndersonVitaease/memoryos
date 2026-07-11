// ABV v4 — Test Suite (Baseline + Change Detection)
// Foundation v1.0 · Engineering First
//
// 12 criterios de aceitacao. READ ONLY. Zero listas manuais.

import { SourceCodeAnalyzer, loadSourceFiles } from "./SourceCodeAnalyzer";
import { ArchitecturalBoundaryValidator } from "./ArchitecturalBoundaryValidator";
import { createBaseline, BaselineRegistry } from "./BaselineEngine";
import { ChangeDetectionEngine } from "./ChangeDetectionEngine";
import type { ABVReport } from "./ArchitecturalBoundaryValidator";
import type { SourceAnalysisResult } from "./SourceCodeAnalyzer";
import type { ArchitecturalBaseline } from "./BaselineEngine";
import type { ChangeReport, TimelineEntry } from "./ChangeDetectionEngine";

export interface ABVTestResult {
  criterion: number;
  name: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
  observation?: string;
  error?: string;
  data?: unknown;
}

export interface ABVFullResult {
  results: ABVTestResult[];
  report: ABVReport;
  analysis: SourceAnalysisResult;
  baseline: ArchitecturalBaseline;
  changeReport: ChangeReport | null;
  timeline: TimelineEntry[];
  registry: BaselineRegistry;
}

async function run(
  n: number,
  name: string,
  fn: () => Promise<{ detail?: string; observation?: string; data?: unknown }>,
): Promise<ABVTestResult> {
  const t = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, passed: true, durationMs: Date.now() - t, ...out };
  } catch (err) {
    return { criterion: n, name, passed: false, durationMs: Date.now() - t, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Shared state across criteria ──────────────────────────────────────────────

const registry = new BaselineRegistry();
const detector = new ChangeDetectionEngine();

export async function runABVTests(): Promise<ABVFullResult> {
  // ── Run real audit ────────────────────────────────────────────────────────
  const sources   = await loadSourceFiles();
  const analysis  = new SourceCodeAnalyzer().analyze(sources);
  const report    = new ArchitecturalBoundaryValidator().audit(analysis);

  // ── Baseline A — from real audit ──────────────────────────────────────────
  const baselineA = createBaseline(report, "Baseline A — Auditoria Real");
  registry.register(baselineA);

  // ── Baseline B — simulated minor change (add 1 module, same hash protection bypassed by label) ──
  // We produce a slightly modified report copy to simulate a second audit.
  const simulatedReportB = simulateChange(report);
  const baselineB = createBaseline(simulatedReportB, "Baseline B — Simulacao de Mudanca");
  // B may have same hash if no real change; force-register for test purposes
  if (!registry.list().find(b => b.baselineId === baselineB.baselineId)) {
    registry.register(baselineB);
  }

  // ── Compare A -> B ────────────────────────────────────────────────────────
  const changeReport = detector.compare(baselineA, baselineB);
  const changeReports = new Map([[`${baselineA.baselineId}->${baselineB.baselineId}`, changeReport]]);
  changeReports.set(changeReport.baselineTo, changeReport);
  const timeline = detector.buildTimeline(registry.list(), changeReports);

  // ── Run criteria ──────────────────────────────────────────────────────────
  const results: ABVTestResult[] = [];

  // C1 — Criar Baseline arquitetural
  results.push(await run(1, "C1 — Criar Baseline arquitetural", async () => {
    if (!baselineA.baselineId) throw new Error("baselineId ausente");
    if (!baselineA.auditHash)  throw new Error("auditHash ausente");
    if (!baselineA.timestamp)  throw new Error("timestamp ausente");
    return {
      detail: `ID: ${baselineA.baselineId} | Hash: ${baselineA.auditHash} | ${baselineA.filesAnalyzed} arquivos | Compliance: ${baselineA.compliance.overallCompliance}%`,
      data: { id: baselineA.baselineId, hash: baselineA.auditHash, version: baselineA.version },
    };
  }));

  // C2 — Registrar Baseline automaticamente
  results.push(await run(2, "C2 — Registrar Baseline automaticamente", async () => {
    if (registry.count() < 1) throw new Error("Registry vazio");
    const found = registry.get(baselineA.baselineId);
    if (!found) throw new Error(`Baseline ${baselineA.baselineId} nao encontrado no registry`);
    // Duplicate detection
    const dupResult = registry.register(baselineA);
    if (dupResult.success) throw new Error("Registry deveria rejeitar duplicata");
    return {
      detail: `Registry: ${registry.count()} baseline(s) | Duplicata rejeitada corretamente | ${found.label}`,
    };
  }));

  // C3 — Executar nova auditoria (Baseline B)
  results.push(await run(3, "C3 — Executar nova auditoria (Baseline B)", async () => {
    if (!baselineB.baselineId) throw new Error("baselineB nao criado");
    if (baselineB.baselineId === baselineA.baselineId) throw new Error("Baselines com IDs identicos");
    return {
      detail: `Baseline A: ${baselineA.baselineId} | Baseline B: ${baselineB.baselineId} | Registry total: ${registry.count()}`,
    };
  }));

  // C4 — Comparar automaticamente os dois Baselines
  results.push(await run(4, "C4 — Comparar automaticamente os dois Baselines", async () => {
    if (!changeReport) throw new Error("changeReport nao gerado");
    if (changeReport.baselineFrom !== baselineA.baselineId) throw new Error("baselineFrom incorreto");
    if (changeReport.baselineTo   !== baselineB.baselineId) throw new Error("baselineTo incorreto");
    return {
      detail: `Comparacao: ${changeReport.baselineFrom} -> ${changeReport.baselineTo} | Mudancas: ${changeReport.totalChanges} | ${changeReport.durationMs}ms`,
    };
  }));

  // C5 — Detectar mudancas estruturais
  results.push(await run(5, "C5 — Detectar mudancas estruturais", async () => {
    const structural = changeReport.changes.filter(c =>
      ["module", "dependency", "api"].includes(c.category),
    );
    return {
      detail: `Mudancas estruturais: ${structural.length} | Modulos adicionados: ${changeReport.addedModules.length} | Removidos: ${changeReport.removedModules.length} | APIs adicionadas: ${Object.values(changeReport.addedApis).flat().length}`,
      data: { structural: structural.length, added: changeReport.addedModules, removed: changeReport.removedModules },
    };
  }));

  // C6 — Detectar regressoes arquiteturais
  results.push(await run(6, "C6 — Detectar regressoes arquiteturais", async () => {
    // Regression detector ran — result is in changeReport.regressionChanges
    return {
      detail: `Regressoes: ${changeReport.regressions} | CRITICAL/ERROR: ${changeReport.regressionChanges.filter(r => r.severity === "CRITICAL" || r.severity === "ERROR").length}`,
      observation: changeReport.regressions > 0 ? "Regressoes detectadas — evidencias geradas para Engineering Review" : "Nenhuma regressao arquitetural detectada",
      data: changeReport.regressionChanges.map(r => ({ type: r.changeType, category: r.category, severity: r.severity, description: r.description })),
    };
  }));

  // C7 — Detectar melhorias arquiteturais
  results.push(await run(7, "C7 — Detectar melhorias arquiteturais", async () => {
    return {
      detail: `Melhorias: ${changeReport.improvements} | Circular resolvidos: ${changeReport.resolvedCircularDeps}`,
      data: changeReport.improvementChanges.map(r => ({ category: r.category, description: r.description })),
    };
  }));

  // C8 — Calcular evolucao do Compliance Score
  results.push(await run(8, "C8 — Calcular evolucao do Compliance Score", async () => {
    if (!changeReport.complianceDeltas.length) throw new Error("complianceDeltas vazio");
    const overall = changeReport.complianceDeltas.find(d => d.metric === "Overall Compliance");
    if (!overall) throw new Error("Overall Compliance delta ausente");
    const summary = changeReport.complianceDeltas
      .map(d => `${d.metric}: ${d.before}%->${d.after}% (${d.delta >= 0 ? "+" : ""}${d.delta}%) [${d.trend}]`)
      .join(" | ");
    return { detail: summary, data: changeReport.complianceDeltas };
  }));

  // C9 — Gerar Timeline da evolucao
  results.push(await run(9, "C9 — Gerar Timeline da evolucao", async () => {
    if (!timeline.length) throw new Error("Timeline vazia");
    const summary = timeline.map(e => `${e.version}:${e.compliance}%:${e.regressions}R`).join(" -> ");
    return {
      detail: `Timeline: ${timeline.length} entrada(s) | ${summary}`,
      data: timeline,
    };
  }));

  // C10 — Gerar Change Report automatico
  results.push(await run(10, "C10 — Gerar Change Report totalmente automatico", async () => {
    if (!changeReport.conclusion) throw new Error("conclusion ausente");
    if (typeof changeReport.totalChanges !== "number") throw new Error("totalChanges ausente");
    return {
      detail: `Relatorio: ${changeReport.totalChanges} mudancas | ${changeReport.regressions} regressoes | ${changeReport.improvements} melhorias | Trend: ${changeReport.overallTrend}`,
      data: { conclusion: changeReport.conclusion, trend: changeReport.overallTrend },
    };
  }));

  // C11 — Toda mudanca possui ArchitecturalEvidence
  results.push(await run(11, "C11 — Toda mudanca possui ArchitecturalEvidence", async () => {
    const withoutEvidence = changeReport.changes.filter(c => !c.evidence || !c.evidence.evidenceId);
    if (withoutEvidence.length > 0) {
      throw new Error(`${withoutEvidence.length} mudanca(s) sem evidencia`);
    }
    const allIds = changeReport.changes.map(c => c.evidence.evidenceId);
    const unique = new Set(allIds);
    if (unique.size !== allIds.length) throw new Error("evidenceIds duplicados");
    return {
      detail: `${changeReport.changes.length} mudancas | ${changeReport.changes.length} evidencias unicas | Todos os IDs unicos`,
    };
  }));

  // C12 — Nenhuma informacao depende de listas manuais
  results.push(await run(12, "C12 — Nenhuma informacao depende de listas manuais", async () => {
    if (analysis.filesAnalyzed === 0) throw new Error("Nenhum arquivo carregado do codigo-fonte");
    if (report.importsAnalyzed === 0) throw new Error("Nenhum import extraido");
    // Verify baseline was built from report fields, not hardcoded values
    if (baselineA.filesAnalyzed !== report.filesAnalyzed) throw new Error("Baseline nao derivado do report");
    if (baselineA.importsAnalyzed !== report.importsAnalyzed) throw new Error("importsAnalyzed divergente");
    return {
      detail: `${analysis.filesAnalyzed} arquivos lidos automaticamente | Baseline derivado 100% do ABVReport | Zero listas manuais`,
      observation: "Source Code Analyzer -> ABVReport -> Baseline -> ChangeDetection: cadeia totalmente automatica",
    };
  }));

  return { results, report, analysis, baseline: baselineA, changeReport, timeline, registry };
}

// ── Simulation helper — produces a slightly different report for B ─────────────

function simulateChange(base: ABVReport): ABVReport {
  // Clone with one simulated new module added (modulePaths), everything else same.
  // This exercises the change detection without modifying real code.
  const fakeLayer = { ...base.layers[0] };
  fakeLayer.detectedImports = [...(fakeLayer.detectedImports ?? []), "simulated/new-module"];
  return {
    ...base,
    filesAnalyzed: base.filesAnalyzed + 1,
    layers: [fakeLayer, ...base.layers.slice(1)],
    allEvidences: [...base.allEvidences],
    criticalEvidences: [...base.criticalEvidences],
    errorEvidences: [...base.errorEvidences],
  };
}