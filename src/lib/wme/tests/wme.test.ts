// ─── Working Memory Engine — Test Suite ──────────────────────────────────────
// Sprint 1 · MRI Compliant · MQCCS Coverage Target ≥ 80%

import { WorkingMemoryEngine } from "../WorkingMemoryEngine";
import { AuditLogger }    from "../AuditLogger";
import { EventPublisher } from "../EventPublisher";
import type { IdentityContext, MemoryEvent } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEngine() {
  const publisher = new EventPublisher();
  const audit     = new AuditLogger();
  const engine    = new WorkingMemoryEngine(publisher, audit);
  return { engine, publisher, audit };
}

function ctx(userId = "u1", projectId = "p1"): IdentityContext {
  return { userId, projectId };
}

type TestResult = { name: string; passed: boolean; error?: string; durationMs: number };

async function run(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const t0 = performance.now();
  try {
    await fn();
    return { name, passed: true, durationMs: performance.now() - t0 };
  } catch (e: unknown) {
    return { name, passed: false, error: String(e), durationMs: performance.now() - t0 };
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

// ── Test Cases ────────────────────────────────────────────────────────────────

export async function runAllTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // ── Store ────────────────────────────────────────────────────────────────

  results.push(await run("store: stores item and returns success", async () => {
    const { engine } = makeEngine();
    const r = await engine.store(ctx(), "key1", "value1");
    assert(r.success, "success should be true");
    assert(r.key === "key1", "key should match");
    assert(typeof r.id === "string" && r.id.length > 0, "id should be non-empty");
  }));

  results.push(await run("store: sets expiresAt when ttl > 0", async () => {
    const { engine } = makeEngine();
    const r = await engine.store(ctx(), "k", "v", { ttl: 5000 });
    assert(r.expiresAt !== null, "expiresAt should be set");
    assert(r.expiresAt! > Date.now(), "expiresAt should be in the future");
  }));

  results.push(await run("store: no expiresAt when ttl = 0", async () => {
    const { engine } = makeEngine();
    const r = await engine.store(ctx(), "k", "v", { ttl: 0 });
    assert(r.expiresAt === null, "expiresAt should be null");
  }));

  results.push(await run("store: throws on empty key", async () => {
    const { engine } = makeEngine();
    let threw = false;
    try { await engine.store(ctx(), "", "v"); } catch { threw = true; }
    assert(threw, "should throw on empty key");
  }));

  results.push(await run("store: throws on invalid context (no userId)", async () => {
    const { engine } = makeEngine();
    let threw = false;
    try { await engine.store({ userId: "", projectId: "p1" }, "k", "v"); } catch { threw = true; }
    assert(threw, "should throw on missing userId");
  }));

  results.push(await run("store: throws on invalid context (no projectId)", async () => {
    const { engine } = makeEngine();
    let threw = false;
    try { await engine.store({ userId: "u1", projectId: "" }, "k", "v"); } catch { threw = true; }
    assert(threw, "should throw on missing projectId");
  }));

  results.push(await run("store: overwrites existing key in same context", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx(), "k", "v1");
    await engine.store(ctx(), "k", "v2");
    const r = await engine.retrieve(ctx(), "k");
    assert(r.found && r.item?.value === "v2", "should overwrite value");
  }));

  results.push(await run("store: publishes event", async () => {
    const { engine, publisher } = makeEngine();
    const events: MemoryEvent[] = [];
    publisher.subscribe(e => events.push(e));
    await engine.store(ctx(), "k", "v");
    assert(events.some(e => e.type === "store"), "should publish store event");
  }));

  results.push(await run("store: logs to audit", async () => {
    const { engine, audit } = makeEngine();
    await engine.store(ctx(), "k", "v");
    const logs = audit.getLogs(ctx());
    assert(logs.some(l => l.operation === "store"), "should log store operation");
  }));

  // ── Retrieve ─────────────────────────────────────────────────────────────

  results.push(await run("retrieve: returns item for existing key", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx(), "k", "hello");
    const r = await engine.retrieve(ctx(), "k");
    assert(r.found, "found should be true");
    assert(r.item?.value === "hello", "value should match");
  }));

  results.push(await run("retrieve: returns not-found for missing key", async () => {
    const { engine } = makeEngine();
    const r = await engine.retrieve(ctx(), "missing");
    assert(!r.found, "found should be false");
    assert(r.item === null, "item should be null");
  }));

  results.push(await run("retrieve: returns not-found for expired item", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx(), "k", "v", { ttl: 1 });
    await new Promise(r => setTimeout(r, 10));
    const result = await engine.retrieve(ctx(), "k");
    assert(!result.found, "expired item should not be found");
  }));

  // ── Identity Context Isolation ────────────────────────────────────────────

  results.push(await run("isolation: different users cannot see each other's items", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx("u1", "p1"), "k", "user1-value");
    const r = await engine.retrieve(ctx("u2", "p1"), "k");
    assert(!r.found, "user2 should not see user1's item");
  }));

  results.push(await run("isolation: different projects cannot see each other's items", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx("u1", "p1"), "k", "p1-value");
    const r = await engine.retrieve(ctx("u1", "p2"), "k");
    assert(!r.found, "p2 should not see p1's item");
  }));

  results.push(await run("isolation: same user+project sees its own items", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx("u1", "p1"), "k", "mine");
    const r = await engine.retrieve(ctx("u1", "p1"), "k");
    assert(r.found && r.item?.value === "mine", "should see own item");
  }));

  // ── List ──────────────────────────────────────────────────────────────────

  results.push(await run("list: returns all non-expired items", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx(), "a", 1);
    await engine.store(ctx(), "b", 2);
    const items = await engine.list(ctx());
    assert(items.length === 2, `expected 2 items, got ${items.length}`);
  }));

  results.push(await run("list: filters by priority", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx(), "a", 1, { priority: "high" });
    await engine.store(ctx(), "b", 2, { priority: "low" });
    const items = await engine.list(ctx(), { priority: "high" });
    assert(items.length === 1 && items[0].priority === "high", "should filter by priority");
  }));

  results.push(await run("list: sorts by priority descending", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx(), "a", 1, { priority: "low" });
    await engine.store(ctx(), "b", 2, { priority: "critical" });
    await engine.store(ctx(), "c", 3, { priority: "medium" });
    const items = await engine.list(ctx());
    assert(items[0].priority === "critical", "first item should be critical");
  }));

  results.push(await run("list: excludes expired items", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx(), "a", 1, { ttl: 1 });
    await engine.store(ctx(), "b", 2);
    await new Promise(r => setTimeout(r, 10));
    const items = await engine.list(ctx());
    assert(items.length === 1 && items[0].key === "b", "expired item should be excluded");
  }));

  results.push(await run("list: empty context returns empty array", async () => {
    const { engine } = makeEngine();
    const items = await engine.list(ctx("empty", "empty"));
    assert(items.length === 0, "empty context should return []");
  }));

  // ── Evict ─────────────────────────────────────────────────────────────────

  results.push(await run("evict: removes item from store", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx(), "k", "v");
    const r = await engine.evict(ctx(), "k");
    assert(r.evicted === 1, "should report 1 eviction");
    const check = await engine.retrieve(ctx(), "k");
    assert(!check.found, "item should be gone after eviction");
  }));

  results.push(await run("evict: returns 0 for missing key", async () => {
    const { engine } = makeEngine();
    const r = await engine.evict(ctx(), "ghost");
    assert(r.evicted === 0, "should report 0 evictions");
  }));

  results.push(await run("evictExpired: removes all expired items", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx(), "a", 1, { ttl: 1 });
    await engine.store(ctx(), "b", 2, { ttl: 1 });
    await engine.store(ctx(), "c", 3); // no expiry
    await new Promise(r => setTimeout(r, 20));
    const r = await engine.evictExpired(ctx());
    assert(r.evicted === 2, `should evict 2, got ${r.evicted}`);
    const items = await engine.list(ctx());
    assert(items.length === 1 && items[0].key === "c", "only c should remain");
  }));

  // ── Promote ───────────────────────────────────────────────────────────────

  results.push(await run("promote: changes tier to long_term", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx(), "k", "v", { ttl: 5000 });
    const r = await engine.promote(ctx(), "k");
    assert(r.promoted, "should be promoted");
    assert(r.toTier === "long_term", "tier should be long_term");
    const item = (await engine.retrieve(ctx(), "k")).item;
    assert(item?.tier === "long_term", "item tier should be long_term");
    assert(item?.expiresAt === null, "promoted item should have no expiry");
  }));

  results.push(await run("promote: returns not-promoted for missing key", async () => {
    const { engine } = makeEngine();
    const r = await engine.promote(ctx(), "nope");
    assert(!r.promoted, "should not promote missing key");
  }));

  results.push(await run("promote: publishes promote event", async () => {
    const { engine, publisher } = makeEngine();
    const events: MemoryEvent[] = [];
    publisher.subscribe(e => events.push(e));
    await engine.store(ctx(), "k", "v");
    await engine.promote(ctx(), "k");
    assert(events.some(e => e.type === "promote"), "should publish promote event");
  }));

  // ── Clear ─────────────────────────────────────────────────────────────────

  results.push(await run("clear: removes all items for context", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx(), "a", 1);
    await engine.store(ctx(), "b", 2);
    await engine.clear(ctx());
    const items = await engine.list(ctx());
    assert(items.length === 0, "all items should be cleared");
  }));

  results.push(await run("clear: does not affect other contexts", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx("u1", "p1"), "k", "u1");
    await engine.store(ctx("u2", "p2"), "k", "u2");
    await engine.clear(ctx("u1", "p1"));
    const r = await engine.retrieve(ctx("u2", "p2"), "k");
    assert(r.found, "u2's item should be unaffected");
  }));

  // ── Stats ─────────────────────────────────────────────────────────────────

  results.push(await run("stats: counts live items by priority", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx(), "a", 1, { priority: "high" });
    await engine.store(ctx(), "b", 2, { priority: "high" });
    await engine.store(ctx(), "c", 3, { priority: "low" });
    const s = await engine.stats(ctx());
    assert(s.totalItems === 3, `expected 3, got ${s.totalItems}`);
    assert(s.byPriority.high === 2, "high count should be 2");
    assert(s.byPriority.low === 1, "low count should be 1");
  }));

  results.push(await run("stats: counts expired items separately", async () => {
    const { engine } = makeEngine();
    await engine.store(ctx(), "a", 1, { ttl: 1 });
    await new Promise(r => setTimeout(r, 10));
    const s = await engine.stats(ctx());
    assert(s.expiredItems === 1, "should count 1 expired item");
    assert(s.totalItems === 0, "total live should be 0");
  }));

  // ── AuditLogger ───────────────────────────────────────────────────────────

  results.push(await run("audit: logs are isolated per context", async () => {
    const { engine, audit } = makeEngine();
    await engine.store(ctx("u1", "p1"), "k", "v");
    await engine.store(ctx("u2", "p2"), "k", "v");
    const logs1 = audit.getLogs(ctx("u1", "p1"));
    const logs2 = audit.getLogs(ctx("u2", "p2"));
    assert(logs1.length > 0, "u1 should have logs");
    assert(logs2.length > 0, "u2 should have logs");
    assert(logs1.every(l => l.context.userId === "u1"), "u1 logs should only contain u1 context");
  }));

  results.push(await run("audit: retrieve failure is logged", async () => {
    const { engine, audit } = makeEngine();
    await engine.retrieve(ctx(), "nonexistent");
    const logs = audit.getLogs(ctx());
    const failLog = logs.find(l => l.operation === "retrieve" && !l.success);
    assert(!!failLog, "failed retrieve should be logged");
  }));

  // ── EventPublisher ────────────────────────────────────────────────────────

  results.push(await run("events: unsubscribe works correctly", async () => {
    const { engine, publisher } = makeEngine();
    const events: MemoryEvent[] = [];
    const unsub = publisher.subscribe(e => events.push(e));
    await engine.store(ctx(), "k", "v");
    unsub();
    await engine.store(ctx(), "k2", "v2");
    assert(events.filter(e => e.type === "store").length === 1, "should only capture 1 store event after unsubscribe");
  }));

  results.push(await run("events: listener errors are isolated", async () => {
    const { engine, publisher } = makeEngine();
    publisher.subscribe(() => { throw new Error("listener error"); });
    let threw = false;
    try { await engine.store(ctx(), "k", "v"); } catch { threw = true; }
    assert(!threw, "listener error should not propagate");
  }));

  return results;
}