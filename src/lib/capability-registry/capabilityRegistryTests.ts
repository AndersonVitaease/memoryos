/**
 * CapabilityRegistryTests.ts — Sprint C-03.6.1
 * Suite de certificação — 50 testes.
 *
 * Cobertura:
 *   T01–T08  register()
 *   T09–T13  unregister()
 *   T14–T18  findById()
 *   T19–T26  findByGoalType / Category / Action / Status / Runtime
 *   T27–T30  findAll()
 *   T31–T34  exists() / count()
 *   T35–T38  Explainability
 *   T39–T42  Telemetria
 *   T43–T46  Health
 *   T47–T50  Determinismo e falhas controladas
 */

import { CapabilityRegistry }            from "./CapabilityRegistry";
import { CapabilityRegistryTelemetry }   from "./CapabilityRegistryTelemetry";
import { CapabilitySelectionEngine }     from "@/lib/capability-selection/CapabilitySelectionEngine";
import type { CapabilityDescriptor }     from "@/lib/capability-selection/CapabilitySelectionTypes";

// ── Harness ───────────────────────────────────────────────────────────────────

export interface CRTestCase { id: string; label: string; status: "PASS"|"FAIL"; error?: string; durationMs: number; }
export interface CRTestSuiteReport { sprint: string; total: number; passed: number; failed: number; passRate: string; certified: boolean; cases: CRTestCase[]; durationMs: number; }

function assert(c: boolean, m: string): void { if (!c) throw new Error(m); }

// ── Registry factory (isolated per test) ──────────────────────────────────────

function freshRegistry() {
  const tel = new CapabilityRegistryTelemetry();
  return { reg: new CapabilityRegistry(tel), tel };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const base: CapabilityDescriptor = Object.freeze({
  id: "cap-drive", name: "Drive Resource Retriever", description: "Retrieves files",
  goalTypes: ["retrieve_resource", "list_files"],
  supportedCategories: ["knowledge"],
  supportedActions: ["get", "list"],
  priority: 1, confidenceWeight: 1.0,
  requiredRuntimes: ["google-drive"], status: "ready",
});

const gmail: CapabilityDescriptor = Object.freeze({
  id: "cap-gmail", name: "Gmail Search", description: "Searches emails",
  goalTypes: ["search_email"],
  supportedCategories: ["communication"],
  supportedActions: ["search", "get"],
  priority: 2, confidenceWeight: 0.95,
  requiredRuntimes: ["gmail"], status: "ready",
});

const cal: CapabilityDescriptor = Object.freeze({
  id: "cap-calendar", name: "Calendar Creator", description: "Creates events",
  goalTypes: ["create_event"],
  supportedCategories: ["productivity"],
  supportedActions: ["create", "update"],
  priority: 3, confidenceWeight: 0.9,
  requiredRuntimes: ["google-calendar"], status: "ready",
});

const degraded: CapabilityDescriptor = Object.freeze({
  id: "cap-degraded", name: "Degraded Drive", description: "Degraded",
  goalTypes: ["retrieve_resource"],
  supportedCategories: ["knowledge"],
  supportedActions: ["get"],
  priority: 5, confidenceWeight: 0.5,
  requiredRuntimes: ["google-drive"], status: "degraded",
});

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runCapabilityRegistryTests(): Promise<CRTestSuiteReport> {
  const cases: CRTestCase[] = [];
  const t0Suite = Date.now();

  async function run(id: string, label: string, fn: () => void | Promise<void>): Promise<void> {
    const t0 = Date.now();
    try { await fn(); cases.push({ id, label, status: "PASS", durationMs: Date.now() - t0 }); }
    catch (e) { cases.push({ id, label, status: "FAIL", error: (e as Error).message, durationMs: Date.now() - t0 }); }
  }

  // ── T01–T08: register() ───────────────────────────────────────────────────

  await run("T01", "register(): success=true com descriptor valido", () => {
    const { reg } = freshRegistry();
    const r = reg.register(base);
    assert(r.success, "must succeed");
    if (r.success) assert(r.capability.descriptor.id === "cap-drive", `id: ${r.capability.descriptor.id}`);
  });

  await run("T02", "register(): capability fica disponivel no store", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    assert(reg.exists("cap-drive"), "must exist");
    assert(reg.count() === 1, `count: ${reg.count()}`);
  });

  await run("T03", "register(): descriptor armazenado e frozen", () => {
    const { reg } = freshRegistry();
    const r = reg.register(base);
    assert(r.success, "success");
    if (r.success) {
      assert(Object.isFrozen(r.capability),            "entry must be frozen");
      assert(Object.isFrozen(r.capability.descriptor), "descriptor must be frozen");
    }
  });

  await run("T04", "register(): registeredAt preenchido", () => {
    const { reg } = freshRegistry();
    const r = reg.register(base);
    assert(r.success, "success");
    if (r.success) assert(r.capability.registeredAt > 0, `registeredAt: ${r.capability.registeredAt}`);
  });

  await run("T05", "register(): version salva corretamente", () => {
    const { reg } = freshRegistry();
    const r = reg.register(base, "2.1.0");
    assert(r.success, "success");
    if (r.success) assert(r.capability.version === "2.1.0", `version: ${r.capability.version}`);
  });

  await run("T06", "register(): ID duplicado retorna DUPLICATE_ID", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    const r = reg.register(base);
    assert(!r.success, "must fail");
    if (!r.success) assert(r.reason === "DUPLICATE_ID", `reason: ${r.reason}`);
  });

  await run("T07", "register(): descriptor sem id retorna INVALID_DESCRIPTOR", () => {
    const { reg } = freshRegistry();
    const bad = { ...base, id: "" } as unknown as CapabilityDescriptor;
    const r = reg.register(bad);
    assert(!r.success, "must fail");
    if (!r.success) assert(r.reason === "INVALID_DESCRIPTOR", `reason: ${r.reason}`);
  });

  await run("T08", "register(): confidenceWeight invalido retorna INVALID_DESCRIPTOR", () => {
    const { reg } = freshRegistry();
    const bad = { ...base, id: "bad-weight", confidenceWeight: 1.5 } as unknown as CapabilityDescriptor;
    const r = reg.register(bad);
    assert(!r.success, "must fail");
    if (!r.success) assert(r.reason === "INVALID_DESCRIPTOR", `reason: ${r.reason}`);
  });

  // ── T09–T13: unregister() ─────────────────────────────────────────────────

  await run("T09", "unregister(): retorna true e remove capability", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    const ok = reg.unregister("cap-drive");
    assert(ok, "must return true");
    assert(!reg.exists("cap-drive"), "must not exist after unregister");
  });

  await run("T10", "unregister(): count decrementa", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.register(gmail);
    reg.unregister("cap-drive");
    assert(reg.count() === 1, `count: ${reg.count()}`);
  });

  await run("T11", "unregister(): ID inexistente retorna false", () => {
    const { reg } = freshRegistry();
    const ok = reg.unregister("nao-existe");
    assert(!ok, "must return false");
  });

  await run("T12", "unregister(): nao afeta outras capabilities", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.register(gmail);
    reg.unregister("cap-drive");
    assert(reg.exists("cap-gmail"), "gmail must still exist");
  });

  await run("T13", "unregister(): re-register apos remocao funciona", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.unregister("cap-drive");
    const r = reg.register(base);
    assert(r.success, "must succeed after re-register");
  });

  // ── T14–T18: findById() ───────────────────────────────────────────────────

  await run("T14", "findById(): retorna capability correta", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    const found = reg.findById("cap-drive");
    assert(found !== null, "must find");
    assert(found!.descriptor.name === "Drive Resource Retriever", `name: ${found!.descriptor.name}`);
  });

  await run("T15", "findById(): retorna null para ID inexistente", () => {
    const { reg } = freshRegistry();
    const found = reg.findById("nao-existe");
    assert(found === null, "must be null");
  });

  await run("T16", "findById(): resultado e frozen", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    const found = reg.findById("cap-drive");
    assert(found !== null, "must find");
    assert(Object.isFrozen(found), "must be frozen");
  });

  await run("T17", "findById(): retorna exatamente o descriptor registrado", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    const found = reg.findById("cap-drive");
    assert(found?.descriptor.id === base.id, "descriptor id mismatch");
    assert(found?.descriptor.priority === base.priority, "priority mismatch");
  });

  await run("T18", "findById(): nao lanca excecao para ID vazio", () => {
    const { reg } = freshRegistry();
    let threw = false;
    try { reg.findById(""); } catch { threw = true; }
    assert(!threw, "must not throw");
  });

  // ── T19–T26: Discovery queries ────────────────────────────────────────────

  await run("T19", "findByGoalType(): retorna capability compativel", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.register(gmail);
    const r = reg.findByGoalType("retrieve_resource");
    assert(r.count === 1, `count: ${r.count}`);
    assert(r.found[0].descriptor.id === "cap-drive", `id: ${r.found[0].descriptor.id}`);
  });

  await run("T20", "findByGoalType(): goalTypes vazio aceita qualquer tipo", () => {
    const { reg } = freshRegistry();
    const universal: CapabilityDescriptor = { ...base, id: "cap-universal", goalTypes: [] };
    reg.register(universal);
    const r = reg.findByGoalType("anything");
    assert(r.count === 1, `count: ${r.count}`);
  });

  await run("T21", "findByGoalType(): retorna vazio quando nenhuma compativel", () => {
    const { reg } = freshRegistry();
    reg.register(gmail);
    const r = reg.findByGoalType("create_event");
    assert(r.count === 0, `count: ${r.count}`);
  });

  await run("T22", "findByCategory(): retorna capabilities da categoria", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.register(gmail);
    reg.register(cal);
    const r = reg.findByCategory("knowledge");
    assert(r.count === 1, `count: ${r.count}`);
    assert(r.found[0].descriptor.id === "cap-drive", `id: ${r.found[0].descriptor.id}`);
  });

  await run("T23", "findByAction(): retorna capabilities que suportam action", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.register(gmail);
    const r = reg.findByAction("get");
    assert(r.count === 2, `count: ${r.count}`); // both support "get"
  });

  await run("T24", "findByStatus(): retorna apenas capabilities com status=ready", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.register(degraded);
    const r = reg.findByStatus("ready");
    assert(r.count === 1, `count: ${r.count}`);
    assert(r.found[0].descriptor.id === "cap-drive", `id: ${r.found[0].descriptor.id}`);
  });

  await run("T25", "findByRuntime(): retorna capabilities com runtime compativel", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.register(gmail);
    reg.register(cal);
    const r = reg.findByRuntime("google-drive");
    assert(r.count === 1, `count: ${r.count}`);
    assert(r.found[0].descriptor.id === "cap-drive", `id: ${r.found[0].descriptor.id}`);
  });

  await run("T26", "findByRuntime(): requiredRuntimes vazio aceita qualquer runtime", () => {
    const { reg } = freshRegistry();
    const noRt: CapabilityDescriptor = { ...base, id: "cap-no-rt", requiredRuntimes: [] };
    reg.register(noRt);
    const r = reg.findByRuntime("anything");
    assert(r.count === 1, `count: ${r.count}`);
  });

  // ── T27–T30: findAll() ────────────────────────────────────────────────────

  await run("T27", "findAll(): retorna todas as capabilities", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.register(gmail);
    reg.register(cal);
    const all = reg.findAll();
    assert(all.length === 3, `length: ${all.length}`);
  });

  await run("T28", "findAll(): retorna lista frozen", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    const all = reg.findAll();
    assert(Object.isFrozen(all), "must be frozen");
  });

  await run("T29", "findAll(): retorna vazio quando registry limpo", () => {
    const { reg } = freshRegistry();
    const all = reg.findAll();
    assert(all.length === 0, `length: ${all.length}`);
  });

  await run("T30", "findAll(): nao altera estado interno ao ser chamado", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.findAll();
    reg.findAll();
    assert(reg.count() === 1, `count: ${reg.count()}`);
  });

  // ── T31–T34: exists() / count() ───────────────────────────────────────────

  await run("T31", "exists(): true para ID registrado", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    assert(reg.exists("cap-drive"), "must exist");
  });

  await run("T32", "exists(): false para ID nao registrado", () => {
    const { reg } = freshRegistry();
    assert(!reg.exists("cap-drive"), "must not exist");
  });

  await run("T33", "count(): incrementa ao registrar", () => {
    const { reg } = freshRegistry();
    assert(reg.count() === 0, "start 0");
    reg.register(base);
    assert(reg.count() === 1, "after 1 register");
    reg.register(gmail);
    assert(reg.count() === 2, "after 2 registers");
  });

  await run("T34", "clear(): remove todas e count=0", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.register(gmail);
    reg.clear();
    assert(reg.count() === 0, `count: ${reg.count()}`);
    assert(!reg.exists("cap-drive"), "must not exist after clear");
  });

  // ── T35–T38: Explainability ───────────────────────────────────────────────

  await run("T35", "explainability: discovery result inclui criterion e criterionValue", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    const r = reg.findByGoalType("retrieve_resource");
    assert(r.criterion === "goalType", `criterion: ${r.criterion}`);
    assert(r.criterionValue === "retrieve_resource", `value: ${r.criterionValue}`);
  });

  await run("T36", "explainability: explanation menciona capabilities found", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    const r = reg.findByGoalType("retrieve_resource");
    assert(r.explanation.includes("Capabilities found: 1"), `explanation: ${r.explanation}`);
  });

  await run("T37", "explainability: explanation menciona IDs encontrados", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    const r = reg.findByGoalType("retrieve_resource");
    assert(r.explanation.includes("cap-drive"), `explanation: ${r.explanation}`);
  });

  await run("T38", "explainability: explanation menciona duracao", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    const r = reg.findByGoalType("retrieve_resource");
    assert(r.explanation.includes("Duration:"), `explanation: ${r.explanation}`);
  });

  // ── T39–T42: Telemetria ───────────────────────────────────────────────────

  await run("T39", "telemetria: CapabilityRegistered emitido ao registrar", () => {
    const { reg, tel } = freshRegistry();
    reg.register(base);
    assert(tel.ofType("CapabilityRegistered").length === 1, "registered event");
    assert(tel.ofType("CapabilityRegistered")[0].capabilityId === "cap-drive", "id in event");
  });

  await run("T40", "telemetria: DuplicateRegistrationRejected emitido", () => {
    const { reg, tel } = freshRegistry();
    reg.register(base);
    reg.register(base);
    assert(tel.ofType("DuplicateRegistrationRejected").length === 1, "dup event");
  });

  await run("T41", "telemetria: CapabilityDiscovery emitido no findByGoalType", () => {
    const { reg, tel } = freshRegistry();
    reg.register(base);
    reg.findByGoalType("retrieve_resource");
    assert(tel.ofType("CapabilityDiscovery").length >= 1, "discovery event");
  });

  await run("T42", "telemetria: CapabilityRemoved emitido ao unregister", () => {
    const { reg, tel } = freshRegistry();
    reg.register(base);
    reg.unregister("cap-drive");
    assert(tel.ofType("CapabilityRemoved").length === 1, "removed event");
  });

  // ── T43–T46: Health ───────────────────────────────────────────────────────

  await run("T43", "health: READY com zero erros", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    assert(reg.health().status === "READY", `status: ${reg.health().status}`);
  });

  await run("T44", "health: registeredCount correto", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.register(gmail);
    assert(reg.health().registeredCount === 2, `count: ${reg.health().registeredCount}`);
  });

  await run("T45", "health: totalLookups incrementa", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.findById("cap-drive");
    reg.findById("cap-drive");
    assert(reg.health().totalLookups === 2, `lookups: ${reg.health().totalLookups}`);
  });

  await run("T46", "health: totalDiscoveries incrementa", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.findByGoalType("retrieve_resource");
    reg.findByCategory("knowledge");
    assert(reg.health().totalDiscoveries === 2, `discoveries: ${reg.health().totalDiscoveries}`);
  });

  // ── T47–T50: Determinismo e integração ───────────────────────────────────

  await run("T47", "determinismo: mesma query retorna mesmo resultado em 5 iteracoes", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.register(gmail);
    const results = Array.from({ length: 5 }, () =>
      reg.findByGoalType("retrieve_resource").found.map(c => c.descriptor.id).join(","),
    );
    assert(new Set(results).size === 1, `non-det: ${results.join(" | ")}`);
  });

  await run("T48", "determinismo: count estavel apos multiplas consultas", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    for (let i = 0; i < 10; i++) { reg.findAll(); reg.findByGoalType("retrieve_resource"); }
    assert(reg.count() === 1, `count: ${reg.count()}`);
  });

  await run("T49", "integracao: Registry → SelectionEngine seleciona corretamente", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.register(gmail);
    reg.register(cal);
    // Use registry as the source for the engine
    const caps = reg.findAll().map(c => c.descriptor);
    const engine = new CapabilitySelectionEngine();
    const r = engine.select({
      goal: { id: "g-int", type: "retrieve_resource", category: "knowledge", action: "get", priority: "high", description: "test" },
      availableCapabilities: caps,
    });
    assert(r.success, `engine result: ${r.explanation?.slice(0, 80)}`);
    assert(r.capabilityId === "cap-drive", `selected: ${r.capabilityId}`);
  });

  await run("T50", "integracao: Registry.findByGoalType → SelectionEngine — fluxo completo", () => {
    const { reg } = freshRegistry();
    reg.register(base);
    reg.register(gmail);
    reg.register(cal);
    const goal = { id: "g-full", type: "search_email", category: "communication", action: "search", priority: "medium", description: "search" };
    const caps = reg.findByGoalType(goal.type).found.map(c => c.descriptor);
    const engine = new CapabilitySelectionEngine();
    const r = engine.select({ goal, availableCapabilities: caps });
    assert(r.success, `engine: ${r.explanation?.slice(0, 80)}`);
    assert(r.capabilityId === "cap-gmail", `selected: ${r.capabilityId}`);
  });

  // ── Summary ───────────────────────────────────────────────────────────────

  const passed = cases.filter(c => c.status === "PASS").length;
  const failed = cases.filter(c => c.status === "FAIL").length;
  return {
    sprint: "C-03.6.1", total: cases.length, passed, failed,
    passRate: `${Math.round(passed / cases.length * 100)}%`,
    certified: failed === 0, cases, durationMs: Date.now() - t0Suite,
  };
}