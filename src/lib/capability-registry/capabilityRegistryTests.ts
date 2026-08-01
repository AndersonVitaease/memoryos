/**
 * capabilityRegistryTests.ts — P9 Capability Registry
 * Suite de testes MDS v2.0 §2.16 — 10 cenarios.
 * MDS v2.0 · P9 · Version: 1.0.0
 */

import { CapabilityDiscoveryEngine } from "./CapabilityDiscoveryEngine";
import { CapabilityVersioning } from "./CapabilityVersioning";
import { CompatibilityMatrixEngine } from "./CompatibilityMatrix";

export interface CRTestResult {
  scenario: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export interface CRTestReport {
  passed: number;
  failed: number;
  total: number;
  durationMs: number;
  certified: boolean;
  results: CRTestResult[];
}

function runTest(scenario: string, fn: () => void | Promise<void>): Promise<CRTestResult> {
  const t0 = Date.now();
  return Promise.resolve()
    .then(() => fn())
    .then(() => ({ scenario, passed: true, durationMs: Date.now() - t0 }))
    .catch((err: any) => ({ scenario, passed: false, durationMs: Date.now() - t0, error: err?.message ?? String(err) }));
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

export async function runCapabilityRegistryTests(): Promise<CRTestReport> {
  const t0 = Date.now();
  const results: CRTestResult[] = await Promise.all([

    runTest("Discovery retorna todas as 10 capabilities oficiais", () => {
      const report = CapabilityDiscoveryEngine.discover();
      assert(report.total >= 10, `Esperado >= 10, obtido ${report.total}`);
    }),

    runTest("Discovery agrupa por kind corretamente", () => {
      const report = CapabilityDiscoveryEngine.discover();
      assert(report.byKind["specialist"] >= 4, "Deve ter >= 4 specialists");
      assert(report.byKind["knowledge_package"] >= 3, "Deve ter >= 3 knowledge packages");
      assert(report.byKind["connector"] >= 3, "Deve ter >= 3 connectors");
    }),

    runTest("Discovery retorna objetos frozen", () => {
      const report = CapabilityDiscoveryEngine.discover();
      assert(Object.isFrozen(report), "DiscoveryReport deve ser frozen");
      assert(Object.isFrozen(report.capabilities), "capabilities deve ser frozen");
    }),

    runTest("Discovery get() retorna capability por ID", () => {
      CapabilityDiscoveryEngine.discover();
      const cap = CapabilityDiscoveryEngine.get("com.memoryos.financial-specialist");
      assert(!!cap, "Deve encontrar financial-specialist");
      assert(cap!.kind === "specialist", "kind deve ser specialist");
    }),

    runTest("Versioning seed carrega 10 baselines v1.0.0", () => {
      const ids = CapabilityVersioning.listAll();
      assert(ids.length >= 10, `Esperado >= 10 capabilities versionadas, obtido ${ids.length}`);
    }),

    runTest("Versioning getReport retorna historico correto", () => {
      const report = CapabilityVersioning.getReport("com.memoryos.financial-specialist");
      assert(!!report, "Report nao deve ser null");
      assert(report!.currentVersion === "1.0.0", `Version esperada 1.0.0, obtida ${report!.currentVersion}`);
      assert(report!.totalVersions === 1, "Deve ter 1 versao inicial");
    }),

    runTest("Versioning publish gera nova versao corretamente", () => {
      CapabilityVersioning.publish("com.memoryos.tech-specialist", "patch", "Bug fix in tech domain");
      const report = CapabilityVersioning.getReport("com.memoryos.tech-specialist");
      assert(report!.currentVersion === "1.0.1", `Esperado 1.0.1, obtido ${report!.currentVersion}`);
      assert(report!.totalVersions === 2, "Deve ter 2 versoes");
    }),

    runTest("CompatibilityMatrix check retorna entry frozen", () => {
      const entry = CompatibilityMatrixEngine.check(
        "com.memoryos.financial-specialist",
        "com.memoryos.financial"
      );
      assert(Object.isFrozen(entry), "Entry deve ser frozen");
      assert(entry.level === "full", "Financial specialist + Financial package deve ser full");
    }),

    runTest("CompatibilityMatrix generate cobre todos os pares", () => {
      const ids = [
        "com.memoryos.financial-specialist",
        "com.memoryos.legal-specialist",
        "com.memoryos.financial",
        "com.memoryos.legal",
      ];
      const matrix = CompatibilityMatrixEngine.generate(ids);
      assert(matrix.totalPairs === 6, `Esperado 6 pares, obtido ${matrix.totalPairs}`);
      assert(Object.isFrozen(matrix), "Matrix deve ser frozen");
    }),

    runTest("CompatibilityMatrix gera relatorio com contadores corretos", () => {
      const ids = [
        "com.memoryos.financial-specialist",
        "com.memoryos.legal-specialist",
        "com.memoryos.medical-specialist",
        "com.memoryos.tech-specialist",
        "com.memoryos.financial",
        "com.memoryos.legal",
        "com.memoryos.brazilian-government",
      ];
      const matrix = CompatibilityMatrixEngine.generate(ids);
      assert(matrix.totalPairs === 21, `Esperado 21 pares, obtido ${matrix.totalPairs}`);
      assert(matrix.fullCompatible + matrix.partialCompatible + matrix.incompatible === matrix.totalPairs, "Contadores devem somar totalPairs");
    }),
  ]);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  return {
    passed,
    failed,
    total: results.length,
    durationMs: Date.now() - t0,
    certified: failed === 0,
    results,
  };
}