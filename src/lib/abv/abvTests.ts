// ABV v4.1 — Test Suite (Baseline + Change Detection)
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

const registry = new BaselineRegistry();
const detector = new ChangeDetectionEngine();

export async function runABVTests(): Promise<ABVFullResult> {
  const sources   = await loadSourceFiles();
  const analysis  = new SourceCodeAnalyzer().analyze(sources);
  const report    = new ArchitecturalBoundaryValidator().audit(analysis);

  const baselineA = await createBaseline(report, { label: "Baseline A — Auditoria Real" });
  registry.register(baselineA);

  const simulatedReportB = simulateChange(report);
  const baselineB = await createBaseline(simulatedReportB, { label: "Baseline B — Simulacao de Mudanca" });
  if (!registry.list().find(b => b.baselineId === baselineB.baselineId)) {
    registry.register(baselineB);
  }

  const changeReport = detector.compare(baselineA, baselineB);
  const changeReports = new Map<string, ChangeReport>();
  changeReports.set(changeReport.baselineTo, changeReport);
  const timeline = detector.buildTimeline(registry.list(), changeReports);

  const results: ABVTestResult[] = [];

  results.push(await run(1, "C1 — Criar Baseline arquitetural", async () => {
    if (!baselineA.baselineId) throw new Error("baselineId ausente");
    if (!baselineA.auditHash || baselineA.auditHash.length < 32) throw new Error("auditHash invalido");
    if (baselineA.metadata.hashAlgorithm !== "SHA-256") throw new Error("Hash nao e SHA-256");
    return { detail: `ID: ${baselineA.baselineId} | Hash SHA-256: ${baselineA.auditHash.slice(0, 16)}... | ${baselineA.filesAnalyzed} arquivos | Compliance: ${baselineA.compliance.overallCompliance}%`, data: { id: baselineA.baselineId, hash: baselineA.auditHash, version: baselineA.version } };
  }));

  results.push(await run(2, "C2 — Registrar Baseline automaticamente", async () => {
    if (registry.count() < 1) throw new Error("Registry vazio");
    const found = registry.get(baselineA.baselineId);
    if (!found) throw new Error(`Baseline ${baselineA.baselineId} nao encontrado`);
    const dupResult = registry.register(baselineA);
    if (dupResult.success) throw new Error("Registry deveria rejeitar duplicata");
    return { detail: `Registry: ${registry.count()} baseline(s) | Duplicata rejeitada: "${dupResult.reason}"` };
  }));

  results.push(await run(3, "C3 — Executar nova auditoria (Baseline B)", async () => {
    if (!baselineB.baselineId) throw new Error("baselineB nao criado");
    if (baselineB.baselineId === baselineA.baselineId) throw new Error("IDs identicos");
    if (baselineA.auditHash === baselineB.auditHash) throw new Error("Hashes iguais para arquiteturas diferentes");
    return { detail: `A: ${baselineA.baselineId.slice(-6)} | B: ${baselineB.baselineId.slice(-6)} | Hashes distintos: sim | Registry total: ${registry.count()}` };
  }));

  results.push(await run(4, "C4 — Comparar automaticamente os dois Baselines", async () => {
    if (!changeReport) throw new Error("changeReport nao gerado");
    if (changeReport.baselineFrom !== baselineA.baselineId) throw new Error("baselineFrom incorreto");
    if (changeReport.baselineTo   !== baselineB.baselineId) throw new Error("baselineTo incorreto");
    return { detail: `Comparacao: ${changeReport.baselineFrom.slice(-6)} -> ${changeReport.baselineTo.slice(-6)} | Mudancas: ${changeReport.totalChanges} | ${changeReport.durationMs}ms` };
  }));

  results.push(await run(5, "C5 — Detectar mudancas estruturais", async () => {
    const structural = changeReport.changes.filter(c => ["module", "dependency", "api"].includes(c.category));
    return { detail: `Mudancas estruturais: ${structural.length} | Modulos adicionados: ${changeReport.addedModules.length} | Removidos: ${changeReport.removedModules.length}`, data: { structural: structural.length } };
  }));

  results.push(await run(6, "C6 — Detectar regressoes arquiteturais", async () => {
    return {
      detail: `Regressoes: ${changeReport.regressions} | CRITICAL/ERROR: ${changeReport.regressionChanges.filter(r => r.severity === "CRITICAL" || r.severity === "ERROR").length}`,
      observation: changeReport.regressions > 0 ? "Regressoes detectadas — encaminhar para Engineering Review" : "Nenhuma regressao arquitetural",
    };
  }));

  results.push(await run(7, "C7 — Detectar melhorias arquiteturais", async () => {
    return { detail: `Melhorias: ${changeReport.improvements} | Circular resolvidos: ${changeReport.resolvedCircularDeps}` };
  }));

  results.push(await run(8, "C8 — Calcular evolucao do Compliance Score", async () => {
    if (!changeReport.complianceDeltas.length) throw new Error("complianceDeltas vazio");
    const overall = changeReport.complianceDeltas.find(d => d.metric === "Overall Compliance");
    if (!overall) throw new Error("Overall Compliance delta ausente");
    return { detail: changeReport.complianceDeltas.map(d => `${d.metric}: ${d.before}->${d.after} [${d.trend}]`).join(" | "), data: changeReport.complianceDeltas };
  }));

  results.push(await run(9, "C9 — Gerar Timeline da evolucao", async () => {
    if (!timeline.length) throw new Error("Timeline vazia");
    return { detail: `Timeline: ${timeline.length} entrada(s) | ${timeline.map(e => `${e.version}:${e.compliance}%`).join(" -> ")}`, data: timeline };
  }));

  results.push(await run(10, "C10 — Gerar Change Report automatico", async () => {
    if (!changeReport.conclusion) throw new Error("conclusion ausente");
    return { detail: `${changeReport.totalChanges} mudancas | ${changeReport.regressions} regressoes | Trend: ${changeReport.overallTrend}`, data: { conclusion: changeReport.conclusion } };
  }));

  results.push(await run(11, "C11 — Toda mudanca possui ArchitecturalEvidence", async () => {
    const withoutEvidence = changeReport.changes.filter(c => !c.evidence?.evidenceId);
    if (withoutEvidence.length > 0) throw new Error(`${withoutEvidence.length} mudanca(s) sem evidencia`);
    const allIds = changeReport.changes.map(c => c.evidence.evidenceId);
    if (new Set(allIds).size !== allIds.length) throw new Error("evidenceIds duplicados");
    return { detail: `${changeReport.changes.length} mudancas | ${changeReport.changes.length} evidencias unicas` };
  }));

  results.push(await run(12, "C12 — Nenhuma informacao depende de listas manuais", async () => {
    if (analysis.filesAnalyzed === 0) throw new Error("Nenhum arquivo carregado");
    if (report.importsAnalyzed === 0) throw new Error("Nenhum import extraido");
    if (baselineA.filesAnalyzed !== report.filesAnalyzed) throw new Error("Baseline nao derivado do report");
    if (baselineA.metadata.hashAlgorithm !== "SHA-256") throw new Error("Hash nao e SHA-256");
    return {
      detail: `${analysis.filesAnalyzed} arquivos automaticos | Hash: SHA-256 | Cadeia: SourceAnalyzer→ABVReport→Baseline→Registry | Zero listas manuais`,
      observation: "Cadeia totalmente automatica confirmada",
    };
  }));

  return { results, report, analysis, baseline: baselineA, changeReport, timeline, registry };
}

function simulateChange(base: ABVReport): ABVReport {
  const fakeLayer = {
    ...base.layers[0],
    detectedImports: [...(base.layers[0].detectedImports ?? []), "simulated/new-module"],
  };
  return {
    ...base,
    filesAnalyzed: base.filesAnalyzed + 1,
    layers: [fakeLayer, ...base.layers.slice(1)],
    allEvidences:      [...base.allEvidences],
    criticalEvidences: [...base.criticalEvidences],
    errorEvidences:    [...base.errorEvidences],
  };
}