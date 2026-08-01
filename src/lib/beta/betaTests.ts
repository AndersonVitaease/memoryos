/**
 * betaTests.ts — P10 Beta
 * Suite de testes MDS v2.0 §2.16 — 8 cenarios.
 */

import { BetaProgram } from "./BetaProgram";

export interface BetaTestResult {
  scenario: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export interface BetaTestReport {
  passed: number;
  failed: number;
  total: number;
  durationMs: number;
  certified: boolean;
  results: BetaTestResult[];
}

function runTest(scenario: string, fn: () => void): Promise<BetaTestResult> {
  const t0 = Date.now();
  return Promise.resolve().then(() => fn())
    .then(() => ({ scenario, passed: true, durationMs: Date.now() - t0 }))
    .catch((e: any) => ({ scenario, passed: false, durationMs: Date.now() - t0, error: e?.message ?? String(e) }));
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

export async function runBetaTests(): Promise<BetaTestReport> {
  const t0 = Date.now();
  const results = await Promise.all([
    runTest("BetaProgram lista 5 usuarios seed", () => {
      assert(BetaProgram.listUsers().length === 5, "Esperado 5 usuarios");
    }),
    runTest("BetaProgram lista 9 feedbacks seed", () => {
      assert(BetaProgram.listFeedback().length === 9, "Esperado 9 feedbacks");
    }),
    runTest("BetaProgram lista 5 RFCs seed", () => {
      assert(BetaProgram.listRFCs().length === 5, "Esperado 5 RFCs");
    }),
    runTest("Staging checks retorna 10 itens todos pass", () => {
      const chks = BetaProgram.listStagingChecks();
      assert(chks.length === 10, `Esperado 10, obtido ${chks.length}`);
      assert(chks.every((c) => c.status === "pass"), "Todos devem ser pass");
    }),
    runTest("Metrics retorna stagingPassRate === 100", () => {
      const m = BetaProgram.getMetrics();
      assert(m.stagingPassRate === 100, `Esperado 100, obtido ${m.stagingPassRate}`);
    }),
    runTest("Metrics totalActive === 3", () => {
      const m = BetaProgram.getMetrics();
      assert(m.totalActive === 3, `Esperado 3 ativos, obtido ${m.totalActive}`);
    }),
    runTest("Metrics resolvedFeedback === 5", () => {
      const m = BetaProgram.getMetrics();
      assert(m.resolvedFeedback === 5, `Esperado 5, obtido ${m.resolvedFeedback}`);
    }),
    runTest("Metrics readinessScore > 50", () => {
      const m = BetaProgram.getMetrics();
      assert(m.readinessScore > 50, `Esperado >50, obtido ${m.readinessScore}`);
    }),
  ]);

  const passed = results.filter((r) => r.passed).length;
  return { passed, failed: results.filter((r) => !r.passed).length, total: results.length,
    durationMs: Date.now() - t0, certified: passed === results.length, results };
}