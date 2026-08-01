/**
 * developerPortalTests.ts — P8 Developer Portal
 * Suite de testes MDS v2.0 §2.16 para o Developer Portal.
 * MDS v2.0 · P8 · Version: 1.0.0
 */

import { OFFICIAL_DOCS } from "./DeveloperPortalDocs";

export interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export interface TestSuiteResult {
  suiteName: string;
  passed: number;
  failed: number;
  total: number;
  durationMs: number;
  results: TestResult[];
}

function runTest(name: string, fn: () => void): TestResult {
  const t0 = Date.now();
  try {
    fn();
    return { name, passed: true, durationMs: Date.now() - t0 };
  } catch (err: any) {
    return { name, passed: false, durationMs: Date.now() - t0, error: err?.message ?? String(err) };
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

export function runDeveloperPortalTests(): TestSuiteResult {
  const t0 = Date.now();
  const results: TestResult[] = [];

  results.push(runTest("Docs oficiais carregam sem erro", () => {
    assert(Array.isArray(OFFICIAL_DOCS), "OFFICIAL_DOCS deve ser array");
    assert(OFFICIAL_DOCS.length >= 6, `Esperado >= 6 docs, obtido ${OFFICIAL_DOCS.length}`);
  }));

  results.push(runTest("Todos os docs tem id unico", () => {
    const ids = OFFICIAL_DOCS.map((d) => d.id);
    const unique = new Set(ids);
    assert(unique.size === ids.length, "IDs duplicados encontrados");
  }));

  results.push(runTest("Todos os docs tem titulo e conteudo", () => {
    for (const doc of OFFICIAL_DOCS) {
      assert(!!doc.title, `Doc ${doc.id} sem titulo`);
      assert(!!doc.content && doc.content.length > 50, `Doc ${doc.id} sem conteudo suficiente`);
    }
  }));

  results.push(runTest("Todas as categorias conhecidas estao presentes", () => {
    const cats = new Set(OFFICIAL_DOCS.map((d) => d.category));
    assert(cats.has("getting-started"), "getting-started ausente");
    assert(cats.has("sdk"), "sdk ausente");
    assert(cats.has("specialists"), "specialists ausente");
    assert(cats.has("knowledge-packages"), "knowledge-packages ausente");
    assert(cats.has("marketplace"), "marketplace ausente");
    assert(cats.has("architecture"), "architecture ausente");
  }));

  results.push(runTest("Todos os docs sao imutaveis (Object.freeze)", () => {
    assert(Object.isFrozen(OFFICIAL_DOCS), "OFFICIAL_DOCS deve ser frozen");
  }));

  results.push(runTest("Docs tem version e updatedAt preenchidos", () => {
    for (const doc of OFFICIAL_DOCS) {
      assert(!!doc.version, `Doc ${doc.id} sem version`);
      assert(!!doc.updatedAt, `Doc ${doc.id} sem updatedAt`);
    }
  }));

  results.push(runTest("Docs tem tags nao-vazias", () => {
    for (const doc of OFFICIAL_DOCS) {
      assert(doc.tags.length > 0, `Doc ${doc.id} sem tags`);
    }
  }));

  results.push(runTest("Playground engine instancia sem erro", async () => {
    const { DeveloperPlayground } = await import("./DeveloperPortalPlayground");
    assert(!!DeveloperPlayground, "DeveloperPlayground nao inicializou");
  }));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    suiteName: "P8 Developer Portal",
    passed,
    failed,
    total: results.length,
    durationMs: Date.now() - t0,
    results,
  };
}