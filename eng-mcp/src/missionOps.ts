// ENG-MCP-MISSION-01/02 (29/09): tools mission-* como wrappers determinísticos
// sobre os handlers PUROS do plugin mission-ops (fonte única de verdade — o
// eng-mcp NÃO duplica lógica; chama python e recebe JSON).
// Andar 1 (regex/IO) para tudo; JEV (250ms, /alpha/decisions) só no gate do close.
import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod/v4";
import { runOrchestrateSpend } from "./orchestrate.ts";
import { captureMissionMemoryAuto, type MissionMemoryCaptureResult } from "./missionMemoryCapture.ts";

// RD-EV-03: automatic memory capture (telemetry, fail-open) attached to both
// success branches of runMissionClose — never throws, never fails a close.
function skippedMemoryResult(value: MissionMemoryCaptureResult["value"]): MissionMemoryCaptureResult {
  return { value, deduped: false, projectId: null, memoryId: null, cause: null, gate: null };
}
async function closeMemoryCapture(missionId: string | undefined): Promise<MissionMemoryCaptureResult> {
  if (typeof missionId !== "string" || !missionId) return skippedMemoryResult("skipped:no-mission-id");
  return captureMissionMemoryAuto(missionId);
}

const execFileP = promisify(execFile);
const PLUGIN_DIR = "/root/.hermes/plugins/mission-ops";
// RD-CLOSE-TIMEOUT-01: teto do wrapper para o subprocesso que executa o handler de
// engineering.mission.close (real e dryRun). O close REAL leva 68-139s quando o
// deliver-verify re-executa provas de ~99s — teto de 90s estourava SEM código tipado.
// 300s cobre o pior caso observado com folga; estouro vira GATE_TIMEOUT (ERROR-01,
// retryable) — nunca o genérico ENGINEERING_TOOL_ERROR.
export const MISSION_CLOSE_HANDLER_TIMEOUT_MS = 300_000;

// RD-CLOSE-TIMEOUT-01: execFile com timeout mata o filho com SIGTERM/SIGKILL
// (err.killed=true ou err.signal setado) — distingue o estouro do wrapper de
// qualquer outra falha do spawn (ENOENT, etc., que passam intocadas).
export function isWrapperTimeoutError(error: unknown): boolean {
  const e = error as { killed?: unknown; signal?: unknown } | null;
  if (!e) return false;
  return e.killed === true || /SIGKILL|SIGTERM/.test(String(e.signal ?? ""));
}

export function gateTimeoutError(handler: string, timeoutMs: number, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause ?? "").slice(0, 120);
  return new Error(`GATE_TIMEOUT: handler ${handler} exceeded its ${timeoutMs}ms wrapper budget (${detail}); retry the close — fresh verify-<missionId>.json reuse makes the retry fast`);
}
const JEV_GATE_SCRIPT = "/opt/memoryos/eng-mcp/scripts/jev_gate.py";
const AUDIT_PATH = "/opt/gpu-bridge/audit.jsonl";
const ROLES_CANONICAL_PATH = "/opt/gpu-bridge/roles.json";
const JUDGE_MODEL = "jev-1.13";

export interface MissionRoles {
  readonly worker: string | null;
  readonly advisor: string | null;
  readonly supervisor: string | null;
  readonly judge: string;
}

function readCanonicalWorker(): string | null {
  try {
    const raw = readFileSync(ROLES_CANONICAL_PATH, "utf8");
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as { worker?: string };
    return typeof parsed.worker === "string" ? parsed.worker : null;
  } catch {
    return null;
  }
}

function readWorkerFromTranscript(sessionId: string): string | null {
  if (!sessionId) return null;
  const claudeConfigDir = "/opt/memoryos/eng-mcp/.claude-config/projects";
  let transcriptPath: string | null = null;
  try {
    const projectsDir = readdirSync(claudeConfigDir);
    for (const project of projectsDir) {
      const candidate = join(claudeConfigDir, project, `${sessionId}.jsonl`);
      if (existsSync(candidate)) {
        transcriptPath = candidate;
        break;
      }
    }
  } catch {
    return null;
  }
  if (!transcriptPath) return null;

  try {
    const raw = readFileSync(transcriptPath, "utf8");
    if (raw == null) return null;
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj.type === "assistant" && obj.message && typeof obj.message.model === "string") {
          return obj.message.model;
        }
      } catch {
        // malformed line: skip
      }
    }
  } catch {
    // transcript unreadable
  }
  return null;
}

function readRolesFromAudit(): { advisor: string | null; supervisor: string | null } {
  let raw: string | null = null;
  try {
    raw = readFileSync(AUDIT_PATH, "utf8");
  } catch {
    return { advisor: null, supervisor: null };
  }
  if (raw == null) return { advisor: null, supervisor: null };

  let advisor: string | null = null;
  let supervisor: string | null = null;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj.event === "role_call" && typeof obj.role === "string") {
        if (obj.role === "advisor" && !advisor && typeof obj.model === "string") {
          advisor = obj.model;
        }
        if (obj.role === "supervisor" && !supervisor && typeof obj.model === "string") {
          supervisor = obj.model;
        }
      }
    } catch {
      // malformed line: skip
    }
    if (advisor && supervisor) break;
  }
  return { advisor, supervisor };
}

/**
 * Enriches the mission ledger with a roles block:
 * - worker: from transcript (first assistant message.model), null if not yet available
 * - advisor: from audit.jsonl role_call, null if not found
 * - supervisor: from audit.jsonl role_call, null if not found
 * - judge: fixed "jev-1.13"
 *
 * Also renames the herdr tab to add a suffix when worker diverges from canonical.
 * Deterministic, zero-LLM. Fail-open on all I/O errors.
 */
async function enrichLedgerWithRoles(missionId: string): Promise<void> {
  const ledgerPath = `/root/.hermes/mission-state/${missionId}.json`;
  if (!existsSync(ledgerPath)) return;
  let raw: string;
  try {
    raw = readFileSync(ledgerPath, "utf8");
  } catch {
    return;
  }
  let ledger: Record<string, unknown>;
  try {
    ledger = JSON.parse(raw);
  } catch {
    return;
  }

  const sessionId = (ledger.resumeSessionId ?? ledger.sessionId) as string | null;
  const worker = readWorkerFromTranscript(sessionId ?? "");
  const { advisor, supervisor } = readRolesFromAudit();

  const roles: MissionRoles = {
    worker,
    advisor,
    supervisor,
    judge: JUDGE_MODEL,
  };

  // Only update if roles changed (avoid unnecessary writes)
  const existing = ledger.roles as MissionRoles | undefined;
  if (existing && existing.worker === roles.worker && existing.advisor === roles.advisor
      && existing.supervisor === roles.supervisor && existing.judge === roles.judge) {
    return;
  }

  ledger.roles = roles;

  // Rename herdr tab if worker diverges from canonical
  const tabId = ledger.tabId as string | undefined;
  const canonicalWorker = readCanonicalWorker();
  if (tabId && worker && canonicalWorker && worker !== canonicalWorker) {
    const newLabel = `MISSION:${missionId} [worker=${worker.split("/").pop() ?? worker}!]`;
    try {
      const herdrBin = (await import("node:child_process")).execFileSync;
      const herdrList = "H=$(ls /usr/local/bin/herdr* 2>/dev/null | head -1); $H";
      herdrBin("bash", ["-lc", `${herdrList} tab rename ${tabId} "${newLabel}"`], { timeout: 10_000 });
    } catch {
      // herdr unavailable or rename failed — non-critical
    }
  }

  try {
    const tmpPath = `${ledgerPath}.tmp-${Date.now()}`;
    writeFileSync(tmpPath, JSON.stringify(ledger, null, 2), "utf8");
    const { renameSync } = await import("node:fs");
    renameSync(tmpPath, ledgerPath);
  } catch {
    // fail-open: never block dispatch for roles enrichment
  }
}

export async function callHandler(handler: string, args: Record<string, unknown>, timeoutMs = 300_000, childEnv?: Record<string, string>): Promise<Record<string, unknown>> {
  // ENG-MCP-VERIFY-PYFIX-03: sem o plugin montado (ex.: container hermético do release
  // gate) o execFile com cwd inexistente estoura "spawn python3 ENOENT" — erro enganoso
  // (python3 existe na imagem). Recusa honesta e determinística, sem inventar estado.
  if (!existsSync(`${PLUGIN_DIR}/__init__.py`)) {
    return { ok: false, error: "MISSION_OPS_UNAVAILABLE", pluginDir: PLUGIN_DIR, handler };
  }
  const code = `
import sys, json, importlib.util, time
spec = importlib.util.spec_from_file_location("mission_ops", "${PLUGIN_DIR}/__init__.py", submodule_search_locations=["${PLUGIN_DIR}"])
PKG = importlib.util.module_from_spec(spec); sys.modules["mission_ops"] = PKG
spec.loader.exec_module(PKG)
fn = getattr(PKG, "${handler}")
t0 = time.time()
raw = fn(json.loads(sys.argv[1]))
print(json.dumps({"_latency_ms": int((time.time()-t0)*1000), "result": json.loads(raw)}))
`;
  let stdout: string;
  try {
    ({ stdout } = await execFileP("python3", ["-c", code, JSON.stringify(args)], {
      timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, cwd: PLUGIN_DIR,
      // GUARD-SUPERVISOR-READONLY-01: identidade do chamador HTTP autenticada
      // server-side e repassada ao plugin VIA ENV (nunca lida do payload).
      env: childEnv ? { ...process.env, ...childEnv } : process.env,
    }));
  } catch (e) {
    // RD-CLOSE-TIMEOUT-01: estouro do teto do wrapper vira erro tipado (a mensagem
    // carrega o token GATE_TIMEOUT — o envelope ERROR-01 deriva o código dele),
    // nunca o genérico ENGINEERING_TOOL_ERROR.
    if (isWrapperTimeoutError(e)) throw gateTimeoutError(handler, timeoutMs, e);
    throw e;
  }
  const line = stdout.trim().split("\n").filter(Boolean).pop() || "{}";
  const parsed = JSON.parse(line) as { _latency_ms: number; result: Record<string, unknown> };
  return { ...parsed.result, tool_latency_ms: parsed._latency_ms };
}

// ---- schemas ----
export const missionDispatchInputSchema = z.object({
  missionId: z.string().min(1), promptFile: z.string().min(1),
  cwd: z.string().optional(), consequence: z.boolean().optional(),
  paneTitle: z.string().optional(), engine: z.string().optional(),
  spawnedBy: z.string().default("operator"),
  // ORCH-CHAIN-CWD-01: consume despacha com "payload" — pai da cadeia lido
  // EXCLUSIVAMENTE do spawnedBy declarado; ambiente (pane) nunca decide.
  chainBasis: z.enum(["auto", "payload"]).default("auto"),
  batch: z.array(z.object({
    missionId: z.string(), promptFile: z.string(), cwd: z.string().optional(),
    consequence: z.boolean().optional(), paneTitle: z.string().optional(),
  })).min(2).max(6).optional(),
}).strict();
export const missionStatusInputSchema = z.object({
  missionId: z.string().optional(), fragment: z.string().optional(), all: z.boolean().optional(),
}).strict();
export const missionReadInputSchema = z.object({
  missionId: z.string().optional(), paneId: z.string().optional(),
  lines: z.number().int().optional(),
}).strict();
export const missionWatchInputSchema = z.object({
  missionId: z.string().optional(), timeoutMs: z.number().int().optional(),
}).strict();
export const missionRecoverInputSchema = z.object({
  missionId: z.string().optional(), paneId: z.string().optional(), pattern: z.string().optional(),
  // GUARD-SUPERVISOR-READONLY-01: referência explícita da ordem do operator
  // (missionId do contrato SHIP vigente ou token de ordem) — guard no plugin.
  operatorOrder: z.string().optional(),
}).strict();
// ENG-MCP-TOOLS-FIX-02: resolução missionId XOR paneId XOR fragment (contrato do
// handler): 0 resolvedores = INVALID_MISSION_ID (compatibilidade com callers antigos),
// 2+ = INVALID_INPUT; fragment = substring case-insensitive, ≥2 matches = AMBIGUOUS.
export const missionCloseInputSchema = z.object({
  missionId: z.string().optional(), paneId: z.string().optional(),
  fragment: z.string().optional(),
  acceptUnverified: z.string().optional(),
  cancel: z.boolean().optional(), force: z.boolean().optional(),
  keepPane: z.boolean().optional(), dryRun: z.boolean().optional(),
  expectBadge: z.boolean().optional(), decisionNote: z.string().optional(),
  // GUARD-SUPERVISOR-READONLY-01: ordem do operator para close de supervisor
  // (guard no plugin; fechos de gate/verify interno não são bloqueados).
  operatorOrder: z.string().optional(),
}).strict();
// ENG-MCP-TOOLS-FIX-02: verify read-only (runner zero-LLM) — mesmo resolvedor do close.
export const missionVerifyInputSchema = z.object({
  missionId: z.string().optional(), paneId: z.string().optional(),
  fragment: z.string().optional(), manifest: z.string().optional(),
  timeoutMs: z.number().int().optional(),
  checks: z.array(z.string().min(1)).optional(),
}).strict();
export const missionLedgerFixInputSchema = z.object({
  missionId: z.string().min(1), paneId: z.string().optional(), tabId: z.string().optional(),
  // ENG-MCP-GOVERN-FIX-01: correção manual de status do ledger (mesmo enum do handler)
  status: z.enum(["dispatched", "working", "interrupted", "delivered", "cancelled", "closed", "failed", "recover"]).optional(),
}).strict();
// ENG-MCP-MISSION-NUDGE (29/09): intervenção do supervisor — CHECK->SEND->VERIFY
// atômico do plugin (handler puro, zero LLM). Sem gate JEV por desenho: não há
// prova a julgar, só estado mecânico do pane (decisão registrada 29/09).
export const missionNudgeInputSchema = z.object({
  missionId: z.string().min(1), message: z.string().min(1),
  sender: z.string().optional(), force: z.boolean().optional(),
  verifySeconds: z.number().int().min(0).max(600).optional(),
  // GUARD-SUPERVISOR-READONLY-01: nudge de supervisor NUNCA é isento — exige
  // operatorOrder quando o chamador é supervisor (guard no plugin).
  operatorOrder: z.string().optional(),
}).strict();

// ---- DISPATCHER-DUPFIX-01: dispatch fecha TODA aba órfã da MESMA missão.
// Antes (GHOST-CLEAN-01) rodava ANTES do dispatch com igualdade exata de label e
// sem mapeamento tab↔pane — abas órfãs de ledger cancelled/done/start_timeout
// sobreviviam. Agora roda DEPOIS do dispatch: fecha toda aba cujo label CONTÉM
// "MISSION:<id>" e cujo pane NÃO é o recém-criado (independente do status do
// ledger — a aba antiga é órfã por definição quando a missão é re-despachada).
const HERDR_LIST = "H=$(ls /usr/local/bin/herdr* 2>/dev/null | head -1); $H";
type HerdrRunner = (cmd: string) => Promise<string>; // stdout cru do CLI

const defaultRunner: HerdrRunner = (cmd) =>
  execFileP("bash", ["-lc", `${HERDR_LIST} ${cmd}`], { timeout: 15_000 })
    .then((r) => r.stdout);

async function herdrJson(run: HerdrRunner, cmd: string): Promise<Record<string, unknown>> {
  return JSON.parse(await run(cmd)) as Record<string, unknown>;
}

// Ponto de injeção p/ testes (padrão makeBase44CliRunner): runner falso responde
// os comandos herdr sem tocar no herdr real.
export function makeCloseDuplicateTabsRunner(
  responses: Record<string, string>, run?: HerdrRunner,
): { calls: string[]; run: HerdrRunner } {
  const calls: string[] = [];
  return {
    calls,
    run: async (cmd: string) => {
      calls.push(cmd);
      const impl = run ?? (async () => responses[cmd] ?? "{}");
      return impl(cmd);
    },
  };
}

export async function closeDuplicateTabs(
  missionId: string, keepPaneId?: string, runner: HerdrRunner = defaultRunner,
): Promise<string[]> {
  const closed: string[] = [];
  const needle = `MISSION:${missionId}`;
  try {
    const tabs = ((await herdrJson(runner, "tab list")) as { result?: { tabs?: unknown[] } })
      .result?.tabs ?? [];
    // mapear tab↔pane: o tab list não traz pane_id; vem do pane list (p.tab_id).
    let paneByTab = new Map<string, string>();
    try {
      const panes = ((await herdrJson(runner, "pane list")) as { result?: { panes?: unknown[] } })
        .result?.panes ?? [];
      paneByTab = new Map(panes
        .filter((p): p is { pane_id: string; tab_id: string } =>
          typeof (p as { pane_id?: unknown })?.pane_id === "string"
          && typeof (p as { tab_id?: unknown })?.tab_id === "string")
        .map((p) => [p.tab_id, p.pane_id]));
    } catch { /* sem pane list: fecha por label, sem exclusão por pane */ }
    for (const t of tabs as { label?: string; tab_id?: string }[]) {
      if (typeof t.tab_id !== "string" || !(t.label ?? "").includes(needle)) continue;
      const pane = paneByTab.get(t.tab_id);
      if (keepPaneId && (pane === keepPaneId || t.tab_id === keepPaneId)) continue;
      try {
        await runner(`tab close ${t.tab_id}`);
        closed.push(t.tab_id);
      } catch { /* aba pode já ter ido */ }
    }
  } catch { /* herdr indisponível: dispatch decide */ }
  return closed;
}

export async function runMissionDispatch(input: z.infer<typeof missionDispatchInputSchema>) {
  const handler = input.batch ? "handle_mission_batch" : "handle_mission_dispatch";
  const args = input.batch
    ? { missions: [{ missionId: input.missionId, promptFile: input.promptFile,
        cwd: input.cwd, consequence: input.consequence, paneTitle: input.paneTitle,
        spawnedBy: input.spawnedBy }, ...input.batch] }
    : { ...input };
  const result = await callHandler(handler, args);
  // DUPFIX-01: fecha órfãs DEPOIS do dispatch, preservando o pane recém-criado
  // (result.paneId). Antes rodava antes do dispatch — aba órfã de ledger
  // cancelled/done/start_timeout sobrevivia e virava duplicata.
  const zombies = await closeDuplicateTabs(input.missionId,
    typeof result.paneId === "string" ? result.paneId : undefined);
  // ORCH-ROLE-BADGE-01: enriquece ledger com roles (worker/advisor/supervisor/judge)
  await enrichLedgerWithRoles(input.missionId);
  return { ...result, zombiesClosed: zombies };
}

// ENG-MCP-MISSION-01: status = snapshot completo (verdict + auto-correção) do plugin
export async function runMissionStatus(input: z.infer<typeof missionStatusInputSchema>) {
  const result = await callHandler("handle_mission_snapshot", input, 60_000);
  // ORCH-ROLE-BADGE-01: snapshot nao traz roles do ledger — enriquece com o
  // worker real do transcript (fonte verdade, nunca banner/settings).
  const missionId = typeof result.missionId === "string" ? result.missionId
    : (input.missionId ?? "");
  if (missionId) {
    await enrichLedgerWithRoles(missionId);
    const ledgerPath = `/root/.hermes/mission-state/${missionId}.json`;
    if (existsSync(ledgerPath)) {
      try {
        const ledger = JSON.parse(readFileSync(ledgerPath, "utf8")) as Record<string, unknown>;
        if (ledger.roles && !result.roles) {
          result.roles = ledger.roles;
        }
      } catch { /* fail-open */ }
    }
  }
  return result;
}

export async function runMissionRead(input: z.infer<typeof missionReadInputSchema>) {
  return callHandler("handle_mission_read", input, 60_000);
}

export async function runMissionWatch(input: z.infer<typeof missionWatchInputSchema>) {
  return callHandler("handle_mission_watch", input, 660_000);
}

export async function runMissionRecover(input: z.infer<typeof missionRecoverInputSchema>, callerSubject?: string) {
  return callHandler("handle_mission_recover", input, 60_000, guardChildEnv(callerSubject));
}

export async function runMissionLedgerFix(input: z.infer<typeof missionLedgerFixInputSchema>) {
  return callHandler("handle_mission_ledger_fix", input, 30_000);
}

// SNAPSHOT-WRAP-01: snapshot = o mesmo handler handle_mission_snapshot do status
// (dedup deliberado — mesmo verdict + anti-ghost + auto-correção de ledger).
export async function runMissionSnapshot(input: z.infer<typeof missionStatusInputSchema>) {
  return runMissionStatus(input);
}

export async function runMissionNudge(input: z.infer<typeof missionNudgeInputSchema>, callerSubject?: string) {
  const verifyMs = (input.verifySeconds ?? 20) * 1000; // TOOL-FAST-01: 30→20
  return callHandler("handle_mission_nudge", input, verifyMs + 60_000, guardChildEnv(callerSubject));
}

// GUARD-SUPERVISOR-READONLY-01: subject autenticado server-side repassado ao
// plugin via env do processo filho (canal "http" + subject). Sem subject
// conhecido (daemon/breaker do consume) NADA é setado — o plugin resolve o
// canal default (direct) e NUNCA considera supervisor (compat worker/daemon).
function guardChildEnv(callerSubject?: string): Record<string, string> | undefined {
  if (!callerSubject) return undefined;
  return { MISSION_OPS_GUARD_CHANNEL: "http", MISSION_OPS_GUARD_SUBJECT: callerSubject };
}

// ENG-MCP-MISSION-02: close com GATE JEV (fim do fail-open).
// Caminho: 1) close normal. 2) se saiu fail-open (verify estourou 35s) ou reabriu
// verify_required, pergunta ao JEV (8s timeout) se as provas registradas são suficientes;
// SIM → fecha com badge jev-verificado; NÃO → devolve verify_required honesto;
// JEV indisponível → mantém o comportamento atual (fail-open), degraded=true.
// ENG-MCP-TOOLS-FIX-02: recusas determinísticas do handler (BADGE_REQUIRED/
// WORKER_ACTIVE/CANCEL_REASON_REQUIRED/CLOSE_BUSY/... ) NÃO passam pelo gate —
// são estado mecânico, não prova; missionId pode vir resolvido (paneId/fragment).
const DETERMINISTIC_REFUSALS = new Set([
  "BADGE_REQUIRED", "WORKER_ACTIVE", "CANCEL_REASON_REQUIRED", "CLOSE_BUSY",
  "INVALID_INPUT", "INVALID_MISSION_ID", "MISSION_NOT_FOUND", "AMBIGUOUS",
  // GUARD-SUPERVISOR-READONLY-01: recusa determinística do guard de supervisor —
  // nunca passa pelo gate JEV (o gate julga provas, não ordens do operator).
  "SUPERVISOR_ACTION_NEEDS_ORDER",
]);
/**
 * Writes spend telemetry to the mission ledger deterministically (zero-LLM).
 * Fail-open: if spend calculation fails, ledger is not modified.
 * Uses atomic write (tmp + rename) to avoid corruption.
 */
export async function writeMissionSpend(missionId: string): Promise<void> {
  const ledgerPath = `/root/.hermes/mission-state/${missionId}.json`;
  if (!existsSync(ledgerPath)) return;
  let raw: string;
  try { raw = readFileSync(ledgerPath, "utf8"); } catch { return; }
  let ledger: Record<string, unknown>;
  try { ledger = JSON.parse(raw); } catch { return; }

  const spend = runOrchestrateSpend({ missionId });
  const missionSpend = spend.missions[0] ?? null;
  if (!missionSpend) return;

  ledger.spend = {
    tokens: missionSpend.tokens,
    costUsd: missionSpend.costUsd,
    // RD-OPS-03-SPEND-01: forma do contrato no ledger.spend — tokens por categoria +
    // custo estimado + fonte citada (transcript path + sha256-16). Chaves antigas
    // preservadas (compatibilidade com consultas existentes).
    inputTokens: missionSpend.tokens?.inputTokens ?? null,
    outputTokens: missionSpend.tokens?.outputTokens ?? null,
    cacheReadTokens: missionSpend.tokens?.cacheReadTokens ?? null,
    costUsdEstimate: missionSpend.costUsd,
    model: missionSpend.model,
    source: missionSpend.transcriptPath
      ? `transcript ${missionSpend.transcriptPath}` +
        (missionSpend.transcriptSha16 ? ` sha256-16=${missionSpend.transcriptSha16}` : "") +
        (missionSpend.model ? ` model=${missionSpend.model}` : "") +
        (spend.priceTableSource ? ` price-table=${spend.priceTableSource}` : "")
      : null,
    transcriptFound: missionSpend.transcriptFound,
    sessionId: missionSpend.sessionId,
    sessionSource: missionSpend.sessionSource,  // ORCH-SPEND-SESSIONID-01
    computedAt: spend.computedAt,
    note: missionSpend.note,
  };

  try {
    const tmpPath = `${ledgerPath}.tmp-${Date.now()}`;
    writeFileSync(tmpPath, JSON.stringify(ledger, null, 2), "utf8");
    const { renameSync } = await import("node:fs");
    renameSync(tmpPath, ledgerPath);
  } catch {
    // fail-open: never block close for spend telemetry
  }
}

export async function runMissionClose(input: z.infer<typeof missionCloseInputSchema>, callerSubject?: string) {
  const guardEnv = guardChildEnv(callerSubject);
  const first = await callHandler("handle_mission_close", input, MISSION_CLOSE_HANDLER_TIMEOUT_MS, guardEnv);
  const stepsJson = JSON.stringify(first.steps ?? []);
  const isDeterministicRefusal = first.ok === false
    && typeof first.error === "string" && DETERMINISTIC_REFUSALS.has(first.error);
  const needsGate = !isDeterministicRefusal && (first.ok === false
    || stepsJson.includes("fail-open") || stepsJson.includes("reopenedByDeliverVerify"));
  if (!needsGate) {
    // Write spend telemetry on close (deterministic, zero-LLM, fail-open)
    if (typeof first.missionId === "string") await writeMissionSpend(first.missionId);
    // RD-EV-03: capture automático de memória (fail-open, idempotente) — depois
    // do spend, nunca falha o close. Só o ponto de capture (restrição do contrato).
    const mem = await closeMemoryCapture(first.missionId);
    return { ...first, jevGate: "not-needed", memoryCaptured: mem.value, memoryCapturedDetail: mem };
  }

  const resolvedId = typeof first.missionId === "string" && first.missionId
    ? first.missionId : (input.missionId ?? "");
  const acceptReason = input.acceptUnverified ?? input.decisionNote ?? "";
  let jev: { verdict?: string; motivo?: string; latency_ms?: number; degraded?: boolean } = {};
  try {
    const { stdout } = await execFileP("python3", [JEV_GATE_SCRIPT, resolvedId,
      JSON.stringify({ acceptReason, first: JSON.stringify(first).slice(0, 2000) })],
      { timeout: 8_000, maxBuffer: 1024 * 1024 });
    jev = JSON.parse(stdout.trim().split("\n").pop() || "{}");
  } catch (e) {
    return { ...first, jevGate: "degraded", jevError: String(e).slice(0, 200) };
  }
  if (jev.verdict === "SIM") {
    const second = await callHandler("handle_mission_close", {
      ...input,
      missionId: resolvedId,
      acceptUnverified: `jev-gate-verified: ${jev.motivo ?? "provas suficientes"}`,
    }, MISSION_CLOSE_HANDLER_TIMEOUT_MS, guardEnv);
    // Write spend telemetry on JEV-verified close (deterministic, zero-LLM, fail-open)
    await writeMissionSpend(resolvedId);
    // RD-EV-03: capture automático na 2ª branch de sucesso (JEV-verificado).
    const mem2 = await closeMemoryCapture(resolvedId);
    return { ...second, jevGate: "jev-verificado", jevLatency_ms: jev.latency_ms, memoryCaptured: mem2.value, memoryCapturedDetail: mem2 };
  }
  return { ...first, jevGate: "verify_required", jevMotivo: jev.motivo, jevLatency_ms: jev.latency_ms };
}

// ENG-MCP-TOOLS-FIX-02: verify read-only (40s budget — runner 35s + margem).
export async function runMissionVerify(input: z.infer<typeof missionVerifyInputSchema>) {
  return callHandler("handle_mission_verify", input, 40_000);
}
