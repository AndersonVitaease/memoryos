// STORE-MIG-01: migration tool tests. The fake bridge mirrors the REAL bridge
// projection semantics (golden shapes + scoring formula) so verify/shadow prove
// real equivalence, not fixture self-agreement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { LocalSqliteStore } from "../src/memoryStore.ts";
import { buildImportRows, recordHash, runMemoryMigrate, type ExportPayload, type MemoryMigrateDeps } from "../src/memoryMigrate.ts";

// ---- fake bridge (independent re-implementation of the bridge formulas) ----

function terms(q: string): string[] {
  return [...new Set(q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, " ").split(/[^a-z0-9_-]+/).filter((w) => w.length >= 3))].slice(0, 24);
}
function score(text: string, query: string, createdAt?: string | null): number {
  const ts = terms(query);
  const lower = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, " ");
  const lexical = ts.length ? ts.filter((t) => lower.includes(t)).length / ts.length : 0.25;
  const ageMs = Date.now() - Date.parse(String(createdAt ?? ""));
  const recency = Number.isFinite(ageMs) && ageMs >= 0 ? Math.max(0.1, 1 - ageMs / (180 * 86400_000)) : 0.2;
  return Math.round((lexical * 0.8 + recency * 0.2) * 1000) / 1000;
}

type FakeRow = {
  type: "message" | "decision" | "task" | "topic" | "entity";
  id: string; text: string; createdAt?: string | null; sessionId?: string | null;
  title?: string | null; description?: string | null; rationale?: string | null; status?: string | null; name?: string | null;
};

class FakeBridge {
  rows: FakeRow[] = [];
  scoreBias = 0;
  calls = 0;
  async call(operation: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    this.calls += 1;
    const projectId = String(payload.projectId ?? "memoryos");
    if (operation === "context") {
      const limit = Number(payload.limit ?? 30);
      const memories = this.rows.filter((r) => r.type === "message" && r.text.includes("[AGENT MEMORY]"))
        .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
        .slice(0, limit)
        .map((r) => ({ id: r.id, content: r.text, createdAt: r.createdAt ?? null, sessionId: r.sessionId ?? null }));
      const decisions = this.rows.filter((r) => r.type === "decision").slice(0, 12)
        .map((r) => ({ id: r.id, title: r.title ?? null, description: r.description ?? null, rationale: r.rationale ?? null, decidedAt: r.createdAt ?? null }));
      const tasks = this.rows.filter((r) => r.type === "task");
      const topics = this.rows.filter((r) => r.type === "topic");
      const entities = this.rows.filter((r) => r.type === "entity");
      return {
        projectId,
        memories,
        decisions,
        pendingTasks: tasks.filter((r) => r.status !== "done").slice(0, 12).map((r) => ({ id: r.id, title: r.title ?? null, description: r.description ?? null, status: r.status ?? null })),
        activeTopics: topics.slice(0, 12).map((r) => ({ id: r.id, name: r.name ?? null, description: r.description ?? null })),
        counts: { memories: memories.length, decisions: decisions.length, tasks: tasks.length, topics: topics.length, entities: entities.length },
      };
    }
    if (operation === "search") {
      const query = String(payload.query ?? "");
      const limit = Math.min(50, Math.max(1, Number(payload.limit ?? 20)));
      const candidates = this.rows.map((r) => ({ type: r.type, id: r.id, text: r.text, createdAt: r.createdAt ?? null, score: Math.round((score(r.text, query, r.createdAt) + this.scoreBias) * 1000) / 1000 }));
      const results = candidates.filter((c) => c.score >= 0.2).sort((a, b) => b.score - a.score).slice(0, limit);
      return { projectId, query, count: results.length, results };
    }
    throw new Error(`FAKE_BRIDGE_UNSUPPORTED:${operation}`);
  }
}

function fixtureRows(): FakeRow[] {
  return [
    { type: "message", id: "m1", text: "[AGENT MEMORY]\nAgent: claude-code\nSummary: STORE-MIG-01 release pipeline concluído", createdAt: "2026-09-22T10:00:00.000Z", sessionId: "sess-fake-1" },
    { type: "message", id: "m2", text: "[AGENT MEMORY]\nAgent: claude-code\nSummary: HERMES-LINK-01 registry entries criadas", createdAt: "2026-09-21T10:00:00.000Z", sessionId: "sess-fake-1" },
    { type: "message", id: "m-dup", text: "[AGENT MEMORY]\nAgent: claude-code\nSummary: MEMORY-MERGE-01 merge governado (duplicata)", createdAt: "2026-09-20T10:00:00.000Z", sessionId: "sess-fake-2" },
    { type: "decision", id: "d1", text: "Publicar via pipeline oficial — Realizar o release — Garantir controle", title: "Publicar via pipeline oficial", description: "Realizar o release", rationale: "Garantir controle", createdAt: "2026-08-31" },
    { type: "decision", id: "d2", text: "Não editar registry via SSH — Edições só por tool — Rastro de auditoria", title: "Não editar registry via SSH", description: "Edições só por tool", rationale: "Rastro de auditoria", createdAt: "2026-08-30" },
    { type: "task", id: "t1", text: "Rodar export cedo — Ponte é a única fonte", title: "Rodar export cedo", description: "Ponte é a única fonte", status: "pending", createdAt: "2026-09-18T09:00:00.000Z" },
    { type: "task", id: "t2", text: "Configurar proxy local — Hermes aponta para a VPS", title: "Configurar proxy local", description: "Hermes aponta para a VPS", status: "pending", createdAt: "2026-09-17T09:00:00.000Z" },
    { type: "task", id: "t3", text: "Fechar HERMES-LINK-01 — Prova de morte do legado", title: "Fechar HERMES-LINK-01", description: "Prova de morte do legado", status: "done", createdAt: "2026-09-16T09:00:00.000Z" },
    { type: "topic", id: "tp1", text: "Migração do store — SQLite local na VPS", name: "Migração do store", description: "SQLite local na VPS", createdAt: "2026-09-19T09:00:00.000Z" },
    { type: "topic", id: "tp2", text: "Saída gradual do Base44 — Sem mexer no painel", name: "Saída gradual do Base44", description: "Sem mexer no painel", createdAt: "2026-09-15T09:00:00.000Z" },
    { type: "entity", id: "e1", text: "person — Hermes — agente no VPS", createdAt: "2026-09-19T08:00:00.000Z" },
    { type: "entity", id: "e2", text: "tool — engineering.memory.merge — aplicador governado", createdAt: "2026-09-18T08:00:00.000Z" },
  ];
}

function tmpDir(): string {
  return mkdtempSync(path.join(tmpdir(), `migrate-${randomUUID().slice(0, 8)}-`));
}

function makeDeps(dir: string, bridge: FakeBridge): MemoryMigrateDeps & { flagPath: string } {
  return {
    bridge,
    storeDir: path.join(dir, "store"),
    stateFile: path.join(dir, "migration-state.json"),
    flagFile: path.join(dir, "memory-store-mode"),
    flagPath: path.join(dir, "memory-store-mode"),
    now: () => new Date(),
  };
}

const PLAN_ACTIONS = ["import", "shadow", "switch", "restore"] as const;

test("PLAN gating: mutating actions never touch disk without execute+approval", async () => {
  const dir = tmpDir();
  const bridge = new FakeBridge();
  bridge.rows = fixtureRows();
  const deps = makeDeps(dir, bridge);
  for (const action of PLAN_ACTIONS) {
    const plan = (await runMemoryMigrate({ action }, deps)) as Record<string, unknown>;
    assert.equal(plan.status, "PLAN", `${action} without execute/approval must be PLAN`);
    assert.equal(plan.requiresExecuteAndApproval, true);
  }
  assert.equal(existsSync(path.join(deps.storeDir as string, "memoryos.db")), false, "no local store created in PLAN mode");
  assert.equal(bridge.calls, 0, "PLAN never calls the bridge");
  // approval without execute is still PLAN
  const approved = (await runMemoryMigrate({ action: "import", approval: { approved: true } }, deps)) as Record<string, unknown>;
  assert.equal(approved.status, "PLAN");
  rmSync(dir, { recursive: true, force: true });
});

test("buildImportRows: original ids preserved, kinds mapped, search-only rows included", async () => {
  const dir = tmpDir();
  const bridge = new FakeBridge();
  bridge.rows = fixtureRows();
  const deps = makeDeps(dir, bridge);
  const exported = (await runMemoryMigrate({ action: "export" }, deps)) as { file: string };
  const payload = JSON.parse(readFileSync(exported.file, "utf8")) as ExportPayload;
  const rows = buildImportRows(payload, "memoryos");
  const ids = rows.map((r) => r.id);
  for (const expected of ["m1", "m2", "m-dup", "d1", "d2", "t1", "t2", "t3", "tp1", "tp2", "e1", "e2"]) {
    assert.ok(ids.includes(expected), `original id ${expected} preserved`);
  }
  const kinds = new Map(rows.map((r) => [r.id, r.kind]));
  assert.equal(kinds.get("m1"), "memory");
  assert.equal(kinds.get("d1"), "decision");
  assert.equal(kinds.get("t1"), "task");
  assert.equal(kinds.get("tp1"), "topic");
  assert.equal(kinds.get("e1"), "entity");
  const d1 = rows.find((r) => r.id === "d1")!;
  assert.equal(d1.title, "Publicar via pipeline oficial");
  assert.equal(d1.createdAt, "2026-08-31", "decidedAt becomes created_at");
  const e1 = rows.find((r) => r.id === "e1")!;
  assert.equal(e1.content, "person — Hermes — agente no VPS", "search-only entity keeps the canonical bridge text");
  rmSync(dir, { recursive: true, force: true });
});

test("full flow: export → import → verify (hash16 per record) → shadow identical", async () => {
  const dir = tmpDir();
  const bridge = new FakeBridge();
  bridge.rows = fixtureRows();
  const deps = makeDeps(dir, bridge);
  const exported = (await runMemoryMigrate({ action: "export" }, deps)) as { file: string; coverage: Record<string, { complete: boolean }> };
  assert.equal(exported.coverage.memories.complete, true);
  assert.equal(exported.coverage.entities.complete, true, "fixture entities are fully fished by the battery");
  const imported = (await runMemoryMigrate({ action: "import", execute: true, approval: { approved: true } }, deps)) as { upserted: number; counts: Record<string, number> };
  assert.equal(imported.upserted, 12);
  assert.equal(imported.counts.memories, 3);
  assert.equal(imported.counts.decisions, 2);
  assert.equal(imported.counts.tasks, 3);
  assert.equal(imported.counts.topics, 2);
  assert.equal(imported.counts.entities, 2);
  const verified = (await runMemoryMigrate({ action: "verify" }, deps)) as { allMatched: boolean; compared: number; mismatched: unknown[]; missing: string[] };
  assert.equal(verified.compared, 12);
  assert.equal(verified.allMatched, true, `verify must match every record: ${JSON.stringify({ mismatched: verified.mismatched, missing: verified.missing })}`);
  const shadow = (await runMemoryMigrate({ action: "shadow", execute: true, approval: { approved: true }, limit: 100 }, deps)) as { allIdentical: boolean; context: { identical: boolean; diffs: string[] }; searches: Array<{ term: string; identical: boolean; diffs: string[]; bridgeOnly: string[]; localOnly: string[] }> };
  assert.equal(shadow.context.identical, true, `context must be identical: ${JSON.stringify(shadow.context)}`);
  for (const s of shadow.searches) {
    assert.equal(s.identical, true, `search "${s.term}" must be identical: ${JSON.stringify(s)}`);
  }
  assert.equal(shadow.allIdentical, true);
  rmSync(dir, { recursive: true, force: true });
});

test("shadow is self-contained: bridge drift since the last import is absorbed", async () => {
  const dir = tmpDir();
  const bridge = new FakeBridge();
  bridge.rows = fixtureRows();
  const deps = makeDeps(dir, bridge);
  await runMemoryMigrate({ action: "export" }, deps);
  await runMemoryMigrate({ action: "import", execute: true, approval: { approved: true } }, deps);
  // drift: a new capture lands on the bridge AFTER the import
  bridge.rows.unshift({ type: "message", id: "m-new", text: "[AGENT MEMORY]\nAgent: claude-code\nSummary: captura pós-import", createdAt: "2026-09-23T10:00:00.000Z", sessionId: "sess-fake-1" });
  const shadow = (await runMemoryMigrate({ action: "shadow", execute: true, approval: { approved: true } }, deps)) as { allIdentical: boolean };
  assert.equal(shadow.allIdentical, true, "shadow re-imports before comparing, so drift is absorbed");
  rmSync(dir, { recursive: true, force: true });
});

test("shadow diverges honestly when the bridge scoring differs", async () => {
  const dir = tmpDir();
  const bridge = new FakeBridge();
  bridge.rows = fixtureRows();
  const deps = makeDeps(dir, bridge);
  await runMemoryMigrate({ action: "export" }, deps);
  await runMemoryMigrate({ action: "import", execute: true, approval: { approved: true } }, deps);
  bridge.scoreBias = 0.5; // simulate any scoring divergence
  const shadow = (await runMemoryMigrate({ action: "shadow", execute: true, approval: { approved: true } }, deps)) as { allIdentical: boolean; searches: Array<{ term: string; identical: boolean }> };
  assert.equal(shadow.allIdentical, false);
  assert.ok(shadow.searches.some((s) => !s.identical));
  rmSync(dir, { recursive: true, force: true });
});

test("switch: guards refuse first, pass after verify+shadow; flag flips with pre-switch snapshot", async () => {
  const dir = tmpDir();
  const bridge = new FakeBridge();
  bridge.rows = fixtureRows();
  const deps = makeDeps(dir, bridge);
  // PLAN shows unmet guards before anything ran
  const plan = (await runMemoryMigrate({ action: "switch" }, deps)) as { guards: Record<string, boolean> };
  assert.equal(plan.guards.verifyPassed, false);
  assert.equal(plan.guards.shadowIdentical, false);
  // execute without guards fails closed
  await assert.rejects(
    () => runMemoryMigrate({ action: "switch", execute: true, approval: { approved: true } }, deps),
    /MIGRATE_SWITCH_GUARDS_FAILED/
  );
  assert.equal(existsSync(deps.flagPath), false, "flag is never written when guards fail");
  // green path
  await runMemoryMigrate({ action: "export" }, deps);
  await runMemoryMigrate({ action: "import", execute: true, approval: { approved: true } }, deps);
  await runMemoryMigrate({ action: "verify" }, deps);
  await runMemoryMigrate({ action: "shadow", execute: true, approval: { approved: true } }, deps);
  const switched = (await runMemoryMigrate({ action: "switch", execute: true, approval: { approved: true } }, deps)) as { flagValue: string; requiresRestart: boolean; preSwitchSnapshot: { hash16: string } };
  assert.equal(switched.flagValue, "local");
  assert.equal(switched.requiresRestart, true);
  assert.ok(switched.preSwitchSnapshot.hash16.length === 16);
  assert.equal(readFileSync(deps.flagPath, "utf8").trim(), "local");
  rmSync(dir, { recursive: true, force: true });
});

test("merge simulation: tombstone locally → shadow still identical (expected divergence) → re-import never resurrects → restore is byte-identical", async () => {
  const dir = tmpDir();
  const bridge = new FakeBridge();
  bridge.rows = fixtureRows();
  const deps = makeDeps(dir, bridge);
  await runMemoryMigrate({ action: "export" }, deps);
  await runMemoryMigrate({ action: "import", execute: true, approval: { approved: true } }, deps);
  await runMemoryMigrate({ action: "verify" }, deps);
  const store = new LocalSqliteStore({ storeDir: deps.storeDir, auditFile: path.join(dir, "audit.jsonl") });
  // the MEMORY-MERGE-01 re-execute, at the store layer: tombstone the duplicate
  await store.call("update", {
    projectId: "memoryos", id: "m-dup",
    fields: { deleted: true, merged_into: "m1", merged_from: "m1", deleted_reason: "duplicate of m1 (re-execute das 4 decisões do operador)" },
  });
  assert.equal(store.counts("memoryos").memories, 2, "duplicate is gone from the projections");
  // record the tombstone in the migration state (as the merge step would)
  const statePath = deps.stateFile as string;
  const state = JSON.parse(readFileSync(statePath, "utf8")) as Record<string, unknown>;
  state.tombstonedIds = ["m-dup"];
  writeFileSync(statePath, JSON.stringify(state));
  // shadow: bridge still returns m-dup; the compare must treat it as the EXPECTED divergence
  const shadow = (await runMemoryMigrate({ action: "shadow", execute: true, approval: { approved: true } }, deps)) as { allIdentical: boolean; searches: Array<{ term: string; tombstonedLocally: string[] }> };
  assert.equal(shadow.allIdentical, true, "tombstoned-locally rows are the designed divergence, not drift");
  assert.ok(shadow.searches.some((s) => s.tombstonedLocally.includes("m-dup")));
  // re-import (upsert is content-only) never resurrects the tombstone
  await runMemoryMigrate({ action: "import", execute: true, approval: { approved: true } }, deps);
  assert.equal(store.counts("memoryos").memories, 2);
  assert.equal(store.rawById("memoryos", ["m-dup"])[0].deleted, true);
  // restore: byte-identical state view back
  const snap = store.snapshot("manual");
  await store.call("update", { projectId: "memoryos", id: "m1", fields: { deleted: true, deleted_reason: "accidental" } });
  assert.equal(store.counts("memoryos").memories, 1);
  store.restore(snap.path);
  assert.equal(store.counts("memoryos").memories, 2);
  const raw = store.rawById("memoryos", ["m-dup"]);
  assert.equal(raw[0].deleted, true);
  assert.equal(raw[0].merged_into, "m1");
  const verified = (await runMemoryMigrate({ action: "verify" }, deps)) as { allMatched: boolean };
  assert.equal(verified.allMatched, true, "hash16 per record matches after restore");
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("status reports store mode, local counts and migration state", async () => {
  const dir = tmpDir();
  const bridge = new FakeBridge();
  bridge.rows = fixtureRows();
  const deps = makeDeps(dir, bridge);
  const empty = (await runMemoryMigrate({ action: "status" }, deps)) as { localStore: { exists: boolean }; migrationState: { phase: string } };
  assert.equal(empty.localStore.exists, false);
  assert.equal(empty.migrationState.phase, "none");
  await runMemoryMigrate({ action: "export" }, deps);
  await runMemoryMigrate({ action: "import", execute: true, approval: { approved: true } }, deps);
  const status = (await runMemoryMigrate({ action: "status" }, deps)) as { localStore: { exists: boolean; counts: Record<string, number> }; migrationState: { phase: string } };
  assert.equal(status.localStore.exists, true);
  assert.equal(status.localStore.counts.total, 12);
  assert.ok(["imported", "exported"].includes(status.migrationState.phase));
  rmSync(dir, { recursive: true, force: true });
});

test("recordHash is stable and distinguishes field changes", () => {
  const a = recordHash("memory", "m1", ["content", "2026-09-22", "sess"]);
  const b = recordHash("memory", "m1", ["content", "2026-09-22", "sess"]);
  const c = recordHash("memory", "m1", ["content-changed", "2026-09-22", "sess"]);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(a.length === 16);
});
