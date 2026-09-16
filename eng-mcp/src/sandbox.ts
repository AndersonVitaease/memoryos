// engineering.sandbox.* — SB-01 foundation + SB-02 minimum (exec / inspect /
// lifecycle / timeout / cancel). Architecture: SandboxService owns the
// mission-ownership policy, SandboxProvider is the minimal internal provider
// port (create/destroy/exists + mission sweep + SB-02 exec/inspect) and
// E2BSandboxProvider is its ONLY concrete implementation, talking to E2B
// Managed through the official E2B SDK (npm package "e2b", imported
// dynamically so the server still boots where the SDK is absent — calls then
// fail closed with SANDBOX_PROVIDER_UNAVAILABLE, never fake data).
// SB-02 stays MINIMAL by design: one controlled execution at a time per
// sandbox (serial per sandbox, no persistent shell), an in-memory execution
// registry so a cancel can reach the in-flight process, a READ-ONLY inspect
// view assembled from the real provider listing and COMPUTED lifecycle states
// (running/paused come from the listing; expired/failed/destroyed are derived
// from the MissionRecord + listing absence — no new persisted states).
// Explicitly OUT OF SCOPE: no scheduler, no queue, no capacity manager, no
// provider router, no second provider, no failover, no BYOC, no multi-region,
// no autoscaling, no filesystem/networking abstractions, no snapshots, no
// templates, no persistence beyond the existing MissionRecord file and no
// mission guardian.
// Secrets: the E2B credential is read from process env only — E2B_API_KEY, the
// SDK's own native channel); it is never written to any file, never logged,
// never stored in a MissionRecord and never echoed in tool output. A missing
// credential fails closed with SANDBOX_CREDENTIAL_MISSING.
// Ownership (the core SB-01 rule, unchanged): a sandboxId alone grants NO
// authority. Every SB-02 operation validates missionId, sandboxId, ownership
// and lifecycle BEFORE any side effect; any mismatch fails with zero
// mutation. Destroy must PROVE the sandbox stopped existing: after kill the
// provider lists the account again and a still-listed sandbox is reported as
// SANDBOX_DESTROY_UNVERIFIED, never as success.
// Timeout/cancel termination rule: the SDK request deadline is NEVER the
// timeout mechanism. The service's own timer actively kills the process
// through the provider (SIGKILL via the SDK command handle); termination is
// proven externally (e.g. a pgrep run in a separate exec), never inferred
// from the timeout alone. Cancelling an execution NEVER destroys the sandbox.
// Provisioning: when E2B_API_KEY is absent, E2B_API_KEY_FILE (the same
// credential-file pattern this server already uses) resolves the same secret
// into process.env.E2B_API_KEY in memory at call time.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";

export class SandboxError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "SandboxError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown failure";
}

// ---- MissionRecord: minimal persistent ownership model (JSON file, atomic writes) ----

export type SandboxMissionStatus = "active" | "destroyed";
export type MissionRecord = {
  missionId: string;
  sandboxId: string;
  provider: string;
  status: SandboxMissionStatus;
  createdAt: string;
  expiresAt: string;
};

export const DEFAULT_MISSION_RECORDS_FILE = "/data/sandbox-missions.json";
export function missionRecordsFilePath(): string {
  return process.env.ENG_MCP_SANDBOX_MISSIONS_FILE ?? DEFAULT_MISSION_RECORDS_FILE;
}

function isMissionRecord(value: unknown): value is MissionRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.missionId === "string" && record.missionId.length > 0
    && typeof record.sandboxId === "string" && record.sandboxId.length > 0
    && typeof record.provider === "string" && record.provider.length > 0
    && (record.status === "active" || record.status === "destroyed")
    && typeof record.createdAt === "string"
    && typeof record.expiresAt === "string";
}

// Local persistence with atomic tmp+rename writes — the same durable-file
// pattern already proven in this repo (release runner state, auth-session
// slots). No new database is introduced; the record survives the process so
// ownership of a mission can be recovered later.
export class MissionRecordStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<MissionRecord[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMissionRecord);
  }

  private async persist(records: MissionRecord[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`);
    await rename(temporary, this.filePath);
  }

  async find(missionId: string): Promise<MissionRecord | undefined> {
    return (await this.load()).find((record) => record.missionId === missionId);
  }

  async upsert(record: MissionRecord): Promise<void> {
    const records = (await this.load()).filter((existing) => existing.missionId !== record.missionId);
    records.push(record);
    await this.persist(records);
  }

  async markDestroyed(missionId: string): Promise<void> {
    const records = await this.load();
    const record = records.find((existing) => existing.missionId === missionId);
    if (!record) throw new SandboxError("MISSION_NOT_REGISTERED", "mission is not registered");
    record.status = "destroyed";
    await this.persist(records);
  }
}

// ---- SandboxProvider: minimal internal provider port ----

export type SandboxProviderCreateInput = { missionId: string; ttlMs: number };
export type SandboxProviderCreateResult = { sandboxId: string; expiresAt: string };
export type SandboxProviderDestroyResult = { verified: boolean; alreadyGone: boolean };

// ---- SB-02 minimal types: exec / inspect / lifecycle ----

export type SandboxInspectState = "running" | "paused";
export type SandboxInspectInfo = {
  sandboxId: string;
  missionId?: string;
  state?: SandboxInspectState;
  startedAt?: string;
  endAt?: string;
};
export type SandboxExecResult = {
  executionId: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
};
export type SandboxExecControl = { pid?: number; kill(): Promise<boolean> };
export type SandboxExecHooks = {
  onRunning?(control: SandboxExecControl): void;
  isCancelled?(): boolean;
};
export type SandboxProviderExecInput = { sandboxId: string; command: string; timeoutMs?: number; executionId: string };

// SB-02 defaults: the per-execution timeout and the extra margin given to the
// SDK request deadline (the SDK deadline is only a safety net — the service's
// own timer fires first and actively kills the process).
export const DEFAULT_EXEC_TIMEOUT_MS = 60_000;
const E2B_EXEC_DEADLINE_MARGIN_MS = 30_000;

export interface SandboxProvider {
  readonly name: string;
  create(input: SandboxProviderCreateInput): Promise<SandboxProviderCreateResult>;
  exists(sandboxId: string): Promise<boolean>;
  destroy(sandboxId: string): Promise<SandboxProviderDestroyResult>;
  listByMission(missionId: string): Promise<string[]>;
  // SB-02 capabilities are OPTIONAL on the port so an SB-01-era provider (and
  // the SB-01 unit fakes) keeps compiling untouched; SandboxService fails
  // closed with SANDBOX_EXEC_UNSUPPORTED / SANDBOX_INSPECT_UNSUPPORTED when
  // the configured provider does not implement them.
  exec?(input: SandboxProviderExecInput, hooks?: SandboxExecHooks): Promise<SandboxExecResult>;
  inspect?(sandboxId: string): Promise<SandboxInspectInfo | null>;
}

// ---- E2BSandboxProvider: the only concrete provider (E2B Managed, official SDK) ----
// Structural views over the dynamically imported official SDK: the narrow
// shapes of exactly what this provider touches. No fields are assumed beyond
// the documented surface (SandboxInfo: sandboxId, metadata, startedAt, endAt,
// state, templateId; getInfo: startedAt/endAt/metadata; Sandbox.list returns
// a paginator on SDK >= 2 and a plain array on older builds — both handled;
// commands.run with background:true returns a CommandHandle with pid/kill/wait).

type E2BSandboxInfo = { sandboxId?: unknown; metadata?: unknown; startedAt?: unknown; endAt?: unknown; state?: unknown; templateId?: unknown };
type E2BCommandResult = { exitCode?: unknown; stdout?: unknown; stderr?: unknown; error?: unknown };
type E2BCommandHandle = {
  pid?: unknown;
  kill(): Promise<boolean>;
  wait(): Promise<E2BCommandResult>;
  stdout?: unknown;
  stderr?: unknown;
};
type E2BCommands = { run(cmd: string, opts?: { background?: boolean; timeoutMs?: number }): Promise<E2BCommandHandle | E2BCommandResult> };
type E2BSandboxHandle = { sandboxId?: unknown; kill(): Promise<void>; getInfo?(): Promise<Record<string, unknown>>; commands?: E2BCommands };
type E2BPaginator = { hasNext: boolean; nextItems(): Promise<E2BSandboxInfo[]> };
type E2BSandboxClass = {
  create(options: { metadata?: Record<string, string>; timeoutMs?: number }): Promise<E2BSandboxHandle>;
  connect(sandboxId: string): Promise<E2BSandboxHandle>;
  list(options?: unknown): unknown;
};
type E2BSdkModule = { Sandbox: E2BSandboxClass };

// Non-literal specifier so TypeScript never tries to resolve the module at
// compile time; at runtime the official SDK loads from the installed modules.
const E2B_SDK_MODULE = "e2b";
const dynamicImport = (specifier: string): Promise<E2BSdkModule> => import(specifier) as Promise<E2BSdkModule>;
const LIST_PAGE_GUARD = 100;

// In-memory-only credential resolution: the env channel (E2B_API_KEY, the
// SDK's native one) wins; otherwise E2B_API_KEY_FILE — the same credential-file
// pattern this server already uses — is read and its trimmed content is copied
// into process.env.E2B_API_KEY in memory at call time. The value is never
// written to any file, never logged, never stored in a MissionRecord and never
// echoed in tool output; any failure to resolve resolves to undefined.
export function resolveE2bApiKey(): string | undefined {
  if (typeof process.env.E2B_API_KEY === "string" && process.env.E2B_API_KEY.length > 0) return process.env.E2B_API_KEY;
  const credentialFile = process.env.E2B_API_KEY_FILE;
  if (typeof credentialFile !== "string" || credentialFile.length === 0) return undefined;
  try {
    const value = readFileSync(credentialFile, "utf8").trim();
    if (value.length === 0) return undefined;
    process.env.E2B_API_KEY = value;
    return value;
  } catch {
    return undefined;
  }
}

// Presence check for real-proof gating: never echoes any value.
export function e2bCredentialAvailable(): boolean {
  if (typeof process.env.E2B_API_KEY === "string" && process.env.E2B_API_KEY.length > 0) return true;
  const credentialFile = process.env.E2B_API_KEY_FILE;
  if (typeof credentialFile !== "string" || credentialFile.length === 0) return false;
  try {
    return readFileSync(credentialFile, "utf8").trim().length > 0;
  } catch {
    return false;
  }
}

export async function loadE2BSdk(): Promise<E2BSdkModule> {
  if (resolveE2bApiKey() === undefined)
    throw new SandboxError("SANDBOX_CREDENTIAL_MISSING", "E2B_API_KEY is not provisioned in the server env (set E2B_API_KEY or E2B_API_KEY_FILE)");
  try {
    return await dynamicImport(E2B_SDK_MODULE);
  } catch {
    throw new SandboxError("SANDBOX_PROVIDER_UNAVAILABLE", "the official E2B SDK is not installed in this runtime");
  }
}

async function listAll(Sandbox: E2BSandboxClass, options?: unknown): Promise<E2BSandboxInfo[]> {
  let page: unknown;
  try {
    page = Sandbox.list(options);
  } catch (error) {
    throw new SandboxError("SANDBOX_LIST_FAILED", `E2B listing failed: ${errorMessage(error)}`);
  }
  if (page !== null && typeof page === "object" && typeof (page as PromiseLike<unknown>).then === "function") page = await page;
  if (Array.isArray(page)) return page as E2BSandboxInfo[];
  const paginator = page as E2BPaginator;
  if (paginator === null || typeof paginator !== "object" || typeof paginator.hasNext !== "boolean" || typeof paginator.nextItems !== "function")
    throw new SandboxError("SANDBOX_LIST_FAILED", "E2B listing returned an unsupported shape");
  const collected: E2BSandboxInfo[] = [];
  let pages = 0;
  while (paginator.hasNext) {
    const items = await paginator.nextItems();
    if (!Array.isArray(items)) throw new SandboxError("SANDBOX_LIST_FAILED", "E2B listing page is not an array");
    collected.push(...(items as E2BSandboxInfo[]));
    if (++pages > LIST_PAGE_GUARD) throw new SandboxError("SANDBOX_LIST_INCOMPLETE", "E2B listing exceeded the bounded page guard; absence cannot be proven");
  }
  return collected;
}

function infoSandboxId(info: E2BSandboxInfo): string | null {
  return typeof info?.sandboxId === "string" && info.sandboxId.length > 0 ? info.sandboxId : null;
}

function isoValue(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export class E2BSandboxProvider implements SandboxProvider {
  readonly name = "e2b";

  // Native provider TTL is applied at creation time (timeoutMs) and the
  // missionId is attached as sandbox metadata (provider-side, server-listable).
  async create({ missionId, ttlMs }: SandboxProviderCreateInput): Promise<SandboxProviderCreateResult> {
    const { Sandbox } = await loadE2BSdk();
    let sandbox: E2BSandboxHandle;
    try {
      sandbox = await Sandbox.create({ metadata: { missionId }, timeoutMs: ttlMs });
    } catch (error) {
      throw new SandboxError("SANDBOX_CREATE_FAILED", `E2B rejected the create: ${errorMessage(error)}`);
    }
    const sandboxId = typeof sandbox?.sandboxId === "string" ? sandbox.sandboxId : "";
    if (sandboxId.length === 0) throw new SandboxError("SANDBOX_CREATE_FAILED", "E2B returned no usable sandboxId");
    return { sandboxId, expiresAt: new Date(Date.now() + ttlMs).toISOString() };
  }

  // "Still exists" is proven against the real account listing (running+paused).
  async exists(sandboxId: string): Promise<boolean> {
    const { Sandbox } = await loadE2BSdk();
    return (await listAll(Sandbox)).some((info) => infoSandboxId(info) === sandboxId);
  }

  async listByMission(missionId: string): Promise<string[]> {
    const { Sandbox } = await loadE2BSdk();
    const infos = await listAll(Sandbox, { query: { metadata: { missionId } } });
    const ids: string[] = [];
    for (const info of infos) {
      const metadata = (info?.metadata ?? null) as Record<string, unknown> | null;
      const sandboxId = infoSandboxId(info);
      if (sandboxId !== null && metadata?.missionId === missionId) ids.push(sandboxId);
    }
    return ids;
  }

  // SB-02 inspect: READ-ONLY view assembled from the real account listing —
  // no connection, no mutation, no secrets (only sandboxId, missionId
  // metadata, state and timestamps). Absent from the listing => null.
  async inspect(sandboxId: string): Promise<SandboxInspectInfo | null> {
    const { Sandbox } = await loadE2BSdk();
    const infos = await listAll(Sandbox);
    const info = infos.find((candidate) => infoSandboxId(candidate) === sandboxId);
    if (!info) return null;
    const metadata = (info?.metadata ?? null) as Record<string, unknown> | null;
    return {
      sandboxId,
      missionId: typeof metadata?.missionId === "string" ? metadata.missionId : undefined,
      state: info.state === "running" || info.state === "paused" ? info.state : undefined,
      startedAt: isoValue(info.startedAt),
      endAt: isoValue(info.endAt)
    };
  }

  // SB-02 exec: one controlled execution. Started in the background so the
  // process pid and kill control are available to the service (cancel), the
  // CALLER's timeout actively kills the process through the provider (the SDK
  // request deadline only bounds the stream and is never the timeout
  // mechanism), and the terminal result is reported honestly — a timeout or a
  // cancel is never disguised as a normal exit.
  async exec(input: SandboxProviderExecInput, hooks?: SandboxExecHooks): Promise<SandboxExecResult> {
    const { Sandbox } = await loadE2BSdk();
    let handle: E2BSandboxHandle;
    try {
      handle = await Sandbox.connect(input.sandboxId);
    } catch (error) {
      throw new SandboxError("SANDBOX_CONNECT_FAILED", `E2B connect failed: ${errorMessage(error)}`);
    }
    const commands = handle.commands;
    if (!commands || typeof commands.run !== "function")
      throw new SandboxError("SANDBOX_PROVIDER_UNAVAILABLE", "the E2B SDK handle exposes no commands API");
    const timeoutMs = input.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
    let bg: E2BCommandHandle;
    try {
      const started = await commands.run(input.command, { background: true, timeoutMs: timeoutMs + E2B_EXEC_DEADLINE_MARGIN_MS });
      if (started === null || typeof started !== "object" || typeof (started as E2BCommandHandle).kill !== "function")
        throw new SandboxError("SANDBOX_EXEC_START_FAILED", "E2B returned no background command handle");
      bg = started as E2BCommandHandle;
    } catch (error) {
      if (error instanceof SandboxError) throw error;
      throw new SandboxError("SANDBOX_EXEC_START_FAILED", `E2B exec start failed: ${errorMessage(error)}`);
    }
    const control: SandboxExecControl = {
      pid: typeof bg.pid === "number" ? bg.pid : undefined,
      kill: async () => {
        try {
          return await bg.kill();
        } catch {
          return false;
        }
      }
    };
    hooks?.onRunning?.(control);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      void control.kill();
    }, timeoutMs);
    try {
      const finish = (exitCode: number | null, stdout: string, stderr: string): SandboxExecResult => {
        if (hooks?.isCancelled?.() === true)
          return { executionId: input.executionId, exitCode, stdout, stderr, timedOut: false, cancelled: true };
        if (timedOut) return { executionId: input.executionId, exitCode, stdout, stderr, timedOut: true, cancelled: false };
        return { executionId: input.executionId, exitCode, stdout, stderr, timedOut: false, cancelled: false };
      };
      // Hard ceiling: even if the envd stream never reports the exit after the
      // kill, the exec call settles (termination is proven externally by the
      // caller, e.g. a pgrep in a separate exec — never inferred here).
      const settled = await Promise.race([
        bg.wait().then(
          (result) => ({ kind: "result" as const, result }),
          (error: unknown) => ({ kind: "error" as const, error })
        ),
        new Promise<{ kind: "ceiling" }>((resolve) => setTimeout(() => resolve({ kind: "ceiling" }), timeoutMs + E2B_EXEC_DEADLINE_MARGIN_MS + 10_000))
      ]);
      if (settled.kind === "ceiling") {
        if (hooks?.isCancelled?.() === true) return finish(null, textValue(bg.stdout), textValue(bg.stderr));
        if (timedOut) return finish(null, textValue(bg.stdout), textValue(bg.stderr));
        throw new SandboxError("SANDBOX_EXEC_FAILED", "E2B exec stream ended without a terminal result");
      }
      if (settled.kind === "error") {
        const shaped = settled.error as { exitCode?: unknown; stdout?: unknown; stderr?: unknown };
        if (typeof shaped?.exitCode === "number")
          return finish(shaped.exitCode, textValue(shaped.stdout), textValue(shaped.stderr));
        if (timedOut) return finish(null, textValue(bg.stdout), textValue(bg.stderr));
        throw new SandboxError("SANDBOX_EXEC_FAILED", `E2B exec failed: ${errorMessage(settled.error)}`);
      }
      const result = settled.result;
      return finish(
        typeof result.exitCode === "number" ? result.exitCode : null,
        textValue(result.stdout),
        textValue(result.stderr)
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // Destroy must be PROVEN: kill, then list the account again; a sandbox still
  // listed after kill is SANDBOX_DESTROY_UNVERIFIED (never success). A sandbox
  // already absent from the listing needs no killing (alreadyGone).
  async destroy(sandboxId: string): Promise<SandboxProviderDestroyResult> {
    const { Sandbox } = await loadE2BSdk();
    if (!(await this.exists(sandboxId))) return { verified: true, alreadyGone: true };
    try {
      const handle = await Sandbox.connect(sandboxId);
      await handle.kill();
    } catch (error) {
      throw new SandboxError("SANDBOX_DESTROY_FAILED", `E2B destroy failed: ${errorMessage(error)}`);
    }
    if (await this.exists(sandboxId))
      throw new SandboxError("SANDBOX_DESTROY_UNVERIFIED", "sandbox is still listed after kill; destruction could not be proven");
    return { verified: true, alreadyGone: false };
  }
}

// ---- SandboxService: ownership policy (sandboxId alone grants NO authority) ----

export type SandboxServiceCreateResult = {
  missionId: string;
  sandboxId: string;
  provider: string;
  status: "active";
  createdAt: string;
  expiresAt: string;
  ttlMs: number;
  ttlApplied: "native";
};
export type SandboxServiceDestroyResult = {
  missionId: string;
  sandboxId: string;
  provider: string;
  status: "destroyed";
  verified: boolean;
  alreadyGone: boolean;
};

// ---- SB-02 service-level types: lifecycle / exec / inspect / cancel ----

// Lifecycle is COMPUTED, never persisted: the MissionRecord keeps only the
// SB-01 statuses ("active" | "destroyed"); running/paused come from the
// provider listing, expired/failed are derived from listing absence plus the
// recorded expiry, destroyed comes from the record itself.
export type SandboxLifecycle = "running" | "paused" | "expired" | "failed" | "destroyed";
export type SandboxExecutionState = "running" | "completed" | "timed_out" | "cancelled" | "failed";
export type SandboxServiceExecResult = SandboxExecResult & { missionId: string; sandboxId: string; pid?: number };
export type SandboxServiceInspectResult = {
  missionId: string;
  sandboxId: string;
  provider: string;
  recordStatus: SandboxMissionStatus;
  lifecycle: SandboxLifecycle;
  exists: boolean;
  state?: SandboxInspectState;
  startedAt?: string;
  endAt?: string;
  createdAt: string;
  expiresAt: string;
};
export type SandboxServiceCancelResult = { executionId: string; missionId: string; sandboxId: string; cancelled: boolean; pid: number | null };
export type SandboxExecutionSummary = { executionId: string; missionId: string; sandboxId: string; command: string; startedAt: string; pid?: number; state: SandboxExecutionState };

// In-memory execution registry — SB-02 keeps NO additional persistence. It
// exists so a cancel can reach the in-flight process; entries are removed
// when the execution settles, so "no entry" is always an honest answer and
// ACTIVE_EXECUTIONS_FOR_MISSION counts only truly in-flight work.
type InFlightExecution = {
  executionId: string;
  missionId: string;
  sandboxId: string;
  command: string;
  startedAt: string;
  pid?: number;
  state: SandboxExecutionState;
  cancelRequested: boolean;
  control: SandboxExecControl | null;
};

export class SandboxService {
  private readonly executions = new Map<string, InFlightExecution>();

  constructor(private readonly provider: SandboxProvider, private readonly records: MissionRecordStore) {}

  async create(missionId: string, ttlMs: number): Promise<SandboxServiceCreateResult> {
    const existing = await this.records.find(missionId);
    if (existing && existing.status === "active")
      throw new SandboxError("MISSION_ALREADY_ACTIVE", "mission already owns an active sandbox");
    const created = await this.provider.create({ missionId, ttlMs });
    const createdAt = new Date().toISOString();
    const record: MissionRecord = {
      missionId,
      sandboxId: created.sandboxId,
      provider: this.provider.name,
      status: "active",
      createdAt,
      expiresAt: created.expiresAt
    };
    try {
      await this.records.upsert(record);
    } catch (error) {
      // Failure containment: no sandbox may stay alive without a registered
      // owner. Best-effort rollback (bounded by the native provider TTL), then
      // an honest failure — never a success without a persisted MissionRecord.
      try {
        await this.provider.destroy(created.sandboxId);
      } catch {
        /* rollback is best-effort; the native TTL bounds the residue */
      }
      throw new SandboxError("MISSION_RECORD_PERSIST_FAILED", `mission record could not be persisted: ${errorMessage(error)}`);
    }
    return {
      missionId,
      sandboxId: created.sandboxId,
      provider: this.provider.name,
      status: "active",
      createdAt,
      expiresAt: created.expiresAt,
      ttlMs,
      ttlApplied: "native"
    };
  }

  async destroy(missionId: string, sandboxId: string): Promise<SandboxServiceDestroyResult> {
    const record = await this.records.find(missionId);
    if (!record)
      throw new SandboxError("MISSION_NOT_REGISTERED", "destroy requires a registered mission; a sandboxId alone grants no authority");
    if (record.sandboxId !== sandboxId)
      throw new SandboxError("MISSION_SANDBOX_MISMATCH", "sandboxId does not match the sandbox registered for this mission; nothing was destroyed");
    if (record.status !== "active")
      throw new SandboxError("MISSION_NOT_ACTIVE", "mission has no active sandbox to destroy");
    const result = await this.provider.destroy(sandboxId);
    if (!result.verified)
      throw new SandboxError("SANDBOX_DESTROY_UNVERIFIED", "destruction could not be proven");
    await this.records.markDestroyed(missionId);
    return {
      missionId,
      sandboxId,
      provider: this.provider.name,
      status: "destroyed",
      verified: true,
      alreadyGone: result.alreadyGone
    };
  }

  // Ownership gate shared by exec and cancel — the same order as destroy.
  private async requireOwnedActive(missionId: string, sandboxId: string, action: string): Promise<MissionRecord> {
    const record = await this.records.find(missionId);
    if (!record)
      throw new SandboxError("MISSION_NOT_REGISTERED", `${action} requires a registered mission; a sandboxId alone grants no authority`);
    if (record.sandboxId !== sandboxId)
      throw new SandboxError("MISSION_SANDBOX_MISMATCH", `sandboxId does not match the sandbox registered for this mission; ${action} denied with zero mutation`);
    if (record.status !== "active")
      throw new SandboxError("MISSION_NOT_ACTIVE", `mission has no active sandbox to ${action} in`);
    return record;
  }

  private lifecycleOf(record: MissionRecord, info: SandboxInspectInfo | null): SandboxLifecycle {
    if (record.status === "destroyed") return "destroyed";
    if (info === null) return Date.now() >= Date.parse(record.expiresAt) ? "expired" : "failed";
    return info.state ?? "running";
  }

  // SB-02 exec: ONE controlled execution — the command runs inside the REAL
  // provider sandbox (never on this host), a timeout actively kills the
  // process through the provider and executions are serial per sandbox.
  async exec(missionId: string, sandboxId: string, command: string, timeoutMs?: number): Promise<SandboxServiceExecResult> {
    const record = await this.requireOwnedActive(missionId, sandboxId, "exec");
    if (typeof this.provider.exec !== "function")
      throw new SandboxError("SANDBOX_EXEC_UNSUPPORTED", "the configured sandbox provider does not support exec");
    if (typeof this.provider.inspect !== "function")
      throw new SandboxError("SANDBOX_INSPECT_UNSUPPORTED", "the configured sandbox provider does not support inspect");
    const info = await this.provider.inspect(sandboxId);
    if (info === null) {
      if (Date.now() >= Date.parse(record.expiresAt))
        throw new SandboxError("SANDBOX_EXPIRED", "the mission sandbox has expired (native provider TTL); nothing was executed");
      throw new SandboxError("SANDBOX_GONE", "the mission sandbox is no longer listed by the provider; nothing was executed");
    }
    for (const entry of this.executions.values())
      if (entry.missionId === missionId && entry.sandboxId === sandboxId && entry.state === "running")
        throw new SandboxError("SANDBOX_EXEC_BUSY", "another execution is still in flight on this sandbox; executions are serial per sandbox");
    const executionId = randomUUID();
    const entry: InFlightExecution = {
      executionId,
      missionId,
      sandboxId,
      command,
      startedAt: new Date().toISOString(),
      state: "running",
      cancelRequested: false,
      control: null
    };
    this.executions.set(executionId, entry);
    try {
      const result = await this.provider.exec({ sandboxId, command, timeoutMs, executionId }, {
        onRunning: (control) => {
          entry.control = control;
          entry.pid = control.pid;
        },
        isCancelled: () => entry.cancelRequested
      });
      entry.state = result.cancelled ? "cancelled" : result.timedOut ? "timed_out" : "completed";
      return { ...result, missionId, sandboxId, pid: entry.pid };
    } catch (error) {
      entry.state = "failed";
      throw error;
    } finally {
      this.executions.delete(executionId);
    }
  }

  // SB-02 inspect: READ-ONLY. Ownership is required; an ACTIVE mission is not
  // — inspect reports the lifecycle (including destroyed/expired/failed) and
  // never becomes an authority or a mutation path.
  async inspect(missionId: string, sandboxId: string): Promise<SandboxServiceInspectResult> {
    const record = await this.records.find(missionId);
    if (!record)
      throw new SandboxError("MISSION_NOT_REGISTERED", "inspect requires a registered mission; a sandboxId alone grants no authority");
    if (record.sandboxId !== sandboxId)
      throw new SandboxError("MISSION_SANDBOX_MISMATCH", "sandboxId does not match the sandbox registered for this mission; inspect denied");
    if (typeof this.provider.inspect !== "function")
      throw new SandboxError("SANDBOX_INSPECT_UNSUPPORTED", "the configured sandbox provider does not support inspect");
    const info = await this.provider.inspect(sandboxId);
    return {
      missionId,
      sandboxId,
      provider: record.provider,
      recordStatus: record.status,
      lifecycle: this.lifecycleOf(record, info),
      exists: info !== null,
      state: info?.state,
      startedAt: info?.startedAt,
      endAt: info?.endAt,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt
    };
  }

  // SB-02 cancel: kill ONE in-flight execution of THIS mission's sandbox.
  // The binding (registered mission + matching sandboxId + in-flight
  // execution of that same pair) is checked BEFORE any kill, so a cross-mission
  // cancel is denied with zero mutation. Cancelling an execution NEVER
  // destroys the sandbox.
  async cancel(missionId: string, sandboxId: string): Promise<SandboxServiceCancelResult> {
    await this.requireOwnedActive(missionId, sandboxId, "cancel");
    let entry: InFlightExecution | undefined;
    for (const candidate of this.executions.values())
      if (candidate.missionId === missionId && candidate.sandboxId === sandboxId && candidate.state === "running") {
        entry = candidate;
        break;
      }
    if (!entry)
      throw new SandboxError("EXECUTION_NOT_FOUND", "no in-flight execution is registered for this mission+sandbox pair");
    if (!entry.control)
      throw new SandboxError("EXECUTION_NOT_STARTED", "the execution has not reached the provider yet; nothing to cancel");
    entry.cancelRequested = true;
    const killed = await entry.control.kill();
    if (!killed)
      throw new SandboxError("EXECUTION_CANCEL_FAILED", "the provider reported the process was already gone; cancellation could not be applied");
    return { executionId: entry.executionId, missionId, sandboxId, cancelled: true, pid: entry.pid ?? null };
  }

  // Read-only view of the in-flight executions of one mission (used by tests
  // and by the stop-condition accounting; never an authority).
  activeExecutions(missionId: string): SandboxExecutionSummary[] {
    const summaries: SandboxExecutionSummary[] = [];
    for (const entry of this.executions.values())
      if (entry.missionId === missionId)
        summaries.push({
          executionId: entry.executionId,
          missionId: entry.missionId,
          sandboxId: entry.sandboxId,
          command: entry.command,
          startedAt: entry.startedAt,
          pid: entry.pid,
          state: entry.state
        });
    return summaries;
  }
}

// ---- strict structured schemas for the SB-01 + SB-02 tools ----

export const DEFAULT_TTL_MS = 300_000;
const MISSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const missionIdSchema = z.string().regex(MISSION_ID_PATTERN, "missionId must be 8-128 characters of letters, digits, '.', '_' ':' '-' starting with a letter or digit");

export const sandboxCreateInputSchema = z.object({
  missionId: missionIdSchema,
  ttlMs: z.number().int().min(60_000).max(86_400_000).optional()
}).strict();
export const sandboxDestroyInputSchema = z.object({
  missionId: missionIdSchema,
  sandboxId: z.string().min(8).max(200)
}).strict();
export const sandboxExecInputSchema = z.object({
  missionId: missionIdSchema,
  sandboxId: z.string().min(8).max(200),
  command: z.string().min(1).max(2000),
  timeoutMs: z.number().int().min(1_000).max(600_000).optional()
}).strict();
export const sandboxInspectInputSchema = z.object({
  missionId: missionIdSchema,
  sandboxId: z.string().min(8).max(200)
}).strict();
export const sandboxCancelInputSchema = z.object({
  missionId: missionIdSchema,
  sandboxId: z.string().min(8).max(200)
}).strict();
export type SandboxCreateInput = z.infer<typeof sandboxCreateInputSchema>;
export type SandboxDestroyInput = z.infer<typeof sandboxDestroyInputSchema>;
export type SandboxExecInput = z.infer<typeof sandboxExecInputSchema>;
export type SandboxInspectInput = z.infer<typeof sandboxInspectInputSchema>;
export type SandboxCancelInput = z.infer<typeof sandboxCancelInputSchema>;

let sharedService: SandboxService | null = null;
export function defaultSandboxService(): SandboxService {
  if (!sharedService) sharedService = new SandboxService(new E2BSandboxProvider(), new MissionRecordStore(missionRecordsFilePath()));
  return sharedService;
}

export async function runSandboxCreate(input: SandboxCreateInput, deps: { service?: SandboxService } = {}): Promise<SandboxServiceCreateResult> {
  const service = deps.service ?? defaultSandboxService();
  return service.create(input.missionId, input.ttlMs ?? DEFAULT_TTL_MS);
}

export async function runSandboxDestroy(input: SandboxDestroyInput, deps: { service?: SandboxService } = {}): Promise<SandboxServiceDestroyResult> {
  const service = deps.service ?? defaultSandboxService();
  return service.destroy(input.missionId, input.sandboxId);
}

const EXEC_OUTPUT_CAP = 65_536;
function capText(value: string): { output: string; truncated: boolean } {
  return value.length > EXEC_OUTPUT_CAP ? { output: value.slice(0, EXEC_OUTPUT_CAP), truncated: true } : { output: value, truncated: false };
}

export async function runSandboxExec(input: SandboxExecInput, deps: { service?: SandboxService } = {}): Promise<SandboxServiceExecResult & { stdoutTruncated: boolean; stderrTruncated: boolean }> {
  const service = deps.service ?? defaultSandboxService();
  const result = await service.exec(input.missionId, input.sandboxId, input.command, input.timeoutMs);
  const stdout = capText(result.stdout);
  const stderr = capText(result.stderr);
  return { ...result, stdout: stdout.output, stderr: stderr.output, stdoutTruncated: stdout.truncated, stderrTruncated: stderr.truncated };
}

export async function runSandboxInspect(input: SandboxInspectInput, deps: { service?: SandboxService } = {}): Promise<SandboxServiceInspectResult> {
  const service = deps.service ?? defaultSandboxService();
  return service.inspect(input.missionId, input.sandboxId);
}

export async function runSandboxCancel(input: SandboxCancelInput, deps: { service?: SandboxService } = {}): Promise<SandboxServiceCancelResult> {
  const service = deps.service ?? defaultSandboxService();
  return service.cancel(input.missionId, input.sandboxId);
}
