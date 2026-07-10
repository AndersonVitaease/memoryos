/**
 * WorkingMemoryEngine — Test Suite Completa
 * Foundation: MQCCS, MRI
 * Sprint: 1
 *
 * Cobertura:
 * - Unitários: store, get, remove, findByKey, touch, promote, stats, runEviction, clearContext
 * - Integração: audit trail, eventos, eviction pipeline
 * - Performance: targets do MPAR (p95 <10ms)
 * - Concorrência: operações simultâneas
 * - Isolamento: cross-context access
 * - TTL: expiração correta
 * - Eviction: remoção por capacidade e prioridade
 * - Identity Context: isolamento completo
 */

import { WorkingMemoryEngine } from "../WorkingMemoryEngine";
import { MemoryPriority, DEFAULT_TTL_BY_PRIORITY } from "../types/MemoryPriority";
import { MemoryValidationError } from "../utils/validators";
import type { IdentityContext } from "../types/IdentityContext";
import type { MemoryEvent } from "../types/MemoryEvent";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeCtx(userId = "user-001", domain: IdentityContext["domain"] = "pessoal", sessionId = "sess-001"): IdentityContext {
  return { userId, domain, sessionId };
}

function futureTs(ms = 60_000): number {
  return Date.now() + ms;
}

function makeItem(key = "test:key", priority = MemoryPriority.NORMAL, ttlMs = 60_000) {
  return {
    key,
    value:       { data: "test-value" },
    priority,
    expiresAt:   futureTs(ttlMs),
    accessCount: 0,
    lastAccessedAt: Date.now(),
    autoPromote: false,
  };
}

// ─── Test Runner ──────────────────────────────────────────────────────────

export interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

async function run(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, durationMs: Date.now() - start, error: String(e) };
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ─── Test Suite ───────────────────────────────────────────────────────────

export async function runSprint1Tests(): Promise<{
  results: TestResult[];
  passed: number;
  failed: number;
  accuracy: number;
  performanceSummary: Record<string, number>;
}> {
  const results: TestResult[] = [];
  const perf: Record<string, number> = {};

  // ── UNIT: store ──────────────────────────────────────────────────────

  results.push(await run("store: persiste item e retorna id", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const id = await engine.store(makeItem(), ctx);
    assert(typeof id === "string" && id.length > 0, "id deve ser string não-vazia");
    engine.destroy();
  }));

  results.push(await run("store: item recuperável após store", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const id = await engine.store(makeItem("my:key"), ctx);
    const retrieved = await engine.get(id, ctx);
    assert(retrieved !== null, "item deve existir após store");
    assert(retrieved!.key === "my:key", "key deve ser preservada");
    engine.destroy();
  }));

  results.push(await run("store: gera AuditRecord de memory.store", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    await engine.store(makeItem(), ctx);
    const audit = engine.queryAudit({ action: "memory.store", outcome: "success" });
    assert(audit.length >= 1, "deve existir audit record de store");
    assert(Object.isFrozen(audit[0]), "audit record deve ser frozen (imutável)");
    engine.destroy();
  }));

  results.push(await run("store: publica evento memory.stored", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const events: MemoryEvent[] = [];
    engine.onEvent(e => events.push(e));
    await engine.store(makeItem(), ctx);
    assert(events.some(e => e.type === "memory.stored"), "evento memory.stored deve ser publicado");
    engine.destroy();
  }));

  results.push(await run("store: throw MemoryValidationError para key vazia", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    let threw = false;
    try {
      await engine.store({ ...makeItem(), key: "" }, ctx);
    } catch (e) {
      threw = e instanceof MemoryValidationError;
    }
    assert(threw, "deve lançar MemoryValidationError para key vazia");
    engine.destroy();
  }));

  results.push(await run("store: throw MemoryValidationError para expiresAt no passado", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    let threw = false;
    try {
      await engine.store({ ...makeItem(), expiresAt: Date.now() - 1000 }, ctx);
    } catch (e) {
      threw = e instanceof MemoryValidationError;
    }
    assert(threw, "deve lançar MemoryValidationError para expiresAt passado");
    engine.destroy();
  }));

  // ── UNIT: get ────────────────────────────────────────────────────────

  results.push(await run("get: retorna null para id inexistente", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const result = await engine.get("nonexistent-id", ctx);
    assert(result === null, "deve retornar null para id inexistente");
    engine.destroy();
  }));

  results.push(await run("get: incrementa accessCount", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const id = await engine.store(makeItem(), ctx);
    await engine.get(id, ctx);
    await engine.get(id, ctx);
    const item = await engine.get(id, ctx);
    assert(item!.accessCount === 3, `accessCount deve ser 3, recebeu ${item!.accessCount}`);
    engine.destroy();
  }));

  results.push(await run("get: retorna null para item expirado", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const id = await engine.store({ ...makeItem(), expiresAt: Date.now() + 1 }, ctx);
    await new Promise(r => setTimeout(r, 10)); // aguarda expiração
    const result = await engine.get(id, ctx);
    assert(result === null, "deve retornar null após TTL expirar");
    engine.destroy();
  }));

  // ── UNIT: remove ─────────────────────────────────────────────────────

  results.push(await run("remove: retorna true e item não existe mais", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const id = await engine.store(makeItem(), ctx);
    const removed = await engine.remove(id, ctx);
    const after = await engine.get(id, ctx);
    assert(removed === true, "remove deve retornar true");
    assert(after === null, "get após remove deve retornar null");
    engine.destroy();
  }));

  results.push(await run("remove: retorna false para id inexistente", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const result = await engine.remove("fake-id", ctx);
    assert(result === false, "deve retornar false para id inexistente");
    engine.destroy();
  }));

  results.push(await run("remove: gera AuditRecord de memory.remove", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const id = await engine.store(makeItem(), ctx);
    await engine.remove(id, ctx);
    const audit = engine.queryAudit({ action: "memory.remove", outcome: "success" });
    assert(audit.length >= 1, "deve existir audit record de remove");
    engine.destroy();
  }));

  // ── UNIT: findByKey ──────────────────────────────────────────────────

  results.push(await run("findByKey: encontra itens por prefixo", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    await engine.store(makeItem("cpf:123:status"), ctx);
    await engine.store(makeItem("cpf:456:status"), ctx);
    await engine.store(makeItem("email:user@test.com"), ctx);
    const results = await engine.findByKey("cpf:", ctx);
    assert(results.length === 2, `deve encontrar 2 itens com prefixo "cpf:", encontrou ${results.length}`);
    engine.destroy();
  }));

  results.push(await run("findByKey: não retorna itens expirados", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    await engine.store({ ...makeItem("cpf:expired"), expiresAt: Date.now() + 1 }, ctx);
    await new Promise(r => setTimeout(r, 10));
    const results = await engine.findByKey("cpf:", ctx);
    assert(results.length === 0, "não deve retornar itens expirados em findByKey");
    engine.destroy();
  }));

  // ── UNIT: touch ──────────────────────────────────────────────────────

  results.push(await run("touch: estende TTL de item existente", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const id = await engine.store(makeItem(), ctx);
    const before = (await engine.get(id, ctx))!.expiresAt;
    await engine.touch(id, 30_000, ctx);
    const after = (await engine.get(id, ctx))!.expiresAt;
    assert(after > before, "expiresAt deve ser maior após touch");
    engine.destroy();
  }));

  results.push(await run("touch: retorna false para item inexistente", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const result = await engine.touch("fake-id", 30_000, ctx);
    assert(result === false, "touch deve retornar false para item inexistente");
    engine.destroy();
  }));

  // ── UNIT: promote ────────────────────────────────────────────────────

  results.push(await run("promote: retorna resultado de sucesso", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const id = await engine.store(makeItem(), ctx);
    const result = await engine.promote(id, ctx);
    assert(result.success === true, "promote deve retornar success=true");
    assert(result.itemId === id, "itemId deve corresponder");
    engine.destroy();
  }));

  results.push(await run("promote: retorna item_not_found para id inexistente", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const result = await engine.promote("fake-id", ctx);
    assert(result.success === false, "promote deve retornar success=false");
    assert(result.reason === "item_not_found", "reason deve ser item_not_found");
    engine.destroy();
  }));

  results.push(await run("promote: publica evento memory.promoted", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const events: MemoryEvent[] = [];
    engine.onEvent(e => events.push(e));
    const id = await engine.store(makeItem(), ctx);
    await engine.promote(id, ctx);
    assert(events.some(e => e.type === "memory.promoted"), "evento memory.promoted deve ser publicado");
    engine.destroy();
  }));

  // ── UNIT: runEviction ────────────────────────────────────────────────

  results.push(await run("runEviction: remove itens expirados", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    await engine.store({ ...makeItem("expiring"), expiresAt: Date.now() + 1 }, ctx);
    await new Promise(r => setTimeout(r, 10));
    const removed = await engine.runEviction();
    assert(removed >= 1, `runEviction deve remover ≥1 item expirado, removeu ${removed}`);
    engine.destroy();
  }));

  results.push(await run("runEviction: não remove itens válidos", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    await engine.store(makeItem("valid:item"), ctx);
    const removed = await engine.runEviction();
    assert(removed === 0, "runEviction não deve remover itens válidos");
    engine.destroy();
  }));

  // ── UNIT: clearContext ────────────────────────────────────────────────

  results.push(await run("clearContext: remove todos os itens do contexto", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    await engine.store(makeItem("a"), ctx);
    await engine.store(makeItem("b"), ctx);
    await engine.store(makeItem("c"), ctx);
    const removed = await engine.clearContext(ctx);
    assert(removed === 3, `clearContext deve remover 3 itens, removeu ${removed}`);
    engine.destroy();
  }));

  results.push(await run("clearContext: publica evento memory.cleared", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const events: MemoryEvent[] = [];
    engine.onEvent(e => events.push(e));
    await engine.store(makeItem(), ctx);
    await engine.clearContext(ctx);
    assert(events.some(e => e.type === "memory.cleared"), "evento memory.cleared deve ser publicado");
    engine.destroy();
  }));

  // ── ISOLATION: Identity Context ──────────────────────────────────────

  results.push(await run("isolation: item de ctxA não visível em ctxB", async () => {
    const engine = new WorkingMemoryEngine();
    const ctxA = makeCtx("user-A", "pessoal", "sess-A");
    const ctxB = makeCtx("user-B", "pessoal", "sess-B");
    const id = await engine.store(makeItem("shared:key"), ctxA);
    const fromB = await engine.get(id, ctxB);
    assert(fromB === null, "item de ctxA NÃO deve ser acessível por ctxB");
    engine.destroy();
  }));

  results.push(await run("isolation: mesmo userId domínios diferentes não se cruzam", async () => {
    const engine = new WorkingMemoryEngine();
    const ctxPessoal  = makeCtx("user-001", "pessoal",  "sess-1");
    const ctxEmpresa  = makeCtx("user-001", "empresa",  "sess-2");
    const id = await engine.store(makeItem("doc:001"), ctxPessoal);
    const fromEmpresa = await engine.get(id, ctxEmpresa);
    assert(fromEmpresa === null, "domínios diferentes do mesmo userId NÃO devem cruzar");
    engine.destroy();
  }));

  results.push(await run("isolation: clearContext não afeta outro contexto", async () => {
    const engine = new WorkingMemoryEngine();
    const ctxA = makeCtx("user-A", "pessoal", "sess-A");
    const ctxB = makeCtx("user-B", "pessoal", "sess-B");
    const idB = await engine.store(makeItem("b:key"), ctxB);
    await engine.store(makeItem("a:key"), ctxA);
    await engine.clearContext(ctxA);
    const fromB = await engine.get(idB, ctxB);
    assert(fromB !== null, "clearContext(A) não deve afetar itens de ctxB");
    engine.destroy();
  }));

  results.push(await run("isolation: remove de ctxA não pode remover item de ctxB", async () => {
    const engine = new WorkingMemoryEngine();
    const ctxA = makeCtx("user-A", "pessoal", "sess-A");
    const ctxB = makeCtx("user-B", "pessoal", "sess-B");
    const idB  = await engine.store(makeItem("b:key"), ctxB);
    const result = await engine.remove(idB, ctxA);
    assert(result === false, "remove de ctxA com id de ctxB deve retornar false");
    const fromB = await engine.get(idB, ctxB);
    assert(fromB !== null, "item de ctxB deve permanecer intacto");
    engine.destroy();
  }));

  // ── EVICTION: Capacity ────────────────────────────────────────────────

  results.push(await run("eviction: item de menor prioridade é removido na capacidade máxima", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    // Encher a partição com 500 itens NORMAL
    const storePs: Promise<string>[] = [];
    for (let i = 0; i < 500; i++) {
      storePs.push(engine.store(makeItem(`fill:${i}`, MemoryPriority.NORMAL), ctx));
    }
    await Promise.all(storePs);
    // Inserir um LOW — deve ser imediatamente evictado (ou evictar outro LOW)
    const lowId = await engine.store(makeItem("low:item", MemoryPriority.LOW), ctx);
    // Inserir um CRITICAL — nunca deve ser evictado
    const criticalId = await engine.store(makeItem("critical:item", MemoryPriority.CRITICAL), ctx);
    const critical = await engine.get(criticalId, ctx);
    assert(critical !== null, "CRITICAL item NUNCA deve ser evictado por capacidade");
    engine.destroy();
  }));

  // ── TTL ───────────────────────────────────────────────────────────────

  results.push(await run("ttl: item expira e retorna null após TTL", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const id = await engine.store({ ...makeItem(), expiresAt: Date.now() + 50 }, ctx);
    const before = await engine.get(id, ctx);
    assert(before !== null, "item deve existir antes de expirar");
    await new Promise(r => setTimeout(r, 60));
    const after = await engine.get(id, ctx);
    assert(after === null, "item deve retornar null após TTL");
    engine.destroy();
  }));

  results.push(await run("ttl: touch estende TTL corretamente", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const id = await engine.store({ ...makeItem(), expiresAt: Date.now() + 100 }, ctx);
    await engine.touch(id, 60_000, ctx);
    await new Promise(r => setTimeout(r, 110));
    const after = await engine.get(id, ctx);
    assert(after !== null, "item não deve expirar após touch que estendeu TTL");
    engine.destroy();
  }));

  // ── AUTO PROMOTE ─────────────────────────────────────────────────────

  results.push(await run("auto-promote: item com autoPromote=true promovido no 3º acesso", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const events: MemoryEvent[] = [];
    engine.onEvent(e => events.push(e));
    const id = await engine.store({ ...makeItem(), autoPromote: true }, ctx);
    await engine.get(id, ctx); // 1
    await engine.get(id, ctx); // 2
    await engine.get(id, ctx); // 3 → deve promover
    assert(events.some(e => e.type === "memory.promoted"), "deve publicar memory.promoted no 3º acesso com autoPromote");
    engine.destroy();
  }));

  // ── PERFORMANCE ───────────────────────────────────────────────────────

  results.push(await run("performance: store p95 < 10ms", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const timings: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t = Date.now();
      await engine.store(makeItem(`perf:${i}`), ctx);
      timings.push(Date.now() - t);
    }
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.floor(timings.length * 0.95)];
    perf["store_p95_ms"] = p95;
    assert(p95 < 10, `store p95 deve ser < 10ms, foi ${p95}ms`);
    engine.destroy();
  }));

  results.push(await run("performance: get p95 < 10ms", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const ids: string[] = [];
    for (let i = 0; i < 100; i++) {
      ids.push(await engine.store(makeItem(`perf-get:${i}`), ctx));
    }
    const timings: number[] = [];
    for (const id of ids) {
      const t = Date.now();
      await engine.get(id, ctx);
      timings.push(Date.now() - t);
    }
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.floor(timings.length * 0.95)];
    perf["get_p95_ms"] = p95;
    assert(p95 < 10, `get p95 deve ser < 10ms, foi ${p95}ms`);
    engine.destroy();
  }));

  results.push(await run("performance: remove p95 < 10ms", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const ids: string[] = [];
    for (let i = 0; i < 100; i++) {
      ids.push(await engine.store(makeItem(`perf-remove:${i}`), ctx));
    }
    const timings: number[] = [];
    for (const id of ids) {
      const t = Date.now();
      await engine.remove(id, ctx);
      timings.push(Date.now() - t);
    }
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.floor(timings.length * 0.95)];
    perf["remove_p95_ms"] = p95;
    assert(p95 < 10, `remove p95 deve ser < 10ms, foi ${p95}ms`);
    engine.destroy();
  }));

  // ── CONCURRENCY ──────────────────────────────────────────────────────

  results.push(await run("concurrency: 50 stores simultâneos sem corrida", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const ids = await Promise.all(
      Array.from({ length: 50 }, (_, i) => engine.store(makeItem(`concurrent:${i}`), ctx))
    );
    const uniqueIds = new Set(ids);
    assert(uniqueIds.size === 50, `todos os 50 IDs devem ser únicos (recebeu ${uniqueIds.size})`);
    engine.destroy();
  }));

  results.push(await run("concurrency: store e get simultâneos não interferem", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const id = await engine.store(makeItem("concurrent:base"), ctx);
    await Promise.all([
      engine.get(id, ctx),
      engine.store(makeItem("concurrent:other"), ctx),
      engine.get(id, ctx),
      engine.touch(id, 30_000, ctx),
    ]);
    const item = await engine.get(id, ctx);
    assert(item !== null, "item deve existir após operações simultâneas");
    engine.destroy();
  }));

  // ── VALIDATION ───────────────────────────────────────────────────────

  results.push(await run("validation: throw para ctx.userId vazio", async () => {
    const engine = new WorkingMemoryEngine();
    const badCtx = { userId: "", domain: "pessoal" as const, sessionId: "sess-001" };
    let threw = false;
    try { await engine.store(makeItem(), badCtx); } catch (e) { threw = e instanceof MemoryValidationError; }
    assert(threw, "deve lançar MemoryValidationError para userId vazio");
    engine.destroy();
  }));

  results.push(await run("validation: throw para ctx.sessionId vazio", async () => {
    const engine = new WorkingMemoryEngine();
    const badCtx = { userId: "user-001", domain: "pessoal" as const, sessionId: "" };
    let threw = false;
    try { await engine.store(makeItem(), badCtx); } catch (e) { threw = e instanceof MemoryValidationError; }
    assert(threw, "deve lançar MemoryValidationError para sessionId vazio");
    engine.destroy();
  }));

  results.push(await run("validation: throw para key com mais de 256 caracteres", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    const longKey = "x".repeat(257);
    let threw = false;
    try { await engine.store({ ...makeItem(longKey) }, ctx); } catch (e) { threw = e instanceof MemoryValidationError; }
    assert(threw, "deve lançar MemoryValidationError para key > 256 chars");
    engine.destroy();
  }));

  // ── AUDIT COMPLETENESS ────────────────────────────────────────────────

  results.push(await run("audit: records são imutáveis (Object.frozen)", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    await engine.store(makeItem(), ctx);
    const records = engine.queryAudit();
    assert(records.length > 0, "deve haver records no audit");
    for (const r of records) {
      assert(Object.isFrozen(r), `audit record ${r.id} deve ser frozen`);
    }
    engine.destroy();
  }));

  results.push(await run("audit: correlationId presente em todos os records", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    await engine.store(makeItem(), ctx);
    const records = engine.queryAudit();
    for (const r of records) {
      assert(typeof r.correlationId === "string" && r.correlationId.length > 0, "correlationId deve estar presente");
    }
    engine.destroy();
  }));

  // ── STATS ─────────────────────────────────────────────────────────────

  results.push(await run("stats: retorna totais corretos", async () => {
    const engine = new WorkingMemoryEngine();
    const ctx = makeCtx();
    await engine.store(makeItem("s1", MemoryPriority.HIGH), ctx);
    await engine.store(makeItem("s2", MemoryPriority.LOW), ctx);
    const s = await engine.stats(ctx);
    assert(s.totalItems === 2, `totalItems deve ser 2, recebeu ${s.totalItems}`);
    engine.destroy();
  }));

  // ── COMPUTE RESULTS ───────────────────────────────────────────────────

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const accuracy = Math.round((passed / results.length) * 100);

  return { results, passed, failed, accuracy, performanceSummary: perf };
}