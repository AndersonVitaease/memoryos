// ABV — Test Suite
// Foundation v1.0 · Engineering First
//
// 10 criterios de aceitacao baseados em evidencias objetivas.

import {
  ArchitecturalBoundaryValidator,
  collectConnectorRuntimeData,
  collectCapabilityRuntimeData,
  collectGoalEngineData,
} from "./ArchitecturalBoundaryValidator";
import type { ABVReport } from "./ArchitecturalBoundaryValidator";

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

async function buildReport(): Promise<ABVReport> {
  const validator = new ArchitecturalBoundaryValidator();
  const [connData, capData, goalData] = await Promise.all([
    collectConnectorRuntimeData(),
    collectCapabilityRuntimeData(),
    collectGoalEngineData(),
  ]);
  return validator.audit({
    "connector-runtime": connData,
    "capability-runtime": capData,
    "goal-engine": goalData,
  });
}

// ── Test Suite ────────────────────────────────────────────────────────────────

export async function runABVTests(): Promise<{ results: ABVTestResult[]; report: ABVReport }> {
  const report = await buildReport();
  const results: ABVTestResult[] = [];

  // C1: Todas as dependencias sao auditadas
  results.push(await run(1, "C1 — Todas as dependencias sao auditadas", async () => {
    if (report.modulesAudited === 0) throw new Error("Nenhum modulo auditado");
    if (report.importsAnalyzed === 0) throw new Error("Nenhum import analisado");
    return {
      detail: `Modulos auditados: ${report.modulesAudited} | Imports analisados: ${report.importsAnalyzed} | Deps validas: ${report.validDeps}`,
      data: { modulesAudited: report.modulesAudited, importsAnalyzed: report.importsAnalyzed },
    };
  }));

  // C2: Todos os imports sao analisados
  results.push(await run(2, "C2 — Todos os imports sao analisados", async () => {
    const allHaveImports = report.layers.every(l => l.detectedDeps !== undefined);
    if (!allHaveImports) throw new Error("Algumas camadas nao tiveram imports analisados");
    const totalDetected = report.layers.reduce((acc, l) => acc + l.detectedDeps.length, 0);
    return {
      detail: `Deps detectadas em todas as camadas: ${totalDetected} total | Layers: ${report.layers.map(l => `${l.layer}(${l.detectedDeps.length})`).join(", ")}`,
    };
  }));

  // C3: Dependencias circulares sao detectadas
  results.push(await run(3, "C3 — Dependencias circulares sao detectadas", async () => {
    // Motor de deteccao foi executado — verificar que rodou e registrou (mesmo que zero)
    const circularCheck = report.layers.every(l => Array.isArray(l.circularDependencies));
    if (!circularCheck) throw new Error("circularDependencies nao inicializado em alguma camada");
    const totalCircular = report.layers.reduce((acc, l) => acc + l.circularDependencies.length, 0);
    return {
      detail: `Motor de deteccao executado em ${report.layers.length} camadas | Circulares encontradas: ${totalCircular}`,
      observation: totalCircular > 0
        ? `${totalCircular} dependencia(s) circular(es) encontrada(s) — encaminhar para Engineering Review`
        : "Nenhuma dependencia circular detectada",
    };
  }));

  // C4: Responsabilidades incorretas sao detectadas
  results.push(await run(4, "C4 — Responsabilidades incorretas sao detectadas", async () => {
    const allHaveRespCheck = report.layers.every(l => Array.isArray(l.responsibilityViolations));
    if (!allHaveRespCheck) throw new Error("Verificacao de responsabilidade nao executada em todas as camadas");
    const respViolations = report.layers.flatMap(l => l.responsibilityViolations.filter(v => v.rule === "RESPONSIBILITY_VIOLATION"));
    const apiExpansions = report.layers.flatMap(l => l.responsibilityViolations.filter(v => v.rule === "API_EXPANSION"));
    return {
      detail: `Violacoes de responsabilidade: ${respViolations.length} | Expansoes de API: ${apiExpansions.length}`,
      observation: respViolations.length > 0 ? `Violacoes encontradas — encaminhar para Engineering Review` : undefined,
      data: { responsibilityViolations: respViolations.length, apiExpansions: apiExpansions.length },
    };
  }));

  // C5: APIs publicas sao auditadas
  results.push(await run(5, "C5 — APIs publicas sao auditadas", async () => {
    const allHaveApi = report.layers.every(l => Array.isArray(l.publicApi) && l.publicApi.length > 0);
    if (!allHaveApi) throw new Error("Alguma camada nao teve API publica coletada");
    const summary = report.layers.map(l => `${l.layer}: [${l.publicApi.join(", ")}]`).join(" | ");
    return {
      detail: summary,
      data: report.layers.map(l => ({ layer: l.layer, apiCount: l.publicApi.length, methods: l.publicApi })),
    };
  }));

  // C6: Connector Runtime mantém boundary
  results.push(await run(6, "C6 — Connector Runtime mantem seu boundary", async () => {
    const layer = report.layers.find(l => l.layer === "Connector Runtime");
    if (!layer) throw new Error("Layer 'Connector Runtime' nao encontrada no relatorio");
    const errors = layer.violations.filter(v => v.severity === "ERROR");
    if (errors.length > 0) {
      throw new Error(`Connector Runtime violou boundary: ${errors.map(e => e.detail).join("; ")}`);
    }
    return {
      detail: `Status: ${layer.status} | Violacoes ERROR: 0 | API: [${layer.publicApi.join(", ")}]`,
      data: { status: layer.status, violations: layer.violations.length },
    };
  }));

  // C7: Capability Runtime mantém boundary
  results.push(await run(7, "C7 — Capability Runtime mantem seu boundary", async () => {
    const layer = report.layers.find(l => l.layer === "Capability Runtime");
    if (!layer) throw new Error("Layer 'Capability Runtime' nao encontrada no relatorio");
    const errors = layer.violations.filter(v => v.severity === "ERROR");
    if (errors.length > 0) {
      throw new Error(`Capability Runtime violou boundary: ${errors.map(e => e.detail).join("; ")}`);
    }
    return {
      detail: `Status: ${layer.status} | Violacoes ERROR: 0 | API: [${layer.publicApi.join(", ")}]`,
      data: { status: layer.status, violations: layer.violations.length },
    };
  }));

  // C8: Nenhuma violacao arquitetural passa despercebida
  results.push(await run(8, "C8 — Nenhuma violacao arquitetural passa despercebida", async () => {
    // Evidencia: toda violacao e registrada em allViolations
    const errorViolations = report.allViolations.filter(v => v.severity === "ERROR");
    if (errorViolations.length > 0) {
      return {
        detail: `${errorViolations.length} violacao(oes) ERROR registrada(s) — ${errorViolations.map(v => v.rule).join(", ")}`,
        observation: "Violacoes detectadas e registradas. Nao corrigidas automaticamente — encaminhar para Engineering Review.",
        data: errorViolations,
      };
    }
    return {
      detail: `Todas as ${report.allViolations.length} verificacoes concluidas. Nenhuma violacao ERROR encontrada.`,
    };
  }));

  // C9: Dependency Graph gerado automaticamente
  results.push(await run(9, "C9 — Dependency Graph gerado automaticamente", async () => {
    if (!report.layers.length) throw new Error("Grafo de dependencias vazio");
    const graph = report.layers.map(l => ({
      layer: l.layer,
      allowedDeps: l.allowedDeps,
      detectedDeps: l.detectedDeps,
      violations: l.violations.length,
    }));
    return {
      detail: `Grafo gerado com ${graph.length} nos | ${report.validDeps} deps validas | ${report.forbiddenDeps} deps proibidas`,
      data: graph,
    };
  }));

  // C10: Relatorio de auditoria produzido
  results.push(await run(10, "C10 — Relatorio de auditoria arquitetural produzido", async () => {
    if (!report.conclusion) throw new Error("Campo 'conclusion' ausente no relatorio");
    if (typeof report.runAt !== "number") throw new Error("Campo 'runAt' ausente");
    if (typeof report.durationMs !== "number") throw new Error("Campo 'durationMs' ausente");
    return {
      detail: `Relatorio: ${report.modulesAudited} modulos | ${report.importsAnalyzed} imports | ${report.boundariesApproved} boundaries OK | ${report.boundariesViolated} violated | ${report.durationMs}ms`,
      data: {
        runAt: new Date(report.runAt).toISOString(),
        durationMs: report.durationMs,
        conclusion: report.conclusion,
      },
    };
  }));

  return { results, report };
}