// SHIP-LOCK-01 — deterministic ship-phase lock ("um ship por vez" vira código).
// Layer 1 (this file): the MCP gate acquires an O_EXCL ship.lock before any
// ship-phase tool handler runs; a present lock is a tier-1 refusal naming the
// holder, its age and the operator revoke path. Fail-safe: the presence of a
// lock NEVER allows progress — expired and unreadable locks refuse too, and
// expiry never auto-releases silently (the file stays on disk until the
// operator revokes it). Audit is metadata-only JSONL (holderHash16, never the
// holder id). Deterministic: no network, no LLM, no SSH/shell.
import { createHash } from "node:crypto";
import { appendFile, mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import type { AuthenticatedSubject } from "./policy.ts";

export type ShipLockRecord = {
  version: number;
  tool: string;
  holder: string;
  holderHash16: string;
  mission: string | null;
  acquiredAt: string;
  expiresAt: string;
  pid: number;
  pipelineArmed?: boolean;
};

export type ShipLockStatus = "absent" | "active" | "expired" | "unreadable";

export type ShipLockView = {
  present: boolean;
  status: ShipLockStatus;
  record: ShipLockRecord | null;
  rawSha16: string | null;
};

export const SHIP_LOCK_FILE_DEFAULT = "/opt/eng-mcp-release-data/production/ship.lock";
export const SHIP_LOCK_AUDIT_FILE_DEFAULT = "/data/audit/ship-lock.jsonl";
export const SHIP_LOCK_TTL_MS_DEFAULT = 2 * 60 * 60 * 1000;

// The ship-phase surface: these tools move production state, so at most one may run at a time.
export const SHIP_PHASE_TOOLS = Object.freeze([
  "engineering.git.commit",
  "engineering.git.merge",
  "engineering.release.pipeline",
  "engineering.release.run",
  "engineering.guardian.app.deploy",
]);

function sha256_16(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

async function auditShipLock(auditFile: string, entry: Record<string, unknown>): Promise<void> {
  // Metadata-only and fail-soft: audit problems must never gate or ungate a ship.
  try {
    await appendFile(auditFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, "utf8");
  } catch {
    /* fail-soft by design */
  }
}

export async function readShipLock(lockPath: string, nowMs: number = Date.now()): Promise<ShipLockView> {
  let raw: string;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch {
    return { present: false, status: "absent", record: null, rawSha16: null };
  }
  const rawSha16 = sha256_16(raw);
  let record: ShipLockRecord | null = null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) record = parsed as ShipLockRecord;
  } catch {
    record = null;
  }
  if (!record) return { present: true, status: "unreadable", record: null, rawSha16 };
  const expiresAt = Date.parse(String(record.expiresAt ?? ""));
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return { present: true, status: "expired", record, rawSha16 };
  return { present: true, status: "active", record, rawSha16 };
}

function refusalMessage(status: "active" | "expired" | "unreadable", view: ShipLockView, lockPath: string, nowMs: number): string {
  const revoke = `operator revoke path: rm ${lockPath}`;
  if (status === "unreadable") {
    return `SHIP_LOCK_UNREADABLE: ship lock at ${lockPath} is not a valid lock record; presence never grants; ${revoke}`;
  }
  const holder = String(view.record?.holder ?? "unknown");
  const acquiredAt = Date.parse(String(view.record?.acquiredAt ?? ""));
  const ageMs = Number.isFinite(acquiredAt) ? Math.max(0, nowMs - acquiredAt) : 0;
  if (status === "expired") {
    return `SHIP_LOCK_EXPIRED: ship lock at ${lockPath} held by holder=${holder} ageMs=${ageMs} is expired; presence never grants and expiry never auto-releases; ${revoke}`;
  }
  const mission = view.record?.mission ?? null;
  return `SHIP_LOCK_ACTIVE: ship lock at ${lockPath} held by holder=${holder} mission=${mission} ageMs=${ageMs}; one ship at a time — wait for the holder to finish or, if confirmed stale, ${revoke}`;
}

export async function acquireShipLock(
  tool: string,
  mission: string | null,
  options: { lockPath: string; auditFile: string; holder?: string; ttlMs?: number; nowMs?: number },
): Promise<{ record: ShipLockRecord; sha16: string }> {
  const now = options.nowMs ?? Date.now();
  const ttlMs = options.ttlMs ?? SHIP_LOCK_TTL_MS_DEFAULT;
  const refuse = async (status: "active" | "expired" | "unreadable", view: ShipLockView): Promise<never> => {
    await auditShipLock(options.auditFile, {
      event: "refuse",
      tool,
      reason: `SHIP_LOCK_${status.toUpperCase()}`,
      holderHash16: sha256_16(String(view.record?.holder ?? "unknown")),
    });
    throw new Error(refusalMessage(status, view, options.lockPath, now));
  };
  const existing = await readShipLock(options.lockPath, now);
  if (existing.present && existing.status !== "absent") await refuse(existing.status, existing);
  const holder = options.holder ?? "unknown";
  const record: ShipLockRecord = {
    version: 1,
    tool,
    holder,
    holderHash16: sha256_16(holder),
    mission: mission ?? null,
    acquiredAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    pid: process.pid,
  };
  // Only the pipeline tool arms the marker the runner-side layer 2 accepts.
  if (tool === "engineering.release.pipeline") record.pipelineArmed = true;
  const body = `${JSON.stringify(record, null, 2)}\n`;
  // The lock dir is the runner's production data dir; create it if absent so the
  // gate never turns a missing directory into a bogus holder refusal.
  await mkdir(dirname(options.lockPath), { recursive: true }).catch(() => undefined);
  try {
    const handle = await open(options.lockPath, "wx", 0o600);
    try {
      await handle.writeFile(body, "utf8");
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") {
      // Infrastructure failure (dir unwritable, fs error): refuse fail-safe,
      // naming the real cause instead of claiming a nonexistent holder.
      await auditShipLock(options.auditFile, { event: "refuse", tool, reason: "SHIP_LOCK_UNAVAILABLE" });
      throw new Error(`SHIP_LOCK_UNAVAILABLE: ship lock at ${options.lockPath} could not be created (${(error as NodeJS.ErrnoException)?.code ?? String(error)}); presence never grants; operator revoke path: rm ${options.lockPath}`);
    }
    // Lost the O_EXCL race — classify the winner's lock and refuse with its identity.
    const winner = await readShipLock(options.lockPath, now);
    if (winner.present && winner.status !== "absent") await refuse(winner.status, winner);
    throw new Error(`SHIP_LOCK_ACTIVE: ship lock at ${options.lockPath} appeared during acquisition; retry to see the holder identity`);
  }
  await auditShipLock(options.auditFile, {
    event: "acquire",
    tool,
    holderHash16: record.holderHash16,
    mission: record.mission,
    expiresAt: record.expiresAt,
    pipelineArmed: record.pipelineArmed === true,
  });
  return { record, sha16: sha256_16(body) };
}

export async function releaseShipLock(options: { lockPath: string; auditFile: string; expectedSha16: string }): Promise<"removed" | "skipped"> {
  let raw: string;
  try {
    raw = await readFile(options.lockPath, "utf8");
  } catch {
    return "skipped";
  }
  const parse = (): ShipLockRecord | null => {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as ShipLockRecord) : null;
    } catch {
      return null;
    }
  };
  if (sha256_16(raw) !== options.expectedSha16) {
    // Owner drift: the lock on disk is no longer the one this holder wrote — never delete it.
    const record = parse();
    await auditShipLock(options.auditFile, {
      event: "release_skip",
      tool: record?.tool ?? null,
      reason: "owner-drift",
      holderHash16: record ? sha256_16(String(record.holder ?? "unknown")) : null,
    });
    return "skipped";
  }
  const record = parse();
  await rm(options.lockPath);
  await auditShipLock(options.auditFile, {
    event: "release",
    tool: record?.tool ?? null,
    holderHash16: record ? sha256_16(String(record.holder ?? "unknown")) : null,
  });
  return "removed";
}

type ShipPhaseGateOptions = { lockPath?: string; auditFile?: string; ttlMs?: number };

// Wraps an McpServer so ship-phase tools acquire the ship.lock for the duration
// of their handler and release it afterwards. Non-ship tools pass through
// untouched. The gate only ever refuses — it never grants or approves.
export function shipPhaseGatedServer(server: McpServer, subject: AuthenticatedSubject, options: ShipPhaseGateOptions = {}): McpServer {
  const lockPath = options.lockPath ?? process.env.ENG_MCP_SHIP_LOCK_FILE ?? SHIP_LOCK_FILE_DEFAULT;
  const auditFile = options.auditFile ?? process.env.ENG_MCP_SHIP_LOCK_AUDIT_FILE ?? SHIP_LOCK_AUDIT_FILE_DEFAULT;
  const gated = async (tool: string, run: () => Promise<unknown>): Promise<unknown> => {
    let lock: { record: ShipLockRecord; sha16: string };
    try {
      lock = await acquireShipLock(tool, null, { lockPath, auditFile, holder: subject.subject, ttlMs: options.ttlMs });
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
    }
    try {
      return await run();
    } finally {
      await releaseShipLock({ lockPath, auditFile, expectedSha16: lock.sha16 });
    }
  };
  return new Proxy(server, {
    get(target, prop) {
      if (prop !== "registerTool") return Reflect.get(target, prop, target);
      return (name: string, definition: unknown, ...rest: unknown[]) => {
        const targetServer = target as unknown as { registerTool: (name: string, definition: unknown, ...rest: unknown[]) => unknown };
        if (!SHIP_PHASE_TOOLS.includes(name)) return targetServer.registerTool(name, definition, ...rest);
        const def = definition as { execute?: (args: unknown, ctx: unknown) => Promise<unknown> } | null;
        if (def && typeof def.execute === "function") {
          const original = def.execute;
          const wrapped = { ...(definition as Record<string, unknown>), execute: (args: unknown, ctx: unknown) => gated(name, () => original(args, ctx)) };
          return targetServer.registerTool(name, wrapped, ...rest);
        }
        const callbackIndex = rest.findIndex((entry) => typeof entry === "function");
        if (callbackIndex >= 0) {
          const original = rest[callbackIndex] as (args: unknown, ctx: unknown) => Promise<unknown>;
          const wrappedRest = rest.slice();
          wrappedRest[callbackIndex] = (args: unknown, ctx: unknown) => gated(name, () => original(args, ctx));
          return targetServer.registerTool(name, definition, ...wrappedRest);
        }
        return targetServer.registerTool(name, definition, ...rest);
      };
    },
  }) as McpServer;
}
