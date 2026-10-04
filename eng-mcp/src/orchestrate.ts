// ORCHESTRATOR-F1-01: engineering.orchestrate.plan + engineering.orchestrate.enqueue
// Deterministic pre-flight planner (ZERO-LLM, design-orchestrator-01 §3/§4, F1 scope):
// composes system probes (load, mem, disk, failed units), mission state, the daily
// budget and per-type agent capacity into ONE GO/THROTTLE/BLOCK verdict in a single
// call. No dispatch, no cgroups (v2), no tool catalog (v3) — those are future phases.
// Every probe is fail-open (missing evidence → null, never invented); the only
// honest downgrade is THROTTLE when the mission state dir cannot be read at all
// (dispatching blind while unable to see in-flight missions would be optimistic).
import { execFileSync } from "node:child_process";
import os from "node:os";
import { existsSync, mkdirSync, readFileSync, readdirSync, appendFileSync, writeFileSync, unlinkSync, openSync, readSync, closeSync, statSync } from "node:fs";
import path from "node:path";
import { runOrchestrateQueueCompaction } from "./orchestrateCompaction.ts";  // ORCH-QUEUE-COMPACT-01: arquivamento no fim do ciclo
import { readPreauthArtifact, orchPreauthPath, orchPreauthAllowsTier2, type OrchPreauthReading } from "./orchPreauthArtifact.ts";  // ORCH-TOOLS-01: artefato preauth para tier-2
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
  /** ORCH-BREAKER-01: PSI de I/O (/proc/pressure/io) — gate de swap/iowait do plan. */
  psiPath?: string;
  /** ORCH-BREAKER-01: estado do breaker (breaker:{stage,paused,since} no plan/list). */
  breakerStatePath?: string;
  /** Dispatch a mission via the mission-ops handler. Returns {ok, error?}. */
  dispatchMission?(input: { missionId: string; promptFile: string; worktree?: string; priority?: number }): Promise<{ ok: boolean; error?: string }>;
  /** ORCH-TOOLS-01: handler in-processo para intents tool_call (tier-1 leitura + tier-2 escrita governada). */
  toolCallHandler?(tool: string, args: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: string }>;
  /** ORCH-TOOLS-01: leitura do artefato preauth (injetável p/ testes; default: readPreauthArtifact(orchPreauthPath())). */
  readPreauth?(): OrchPreauthReading;
}

// ---- ORCH-TOOLS-01: matriz de tiers para intents tool_call (zero-LLM, determinística) ----

export type ToolCallTier = 1 | 2 | 3;

/** Tier 1 (auto, zero-LLM): leitura/determinísticas — executadas in-processo, NÃO contam no teto. */
export const ORCH_TIER1_TOOLS: ReadonlySet<string> = new Set([
  "engineering.test.run",
  "engineering.typecheck.run",
  "engineering.lint.run",
  "engineering.code.search",
  "engineering.code.references",
  "engineering.repo.structure",
  "engineering.file.read",
  "engineering.mcp.catalog",
  "engineering.session.roster",
  "engineering.git.status",
  "engineering.git.diff",
  "engineering.git.log",
  "engineering.git.branches",
  "engineering.git.worktrees",
  "engineering.git.inspect_commit",
  "engineering.git.inspect_changes",
]);

/** Tier 2 (escritas governadas): executadas SOMENTE com artefato preauth válido; contam no teto. */
export const ORCH_TIER2_TOOLS: ReadonlySet<string> = new Set([
  "engineering.git.stage",
  "engineering.git.commit",
  "engineering.git.push",
  "engineering.file.create",
  "engineering.file.patch",
]);

/** Tier 3 (NUNCA auto): consequência externa — blocked tipado, artefato NENHUM aprova (avaliado ANTES do artefato, mesmo modelo do gate band-3). */
const ORCH_TIER3_PREFIXES = ["engineering.release.", "engineering.vps.", "engineering.registry.", "engineering.upstream."];
const ORCH_TIER3_MARKER = /deploy|credential|secret/i;

/**
 * Classificação determinística de tiers para tool_call (o consume usa; UNKNOWN = fora
 * da matriz → blocked fail-closed, nunca auto-executado).
 */
export function classifyToolTier(tool: string): { tier: 0 | ToolCallTier; reason: string } {
  const t = String(tool ?? "").trim();
  if (ORCH_TIER1_TOOLS.has(t) || t.startsWith("engineering.runtime.")) {
    return { tier: 1, reason: "tier1_readonly_deterministic" };
  }
  if (ORCH_TIER2_TOOLS.has(t)) {
    return { tier: 2, reason: "tier2_write_requires_valid_preauth_artifact" };
  }
  if (ORCH_TIER3_PREFIXES.some((p) => t.startsWith(p)) || ORCH_TIER3_MARKER.test(t)) {
    return { tier: 3, reason: "tier3_external_consequence_operator_path" };
  }
  return { tier: 0, reason: "tool_outside_tier_matrix_fail_closed" };
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
  /** ORCH-QUEUE-COMPACT-01: último ciclo com compactação da fila (fail-open). */
  lastCompactionAt?: string | null;
  /** ORCH-TOOLS-01: evidência das últimas tool_call executadas (cap 50). */
  toolResults?: Array<{ entryId: string; tool: string; ok: boolean; at: string; summary: string }>;
}

export interface ConsumeEntryResult {
  entryId: string;
  action: "promoted" | "skipped" | "blocked" | "throttled" | "operator_required" | "dead_letter" | "noop" | "deferred" | "executed" | "awaiting_approval" | "requeued";
  reason: string;
  missionId?: string;
  /** ORCH-TOOLS-01: metadados de tool_call. */
  tool?: string;
  tier?: number;
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
  /** ORCH-TOOLS-01: tool_calls tier-1 executadas no ciclo (não contam no teto). */
  toolCallsExecuted: number;
  /** ORCH-TOOLS-01: tool_calls tier-2 aguardando artefato preauth válido. */
  awaitingApproval: number;
  /** ORCH-QUEUE-PROMOTE-01: "plan" = read-only (o que promoveria e por quê); "execute" = despacho real. */
  mode: "plan" | "execute";
  results: ConsumeEntryResult[];
  /** ORCH-QUEUE-COMPACT-01: linhas movidas para o archive no fim do ciclo (execute; 0 em plan). */
  compacted?: number;
}

export const orchestrateConsumeInputSchema = z.object({
  dryRun: z.boolean().optional(),
  maxPromotions: z.number().int().min(1).max(10).optional(),
  // ORCH-QUEUE-PROMOTE-01: PLAN é o default (read-only); execute=true + approval promove de fato.
  execute: z.boolean().optional(),
  approval: z.object({ approved: z.boolean() }).optional(),
}).strict();

const CONSUMER_LOCK_TTL_MS = 30_000;

// ORCH-BREAKER-01: exportado para o breaker reusar o MESMO parser de classe
// (financeiro/aprovação no frontmatter = camada nunca interceptável).
export function parseFrontmatterClass(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^---\s*\n[\s\S]*?class:\s*(\S+)\s*\n[\s\S]*?^---/m);
  return m ? m[1] : null;
}

// ---- ORCH-CLOSED-NOOP-01: missão fechada nunca re-despacha ----

/** Statuses de ledger que encerram a missão: re-despacho proibido. */
const CLOSED_MISSION_STATUSES = new Set(["closed", "cancelled", "interrupted"]);

/**
 * Lê o ledger da missão e retorna true se status ∈ CLOSED_MISSION_STATUSES.
 * Ledger ausente/ilegível → false (fail-open: só bloqueia com prova de fechamento).
 * Cache por ciclo de consume (uma leitura por missão, não por entry).
 */
function isMissionClosed(d: OrchestrateDeps, missionId: string, cache: Map<string, boolean>): boolean {
  const cached = cache.get(missionId);
  if (cached !== undefined) return cached;
  let closed = false;
  try {
    const ledgerPath = `${d.missionStateDir!}/${missionId}.json`;
    const raw = d.readText ? d.readText(ledgerPath) : readFileSync(ledgerPath, "utf8");
    if (raw != null) {
      const ledger = JSON.parse(raw) as { status?: unknown };
      closed = typeof ledger.status === "string" && CLOSED_MISSION_STATUSES.has(ledger.status);
    }
  } catch {
    closed = false; // fail-open
  }
  cache.set(missionId, closed);
  return closed;
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
type ConsumeDecision = "PROMOTED" | "DEFERRED" | "BLOCKED" | "THROTTLED" | "SKIPPED" | "OPERATOR_REQUIRED" | "NOOP" | "DEAD_LETTER" | "REQUEUED" | "EXECUTED" | "AWAITING_APPROVAL";

/**
 * ORCH-TOOLS-01: resumo determinístico do resultado de uma tool_call para o
 * toolResults do estado do consumidor (nunca inventa sucesso — erro tipado vira
 * "erro: ..."; objetos viram JSON truncado).
 */
function toolResultSummary(value: unknown): string {
  if (value == null) return "sem resultado";
  if (typeof value === "string") return value.slice(0, 120);
  try { return JSON.stringify(value).slice(0, 120); } catch { return String(value).slice(0, 120); }
}

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
 *
 * ORCH-TOOLS-01: intents type="tool_call" (payload {tool, args, mission?}) seguem
 * fluxo próprio ANTES das checagens de despacho — matriz de tiers: tier-1
 * (leitura/determinística) executa in-processo via handler injetado e NÃO consome
 * teto; tier-2 (escrita: git.stage/commit/push, file.create/patch) exige artefato
 * preauth válido (orchPreauthAllowsTier2) e consome teto compartilhado; tier-3/0
 * (release/vps/registry/deploy/credential/secret e desconhecidas) = blocked SEMPRE,
 * avaliado ANTES de qualquer artefato. Sem preauth, tier-2 fica awaiting_approval
 * (permanece na fila). Falha de execução é decisão final em toolResults (sem retry).
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

  const result: ConsumeResult = { consumed: entries.length, promoted: 0, skipped: 0, blocked: 0, throttled: 0, operatorRequired: 0, deadLettered: 0, requeued: 0, noop: 0, deferred: 0, toolCallsExecuted: 0, awaitingApproval: 0, mode, results: [] };
  let promotedCount = 0;
  // (b) matriz de conflito: componente declarado no payload (ou worktree como proxy
  // de arquivos) — intents do mesmo componente serializam dentro do ciclo.
  const busyComponents = new Set<string>();
  // ORCH-TOOLS-01: serialização por missão — um mission_dispatch promovido no ciclo
  // marca a missão; tool_call com `mission` declarada defere (fila única por missão).
  const busyMissions = new Set<string>();
  // ORCH-TOOLS-01: toolResults do ciclo (merged no estado do consumidor em execute).
  const toolResults: NonNullable<OrchestratorConsumerState["toolResults"]> = [];
  // ORCH-TOOLS-01: leitura do artefato preauth é lazy — 1 leitura por ciclo, só se
  // houver intent tier-2 (nunca é lida para tier-1/tier-3).
  let preauthReading: OrchPreauthReading | null = null;

  // (d) dedupe idempotente: intents já promovidas ficam no estado do consumidor
  const state = readConsumerState(d);
  const promotedIds = new Set(state.promotedIds ?? []);

  // ORCH-CLOSED-NOOP-01: cache de ledgers fechados por ciclo (1 leitura por missão).
  const closedMissionCache = new Map<string, boolean>();

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

      // ORCH-TOOLS-01: intents tool_call (payload {tool, args, mission?}) — fluxo
      // PRÓPRIO, antes das checagens de despacho (não há promptFile/ledger aqui).
      // Matriz de tiers: (1) leitura/determinística → executada in-processo, NÃO
      // consome teto; (2) escrita → exige artefato preauth válido, consome teto;
      // (3/0) consequência externa/desconhecida → blocked SEMPRE, avaliado ANTES de
      // qualquer artefato (nenhum preauth autoriza tier-3 — mesmo modelo do band-3).
      if (entry.type === "tool_call") {
        const tool = typeof payload.tool === "string" ? payload.tool : "";
        const toolMission = typeof payload.mission === "string" && payload.mission.length > 0 ? payload.mission : null;
        const toolEntryMission = toolMission ?? entry.id;
        const toolComponent = component ?? (toolMission != null ? `mission:${toolMission}` : null);
        const tierClass = classifyToolTier(tool);

        // (t1) tier-3/unknown: fail-closed estrutural — decisão final (id vai para o
        // dedupe; a intent não re-avalia a cada ciclo).
        if (tierClass.tier !== 1 && tierClass.tier !== 2) {
          decide(entry.id, toolEntryMission, "blocked", `tool_call ${tool}: ${tierClass.reason}`, "BLOCKED");
          result.results[result.results.length - 1].tool = tool;
          result.results[result.results.length - 1].tier = tierClass.tier;
          result.blocked += 1;
          promotedIds.add(entry.id);
          continue;
        }

        // (t2) serialização: mesmo componente (matriz existente) e mesma missão.
        if (toolComponent != null && busyComponents.has(toolComponent)) {
          decide(entry.id, toolEntryMission, "deferred", `conflito de componente: "${toolComponent}" já em execução neste ciclo (serialização)`, "DEFERRED");
          result.results[result.results.length - 1].tool = tool;
          result.results[result.results.length - 1].tier = tierClass.tier;
          result.deferred += 1;
          continue;
        }
        if (toolMission != null && busyMissions.has(toolMission)) {
          decide(entry.id, toolEntryMission, "deferred", `missão ${toolMission} já em despacho neste ciclo (serialização)`, "DEFERRED");
          result.results[result.results.length - 1].tool = tool;
          result.results[result.results.length - 1].tier = tierClass.tier;
          result.deferred += 1;
          continue;
        }

        // (t3) tier-2: gate do artefato preauth (lido no máx. 1× por ciclo). Sem
        // artefato válido → awaiting_approval fail-closed; a intent PERMANECE na fila
        // (não vai ao dedupe) e re-avalia no próximo ciclo.
        if (tierClass.tier === 2) {
          preauthReading ??= (d.readPreauth ? d.readPreauth() : readPreauthArtifact(orchPreauthPath()));
          if (!orchPreauthAllowsTier2(preauthReading)) {
            decide(entry.id, toolEntryMission, "awaiting_approval", `tool_call ${tool} (tier-2): artefato preauth ${preauthReading.status}${preauthReading.reason ? ` (${preauthReading.reason})` : ""} — fail-closed, nada executado`, "AWAITING_APPROVAL");
            result.results[result.results.length - 1].tool = tool;
            result.results[result.results.length - 1].tier = 2;
            result.awaitingApproval += 1;
            continue;
          }
        }

        // (t4) PLAN: decisão computada sem efeito. tier-2 conta no teto (compartilhado
        // com missões); tier-1 NÃO consome teto.
        if (mode === "plan") {
          const reason = tierClass.tier === 1
            ? `plan GO (tier-1: executaria in-processo no execute; não consome teto)`
            : `plan GO (tier-2 autorizado por preauth ${preauthReading?.hash16 ?? "?"}; nada executado no plan)`;
          decide(entry.id, toolEntryMission, "promoted", reason, "PROMOTED");
          result.results[result.results.length - 1].tool = tool;
          result.results[result.results.length - 1].tier = tierClass.tier;
          result.promoted += 1;
          if (tierClass.tier === 2) promotedCount += 1;
          if (toolComponent != null) busyComponents.add(toolComponent);
          if (toolMission != null) busyMissions.add(toolMission);
          continue;
        }

        // (t5) execute: execução in-processo APENAS via handler injetado — sem
        // handler é fail-closed (nunca fake-executar).
        const toolHandler = d.toolCallHandler;
        if (!toolHandler) {
          decide(entry.id, toolEntryMission, "blocked", `tool_call ${tool}: sem handler de tool configurado (fail-closed)`, "BLOCKED");
          result.results[result.results.length - 1].tool = tool;
          result.results[result.results.length - 1].tier = tierClass.tier;
          result.blocked += 1;
          promotedIds.add(entry.id);
          continue;
        }
        const toolArgs = (payload.args && typeof payload.args === "object" && !Array.isArray(payload.args)
          ? payload.args
          : {}) as Record<string, unknown>;
        const call = await toolHandler(tool, toolArgs);
        const callSummary = call.ok
          ? `ok: ${toolResultSummary(call.result)}`
          : `erro: ${String(call.error ?? "unknown").slice(0, 200)}`;
        toolResults.push({ entryId: entry.id, tool, ok: call.ok, at: new Date(d.now!()).toISOString(), summary: callSummary.slice(0, 200) });
        if (call.ok) {
          // ORCH-TOOLS-01: tier-2 consome o teto compartilhado com missões (tier-1 não).
          if (tierClass.tier === 2) promotedCount += 1;
          const preauthProof = tierClass.tier === 2 ? `, preauth ${preauthReading?.hash16 ?? "?"}` : "";
          decide(entry.id, toolEntryMission, "executed", `tool_call ${tool} (tier-${tierClass.tier}${preauthProof}) executada in-processo: ${callSummary}`, "EXECUTED");
          result.results[result.results.length - 1].tool = tool;
          result.results[result.results.length - 1].tier = tierClass.tier;
          result.toolCallsExecuted += 1;
        } else {
          // Falha de execução: decisão final (sem retry-loop; prova fica em toolResults).
          decide(entry.id, toolEntryMission, "blocked", `tool_call ${tool} (tier-${tierClass.tier}) falhou: ${callSummary}`, "BLOCKED");
          result.results[result.results.length - 1].tool = tool;
          result.results[result.results.length - 1].tier = tierClass.tier;
          result.blocked += 1;
        }
        promotedIds.add(entry.id);
        if (toolComponent != null) busyComponents.add(toolComponent);
        if (toolMission != null) busyMissions.add(toolMission);
        continue;
      }

      // (1b) ORCH-CLOSED-NOOP-01: missão com ledger fechado nunca re-despacha.
      // status closed/cancelled/interrupted → NOOP tipado, independente de dedupe por id
      // (2 entries de ids diferentes e mesmo missionId fechado → ambas noop).
      if (missionId && isMissionClosed(d, missionId, closedMissionCache)) {
        decide(entry.id, missionId, "noop", `missão ${missionId} com ledger closed/cancelled/interrupted (nunca re-despachar)`, "NOOP");
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
        busyMissions.add(missionId);
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
          busyMissions.add(missionId);
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
    // ORCH-TOOLS-01: promotedCount do estado = promoções que consomem teto
    // (missões + tier-2); result.promoted também inclui tier-1 (não-consumidoras).
    state.promotedCount += promotedCount;
    state.skippedCount += result.skipped;
    state.blockedCount += result.blocked;
    state.requeuedCount += result.requeued;
    state.deadLetteredCount += result.deadLettered;
    state.promotedIds = Array.from(promotedIds).slice(-200);
    // ORCH-TOOLS-01: resultados de tool_call persistem no estado (cap 50).
    if (toolResults.length > 0) {
      state.toolResults = [...(state.toolResults ?? []), ...toolResults].slice(-50);
    }
    if (result.results.length > 0) {
      const last = result.results[result.results.length - 1];
      state.lastPromotion = state.updatedAt;
      state.lastPromotionId = last.entryId;
    }
    writeConsumerState(d, state);
  } else {
    // ORCH-QUEUE-COMPACT-01: PLAN é read-only por contrato — nenhuma compactação.
    result.compacted = 0;
  }

  if (mode === "execute") {
    // ORCH-QUEUE-COMPACT-01: arquivamento no fim do ciclo (após avaliação, mesmo ciclo
    // do estado) — fail-open: qualquer falha NUNCA trava o consume nem muda contagens.
    try {
      const compaction = runOrchestrateQueueCompaction({}, {
        queuePath: d.queuePath,
        consumerStatePath: d.consumerStatePath,
        missionStateDir: d.missionStateDir,
        readText: d.readText,
        writeText: d.writeText,
        appendFile: d.appendFile,
        existsSync: d.existsSync,
        now: d.now,
      });
      result.compacted = compaction.moved;
      if (compaction.moved > 0) {
        spoolEvent(d, "orch_compact", "queue", `compactação: ${compaction.moved} linha(s) → archive (${compaction.archivedIntents} intents, dedup p/ ${compaction.archivedLines} linhas)`);
      }
      if (!compaction.ok) {
        spoolEvent(d, "orch_compact_failed", "queue", `compaction fail-closed: ${compaction.error}`);
      }
    } catch (err) {
      spoolEvent(d, "orch_compact_failed", "queue", `compaction exceção (fail-open): ${err instanceof Error ? err.message : String(err)}`);
    }
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
    // ORCH-PREAUTH-ARTIFACT-01 (achado no E2E): requeue NÃO é dead_letter — o label
// trocado emitia "dead_letter" com reason "requeued attempt N" (o contador
// result.requeued já estava certo; o JSON auditável é que mentia).
result.results.push({ entryId: entry.id, action: "requeued", reason: `requeued attempt ${attemptCount}`, missionId });
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
  max: number | null;
  canDispatch: boolean;
  reason: string;
  /** ORCH-CAPACITY-DYNAMIC-01: teto de segurança de agents.json (sempre respeitado). */
  safetyCap: number | null;
  /** Fatores do momento: mem (floor(Gb/2.5)), load (floor(nproc-load-1)), disco (<20Gb→1), orçamento (>=90→0, >=70→1). */
  factors: CapacityFactors;
  /** Quais fatores estão limitando o teto efetivo agora. */
  limiting: string[];
}

export interface OrchestratePlanResult {
  system: {
    load1m: number | null;
    memAvailableGb: number | null;
    diskFreeGb: number | null;
    failedUnits: number | null;
    /** ORCH-BREAKER-01: pressão de swap (%) — null = sem swap configurado. */
    swapUsedPct: number | null;
    /** ORCH-BREAKER-01: PSI io avg60 (%) — janela sustentada (null = PSI indisponível). */
    iowaitSomeAvg60: number | null;
    iowaitFullAvg60: number | null;
  };
  missions: MissionSnapshot;
  budget: { usedTodayUsd: number; ceilingUsd: number; usedPct: number } | null;
  capacity: CapacitySlot;
  verdict: OrchestrateVerdict;
  blockReasons: string[];
  throttleReasons: string[];
  degraded: boolean;
  /** ORCH-BREAKER-01: estado do breaker (null = breaker nunca rodou). */
  breaker: { stage: number; paused: string[]; since: string | null } | null;
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
    // ORCH-TOOLS-01: handler de tool_call + leitor de artefato preauth (injetáveis).
    toolCallHandler: deps?.toolCallHandler,
    readPreauth: deps?.readPreauth,
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
    // ORCH-BREAKER-01: PSI de I/O + estado do breaker (overrides por env, padrão HERMÉTICO-FIX-02).
    psiPath: deps?.psiPath ?? envPath("ENG_MCP_PSI_IO_PATH") ?? "/proc/pressure/io",
    breakerStatePath: deps?.breakerStatePath ?? envPath("ENG_MCP_BREAKER_STATE_PATH") ?? "/opt/mission-events/orchestrator-breaker.state.json",
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

// ORCH-BREAKER-01: pressão de swap — (SwapTotal-SwapFree)/SwapTotal. Sem swap
// configurado (SwapTotal ausente/0) → null: sem swap não há pressão de swap.
function readSwapUsedPct(d: ReturnType<typeof resolveDeps>): number | null {
  const raw = d.readText!(d.meminfoPath!);
  if (raw == null) return null;
  const kb = (key: string): number | null => {
    const line = raw.split("\n").find((l) => l.startsWith(`${key}:`));
    if (!line) return null;
    const v = Number(line.trim().split(/\s+/)[1]);
    return Number.isFinite(v) ? v : null;
  };
  const total = kb("SwapTotal");
  const free = kb("SwapFree");
  if (total == null || total <= 0 || free == null) return null;
  return ((total - free) / total) * 100;
}

// ORCH-BREAKER-01: iowait sustentado via PSI (/proc/pressure/io) — janela avg60
// (sustentada por definição; avg10 é transiente). "some" = qualquer tarefa parada
// por I/O; "full" = TODAS as tarefas não-idle paradas simultaneamente.
interface IowaitPressure { someAvg60: number | null; fullAvg60: number | null }
function readIowaitPressure(d: ReturnType<typeof resolveDeps>): IowaitPressure | null {
  const raw = d.readText!(d.psiPath!);
  if (raw == null) return null;
  const out: IowaitPressure = { someAvg60: null, fullAvg60: null };
  for (const line of raw.split("\n")) {
    const m = line.match(/^(some|full)\s+avg10=\S+\s+avg60=([\d.]+)/);
    if (m) {
      const v = Number(m[2]);
      if (Number.isFinite(v)) {
        // m[1] é "some"|"full"; as chaves do objeto são someAvg60/fullAvg60.
        if (m[1] === "some") out.someAvg60 = v;
        else out.fullAvg60 = v;
      }
    }
  }
  if (out.someAvg60 == null && out.fullAvg60 == null) return null;
  return out;
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

// ORCH-CAPACITY-DYNAMIC-01: transientes `run-u*.service` (sondas de teste de workers)
// NÃO são falhas reais do sistema — contá-las bloqueava o orquestrador inteiro (2x em 03/10).
// Só unidades nomeadas (service/timer reais, incl. orch-daemon-consume.service) contam.
const FAILED_UNITS_TRANSIENT = /^run-u\d+\.service$/;

function readFailedUnits(d: ReturnType<typeof resolveDeps>): number | null {
  const out = d.exec!("systemctl", ["--failed", "--no-legend"]);
  if (out == null) return null;
  const trimmed = out.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split("\n").filter((line) => {
    const unit = line.trim().split(/\s+/)[0] ?? "";
    return unit.length > 0 && !FAILED_UNITS_TRANSIENT.test(unit);
  }).length;
}

// ORCH-BREAKER-01: limiares do gate de pressão do plan (§2). Constantes LOCAIS de
// propósito — orchestrateBreaker.ts importa ESTE módulo (parseFrontmatterClass);
// importar de volta criaria ciclo. Valores espelham BREAKER_THRESHOLDS.planSwapPct.
const BREAKER_PLAN_SWAP_PCT = 50;
const BREAKER_PLAN_IOWAIT_FULL_AVG60 = 10;
const BREAKER_PLAN_IOWAIT_SOME_AVG60 = 30;

// ORCH-CAPACITY-DYNAMIC-01: teto EFETIVO dinâmico — o sistema decide pelo momento.
// agents.json max_parallel é SEMPRE teto de segurança, nunca o teto efetivo.
export interface CapacityFactors {
  mem: number | null;   // maxPorMem = floor(memAvailableGb / 2.5)
  load: number | null;  // maxPorLoad = max(0, floor(nproc-load1m-1))
  disk: number | null;  // maxPorDisco = diskFreeGb < 20 ? 1 : null (sem limite próprio)
  budget: number | null; // maxPorOrcamento = usedPct>=90 ? 0 : usedPct>=70 ? 1 : null
  swap: number | null;  // ORCH-BREAKER-01: maxPorSwap = swapUsedPct > 50 ? 0 : null
  iowait: number | null; // ORCH-BREAKER-01: maxPorIowait = iowait sustentado ? 0 : null
}

function computeDynamicCapacity(
  load: number | null,
  memAvailableGb: number | null,
  diskFreeGb: number | null,
  budget: { usedPct: number } | null,
  safetyCap: number | null,
  swapUsedPct: number | null = null,
  iowaitSustained: boolean = false,
): { maxDynamic: number | null; factors: CapacityFactors; limiting: string[] } {
  const nproc = os.availableParallelism();
  const maxPorMem = memAvailableGb != null ? Math.floor(memAvailableGb / 2.5) : null;
  const maxPorLoad = load != null && nproc != null ? Math.max(0, Math.floor(nproc - load - 1)) : null;
  const maxPorDisco = diskFreeGb != null && diskFreeGb < 20 ? 1 : null;
  const usedPct = budget?.usedPct ?? null;
  const maxPorOrcamento = usedPct != null ? (usedPct >= 90 ? 0 : usedPct >= 70 ? 1 : null) : null;
  // ORCH-BREAKER-01: pressão de swap/iowait ⇒ slots de mission = 0 (§2 do breaker).
  // swap null = sem swap configurado — não gatilha (fail-open honesto).
  const maxPorSwap = swapUsedPct != null && swapUsedPct > BREAKER_PLAN_SWAP_PCT ? 0 : null;
  const maxPorIowait = iowaitSustained ? 0 : null;

  const factors: CapacityFactors = { mem: maxPorMem, load: maxPorLoad, disk: maxPorDisco, budget: maxPorOrcamento, swap: maxPorSwap, iowait: maxPorIowait };
  const candidates = [maxPorMem, maxPorLoad, maxPorDisco, maxPorOrcamento, maxPorSwap, maxPorIowait, safetyCap].filter((v): v is number => v != null);
  // Sem nenhum sinal legível → sem teto conhecido (null): plan não bloqueia às cegas (fail-open).
  const maxDynamic = candidates.length > 0 ? Math.min(...candidates) : null;
  const labels: Record<string, string> = { mem: "mem", load: "load", disk: "disco", budget: "orçamento", swap: "swap", iowait: "iowait" };
  const limiting: string[] = [];
  for (const [key, value] of Object.entries(factors)) {
    if (value != null && value === maxDynamic) limiting.push(labels[key] ?? key);
  }
  if (safetyCap != null && safetyCap === maxDynamic) limiting.push("teto de segurança");
  return { maxDynamic, factors, limiting };
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
  // ORCH-BREAKER-01: pressão de swap/iowait (§2) + estado do breaker (§3).
  const swapUsedPct = readSwapUsedPct(d);
  const iowait = readIowaitPressure(d);
  const iowaitSustainedFlag = (iowait?.fullAvg60 != null && iowait.fullAvg60 >= BREAKER_PLAN_IOWAIT_FULL_AVG60)
    || (iowait?.someAvg60 != null && iowait.someAvg60 >= BREAKER_PLAN_IOWAIT_SOME_AVG60);
  const breakerState = readBreakerStateLite(d);

  // ORCH-CAPACITY-DYNAMIC-01: teto efetivo = min(fatores do momento, teto de segurança)
  const dyn = computeDynamicCapacity(load, memAvailableGb, diskFreeGb, budget, maxParallel, swapUsedPct, iowaitSustainedFlag);
  const maxDynamic = dyn.maxDynamic;

  const degraded = [load, memAvailableGb, diskFreeGb, failedUnits].every((v) => v == null) && !missions.readable;

  if (budget != null && budget.usedPct > 90) blockReasons.push(`budget ${budget.usedPct.toFixed(0)}% consumido (teto ${budget.ceilingUsd} US$)`);
  if (failedUnits != null && failedUnits > 0) blockReasons.push(`systemd com ${failedUnits} unidade(s) failed`);
  if (missions.stuckNoRecover >= 2) blockReasons.push(`${missions.stuckNoRecover} missões travadas (interrupted) sem recover`);

  if (budget != null && budget.usedPct >= 70 && budget.usedPct <= 90) throttleReasons.push(`budget ${budget.usedPct.toFixed(0)}% consumido`);
  if (load != null && load > 4) throttleReasons.push(`load ${load.toFixed(2)} > 4`);
  // ORCH-BREAKER-01 §2: o motivo cita swap/iowait quando um dos dois é o gatilho.
  if (swapUsedPct != null && swapUsedPct > BREAKER_PLAN_SWAP_PCT) throttleReasons.push(`pressão de swap ${swapUsedPct.toFixed(0)}% > ${BREAKER_PLAN_SWAP_PCT}% — slots de mission = 0`);
  if (iowait?.fullAvg60 != null && iowait.fullAvg60 >= BREAKER_PLAN_IOWAIT_FULL_AVG60) throttleReasons.push(`iowait sustentado (io full avg60 ${iowait.fullAvg60.toFixed(0)}% ≥ ${BREAKER_PLAN_IOWAIT_FULL_AVG60}%) — slots de mission = 0`);
  else if (iowait?.someAvg60 != null && iowait.someAvg60 >= BREAKER_PLAN_IOWAIT_SOME_AVG60) throttleReasons.push(`iowait sustentado (io some avg60 ${iowait.someAvg60.toFixed(0)}% ≥ ${BREAKER_PLAN_IOWAIT_SOME_AVG60}%) — slots de mission = 0`);
  if (maxDynamic != null && running >= maxDynamic) throttleReasons.push(`slots de "${type}" esgotados (${running}/${maxDynamic} — teto dinâmico; limitado por: ${dyn.limiting.join(", ")})`);
  if (missions.recoverInFlight >= 1) throttleReasons.push(`${missions.recoverInFlight} recover em curso`);
  if (!missions.readable) throttleReasons.push(`mission-state ilegível em ${d.missionStateDir} — fail-open conservador`);

  const verdict: OrchestrateVerdict = blockReasons.length > 0 ? "BLOCK" : throttleReasons.length > 0 ? "THROTTLE" : "GO";
  const canDispatch = verdict === "GO";
  const reason = canDispatch
    ? `slot livre (${running}/${maxDynamic ?? "sem teto conhecido"} — teto dinâmico) + sistema ok + orçamento ok`
    : [...blockReasons, ...throttleReasons].join("; ");

  return {
    system: { load1m: load, memAvailableGb, diskFreeGb, failedUnits, swapUsedPct, iowaitSomeAvg60: iowait?.someAvg60 ?? null, iowaitFullAvg60: iowait?.fullAvg60 ?? null },
    missions,
    budget,
    capacity: { type, running, max: maxDynamic, canDispatch, reason, safetyCap: maxParallel, factors: dyn.factors, limiting: dyn.limiting },
    verdict,
    blockReasons,
    throttleReasons,
    degraded,
    breaker: breakerState,
  };
}

// ORCH-BREAKER-01: leitura leve do estado do breaker para exposição no plan/list.
// Local para evitar ciclo orchestrate.ts → orchestrateBreaker.ts. Estado ausente,
// corrompido ou nunca rodado (stage 0 + sem pausas + sem updatedAt) → null.
function readBreakerStateLite(d: ReturnType<typeof resolveDeps>): { stage: number; paused: string[]; since: string | null } | null {
  try {
    const raw = d.readText!(d.breakerStatePath!);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as { stage?: unknown; paused?: unknown; since?: unknown; updatedAt?: unknown };
    const stage = parsed.stage === 1 || parsed.stage === 2 ? parsed.stage : 0;
    const paused = Array.isArray(parsed.paused)
      ? parsed.paused.filter((p): p is string => p != null && typeof p === "object" && typeof (p as { missionId?: unknown }).missionId === "string")
        .map((p) => (p as { missionId: string }).missionId)
      : [];
    const since = typeof parsed.since === "string" ? parsed.since : null;
    if (stage === 0 && paused.length === 0 && parsed.updatedAt == null) return null;
    return { stage, paused, since };
  } catch {
    return null;
  }
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
  // ORCH-TOOLS-01: payload de tool_call exige tool (string não-vazia) — fail-closed
  // na entrada, antes de a intent malformada chegar ao consume.
  if (input.type === "tool_call") {
    const t = (input.payload ?? {}) as Record<string, unknown>;
    if (typeof t.tool !== "string" || t.tool.trim().length === 0) {
      throw new Error("ORCHESTRATE_ENQUEUE_INVALID_TOOL_CALL: payload.tool é obrigatório (string não-vazia)");
    }
  }
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
  sessionSource: string | null;
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

// ---- ORCH-SPEND-SESSIONID-01: fallback de atribuição de sessão por conteúdo ----
// O ledger nem sempre tem resumeSessionId (own_session_id pode não cravar a sessão no
// dispatch — caso real ORCH-TOOLS-01) e o jsonl apontado pode não existir (caso
// ORCH-TELEMETRY-01). O transcript PRÓPRIO da missão começa com o prompt entregue no
// dispatch ("leia <promptFile> e execute"), então o basename do promptFile — e, sempre
// que ocorrer, o próprio missionId — aparece na região ANTES da primeira linha
// assistant. Menção TARDIA (depois do 1º assistant) NÃO atribui: é outra sessão
// (ex.: o chat da própria eng-mcp) apenas comentando a missão. Novo por mtime, com
// prioridade ao match por promptFile (único da missão) sobre o por missionId.
const FALLBACK_MAX_FILES = 30;
const FALLBACK_PREFIX_BYTES = 65536;

// Cache do sinal por (arquivo, mtime, missão): orchestrateList re-scanearia os mesmos
// transcripts a cada chamada; mtime na chave invalida sozinho quando o jsonl cresce.
const fallbackSignalCache = new Map<string, { prompt: boolean; mission: boolean }>();

export interface TranscriptFallbackMatch {
  path: string;
  sessionId: string;
  matchedBy: "prompt-file" | "mission-id";
}

function readTranscriptPrefix(filePath: string, bytes: number): string {
  let fd: number | null = null;
  try {
    fd = openSync(filePath, "r");
    const buf = Buffer.alloc(bytes);
    const read = readSync(fd, buf, 0, bytes, 0);
    return buf.toString("utf8", 0, read);
  } catch {
    return "";
  } finally {
    if (fd != null) { try { closeSync(fd); } catch { /* ignore */ } }
  }
}

function transcriptSignalInPrefix(
  prefix: string,
  promptBase: string | null,
  missionId: string,
): { prompt: boolean; mission: boolean } {
  const res = { prompt: false, mission: false };
  for (const line of prefix.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let obj: { type?: string; message?: { content?: unknown } } | null = null;
    try { obj = JSON.parse(trimmed) as { type?: string; message?: { content?: unknown } }; } catch { obj = null; }
    if (obj?.type === "assistant") return res; // região pré-assistant terminou
    if (obj?.type !== "user") continue;
    const content = obj.message?.content;
    const text = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((c) => (c && typeof c === "object" && "text" in (c as Record<string, unknown>))
          ? String((c as { text: unknown }).text)
          : "").join("\n")
        : "";
    if (promptBase && text.includes(promptBase)) res.prompt = true;
    if (text.includes(missionId)) res.mission = true;
  }
  return res;
}

function findTranscriptByMissionContent(
  claudeConfigDir: string,
  missionId: string,
  cwd: string | null,
  promptFile: string | null,
): TranscriptFallbackMatch | null {
  if (!missionId || !existsSync(claudeConfigDir)) return null;
  const promptBase = promptFile ? path.basename(promptFile) : null;
  let projectDirs: string[];
  try {
    const all = readdirSync(claudeConfigDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    // O projeto do cwd da missão vem primeiro (transcripts de outras raízes são ruído).
    const slug = cwd ? cwd.replace(/\//g, "-") : null;
    projectDirs = slug && all.includes(slug) ? [slug, ...all.filter((p) => p !== slug)] : all;
  } catch {
    return null;
  }
  let missionWinner: TranscriptFallbackMatch | null = null;
  for (const project of projectDirs) {
    const dir = path.join(claudeConfigDir, project);
    let files: { file: string; mtimeMs: number }[];
    try {
      files = readdirSync(dir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => {
          try { return { file: f, mtimeMs: statSync(path.join(dir, f)).mtimeMs }; }
          catch { return { file: f, mtimeMs: 0 }; }
        });
    } catch {
      continue;
    }
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (const { file, mtimeMs } of files.slice(0, FALLBACK_MAX_FILES)) {
      const filePath = path.join(dir, file);
      const cacheKey = `${filePath}|${mtimeMs}|${promptBase ?? ""}|${missionId}`;
      let sig = fallbackSignalCache.get(cacheKey);
      if (!sig) {
        const prefix = readTranscriptPrefix(filePath, FALLBACK_PREFIX_BYTES);
        if (!prefix) continue;
        sig = transcriptSignalInPrefix(prefix, promptBase, missionId);
        if (fallbackSignalCache.size > 1024) fallbackSignalCache.clear();
        fallbackSignalCache.set(cacheKey, sig);
      }
      if (sig.prompt && promptBase) {
        // tier 1 do fallback: promptFile é único do dispatch desta missão — vence na hora.
        return { path: filePath, sessionId: file.replace(/\.jsonl$/, ""), matchedBy: "prompt-file" };
      }
      if (sig.mission && !missionWinner) {
        missionWinner = { path: filePath, sessionId: file.replace(/\.jsonl$/, ""), matchedBy: "mission-id" };
      }
    }
    if (missionWinner) break; // projeto do cwd já respondeu; outros dirs só aumentam ruído
  }
  return missionWinner;
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
      const ledger = JSON.parse(raw) as { missionId?: string; resumeSessionId?: string; status?: string; sessionId?: string; cwd?: string; promptFile?: string };
      const sessionId = (ledger.resumeSessionId ?? ledger.sessionId ?? null) || null;

      const spend: SpendMissionResult = {
        missionId, sessionId, model: null,
        tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
        costUsd: null, priceTableUsed: priceTableSource,
        transcriptFound: false, costStateFound: false, messageModelFound: false,
        note: "sem sessionId no ledger", sessionSource: null,
      };

      let transcriptPath = sessionId ? findTranscriptPath(claudeConfigDir, sessionId) : null;
      if (transcriptPath) spend.sessionSource = "ledger-session-id";

      // ORCH-SPEND-SESSIONID-01: sem sessionId no ledger, ou o jsonl dele sumiu — o
      // transcript próprio da missão ainda é achável pelo conteúdo (promptFile/missionId
      // na região pré-assistant, mais novo por mtime). Ledgers .verify são agregados,
      // não sessões: sem fallback.
      if (!transcriptPath && !missionId.endsWith(".verify")) {
        const fb = findTranscriptByMissionContent(claudeConfigDir, missionId, ledger.cwd ?? null, ledger.promptFile ?? null);
        if (fb) { transcriptPath = fb.path; spend.sessionId = fb.sessionId; spend.sessionSource = `fallback-${fb.matchedBy}`; }
      }

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
      } else if (sessionId !== null) {
        // sessionId apontado mas nem direto nem por conteúdo — omissão honesta.
        spend.note = "transcript nao encontrado para sessionId";
      }
      missions.push(spend);
    } catch { /* malformed ledger: skip */ }
  }

  return { missionId: input.missionId ?? null, missions, totalCostUsd, totalTokens, priceTableSource, computedAt: new Date().toISOString() };
}

// ---- ORCH-SPEND-LEDGER-01: custo REAL de UMA missão (mission_close grava no ledger) ----
// Mesmo cálculo do orchestrate.spend (price table + transcripts), exposto por missionId
// para o mission-ops conectar o passo mission_cost ao valor real. Falha é HONESTA:
// costUsd null + reason tipado ("no-session-id" | "no-transcript" | note do cálculo) —
// nunca custo inventado. Zero-LLM, determinístico, fail-open.

export const orchestrateMissionSpendInputSchema = z.object({
  missionId: z.string().min(1),
  priceTablePath: z.string().optional(),
  missionStateDir: z.string().optional(),
  claudeConfigDir: z.string().optional(),
}).strict();

export interface MissionSpendResult {
  missionId: string;
  costUsd: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  source: string | null;
  reason: string | null;
  sessionId: string | null;
  model: string | null;
  sessionSource: string | null;
}

export function runOrchestrateMissionSpend(
  input: { missionId: string; priceTablePath?: string; missionStateDir?: string; claudeConfigDir?: string },
  deps?: OrchestrateDeps,
): MissionSpendResult {
  const d = resolveDeps(deps);
  const missionId = input.missionId;
  const base: MissionSpendResult = { missionId, costUsd: null, tokensIn: null, tokensOut: null, source: null, reason: null, sessionId: null, model: null, sessionSource: null };

  let ledgerRaw: string | null = null;
  try { ledgerRaw = d.readText!(path.join(d.missionStateDir!, `${missionId}.json`)); } catch { ledgerRaw = null; }
  if (ledgerRaw == null) return { ...base, reason: "no-ledger" };

  let sessionId: string | null = null;
  let ledgerCwd: string | null = null;
  let ledgerPromptFile: string | null = null;
  try {
    const ledger = JSON.parse(ledgerRaw) as { missionId?: string; resumeSessionId?: string; sessionId?: string; cwd?: string; promptFile?: string };
    if (ledger.missionId && ledger.missionId !== missionId) return { ...base, reason: "ledger-mission-mismatch" };
    sessionId = (ledger.resumeSessionId ?? ledger.sessionId ?? null) || null;
    ledgerCwd = typeof ledger.cwd === "string" ? ledger.cwd : null;
    ledgerPromptFile = typeof ledger.promptFile === "string" ? ledger.promptFile : null;
  } catch {
    return { ...base, reason: "ledger-unparseable" };
  }

  // ORCH-SPEND-SESSIONID-01: direto pelo resumeSessionId/sessionId; sem jsonl (ou sem
  // sessionId no ledger), fallback por conteúdo — promptFile do dispatch e, como piso,
  // missionId na região pré-assistant do transcript, mais novo por mtime.
  let transcriptPath = sessionId ? findTranscriptPath(d.claudeConfigDir!, sessionId) : null;
  let sessionSource: string | null = transcriptPath ? "ledger-session-id" : null;
  if (!transcriptPath) {
    const fb = findTranscriptByMissionContent(d.claudeConfigDir!, missionId, ledgerCwd, ledgerPromptFile);
    if (fb) { transcriptPath = fb.path; sessionId = fb.sessionId; sessionSource = `fallback-${fb.matchedBy}`; }
  }
  if (!transcriptPath) return { ...base, reason: sessionId ? "no-transcript" : "no-session-id", sessionId };

  try {
    const priceTableRaw = readPriceTable(d);
    const usage = readTranscriptUsage(transcriptPath, priceTableRaw.models ?? {});
    const tokensIn = usage.tokens.inputTokens;
    const tokensOut = usage.tokens.outputTokens;
    if (usage.costUsd != null) {
      const srcBase = sessionSource === "ledger-session-id" ? "transcript" : sessionSource;
      const source = priceTableRaw.models
        ? `orchestrate.spend:${srcBase}+price-table`
        : `orchestrate.spend:${srcBase}-cost-state`;
      return { missionId, costUsd: usage.costUsd, tokensIn, tokensOut, source, reason: null, sessionId, model: usage.model, sessionSource };
    }
    // Transcript lido, custo impossível: tokens medidos valem, custo null com motivo.
    return { missionId, costUsd: null, tokensIn, tokensOut, source: null, reason: usage.note ?? "cost-unavailable", sessionId, model: usage.model, sessionSource };
  } catch (error) {
    return { ...base, reason: `spend-error: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300), sessionId, sessionSource };
  }
}

// Update orchestrateList to include spend aggregates per mission + consumer state
// + roles enrichment per mission (ORCH-ROLE-BADGE-01): reads each mission's
// ledger at missionStateDir and attaches the roles block (worker/advisor/supervisor/judge).
export function orchestrateList(deps?: OrchestrateDeps): { count: number; entries: QueueEntry[]; spend: SpendResult; consumer: OrchestratorConsumerState; breaker: { stage: number; paused: string[]; since: string | null } | null } {
  const d = resolveDeps(deps);
  const raw = d.readText!(d.queuePath!);
  const entries = parseQueue(raw);
  const spend = runOrchestrateSpend({}, deps);
  const consumer = readConsumerState(d);
  const breaker = readBreakerStateLite(d); // ORCH-BREAKER-01: estado consultável no list
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
  return { count: enriched.length, entries: enriched, spend, consumer, breaker };
}