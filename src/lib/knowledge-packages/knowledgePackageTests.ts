/**
 * knowledgePackageTests.ts — Knowledge Package Runtime
 * Suite de testes oficial conforme MDS v2.0 Cap. 2.
 * Criterios: aceitacao, SRP, imutabilidade, metricas, health.
 */

import type { KnowledgePackageTestReport, KnowledgePackageTestResult } from "./KnowledgePackageTypes";
import { FinancialPackage }          from "./FinancialPackage";
import { LegalPackage }              from "./LegalPackage";
import { BrazilianGovernmentPackage } from "./BrazilianGovernmentPackage";

function pass(scenario: string, durationMs: number): KnowledgePackageTestResult {
  return Object.freeze({ scenario, passed: true, durationMs });
}

function fail(scenario: string, durationMs: number, error: string): KnowledgePackageTestResult {
  return Object.freeze({ scenario, passed: false, durationMs, error });
}

async function runScenario(
  name: string,
  fn: () => void,
): Promise<KnowledgePackageTestResult> {
  const t0 = Date.now();
  try {
    fn();
    return pass(name, Date.now() - t0);
  } catch (e) {
    return fail(name, Date.now() - t0, e instanceof Error ? e.message : String(e));
  }
}

export async function runKnowledgePackageTests(): Promise<KnowledgePackageTestReport[]> {
  const reports: KnowledgePackageTestReport[] = [];
  const packages = [
    new FinancialPackage(),
    new LegalPackage(),
    new BrazilianGovernmentPackage(),
  ];

  for (const pkg of packages) {
    const t0 = Date.now();
    const results: KnowledgePackageTestResult[] = [];

    // ── SRP: manifest imutavel ───────────────────────────────────────
    results.push(await runScenario("SRP: manifest imutavel (Object.isFrozen)", () => {
      if (!Object.isFrozen(pkg.manifest)) throw new Error("manifest nao e imutavel");
    }));

    // ── Aceitacao: content retorna nodes e edges ─────────────────────
    results.push(await runScenario("Aceitacao: content() retorna nodes", () => {
      const c = pkg.content();
      if (!c.nodes || c.nodes.length === 0) throw new Error("nodes vazio");
    }));

    results.push(await runScenario("Aceitacao: content() retorna edges", () => {
      const c = pkg.content();
      if (!c.edges) throw new Error("edges ausente");
    }));

    results.push(await runScenario("Aceitacao: nodes sao imutaveis", () => {
      const c = pkg.content();
      if (!Object.isFrozen(c.nodes)) throw new Error("nodes nao sao imutaveis");
    }));

    // ── Aceitacao: query retorna resultado ───────────────────────────
    results.push(await runScenario("Aceitacao: query() retorna resultado valido", () => {
      const r = pkg.query(["contrato"]);
      if (typeof r.totalHits !== "number") throw new Error("totalHits invalido");
      if (typeof r.queryMs   !== "number") throw new Error("queryMs invalido");
    }));

    results.push(await runScenario("Aceitacao: query() resultado e imutavel", () => {
      if (!Object.isFrozen(pkg.query(["teste"]))) throw new Error("query result nao e imutavel");
    }));

    results.push(await runScenario("Aceitacao: query() com keywords vazia retorna 0 hits", () => {
      const r = pkg.query([]);
      if (r.totalHits !== 0) throw new Error(`esperado 0 hits, recebeu ${r.totalHits}`);
    }));

    // ── Metricas ─────────────────────────────────────────────────────
    results.push(await runScenario("Metricas: metrics() retorna estrutura valida", () => {
      const m = pkg.metrics();
      if (typeof m.nodeCount  !== "number") throw new Error("nodeCount invalido");
      if (typeof m.edgeCount  !== "number") throw new Error("edgeCount invalido");
      if (typeof m.queryCount !== "number") throw new Error("queryCount invalido");
    }));

    results.push(await runScenario("Metricas: metrics() e imutavel", () => {
      if (!Object.isFrozen(pkg.metrics())) throw new Error("metrics() nao e imutavel");
    }));

    // ── Health ───────────────────────────────────────────────────────
    results.push(await runScenario("Health: health() retorna status valido", () => {
      const h = pkg.health();
      const valid = ["SUCCESS", "DEGRADED", "FAILED"];
      if (!valid.includes(h.status)) throw new Error(`status invalido: ${h.status}`);
    }));

    results.push(await runScenario("Health: health() com nodes populated = SUCCESS", () => {
      const h = pkg.health();
      if (h.status !== "SUCCESS") throw new Error(`esperado SUCCESS, recebeu ${h.status}`);
    }));

    results.push(await runScenario("Health: health() e imutavel", () => {
      if (!Object.isFrozen(pkg.health())) throw new Error("health() nao e imutavel");
    }));

    // ── Aceitacao: manifest tem campos obrigatorios ──────────────────
    results.push(await runScenario("Aceitacao: packageId presente", () => {
      if (!pkg.manifest.packageId) throw new Error("packageId ausente");
    }));

    results.push(await runScenario("Aceitacao: sources nao vazias", () => {
      if (!pkg.manifest.sources || pkg.manifest.sources.length === 0) throw new Error("sources vazias");
    }));

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    reports.push(Object.freeze({
      packageId:       pkg.manifest.packageId,
      totalScenarios:  results.length,
      passed,
      failed,
      durationMs:      Date.now() - t0,
      results:         Object.freeze(results),
      certified:       failed === 0,
    }));
  }

  return reports;
}