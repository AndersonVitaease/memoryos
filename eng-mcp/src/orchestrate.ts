// ORCHESTRATOR-F1-01: engineering.orchestrate.plan + engineering.orchestrate.enqueue
// Deterministic pre-flight planner (ZERO-LLM, design-orchestrator-01 §3/§4, F1 scope):
// composes system probes (load, mem, disk, failed units), mission state, the daily
// budget and per-type agent capacity into ONE GO/THROTTLE/BLOCK verdict in a single
// call. No dispatch, no cgroups (v2), no tool catalog (v3) — those are future phases.
// Every probe is fail-open (missing evidence → null, never invented); the only
// honest downgrade is THROTTLE when the mission state dir cannot be read at all
// (dispatching blind while unable to see in-flight missions would be optimistic).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, appendFileSync } from "node:fs";
import * as z from "zod/v4";

export const DEFAULT_PATHS = {
  loadavg: "/proc/loadavg",
  meminfo: "/proc/meminfo",
  missionStateDir: "/root/.hermes/mission-state",
  budgetPath: "/opt/mission-events/orchestrator-budget.json",
  agentsPath: "/opt/mission-events/agents.json",
  queuePath: "/opt/mission-events/orchestrator-queue.jsonl",
} as const;

export type OrchestrateVerdict = "GO" | "THROTTLE" | "BLOCK";

export interface OrchestrateDeps {
  /** Read a UTF-8 text file; null when missing/unreadable (fail-open). */
  readText?(path: string): string | null;
  /** Run a probe command; stdout string or null on failure/timeout. */
  exec?(command: string, args: string[]): string | null;
  now?(): number;
  loadavgPath?: string;
  meminfoPath?: string;
  missionStateDir?: string;
  budgetPath?: string;
  agentsPath?: string;
  queuePath?: string;
}

export const orchestratePlanInputSchema = z.object({ type: z.string().min(1).max(64).optional() }).strict();
export const orchestrateEnqueueInputSchema = z.object({
  type: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()),
  priority: z.number().int().min(1).max(9).optional(),
}).strict();

// Terminal = missão encerrada (não ocupa slot, não conta como ativa). "interrupted"
// = pane morto sem escada de recover rodada — o proxy determinístico de "travada
// sem recover" da tabela §3.
const TERMINAL_STATUSES = new Set(["closed", "delivered", "cancelled", "failed"]);
const IN_FLIGHT_STATUSES = new Set(["dispatched", "working", "recover"]);

export interface MissionSnapshot {
  active: number;
  byStatus: Record<string, number>;
  recoverInFlight: number;
  stuckNoRecover: number;
  readable: boolean;
}

export interface CapacitySlot {
  type: string;
  running: number;
  max: number;
  canDispatch: boolean;
  reason: string;
}

export interface OrchestratePlanResult {
  system: {
    load1m: number | null;
    memAvailableGb: number | null;
    diskFreeGb: number | null;
    failedUnits: number | null;
  };
  missions: MissionSnapshot;
  budget: { usedTodayUsd: number; ceilingUsd: number; usedPct: number } | null;
  capacity: CapacitySlot;
  verdict: OrchestrateVerdict;
  blockReasons: string[];
  throttleReasons: string[];
  degraded: boolean;
}

function defaultReadText(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function defaultExec(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, { encoding: "utf8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function resolveDeps(deps?: OrchestrateDeps): Required<Pick<OrchestrateDeps, "readText" | "exec" | "now">> & OrchestrateDeps {
  return {
    readText: deps?.readText ?? defaultReadText,
    exec: deps?.exec ?? defaultExec,
    now: deps?.now ?? (() => Date.now()),
    loadavgPath: deps?.loadavgPath ?? DEFAULT_PATHS.loadavg,
    meminfoPath: deps?.meminfoPath ?? DEFAULT_PATHS.meminfo,
    missionStateDir: deps?.missionStateDir ?? DEFAULT_PATHS.missionStateDir,
    budgetPath: deps?.budgetPath ?? DEFAULT_PATHS.budgetPath,
    agentsPath: deps?.agentsPath ?? DEFAULT_PATHS.agentsPath,
    queuePath: deps?.queuePath ?? DEFAULT_PATHS.queuePath,
  };
}

function readMissions(d: ReturnType<typeof resolveDeps>): MissionSnapshot {
  const snapshot: MissionSnapshot = { active: 0, byStatus: {}, recoverInFlight: 0, stuckNoRecover: 0, readable: false };
  let files: string[];
  try {
    files = readdirSync(d.missionStateDir!);
  } catch {
    return snapshot; // unreadable → readable=false (honest: caller must not dispatch blind)
  }
  snapshot.readable = true;
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = d.readText!(`${d.missionStateDir}/${file}`);
      if (raw == null) continue;
      const parsed = JSON.parse(raw) as { status?: unknown };
      const status = typeof parsed.status === "string" ? parsed.status : "unknown";
      snapshot.byStatus[status] = (snapshot.byStatus[status] ?? 0) + 1;
      if (!TERMINAL_STATUSES.has(status)) snapshot.active += 1;
      if (status === "recover") snapshot.recoverInFlight += 1;
      if (status === "interrupted") snapshot.stuckNoRecover += 1;
    } catch {
      // malformed state file: skip, never fail the whole plan
    }
  }
  return snapshot;
}

function readBudget(d: ReturnType<typeof resolveDeps>): OrchestratePlanResult["budget"] {
  const raw = d.readText!(d.budgetPath!);
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw) as { used_today_usd?: unknown; ceiling_usd?: unknown };
    const used = typeof parsed.used_today_usd === "number" ? parsed.used_today_usd : null;
    const ceiling = typeof parsed.ceiling_usd === "number" ? parsed.ceiling_usd : null;
    if (used == null || ceiling == null || ceiling <= 0) return null;
    return { usedTodayUsd: used, ceilingUsd: ceiling, usedPct: (used / ceiling) * 100 };
  } catch {
    return null;
  }
}

function readMaxParallel(d: ReturnType<typeof resolveDeps>, type: string): number | null {
  const raw = d.readText!(d.agentsPath!);
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw) as Array<{ type?: unknown; max_parallel?: unknown }>;
    if (!Array.isArray(parsed)) return null;
    const entry = parsed.find((e) => e && e.type === type);
    if (!entry || typeof entry.max_parallel !== "number" || entry.max_parallel <= 0) return null;
    return entry.max_parallel;
  } catch {
    return null;
  }
}

function readLoad(d: ReturnType<typeof resolveDeps>): number | null {
  const raw = d.readText!(d.loadavgPath!);
  if (raw == null) return null;
  const first = raw.trim().split(/\s+/)[0];
  const load = Number(first);
  return Number.isFinite(load) ? load : null;
}

function readMemAvailableGb(d: ReturnType<typeof resolveDeps>): number | null {
  const raw = d.readText!(d.meminfoPath!);
  if (raw == null) return null;
  const line = raw.split("\n").find((l) => l.startsWith("MemAvailable:"));
  if (!line) return null;
  const kb = Number(line.trim().split(/\s+/)[1]);
  return Number.isFinite(kb) ? kb / (1024 * 1024) : null;
}

function readDiskFreeGb(d: ReturnType<typeof resolveDeps>): number | null {
  // POSIX df -kP / → line 2 field 4 = Available (KiB). Fail-open → null.
  const out = d.exec!("df", ["-kP", "/"]);
  if (out == null) return null;
  const line = out.trim().split("\n").find((l) => l.includes("/"));
  if (!line) return null;
  const fields = line.trim().split(/\s+/);
  const kb = Number(fields[3]);
  return Number.isFinite(kb) ? kb / (1024 * 1024) : null;
}

function readFailedUnits(d: ReturnType<typeof resolveDeps>): number | null {
  const out = d.exec!("systemctl", ["--failed", "--no-legend"]);
  if (out == null) return null;
  return out.trim().length === 0 ? 0 : out.trim().split("\n").length;
}

/**
 * One-call pre-flight: estado + posso despachar? Determinístico, zero-LLM.
 * Tabela §3 (BLOCK precede THROTTLE precede GO):
 *   BLOCK: orçamento >90% · failed_units > 0 · ≥2 missões travadas sem recover
 *   THROTTLE: orçamento 70–90% · load > 4 · sem slot livre · 1 recover em curso
 * Budget ausente/ilegível = sinal ausente (fail-open); mission-state ilegível =
 * THROTTLE honesto (não despachar às cegas).
 */
export function runOrchestratePlan(input: { type?: string }, deps?: OrchestrateDeps): OrchestratePlanResult {
  const d = resolveDeps(deps);
  const type = input.type ?? "mission";
  const blockReasons: string[] = [];
  const throttleReasons: string[] = [];

  const load = readLoad(d);
  const memAvailableGb = readMemAvailableGb(d);
  const diskFreeGb = readDiskFreeGb(d);
  const failedUnits = readFailedUnits(d);
  const missions = readMissions(d);
  const budget = readBudget(d);
  const maxParallel = readMaxParallel(d, type);
  const running = missions.active; // in-flight (dispatched/working/recover) consomem slot

  const degraded = [load, memAvailableGb, diskFreeGb, failedUnits].every((v) => v == null) && !missions.readable;

  if (budget != null && budget.usedPct > 90) blockReasons.push(`budget ${budget.usedPct.toFixed(0)}% consumido (teto ${budget.ceilingUsd} US$)`);
  if (failedUnits != null && failedUnits > 0) blockReasons.push(`systemd com ${failedUnits} unidade(s) failed`);
  if (missions.stuckNoRecover >= 2) blockReasons.push(`${missions.stuckNoRecover} missões travadas (interrupted) sem recover`);

  if (budget != null && budget.usedPct >= 70 && budget.usedPct <= 90) throttleReasons.push(`budget ${budget.usedPct.toFixed(0)}% consumido`);
  if (load != null && load > 4) throttleReasons.push(`load ${load.toFixed(2)} > 4`);
  if (maxParallel != null && running >= maxParallel) throttleReasons.push(`slots de "${type}" esgotados (${running}/${maxParallel} em voo)`);
  if (missions.recoverInFlight >= 1) throttleReasons.push(`${missions.recoverInFlight} recover em curso`);
  if (!missions.readable) throttleReasons.push(`mission-state ilegível em ${d.missionStateDir} — fail-open conservador`);

  const verdict: OrchestrateVerdict = blockReasons.length > 0 ? "BLOCK" : throttleReasons.length > 0 ? "THROTTLE" : "GO";
  const canDispatch = verdict === "GO";
  const reason = canDispatch
    ? `slot livre (${running}/${maxParallel ?? "?"}) + sistema ok + orçamento ok`
    : [...blockReasons, ...throttleReasons].join("; ");

  return {
    system: { load1m: load, memAvailableGb, diskFreeGb, failedUnits },
    missions,
    budget,
    capacity: { type, running, max: maxParallel ?? 0, canDispatch, reason },
    verdict,
    blockReasons,
    throttleReasons,
    degraded,
  };
}

// ---- engineering.orchestrate.enqueue (F1: grava + lista; promoção é do cron futuro) ----

export interface QueueEntry {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: number;
  enqueuedAt: string;
}

function parseQueue(raw: string | null): QueueEntry[] {
  if (raw == null) return [];
  const entries: QueueEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed = JSON.parse(trimmed) as QueueEntry;
      if (parsed && typeof parsed.id === "string" && typeof parsed.type === "string") entries.push(parsed);
    } catch {
      // malformed line: skip, never fail the listing
    }
  }
  return entries;
}

export function orchestrateList(deps?: OrchestrateDeps): { count: number; entries: QueueEntry[] } {
  const d = resolveDeps(deps);
  const raw = d.readText!(d.queuePath!);
  const entries = parseQueue(raw);
  return { count: entries.length, entries };
}

/**
 * Append-only em orchestrator-queue.jsonl com dedupe (regra anti-thrash §4:
 * reentrância proibida — mesma {type,payload} nunca duas na fila). F1 não consome:
 * promoção/consumo é do cron externo futuro.
 */
export function runOrchestrateEnqueue(
  input: { type: string; payload: Record<string, unknown>; priority?: number },
  deps?: OrchestrateDeps,
): { id: string; enqueued: boolean; duplicate: boolean; queueCount: number } {
  const d = resolveDeps(deps);
  const entries = parseQueue(d.readText!(d.queuePath!));
  const payloadKey = JSON.stringify(input.payload);
  const existing = entries.find((e) => e.type === input.type && JSON.stringify(e.payload) === payloadKey);
  if (existing) return { id: existing.id, enqueued: false, duplicate: true, queueCount: entries.length };

  const id = `orch-${d.now!()}-${Math.random().toString(16).slice(2, 6)}`;
  const entry: QueueEntry = {
    id,
    type: input.type,
    payload: input.payload,
    priority: input.priority ?? 5,
    enqueuedAt: new Date(d.now!()).toISOString(),
  };
  try {
    mkdirSync(d.queuePath!.replace(/\/[^/]+$/, ""), { recursive: true });
    appendFileSync(d.queuePath!, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    throw new Error(`ORCHESTRATE_ENQUEUE_WRITE_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { id, enqueued: true, duplicate: false, queueCount: entries.length + 1 };
}