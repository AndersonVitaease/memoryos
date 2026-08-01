/**
 * marketplaceTests.ts — P7 Marketplace Registry
 * Suite de testes MDS v2.0 §2.16 para o CapabilityRegistry.
 * MDS v2.0 · P7 · Version: 1.0.0
 */

import { CapabilityRegistry } from "./CapabilityRegistry";
import { bootstrapOfficialCapabilities } from "./CapabilityBootstrap";
import type { PublishRequest } from "./MarketplaceTypes";

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

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
export function runMarketplaceTests(): TestSuiteResult {
  const t0 = Date.now();
  const results: TestResult[] = [];

  // 1. Bootstrap registra todas as capabilities oficiais
  results.push(runTest("Bootstrap registra todos os oficiais (P5+P6)", () => {
    const r = bootstrapOfficialCapabilities();
    assert(r.registeredCount >= 7, `Esperado >= 7, obtido ${r.registeredCount}`);
    assert(r.errors.length === 0, `Erros: ${r.errors.join(", ")}`);
  }));

  // 2. Registry retorna entrada por ID
  results.push(runTest("get() retorna entrada por ID", () => {
    const entry = CapabilityRegistry.get("com.memoryos.financial-specialist");
    assert(!!entry, "Entry nao encontrada");
    assert(entry!.manifest.kind === "specialist", "Kind incorreto");
    assert(entry!.manifest.tier === "official", "Tier incorreto");
  }));

  // 3. Query por kind
  results.push(runTest("query() filtra por kind=specialist", () => {
    const specialists = CapabilityRegistry.query({ kind: "specialist" });
    assert(specialists.length >= 4, `Esperado >= 4, obtido ${specialists.length}`);
  }));

  results.push(runTest("query() filtra por kind=knowledge_package", () => {
    const pkgs = CapabilityRegistry.query({ kind: "knowledge_package" });
    assert(pkgs.length >= 3, `Esperado >= 3, obtido ${pkgs.length}`);
  }));

  // 4. Query por domain
  results.push(runTest("query() filtra por domain=financial", () => {
    const financial = CapabilityRegistry.query({ domain: "financial" });
    assert(financial.length >= 2, `Esperado >= 2 (specialist + pkg), obtido ${financial.length}`);
  }));

  // 5. Publish valida campos obrigatorios
  results.push(runTest("publish() rejeita manifest sem id", () => {
    const req = {
      manifest: { id: "", name: "Test", version: "1.0.0", kind: "specialist" as const, domain: "test", author: "Test", description: "", tier: "community" as const, status: "beta" as const, languages: [], tags: [] },
      compatibilityConstraints: { requiresIds: [], conflictsWith: [], minPlatformVersion: "1.0.0" },
    } satisfies PublishRequest;
    const result = CapabilityRegistry.publish(req);
    assert(!result.success, "Deveria falhar com id vazio");
    assert(result.errors.length > 0, "Deve ter erros");
  }));

  // 6. Compatibilidade entre dois capabilities
  results.push(runTest("checkCompatibility() retorna compativel para nao-conflitantes", () => {
    const { compatible } = CapabilityRegistry.checkCompatibility(
      "com.memoryos.financial-specialist",
      "com.memoryos.financial"
    );
    assert(compatible, "Deveriam ser compativeis");
  }));

  // 7. Imutabilidade dos entries
  results.push(runTest("Entries sao imutaveis (Object.freeze)", () => {
    const entry = CapabilityRegistry.get("com.memoryos.legal-specialist");
    assert(!!entry, "Entry nao encontrada");
    assert(Object.isFrozen(entry!.manifest), "Manifest deve ser frozen");
    assert(Object.isFrozen(entry!.compatibility), "Compatibility deve ser frozen");
    assert(Object.isFrozen(entry!.healthStatus), "HealthStatus deve ser frozen");
  }));

  // 8. updateHealth atualiza metricas
  results.push(runTest("updateHealth() atualiza successRate e avgLatencyMs", () => {
    const ok = CapabilityRegistry.updateHealth("com.memoryos.tech-specialist", {
      successRate: 0.95,
      avgLatencyMs: 320,
      errorCount: 1,
    });
    assert(ok, "updateHealth deve retornar true");
    const entry = CapabilityRegistry.get("com.memoryos.tech-specialist");
    assert(entry!.healthStatus.successRate === 0.95, "successRate incorreto");
    assert(entry!.healthStatus.avgLatencyMs === 320, "avgLatencyMs incorreto");
  }));

  // 9. count() retorna totais corretos
  results.push(runTest("count() retorna total e por kind", () => {
    const total = CapabilityRegistry.count();
    assert(total >= 7, `Total esperado >= 7, obtido ${total}`);
    const specialists = CapabilityRegistry.count("specialist");
    assert(specialists >= 4, `Specialists esperado >= 4, obtido ${specialists}`);
  }));

  // 10. Registro duplicado de mesma versao e ignorado
  results.push(runTest("Publicacao duplicada da mesma versao e ignorada", () => {
    const before = CapabilityRegistry.count();
    bootstrapOfficialCapabilities();
    const after = CapabilityRegistry.count();
    assert(before === after, `Count mudou de ${before} para ${after}`);
  }));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    suiteName: "P7 Marketplace Registry",
    passed,
    failed,
    total: results.length,
    durationMs: Date.now() - t0,
    results,
  };
}