/**
 * specialistTests.ts — Specialist Runtime
 * Suite de testes oficial conforme MDS v2.0 Cap. 2.
 * Criterios: aceitacao, SRP, imutabilidade, metricas, health.
 */

import type { SpecialistTestReport, SpecialistTestResult } from "./SpecialistTypes";
import { FinancialSpecialist } from "./FinancialSpecialist";
import { LegalSpecialist } from "./LegalSpecialist";
import { MedicalSpecialist } from "./MedicalSpecialist";
import { TechSpecialist } from "./TechSpecialist";

function pass(scenario: string, durationMs: number): SpecialistTestResult {
  return Object.freeze({ scenario, passed: true, durationMs });
}

function fail(scenario: string, durationMs: number, error: string): SpecialistTestResult {
  return Object.freeze({ scenario, passed: false, durationMs, error });
}

async function runScenario(
  name: string,
  fn: () => Promise<void> | void,
): Promise<SpecialistTestResult> {
  const t0 = Date.now();
  try {
    await fn();
    return pass(name, Date.now() - t0);
  } catch (e) {
    return fail(name, Date.now() - t0, e instanceof Error ? e.message : String(e));
  }
}

export async function runSpecialistTests(): Promise<SpecialistTestReport[]> {
  const reports: SpecialistTestReport[] = [];
  const specialists = [
    new FinancialSpecialist(),
    new LegalSpecialist(),
    new MedicalSpecialist(),
    new TechSpecialist(),
  ];

  for (const s of specialists) {
    const t0 = Date.now();
    const results: SpecialistTestResult[] = [];

    // ── SRP: manifest presente e imutavel ────────────────────────────
    results.push(await runScenario("SRP: manifest presente", () => {
      if (!s.manifest) throw new Error("manifest ausente");
    }));

    results.push(await runScenario("SRP: manifest imutavel (Object.isFrozen)", () => {
      if (!Object.isFrozen(s.manifest)) throw new Error("manifest nao e imutavel");
    }));

    // ── Aceitacao: canHandle retorna boolean ─────────────────────────
    results.push(await runScenario("Aceitacao: canHandle retorna boolean", () => {
      const result = s.canHandle("qualquer consulta");
      if (typeof result !== "boolean") throw new Error("canHandle deve retornar boolean");
    }));

    // ── Aceitacao: canHandle para query vazia ────────────────────────
    results.push(await runScenario("Aceitacao: canHandle query vazia nao lanca erro", () => {
      s.canHandle("");
    }));

    // ── Metricas: metrics() retorna estrutura correta ────────────────
    results.push(await runScenario("Metricas: metrics() retorna estrutura valida", () => {
      const m = s.metrics();
      if (typeof m.executeCount  !== "number") throw new Error("executeCount invalido");
      if (typeof m.successRate   !== "number") throw new Error("successRate invalido");
      if (typeof m.avgLatencyMs  !== "number") throw new Error("avgLatencyMs invalido");
    }));

    results.push(await runScenario("Metricas: metrics() e imutavel", () => {
      if (!Object.isFrozen(s.metrics())) throw new Error("metrics() nao e imutavel");
    }));

    // ── Health: health() retorna estrutura correta ───────────────────
    results.push(await runScenario("Health: health() retorna status valido", () => {
      const h = s.health();
      const valid = ["SUCCESS", "DEGRADED", "FAILED"];
      if (!valid.includes(h.status)) throw new Error(`status invalido: ${h.status}`);
    }));

    results.push(await runScenario("Health: health() e imutavel", () => {
      if (!Object.isFrozen(s.health())) throw new Error("health() nao e imutavel");
    }));

    // ── Aceitacao: manifest tem campos obrigatorios ──────────────────
    results.push(await runScenario("Aceitacao: specialistId presente e nao vazio", () => {
      if (!s.manifest.specialistId || s.manifest.specialistId.trim() === "") throw new Error("specialistId vazio");
    }));

    results.push(await runScenario("Aceitacao: domain declarado", () => {
      if (!s.manifest.domain) throw new Error("domain ausente");
    }));

    results.push(await runScenario("Aceitacao: expertise nao vazia", () => {
      if (!s.manifest.expertise || s.manifest.expertise.length === 0) throw new Error("expertise vazia");
    }));

    results.push(await runScenario("Aceitacao: languages declaradas", () => {
      if (!s.manifest.languages || s.manifest.languages.length === 0) throw new Error("languages vazia");
    }));

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    reports.push(Object.freeze({
      specialistId:    s.manifest.specialistId,
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