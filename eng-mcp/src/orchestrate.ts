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
  // ORCH-QUEUE-PROMOTE-01: trilha auditável da promoção (execute apenas; PLAN é read-only).
  consumeAuditPath: "/data/audit/orchestrate-consume.jsonl",
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
  /** ORCH-QUEUE-PROMOTE-01: trilha auditável da promoção (default /data/audit/orchestrate-consume.jsonl). */
  consumeAuditPath?: string;
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
  /** ORCH-QUEUE-PROMOTE-01: ids de intent já promovidas (dedupe idempotente; cap 200). */
  promotedIds?: string[];
}

export interface ConsumeEntryResult {
  entryId: string;
  action: "promoted" | "skipped" | "blocked" | "throttled" | "operator_required" | "dead_letter" | "noop" | "deferred";
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
  noop: number;
  deferred: number;
  /** ORCH-QUEUE-PROMOTE-01: "plan" = read-only (o que promoveria e por quê); "execute" = despacho real. */
  mode: "plan" | "execute";
  results: ConsumeEntryResult[];
}

export const orchestrateConsumeInputSchema = z.object({
  dryRun: z.boolean().optional(),
  maxPromotions: z.number().int().min(1).max(10).optional(),
  // ORCH-QUEUE-PROMOTE-01: PLAN é o default (read-only); execute=true + approval promove de fato.
  execute: z.boolean().optional(),
  approval: z.object({ approved: z.boolean() }).optional(),
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

function emptyConsumerState(): OrchestratorConsumerState {
  return { status: "stopped", lastPromotion: null, lastPromotionId: null, promotedCount: 0, skippedCount: 0, blockedCount: 0, requeuedCount: 0, deadLetteredCount: 0, updatedAt: null, promotedIds: [] };
}

function readConsumerState(d: OrchestrateDeps): OrchestratorConsumerState {
  const raw = d.readText!(d.consumerStatePath!);
  if (raw == null) return emptyConsumerState();
  try {
    const parsed = JSON.parse(raw) as OrchestratorConsumerState;
    if (parsed && typeof parsed.status === "string") {
      return { ...emptyConsumerState(), ...parsed, promotedIds: Array.isArray(parsed.promotedIds) ? parsed.promotedIds : [] };
    }
  } catch { /* ignore */ }
  return emptyConsumerState();
}

function writeConsumerState(d: OrchestrateDeps, state: OrchestratorConsumerState): void {
  try {
    if (d.writeText) d.writeText(d.consumerStatePath!, JSON.stringify(state, null, 2));
    else writeFileSync(d.consumerStatePath!, JSON.stringify(state, null, 2), "utf8");
  } catch { /* fail-open */ }
}

// ORCH-QUEUE-PROMOTE-01: append injetável (padrão HERMÉTICO-FIX-01) — os testes
// roteiam via d.appendFile; produção sem dep usa o fs real.
const appendReal = (filePath: string, data: string): void => appendFileSync(filePath, data, "utf8");

function spoolEvent(d: ReturnType<typeof resolveDeps>, kind: string, missionId: string, msg: string): void {
  const line = JSON.stringify({ ts: new Date(d.now!()).toISOString(), event: kind, missionId, msg: msg.slice(0, 200), source: "orchestrator-consumer" });
  try { (d.appendFile ?? appendReal)(d.spoolPath!, line + "\n"); } catch { /* fail-open */ }
}

// ORCH-QUEUE-PROMOTE-01: trilha auditável da promoção em /data/audit/orchestrate-consume.jsonl.
// Uma linha por decisão (execute apenas — PLAN é read-only e não audita). Fail-open: a trilha
// nunca trava a promoção nem inventa prova.
type ConsumeDecision = "PROMOTED" | "DEFERRED" | "BLOCKED" | "THROTTLED" | "SKIPPED" | "OPERATOR_REQUIRED" | "NOOP" | "DEAD_LETTER" | "REQUEUED";

function auditConsume(d: ReturnType<typeof resolveDeps>, record: { mode: "plan" | "execute"; entryId: string; missionId: string | null; decision: ConsumeDecision; reason: string }): void {
  const line = JSON.stringify({ ts: new Date(d.now!()).toISOString(), ...record, reason: record.reason.slice(0, 400), source: "orchestrate-consume" });
  try {
    if (d.appendFile) {
      d.appendFile(d.consumeAuditPath!, line + "\n");
    } else {
      try { mkdirSync(d.consumeAuditPath!.replace(/\/[^/]+$/, ""), { recursive: true }); } catch { /* dir pode já existir */ }
      appendReal(d.consumeAuditPath!, line + "\n");
    }
  } catch { /* fail-open */ }
}

/**
 * ORCH-QUEUE-PROMOTE-01: consome a fila de intents deterministicamente (zero-LLM).
 * PLAN é o default (read-only: lista o que promoveria e por quê — nada despacha,
 * nada grava). execute=true + approval.approved=true promove de fato pelo caminho
 * JÁ governado mission.dispatch (wiring em tools.ts). Regras por intent, nesta ordem:
 * (1) dedupe idempotente — intent já promovida (id no estado do consumidor) → NO_OP;
 * (2) promptFile inexistente → skip; (3) class=pesada → operador; (4) matriz de
 * conflito — intents do mesmo componente/worktree serializam (deferred); (5) probe
 * de recursos via orchestrate.plan — GO obrigatório antes de cada despacho;
 * (6) despacho com requeue 2^n (max 3) e dead letter. Em execute, toda decisão vai
 * para /data/audit/orchestrate-consume.jsonl + spool; a fila é append-only — entradas
 * nunca são removidas, o dedupe é pelo estado (promotedIds, cap 200).
 */
export async function runOrchestrateConsume(
  input: { dryRun?: boolean; maxPromotions?: number; execute?: boolean; approval?: { approved: boolean } },
  deps?: OrchestrateDeps,
): Promise<ConsumeResult> {
  const d = resolveDeps(deps);
  const maxPromotions = input.maxPromotions ?? 5;
  // ORCH-QUEUE-PROMOTE-01: execute é o gatilho de mutação; dryRun vira alias legado
  // de plan mode (nunca despacha). Sem execute → modo seguro por default.
  const execute = input.execute === true;
  const mode: "plan" | "execute" = execute ? "execute" : "plan";
  if (execute && input.approval?.approved !== true) {
    throw new Error("ORCH_CONSUME_APPROVAL_REQUIRED: execute=true exige approval.approved=true (PLAN é o default)");
  }

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

  // (a) ordem da fila: priority (1=mais alta), depois FIFO
  entries.sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5) || a.enqueuedAt.localeCompare(b.enqueuedAt));

  const result: ConsumeResult = { consumed: entries.length, promoted: 0, skipped: 0, blocked: 0, throttled: 0, operatorRequired: 0, deadLettered: 0, requeued: 0, noop: 0, deferred: 0, mode, results: [] };
  let promotedCount = 0;
  // (b) matriz de conflito: componente declarado no payload (ou worktree como proxy
  // de arquivos) — intents do mesmo componente serializam dentro do ciclo.
  const busyComponents = new Set<string>();

  // (d) dedupe idempotente: intents já promovidas ficam no estado do consumidor
  const state = readConsumerState(d);
  const promotedIds = new Set(state.promotedIds ?? []);

  if (!acquireLock(d)) {
    return { ...result, results: [{ entryId: "lock", action: "skipped", reason: "promotion lock held by another cycle" }] };
  }

  // Registra a decisão no resultado; em execute também audita + spool (PLAN: read-only).
  const decide = (entryId: string, missionId: string, action: ConsumeEntryResult["action"], reason: string, decision: ConsumeDecision): void => {
    result.results.push({ entryId, action, reason, missionId });
    if (mode === "execute") {
      auditConsume(d, { mode, entryId, missionId, decision, reason });
      spoolEvent(d, action === "skipped" ? "orch_skip" : `orch_${action}`, missionId, reason);
    }
  };

  try {
    for (const entry of entries) {
      if (promotedCount >= maxPromotions) break;

      const payload = entry.payload ?? {};
      const missionId = (payload.missionId ?? entry.id) as string;
      const promptFile = (payload.prompt ?? payload.promptFile) as string | undefined;
      const worktree = payload.worktree as string | undefined;
      const priority = entry.priority ?? 5;
      const component = typeof payload.component === "string" ? payload.component
        : typeof payload.componente === "string" ? payload.componente
        : typeof payload.worktree === "string" ? `worktree:${payload.worktree}` : null;

      // (1) dedupe idempotente: intent já promovida → NO_OP tipado
      if (promotedIds.has(entry.id)) {
        decide(entry.id, missionId, "noop", "intent já promovida (dedupe idempotente)", "NOOP");
        result.noop += 1;
        continue;
      }

      // (2) intent com promptFile inexistente → skip (d.existsSync injetável — hermético)
      if (!promptFile || !(d.existsSync ?? existsSync)(promptFile)) {
        decide(entry.id, missionId, "skipped", `promptFile inexistente: ${promptFile ?? "(nenhum)"}`, "SKIPPED");
        result.skipped += 1;
        continue;
      }

      // (3) missão class=pesada → nunca promove sem operador
      try {
        const promptRaw = readFileSync(promptFile, "utf8");
        const frontmatterClass = parseFrontmatterClass(promptRaw);
        if (frontmatterClass === "pesada") {
          decide(entry.id, missionId, "operator_required", "missão class=pesada exige operador", "OPERATOR_REQUIRED");
          result.operatorRequired += 1;
          continue;
        }
      } catch { /* promptFile unreadable — already checked exists */ }

      // (4) matriz de conflito: mesmo componente/worktree serializa
      if (component != null && busyComponents.has(component)) {
        decide(entry.id, missionId, "deferred", `conflito de componente: "${component}" já em despacho neste ciclo (serialização)`, "DEFERRED");
        result.deferred += 1;
        continue;
      }

      // (5) probe de recursos: orchestrate.plan = GO obrigatório antes de cada despacho
      const plan = runOrchestratePlan({ type: "mission" }, d);

      if (plan.verdict === "BLOCK") {
        decide(entry.id, missionId, "blocked", `plan BLOCK: ${plan.blockReasons.join("; ")}`, "BLOCKED");
        result.blocked += 1;
        break;
      }

      if (plan.verdict === "THROTTLE") {
        decide(entry.id, missionId, "throttled", `plan THROTTLE: ${plan.throttleReasons.join("; ")}`, "THROTTLED");
        result.throttled += 1;
        continue;
      }

      if (mode === "plan") {
        // PLAN: computa a decisão e NÃO executa nada (read-only por contrato)
        decide(entry.id, missionId, "promoted", "plan GO (plan mode: nada despachado)", "PROMOTED");
        result.promoted += 1;
        promotedCount += 1;
        if (component != null) busyComponents.add(component);
        continue;
      }

      // (6) execute: despacho real — APENAS pelo caminho mission.dispatch. Sem handler
      // configurado é fail-closed (nunca fake-promover).
      const dispatchFn = d.dispatchMission;
      if (!dispatchFn) {
        decide(entry.id, missionId, "blocked", "sem handler de dispatch configurado (fail-closed)", "BLOCKED");
        result.blocked += 1;
        continue;
      }

      try {
        const dispatchResult = await dispatchFn({ missionId, promptFile, worktree, priority });
        if (dispatchResult.ok) {
          decide(entry.id, missionId, "promoted", "plan GO → despachado via mission.dispatch", "PROMOTED");
          result.promoted += 1;
          promotedCount += 1;
          if (component != null) busyComponents.add(component);
          promotedIds.add(entry.id);
        } else {
          await handleDispatchFailure(d, entry, missionId, promptFile, worktree, priority, dispatchResult.error ?? "unknown", result, mode);
        }
      } catch (err) {
        await handleDispatchFailure(d, entry, missionId, promptFile, worktree, priority, String(err), result, mode);
      }
    }
  } finally {
    releaseLock(d);
  }

  // Update consumer state (execute apenas — PLAN é read-only)
  if (mode === "execute") {
    state.status = "alive";
    state.updatedAt = new Date(d.now!()).toISOString();
    state.promotedCount += result.promoted;
    state.skippedCount += result.skipped;
    state.blockedCount += result.blocked;
    state.requeuedCount += result.requeued;
    state.deadLetteredCount += result.deadLettered;
    state.promotedIds = Array.from(promotedIds).slice(-200);
    if (result.results.length > 0) {
      const last = result.results[result.results.length - 1];
      state.lastPromotion = state.updatedAt;
      state.lastPromotionId = last.entryId;
    }
    writeConsumerState(d, state);
  }

  return result;
}

async function handleDispatchFailure(
  d: ReturnType<typeof resolveDeps>,
  entry: QueueEntry,
  missionId: string,
  promptFile: string,
  worktree: string | undefined,
  priority: number,
  error: string,
  result: ConsumeResult,
  mode: "plan" | "execute" = "execute",
): Promise<void> {
  const payload = entry.payload ?? {};
  const attemptCount = ((payload._attemptCount as number | undefined) ?? 0) + 1;

  if (attemptCount >= 3) {
    if (mode === "execute") {
      auditConsume(d, { mode, entryId: entry.id, missionId, decision: "DEAD_LETTER", reason: `3 tentativas falhas: ${error}` });
      spoolEvent(d, "orch_dead_letter", missionId, `3 tentativas falhas: ${error.slice(0, 200)}`);
    }
    result.results.push({ entryId: entry.id, action: "dead_letter", reason: error.slice(0, 200), missionId });
    result.deadLettered += 1;
  } else {
    const updatedPayload = { ...payload, _attemptCount: attemptCount };
    const updatedEntry = { ...entry, payload: updatedPayload };
    try { (d.appendFile ?? appendReal)(d.queuePath!, `${JSON.stringify(updatedEntry)}\n`); } catch { /* fail-open */ }
    const backoff = Math.pow(2, attemptCount);
    if (mode === "execute") {
      auditConsume(d, { mode, entryId: entry.id, missionId, decision: "REQUEUED", reason: `tentativa ${attemptCount}, backoff ${backoff}s: ${error}` });
      spoolEvent(d, "orch_requeue", missionId, `re-enfileirado (tentativa ${attemptCount}, backoff ${backoff}s): ${error.slice(0, 200)}`);
    }
    result.results.push({ entryId: entry.id, action: "dead_letter", reason: `requeued attempt ${attemptCount}`, missionId });
    result.requeued += 1;
  }
}

// Update orchestrateList to include spend aggregates per mission + consumer state
// ORCH-QUEUE-PROMOTE-01 (higiene do planner): a capacidade conta SOMENTE status
// "dispatched" como slot ocupado. A transição de reopen (deliver-verify vermelho)
// devolve a missão para "dispatched" (mission_core.py), logo "dispatched" cobre
// despachadas E reabertas. Registros "unknown"/sem status (ex.: *.verify.json e
// nudges.json no mission-state) NUNCA contam como ativos — são classificados em
// unknownCount/unknownFiles para proposta de limpeza separada (nada é apagado aqui).
const ACTIVE_SLOT_STATUSES = new Set(["dispatched"]);

export interface MissionSnapshot {
  active: number;
  byStatus: Record<string, number>;
  recoverInFlight: number;
  stuckNoRecover: number;
  readable: boolean;
  /** ORCH-QUEUE-PROMOTE-01: registros sem campo status (legado/evidência — ex. *.verify.json). NUNCA contam como ativos; limpeza é missão separada. */
  unknownCount: number;
  /** Até 10 nomes de arquivo unknown (ordem de leitura) para a proposta de limpeza. */
  unknownFiles: string[];
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

// HERMÉTICO-FIX-02: paths do consumidor com override por env (deploy injeta
// ENG_MCP_CONSUMER_*/ENG_MCP_SPOOL_PATH apontando para /run/mission-bus, rw no
// container — a monta /opt/mission-events é ro por contrato SEC-FIX).
const envPath = (name: string): string | undefined => {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
};

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
    // ORCH-QUEUE-PROMOTE-01: handler de despacho injetável (tests passam fake;
    // produção: tools.ts injeta o caminho governado runMissionDispatch).
    dispatchMission: deps?.dispatchMission,
    loadavgPath: deps?.loadavgPath ?? envPath("ENG_MCP_LOADAVG_PATH") ?? DEFAULT_PATHS.loadavg,
    meminfoPath: deps?.meminfoPath ?? envPath("ENG_MCP_MEMINFO_PATH") ?? DEFAULT_PATHS.meminfo,
    missionStateDir: deps?.missionStateDir ?? envPath("ENG_MCP_MISSION_STATE_DIR") ?? DEFAULT_PATHS.missionStateDir,
    budgetPath: deps?.budgetPath ?? envPath("ENG_MCP_BUDGET_PATH") ?? DEFAULT_PATHS.budgetPath,
    agentsPath: deps?.agentsPath ?? envPath("ENG_MCP_AGENTS_PATH") ?? DEFAULT_PATHS.agentsPath,
    queuePath: deps?.queuePath ?? envPath("ENG_MCP_QUEUE_PATH") ?? DEFAULT_PATHS.queuePath,
    consumerStatePath: deps?.consumerStatePath ?? envPath("ENG_MCP_CONSUMER_STATE_PATH") ?? DEFAULT_PATHS.consumerStatePath,
    consumerLockPath: deps?.consumerLockPath ?? envPath("ENG_MCP_CONSUMER_LOCK_PATH") ?? DEFAULT_PATHS.consumerLockPath,
    spoolPath: deps?.spoolPath ?? envPath("ENG_MCP_SPOOL_PATH") ?? DEFAULT_PATHS.spoolPath,
    consumeAuditPath: deps?.consumeAuditPath ?? envPath("ENG_MCP_CONSUME_AUDIT_PATH") ?? DEFAULT_PATHS.consumeAuditPath,
    missionOpsDir: deps?.missionOpsDir ?? envPath("ENG_MCP_MISSION_OPS_DIR") ?? DEFAULT_PATHS.missionOpsDir,
    priceTablePath: deps?.priceTablePath ?? envPath("ENG_MCP_PRICE_TABLE_PATH") ?? DEFAULT_PATHS.priceTablePath,
    claudeConfigDir: deps?.claudeConfigDir ?? envPath("ENG_MCP_CLAUDE_CONFIG_DIR") ?? DEFAULT_PATHS.claudeConfigDir,
  };
}

function defaultReaddir(path: string): string[] | null {
  try { return readdirSync(path); } catch { return null; }
}

function readMissions(d: ReturnType<typeof resolveDeps>): MissionSnapshot {
  const snapshot: MissionSnapshot = { active: 0, byStatus: {}, recoverInFlight: 0, stuckNoRecover: 0, readable: false, unknownCount: 0, unknownFiles: [] };
  let files: string[];
  try {
    const listed = d.readdir!(d.missionStateDir!);
    if (listed == null) return snapshot; // readdir null = dir ilegível → readable=false (honesto: nunca GO às cegas)
    files = listed;
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
      // ORCH-QUEUE-PROMOTE-01: só dispatched ocupa slot — unknown/evidência nunca contam
      if (ACTIVE_SLOT_STATUSES.has(status)) snapshot.active += 1;
      if (status === "recover") snapshot.recoverInFlight += 1;
      if (status === "interrupted") snapshot.stuckNoRecover += 1;
      if (status === "unknown") {
        snapshot.unknownCount += 1;
        if (snapshot.unknownFiles.length < 10) snapshot.unknownFiles.push(file);
      }
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