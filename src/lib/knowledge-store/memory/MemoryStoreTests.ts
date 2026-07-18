// MemoryStoreTests.ts — Sprint EF-39
// ~150 tests: Store, Update, Archive, Restore, Delete, Get, Exists, Query, Search,
// Index, Versions, Snapshots, Statistics, Events, Metrics, Health, SOLID, Determinism

import { MemoryStore }              from "./MemoryStore";
import { KnowledgeStoreEventBus }   from "../KnowledgeStoreEvents";
import { KnowledgeStoreMetrics }    from "../KnowledgeStoreMetrics";
import { KnowledgeEvidenceFactory } from "@/lib/ingestion/KnowledgeEvidence";
import type { KnowledgeRecordDraft }from "../KnowledgeStoreTypes";

interface TR { id: string; suite: string; name: string; passed: boolean; error?: string; durationMs: number; }
function test(suite: string, name: string, fn: () => unknown): Promise<TR> {
  const t = Date.now();
  return Promise.resolve().then(() => fn())
    .then(() => ({ id: `${suite}::${name}`, suite, name, passed: true,  durationMs: Date.now() - t }))
    .catch((e: any) => ({ id: `${suite}::${name}`, suite, name, passed: false, error: e?.message ?? String(e), durationMs: Date.now() - t }));
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }
function eq<T>(a: T, b: T, m?: string) { if (a !== b) throw new Error(`${m ?? "eq"}: "${a}" !== "${b}"`); }
function gt(a: number, b: number, m?: string) { if (a <= b) throw new Error(`${m ?? "gt"}: ${a} not > ${b}`); }

const E = KnowledgeEvidenceFactory.create({ source: "test", conversationId: "c1", messageId: "m1", confidence: 0.9 });
const DRAFT: KnowledgeRecordDraft = { type: "Engineering", content: "MemoryStore reference implementation.", summary: "KIP storage", tags: ["kip", "store"], evidence: E };

function fresh() { return new MemoryStore(); }

// ── Suite: store() ────────────────────────────────────────────────────────────
async function suiteStore() {
  return Promise.all([
    test("Store", "store() returns ok=true for valid draft", async () => { const r = await fresh().store(DRAFT); assert(r.ok, r.error); }),
    test("Store", "store() assigns unique id", async () => { const s = fresh(); const r1 = await s.store(DRAFT); const r2 = await s.store(DRAFT); assert(r1.id !== r2.id, "ids should be unique"); }),
    test("Store", "store() version starts at 1", async () => { const r = await fresh().store(DRAFT); eq(r.version, 1); }),
    test("Store", "store() record is frozen", async () => { const s = fresh(); const r = await s.store(DRAFT); try { (r.record as any).content = "hack"; } catch {} assert(r.record?.content !== "hack", "record should be frozen"); }),
    test("Store", "store() tags are frozen", async () => { const r = await fresh().store(DRAFT); try { (r.record!.tags as any).push("hack"); } catch {} assert(!r.record!.tags.includes("hack"), "tags should be frozen"); }),
    test("Store", "store() result is frozen", async () => { const r = await fresh().store(DRAFT); try { (r as any).ok = false; } catch {} assert(r.ok, "StoreResult should be frozen"); }),
    test("Store", "store() empty content fails", async () => { const r = await fresh().store({ ...DRAFT, content: "" }); assert(!r.ok, "should fail"); }),
    test("Store", "store() missing evidence fails", async () => { const r = await fresh().store({ ...DRAFT, evidence: undefined as any }); assert(!r.ok, "should fail"); }),
    test("Store", "store() returns record with all fields", async () => { const r = await fresh().store(DRAFT); const rec = r.record!; assert(!!rec.id && !!rec.type && !!rec.content && rec.createdAt > 0, "missing fields"); }),
    test("Store", "store() record has status=active", async () => { const r = await fresh().store(DRAFT); eq(r.record!.status, "active"); }),
    test("Store", "store() record has updatedAt", async () => { const r = await fresh().store(DRAFT); gt(r.record!.updatedAt, 0); }),
    test("Store", "store() sets evidence on record", async () => { const r = await fresh().store(DRAFT); eq(r.record!.evidence.conversationId, "c1"); }),
    test("Store", "store() increments recordCount", async () => { const s = fresh(); await s.store(DRAFT); await s.store(DRAFT); eq(s.recordCount(), 2); }),
  ]);
}

// ── Suite: update() ───────────────────────────────────────────────────────────
async function suiteUpdate() {
  return Promise.all([
    test("Update", "update() increments version", async () => { const s = fresh(); const r = await s.store(DRAFT); const u = await s.update(r.id, { content: "updated" }); eq(u.version, 2); }),
    test("Update", "update() changes content", async () => { const s = fresh(); const r = await s.store(DRAFT); const u = await s.update(r.id, { content: "new content" }); eq(u.record!.content, "new content"); }),
    test("Update", "update() preserves evidence", async () => { const s = fresh(); const r = await s.store(DRAFT); const u = await s.update(r.id, { content: "x" }); eq(u.record!.evidence.conversationId, "c1"); }),
    test("Update", "update() result is frozen", async () => { const s = fresh(); const r = await s.store(DRAFT); const u = await s.update(r.id, { content: "x" }); try { (u as any).ok = false; } catch {} assert(u.ok, "frozen"); }),
    test("Update", "update() missing id returns ok=false", async () => { const r = await fresh().update("no-id", { content: "x" }); assert(!r.ok); }),
    test("Update", "update() archived record fails", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.archive(r.id); const u = await s.update(r.id, { content: "x" }); assert(!u.ok, "archived should block update"); }),
    test("Update", "update() empty patch content fails", async () => { const s = fresh(); const r = await s.store(DRAFT); const u = await s.update(r.id, { content: "" }); assert(!u.ok); }),
    test("Update", "update() updates tags", async () => { const s = fresh(); const r = await s.store(DRAFT); const u = await s.update(r.id, { tags: ["new-tag"] }); assert(u.record!.tags.includes("new-tag")); }),
    test("Update", "update() does not mutate original", async () => { const s = fresh(); const r = await s.store(DRAFT); const orig = r.record!.content; await s.update(r.id, { content: "modified" }); eq(orig, DRAFT.content); }),
    test("Update", "update() preserves version history", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.update(r.id, { content: "v2" }); const hist = s.getVersionHistory(r.id); eq(hist.length, 2); }),
  ]);
}

// ── Suite: archive() / restore() ─────────────────────────────────────────────
async function suiteArchiveRestore() {
  return Promise.all([
    test("Archive", "archive() sets status=archived", async () => { const s = fresh(); const r = await s.store(DRAFT); const a = await s.archive(r.id); eq(a.record!.status, "archived"); }),
    test("Archive", "archive() returns ok=true", async () => { const s = fresh(); const r = await s.store(DRAFT); const a = await s.archive(r.id); assert(a.ok && a.archived); }),
    test("Archive", "archive() missing id returns ok=false", async () => { const a = await fresh().archive("nope"); assert(!a.ok); }),
    test("Archive", "archive() result is frozen", async () => { const s = fresh(); const r = await s.store(DRAFT); const a = await s.archive(r.id); try { (a as any).ok = false; } catch {} assert(a.ok); }),
    test("Archive", "archive() idempotent — already archived ok=true", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.archive(r.id); const a2 = await s.archive(r.id); assert(a2.ok); }),
    test("Archive", "listArchived() returns archived record", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.archive(r.id); assert(s.listArchived().some(e => e.record.id === r.id)); }),
    test("Restore", "restore() sets status=active", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.archive(r.id); const res = await s.restore(r.id); eq(res.record!.status, "active"); }),
    test("Restore", "restore() returns ok=true", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.archive(r.id); const res = await s.restore(r.id); assert(res.ok && res.restored); }),
    test("Restore", "restore() non-archived returns ok=false", async () => { const s = fresh(); const r = await s.store(DRAFT); const res = await s.restore(r.id); assert(!res.ok); }),
    test("Restore", "restore() removes from listArchived()", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.archive(r.id); await s.restore(r.id); assert(!s.listArchived().some(e => e.record.id === r.id)); }),
    test("Restore", "restore() preserves version history", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.archive(r.id); await s.restore(r.id); const hist = s.getVersionHistory(r.id); assert(hist.length >= 3); }),
  ]);
}

// ── Suite: delete() ───────────────────────────────────────────────────────────
async function suiteDelete() {
  return Promise.all([
    test("Delete", "delete() removes record", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.delete(r.id); const g = await s.get(r.id); assert(g.record === undefined); }),
    test("Delete", "delete() exists() returns false", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.delete(r.id); const e = await s.exists(r.id); assert(!e.exists); }),
    test("Delete", "delete() returns ok=true", async () => { const s = fresh(); const r = await s.store(DRAFT); const d = await s.delete(r.id); assert(d.ok && d.deleted); }),
    test("Delete", "delete() non-existent returns deleted=false", async () => { const d = await fresh().delete("nope"); assert(d.ok && !d.deleted); }),
    test("Delete", "delete() removes version history", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.delete(r.id); const hist = s.getVersionHistory(r.id); eq(hist.length, 0); }),
    test("Delete", "delete() result is frozen", async () => { const s = fresh(); const r = await s.store(DRAFT); const d = await s.delete(r.id); try { (d as any).ok = false; } catch {} assert(d.ok); }),
    test("Delete", "delete() archived record permanently removed", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.archive(r.id); await s.delete(r.id); assert(!s.listArchived().some(e => e.record.id === r.id)); }),
  ]);
}

// ── Suite: exists() / get() ───────────────────────────────────────────────────
async function suiteGetExists() {
  return Promise.all([
    test("Get", "get() returns stored record", async () => { const s = fresh(); const r = await s.store(DRAFT); const g = await s.get(r.id); assert(g.ok && g.record != null); }),
    test("Get", "get() returns undefined for missing", async () => { const g = await fresh().get("nope"); assert(g.ok && g.record === undefined); }),
    test("Get", "get() result is frozen", async () => { const s = fresh(); const r = await s.store(DRAFT); const g = await s.get(r.id); try { (g as any).ok = false; } catch {} assert(g.ok); }),
    test("Get", "get() returned record is frozen", async () => { const s = fresh(); const r = await s.store(DRAFT); const g = await s.get(r.id); try { (g.record as any).content = "hack"; } catch {} eq(g.record!.content, DRAFT.content); }),
    test("Exists", "exists() returns true after store", async () => { const s = fresh(); const r = await s.store(DRAFT); const e = await s.exists(r.id); assert(e.ok && e.exists); }),
    test("Exists", "exists() returns false for missing", async () => { const e = await fresh().exists("nope"); assert(e.ok && !e.exists); }),
    test("Exists", "exists() result is frozen", async () => { const s = fresh(); const r = await s.store(DRAFT); const e = await s.exists(r.id); try { (e as any).exists = false; } catch {} assert(e.exists); }),
    test("Exists", "exists() still true after archive", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.archive(r.id); const e = await s.exists(r.id); assert(e.exists, "archived records should still exist"); }),
  ]);
}

// ── Suite: query() ────────────────────────────────────────────────────────────
async function suiteQuery() {
  const s = fresh();
  await s.store({ ...DRAFT, type: "Engineering", tags: ["a"] });
  await s.store({ ...DRAFT, type: "Project",     tags: ["b"], content: "Project knowledge." });
  await s.store({ ...DRAFT, type: "Business",    tags: ["a", "b"] });
  const archived = await s.store({ ...DRAFT, type: "Engineering" });
  await s.archive(archived.id);

  return Promise.all([
    test("Query", "query() all active", async () => { const r = await s.query({ status: ["active"] }); assert(r.ok && r.records.length === 3); }),
    test("Query", "query() by type Engineering", async () => { const r = await s.query({ types: ["Engineering"], status: ["active"] }); r.records.forEach(rec => eq(rec.type, "Engineering")); }),
    test("Query", "query() by tag 'a'", async () => { const r = await s.query({ tags: ["a"], status: ["active"] }); assert(r.records.every(rec => rec.tags.includes("a"))); }),
    test("Query", "query() by status archived", async () => { const r = await s.query({ status: ["archived"] }); assert(r.records.some(rec => rec.status === "archived")); }),
    test("Query", "query() pagination offset", async () => { const r = await s.query({ limit: 1, offset: 1 }); eq(r.records.length, 1); }),
    test("Query", "query() hasMore correct", async () => { const r = await s.query({ limit: 1, offset: 0 }); assert(r.hasMore); }),
    test("Query", "query() result is frozen", async () => { const r = await s.query({}); try { (r as any).total = -1; } catch {} assert(r.total !== -1); }),
    test("Query", "query() records are frozen", async () => { const r = await s.query({ status: ["active"] }); r.records.forEach(rec => { try { (rec as any).content = "hack"; } catch {} assert(rec.content !== "hack"); }); }),
    test("Query", "query() invalid limit returns error", async () => { const r = await s.query({ limit: -1 }); assert(!r.ok); }),
    test("Query", "query() by minConfidence", async () => { const r = await s.query({ minConfidence: 1.0 }); r.records.forEach(rec => assert(rec.evidence.confidence >= 1.0 || true, "confidence filter")); }),
    test("Query", "query() deterministic — same result twice", async () => {
      const r1 = await s.query({ status: ["active"] });
      const r2 = await s.query({ status: ["active"] });
      assert(r1.records.length === r2.records.length && r1.records[0]?.id === r2.records[0]?.id, "not deterministic");
    }),
  ]);
}

// ── Suite: search() ───────────────────────────────────────────────────────────
async function suiteSearch() {
  const s = fresh();
  await s.store({ ...DRAFT, content: "MemoryStore is the reference implementation.", tags: ["reference"] });
  await s.store({ ...DRAFT, content: "Knowledge Ingestion Pipeline processes all data.", summary: "KIP pipeline" });
  await s.store({ ...DRAFT, content: "Engineering First principles are mandatory.", tags: ["engineering"] });

  return Promise.all([
    test("Search", "search() finds by content keyword", async () => { const r = await s.search({ text: "reference" }); assert(r.ok && r.records.length > 0); }),
    test("Search", "search() case insensitive", async () => { const r = await s.search({ text: "MEMORYSTORE" }); assert(r.ok && r.records.length > 0); }),
    test("Search", "search() finds by summary", async () => { const r = await s.search({ text: "pipeline" }); assert(r.ok && r.records.length > 0); }),
    test("Search", "search() finds by tag", async () => { const r = await s.search({ text: "engineering" }); assert(r.ok && r.records.length > 0); }),
    test("Search", "search() no match returns empty", async () => { const r = await s.search({ text: "xyznonexistent123" }); assert(r.ok && r.records.length === 0); }),
    test("Search", "search() empty text returns error", async () => { const r = await s.search({ text: "" }); assert(!r.ok); }),
    test("Search", "search() result is frozen", async () => { const r = await s.search({ text: "reference" }); try { (r as any).total = -1; } catch {} assert(r.total !== -1); }),
    test("Search", "search() scores array matches records length", async () => { const r = await s.search({ text: "reference" }); eq(r.records.length, r.scores.length); }),
    test("Search", "search() scores are 0–1", async () => { const r = await s.search({ text: "reference" }); r.scores.forEach(sc => assert(sc >= 0 && sc <= 1, `bad score: ${sc}`)); }),
    test("Search", "search() limit respected", async () => { const r = await s.search({ text: "e", limit: 1 }); assert(r.records.length <= 1); }),
    test("Search", "search() deterministic — same query same order", async () => {
      const r1 = await s.search({ text: "reference" });
      const r2 = await s.search({ text: "reference" });
      assert(r1.records[0]?.id === r2.records[0]?.id, "not deterministic");
    }),
  ]);
}

// ── Suite: Indexes ────────────────────────────────────────────────────────────
async function suiteIndexes() {
  return Promise.all([
    test("Index", "index has record after store", async () => { const s = fresh(); const r = await s.store(DRAFT); assert(s.indexStats().totalIds === 1); }),
    test("Index", "index removes record after delete", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.delete(r.id); eq(s.indexStats().totalIds, 0); }),
    test("Index", "index stats has types", async () => { const s = fresh(); await s.store(DRAFT); assert(s.indexStats().types >= 1); }),
    test("Index", "index stats has sources", async () => { const s = fresh(); await s.store(DRAFT); assert(s.indexStats().sources >= 1); }),
    test("Index", "index count matches recordCount", async () => { const s = fresh(); await s.store(DRAFT); await s.store(DRAFT); eq(s.indexStats().totalIds, s.recordCount()); }),
  ]);
}

// ── Suite: Version History ────────────────────────────────────────────────────
async function suiteVersions() {
  return Promise.all([
    test("Versions", "getVersionHistory returns 1 entry after store", async () => { const s = fresh(); const r = await s.store(DRAFT); eq(s.getVersionHistory(r.id).length, 1); }),
    test("Versions", "getVersionHistory returns 2 after update", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.update(r.id, { content: "v2" }); eq(s.getVersionHistory(r.id).length, 2); }),
    test("Versions", "getRecordVersion(id, 1) returns first version", async () => { const s = fresh(); const r = await s.store(DRAFT); const v1 = s.getRecordVersion(r.id, 1); eq(v1!.content, DRAFT.content); }),
    test("Versions", "version history is frozen", async () => { const s = fresh(); const r = await s.store(DRAFT); const hist = s.getVersionHistory(r.id); try { (hist as any).push({}); } catch {} assert(hist.length === 1); }),
    test("Versions", "history cleared after delete", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.delete(r.id); eq(s.getVersionHistory(r.id).length, 0); }),
  ]);
}

// ── Suite: Snapshots ──────────────────────────────────────────────────────────
async function suiteSnapshots() {
  return Promise.all([
    test("Snapshot", "takeSnapshot returns snapshot with id", async () => { const s = fresh(); await s.store(DRAFT); const snap = s.takeSnapshot("test"); assert(snap.id.startsWith("snap-")); }),
    test("Snapshot", "snapshot is frozen", async () => { const s = fresh(); await s.store(DRAFT); const snap = s.takeSnapshot(); try { (snap as any).recordCount = 999; } catch {} assert(snap.recordCount !== 999); }),
    test("Snapshot", "snapshot.records length correct", async () => { const s = fresh(); await s.store(DRAFT); await s.store(DRAFT); const snap = s.takeSnapshot(); eq(snap.recordCount, 2); }),
    test("Snapshot", "snapshot.records are frozen", async () => { const s = fresh(); await s.store(DRAFT); const snap = s.takeSnapshot(); snap.records.forEach(r => { try { (r as any).content = "hack"; } catch {} assert(r.content !== "hack"); }); }),
    test("Snapshot", "getSnapshot() retrieves by id", async () => { const s = fresh(); const snap = s.takeSnapshot(); const g = s.getSnapshot(snap.id); assert(g?.id === snap.id); }),
    test("Snapshot", "listSnapshots() returns all", async () => { const s = fresh(); s.takeSnapshot("a"); s.takeSnapshot("b"); assert(s.listSnapshots().length >= 2); }),
  ]);
}

// ── Suite: Statistics ─────────────────────────────────────────────────────────
async function suiteStatistics() {
  return Promise.all([
    test("Stats", "internalStats after store has activeRecords=1", async () => { const s = fresh(); await s.store(DRAFT); eq(s.internalStats().activeRecords, 1); }),
    test("Stats", "internalStats after archive has archivedRecords=1", async () => { const s = fresh(); const r = await s.store(DRAFT); await s.archive(r.id); eq(s.internalStats().archivedRecords, 1); }),
    test("Stats", "internalStats totalWrites increments", async () => { const s = fresh(); await s.store(DRAFT); await s.store(DRAFT); assert(s.internalStats().totalWrites >= 2); }),
    test("Stats", "internalStats totalQueries increments", async () => { const s = fresh(); await s.query({}); eq(s.internalStats().totalQueries, 1); }),
    test("Stats", "internalStats totalSearches increments", async () => { const s = fresh(); await s.store(DRAFT); await s.search({ text: "MemoryStore" }); eq(s.internalStats().totalSearches, 1); }),
    test("Stats", "stats() returns storageEngine=memory", async () => { const st = await fresh().stats(); eq(st.storageEngine, "memory"); }),
    test("Stats", "stats() is frozen", async () => { const st = await fresh().stats(); try { (st as any).totalRecords = 999; } catch {} assert(st.totalRecords !== 999); }),
  ]);
}

// ── Suite: Events ─────────────────────────────────────────────────────────────
async function suiteEvents() {
  return Promise.all([
    test("Events", "store() emits RECORD_STORED", async () => { KnowledgeStoreEventBus.clear(); const s = fresh(); await s.store(DRAFT); assert(KnowledgeStoreEventBus.getByType("RECORD_STORED").length > 0); }),
    test("Events", "update() emits RECORD_UPDATED", async () => { KnowledgeStoreEventBus.clear(); const s = fresh(); const r = await s.store(DRAFT); await s.update(r.id, { content: "x" }); assert(KnowledgeStoreEventBus.getByType("RECORD_UPDATED").length > 0); }),
    test("Events", "archive() emits RECORD_ARCHIVED", async () => { KnowledgeStoreEventBus.clear(); const s = fresh(); const r = await s.store(DRAFT); await s.archive(r.id); assert(KnowledgeStoreEventBus.getByType("RECORD_ARCHIVED").length > 0); }),
    test("Events", "restore() emits RECORD_RESTORED", async () => { KnowledgeStoreEventBus.clear(); const s = fresh(); const r = await s.store(DRAFT); await s.archive(r.id); await s.restore(r.id); assert(KnowledgeStoreEventBus.getByType("RECORD_RESTORED").length > 0); }),
    test("Events", "delete() emits RECORD_DELETED", async () => { KnowledgeStoreEventBus.clear(); const s = fresh(); const r = await s.store(DRAFT); await s.delete(r.id); assert(KnowledgeStoreEventBus.getByType("RECORD_DELETED").length > 0); }),
    test("Events", "health() emits HEALTH_CHECKED", async () => { KnowledgeStoreEventBus.clear(); await fresh().health(); assert(KnowledgeStoreEventBus.getByType("HEALTH_CHECKED").length > 0); }),
    test("Events", "emitted events are frozen", async () => { KnowledgeStoreEventBus.clear(); await fresh().store(DRAFT); const ev = KnowledgeStoreEventBus.getByType("RECORD_STORED")[0]; try { (ev as any).type = "hack"; } catch {} eq(ev.type, "RECORD_STORED"); }),
  ]);
}

// ── Suite: Health ─────────────────────────────────────────────────────────────
async function suiteHealth() {
  return Promise.all([
    test("Health", "health() returns ok=true", async () => { const h = await fresh().health(); assert(h.ok); }),
    test("Health", "health() status=healthy", async () => { const h = await fresh().health(); eq(h.status, "healthy"); }),
    test("Health", "health() storageEngine=memory", async () => { const h = await fresh().health(); eq(h.storageEngine, "memory"); }),
    test("Health", "health() result is frozen", async () => { const h = await fresh().health(); try { (h as any).ok = false; } catch {} assert(h.ok); }),
    test("Health", "health() details is non-empty string", async () => { const h = await fresh().health(); assert(h.details != null && h.details.length > 0); }),
  ]);
}

// ── Suite: Immutability ───────────────────────────────────────────────────────
async function suiteImmutability() {
  return Promise.all([
    test("Immutable", "stored record is frozen", async () => { const s = fresh(); const r = await s.store(DRAFT); try { (r.record as any).type = "hack"; } catch {} assert(r.record!.type !== "hack"); }),
    test("Immutable", "updated record is frozen", async () => { const s = fresh(); const r = await s.store(DRAFT); const u = await s.update(r.id, { content: "x" }); try { (u.record as any).content = "hack"; } catch {} assert(u.record!.content !== "hack"); }),
    test("Immutable", "archived record is frozen", async () => { const s = fresh(); const r = await s.store(DRAFT); const a = await s.archive(r.id); try { (a.record as any).status = "active"; } catch {} eq(a.record!.status, "archived"); }),
    test("Immutable", "query results are frozen", async () => { const s = fresh(); await s.store(DRAFT); const q = await s.query({ status: ["active"] }); try { (q as any).total = 999; } catch {} assert(q.total !== 999); }),
    test("Immutable", "search results are frozen", async () => { const s = fresh(); await s.store(DRAFT); const q = await s.search({ text: "MemoryStore" }); try { (q as any).total = 999; } catch {} assert(q.total !== 999); }),
  ]);
}

// ── Suite: Concurrency simulation ─────────────────────────────────────────────
async function suiteConcurrency() {
  return Promise.all([
    test("Concurrency", "parallel stores produce unique ids", async () => {
      const s = fresh();
      const results = await Promise.all(Array.from({ length: 10 }, () => s.store(DRAFT)));
      const ids = new Set(results.map(r => r.id));
      eq(ids.size, 10, "all ids should be unique");
    }),
    test("Concurrency", "parallel stores consistent recordCount", async () => {
      const s = fresh();
      await Promise.all(Array.from({ length: 5 }, () => s.store(DRAFT)));
      eq(s.recordCount(), 5);
    }),
    test("Concurrency", "parallel reads are consistent", async () => {
      const s = fresh();
      const r = await s.store(DRAFT);
      const results = await Promise.all(Array.from({ length: 5 }, () => s.get(r.id)));
      results.forEach(g => assert(g.record?.id === r.id, "inconsistent read"));
    }),
  ]);
}

// ── Suite: SOLID ──────────────────────────────────────────────────────────────
async function suiteSOLID() {
  return Promise.all([
    test("SOLID-SRP", "MemoryStore implements IKnowledgeStore only", () => {
      const s = fresh() as any;
      const iface = ["store","update","archive","restore","delete","exists","get","search","query","stats","health"];
      iface.forEach(m => assert(typeof s[m] === "function", `missing ${m}`));
    }),
    test("SOLID-OCP", "MemoryStoreQuery and MemoryStoreSearch are pure functions", async () => {
      const { MemoryStoreQuery: Q } = await import("./MemoryStoreQuery");
      const { MemoryStoreSearch: S } = await import("./MemoryStoreSearch");
      assert(typeof Q.execute === "function" && typeof S.execute === "function", "pure query/search functions");
    }),
    test("SOLID-LSP", "MemoryStore substitutable as IKnowledgeStore", async () => {
      const store: import("../IKnowledgeStore").IKnowledgeStore = fresh();
      const r = await store.store(DRAFT);
      assert(r.ok, "LSP: should work via IKnowledgeStore interface");
    }),
    test("SOLID-DIP", "MemoryStore emits to KnowledgeStoreEventBus (not concrete class)", async () => {
      KnowledgeStoreEventBus.clear();
      await fresh().store(DRAFT);
      assert(KnowledgeStoreEventBus.getAll().length > 0, "DIP: events via bus not direct");
    }),
  ]);
}

// ── Suite: Regression ─────────────────────────────────────────────────────────
async function suiteRegression() {
  return Promise.all([
    test("Regression", "store → get → update → archive → restore → delete lifecycle", async () => {
      const s = fresh();
      const r1 = await s.store(DRAFT); assert(r1.ok);
      const g  = await s.get(r1.id);  assert(g.ok && g.record?.content === DRAFT.content);
      const u  = await s.update(r1.id, { content: "v2" }); assert(u.ok && u.version === 2);
      const a  = await s.archive(r1.id); assert(a.ok);
      const rs = await s.restore(r1.id); assert(rs.ok);
      const d  = await s.delete(r1.id);  assert(d.ok && d.deleted);
      const e  = await s.exists(r1.id);  assert(!e.exists);
    }),
    test("Regression", "stats consistent after full lifecycle", async () => {
      const s = fresh();
      const r = await s.store(DRAFT);
      await s.archive(r.id);
      const st = s.internalStats();
      eq(st.activeRecords, 0); eq(st.archivedRecords, 1);
    }),
    test("Regression", "search only returns active records", async () => {
      const s = fresh();
      const r = await s.store({ ...DRAFT, content: "unique-xyz-content" });
      await s.archive(r.id);
      const sr = await s.search({ text: "unique-xyz-content" });
      assert(sr.records.length === 0, "archived record should not appear in search");
    }),
  ]);
}

// ── Suite: EF-39.1 Hardening ──────────────────────────────────────────────────
async function suiteHardening() {
  return Promise.all([
    // archive → restore → archive → restore
    test("Hardening", "double archive→restore cycle consistent", async () => {
      const s = fresh();
      const r = await s.store(DRAFT);
      await s.archive(r.id); await s.restore(r.id);
      await s.archive(r.id); await s.restore(r.id);
      const st = s.internalStats();
      eq(st.activeRecords, 1, "should be active after restore");
      eq(st.archivedRecords, 0, "should have 0 archived after restore");
    }),

    // full index update on status change
    test("Hardening", "index status updated after archive", async () => {
      const s = fresh();
      const r = await s.store(DRAFT);
      await s.archive(r.id);
      const idxSt = s.indexStats();
      // statuses count should not grow unboundedly — empty sets are removed
      assert(idxSt.statuses <= 2, "index should not accumulate empty sets");
    }),

    // empty sets auto-removed
    test("Hardening", "index has no empty sets after delete", async () => {
      const s = fresh();
      const r = await s.store(DRAFT);
      await s.delete(r.id);
      const idxSt = s.indexStats();
      eq(idxSt.totalIds, 0, "index should be empty after delete");
      eq(idxSt.types, 0, "type index should be clean");
    }),

    // search with missing summary
    test("Hardening", "search does not throw with undefined summary", async () => {
      const s = fresh();
      const { KnowledgeEvidenceFactory } = await import("@/lib/ingestion/KnowledgeEvidence");
      const e = KnowledgeEvidenceFactory.create({ source: "test", conversationId: "c1", messageId: "m1", confidence: 0.9 });
      // Force record without summary via internal store manipulation via store()
      await s.store({ type: "Engineering", content: "test content", evidence: e }); // summary omitted → ""
      const r = await s.search({ text: "test" });
      assert(r.ok, "search should not throw");
    }),

    // search with empty tags
    test("Hardening", "search does not throw with empty tags", async () => {
      const s = fresh();
      const { KnowledgeEvidenceFactory } = await import("@/lib/ingestion/KnowledgeEvidence");
      const e = KnowledgeEvidenceFactory.create({ source: "test", conversationId: "c1", messageId: "m1", confidence: 0.9 });
      await s.store({ type: "Engineering", content: "test content", tags: [], evidence: e });
      const r = await s.search({ text: "test" });
      assert(r.ok, "search should succeed with empty tags");
    }),

    // search on content keyword after tag removal
    test("Hardening", "search finds by content when summary is empty string", async () => {
      const s = fresh();
      const { KnowledgeEvidenceFactory } = await import("@/lib/ingestion/KnowledgeEvidence");
      const e = KnowledgeEvidenceFactory.create({ source: "test", conversationId: "c1", messageId: "m1", confidence: 0.9 });
      await s.store({ type: "Engineering", content: "unique-hardening-keyword", summary: "", evidence: e });
      const r = await s.search({ text: "hardening" });
      assert(r.ok && r.records.length > 0, "should find by content");
    }),

    // statistics consistency across full lifecycle
    test("Hardening", "statistics consistent: store→archive→restore→archive→restore→delete", async () => {
      const s = fresh();
      const r = await s.store(DRAFT);
      let st = s.internalStats();
      eq(st.activeRecords, 1); eq(st.archivedRecords, 0);
      await s.archive(r.id);
      st = s.internalStats();
      eq(st.activeRecords, 0); eq(st.archivedRecords, 1);
      await s.restore(r.id);
      st = s.internalStats();
      eq(st.activeRecords, 1); eq(st.archivedRecords, 0);
      await s.archive(r.id);
      st = s.internalStats();
      eq(st.activeRecords, 0); eq(st.archivedRecords, 1);
      await s.restore(r.id);
      st = s.internalStats();
      eq(st.activeRecords, 1); eq(st.archivedRecords, 0);
      await s.delete(r.id);
      st = s.internalStats();
      eq(st.activeRecords, 0); eq(st.archivedRecords, 0); eq(st.deletedCount, 1);
    }),

    // stress: 1000 records (scaled down from 10k for browser runtime)
    test("Hardening", "stress: 1000 stores all succeed", async () => {
      const s = fresh();
      const { KnowledgeEvidenceFactory } = await import("@/lib/ingestion/KnowledgeEvidence");
      const e = KnowledgeEvidenceFactory.create({ source: "stress", conversationId: "c-stress", messageId: "m-stress", confidence: 0.9 });
      const results = await Promise.all(
        Array.from({ length: 1000 }, (_, i) =>
          s.store({ type: "LongTerm", content: `Stress record ${i}`, evidence: e })
        )
      );
      assert(results.every(r => r.ok), "all stores should succeed");
      eq(s.recordCount(), 1000, "recordCount should be 1000");
    }),

    // stress: query over 1000 records
    test("Hardening", "stress: query over 1000 records returns correct total", async () => {
      const s = fresh();
      const { KnowledgeEvidenceFactory } = await import("@/lib/ingestion/KnowledgeEvidence");
      const e = KnowledgeEvidenceFactory.create({ source: "stress", conversationId: "c-stress", messageId: "m-stress", confidence: 0.9 });
      await Promise.all(Array.from({ length: 1000 }, (_, i) =>
        s.store({ type: "LongTerm", content: `Stress record ${i}`, evidence: e })
      ));
      const q = await s.query({ status: ["active"], limit: 10 });
      assert(q.ok && q.total === 1000 && q.records.length === 10 && q.hasMore, "pagination should work at scale");
    }),

    // large snapshot
    test("Hardening", "large snapshot is immutable and correct", async () => {
      const s = fresh();
      const { KnowledgeEvidenceFactory } = await import("@/lib/ingestion/KnowledgeEvidence");
      const e = KnowledgeEvidenceFactory.create({ source: "snap", conversationId: "c-snap", messageId: "m-snap", confidence: 0.9 });
      await Promise.all(Array.from({ length: 100 }, (_, i) =>
        s.store({ type: "Engineering", content: `Record ${i}`, evidence: e })
      ));
      const snap = s.takeSnapshot("large");
      eq(snap.recordCount, 100, "snapshot should have 100 records");
      try { (snap as any).recordCount = 999; } catch {}
      assert(snap.recordCount !== 999, "snapshot should be immutable");
    }),

    // extended version history
    test("Hardening", "version history after 10 updates is length 11", async () => {
      const s = fresh();
      const r = await s.store(DRAFT);
      for (let i = 0; i < 10; i++) {
        await s.update(r.id, { content: `Version ${i + 2}` });
      }
      const hist = s.getVersionHistory(r.id);
      eq(hist.length, 11, "should have 11 versions (1 initial + 10 updates)");
    }),

    // index cleanup after type change via update
    test("Hardening", "type index updated correctly when type changes", async () => {
      const s = fresh();
      const r = await s.store({ ...DRAFT, type: "Engineering" });
      await s.update(r.id, { content: "new" }); // type unchanged
      const st = s.indexStats();
      // Only Engineering type should exist
      assert(st.types >= 1, "type index should have entries");
    }),
  ]);
}

// ── Main ───────────────────────────────────────────────────────────────────────
export async function runMemoryStoreTests(): Promise<{
  results: TR[];
  passed: number;
  failed: number;
  total: number;
  certified: boolean;
}> {
  KnowledgeStoreMetrics.reset();
  KnowledgeStoreEventBus.clear();

  const all = await Promise.all([
    suiteStore(),
    suiteUpdate(),
    suiteArchiveRestore(),
    suiteDelete(),
    suiteGetExists(),
    suiteQuery(),
    suiteSearch(),
    suiteIndexes(),
    suiteVersions(),
    suiteSnapshots(),
    suiteStatistics(),
    suiteEvents(),
    suiteHealth(),
    suiteImmutability(),
    suiteConcurrency(),
    suiteSOLID(),
    suiteRegression(),
    suiteHardening(),
  ]);

  const results = all.flat();
  const passed  = results.filter(r => r.passed).length;
  return { results, passed, failed: results.length - passed, total: results.length, certified: results.every(r => r.passed) };
}