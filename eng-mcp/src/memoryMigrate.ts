// STORE-MIG-01: governed migration of the MemoryOS KB from the Base44
// agentMemoryBridge (SaaS, being exited deliberately without panel changes) to
// the local SQLite store (src/memoryStore.ts). Fidelity is PROVEN, not assumed:
//   export    — deterministic read battery against the bridge (context limit
//               100 + a fixed search-term battery; "zz" is the dump-trick:
//               terms() requires >=3 chars so every row gets lexical 0.25 and
//               recency alone orders the top-50). Read-only on the bridge.
//   import    — upserts the export into the local store PRESERVING ORIGINAL
//               IDS (merge re-execute targets 6ab1c286/6ab1c131 depend on it);
//               content-only upsert so re-imports never resurrect tombstones.
//   verify    — count + per-record hash16 between the export file and the
//               local store (the brief's fidelity proof, record by record).
//   shadow    — fresh export+import, then the SAME queries against bridge and
//               local; identical answers required (scores within tolerance;
//               bridge-only rows are reported, tombstoned-locally rows are the
//               expected divergence after operator merges).
//   switch    — flips the MEMORY_STORE flag file (guards: verify + shadow
//               green, pre-switch snapshot taken); activation happens on the
//               next governed restart (flag read at boot, default bridge).
//   snapshot  — explicit store backup (also mandatory pre-mutation inside the
//               store itself).
//   restore   — byte-identical restore from a backups/ snapshot (guarded).
// Gating: export/verify/snapshot/status never mutate; import, shadow, switch
// and restore require execute=true AND approval.approved=true (the same
// PLAN/execute discipline as every governed mutator in this server). Audit:
// hashes + counters only, never memory content.
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { LocalSqliteStore, type ImportRow } from "./memoryStore.ts";
import { type AgentMemoryPayload } from "./memory.ts";

export const DEFAULT_STORE_DIR = "/data/memoryos";
export const MIGRATION_STATE_FILE = path.join(DEFAULT_STORE_DIR, "migration-state.json");
export const DEFAULT_FLAG_FILE = "/data/credentials/memory-store-mode";

// Deterministic query battery. "zz" = recency-ordered dump (see header);
// the term list is fixed so every run is reproducible and verify/shadow are
// comparable across runs.
export const SEARCH_TERMS = ["zz", "release", "pipeline", "memory", "git", "test", "mission", "engmcp", "merge", "judge", "vps", "deploy"] as const;

const sha16 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);

export type MemoryMigrateInput = {
  action: "status" | "export" | "import" | "verify" | "shadow" | "switch" | "snapshot" | "restore";
  execute?: boolean;
  approval?: { approved?: boolean };
  projectId?: string;
  limit?: number;
  exportFile?: string;
  restorePath?: string;
};

export type MemoryMigrateDeps = {
  bridge: { call: (operation: "context" | "search", payload?: AgentMemoryPayload) => Promise<unknown> };
  storeDir?: string;
  stateFile?: string;
  flagFile?: string;
  now?: () => Date;
};

type SearchRow = { type: string; id: string; text: string; createdAt?: string | null; score?: number };

type ExportPayload = {
  exportedAt: string;
  projectId: string;
  searchTerms: readonly string[];
  context: Record<string, unknown>;
  searches: Record<string, { query: string; count: number; results: SearchRow[] }>;
};

type MigrationState = Record<string, unknown> & { phase?: string; history?: Array<Record<string, unknown>> };

// ---- canonical record hash (the fidelity unit) ----

export function recordHash(kind: string, id: string, fields: Array<string | null | undefined>): string {
  return sha16([kind, id, ...fields.map((f) => f ?? "")].join("\u0001"));
}

function hashExportRow(kind: string, row: Record<string, unknown>): string {
  if (kind === "memory") return recordHash("memory", String(row.id), [String(row.content ?? ""), String(row.createdAt ?? ""), String(row.sessionId ?? "")]);
  if (kind === "decision") return recordHash("decision", String(row.id), [String(row.title ?? ""), String(row.description ?? ""), String(row.rationale ?? ""), String(row.decidedAt ?? "")]);
  if (kind === "task") return recordHash("task", String(row.id), [String(row.title ?? ""), String(row.description ?? ""), String(row.status ?? "")]);
  if (kind === "topic") return recordHash("topic", String(row.id), [String(row.name ?? ""), String(row.description ?? "")]);
  return recordHash("entity", String(row.id), [String(row.text ?? ""), String(row.createdAt ?? "")]);
}

function hashLocalRaw(raw: Record<string, unknown>): string {
  const kind = String(raw.kind ?? "");
  if (kind === "memory") return recordHash("memory", String(raw.id), [String(raw.content ?? ""), String(raw.createdAt ?? ""), String(raw.sessionId ?? "")]);
  if (kind === "decision") return recordHash("decision", String(raw.id), [String(raw.title ?? ""), String(raw.description ?? ""), String(raw.rationale ?? ""), String(raw.createdAt ?? "")]);
  if (kind === "task") return recordHash("task", String(raw.id), [String(raw.title ?? ""), String(raw.description ?? ""), String(raw.status ?? "")]);
  if (kind === "topic") return recordHash("topic", String(raw.id), [String(raw.name ?? ""), String(raw.description ?? "")]);
  return recordHash("entity", String(raw.id), [String(raw.content ?? ""), String(raw.createdAt ?? "")]);
}

// ---- state file ----

function readState(stateFile: string): MigrationState {
  try { return JSON.parse(readFileSync(stateFile, "utf8")) as MigrationState; } catch { return { phase: "none", history: [] }; }
}
function writeState(stateFile: string, state: MigrationState): void {
  mkdirSync(path.dirname(stateFile), { recursive: true, mode: 0o700 });
  writeFileSync(stateFile, JSON.stringify(state, null, 1), { mode: 0o600 });
  try { chmodSync(stateFile, 0o600); } catch { /* best effort */ }
}
function pushHistory(state: MigrationState, entry: Record<string, unknown>): void {
  const history = Array.isArray(state.history) ? state.history : [];
  history.push(entry);
  state.history = history.slice(-50);
}

// ---- export ----

async function runExport(deps: MemoryMigrateDeps, projectId: string, limit: number): Promise<{ file: string; payload: ExportPayload; coverage: Record<string, unknown>; counts: Record<string, unknown> }> {
  const storeDir = deps.storeDir ?? DEFAULT_STORE_DIR;
  const dir = path.join(storeDir, "migration");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const context = (await deps.bridge.call("context", { projectId, limit })) as Record<string, unknown>;
  const searches: ExportPayload["searches"] = {};
  for (const term of SEARCH_TERMS) {
    const result = (await deps.bridge.call("search", { projectId, query: term, limit: 50 })) as { query: string; count: number; results: SearchRow[] };
    searches[term] = { query: result.query, count: result.count, results: result.results ?? [] };
  }
  const counts = (context.counts ?? {}) as Record<string, number>;
  const payload: ExportPayload = { exportedAt: (deps.now ?? (() => new Date()))().toISOString(), projectId, searchTerms: SEARCH_TERMS, context, searches };
  const stamp = payload.exportedAt.replace(/[:.]/g, "-");
  const file = path.join(dir, `export-${stamp}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 1), { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* best effort */ }
  // Coverage: which of the bridge-counted records the export actually carries.
  const union = exportUnionRows(payload);
  const byKind: Record<string, Set<string>> = { memory: new Set(), decision: new Set(), task: new Set(), topic: new Set(), entity: new Set() };
  for (const [kind, rows] of Object.entries(exportContextRows(payload))) for (const row of rows) byKind[kind].add(String(row.id));
  for (const row of union) byKind[row.type === "message" ? "memory" : row.type].add(row.id);
  const coverage: Record<string, unknown> = {};
  for (const kind of ["memories", "decisions", "tasks", "topics", "entities"] as const) {
    const key = kind === "memories" ? "memory" : kind === "decisions" ? "decision" : kind === "tasks" ? "task" : kind === "topics" ? "topic" : "entity";
    const total = Number(counts[kind] ?? 0);
    const exported = byKind[key].size;
    coverage[kind] = { bridgeTotal: total, exported, complete: exported >= total, ratio: total ? Math.min(1, exported / total) : 1 };
  }
  return { file, payload, coverage, counts };
}

function exportContextRows(payload: ExportPayload): Record<string, Array<Record<string, unknown>>> {
  const ctx = payload.context ?? {};
  return {
    memory: (ctx.memories ?? []) as Array<Record<string, unknown>>,
    decision: (ctx.decisions ?? []) as Array<Record<string, unknown>>,
    task: (ctx.pendingTasks ?? []) as Array<Record<string, unknown>>,
    topic: (ctx.activeTopics ?? []) as Array<Record<string, unknown>>,
    entity: [],
  };
}

function exportUnionRows(payload: ExportPayload): SearchRow[] {
  const byId = new Map<string, SearchRow>();
  for (const term of Object.keys(payload.searches ?? {})) {
    for (const row of payload.searches[term]?.results ?? []) {
      const existing = byId.get(row.id);
      if (!existing || String(row.createdAt ?? "") > String(existing.createdAt ?? "")) byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

// ---- import ----

export function buildImportRows(payload: ExportPayload, projectId: string): ImportRow[] {
  const rows: ImportRow[] = [];
  const union = exportUnionRows(payload);
  const unionById = new Map(union.map((r) => [r.id, r]));
  const ctx = exportContextRows(payload);
  const seen = new Set<string>();
  // Memories: complete structured form from context (content + createdAt + sessionId).
  for (const m of ctx.memory) {
    const id = String(m.id);
    seen.add(id);
    rows.push({ kind: "memory", id, content: String(m.content ?? ""), createdAt: m.createdAt != null ? String(m.createdAt) : null, sessionId: m.sessionId != null ? String(m.sessionId) : null });
  }
  for (const d of ctx.decision) {
    const id = String(d.id);
    seen.add(id);
    rows.push({
      kind: "decision", id,
      title: d.title != null ? String(d.title) : null,
      content: unionById.get(id)?.text ?? null,
      extra: { description: d.description ?? null, rationale: d.rationale ?? null },
      createdAt: d.decidedAt != null ? String(d.decidedAt) : unionById.get(id)?.createdAt ?? null,
    });
  }
  for (const t of ctx.task) {
    const id = String(t.id);
    seen.add(id);
    rows.push({
      kind: "task", id,
      title: t.title != null ? String(t.title) : null,
      content: unionById.get(id)?.text ?? null,
      status: t.status != null ? String(t.status) : null,
      extra: { description: t.description ?? null },
      createdAt: unionById.get(id)?.createdAt ?? null,
    });
  }
  for (const t of ctx.topic) {
    const id = String(t.id);
    seen.add(id);
    rows.push({
      kind: "topic", id,
      title: t.name != null ? String(t.name) : null,
      content: unionById.get(id)?.text ?? null,
      status: "active",
      extra: { description: t.description ?? null },
      createdAt: unionById.get(id)?.createdAt ?? null,
    });
  }
  // Search-only rows (beyond the context slices): decision/task/topic/entity
  // rows carry the canonical bridge projection text as content.
  for (const row of union) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (row.type === "message") {
      rows.push({ kind: "memory", id: row.id, content: row.text, createdAt: row.createdAt ?? null });
    } else if (row.type === "decision" || row.type === "task" || row.type === "topic") {
      rows.push({ kind: row.type, id: row.id, content: row.text, createdAt: row.createdAt ?? null });
    } else {
      rows.push({ kind: "entity", id: row.id, content: row.text, createdAt: row.createdAt ?? null });
    }
  }
  void projectId;
  return rows;
}

// ---- verify ----

function runVerify(local: LocalSqliteStore, payload: ExportPayload, projectId: string): Record<string, unknown> {
  const ctx = exportContextRows(payload);
  const union = exportUnionRows(payload);
  const expected = new Map<string, { kind: string; hash: string }>();
  for (const m of ctx.memory) expected.set(String(m.id), { kind: "memory", hash: hashExportRow("memory", m) });
  for (const d of ctx.decision) expected.set(String(d.id), { kind: "decision", hash: hashExportRow("decision", d) });
  for (const t of ctx.task) expected.set(String(t.id), { kind: "task", hash: hashExportRow("task", t) });
  for (const t of ctx.topic) expected.set(String(t.id), { kind: "topic", hash: hashExportRow("topic", t) });
  for (const row of union) {
    const kind = row.type === "message" ? "memory" : row.type;
    if (expected.has(row.id)) continue; // structured form is authoritative
    expected.set(row.id, { kind, hash: hashExportRow(kind === "memory" ? "memory" : kind === "entity" || row.type === "entity" ? "entity" : kind, { id: row.id, text: row.text, createdAt: row.createdAt }) });
  }
  const ids = [...expected.keys()];
  const localRaw = local.rawById(projectId, ids);
  const localById = new Map(localRaw.map((r) => [String(r.id), r]));
  let matched = 0;
  const mismatched: Array<Record<string, unknown>> = [];
  const missing: string[] = [];
  for (const [id, exp] of expected) {
    const raw = localById.get(id);
    if (!raw) { missing.push(id); continue; }
    const localHash = hashLocalRaw(raw);
    if (localHash === exp.hash) matched += 1;
    else mismatched.push({ id, kind: exp.kind, exportHash16: exp.hash, localHash16: localHash });
  }
  const kinds: Record<string, number> = {};
  for (const exp of expected.values()) kinds[exp.kind] = (kinds[exp.kind] ?? 0) + 1;
  return { compared: expected.size, matched, mismatched, missing, expectedKinds: kinds, allMatched: matched === expected.size && mismatched.length === 0 && missing.length === 0 };
}

// ---- shadow ----

const SCORE_TOLERANCE = 0.002;

function compareSearchResults(bridgeResults: SearchRow[], localResults: Array<{ type: string; id: string; text: string; createdAt?: string | null; score: number }>, tombstonedLocally: Set<string>): { identical: boolean; diffs: string[]; bridgeOnly: string[]; localOnly: string[]; tombstonedLocally: string[] } {
  const diffs: string[] = [];
  const bridgeById = new Map(bridgeResults.map((r) => [r.id, r]));
  const localById = new Map(localResults.map((r) => [r.id, r]));
  const bridgeOnly: string[] = [];
  const tombstoned: string[] = [];
  for (const row of bridgeResults) {
    if (localById.has(row.id)) continue;
    if (tombstonedLocally.has(row.id)) tombstoned.push(row.id);
    else bridgeOnly.push(row.id);
  }
  const localOnly = localResults.filter((r) => !bridgeById.has(r.id)).map((r) => r.id);
  const comparable = bridgeResults.filter((r) => localById.has(r.id));
  let identical = bridgeOnly.length === 0 && localOnly.length === 0;
  for (const row of comparable) {
    const localRow = localById.get(row.id)!;
    if (row.type !== localRow.type) diffs.push(`${row.id}: type ${row.type} != ${localRow.type}`);
    const expectedScore = Number(row.score ?? 0);
    if (Math.abs(expectedScore - localRow.score) > SCORE_TOLERANCE) diffs.push(`${row.id}: score ${row.score} != ${localRow.score}`);
  }
  if (bridgeResults.length - tombstoned.length !== localResults.length) diffs.push(`count bridge=${bridgeResults.length} (tombstonedLocally=${tombstoned.length}) local=${localResults.length}`);
  if (diffs.length > 0 || bridgeOnly.length > 0 || localOnly.length > 0) identical = false;
  return { identical, diffs: diffs.slice(0, 10), bridgeOnly: bridgeOnly.slice(0, 20), localOnly: localOnly.slice(0, 20), tombstonedLocally: tombstoned.slice(0, 20) };
}

async function runShadow(deps: MemoryMigrateDeps, local: LocalSqliteStore, projectId: string, limit: number, state: MigrationState, stateFile: string): Promise<Record<string, unknown>> {
  // Self-contained: fresh export + import first, so local tracks the bridge
  // as of NOW (captures since the last import land here, idempotently).
  const fresh = await runExport(deps, projectId, limit);
  const importResult = local.upsertRecords(projectId, buildImportRows(fresh.payload, projectId));
  // Tombstoned-locally rows: known divergence after operator merges.
  const tombstonedLocally = new Set<string>();
  const stateRaw = (state.tombstonedIds as string[] | undefined) ?? [];
  for (const id of stateRaw) tombstonedLocally.add(id);
  const bridgeContext = (await deps.bridge.call("context", { projectId, limit })) as Record<string, unknown>;
  const localContext = (await local.call("context", { projectId, limit })) as Record<string, unknown>;
  const contextDiffs: string[] = [];
  const bMem = (bridgeContext.memories ?? []) as Array<Record<string, unknown>>;
  const lMem = (localContext.memories ?? []) as Array<Record<string, unknown>>;
  const bMemIds = bMem.filter((m) => !tombstonedLocally.has(String(m.id))).map((m) => String(m.id));
  const lMemIds = lMem.map((m) => String(m.id));
  if (JSON.stringify(bMemIds) !== JSON.stringify(lMemIds)) contextDiffs.push(`memories ids differ (bridge=${bMemIds.length} local=${lMemIds.length})`);
  const bMemById = new Map(bMem.map((m) => [String(m.id), String(m.content ?? "")]));
  let contentMismatch = 0;
  for (const m of lMem) {
    const expected = bMemById.get(String(m.id));
    if (expected != null && expected !== String(m.content ?? "")) contentMismatch += 1;
  }
  if (contentMismatch > 0) contextDiffs.push(`memory content mismatches: ${contentMismatch}`);
  for (const key of ["decisions", "pendingTasks", "activeTopics"] as const) {
    const a = JSON.stringify((bridgeContext[key] ?? []) as unknown[]);
    const b = JSON.stringify((localContext[key] ?? []) as unknown[]);
    if (a !== b) contextDiffs.push(`${key} arrays differ`);
  }
  const searches: Array<Record<string, unknown>> = [];
  let allIdentical = contextDiffs.length === 0;
  for (const term of SEARCH_TERMS) {
    const bridgeResult = (await deps.bridge.call("search", { projectId, query: term, limit: 50 })) as { query: string; count: number; results: SearchRow[] };
    const localResult = (await local.call("search", { projectId, query: term, limit: 50 })) as { query: string; count: number; results: Array<{ type: string; id: string; text: string; createdAt?: string | null; score: number }> };
    const cmp = compareSearchResults(bridgeResult.results ?? [], localResult.results ?? [], tombstonedLocally);
    if (!cmp.identical) allIdentical = false;
    searches.push({ ...cmp, term, identical: cmp.identical, bridgeCount: bridgeResult.results?.length ?? 0, localCount: localResult.results?.length ?? 0 });
  }
  const report = {
    ranAt: (deps.now ?? (() => new Date()))().toISOString(),
    importResult,
    context: { identical: contextDiffs.length === 0, diffs: contextDiffs },
    searches,
    allIdentical,
  };
  state.shadowReport = report;
  state.phase = allIdentical ? "shadow-identical" : "shadow-divergent";
  pushHistory(state, { at: report.ranAt, action: "shadow", allIdentical, exportFile: fresh.file });
  writeState(stateFile, state);
  return report;
}

// ---- switch ----

function switchGuards(state: MigrationState, local: LocalSqliteStore | null): Record<string, unknown> {
  const verify = state.verifyReport as { allMatched?: boolean } | undefined;
  const shadow = state.shadowReport as { allIdentical?: boolean } | undefined;
  return {
    verifyPassed: verify?.allMatched === true,
    shadowIdentical: shadow?.allIdentical === true,
    localStoreReady: local != null,
  };
}

// ---- orchestrator ----

export async function runMemoryMigrate(input: MemoryMigrateInput, deps: MemoryMigrateDeps): Promise<Record<string, unknown>> {
  const storeDir = deps.storeDir ?? DEFAULT_STORE_DIR;
  const stateFile = deps.stateFile ?? MIGRATION_STATE_FILE;
  const flagFile = deps.flagFile ?? DEFAULT_FLAG_FILE;
  const projectId = input.projectId ?? "memoryos";
  const limit = input.limit ?? 100;
  const now = deps.now ?? (() => new Date());
  const state = readState(stateFile);

  let local: LocalSqliteStore | null = null;
  const localDbPath = path.join(storeDir, "memoryos.db");
  const localExists = existsSync(localDbPath);
  const openLocal = (): LocalSqliteStore => {
    if (!local) local = new LocalSqliteStore({ storeDir, auditFile: path.join(path.dirname(stateFile), "audit", "memory-store.jsonl") });
    return local;
  };

  const mutating = input.action === "import" || input.action === "shadow" || input.action === "switch" || input.action === "restore";
  const approved = input.approval?.approved === true;
  const executing = input.execute === true;
  if (mutating && !(approved && executing)) {
    // PLAN: zero mutation, describe exactly what execute would do.
    const plan: Record<string, unknown> = {
      action: input.action,
      status: "PLAN",
      would: input.action === "import" ? "upsert the export payload into the local SQLite store (content-only; tombstones untouched)"
        : input.action === "shadow" ? "fresh export + import, then compare the SAME query battery against bridge and local (mutations local-only)"
        : input.action === "switch" ? "flip the MEMORY_STORE flag file to local after guards pass (activation on next governed restart; rollback = flag back to bridge)"
        : `restore the store from a backups/ snapshot after a fresh pre-restore snapshot`,
      requiresExecuteAndApproval: true,
    };
    if (input.action === "switch") plan.guards = switchGuards(state, localExists ? openLocal() : null);
    if (input.action === "restore") plan.restorePath = input.restorePath ?? null;
    return plan;
  }

  switch (input.action) {
    case "status": {
      const flag = (() => { try { return readFileSync(flagFile, "utf8").trim().toLowerCase(); } catch { return null; } })();
      const backups = (() => { try { return readdirSync(path.join(storeDir, "backups")).filter((f) => f.endsWith(".db")).sort().reverse().slice(0, 5); } catch { return []; } })();
      return {
        action: "status",
        storeMode: { flagFile, flagValue: flag, note: "activation reads the flag at boot; default is bridge" },
        localStore: { dbPath: localDbPath, exists: localExists, counts: localExists ? openLocal().counts(projectId) : null },
        migrationState: { phase: state.phase ?? "none", exportFile: state.exportFile ?? null, switchedAt: state.switchedAt ?? null },
        recentSnapshots: backups,
        searchTerms: SEARCH_TERMS,
      };
    }
    case "export": {
      const result = await runExport(deps, projectId, limit);
      state.exportFile = result.file;
      state.exportedAt = result.payload.exportedAt;
      state.coverage = result.coverage;
      state.phase = state.phase === "switched" ? state.phase : "exported";
      pushHistory(state, { at: result.payload.exportedAt, action: "export", file: result.file, coverage: result.coverage });
      writeState(stateFile, state);
      return { action: "export", status: "OK", file: result.file, coverage: result.coverage, bridgeCounts: result.counts, readOnly: true };
    }
    case "import": {
      const exportFile = input.exportFile ?? (state.exportFile as string | undefined) ?? latestExport(storeDir);
      if (!exportFile || !existsSync(exportFile)) throw new Error("MIGRATE_EXPORT_FILE_REQUIRED");
      const payload = JSON.parse(readFileSync(exportFile, "utf8")) as ExportPayload;
      const rows = buildImportRows(payload, projectId);
      const result = openLocal().upsertRecords(projectId, rows);
      state.importedAt = now().toISOString();
      state.importedRows = result.upserted;
      state.phase = state.phase === "switched" ? state.phase : "imported";
      pushHistory(state, { at: state.importedAt, action: "import", file: exportFile, upserted: result.upserted, sessions: result.sessions });
      writeState(stateFile, state);
      return { action: "import", status: "OK", file: exportFile, ...result, counts: openLocal().counts(projectId) };
    }
    case "verify": {
      const exportFile = input.exportFile ?? (state.exportFile as string | undefined) ?? latestExport(storeDir);
      if (!exportFile || !existsSync(exportFile)) throw new Error("MIGRATE_EXPORT_FILE_REQUIRED");
      const payload = JSON.parse(readFileSync(exportFile, "utf8")) as ExportPayload;
      const report = runVerify(openLocal(), payload, projectId);
      state.verifyReport = report;
      state.verifiedAt = now().toISOString();
      state.phase = state.phase === "switched" ? state.phase : report.allMatched ? "verified" : "verify-failed";
      pushHistory(state, { at: state.verifiedAt, action: "verify", allMatched: report.allMatched, compared: report.compared, matched: report.matched });
      writeState(stateFile, state);
      return { action: "verify", status: "OK", file: exportFile, ...report };
    }
    case "shadow":
      return { action: "shadow", status: "OK", ...(await runShadow(deps, openLocal(), projectId, limit, state, stateFile)) };
    case "switch": {
      const guards = switchGuards(state, openLocal());
      const guardsOk = Object.values(guards).every(Boolean);
      if (!guardsOk) throw new Error(`MIGRATE_SWITCH_GUARDS_FAILED:${JSON.stringify(guards)}`);
      const snapshot = openLocal().snapshot("pre-switch");
      try { mkdirSync(path.dirname(flagFile), { recursive: true, mode: 0o700 }); writeFileSync(flagFile, "local\n", { mode: 0o600 }); chmodSync(flagFile, 0o600); } catch (error) { throw new Error(`MIGRATE_FLAG_WRITE_FAILED:${String(error)}`); }
      state.switchedAt = now().toISOString();
      state.preSwitchSnapshotHash = snapshot.hash16;
      state.phase = "switched";
      pushHistory(state, { at: state.switchedAt, action: "switch", flagFile, preSwitchSnapshotHash: snapshot.hash16 });
      writeState(stateFile, state);
      return { action: "switch", status: "OK", flagFile, flagValue: "local", preSwitchSnapshot: snapshot, requiresRestart: true, note: "activation reads the flag at boot; run the governed release-runner restart to activate. Rollback: flag back to 'bridge' + restart." };
    }
    case "snapshot": {
      const snapshot = openLocal().snapshot("manual");
      return { action: "snapshot", status: "OK", snapshot };
    }
    case "restore": {
      if (!input.restorePath) throw new Error("MIGRATE_RESTORE_PATH_REQUIRED");
      const store = openLocal();
      const pre = store.restore(input.restorePath);
      pushHistory(state, { at: now().toISOString(), action: "restore", from: path.basename(input.restorePath), preSnapshotHash: pre.hash16 });
      state.phase = state.phase === "switched" ? state.phase : "restored";
      writeState(stateFile, state);
      return { action: "restore", status: "OK", from: input.restorePath, preRestoreSnapshotHash: pre.hash16, counts: store.counts(projectId) };
    }
    default:
      throw new Error(`MIGRATE_ACTION_UNSUPPORTED:${String(input.action)}`);
  }
}

function latestExport(storeDir: string): string | null {
  try {
    const files = readdirSync(path.join(storeDir, "migration")).filter((f) => f.startsWith("export-") && f.endsWith(".json")).sort();
    return files.length ? path.join(storeDir, "migration", files[files.length - 1]) : null;
  } catch { return null; }
}
