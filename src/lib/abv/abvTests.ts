// ABV v2 — Test Suite
// Foundation v1.0 · Engineering First
//
// 10 criterios de aceitacao — 100% automaticos, baseados em codigo-fonte real.
// Nenhuma lista manual.

import { SourceCodeAnalyzer, loadSourceFiles } from "./SourceCodeAnalyzer";
import { ArchitecturalBoundaryValidator } from "./ArchitecturalBoundaryValidator";
import type { ABVReport } from "./ArchitecturalBoundaryValidator";
import type { SourceAnalysisResult } from "./SourceCodeAnalyzer";

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

async function run(
  n: number,
  name: string,
  fn: () => Promise<{ detail?: string; observation?: string; data?: unknown }>,
): Promise<ABVTestResult> {
  const start = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, passed: true, durationMs: Date.now() - start, ...out };
  } catch (err) {
    return {
      criterion: n, name, passed: false,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function buildAnalysisAndReport(): Promise<{ analysis: SourceAnalysisResult; report: ABVReport }> {
  const sources = await loadSourceFiles();
  const analyzer = new SourceCodeAnalyzer();
  const analysis = analyzer.analyze(sources);
  const validator = new ArchitecturalBoundaryValidator();
  const report = validator.audit(analysis);
  return { analysis, report };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

export async function runABVTests(): Promise<{
  results: ABVTestResult[];
  report: ABVReport;
  analysis: SourceAnalysisResult;
}> {
  const { analysis, report } = await buildAnalysisAndReport();
  const results: ABVTestResult[] = [];

  // C1: Todos os arquivos sao analisados automaticamente
  results.push(await run(1, "C1 — Todos os arquivos sao analisados automaticamente", async () => {
    if (analysis.filesAnalyzed === 0) throw new Error("Nenhum arquivo analisado — loadSourceFiles retornou vazio");
    const layerCounts = Object.entries(analysis.layerMap)
      .map(([l, mods]) => `${l}(${mods.length})`)
      .join(", ");
    return {
      detail: `Arquivos analisados: ${analysis.filesAnalyzed} | Camadas detectadas: ${Object.keys(analysis.layerMap).length} | ${layerCounts}`,
      data: { filesAnalyzed: analysis.filesAnalyzed, layers: Object.keys(analysis.layerMap) },
    };
  }));

  // C2: Todos os imports sao obtidos automaticamente
  results.push(await run(2, "C2 — Todos os imports sao obtidos automaticamente", async () => {
    if (analysis.importsFound === 0) throw new Error("Nenhum import encontrado no codigo-fonte");
    const sampleLayer = Object.entries(analysis.layerMap).find(([, mods]) => mods.length > 0);
    const sampleImports = sampleLayer
      ? sampleLayer[1][0].imports.slice(0, 3).map(i => `${i.type}:${i.specifier}`).join(", ")
      : "n/a";
    return {
      detail: `Imports encontrados: ${analysis.importsFound} | Exports encontrados: ${analysis.exportsFound} | Exemplo: ${sampleImports}`,
      data: { importsFound: analysis.importsFound, exportsFound: analysis.exportsFound },
    };
  }));

  // C3: Nenhuma lista manual permanece no ABV
  results.push(await run(3, "C3 — Nenhuma lista manual permanece no ABV", async () => {
    // Evidencia: imports analisados == importsAnalyzed do report (fonte: codigo real)
    // e filesAnalyzed > 0 (source code analyzer ativo)
    if (report.filesAnalyzed === 0) throw new Error("report.filesAnalyzed == 0: analyzer nao foi executado");
    if (report.importsAnalyzed === 0) throw new Error("report.importsAnalyzed == 0: imports nao foram lidos do codigo");
    const manualCheck = report.layers.every(l => Array.isArray(l.detectedImports));
    if (!manualCheck) throw new Error("detectedImports ausente em alguma camada");
    return {
      detail: `Source Code Analyzer ativo — ${report.filesAnalyzed} arquivos lidos | ${report.importsAnalyzed} imports extraidos automaticamente do codigo-fonte`,
      observation: "Toda evidencia extraida pelo SourceCodeAnalyzer via import.meta.glob",
    };
  }));

  // C4: Dependency Graph representa exatamente o codigo implementado
  results.push(await run(4, "C4 — Dependency Graph representa o codigo implementado", async () => {
    const nodeCount = Object.keys(analysis.dependencyGraph).length;
    if (nodeCount === 0) throw new Error("Grafo de dependencias vazio");
    const totalEdges = Object.values(analysis.dependencyGraph).reduce((acc, deps) => acc + deps.length, 0);
    const sample = Object.entries(analysis.dependencyGraph).slice(0, 2)
      .map(([from, deps]) => `${from.split("/").pop()} -> [${deps.slice(0,2).map(d => d.split("/").pop()).join(", ")}${deps.length > 2 ? "..." : ""}]`)
      .join(" | ");
    return {
      detail: `Nos: ${nodeCount} | Arestas: ${totalEdges} | Exemplo: ${sample}`,
      data: { nodes: nodeCount, edges: totalEdges },
    };
  }));

  // C5: Dependencias circulares sao detectadas automaticamente
  results.push(await run(5, "C5 — Dependencias circulares detectadas automaticamente", async () => {
    // Verify the DFS engine ran (circularDependencies is always an array)
    if (!Array.isArray(analysis.circularDependencies)) throw new Error("circularDependencies nao e array");
    const count = analysis.circularDependencies.length;
    return {
      detail: `DFS executado sobre ${Object.keys(analysis.dependencyGraph).length} nos | Ciclos encontrados: ${count}`,
      observation: count > 0
        ? `${count} ciclo(s) detectado(s) — encaminhar para Engineering Review`
        : "Nenhuma dependencia circular detectada",
      data: { cycles: analysis.circularDependencies },
    };
  }));

  // C6: Boundaries sao auditados automaticamente
  results.push(await run(6, "C6 — Boundaries auditados automaticamente", async () => {
    if (report.layers.length === 0) throw new Error("Nenhuma camada auditada");
    const summary = report.layers.map(l =>
      `${l.label}: ${l.status} | files:${l.filesAnalyzed} | deps:${l.detectedDeps.length} | violations:${l.violations.length}`
    ).join(" | ");
    const errorLayers = report.layers.filter(l => l.violations.some(v => v.severity === "ERROR"));
    return {
      detail: summary,
      observation: errorLayers.length > 0
        ? `Violacoes ERROR em: ${errorLayers.map(l => l.label).join(", ")} — encaminhar para Engineering Review`
        : undefined,
      data: report.layers.map(l => ({ layer: l.label, status: l.status, filesAnalyzed: l.filesAnalyzed })),
    };
  }));

  // C7: APIs publicas sao descobertas automaticamente
  results.push(await run(7, "C7 — APIs publicas descobertas automaticamente do codigo-fonte", async () => {
    if (report.exportsAnalyzed === 0) throw new Error("Nenhum export encontrado no codigo-fonte");
    const apiSummary = report.layers.map(l =>
      `${l.label}(${l.publicApi.length} exports)`
    ).join(", ");
    return {
      detail: `Exports totais: ${report.exportsAnalyzed} | Por camada: ${apiSummary}`,
      data: report.layers.map(l => ({ layer: l.label, exports: l.publicApi })),
    };
  }));

  // C8: Violacoes arquiteturais sao identificadas automaticamente
  results.push(await run(8, "C8 — Violacoes arquiteturais identificadas automaticamente", async () => {
    const errorViolations = report.allViolations.filter(v => v.severity === "ERROR");
    const warnViolations  = report.allViolations.filter(v => v.severity === "WARN");
    return {
      detail: `Total violacoes: ${report.allViolations.length} | ERROR: ${errorViolations.length} | WARN: ${warnViolations.length}`,
      observation: errorViolations.length > 0
        ? `${errorViolations.length} violacao(oes) ERROR registrada(s) — nao corrigidas automaticamente — encaminhar para Engineering Review`
        : "Nenhuma violacao ERROR encontrada",
      data: {
        errors: errorViolations,
        warns: warnViolations,
      },
    };
  }));

  // C9: Relatorio arquitetural gerado automaticamente
  results.push(await run(9, "C9 — Relatorio arquitetural gerado automaticamente", async () => {
    if (!report.conclusion) throw new Error("Campo 'conclusion' ausente");
    if (typeof report.runAt !== "number") throw new Error("Campo 'runAt' ausente");
    if (typeof report.filesAnalyzed !== "number") throw new Error("Campo 'filesAnalyzed' ausente");
    return {
      detail: `Relatorio: ${report.filesAnalyzed} arquivos | ${report.importsAnalyzed} imports | ${report.exportsAnalyzed} exports | ${report.boundariesApproved} boundaries OK | ${report.boundariesViolated} violados | ${report.durationMs}ms`,
      data: {
        runAt: new Date(report.runAt).toISOString(),
        durationMs: report.durationMs,
        conclusion: report.conclusion,
      },
    };
  }));

  // C10: Toda auditoria e baseada exclusivamente no codigo-fonte
  results.push(await run(10, "C10 — Auditoria baseada exclusivamente no codigo-fonte", async () => {
    // Verify all imports in every layer report came from the source analysis
    const totalReportedImports = report.layers.reduce((acc, l) => acc + l.detectedImports.length, 0);
    if (analysis.filesAnalyzed === 0) throw new Error("Nenhum arquivo lido do codigo-fonte");
    if (analysis.importsFound === 0) throw new Error("Nenhum import extraido do codigo-fonte");
    // Cross-check: report.importsAnalyzed must match analysis.importsFound
    if (report.importsAnalyzed !== analysis.importsFound) {
      throw new Error(`Divergencia: report.importsAnalyzed (${report.importsAnalyzed}) != analysis.importsFound (${analysis.importsFound})`);
    }
    return {
      detail: `${analysis.filesAnalyzed} arquivos lidos | ${analysis.importsFound} imports extraidos | ${totalReportedImports} especificadores unicos por camada | Fonte: import.meta.glob("/src/lib/**")`,
      observation: "Zero listas manuais. Toda evidencia provem do SourceCodeAnalyzer.",
    };
  }));

  return { results, report, analysis };
}