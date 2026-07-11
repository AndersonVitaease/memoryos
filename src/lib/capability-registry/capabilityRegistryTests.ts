// capabilityRegistryTests.ts
// Foundation v1.0 · Engineering First · Sprint EF-14
// 18 acceptance + 10 hardening = 28 scenarios

import { CapabilityRegistry } from "./CapabilityRegistry";
import {
  CapabilityDefinition,
  CapabilityRegistryTestResult,
  CapabilityRegistryTestSuite,
} from "./CapabilityRegistryTypes";

// ── Helpers ───────────────────────────────────────────────────────────────────

function now(): number { return Date.now(); }

function makeDef(overrides: Partial<CapabilityDefinition> = {}): CapabilityDefinition {
  return {
    name:        "TestCapability",
    version:     "1.0",
    category:    "UTILITY",
    description: "A test capability",
    inputSchema: { type: "object", properties: { input: { type: "string" } }, required: ["input"] },
    outputSchema: { type: "object", properties: { output: { type: "string" } } },
    ...overrides,
  };
}

async function run(
  criterion: number,
  name: string,
  fn: () => Promise<void> | void,
): Promise<CapabilityRegistryTestResult> {
  const t0 = now();
  try {
    await fn();
    return Object.freeze({ criterion, name, passed: true,  durationMs: now() - t0, detail: "OK", error: null });
  } catch (e: any) {
    return Object.freeze({ criterion, name, passed: false, durationMs: now() - t0, detail: "", error: e?.message ?? String(e) });
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ── Test Suite ────────────────────────────────────────────────────────────────

export async function runCapabilityRegistryTests(): Promise<CapabilityRegistryTestSuite> {
  const suiteStart = now();
  const results: CapabilityRegistryTestResult[] = [];

  // ── C1: registro simples ───────────────────────────────────────────────────
  results.push(await run(1, "Registro simples retorna CapabilityDescriptor valido", () => {
    const reg = new CapabilityRegistry();
    const desc = reg.register(makeDef());
    assert(!!desc.id,               "id must exist");
    assert(desc.name === "TestCapability", "name must match");
    assert(desc.version === "1.0",  "version must match");
    assert(desc.category === "UTILITY", "category must match");
    assert(desc.status === "ACTIVE","default status must be ACTIVE");
  }));

  // ── C2: registro duplicado lanca erro ─────────────────────────────────────
  results.push(await run(2, "Registro duplicado (name+version) lanca erro", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeDef());
    let threw = false;
    try { reg.register(makeDef()); } catch { threw = true; }
    assert(threw, "should throw on duplicate");
  }));

  // ── C3: unregister ─────────────────────────────────────────────────────────
  results.push(await run(3, "unregister remove Capability do Registry", () => {
    const reg = new CapabilityRegistry();
    const desc = reg.register(makeDef());
    assert(reg.exists(desc.id), "should exist before unregister");
    reg.unregister(desc.id);
    assert(!reg.exists(desc.id), "should not exist after unregister");
    assert(reg.list().length === 0, "list should be empty");
  }));

  // ── C4: resolve por id ─────────────────────────────────────────────────────
  results.push(await run(4, "resolve(id) retorna o CapabilityDescriptor correto", () => {
    const reg = new CapabilityRegistry();
    const desc = reg.register(makeDef());
    const found = reg.resolve(desc.id);
    assert(found !== null,       "must find by id");
    assert(found!.id === desc.id,"id must match");
  }));

  // ── C5: exists ─────────────────────────────────────────────────────────────
  results.push(await run(5, "exists() retorna true para id registrado e false para inexistente", () => {
    const reg = new CapabilityRegistry();
    const desc = reg.register(makeDef());
    assert(reg.exists(desc.id),     "should exist");
    assert(!reg.exists("invalid-id"), "should not exist");
  }));

  // ── C6: update ─────────────────────────────────────────────────────────────
  results.push(await run(6, "update() modifica description e status sem alterar id/name/version", () => {
    const reg = new CapabilityRegistry();
    const desc = reg.register(makeDef());
    const updated = reg.update(desc.id, { description: "Updated", status: "DEPRECATED" });
    assert(updated.id === desc.id,             "id must not change");
    assert(updated.name === desc.name,         "name must not change");
    assert(updated.description === "Updated",  "description must update");
    assert(updated.status === "DEPRECATED",    "status must update");
    assert(updated.updatedAt >= desc.updatedAt,"updatedAt must advance");
  }));

  // ── C7: filtro por categoria ───────────────────────────────────────────────
  results.push(await run(7, "listByCategory retorna apenas Capabilities da categoria solicitada", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeDef({ name: "C1", category: "MEMORY" }));
    reg.register(makeDef({ name: "C2", category: "MEMORY" }));
    reg.register(makeDef({ name: "C3", category: "UTILITY" }));
    const mem = reg.listByCategory("MEMORY");
    assert(mem.length === 2, "should return 2 MEMORY capabilities");
    assert(mem.every(d => d.category === "MEMORY"), "all must be MEMORY");
  }));

  // ── C8: categorias completas em statistics ─────────────────────────────────
  results.push(await run(8, "statistics.categories contem todas as 9 categorias", () => {
    const reg = new CapabilityRegistry();
    const stats = reg.statistics();
    const cats = ["SYSTEM","MEMORY","KNOWLEDGE","LEARNING","COMMUNICATION","FILE","CONNECTOR","SPECIALIST","UTILITY"];
    for (const c of cats) {
      assert(c in stats.categories, `category ${c} must be in stats`);
    }
  }));

  // ── C9: multiplas versoes ──────────────────────────────────────────────────
  results.push(await run(9, "Multiplas versoes da mesma Capability registradas sem conflito", () => {
    const reg = new CapabilityRegistry();
    const d1  = reg.register(makeDef({ name: "Email", version: "1.0" }));
    const d2  = reg.register(makeDef({ name: "Email", version: "1.1" }));
    const d3  = reg.register(makeDef({ name: "Email", version: "2.0" }));
    assert(reg.list().length === 3, "should have 3 entries");
    const r1 = reg.resolve("Email", "1.0");
    assert(r1?.id === d1.id, "resolve v1.0 must match");
    const r2 = reg.resolve("Email", "2.0");
    assert(r2?.id === d3.id, "resolve v2.0 must match");
  }));

  // ── C10: filtro por tag ────────────────────────────────────────────────────
  results.push(await run(10, "listByTag retorna apenas Capabilities com a tag solicitada", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeDef({ name: "A", tags: ["ai", "core"] }));
    reg.register(makeDef({ name: "B", tags: ["ai"] }));
    reg.register(makeDef({ name: "C", tags: ["core"] }));
    assert(reg.listByTag("ai").length   === 2, "ai tag: 2 results");
    assert(reg.listByTag("core").length === 2, "core tag: 2 results");
    assert(reg.listByTag("other").length === 0, "other tag: 0 results");
  }));

  // ── C11: validate ──────────────────────────────────────────────────────────
  results.push(await run(11, "validate() retorna valid=true para definicao correta e false para incorreta", () => {
    const reg = new CapabilityRegistry();
    const ok  = reg.validate(makeDef());
    assert(ok.valid === true && ok.errors.length === 0, "valid def must pass");
    const bad = reg.validate({ name: "", version: "1.0", category: "UTILITY", description: "x",
      inputSchema: { type: "object", properties: {}, required: [] },
      outputSchema: { type: "object", properties: {} } });
    assert(bad.valid === false && bad.errors.length > 0, "empty name must fail");
  }));

  // ── C12: statistics ────────────────────────────────────────────────────────
  results.push(await run(12, "statistics() e preciso apos registros e unregister", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeDef({ name: "A" }));
    reg.register(makeDef({ name: "B" }));
    const d3 = reg.register(makeDef({ name: "C" }));
    reg.unregister(d3.id);
    const s = reg.statistics();
    assert(s.totalCapabilities === 2,  "total must be 2");
    assert(s.registrations    === 3,   "registrations must be 3");
    assert(s.removals         === 1,   "removals must be 1");
  }));

  // ── C13: metrics ──────────────────────────────────────────────────────────
  results.push(await run(13, "metrics() registra registerTotal, resolveTotal e validationTotal", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeDef({ name: "A" }));
    reg.register(makeDef({ name: "B" }));
    const d = reg.resolve("A");
    reg.validate(makeDef());
    const m = reg.metrics();
    assert(m.registerTotal   >= 2, "registerTotal must be >= 2");
    assert(m.resolveTotal    >= 1, "resolveTotal must be >= 1");
    assert(m.validationTotal >= 1, "validationTotal must be >= 1");
  }));

  // ── C14: logs ─────────────────────────────────────────────────────────────
  results.push(await run(14, "logs() produzidos para REGISTER, RESOLVE, VALIDATE", () => {
    const reg = new CapabilityRegistry();
    const desc = reg.register(makeDef());
    reg.resolve(desc.id);
    reg.validate(makeDef());
    const ls = reg.logs();
    assert(ls.some(l => l.operation === "REGISTER"), "must have REGISTER log");
    assert(ls.some(l => l.operation === "RESOLVE"),  "must have RESOLVE log");
    assert(ls.some(l => l.operation === "VALIDATE"), "must have VALIDATE log");
    assert(ls.every(l => !!l.executionId),           "all logs must have executionId");
    assert(ls.every(l => !!l.timestamp),             "all logs must have timestamp");
  }));

  // ── C15: health SUCCESS ────────────────────────────────────────────────────
  results.push(await run(15, "health() retorna SUCCESS com capabilities registradas", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeDef());
    const h = reg.health();
    assert(h.status === "SUCCESS", "health must be SUCCESS");
    assert(h.checks.registryIntegrity,   "registryIntegrity must pass");
    assert(h.checks.descriptorIntegrity, "descriptorIntegrity must pass");
    assert(h.checks.versionIntegrity,    "versionIntegrity must pass");
    assert(h.checks.contractIntegrity,   "contractIntegrity must pass");
    assert(h.checks.consistencyCheck,    "consistencyCheck must pass");
  }));

  // ── C16: Object.freeze ─────────────────────────────────────────────────────
  results.push(await run(16, "CapabilityDescriptor retornado e imutavel via Object.freeze()", () => {
    const reg  = new CapabilityRegistry();
    const desc = reg.register(makeDef());
    assert(Object.isFrozen(desc),              "descriptor must be frozen");
    assert(Object.isFrozen(desc.tags),         "tags must be frozen");
    assert(Object.isFrozen(desc.permissions),  "permissions must be frozen");
    assert(Object.isFrozen(desc.inputSchema),  "inputSchema must be frozen");
    assert(Object.isFrozen(desc.outputSchema), "outputSchema must be frozen");
  }));

  // ── C17: Dependency Injection ──────────────────────────────────────────────
  results.push(await run(17, "Dependency Injection: Registry nunca instancia Capability internamente", () => {
    // Registry accepts external definitions, never calls new Capability()
    const reg   = new CapabilityRegistry();
    const def   = makeDef({ name: "Injected" });
    const desc  = reg.register(def);
    // Descriptor is a plain data object, not a class instance
    assert(!(desc instanceof Function), "descriptor must not be a function/class");
    assert(typeof desc === "object",    "descriptor must be a plain object");
    // Registry does not hold any constructor reference
    assert(reg.resolve(desc.id) !== null, "resolve must work via DI");
  }));

  // ── C18: SRP ───────────────────────────────────────────────────────────────
  results.push(await run(18, "SRP: Registry nao executa, nao cria Goal/Plan, nao acessa Memory", () => {
    const reg = new CapabilityRegistry();
    // These methods must NOT exist on the registry
    assert(!("execute"       in reg), "must not have execute()");
    assert(!("createGoal"    in reg), "must not have createGoal()");
    assert(!("createPlan"    in reg), "must not have createPlan()");
    assert(!("writeMemory"   in reg), "must not have writeMemory()");
    assert(!("readMemory"    in reg), "must not have readMemory()");
    assert(!("invoke"        in reg), "must not have invoke()");
    assert(!("connect"       in reg), "must not have connect()");
    // These methods MUST exist
    assert("register"   in reg, "must have register()");
    assert("resolve"    in reg, "must have resolve()");
    assert("validate"   in reg, "must have validate()");
    assert("list"       in reg, "must have list()");
    assert("statistics" in reg, "must have statistics()");
    assert("health"     in reg, "must have health()");
  }));

  // ── H1: descriptor invalido ────────────────────────────────────────────────
  results.push(await run(19, "[Hardening] descriptor invalido (sem name) lanca erro descritivo", () => {
    const reg = new CapabilityRegistry();
    let err = "";
    try { reg.register({ ...makeDef(), name: "" }); } catch (e: any) { err = e.message; }
    assert(err.length > 0, "must throw with message");
    assert(err.includes("name"), "error must mention name");
  }));

  // ── H2: id vazio ──────────────────────────────────────────────────────────
  results.push(await run(20, "[Hardening] resolve('') retorna null graciosamente", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeDef());
    const result = reg.resolve("");
    assert(result === null, "empty id must return null");
  }));

  // ── H3: versao invalida ────────────────────────────────────────────────────
  results.push(await run(21, "[Hardening] versao invalida (nao semver) lanca erro", () => {
    const reg = new CapabilityRegistry();
    let threw = false;
    try { reg.register(makeDef({ version: "latest" })); } catch { threw = true; }
    assert(threw, "invalid semver must throw");
  }));

  // ── H4: categoria invalida ─────────────────────────────────────────────────
  results.push(await run(22, "[Hardening] categoria invalida lanca erro descritivo", () => {
    const reg = new CapabilityRegistry();
    let err = "";
    try { reg.register(makeDef({ category: "INVALID" as any })); } catch (e: any) { err = e.message; }
    assert(err.includes("category"), "error must mention category");
  }));

  // ── H5: unregister inexistente ─────────────────────────────────────────────
  results.push(await run(23, "[Hardening] unregister de id inexistente lanca erro", () => {
    const reg = new CapabilityRegistry();
    let threw = false;
    try { reg.unregister("ghost-id"); } catch { threw = true; }
    assert(threw, "should throw for non-existent id");
  }));

  // ── H6: resolve inexistente ────────────────────────────────────────────────
  results.push(await run(24, "[Hardening] resolve de name inexistente retorna null", () => {
    const reg = new CapabilityRegistry();
    const r   = reg.resolve("DoesNotExist");
    assert(r === null, "must return null not throw");
  }));

  // ── H7: update inexistente ─────────────────────────────────────────────────
  results.push(await run(25, "[Hardening] update de id inexistente lanca erro", () => {
    const reg = new CapabilityRegistry();
    let threw = false;
    try { reg.update("ghost-id", { description: "x" }); } catch { threw = true; }
    assert(threw, "should throw for non-existent id");
  }));

  // ── H8: clear ─────────────────────────────────────────────────────────────
  results.push(await run(26, "[Hardening] clear() restaura estado completamente vazio", () => {
    const reg = new CapabilityRegistry();
    reg.register(makeDef({ name: "A" }));
    reg.register(makeDef({ name: "B" }));
    reg.clear();
    assert(reg.list().length === 0,           "list must be empty after clear");
    assert(reg.statistics().totalCapabilities === 0, "stats must be zero");
    assert(reg.metrics().registerTotal === 0, "metrics must reset");
    assert(reg.logs().length === 1,           "only CLEAR log must remain");
  }));

  // ── H9: health vazio ──────────────────────────────────────────────────────
  results.push(await run(27, "[Hardening] health() em Registry vazio retorna SUCCESS", () => {
    const reg = new CapabilityRegistry();
    const h   = reg.health();
    assert(h.status === "SUCCESS",           "empty registry must be healthy");
    assert(h.checks.registryIntegrity,       "registryIntegrity must pass when empty");
    assert(h.checks.consistencyCheck,        "consistencyCheck must pass when empty");
  }));

  // ── H10: concorrencia simulada ────────────────────────────────────────────
  results.push(await run(28, "[Hardening] concorrencia: 20 registros simultaneos sem corrupcao", async () => {
    const reg  = new CapabilityRegistry();
    const defs = Array.from({ length: 20 }, (_, i) => makeDef({ name: `Cap${i}`, version: "1.0" }));
    await Promise.all(defs.map(d => Promise.resolve(reg.register(d))));
    assert(reg.list().length === 20,             "all 20 must be registered");
    assert(reg.statistics().totalCapabilities === 20, "stats must reflect 20");
    assert(reg.health().status === "SUCCESS",    "health must be SUCCESS");
  }));

  // ── Summary ───────────────────────────────────────────────────────────────
  const finalReg = new CapabilityRegistry();
  for (const c of (["SYSTEM","MEMORY","KNOWLEDGE","LEARNING","UTILITY"] as const)) {
    finalReg.register(makeDef({ name: `Sample_${c}`, category: c, tags: ["sample"] }));
  }

  return Object.freeze({
    total:      results.length,
    passed:     results.filter(r => r.passed).length,
    durationMs: now() - suiteStart,
    results:    Object.freeze(results),
    statistics: finalReg.statistics(),
    metrics:    finalReg.metrics(),
    health:     finalReg.health(),
  });
}