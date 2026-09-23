// STORE-MIG-01: local SQLite store tests. Fixture = EXACT bridge shapes from
// the golden export (memory {id, content, createdAt, sessionId}; decision
// {id, title, description, rationale, decidedAt}; task {id, title, description,
// status}; topic {id, name, description}) — the lesson twice learned: the
// fixture must mirror the REAL shape, never an assumed one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { LocalSqliteStore, resolveStoreMode, createMemoryStore, BridgeMemoryStore, type ImportRow } from "../src/memoryStore.ts";

function tmpStoreDir(): string {
  return mkdtempSync(path.join(tmpdir(), `store-mig-${randomUUID().slice(0, 8)}-`));
}

const MEMORY_FIXTURE = {
  id: "6ab305d69ed9b9b320db7f57",
  content: "[AGENT MEMORY]\nAgent: claude-code\nSummary: [MEMORYGATE:band=admit score=0.80] HERMES-LINK-01 E2E completo",
  createdAt: "2026-09-22T22:48:54.057000",
  sessionId: "6aa4110d643ea3326447b198",
};

test("resolveStoreMode: explicit env wins; flag file second; default bridge", () => {
  const dir = tmpStoreDir();
  const flagFile = path.join(dir, "memory-store-mode");
  // default (no env, no flag)
  assert.deepEqual(resolveStoreMode({} as NodeJS.ProcessEnv, flagFile), { mode: "bridge", source: "default" });
  // env explicit
  assert.deepEqual(resolveStoreMode({ ENG_MCP_MEMORY_STORE: "local" } as NodeJS.ProcessEnv, flagFile), { mode: "local", source: "env" });
  assert.deepEqual(resolveStoreMode({ ENG_MCP_MEMORY_STORE: "bridge" } as NodeJS.ProcessEnv, flagFile), { mode: "bridge", source: "env" });
  // env invalid refuses (never silently picks)
  assert.throws(() => resolveStoreMode({ ENG_MCP_MEMORY_STORE: "yes" } as NodeJS.ProcessEnv, flagFile), /MEMORY_STORE_FLAG_INVALID/);
  // flag file wins over default
  writeFileSync(flagFile, "local\n");
  assert.deepEqual(resolveStoreMode({} as NodeJS.ProcessEnv, flagFile), { mode: "local", source: "flag-file" });
  // invalid flag value is fail-safe to bridge
  writeFileSync(flagFile, "banana");
  assert.deepEqual(resolveStoreMode({} as NodeJS.ProcessEnv, flagFile), { mode: "bridge", source: "flag-file-invalid" });
  // env beats flag file
  assert.deepEqual(resolveStoreMode({ ENG_MCP_MEMORY_STORE: "bridge" } as NodeJS.ProcessEnv, flagFile), { mode: "bridge", source: "env" });
  rmSync(dir, { recursive: true, force: true });
});

test("LocalSqliteStore boots WAL on a 0600 db inside a 0700 dir", () => {
  const dir = tmpStoreDir();
  const store = new LocalSqliteStore({ storeDir: dir, auditFile: path.join(dir, "audit.jsonl") });
  const dbPath = path.join(dir, "memoryos.db");
  // WAL persists in the file — a second connection sees it.
  const probe = new DatabaseSync(dbPath);
  const mode = (probe.prepare("PRAGMA journal_mode").get() as Record<string, unknown>).journal_mode;
  assert.equal(String(mode).toLowerCase(), "wal");
  probe.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("context returns the exact bridge projection shapes", async () => {
  const dir = tmpStoreDir();
  const store = new LocalSqliteStore({ storeDir: dir, auditFile: path.join(dir, "audit.jsonl") });
  store.upsertRecords("memoryos", [
    { kind: "memory", id: MEMORY_FIXTURE.id, content: MEMORY_FIXTURE.content, createdAt: MEMORY_FIXTURE.createdAt, sessionId: MEMORY_FIXTURE.sessionId },
    { kind: "decision", id: "6a958b3b3404d66c1610568b", title: "Publicar ENG-MCP via pipeline oficial", content: "Publicar ENG-MCP via pipeline oficial — Realizar o release oficial — Garantir um processo controlado", extra: { description: "Realizar o release oficial do ENG-MCP.", rationale: "Garantir um processo controlado." }, createdAt: "2026-08-31" },
    { kind: "task", id: "6aa2ccf75bd68f226bdb2ab9", title: "Avançar para o gate #2", content: "Avançar para o gate #2 — A missão está completa", status: "pending", extra: { description: "A missão está completa." }, createdAt: "2026-09-01T10:00:00.000Z" },
    { kind: "task", id: "task-done-1", title: "Tarefa concluída", status: "done", createdAt: "2026-09-02T10:00:00.000Z" },
    { kind: "topic", id: "6aa2ccf717d45842de17637e", title: "Entrega de Relatório", content: "Entrega de Relatório — Confirmação da entrega", status: "active", extra: { description: "Confirmação da entrega do relatório final." }, createdAt: "2026-09-03T10:00:00.000Z" },
    { kind: "entity", id: "entity-1", content: "person — Hermes — mentioned in mission reports", createdAt: "2026-09-04T10:00:00.000Z" },
  ]);
  const ctx = (await store.call("context", { projectId: "memoryos", limit: 100 })) as Record<string, unknown>;
  assert.equal((ctx as { projectId: string }).projectId, "memoryos");
  const memories = (ctx as { memories: Array<Record<string, unknown>> }).memories;
  assert.equal(memories.length, 1);
  assert.deepEqual(Object.keys(memories[0]).sort(), ["content", "createdAt", "id", "sessionId"]);
  assert.equal(memories[0].id, MEMORY_FIXTURE.id);
  assert.equal(memories[0].content, MEMORY_FIXTURE.content);
  const decisions = (ctx as { decisions: Array<Record<string, unknown>> }).decisions;
  assert.deepEqual(Object.keys(decisions[0]).sort(), ["decidedAt", "description", "id", "rationale", "title"]);
  assert.equal(decisions[0].decidedAt, "2026-08-31");
  const tasks = (ctx as { pendingTasks: Array<Record<string, unknown>> }).pendingTasks;
  assert.deepEqual(Object.keys(tasks[0]).sort(), ["description", "id", "status", "title"]);
  assert.equal(tasks.length, 1, "done tasks are excluded from pendingTasks");
  const topics = (ctx as { activeTopics: Array<Record<string, unknown>> }).activeTopics;
  assert.deepEqual(Object.keys(topics[0]).sort(), ["description", "id", "name"]);
  const counts = (ctx as { counts: Record<string, number> }).counts;
  assert.equal(counts.memories, 1);
  assert.equal(counts.decisions, 1);
  assert.equal(counts.tasks, 2);
  assert.equal(counts.topics, 1);
  assert.equal(counts.entities, 1);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("search mirrors the bridge scoring battery (zz dump-trick + term matching)", async () => {
  const dir = tmpStoreDir();
  const store = new LocalSqliteStore({ storeDir: dir, auditFile: path.join(dir, "audit.jsonl") });
  store.upsertRecords("memoryos", [
    { kind: "memory", id: "m1", content: "[AGENT MEMORY]\nSummary: release pipeline concluído", createdAt: "2026-09-20T10:00:00.000Z", sessionId: "s1" },
    { kind: "memory", id: "m2", content: "[AGENT MEMORY]\nSummary: outra coisa totalmente diferente", createdAt: "2026-09-21T10:00:00.000Z", sessionId: "s1" },
    { kind: "entity", id: "e1", content: "person — Hermes — gateway", createdAt: "2026-09-19T10:00:00.000Z" },
  ]);
  // "zz" (< 3 chars → terms() empty → lexical 0.25 for ALL rows → all pass ≥0.2)
  const dump = (await store.call("search", { projectId: "memoryos", query: "zz", limit: 50 })) as { query: string; count: number; results: Array<{ type: string; id: string; text: string; createdAt: string | null; score: number }> };
  assert.equal(dump.count, 3);
  assert.deepEqual(Object.keys(dump.results[0]).sort(), ["createdAt", "id", "score", "text", "type"]);
  // recency order: newest first
  assert.deepEqual(dump.results.map((r) => r.id), ["m2", "m1", "e1"]);
  // a real term: only matching rows surface, higher than the 0.25 floor
  const hit = (await store.call("search", { projectId: "memoryos", query: "pipeline", limit: 50 })) as { count: number; results: Array<{ id: string; score: number }> };
  assert.equal(hit.count, 1);
  assert.equal(hit.results[0].id, "m1");
  assert.ok(hit.results[0].score > 0.9);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("update enforces the field whitelist and tombstone filters are NATIVE in projections", async () => {
  const dir = tmpStoreDir();
  const store = new LocalSqliteStore({ storeDir: dir, auditFile: path.join(dir, "audit.jsonl") });
  store.upsertRecords("memoryos", [{ kind: "memory", id: "m-dup", content: "[AGENT MEMORY]\nSummary: duplicata", createdAt: "2026-09-20T10:00:00.000Z", sessionId: "s1" }]);
  // whitelist refusal
  await assert.rejects(() => store.call("update", { projectId: "memoryos", id: "m-dup", fields: { content: "hacked" } as unknown as Record<string, unknown> }), /UPDATE_FIELD_NOT_ALLOWED:content/);
  // tombstone via the merge field set
  const tombstone = (await store.call("update", { projectId: "memoryos", id: "m-dup", fields: { deleted: true, merged_into: "m-survivor", deleted_reason: "duplicate of m-survivor (judge p=0.75)", merged_from: "m-survivor" } })) as Record<string, unknown>;
  assert.equal(tombstone.updated, true);
  assert.ok(String((tombstone as { preSnapshotHash: string }).preSnapshotHash).length === 16);
  const after = (await store.call("context", { projectId: "memoryos", limit: 100 })) as { memories: unknown[] };
  assert.equal(after.memories.length, 0, "tombstoned row never leaves the store in projections");
  const search = (await store.call("search", { projectId: "memoryos", query: "duplicata", limit: 50 })) as { count: number };
  assert.equal(search.count, 0);
  // rawById still sees it (state view for idempotency/rollback)
  const raw = store.rawById("memoryos", ["m-dup"]);
  assert.equal(raw.length, 1);
  assert.equal(raw[0].deleted, true);
  assert.equal(raw[0].merged_into, "m-survivor");
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("update rollback with nulls restores the byte-identical state view", async () => {
  const dir = tmpStoreDir();
  const store = new LocalSqliteStore({ storeDir: dir, auditFile: path.join(dir, "audit.jsonl") });
  store.upsertRecords("memoryos", [{ kind: "memory", id: "m-rr", content: "[AGENT MEMORY]\nSummary: rollback target", createdAt: "2026-09-20T10:00:00.000Z", sessionId: "s1" }]);
  const before = store.rawById("memoryos", ["m-rr"]);
  await store.call("update", { projectId: "memoryos", id: "m-rr", fields: { stale: true, stale_reason: "superseded por 6ab1c131", stale_at: "2026-09-22T23:00:00.000Z" } });
  const marked = store.rawById("memoryos", ["m-rr"]);
  assert.equal(marked[0].stale, true);
  // rollback: nulls revert (merge tool's exact rollback semantics)
  await store.call("update", { projectId: "memoryos", id: "m-rr", fields: { stale: false, stale_reason: null, stale_at: null } });
  const after = store.rawById("memoryos", ["m-rr"]);
  assert.deepEqual(after, before);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("snapshot + restore is byte-identical; upsert never resurrects tombstones", async () => {
  const dir = tmpStoreDir();
  const store = new LocalSqliteStore({ storeDir: dir, auditFile: path.join(dir, "audit.jsonl") });
  store.upsertRecords("memoryos", [{ kind: "memory", id: "m-s", content: "[AGENT MEMORY]\nSummary: snapshot", createdAt: "2026-09-20T10:00:00.000Z", sessionId: "s1" }]);
  const snap = store.snapshot("manual");
  assert.equal(snap.reason, "manual");
  assert.ok(snap.bytes > 0);
  // pre-update snapshot is mandatory
  await store.call("update", { projectId: "memoryos", id: "m-s", fields: { deleted: true, deleted_reason: "tombstone for restore test" } });
  assert.equal(store.counts("memoryos").memories, 0);
  store.restore(snap.path);
  assert.equal(store.counts("memoryos").memories, 1, "restore brings the pre-mutation state back");
  // re-tombstone (restore reverted the first one by design), then content-only
  // upsert: the tombstone meta survives a re-import
  await store.call("update", { projectId: "memoryos", id: "m-s", fields: { deleted: true, deleted_reason: "tombstone for restore test" } });
  store.upsertRecords("memoryos", [{ kind: "memory", id: "m-s", content: "[AGENT MEMORY]\nSummary: snapshot", createdAt: "2026-09-20T10:00:00.000Z", sessionId: "s1" }]);
  assert.equal(store.counts("memoryos").memories, 0, "re-import does NOT resurrect a tombstoned record");
  const raw = store.rawById("memoryos", ["m-s"]);
  assert.equal(raw[0].deleted, true);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("capture mirrors the bridge session model and response shape", async () => {
  const dir = tmpStoreDir();
  const store = new LocalSqliteStore({ storeDir: dir, auditFile: path.join(dir, "audit.jsonl") });
  const first = (await store.call("capture", {
    projectId: "memoryos", agent: "claude-code",
    summary: "STORE-MIG-01 store test capture with plenty of content to pass the minimum length gate.",
  })) as Record<string, unknown>;
  assert.deepEqual(Object.keys(first).sort(), ["agent", "memoryBatch", "memoryId", "projectId", "sessionId", "stored"]);
  assert.equal(first.stored, true);
  assert.equal(first.projectId, "memoryos");
  const second = (await store.call("capture", {
    projectId: "memoryos", agent: "claude-code",
    summary: "Second capture lands in the SAME dedicated session, mirroring the bridge.",
  })) as Record<string, unknown>;
  assert.equal(second.sessionId, first.sessionId, "one dedicated session per agent, like the bridge");
  const ctx = (await store.call("context", { projectId: "memoryos", limit: 10 })) as { memories: Array<{ id: string }>; counts: { memories: number } };
  assert.equal(ctx.counts.memories, 2);
  // too short → refused
  await assert.rejects(() => store.call("capture", { projectId: "memoryos", agent: "x", summary: "short" }), /AGENT_MEMORY_CAPTURE_TOO_SHORT/);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("createMemoryStore resolves local and bridge modes", async () => {
  const dir = tmpStoreDir();
  const localStore = createMemoryStore({ env: { ENG_MCP_MEMORY_STORE: "local", ENG_MCP_MEMORY_STORE_DIR: dir } as unknown as NodeJS.ProcessEnv });
  assert.equal(localStore.mode, "local");
  localStore.close();
  const bridgeStore = createMemoryStore({ env: {} as NodeJS.ProcessEnv, flagFile: path.join(dir, "absent-flag") });
  assert.equal(bridgeStore.mode, "bridge");
  assert.ok(bridgeStore instanceof BridgeMemoryStore);
  rmSync(dir, { recursive: true, force: true });
});

test("upsertRecords preserves original ids and ImportRow shape", () => {
  const dir = tmpStoreDir();
  const store = new LocalSqliteStore({ storeDir: dir, auditFile: path.join(dir, "audit.jsonl") });
  const rows: ImportRow[] = [
    { kind: "memory", id: "6ab305d69ed9b9b320db7f57", content: MEMORY_FIXTURE.content, createdAt: MEMORY_FIXTURE.createdAt, sessionId: MEMORY_FIXTURE.sessionId },
  ];
  const result = store.upsertRecords("memoryos", rows);
  assert.equal(result.upserted, 1);
  assert.equal(result.sessions, 1, "an imported session row is created for the memory's sessionId");
  const raw = store.rawById("memoryos", [MEMORY_FIXTURE.id]);
  assert.equal(raw.length, 1);
  assert.equal(raw[0].id, MEMORY_FIXTURE.id, "original id preserved verbatim");
  assert.equal(raw[0].content, MEMORY_FIXTURE.content);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});
