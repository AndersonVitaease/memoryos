// STORE-MIG-01: local persistent-memory store behind the SAME call() contract as
// the Base44 agentMemoryBridge (context/search/capture) plus the update
// operation the bridge refused — local is trivial. Fidelity rules (verified by
// engineering.memory.migrate verify/shadow, not assumed):
//   - context/search/capture response SHAPES mirror the bridge byte-for-byte in
//     keys (golden: base44/functions/agentMemoryBridge/entry.ts);
//   - scoreText/normalize/terms/buildCapture are copied verbatim from the
//     bridge so lexical+recency scores are identical;
//   - tombstone filter is NATIVE in the projections (deleted=true never leaves
//     the store unless includeTombstoned=true) — stripTombstoned in tools.ts
//     becomes a benign second filter;
//   - update applies a strict field whitelist with null allowed (rollback),
//     takes an automatic pre-mutation store snapshot, and appends to the audit;
//   - MEMORY_STORE flag: env ENG_MCP_MEMORY_STORE (explicit override) > flag
//     file (0600, written via engineering.vps.secret.write — a governed,
//     auditable channel) > default "bridge". Boot-only read, like the registry.
// Zero new dependencies: node:sqlite is stable on Node 24 (the container runs
// node:24.19.0).
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { AgentMemoryClient, type AgentMemoryOperation, type AgentMemoryPayload } from "./memory.ts";

export type MemoryStoreMode = "bridge" | "local";

export const DEFAULT_FLAG_FILE = "/data/credentials/memory-store-mode";
export const DEFAULT_STORE_DIR = "/data/memoryos";

const UPDATE_FIELD_WHITELIST = new Set([
  "merged_from", "merged_at",
  "deleted", "merged_into", "deleted_reason",
  "stale", "stale_reason", "superseded_by", "stale_at",
  "period_tag", "tagged_at",
]);

// ---- bridge-faithful text functions (copied verbatim from the golden source) ----

const MAX_TEXT = 8_000;
const MAX_SEARCH_ROWS = 200;

function str(v: unknown, max = MAX_TEXT): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, " ");
}
function terms(q: string): string[] {
  return [...new Set(normalize(q).split(/[^a-z0-9_-]+/).filter((w) => w.length >= 3))].slice(0, 24);
}
function scoreText(text: string, q: string, createdAt?: unknown): number {
  const ts = terms(q);
  const lower = normalize(text);
  const lexical = ts.length ? ts.filter((t) => lower.includes(t)).length / ts.length : 0.25;
  const ageMs = Date.now() - Date.parse(String(createdAt ?? ""));
  const recency = Number.isFinite(ageMs) && ageMs >= 0 ? Math.max(0.1, 1 - ageMs / (180 * 86400_000)) : 0.2;
  return Math.round((lexical * 0.8 + recency * 0.2) * 1000) / 1000;
}
function buildCapture(body: Record<string, unknown>, agent: string): string {
  const blocks: string[] = ["[AGENT MEMORY]", `Agent: ${agent}`];
  const fields: Array<[string, string]> = [
    ["Summary", str(body.summary, 3_000)],
    ["User request", str(body.userPrompt ?? body.user_prompt, 2_000)],
    ["Outcome", str(body.outcome ?? body.resultSummary ?? body.result_summary, 3_000)],
  ];
  for (const [label, value] of fields) if (value) blocks.push(`${label}: ${value}`);
  const listFields: Array<[string, unknown]> = [
    ["Decisions", body.decisions], ["Problems", body.problems], ["Solutions", body.solutions],
    ["Tests", body.tests], ["Files", body.files], ["Next steps", body.nextSteps ?? body.next_steps],
  ];
  for (const [label, value] of listFields) {
    const values = Array.isArray(value)
      ? value.map((x) => str(x, 1_000)).filter(Boolean).slice(0, 30)
      : [];
    if (values.length) blocks.push(`${label}:\n${values.map((x) => `- ${x}`).join("\n")}`);
  }
  return blocks.join("\n").slice(0, MAX_TEXT);
}
const sha16 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);

// ---- flag resolution ----

export function resolveStoreMode(env: NodeJS.ProcessEnv = process.env, flagFile = env.ENG_MCP_MEMORY_STORE_FLAG_FILE ?? DEFAULT_FLAG_FILE): { mode: MemoryStoreMode; source: string } {
  const explicit = env.ENG_MCP_MEMORY_STORE;
  if (explicit === "local" || explicit === "bridge") return { mode: explicit, source: "env" };
  if (explicit !== undefined) throw new Error(`MEMORY_STORE_FLAG_INVALID:${explicit}`);
  try {
    const raw = readFileSync(flagFile, "utf8").trim().toLowerCase();
    if (raw === "local") return { mode: "local", source: "flag-file" };
    if (raw === "bridge" || raw === "") return { mode: "bridge", source: "flag-file" };
    // Fail-safe: an unreadable flag value must never silently activate the new
    // store. Default stays bridge (rollback is always the default).
    return { mode: "bridge", source: "flag-file-invalid" };
  } catch {
    return { mode: "bridge", source: "default" };
  }
}

// ---- schema ----

const SCHEMA = `
CREATE TABLE IF NOT EXISTS records (
  kind TEXT NOT NULL,             -- memory | decision | task | topic | entity
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  session_id TEXT,
  title TEXT,
  content TEXT,                   -- memory content / task+decision description / topic description / entity value
  status TEXT,
  extra_json TEXT,                -- type-specific payload (description, rationale, name, value, context, entity type)
  created_at TEXT,
  merged_from TEXT, merged_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  merged_into TEXT, deleted_reason TEXT,
  stale INTEGER NOT NULL DEFAULT 0, stale_reason TEXT, superseded_by TEXT, stale_at TEXT,
  period_tag TEXT, tagged_at TEXT,
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS idx_records_project ON records(kind, project_id, created_at DESC);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT
);
`;

export type StoreRow = {
  kind: string; id: string; project_id: string; session_id: string | null;
  title: string | null; content: string | null; status: string | null; extra_json: string | null;
  created_at: string | null;
  merged_from: string | null; merged_at: string | null;
  deleted: number; merged_into: string | null; deleted_reason: string | null;
  stale: number; stale_reason: string | null; superseded_by: string | null; stale_at: string | null;
  period_tag: string | null; tagged_at: string | null;
};

export type SnapshotInfo = { path: string; hash16: string; bytes: number; reason: string; createdAt: string };

export type ImportRow = {
  kind: "memory" | "decision" | "task" | "topic" | "entity";
  id: string;
  createdAt?: string | null;
  sessionId?: string | null;
  title?: string | null;
  content?: string | null;
  status?: string | null;
  extra?: Record<string, unknown> | null;
};

// ---- local store ----

export class LocalSqliteStore {
  readonly mode = "local" as const;
  private db: DatabaseSync;
  readonly storeDir: string;
  private auditFile: string;
  private dailyTimer: NodeJS.Timeout | null = null;
  private lastSnapshotHash: string | null = null;

  constructor(options: { storeDir?: string; auditFile?: string; env?: NodeJS.ProcessEnv } = {}) {
    const env = options.env ?? process.env;
    this.storeDir = options.storeDir ?? env.ENG_MCP_MEMORY_STORE_DIR ?? DEFAULT_STORE_DIR;
    this.auditFile = options.auditFile ?? "/data/audit/memory-store.jsonl";
    mkdirSync(this.storeDir, { recursive: true, mode: 0o700 });
    try { chmodSync(this.storeDir, 0o700); } catch { /* best effort on bind mounts */ }
    const dbPath = path.join(this.storeDir, "memoryos.db");
    const fresh = !existsSync(dbPath);
    this.db = new DatabaseSync(dbPath);
    try { chmodSync(dbPath, 0o600); } catch { /* best effort */ }
    this.db.exec("PRAGMA journal_mode=WAL;");
    this.db.exec("PRAGMA busy_timeout=5000;");
    this.db.exec("PRAGMA foreign_keys=ON;");
    this.db.exec(SCHEMA);
    if (fresh) this.audit({ event: "store-created", db: dbPath });
    const wal = (this.db.prepare("PRAGMA journal_mode").get() as Record<string, unknown> | undefined)?.journal_mode;
    if (String(wal ?? "").toLowerCase() !== "wal") throw new Error("MEMORY_STORE_WAL_NOT_ENABLED");
  }

  startDailySnapshots(intervalMs = 24 * 3600_000): void {
    if (this.dailyTimer) return;
    this.dailyTimer = setInterval(() => {
      try { this.snapshot("daily"); } catch (error) { this.audit({ event: "daily-snapshot-failed", error: String(error) }); }
    }, intervalMs);
    this.dailyTimer.unref?.();
    try { this.snapshot("daily-boot"); } catch { /* audit inside */ }
  }

  close(): void {
    if (this.dailyTimer) clearInterval(this.dailyTimer);
    this.dailyTimer = null;
    this.db.close();
  }

  private audit(entry: Record<string, unknown>): void {
    try {
      mkdirSync(path.dirname(this.auditFile), { recursive: true });
      writeFileSync(this.auditFile, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, { flag: "a", mode: 0o600 });
    } catch { /* observability only */ }
  }

  // ---- snapshots (versioned backups: daily + mandatory pre-mutation) ----

  snapshot(reason: string): SnapshotInfo {
    const backupDir = path.join(this.storeDir, "backups");
    mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    // Checkpoint WAL into the main db so the copied file is complete.
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    const createdAt = new Date().toISOString();
    const fileName = `snap-${createdAt.replace(/[:.]/g, "-")}-${reason}.db`;
    const target = path.join(backupDir, fileName);
    copyFileSync(path.join(this.storeDir, "memoryos.db"), target);
    chmodSync(target, 0o600);
    const bytes = statSync(target).size;
    const hash16 = sha16(readFileSync(target, "utf8"));
    writeFileSync(path.join(backupDir, "manifest.jsonl"), `${JSON.stringify({ file: fileName, reason, bytes, hash16, createdAt })}\n`, { flag: "a", mode: 0o600 });
    if (hash16 !== this.lastSnapshotHash) {
      this.lastSnapshotHash = hash16;
      this.audit({ event: "snapshot", reason, file: fileName, hash16, bytes });
    }
    this.pruneBackups(backupDir);
    return { path: target, hash16, bytes, reason, createdAt };
  }

  restore(snapshotPath: string): SnapshotInfo {
    const resolved = path.resolve(snapshotPath);
    if (!resolved.startsWith(path.resolve(path.join(this.storeDir, "backups")))) {
      throw new Error("MEMORY_RESTORE_PATH_OUTSIDE_BACKUPS");
    }
    const pre = this.snapshot("pre-restore");
    copyFileSync(resolved, path.join(this.storeDir, "memoryos.db"));
    chmodSync(path.join(this.storeDir, "memoryos.db"), 0o600);
    // Reopen to guarantee a consistent handle on the restored bytes.
    this.db.close();
    this.db = new DatabaseSync(path.join(this.storeDir, "memoryos.db"));
    this.db.exec("PRAGMA journal_mode=WAL;");
    this.db.exec("PRAGMA busy_timeout=5000;");
    this.audit({ event: "restore", from: path.basename(resolved), preSnapshotHash: pre.hash16 });
    return pre;
  }

  private pruneBackups(backupDir: string, keepDaily = 14, keepOther = 30): void {
    const lines = (() => { try { return readFileSync(path.join(backupDir, "manifest.jsonl"), "utf8").trim().split("\n").filter(Boolean); } catch { return []; } })();
    const manifest = lines.map((l) => { try { return JSON.parse(l) as { file: string; reason: string; createdAt: string }; } catch { return null; } }).filter(Boolean) as Array<{ file: string; reason: string; createdAt: string }>;
    const daily = manifest.filter((m) => m.reason.startsWith("daily"));
    const other = manifest.filter((m) => !m.reason.startsWith("daily"));
    const drop = new Set<string>();
    for (const old of daily.slice(0, Math.max(0, daily.length - keepDaily))) drop.add(old.file);
    for (const old of other.slice(0, Math.max(0, other.length - keepOther))) drop.add(old.file);
    for (const file of drop) {
      try { unlinkSync(path.join(backupDir, file)); this.audit({ event: "snapshot-pruned", file }); } catch { /* already gone */ }
    }
  }

  // ---- row projection (bridge-faithful shapes) ----

  private rows(kind: string, projectId: string, limit: number, includeTombstoned: boolean): StoreRow[] {
    const filter = includeTombstoned ? "" : "AND deleted = 0";
    return this.db.prepare(
      `SELECT * FROM records WHERE kind = ? AND project_id = ? ${filter} ORDER BY created_at DESC LIMIT ?`
    ).all(kind, projectId, limit) as unknown as StoreRow[];
  }

  private static memoryText(r: StoreRow): string { return String(r.content ?? ""); }
  // Content-first: imported rows carry the canonical bridge projection text in
  // `content` (so search text is byte-identical to the bridge's), structured
  // fields drive the context projections. Structured join is the fallback for
  // locally captured/constructed rows.
  private static decisionText(r: StoreRow): string {
    if (r.content) return r.content;
    const extra = JSON.parse(r.extra_json ?? "{}") as { description?: string; rationale?: string };
    return [r.title, extra.description, extra.rationale].filter(Boolean).join(" — ");
  }
  private static taskText(r: StoreRow): string {
    if (r.content) return r.content;
    const extra = JSON.parse(r.extra_json ?? "{}") as { description?: string };
    return [r.title, extra.description, r.status].filter(Boolean).join(" — ");
  }
  private static topicText(r: StoreRow): string {
    if (r.content) return r.content;
    const extra = JSON.parse(r.extra_json ?? "{}") as { description?: string };
    return [r.title, extra.description].filter(Boolean).join(" — ");
  }
  private static entityText(r: StoreRow): string {
    if (r.content) return r.content;
    const extra = JSON.parse(r.extra_json ?? "{}") as { type?: string; value?: string; context?: string };
    return [extra.type, extra.value, extra.context].filter(Boolean).join(" — ");
  }

  // ---- public contract (same call() signature as AgentMemoryClient) ----

  async call(operation: AgentMemoryOperation, payload: AgentMemoryPayload = {}): Promise<unknown> {
    switch (operation) {
      case "context": return this.context(payload);
      case "search": return this.search(payload);
      case "capture": return this.capture(payload);
      case "update": return this.update(payload);
      default: throw new Error(`AGENT_MEMORY_UNSUPPORTED_OPERATION:${String(operation)}`);
    }
  }

  private context(payload: AgentMemoryPayload): unknown {
    const projectId = str(payload.projectId, 200) || "memoryos";
    const limit = Math.min(100, Math.max(1, Math.floor(Number(payload.limit ?? 30)) || 30));
    const includeTombstoned = payload.includeTombstoned === true;
    const memories = this.rows("memory", projectId, limit, includeTombstoned);
    const agentMemories = memories.filter((r) => r.content?.includes("[AGENT MEMORY]"));
    const decisions = this.rows("decision", projectId, Math.min(limit, 50), includeTombstoned).slice(0, 12);
    const tasksAll = this.rows("task", projectId, Math.min(limit, 50), includeTombstoned);
    // pendingTasks mirrors the bridge (status !== done). Search-only imported
    // tasks have unknown status (null) — they are never counted as pending:
    // any task the bridge would place in its slice arrives structured via
    // context import, so null-status here means "outside the bridge slice".
    const pendingTasks = tasksAll.filter((r) => r.status !== "done" && r.status != null).slice(0, 12);
    const topicsAll = this.rows("topic", projectId, Math.min(limit, 50), includeTombstoned);
    const entities = this.rows("entity", projectId, Math.min(limit, 100), includeTombstoned);
    return {
      projectId,
      memories: agentMemories.slice(0, limit).map((r) => ({ id: r.id, content: r.content, createdAt: r.created_at, sessionId: r.session_id })),
      decisions: decisions.map((r) => {
        const extra = JSON.parse(r.extra_json ?? "{}") as { description?: string | null; rationale?: string | null };
        return { id: r.id, title: r.title, description: extra.description ?? null, rationale: extra.rationale ?? null, decidedAt: r.created_at };
      }),
      pendingTasks: pendingTasks.map((r) => {
        const extra = JSON.parse(r.extra_json ?? "{}") as { description?: string | null };
        return { id: r.id, title: r.title, description: extra.description ?? null, status: r.status ?? null };
      }),
      activeTopics: topicsAll.filter((r) => r.status === "active").slice(0, 12).map((r) => {
        const extra = JSON.parse(r.extra_json ?? "{}") as { description?: string | null };
        return { id: r.id, name: r.title, description: extra.description ?? null };
      }),
      counts: { memories: agentMemories.length, decisions: decisions.length, tasks: tasksAll.length, topics: topicsAll.length, entities: entities.length },
    };
  }

  private search(payload: AgentMemoryPayload): unknown {
    const projectId = str(payload.projectId, 200) || "memoryos";
    const query = str(payload.query, 2_000);
    if (!query) return { projectId, query, count: 0, results: [] };
    const limit = Math.min(50, Math.max(1, Math.floor(Number(payload.limit ?? 20)) || 20));
    const includeTombstoned = payload.includeTombstoned === true;
    const candidates: Array<{ type: string; id: string; text: string; createdAt: string | null; score: number; metadata?: Record<string, unknown> }> = [];
    const push = (rows: StoreRow[], type: string, textOf: (r: StoreRow) => string, metadata?: (r: StoreRow) => Record<string, unknown>) => {
      for (const r of rows) {
        const text = textOf(r);
        candidates.push({ type, id: r.id, text, createdAt: r.created_at, score: scoreText(text, query, r.created_at), ...(metadata ? { metadata: metadata(r) } : {}) });
      }
    };
    push(this.rows("memory", projectId, MAX_SEARCH_ROWS, includeTombstoned), "message", LocalSqliteStore.memoryText);
    push(this.rows("decision", projectId, 50, includeTombstoned), "decision", LocalSqliteStore.decisionText);
    push(this.rows("task", projectId, 50, includeTombstoned), "task", LocalSqliteStore.taskText);
    push(this.rows("topic", projectId, 50, includeTombstoned), "topic", LocalSqliteStore.topicText);
    push(this.rows("entity", projectId, 100, includeTombstoned), "entity", LocalSqliteStore.entityText);
    const results = candidates.filter((x) => x.score >= 0.2).sort((a, b) => b.score - a.score).slice(0, limit);
    return { projectId, query, count: results.length, results };
  }

  private capture(payload: AgentMemoryPayload): unknown {
    const projectId = str(payload.projectId, 200) || "memoryos";
    const agent = str(payload.agent, 80) || "external-agent";
    const content = buildCapture(payload, agent);
    if (content.length < 40) throw new Error("AGENT_MEMORY_CAPTURE_TOO_SHORT");
    const summary = str(payload.summary, 2_000) || str(payload.outcome, 2_000) || null;
    // Session find-or-create mirrors the bridge: one dedicated session per agent.
    const title = `Agent Memory · ${agent}`;
    const existing = this.db.prepare("SELECT id FROM sessions WHERE project_id = ? AND title = ? ORDER BY last_message_at DESC LIMIT 1").get(projectId, title) as { id: string } | undefined;
    const sid = existing?.id ?? `sess-${randomUUID()}`;
    if (!existing) this.db.prepare("INSERT INTO sessions (id, project_id, title, summary, message_count, last_message_at) VALUES (?, ?, ?, ?, 0, ?)").run(sid, projectId, title, `Persistent engineering memory captured automatically from ${agent}.`, new Date().toISOString());
    const memoryId = randomUUID();
    this.snapshot("pre-capture");
    this.db.prepare(
      `INSERT INTO records (kind, id, project_id, session_id, content, created_at) VALUES ('memory', ?, ?, ?, ?, ?)`
    ).run(memoryId, projectId, sid, content, new Date().toISOString());
    const session = this.db.prepare("SELECT summary, message_count FROM sessions WHERE id = ?").get(sid) as { summary: string | null; message_count: number } | undefined;
    this.db.prepare("UPDATE sessions SET summary = ?, message_count = ?, last_message_at = ? WHERE id = ?")
      .run(summary ?? session?.summary ?? null, Number(session?.message_count ?? 0) + 1, new Date().toISOString(), sid);
    this.audit({ event: "capture", projectId, agent, sessionId: sid, memoryId });
    return { projectId, agent, sessionId: sid, memoryId, stored: true, memoryBatch: "local-store" };
  }

  private update(payload: AgentMemoryPayload): unknown {
    const projectId = str(payload.projectId, 200) || "memoryos";
    const id = str(payload.id, 200);
    if (!id) throw new Error("AGENT_MEMORY_UPDATE_ID_REQUIRED");
    const fields = payload.fields;
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new Error("AGENT_MEMORY_UPDATE_FIELDS_REQUIRED");
    const entries = Object.entries(fields as Record<string, unknown>);
    if (!entries.length) throw new Error("AGENT_MEMORY_UPDATE_FIELDS_REQUIRED");
    for (const [key] of entries) {
      if (!UPDATE_FIELD_WHITELIST.has(key)) throw new Error(`UPDATE_FIELD_NOT_ALLOWED:${key}`);
    }
    const existing = this.db.prepare("SELECT * FROM records WHERE id = ? AND project_id = ?").get(id, projectId) as StoreRow | undefined;
    if (!existing) return { updated: false, reason: "record_not_found", id };
    // Mandatory pre-mutation snapshot of the whole store (the bigger safety net
    // around the merge tool's own per-target backup).
    const snapshot = this.snapshot("pre-update");
    const sets = entries.map(([key]) => `${key} = ?`);
    const values = entries.map(([key, value]) => {
      if (key === "deleted" || key === "stale") return value === true ? 1 : value === false || value === null ? 0 : Number(value);
      if (value === null || value === undefined) return null;
      if (typeof value === "string") return str(value, 8_000);
      return JSON.stringify(value);
    });
    this.db.prepare(`UPDATE records SET ${sets.join(", ")} WHERE id = ? AND project_id = ?`).run(...values, id, projectId);
    const after = this.db.prepare("SELECT * FROM records WHERE id = ? AND project_id = ?").get(id, projectId) as StoreRow;
    this.audit({ event: "update", id, projectId, fields: Object.keys(fields as Record<string, unknown>), preSnapshotHash: snapshot.hash16 });
    return { updated: true, id, fields: Object.keys(fields as Record<string, unknown>), preSnapshotHash: snapshot.hash16, record: LocalSqliteStore.toRaw(after) };
  }

  static toRaw(r: StoreRow): Record<string, unknown> {
    const extra = (() => { try { return JSON.parse(r.extra_json ?? "{}") as Record<string, unknown>; } catch { return {}; } })();
    const base: Record<string, unknown> = {
      id: r.id, kind: r.kind, projectId: r.project_id, createdAt: r.created_at,
      deleted: r.deleted === 1 ? true : false,
      stale: r.stale === 1 ? true : false,
      merged_from: r.merged_from, merged_into: r.merged_into, deleted_reason: r.deleted_reason,
      stale_reason: r.stale_reason, superseded_by: r.superseded_by, period_tag: r.period_tag,
    };
    if (r.kind === "memory") { base.content = r.content; base.sessionId = r.session_id; }
    else {
      base.content = r.content;
      if (r.kind === "decision") { base.title = r.title; base.description = extra.description ?? null; base.rationale = extra.rationale ?? null; }
      if (r.kind === "task") { base.title = r.title; base.description = extra.description ?? null; base.status = r.status; }
      if (r.kind === "topic") { base.name = r.title; base.description = extra.description ?? null; base.status = r.status; }
      if (r.kind === "entity") { base.type = extra.type ?? null; base.value = extra.value ?? null; base.context = extra.context ?? null; }
    }
    return base;
  }

  counts(projectId: string): { memories: number; decisions: number; tasks: number; topics: number; entities: number; total: number } {
    const count = (kind: string) => Number((this.db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = ? AND project_id = ? AND deleted = 0").get(kind, projectId) as { n: number }).n);
    const memories = count("memory"), decisions = count("decision"), tasks = count("task"), topics = count("topic"), entities = count("entity");
    return { memories, decisions, tasks, topics, entities, total: memories + decisions + tasks + topics + entities };
  }

  // Direct id lookup INCLUDING tombstones — the state view used by verify and
  // the merge idempotency/restoration paths.
  rawById(projectId: string, ids: string[]): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    const stmt = this.db.prepare("SELECT * FROM records WHERE id = ? AND project_id = ?");
    for (const id of ids) {
      const row = stmt.get(id, projectId) as StoreRow | undefined;
      if (row) out.push(LocalSqliteStore.toRaw(row));
    }
    return out;
  }

  // STORE-MIG-01 import: upsert CONTENT fields only — tombstone/merge meta
  // (deleted, stale, merged_*) is deliberately untouched so a re-import after
  // operator merges never resurrects tombstoned records.
  upsertRecords(projectId: string, rows: ImportRow[]): { upserted: number; sessions: number } {
    const upsert = this.db.prepare(
      `INSERT INTO records (kind, id, project_id, session_id, title, content, status, extra_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(kind, id) DO UPDATE SET
         session_id = COALESCE(excluded.session_id, records.session_id),
         title = COALESCE(excluded.title, records.title),
         content = COALESCE(excluded.content, records.content),
         status = COALESCE(excluded.status, records.status),
         extra_json = COALESCE(excluded.extra_json, records.extra_json),
         created_at = COALESCE(excluded.created_at, records.created_at)`
    );
    const upsertSession = this.db.prepare(
      `INSERT OR IGNORE INTO sessions (id, project_id, title, summary, message_count, last_message_at)
       VALUES (?, ?, ?, ?, 0, ?)`
    );
    let upserted = 0;
    let sessions = 0;
    const snapshot = this.snapshot("pre-import");
    for (const row of rows) {
      upsert.run(
        row.kind, row.id, projectId,
        row.sessionId ?? null,
        row.title ?? null,
        row.content ?? null,
        row.status ?? null,
        row.extra ? JSON.stringify(row.extra) : null,
        row.createdAt ?? null
      );
      upserted += 1;
      if (row.kind === "memory" && row.sessionId) {
        const result = upsertSession.run(row.sessionId, projectId, "Imported from bridge", null, row.createdAt ?? new Date().toISOString());
        if (Number(result.changes) > 0) sessions += 1;
      }
    }
    this.audit({ event: "import", projectId, upserted, sessions, preSnapshotHash: snapshot.hash16 });
    return { upserted, sessions };
  }
}

// ---- bridge store (existing client, unchanged behavior) ----

export class BridgeMemoryStore {
  readonly mode = "bridge" as const;
  constructor(private client: AgentMemoryClient) {}
  async call(operation: AgentMemoryOperation, payload: AgentMemoryPayload = {}): Promise<unknown> {
    return this.client.call(operation, payload);
  }
}

export type MemoryStore = BridgeMemoryStore | LocalSqliteStore;

export function createMemoryStore(options: { env?: NodeJS.ProcessEnv; flagFile?: string } = {}): MemoryStore {
  const { mode, source } = resolveStoreMode(options.env, options.flagFile);
  if (mode === "local") {
    const store = new LocalSqliteStore({ env: options.env });
    store.startDailySnapshots();
    console.log(`ENG-MCP memory store mode=local source=${source} dir=${store.storeDir}`);
    return store;
  }
  console.log(`ENG-MCP memory store mode=bridge source=${source}`);
  return new BridgeMemoryStore(new AgentMemoryClient());
}

// re-export for consumers that still import from ./memory.ts
export { AgentMemoryClient };
export type { AgentMemoryOperation, AgentMemoryPayload };
