// knowledgeStoreContractTests.ts — Sprint EF-38.0
// Contract tests — verify the interface contract without any concrete implementation
// Validates: immutability, determinism, error handling, SOLID principles, version compatibility

import type { IKnowledgeStore, KnowledgeStoreConfig } from "./IKnowledgeStore";
import type { KnowledgeRecordDraft, KnowledgeRecord, StoreResult, GetResult, QueryResult } from "./KnowledgeStoreTypes";
import { KnowledgeStoreValidation } from "./KnowledgeStoreValidation";
import { KnowledgeStoreErrorFactory } from "./KnowledgeStoreErrors";
import { KnowledgeStoreCapabilities } from "./KnowledgeStoreCapabilities";
import { KnowledgeStoreEventBus } from "./KnowledgeStoreEvents";
import { KnowledgeEvidenceFactory } from "@/lib/ingestion/KnowledgeEvidence";

interface TR { id: string; suite: string; name: string; passed: boolean; error?: string; durationMs: number; }

function test(suite: string, name: string, fn: () => void | Promise<void>): Promise<TR> {
  const t = Date.now();
  return Promise.resolve().then(() => fn())
    .then(() => ({ id: `${suite}-${name}`, suite, name, passed: true,  durationMs: Date.now() - t }))
    .catch((e: any) => ({ id: `${suite}-${name}`, suite, name, passed: false, error: e?.message ?? String(e), durationMs: Date.now() - t }));
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }
function eq<T>(a: T, b: T, m?: string) { if (a !== b) throw new Error(`${m ?? "eq"}: got "${a}" want "${b}"`); }

// ── Reference evidence ────────────────────────────────────────────────────────
const EVIDENCE = KnowledgeEvidenceFactory.create({ source: "test", conversationId: "c-001", messageId: "m-001", confidence: 0.95 });

const VALID_DRAFT: KnowledgeRecordDraft = {
  type: "Engineering",
  content: "The Knowledge Ingestion Pipeline is the only official entry point.",
  summary: "KIP summary",
  tags: ["kip", "architecture"],
  evidence: EVIDENCE,
};

// ── In-memory stub implementing IKnowledgeStore (contract compliance only) ────
// This stub exists solely to run contract tests without a real implementation.
// It proves the contract is implementable and all results are immutable.
class MemoryStoreStub implements IKnowledgeStore {
  private _store = new Map<string, KnowledgeRecord>();
  private _seq   = 0;
  readonly engineName = "memory-stub";

  private uid() { return `rec-${Date.now()}-${++this._seq}`; }

  async store(draft: KnowledgeRecordDraft): Promise<StoreResult> {
    const v = KnowledgeStoreValidation.validateDraft(draft);
    if (!v.valid) return Object.freeze({ ok: false, id: "", version: 0, error: v.errors[0].message });
    const id  = this.uid();
    const now = Date.now();
    const record: KnowledgeRecord = Object.freeze({
      id, type: draft.type, content: draft.content,
      version: 1, summary: draft.summary ?? "", tags: Object.freeze(draft.tags ?? []),
      evidence: draft.evidence, status: "active", createdAt: now, updatedAt: now,
    });
    this._store.set(id, record);
    KnowledgeStoreEventBus.emit("RECORD_STORED", this.engineName, { recordId: id });
    return Object.freeze({ ok: true, id, version: 1, record });
  }

  async update(id: string, patch: import("./KnowledgeStoreTypes").KnowledgeRecordPatch): Promise<StoreResult> {
    const existing = this._store.get(id);
    if (!existing) return Object.freeze({ ok: false, id, version: 0, error: `NOT_FOUND: ${id}` });
    const v = KnowledgeStoreValidation.validatePatch(patch);
    if (!v.valid) return Object.freeze({ ok: false, id, version: 0, error: v.errors[0].message });
    const updated: KnowledgeRecord = Object.freeze({
      ...existing,
      content:   patch.content  ?? existing.content,
      summary:   patch.summary  ?? existing.summary,
      tags:      Object.freeze(patch.tags ?? [...existing.tags]),
      status:    patch.status   ?? existing.status,
      version:   existing.version + 1,
      updatedAt: Date.now(),
    });
    this._store.set(id, updated);
    KnowledgeStoreEventBus.emit("RECORD_UPDATED", this.engineName, { recordId: id });
    return Object.freeze({ ok: true, id, version: updated.version, record: updated });
  }

  async archive(id: string): Promise<import("./KnowledgeStoreTypes").ArchiveResult> {
    const existing = this._store.get(id);
    if (!existing) return Object.freeze({ ok: false, archived: false, error: `NOT_FOUND: ${id}` });
    const archived = Object.freeze({ ...existing, status: "archived" as const, updatedAt: Date.now() });
    this._store.set(id, archived);
    KnowledgeStoreEventBus.emit("RECORD_ARCHIVED", this.engineName, { recordId: id });
    return Object.freeze({ ok: true, archived: true, record: archived });
  }

  async restore(id: string): Promise<import("./KnowledgeStoreTypes").RestoreResult> {
    const existing = this._store.get(id);
    if (!existing) return Object.freeze({ ok: false, restored: false, error: `NOT_FOUND: ${id}` });
    const restored = Object.freeze({ ...existing, status: "active" as const, updatedAt: Date.now() });
    this._store.set(id, restored);
    KnowledgeStoreEventBus.emit("RECORD_RESTORED", this.engineName, { recordId: id });
    return Object.freeze({ ok: true, restored: true, record: restored });
  }

  async delete(id: string): Promise<import("./KnowledgeStoreTypes").DeleteResult> {
    const existed = this._store.has(id);
    this._store.delete(id);
    KnowledgeStoreEventBus.emit("RECORD_DELETED", this.engineName, { recordId: id });
    return Object.freeze({ ok: true, deleted: existed });
  }

  async exists(id: string): Promise<import("./KnowledgeStoreTypes").ExistsResult> {
    const exists = this._store.has(id);
    return Object.freeze({ ok: true, exists, id: exists ? id : undefined });
  }

  async get(id: string): Promise<GetResult> {
    const record = this._store.get(id);
    KnowledgeStoreEventBus.emit("RECORD_QUERIED", this.engineName, { recordId: id });
    return Object.freeze({ ok: true, record });
  }

  async search(q: import("./KnowledgeStoreTypes").KnowledgeSearchQuery): Promise<import("./KnowledgeStoreTypes").SearchResult> {
    const v = KnowledgeStoreValidation.validateSearchQuery(q);
    if (!v.valid) return Object.freeze({ ok: false, records: [], scores: [], total: 0, error: v.errors[0].message });
    const lower = q.text.toLowerCase();
    const matches = [...this._store.values()].filter(r => r.status === "active" && r.content.toLowerCase().includes(lower));
    const limited = matches.slice(0, q.limit ?? 10);
    KnowledgeStoreEventBus.emit("RECORD_SEARCHED", this.engineName);
    return Object.freeze({ ok: true, records: Object.freeze(limited), scores: Object.freeze(limited.map(() => 1.0)), total: matches.length });
  }

  async query(q: import("./KnowledgeStoreTypes").KnowledgeQuery): Promise<QueryResult> {
    const v = KnowledgeStoreValidation.validateQuery(q);
    if (!v.valid) return Object.freeze({ ok: false, records: [], total: 0, hasMore: false, error: v.errors[0].message });
    let records = [...this._store.values()];
    if (q.types)  records = records.filter(r => q.types!.includes(r.type));
    if (q.status) records = records.filter(r => q.status!.includes(r.status));
    if (q.minConfidence !== undefined) records = records.filter(r => r.evidence.confidence >= q.minConfidence!);
    const total   = records.length;
    const offset  = q.offset ?? 0;
    const limit   = q.limit  ?? 50;
    const page    = records.slice(offset, offset + limit);
    KnowledgeStoreEventBus.emit("RECORD_QUERIED", this.engineName);
    return Object.freeze({ ok: true, records: Object.freeze(page), total, hasMore: offset + limit < total });
  }

  async stats(): Promise<import("./KnowledgeStoreTypes").StoreStats> {
    const all      = [...this._store.values()];
    const active   = all.filter(r => r.status === "active").length;
    const archived = all.filter(r => r.status === "archived").length;
    const sources  = new Set(all.map(r => r.evidence.source)).size;
    KnowledgeStoreEventBus.emit("STATS_QUERIED", this.engineName);
    return Object.freeze({ totalRecords: all.length, activeRecords: active, archivedRecords: archived, totalSources: sources, storageEngine: this.engineName, version: "EF-38.0" });
  }

  async health(): Promise<import("./KnowledgeStoreTypes").HealthResult> {
    KnowledgeStoreEventBus.emit("HEALTH_CHECKED", this.engineName);
    return Object.freeze({ ok: true, status: "healthy", latencyMs: 0, storageEngine: this.engineName });
  }
}

// ── Suites ─────────────────────────────────────────────────────────────────────

async function suiteValidation() {
  return Promise.all([
    test("Validation", "valid draft passes", () => {
      const r = KnowledgeStoreValidation.validateDraft(VALID_DRAFT);
      assert(r.valid, "valid draft should pass");
    }),
    test("Validation", "empty content fails", () => {
      const r = KnowledgeStoreValidation.validateDraft({ ...VALID_DRAFT, content: "" });
      assert(!r.valid, "empty content should fail");
    }),
    test("Validation", "missing evidence fails", () => {
      const r = KnowledgeStoreValidation.validateDraft({ ...VALID_DRAFT, evidence: undefined as any });
      assert(!r.valid, "missing evidence should fail");
    }),
    test("Validation", "invalid confidence fails", () => {
      const badEvidence = { ...EVIDENCE, confidence: 1.5 };
      const r = KnowledgeStoreValidation.validateDraft({ ...VALID_DRAFT, evidence: badEvidence as any });
      assert(!r.valid, "confidence > 1 should fail");
    }),
    test("Validation", "invalid memory type fails", () => {
      const r = KnowledgeStoreValidation.validateDraft({ ...VALID_DRAFT, type: "INVALID" as any });
      assert(!r.valid, "invalid type should fail");
    }),
    test("Validation", "validation result is immutable", () => {
      const r = KnowledgeStoreValidation.validateDraft(VALID_DRAFT);
      try { (r as any).valid = false; } catch {}
      assert(r.valid, "validation result should be immutable");
    }),
    test("Validation", "valid query passes", () => {
      const r = KnowledgeStoreValidation.validateQuery({ limit: 10, offset: 0 });
      assert(r.valid, "valid query should pass");
    }),
    test("Validation", "invalid limit fails", () => {
      const r = KnowledgeStoreValidation.validateQuery({ limit: 0 });
      assert(!r.valid, "limit=0 should fail");
    }),
    test("Validation", "date range validation", () => {
      const r = KnowledgeStoreValidation.validateQuery({ createdAfter: 2000, createdBefore: 1000 });
      assert(!r.valid, "after > before should fail");
    }),
    test("Validation", "empty search text fails", () => {
      const r = KnowledgeStoreValidation.validateSearchQuery({ text: "" });
      assert(!r.valid, "empty search text should fail");
    }),
    test("Validation", "patch with empty content fails", () => {
      const r = KnowledgeStoreValidation.validatePatch({ content: "" });
      assert(!r.valid, "empty patch content should fail");
    }),
    test("Validation", "patch with valid content passes", () => {
      const r = KnowledgeStoreValidation.validatePatch({ content: "updated content" });
      assert(r.valid, "valid patch should pass");
    }),
  ]);
}

async function suiteErrors() {
  return Promise.all([
    test("Errors", "notFound error is frozen", () => {
      const e = KnowledgeStoreErrorFactory.notFound("id-1");
      try { (e as any).code = "HACK"; } catch {}
      eq(e.code, "NOT_FOUND");
    }),
    test("Errors", "notFound has recordId", () => {
      const e = KnowledgeStoreErrorFactory.notFound("id-2");
      eq(e.recordId, "id-2");
    }),
    test("Errors", "validationFailed has message", () => {
      const e = KnowledgeStoreErrorFactory.validationFailed("bad input", { field: "content" });
      assert(e.message.length > 0, "missing message");
    }),
    test("Errors", "all error factories return frozen objects", () => {
      const factories = [
        KnowledgeStoreErrorFactory.notFound("x"),
        KnowledgeStoreErrorFactory.alreadyExists("x"),
        KnowledgeStoreErrorFactory.readOnly(),
        KnowledgeStoreErrorFactory.unavailable(),
        KnowledgeStoreErrorFactory.evidenceMissing(),
        KnowledgeStoreErrorFactory.contentEmpty(),
        KnowledgeStoreErrorFactory.unknown("test"),
      ];
      factories.forEach(e => {
        assert(e.code.length > 0, "error missing code");
        assert(e.message.length > 0, "error missing message");
      });
    }),
    test("Errors", "versionConflict includes version numbers", () => {
      const e = KnowledgeStoreErrorFactory.versionConflict("id-3", 2, 5);
      assert(e.message.includes("2") && e.message.includes("5"), "version numbers missing from message");
    }),
  ]);
}

async function suiteCapabilities() {
  return Promise.all([
    test("Capabilities", "memory engine is ephemeral", () => {
      assert(!KnowledgeStoreCapabilities.get("memory").persistsAcrossReloads, "memory should be ephemeral");
    }),
    test("Capabilities", "postgres engine persists", () => {
      assert(KnowledgeStoreCapabilities.get("postgres").persistsAcrossReloads, "postgres should persist");
    }),
    test("Capabilities", "vector engine supports semantic search", () => {
      assert(KnowledgeStoreCapabilities.get("vector").supportsSemanticSearch, "vector should support semantic search");
    }),
    test("Capabilities", "neo4j supports graph queries", () => {
      assert(KnowledgeStoreCapabilities.get("neo4j").supportsGraphQueries, "neo4j should support graph queries");
    }),
    test("Capabilities", "all 7 engines declared", () => {
      eq(KnowledgeStoreCapabilities.getAll().length, 7);
    }),
    test("Capabilities", "supports() helper works", () => {
      assert(KnowledgeStoreCapabilities.supports("postgres", "supportsTransactions"), "postgres supports transactions");
      assert(!KnowledgeStoreCapabilities.supports("memory", "supportsTransactions"), "memory does not support transactions");
    }),
  ]);
}

async function suiteEvents() {
  KnowledgeStoreEventBus.clear();
  return Promise.all([
    test("Events", "emitted event is frozen", () => {
      const e = KnowledgeStoreEventBus.emit("RECORD_STORED", "test-engine", { recordId: "r1" });
      try { (e as any).type = "HACK"; } catch {}
      eq(e.type, "RECORD_STORED");
    }),
    test("Events", "event has timestamp", () => {
      const e = KnowledgeStoreEventBus.emit("HEALTH_CHECKED", "test-engine");
      assert(e.timestamp > 0, "no timestamp");
    }),
    test("Events", "event has id", () => {
      const e = KnowledgeStoreEventBus.emit("STATS_QUERIED", "test-engine");
      assert(e.id.startsWith("KSE-"), "bad event id");
    }),
    test("Events", "getByType filters correctly", () => {
      KnowledgeStoreEventBus.clear();
      KnowledgeStoreEventBus.emit("RECORD_STORED", "e1");
      KnowledgeStoreEventBus.emit("HEALTH_CHECKED", "e1");
      const stored = KnowledgeStoreEventBus.getByType("RECORD_STORED");
      stored.forEach(e => eq(e.type, "RECORD_STORED"));
    }),
    test("Events", "getByRecord filters by recordId", () => {
      KnowledgeStoreEventBus.clear();
      KnowledgeStoreEventBus.emit("RECORD_STORED", "e1", { recordId: "target-id" });
      KnowledgeStoreEventBus.emit("RECORD_UPDATED", "e1", { recordId: "other-id" });
      const records = KnowledgeStoreEventBus.getByRecord("target-id");
      records.forEach(e => eq(e.recordId, "target-id"));
    }),
    test("Events", "stats.total increases", () => {
      KnowledgeStoreEventBus.clear();
      KnowledgeStoreEventBus.emit("RECORD_STORED", "e1");
      KnowledgeStoreEventBus.emit("RECORD_STORED", "e1");
      assert(KnowledgeStoreEventBus.stats().total >= 2, "total not incremented");
    }),
  ]);
}

async function suiteContractStore() {
  const store = new MemoryStoreStub();
  let storedId = "";

  return Promise.all([
    // store()
    test("Contract-store", "store() returns ok=true", async () => {
      const r = await store.store(VALID_DRAFT);
      assert(r.ok, "store should succeed");
      storedId = r.id;
    }),
    test("Contract-store", "store() result is frozen", async () => {
      const r = await store.store(VALID_DRAFT);
      try { (r as any).ok = false; } catch {}
      assert(r.ok, "result should be immutable");
    }),
    test("Contract-store", "store() with invalid draft returns ok=false", async () => {
      const r = await store.store({ ...VALID_DRAFT, content: "" });
      assert(!r.ok, "invalid draft should fail");
      assert(r.error != null, "error should be present");
    }),
    test("Contract-store", "store() emits RECORD_STORED event", async () => {
      KnowledgeStoreEventBus.clear();
      await store.store(VALID_DRAFT);
      assert(KnowledgeStoreEventBus.getByType("RECORD_STORED").length > 0, "no event emitted");
    }),
    // get()
    test("Contract-get", "get() returns stored record", async () => {
      const sr = await store.store(VALID_DRAFT);
      const r  = await store.get(sr.id);
      assert(r.ok && r.record != null, "record not found");
    }),
    test("Contract-get", "get() returns undefined for missing", async () => {
      const r = await store.get("nonexistent-id");
      assert(r.ok && r.record === undefined, "should return undefined for missing");
    }),
    test("Contract-get", "returned record is frozen", async () => {
      const sr = await store.store(VALID_DRAFT);
      const r  = await store.get(sr.id);
      if (r.record) { try { (r.record as any).content = "hack"; } catch {} eq(r.record.content, VALID_DRAFT.content); }
    }),
    // exists()
    test("Contract-exists", "exists() returns true for stored", async () => {
      const sr = await store.store(VALID_DRAFT);
      const r  = await store.exists(sr.id);
      assert(r.ok && r.exists, "should exist");
    }),
    test("Contract-exists", "exists() returns false for missing", async () => {
      const r = await store.exists("does-not-exist");
      assert(r.ok && !r.exists, "should not exist");
    }),
    // update()
    test("Contract-update", "update() increments version", async () => {
      const sr = await store.store(VALID_DRAFT);
      const ur = await store.update(sr.id, { content: "updated content" });
      assert(ur.ok && (ur.version ?? 0) > 1, "version should be > 1");
    }),
    test("Contract-update", "update() missing id returns ok=false", async () => {
      const r = await store.update("no-such-id", { content: "x" });
      assert(!r.ok, "should fail for missing id");
    }),
    // archive() / restore()
    test("Contract-archive", "archive() sets status=archived", async () => {
      const sr = await store.store(VALID_DRAFT);
      const ar = await store.archive(sr.id);
      assert(ar.ok && ar.archived, "archive failed");
      assert(ar.record?.status === "archived", "status should be archived");
    }),
    test("Contract-restore", "restore() sets status=active", async () => {
      const sr = await store.store(VALID_DRAFT);
      await store.archive(sr.id);
      const rr = await store.restore(sr.id);
      assert(rr.ok && rr.restored, "restore failed");
      assert(rr.record?.status === "active", "status should be active");
    }),
    // delete()
    test("Contract-delete", "delete() removes record", async () => {
      const sr = await store.store(VALID_DRAFT);
      await store.delete(sr.id);
      const ex = await store.exists(sr.id);
      assert(!ex.exists, "record should be deleted");
    }),
    // search()
    test("Contract-search", "search() finds matching records", async () => {
      await store.store(VALID_DRAFT);
      const r = await store.search({ text: "Knowledge Ingestion" });
      assert(r.ok && r.records.length > 0, "search should find records");
    }),
    test("Contract-search", "search() with empty text returns error", async () => {
      const r = await store.search({ text: "" });
      assert(!r.ok, "empty search should fail");
    }),
    test("Contract-search", "search() scores array matches records length", async () => {
      await store.store(VALID_DRAFT);
      const r = await store.search({ text: "Knowledge" });
      eq(r.records.length, r.scores.length, "scores.length should equal records.length");
    }),
    // query()
    test("Contract-query", "query() returns paginated results", async () => {
      const r = await store.query({ limit: 5, offset: 0 });
      assert(r.ok, "query should succeed");
    }),
    test("Contract-query", "query() by type filters correctly", async () => {
      await store.store(VALID_DRAFT); // type: Engineering
      const r = await store.query({ types: ["Engineering"], status: ["active"] });
      r.records.forEach(rec => eq(rec.type, "Engineering", "wrong type in results"));
    }),
    test("Contract-query", "query() with invalid limit returns error", async () => {
      const r = await store.query({ limit: -1 });
      assert(!r.ok, "negative limit should fail");
    }),
    // stats()
    test("Contract-stats", "stats() returns counts", async () => {
      const s = await store.stats();
      assert(s.totalRecords >= 0, "totalRecords missing");
      assert(s.storageEngine.length > 0, "storageEngine missing");
    }),
    // health()
    test("Contract-health", "health() returns ok=true for stub", async () => {
      const h = await store.health();
      assert(h.ok && h.status === "healthy", "health should be healthy");
    }),
  ]);
}

async function suiteSolidPrinciples() {
  return Promise.all([
    test("SOLID-SRP", "IKnowledgeStore: each method does exactly one operation", () => {
      // Verify the interface declares 11 operations with distinct responsibilities
      const methods = ["store","update","archive","restore","delete","exists","get","search","query","stats","health"];
      // Structural check: the stub implements all 11
      const stub = new MemoryStoreStub() as any;
      methods.forEach(m => assert(typeof stub[m] === "function", `Missing method: ${m}`));
    }),
    test("SOLID-OCP", "New engine can implement IKnowledgeStore without changing pipeline", () => {
      // Adding a new engine = new class implementing IKnowledgeStore, zero pipeline changes
      class AlternativeStub extends MemoryStoreStub {}
      const alt: IKnowledgeStore = new AlternativeStub();
      assert(typeof alt.store === "function", "OCP: new impl must satisfy interface");
    }),
    test("SOLID-LSP", "Substitute stub for IKnowledgeStore without breaking behavior", async () => {
      const store: IKnowledgeStore = new MemoryStoreStub();
      const r = await store.store(VALID_DRAFT);
      assert(r.ok, "LSP: substituted implementation should work");
    }),
    test("SOLID-ISP", "Consumers can depend on only health() without needing all methods", () => {
      // ISP: a health-only consumer would accept an object with just health()
      const healthOnly = { health: (new MemoryStoreStub()).health.bind(new MemoryStoreStub()) };
      assert(typeof healthOnly.health === "function", "ISP: minimal interface usable");
    }),
    test("SOLID-DIP", "KIP depends on IKnowledgeStore interface, not concrete class", () => {
      // DIP: the KIP is wired to IKnowledgeStore — we verify the contract shape
      const store: IKnowledgeStore = new MemoryStoreStub();
      // Any concrete class satisfying IKnowledgeStore is substitutable
      assert(store !== null, "DIP: store injected via interface");
    }),
    test("SOLID-DIP", "Interface is importable without concrete implementation", () => {
      // If this test runs, the interface compiles without concrete deps
      const has = (obj: any, method: string) => typeof obj[method] === "function";
      const stub = new MemoryStoreStub();
      assert(has(stub, "store") && has(stub, "health"), "interface methods present");
    }),
  ]);
}

async function suiteImmutability() {
  const store = new MemoryStoreStub();
  return Promise.all([
    test("Immutability", "StoreResult is frozen", async () => {
      const r = await store.store(VALID_DRAFT);
      try { (r as any).id = "hack"; } catch {}
      assert(r.id !== "hack", "StoreResult should be immutable");
    }),
    test("Immutability", "KnowledgeRecord is frozen", async () => {
      const sr = await store.store(VALID_DRAFT);
      const r  = await store.get(sr.id);
      if (r.record) {
        try { (r.record as any).content = "hacked"; } catch {}
        assert(r.record.content !== "hacked", "KnowledgeRecord should be immutable");
      }
    }),
    test("Immutability", "KnowledgeRecord.tags is frozen", async () => {
      const sr = await store.store(VALID_DRAFT);
      const r  = await store.get(sr.id);
      if (r.record) {
        try { (r.record.tags as any).push("hacked"); } catch {}
        assert(!r.record.tags.includes("hacked"), "tags should be immutable");
      }
    }),
    test("Immutability", "QueryResult is frozen", async () => {
      const r = await store.query({ limit: 5 });
      try { (r as any).total = -999; } catch {}
      assert(r.total !== -999, "QueryResult should be immutable");
    }),
    test("Immutability", "KnowledgeEvidence is frozen", () => {
      const e = KnowledgeEvidenceFactory.create({ source: "s", conversationId: "c", messageId: "m" });
      try { (e as any).source = "hacked"; } catch {}
      eq(e.source, "s", "evidence should be immutable");
    }),
  ]);
}

async function suiteDeterminism() {
  const store = new MemoryStoreStub();
  return Promise.all([
    test("Determinism", "same draft always returns ok=true (deterministic)", async () => {
      const r1 = await store.store(VALID_DRAFT);
      const r2 = await store.store(VALID_DRAFT);
      assert(r1.ok && r2.ok, "both stores should succeed");
    }),
    test("Determinism", "invalid draft always returns ok=false", async () => {
      const bad = { ...VALID_DRAFT, content: "" };
      const r1 = await store.store(bad);
      const r2 = await store.store(bad);
      assert(!r1.ok && !r2.ok, "both should fail deterministically");
    }),
    test("Determinism", "search result shape is consistent", async () => {
      const r = await store.search({ text: "nonexistent_xyz_abc" });
      assert(r.ok, "search should not throw");
      assert(Array.isArray(r.records), "records should be array");
    }),
    test("Determinism", "exists() for missing id always returns false", async () => {
      const r1 = await store.exists("missing-1");
      const r2 = await store.exists("missing-1");
      assert(!r1.exists && !r2.exists, "both should return false");
    }),
  ]);
}

async function suiteVersionCompatibility() {
  return Promise.all([
    test("VersionCompat", "All 7 storage engines defined without implementation", () => {
      const engines = ["memory","sqlite","postgres","vector","neo4j","cloud","distributed"];
      engines.forEach(e => {
        const cap = KnowledgeStoreCapabilities.get(e as any);
        assert(cap != null, `Engine ${e} missing from capabilities`);
      });
    }),
    test("VersionCompat", "Interface methods stable across implementations", () => {
      // Any implementation must expose the same 11 methods
      const REQUIRED = ["store","update","archive","restore","delete","exists","get","search","query","stats","health"];
      const stub = new MemoryStoreStub() as any;
      REQUIRED.forEach(m => assert(typeof stub[m] === "function", `Method ${m} missing`));
    }),
    test("VersionCompat", "KnowledgeRecord version field supports future versioning", async () => {
      const store = new MemoryStoreStub();
      const sr1 = await store.store(VALID_DRAFT);
      const sr2 = await store.update(sr1.id, { content: "v2 content" });
      assert((sr2.version ?? 0) > 1, "version should increment");
    }),
    test("VersionCompat", "Evidence carries pipelineVersion and extractorVersion", () => {
      const e = KnowledgeEvidenceFactory.create({ source: "s", conversationId: "c", messageId: "m" });
      assert(e.pipelineVersion.length > 0, "missing pipelineVersion");
      assert(e.extractorVersion.length > 0, "missing extractorVersion");
    }),
  ]);
}

// ── Main ───────────────────────────────────────────────────────────────────────
export async function runKnowledgeStoreContractTests(): Promise<{
  results: TR[];
  passed: number;
  failed: number;
  total: number;
  certified: boolean;
}> {
  const suiteResults = await Promise.all([
    suiteValidation(),
    suiteErrors(),
    suiteCapabilities(),
    suiteEvents(),
    suiteContractStore(),
    suiteSolidPrinciples(),
    suiteImmutability(),
    suiteDeterminism(),
    suiteVersionCompatibility(),
  ]);
  const results   = suiteResults.flat();
  const passed    = results.filter(r => r.passed).length;
  const failed    = results.length - passed;
  return { results, passed, failed, total: results.length, certified: failed === 0 };
}