// ORCHESTRATOR-F1-01: engineering.orchestrate.plan + engineering.orchestrate.enqueue
// Deterministic pre-flight planner (ZERO-LLM, design-orchestrator-01 §3/§4, F1 scope):
// composes system probes (load, mem, disk, failed units), mission state, the daily
// budget and per-type agent capacity into ONE GO/THROTTLE/BLOCK verdict in a single
// call. No dispatch, no cgroups (v2), no tool catalog (v3) — those are future phases.
// Every probe is fail-open (missing evidence → null, never invented); the only
// honest downgrade is THROTTLE when the mission state dir cannot be read at all
// (dispatching blind while unable to see in-flight missions would be optimistic).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, appendFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import * as z from "zod/v4";

export const DEFAULT_PATHS = {
  loadavg: "/proc/loadavg",
  meminfo: "/proc/meminfo",
  missionStateDir: "/root/.hermes/mission-state",
  budgetPath: "/opt/mission-events/orchestrator-budget.json",
  agentsPath: "/opt/mission-events/agents.json",
  queuePath: "/opt/mission-events/orchestrator-queue.jsonl",
  consumerStatePath: "/opt/mission-events/orchestrator-consumer.state.json",
  consumerLockPath: "/opt/mission-events/orchestrator-consumer.lock",
  spoolPath: "/opt/mission-events/spool.jsonl",
  missionOpsDir: "/root/.hermes/plugins/mission-ops",
  priceTablePath: "/opt/mission-events/orchestrator-price-table.json",
  claudeConfigDir: "/opt/memoryos/eng-mcp/.claude-config/projects",
} as const;

export type OrchestrateVerdict = "GO" | "THROTTLE" | "BLOCK";

export interface OrchestrateDeps {
  /** Read a UTF-8 text file; null when missing/unreadable (fail-open). */
  readText?(path: string): string | null;
  /** List directory entries; empty array when missing/unreadable (fail-open). */
  readdir?(path: string): string[] | null;
  /** Run a probe command; stdout string or null on failure/timeout. */
  exec?(command: string, args: string[]): string | null;
  now?(): number;
  /** HERMÉTICO-FIX-01: I/O opcional do lock (injetável nos testes; fs real como fallback). */
  existsSync?(path: string): boolean;
  writeText?(path: string, data: string): void;
  appendFile?(path: string, data: string): void;
  unlink?(path: string): void;
  loadavgPath?: string;
  meminfoPath?: string;
  missionStateDir?: string;
  budgetPath?: string;
  agentsPath?: string;
  queuePath?: string;
  consumerStatePath?: string;
  consumerLockPath?: string;
  spoolPath?: string;
  missionOpsDir?: string;
  priceTablePath?: string;
  claudeConfigDir?: string;
  /** Dispatch a mission via the mission-ops handler. Returns {ok, error?}. */
  dispatchMission?(input: { missionId: string; promptFile: string; worktree?: string; priority?: number }): Promise<{ ok: boolean; error?: string }>;
}

export const orchestratePlanInputSchema = z.object({ type: z.string().min(1).max(64).optional() }).strict();
export const orchestrateEnqueueInputSchema = z.object({
  type: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()),
  priority: z.number().int().min(1).max(9).optional(),
}).strict();

// ---- ORCHESTRATOR QUEUE CONSUMER (ORCH-QUEUE-CONSUMER-01) ----

export interface OrchestratorConsumerState {
  status: "alive" | "stopped";
  lastPromotion: string | null;
  lastPromotionId: string | null;
  promotedCount: number;
  skippedCount: number;
  blockedCount: number;
  requeuedCount: number;
  deadLetteredCount: number;
  updatedAt: string | null;
}

export interface ConsumeEntryResult {
  entryId: string;
  action: "promoted" | "skipped" | "blocked" | "throttled" | "operator_required" | "dead_letter";
  reason: string;
  missionId?: string;
}

export interface ConsumeResult {
  consumed: number;
  promoted: number;
  skipped: number;
  blocked: number;
  throttled: number;
  operatorRequired: number;
  deadLettered: number;
  requeued: number;
  results: ConsumeEntryResult[];
}

export const orchestrateConsumeInputSchema = z.object({
  dryRun: z.boolean().optional(),
  maxPromotions: z.number().int().min(1).max(10).optional(),
}).strict();

const CONSUMER_LOCK_TTL_MS = 30_000;

function parseFrontmatterClass(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^---\s*\n[\s\S]*?class:\s*(\S+)\s*\n[\s\S]*?^---/m);
  return m ? m[1] : null;
}

function acquireLock(d: OrchestrateDeps): boolean {
  const lockPath = d.consumerLockPath!;
  const now = d.now!();
  // HERMÉTICO-FIX-01: o lock deve respeitar os deps injetados (testes fake) com
  // fallback para o fs real quando os deps não cobrem a operação. Fs real puro
  // quebra o gate hermético (writeFileSync em dir inexistente → "lock held").
  try {
    if (d.existsSync ? d.existsSync(lockPath) : existsSync(lockPath)) {
      const raw = d.readText ? d.readText(lockPath) : readFileSync(lockPath, "utf8");
      const lock = JSON.parse(raw ?? "{}");
      if (now - lock.acquiredAt < CONSUMER_LOCK_TTL_MS) return false;
    }
    const payload = JSON.stringify({ acquiredAt: now, pid: process.pid });
    if (d.writeText) {
      d.writeText(lockPath, payload);
      return true;
    }
    writeFileSync(lockPath, payload, "utf8");
    return true;
  } catch {
    return false;
  }
}

function releaseLock(d: OrchestrateDeps): void {
  try {
    if (d.unlink) d.unlink(d.consumerLockPath!);
    else unlinkSync(d.consumerLockPath!);
  } catch { /* ignore */ }
}

function readConsumerState(d: OrchestrateDeps): OrchestratorConsumerState {
  const raw = d.readText!(d.consumerStatePath!);
  if (raw == null) return { status: "stopped", lastPromotion: null, lastPromotionId: null, promotedCount: 0, skippedCount: 0, blockedCount: 0, requeuedCount: 0, deadLetteredCount: 0, updatedAt: null };
  try {
    const parsed = JSON.parse(raw) as OrchestratorConsumerState;
    if (parsed && typeof parsed.status === "string") return parsed;
  } catch { /* ignore */ }
  return { status: "stopped", lastPromotion: null, lastPromotionId: null, promotedCount: 0, skippedCount: 0, blockedCount: 0, requeuedCount: 0, deadLetteredCount: 0, updatedAt: null };
}

function writeConsumerState(d: OrchestrateDeps, state: OrchestratorConsumerState): void {
  try { writeFileSync(d.consumerStatePath!, JSON.stringify(state, null, 2), "utf8"); } catch { /* fail-open */ }
}

function spoolEvent(d: OrchestrateDeps, kind: string, missionId: string, msg: string): void {
  const line = JSON.stringify({ ts: new Date(d.now!()).toISOString(), event: kind, missionId, msg: msg.slice(0, 200), source: "orchestrator-consumer" });
  try { appendFileSync(d.spoolPath!, line + "\n", "utf8"); } catch { /* fail-open */ }
}

/**
 * Consume the orchestrator queue deterministically (zero-LLM).
 * Applies promotion rules, dispatches missions, handles failures with backoff.
 */
export async function runOrchestrateConsume(
  input: { dryRun?: boolean; maxPromotions?: number },
  deps?: OrchestrateDeps,
): Promise<ConsumeResult> {
  const d = resolveDeps(deps);
  const maxPromotions = input.maxPromotions ?? 5;
  const dryRun = input.dryRun ?? false;

  const raw = d.readText!(d.queuePath!);
  const entries: QueueEntry[] = [];
  if (raw != null) {
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        const parsed = JSON.parse(trimmed) as QueueEntry;
        if (parsed && typeof parsed.id === "string" && typeof parsed.type === "string") entries.push(parsed);
      } catch { /* malformed line: skip */ }
    }
  }

  entries.sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5) || a.enqueuedAt.localeCompare(b.enqueuedAt));

  const result: ConsumeResult = { consumed: entries.length, promoted: 0, skipped: 0, blocked: 0, throttled: 0, operatorRequired: 0, deadLettered: 0, requeued: 0, results: [] };
  let promotedCount = 0;

  if (!acquireLock(d)) {
    return { ...result, results: [{ entryId: "lock", action: "skipped", reason: "promotion lock held by another cycle" }] };
  }

  try {
    for (const entry of entries) {
      if (promotedCount >= maxPromotions) break;

      const payload = entry.payload ?? {};
      const missionId = (payload.missionId ?? entry.id) as string;
      const promptFile = (payload.prompt ?? payload.promptFile) as string | undefined;
      const worktree = payload.worktree as string | undefined;
      const priority = entry.priority ?? 5;

      // Rule: intent with promptFile inexistent → skip with orch_skip
      if (!promptFile || !existsSync(promptFile)) {
        spoolEvent(d, "orch_skip", missionId, `promptFile inexistente: ${promptFile ?? "(nenhum)"}`);
        result.results.push({ entryId: entry.id, action: "skipped", reason: "promptFile inexistente", missionId });
        result.skipped += 1;
        continue;
      }

      // Rule: heavy class (frontmatter) → never promote without operator
      try {
        const promptRaw = readFileSync(promptFile, "utf8");
        const frontmatterClass = parseFrontmatterClass(promptRaw);
        if (frontmatterClass === "pesada") {
          spoolEvent(d, "orch_operator_required", missionId, "missão class=pesada exige operador");
          result.results.push({ entryId: entry.id, action: "operator_required", reason: "class=pesada requer operador", missionId });
          result.operatorRequired += 1;
          continue;
        }
      } catch { /* promptFile unreadable — already checked exists */ }

      // Rule: pre-flight orchestrate.plan = GO required
      const plan = runOrchestratePlan({ type: "mission" }, d);

      if (plan.verdict === "BLOCK") {
        spoolEvent(d, "orch_blocked", missionId, `plan BLOCK: ${plan.blockReasons.join("; ")}`);
        result.results.push({ entryId: entry.id, action: "blocked", reason: "plan BLOCK", missionId });
        result.blocked += 1;
        break;
      }

      if (plan.verdict === "THROTTLE") {
        spoolEvent(d, "orch_throttled", missionId, `plan THROTTLE: ${plan.throttleReasons.join("; ")}`);
        result.results.push({ entryId: entry.id, action: "throttled", reason: "plan THROTTLE", missionId });
        result.throttled += 1;
        continue;
      }

      // GO → dispatch
      if (dryRun) {
        spoolEvent(d, "orch_promoted", missionId, `dry-run: despacho simulado (GO)`);
        result.results.push({ entryId: entry.id, action: "promoted", reason: "plan GO (dry run)", missionId });
        result.promoted += 1;
        promotedCount += 1;
        continue;
      }

      // Real dispatch via mission-ops handler
      const dispatchFn = d.dispatchMission;
      if (dispatchFn) {
        try {
          const dispatchResult = await dispatchFn({ missionId, promptFile, worktree, priority });
          if (dispatchResult.ok) {
            spoolEvent(d, "orch_promoted", missionId, `despachado via handle_mission_dispatch`);
            result.results.push({ entryId: entry.id, action: "promoted", reason: "plan GO", missionId });
            result.promoted += 1;
            promotedCount += 1;
          } else {
            await handleDispatchFailure(d, entry, missionId, promptFile, worktree, priority, dispatchResult.error ?? "unknown", result);
          }
        } catch (err) {
          await handleDispatchFailure(d, entry, missionId, promptFile, worktree, priority, String(err), result);
        }
      } else {
        // No dispatch handler configured — simulate success for testing
        spoolEvent(d, "orch_promoted", missionId, `dispatch handler not configured`);
        result.results.push({ entryId: entry.id, action: "promoted", reason: "plan GO (no dispatch handler)", missionId });
        result.promoted += 1;
        promotedCount += 1;
      }
    }
  } finally {
    releaseLock(d);
  }

  // Update consumer state
  const state = readConsumerState(d);
  state.status = "alive";
  state.updatedAt = new Date(d.now!()).toISOString();
  state.promotedCount += result.promoted;
  state.skippedCount += result.skipped;
  state.blockedCount += result.blocked;
  state.requeuedCount += result.requeued;
  state.deadLetteredCount += result.deadLettered;
  if (result.results.length > 0) {
    const last = result.results[result.results.length - 1];
    state.lastPromotion = state.updatedAt;
    state.lastPromotionId = last.entryId;
  }
  writeConsumerState(d, state);

  return result;
}

async function handleDispatchFailure(
  d: OrchestrateDeps,
  entry: QueueEntry,
  missionId: string,
  promptFile: string,
  worktree: string | undefined,
  priority: number,
  error: string,
  result: ConsumeResult,
): Promise<void> {
  const payload = entry.payload ?? {};
  const attemptCount = ((payload._attemptCount as number | undefined) ?? 0) + 1;

  if (attemptCount >= 3) {
    spoolEvent(d, "orch_dead_letter", missionId, `3 tentativas falhas: ${error.slice(0, 200)}`);
    result.results.push({ entryId: entry.id, action: "dead_letter", reason: error.slice(0, 200), missionId });
    result.deadLettered += 1;
  } else {
    const updatedPayload = { ...payload, _attemptCount: attemptCount };
    const updatedEntry = { ...entry, payload: updatedPayload };
    try { appendFileSync(d.queuePath!, `${JSON.stringify(updatedEntry)}\n`, "utf8"); } catch { /* fail-open */ }
    const backoff = Math.pow(2, attemptCount);
    spoolEvent(d, "orch_requeue", missionId, `re-enfileirado (tentativa ${attemptCount}, backoff ${backoff}s): ${error.slice(0, 200)}`);
    result.results.push({ entryId: entry.id, action: "dead_letter", reason: `requeued attempt ${attemptCount}`, missionId });
    result.requeued += 1;
  }
}

// Update orchestrateList to include spend aggregates per mission + consumer state
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

function resolveDeps(deps?: OrchestrateDeps): Required<Pick<OrchestrateDeps, "readText" | "readdir" | "exec" | "now">> & OrchestrateDeps {
  return {
    readText: deps?.readText ?? defaultReadText,
    readdir: deps?.readdir ?? defaultReaddir,
    exec: deps?.exec ?? defaultExec,
    now: deps?.now ?? (() => Date.now()),
    // HERMÉTICO-FIX-01: passthrough do I/O opcional do lock (injetável nos testes).
    existsSync: deps?.existsSync,
    writeText: deps?.writeText,
    appendFile: deps?.appendFile,
    unlink: deps?.unlink,
    loadavgPath: deps?.loadavgPath ?? DEFAULT_PATHS.loadavg,
    meminfoPath: deps?.meminfoPath ?? DEFAULT_PATHS.meminfo,
    missionStateDir: deps?.missionStateDir ?? DEFAULT_PATHS.missionStateDir,
    budgetPath: deps?.budgetPath ?? DEFAULT_PATHS.budgetPath,
    agentsPath: deps?.agentsPath ?? DEFAULT_PATHS.agentsPath,
    queuePath: deps?.queuePath ?? DEFAULT_PATHS.queuePath,
    consumerStatePath: deps?.consumerStatePath ?? DEFAULT_PATHS.consumerStatePath,
    consumerLockPath: deps?.consumerLockPath ?? DEFAULT_PATHS.consumerLockPath,
    spoolPath: deps?.spoolPath ?? DEFAULT_PATHS.spoolPath,
    missionOpsDir: deps?.missionOpsDir ?? DEFAULT_PATHS.missionOpsDir,
    priceTablePath: deps?.priceTablePath ?? DEFAULT_PATHS.priceTablePath,
    claudeConfigDir: deps?.claudeConfigDir ?? DEFAULT_PATHS.claudeConfigDir,
  };
}

function defaultReaddir(path: string): string[] | null {
  try { return readdirSync(path); } catch { return null; }
}

function readMissions(d: ReturnType<typeof resolveDeps>): MissionSnapshot {
  const snapshot: MissionSnapshot = { active: 0, byStatus: {}, recoverInFlight: 0, stuckNoRecover: 0, readable: false };
  let files: string[];
  try {
    files = d.readdir!(d.missionStateDir!) ?? [];
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

// ---- engineering.orchestrate.spend (zero-LLM, deterministic) ----

export const orchestrateSpendInputSchema = z.object({
  missionId: z.string().min(1).optional(),
  priceTablePath: z.string().optional(),
  missionStateDir: z.string().optional(),
  claudeConfigDir: z.string().optional(),
}).strict();

export interface SpendTokenBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface SpendMissionResult {
  missionId: string;
  sessionId: string | null;
  model: string | null;
  tokens: SpendTokenBreakdown;
  costUsd: number | null;
  priceTableUsed: string | null;
  transcriptFound: boolean;
  costStateFound: boolean;
  messageModelFound: boolean;
  note: string | null;
}

export interface SpendResult {
  missionId: string | null;
  missions: SpendMissionResult[];
  totalCostUsd: number;
  totalTokens: SpendTokenBreakdown;
  priceTableSource: string | null;
  computedAt: string;
}

function readPriceTable(d: ReturnType<typeof resolveDeps>): {
  models: Record<string, { in: number; out: number; cache_read: number }> | null;
  source: string | null;
} {
  const raw = d.readText!(d.priceTablePath!);
  if (raw == null) return { models: null, source: null };
  try {
    const parsed = JSON.parse(raw) as {
      models?: Record<string, { in?: number; out?: number; cache_read?: number }>;
      verified_at?: string;
      source?: string;
    };
    if (!parsed.models) return { models: null, source: null };
    const models: Record<string, { in: number; out: number; cache_read: number }> = {};
    for (const [model, pricing] of Object.entries(parsed.models)) {
      if (typeof pricing.in === "number" && typeof pricing.out === "number") {
        models[model] = {
          in: pricing.in,
          out: pricing.out,
          cache_read: typeof pricing.cache_read === "number" ? pricing.cache_read : pricing.in * 0.2,
        };
      }
    }
    return { models: Object.keys(models).length > 0 ? models : null, source: parsed.source ?? null };
  } catch {
    return { models: null, source: null };
  }
}

function findTranscriptPath(
  claudeConfigDir: string,
  sessionId: string,
): string | null {
  if (!existsSync(claudeConfigDir)) return null;
  try {
    const projectsDir = readdirSync(claudeConfigDir);
    for (const project of projectsDir) {
      const candidate = path.join(claudeConfigDir, project, `${sessionId}.jsonl`);
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // ignore
  }
  return null;
}

function readTranscriptUsage(
  transcriptPath: string,
  priceTable: Record<string, { in: number; out: number; cache_read: number }> | null,
): { model: string | null; tokens: SpendTokenBreakdown; costUsd: number | null; costStateFound: boolean; messageModelFound: boolean; note: string | null } {
  let model: string | null = null;
  let tokens: SpendTokenBreakdown = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  let costStateFound = false;
  let messageModelFound = false;
  let lastMessageModel: string | null = null;

  const raw = readFileSync(transcriptPath, "utf8");
  if (raw == null) return { model: null, tokens, costUsd: null, costStateFound: false, messageModelFound: false, note: "transcript unreadable" };

  const lines = raw.split("\n");
  let costStateLine: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj.type === "cost-state" && obj.modelUsage) {
        costStateFound = true;
        costStateLine = trimmed;
        let bestModel: string | null = null;
        let bestTotal = 0;
        for (const [m, usage] of Object.entries(obj.modelUsage) as [string, { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number }][]) {
          const total = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
          if (total > bestTotal) { bestTotal = total; bestModel = m; }
          if (usage.inputTokens) tokens.inputTokens += usage.inputTokens;
          if (usage.outputTokens) tokens.outputTokens += usage.outputTokens;
          if (usage.cacheReadInputTokens) tokens.cacheReadTokens += usage.cacheReadInputTokens;
        }
        model = bestModel;
      }
      if (obj.type === "message" && obj.message && typeof obj.message.model === "string") {
        lastMessageModel = obj.message.model;
        messageModelFound = true;
      }
      if (obj.type === "assistant" && obj.message) {
        const msg = obj.message as { model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } };
        if (msg.model) { lastMessageModel = msg.model; messageModelFound = true; }
        if (msg.usage) {
          const u = msg.usage;
          tokens.inputTokens += u.input_tokens ?? 0;
          tokens.outputTokens += u.output_tokens ?? 0;
          tokens.cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
          tokens.cacheReadTokens += u.cache_read_input_tokens ?? 0;
        }
      }
    } catch {
      // malformed line: skip
    }
  }

  if (lastMessageModel) { model = lastMessageModel; }

  let costUsd: number | null = null;
  if (model && priceTable && priceTable[model]) {
    const pricing = priceTable[model];
    costUsd =
      (tokens.inputTokens * pricing.in +
        tokens.outputTokens * pricing.out +
        tokens.cacheReadTokens * pricing.cache_read) /
      1_000_000;
  } else if (model && costStateLine) {
    try {
      const costState = JSON.parse(costStateLine);
      const modelUsage = costState.modelUsage?.[model];
      if (modelUsage?.costUSD) costUsd = modelUsage.costUSD;
    } catch { /* ignore */ }
  }

  const noteParts: string[] = [];
  if (!costStateFound) noteParts.push("sem cost-state no transcript");
  if (!messageModelFound && !model) noteParts.push("sem model identificado");
  if (model && !priceTable?.[model]) noteParts.push(`modelo "${model}" nao no price table`);

  return {
    model, tokens, costUsd, costStateFound, messageModelFound,
    note: noteParts.length > 0 ? noteParts.join("; ") : null,
  };
}

export function runOrchestrateSpend(
  input: { missionId?: string; priceTablePath?: string; missionStateDir?: string; claudeConfigDir?: string },
  deps?: OrchestrateDeps,
): SpendResult {
  const d = resolveDeps(deps);
  const priceTableRaw = readPriceTable(d);
  const priceTable = priceTableRaw.models;
  const priceTableSource = priceTableRaw.source;
  const stateDir = d.missionStateDir!;
  const claudeConfigDir = d.claudeConfigDir!;

  let files: string[];
  try { files = d.readdir!(stateDir) ?? []; } catch {
    return { missionId: input.missionId ?? null, missions: [], totalCostUsd: 0, totalTokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }, priceTableSource: null, computedAt: new Date().toISOString() };
  }

  const missions: SpendMissionResult[] = [];
  let totalCostUsd = 0;
  const totalTokens: SpendTokenBreakdown = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const missionId = file.replace(/\.json$/, "");
    if (input.missionId && missionId !== input.missionId) continue;

    try {
      const raw = d.readText!(path.join(stateDir, file));
      if (raw == null) continue;
      const ledger = JSON.parse(raw) as { missionId?: string; resumeSessionId?: string; status?: string; sessionId?: string };
      const sessionId = ledger.resumeSessionId ?? ledger.sessionId ?? null;

      let spend: SpendMissionResult = {
        missionId, sessionId, model: null,
        tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
        costUsd: null, priceTableUsed: priceTableSource,
        transcriptFound: false, costStateFound: false, messageModelFound: false,
        note: "sem sessionId no ledger",
      };

      if (sessionId) {
        const transcriptPath = findTranscriptPath(claudeConfigDir, sessionId);
        if (transcriptPath) {
          spend.transcriptFound = true;
          const usage = readTranscriptUsage(transcriptPath, priceTable ?? {});
          spend.model = usage.model; spend.tokens = usage.tokens; spend.costUsd = usage.costUsd;
          spend.costStateFound = usage.costStateFound; spend.messageModelFound = usage.messageModelFound; spend.note = usage.note;
          if (usage.costUsd != null) {
            totalCostUsd += usage.costUsd;
            totalTokens.inputTokens += usage.tokens.inputTokens;
            totalTokens.outputTokens += usage.tokens.outputTokens;
            totalTokens.cacheReadTokens += usage.tokens.cacheReadTokens;
            totalTokens.cacheCreationTokens += usage.tokens.cacheCreationTokens;
          }
        } else {
          spend.note = "transcript nao encontrado para sessionId";
        }
      }
      missions.push(spend);
    } catch { /* malformed ledger: skip */ }
  }

  return { missionId: input.missionId ?? null, missions, totalCostUsd, totalTokens, priceTableSource, computedAt: new Date().toISOString() };
}

// Update orchestrateList to include spend aggregates per mission + consumer state
// + roles enrichment per mission (ORCH-ROLE-BADGE-01): reads each mission's
// ledger at missionStateDir and attaches the roles block (worker/advisor/supervisor/judge).
export function orchestrateList(deps?: OrchestrateDeps): { count: number; entries: QueueEntry[]; spend: SpendResult; consumer: OrchestratorConsumerState } {
  const d = resolveDeps(deps);
  const raw = d.readText!(d.queuePath!);
  const entries = parseQueue(raw);
  const spend = runOrchestrateSpend({}, deps);
  const consumer = readConsumerState(d);
  // ORCH-ROLE-BADGE-01: enrich entries with roles from mission ledgers
  const enriched = entries.map((entry) => {
    const missionId = (entry.payload?.missionId ?? entry.payload?.mission) as string | undefined;
    if (!missionId) return entry;
    const ledgerPath = `${d.missionStateDir}/${missionId}.json`;
    if (!existsSync(ledgerPath)) return entry;
    try {
      const ledgerRaw = d.readText!(ledgerPath);
      if (!ledgerRaw) return entry;
      const ledger = JSON.parse(ledgerRaw) as { roles?: unknown };
      if (ledger.roles) {
        return { ...entry, roles: ledger.roles };
      }
    } catch { /* malformed ledger: skip enrichment */ }
    return entry;
  });
  return { count: enriched.length, entries: enriched, spend, consumer };
}