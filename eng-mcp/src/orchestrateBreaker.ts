// ORCH-BREAKER-01: breaker global de pressão (zero-LLM) — fim da queda por thrash.
// Incidente 03/10 16:29: 6 workers + supervisor + advisor → load 113 em 8 cores,
// swap 8GB 100% → thrash de I/O → herdr-server travou → gateway morreu sem exit.
// O orquestrador viu (throttou em load 113 > 4) mas NADA pausou workers em voo.
//
// Máquina de estados determinística (por tick, uma amostra):
//   ESTÁGIO 1 (load > 2×cores OU swap > 60%, 3 amostras seguidas): pausa o worker
//     MAIS NOVO em voo (mission_recover pattern=interrupted + nudge de força
//     "PAUSADO") e grava marcador de pausa no ledger (formato pause.paused=true +
//     pausedBy="breaker" — o MESMO que o watchdog já respeita desde WATCHDOG-PAUSE-01,
//     então o re-engate não luta contra o breaker).
//   ESTÁGIO 2 (swap > 90% OU load > 4×cores): pausa os 2 mais novos + alerta.
//   RETOMA (load < 1.5×cores E swap < 30%, 3 amostras seguidas): "FILA LIBERADA —
//     pausa do breaker REVOGADA" + nudge de retomada cuja primeira ação concreta é a
//     re-leitura do contrato; marcador limpo.
//   Nunca pausa: needs_operator, P0 marcado operator-now, classes
//     financeiro/aprovação (doutrina: nunca interceptáveis). Reentrante: quem já tem
//     pausedBy=breaker não é re-pausado. Sem dados de pressão → fail-closed (nenhuma
//     ação — nunca pausar sem prova). Breaker nunca despacha, nunca fecha missão.
//
// Integração: 1 tick por ciclo do daemon de consume (preferido pelo contrato —
// "integrado ao ciclo existente"); runBreakerTick é puro/injetável e também roda
// standalone (src/orchestrateBreakerRun.mjs) para timer dedicado (~15s) se o ciclo
// ficar lento — ativação é decisão de deploy do operator, não desta missão.
// Detecção de herdr irresponsável: pane list com timeout → evento herdr_unresponsive
// com contagem; ≥3 ciclos seguidos → notify.hermes. SOMENTE detecção — reinício de
// herdr-server é decisão do operator (governança da missão).
import os from "node:os";
import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync, appendFileSync, mkdirSync } from "node:fs";
import { parseFrontmatterClass, type OrchestrateDeps } from "./orchestrate.ts";

export const BREAKER_THRESHOLDS = {
  stage1LoadFactor: 2,
  stage1SwapPct: 60,
  stage2LoadFactor: 4,
  stage2SwapPct: 90,
  resumeLoadFactor: 1.5,
  resumeSwapPct: 30,
  samplesToAct: 3,
  // gate do plan (§2): swap > 50% OU iowait sustentado ⇒ slots de mission = 0
  planSwapPct: 50,
  planIowaitFullAvg60: 10,
  planIowaitSomeAvg60: 30,
} as const;

export const PAUSADO_MESSAGE = "PAUSADO — breaker de pressão: NÃO rode NADA, nem sleep; termine o turno com PAUSADO";
export const RESUMO_MESSAGE_PREFIX = "FILA LIBERADA — pausa do breaker REVOGADA. Primeira ação: releia o contrato";

export const DEFAULT_BREAKER_STATE_PATH = "/opt/mission-events/orchestrator-breaker.state.json";
export const DEFAULT_PSI_IO_PATH = "/proc/pressure/io";

// Classes de missão que o breaker NUNCA intercepta (doutrina: financeiro/aprovação
// são camadas de consequência — pausá-las pode deixar estado externo pela metade).
export const PROTECTED_CLASSES = new Set(["financeiro", "financial", "aprovacao", "aprovação", "approval"]);

export interface PressureSample {
  load1: number | null;
  cores: number;
  swapUsedPct: number | null;
  psiSomeAvg60: number | null;
  psiFullAvg60: number | null;
}

export type BreakerStage = 0 | 1 | 2;

export interface BreakerPauseRecord {
  missionId: string;
  since: string;
  stage: 1 | 2;
}

export interface BreakerState {
  stage: BreakerStage;
  paused: BreakerPauseRecord[];
  since: string | null;
  streaks: { high: number; critical: number; low: number };
  herdrUnresponsiveStreak: number;
  herdrAlerted: boolean;
  alertedStage1: boolean;
  updatedAt: string | null;
}

export interface BreakerMissionHooks {
  /** Pausa 1 worker: mission_recover(pattern=interrupted) + nudge de força. */
  pauseMission?(m: { missionId: string; paneId?: string; stage: number }): Promise<{ ok: boolean; error?: string }>;
  /** Retoma 1 worker pausado: nudge "FILA LIBERADA" + re-leitura do contrato. */
  resumeMission?(m: { missionId: string; paneId?: string }): Promise<{ ok: boolean; error?: string }>;
  /** engineering.notify.hermes (pt-BR, 1 linha) — best-effort, nunca trava o tick. */
  notify?(summary: string, status?: "complete" | "partial" | "failed" | "blocked"): Promise<{ delivered: boolean }>;
  /** Probe do herdr: stdout de `pane list` ou null em timeout/erro (fail-open). */
  probePaneList?(): string | null;
}

export interface BreakerDeps extends OrchestrateDeps, BreakerMissionHooks {
  psiPath?: string;
  breakerStatePath?: string;
  /** Núcleos lógicos (default os.availableParallelism()); injetável nos testes. */
  cores?: number;
}

const envPath = (name: string): string | undefined => {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
};

// Defaults de produção (fail-open): sem deps injetadas o tick lê o fs real — os
// hooks de ação (pause/resume/notify/probe) continuam sendo passados pelo caller.
const defaultReadText = (path: string): string | null => {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};
const defaultReaddir = (path: string): string[] | null => {
  try { return readdirSync(path); } catch { return null; }
};

export function emptyBreakerState(): BreakerState {
  return {
    stage: 0,
    paused: [],
    since: null,
    streaks: { high: 0, critical: 0, low: 0 },
    herdrUnresponsiveStreak: 0,
    herdrAlerted: false,
    alertedStage1: false,
    updatedAt: null,
  };
}

export function readBreakerState(d: BreakerDeps): BreakerState {
  const path = d.breakerStatePath ?? envPath("ENG_MCP_BREAKER_STATE_PATH") ?? DEFAULT_BREAKER_STATE_PATH;
  const raw = d.readText ? d.readText(path) : null;
  if (raw == null) return emptyBreakerState();
  try {
    const parsed = JSON.parse(raw) as Partial<BreakerState>;
    if (!parsed || typeof parsed !== "object") return emptyBreakerState();
    const state: BreakerState = { ...emptyBreakerState(), ...parsed };
    state.streaks = { ...emptyBreakerState().streaks, ...(parsed.streaks ?? {}) };
    state.paused = Array.isArray(parsed.paused) ? parsed.paused.filter((p): p is BreakerPauseRecord =>
      p && typeof p === "object" && typeof (p as BreakerPauseRecord).missionId === "string") : [];
    state.stage = parsed.stage === 1 || parsed.stage === 2 ? parsed.stage : 0;
    return state;
  } catch {
    return emptyBreakerState(); // estado corrompido = sem pausas conhecidas (fail-open, re-pausa é reentrante)
  }
}

function writeBreakerState(d: BreakerDeps, state: BreakerState): void {
  const path = d.breakerStatePath ?? envPath("ENG_MCP_BREAKER_STATE_PATH") ?? DEFAULT_BREAKER_STATE_PATH;
  state.updatedAt = new Date(d.now!()).toISOString();
  const payload = JSON.stringify(state, null, 2);
  try {
    if (d.writeText) {
      d.writeText(path, payload);
      return;
    }
    try { mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true }); } catch { /* dir pode já existir */ }
    const tmp = `${path}.tmp-${process.pid}`;
    writeFileSync(tmp, payload, "utf8");
    renameSync(tmp, path);
  } catch { /* fail-open: estado perdido → breaker reavalia do zero na próxima amostra */ }
}

function spoolEvent(d: BreakerDeps, kind: string, missionId: string, msg: string): void {
  const line = JSON.stringify({ ts: new Date(d.now!()).toISOString(), event: kind, missionId, msg: msg.slice(0, 200), source: "orchestrate-breaker" });
  try {
    if (d.appendFile) d.appendFile(d.spoolPath!, line + "\n");
    else {
      try { mkdirSync(d.spoolPath!.replace(/\/[^/]+$/, ""), { recursive: true }); } catch { /* dir pode já existir */ }
      appendFileSync(d.spoolPath!, line + "\n", "utf8");
    }
  } catch { /* fail-open */ }
}

// ---- amostragem (todas as sondas fail-open → null; nunca inventar valor) ----

export function readPressureSample(d: BreakerDeps): PressureSample {
  const cores = d.cores ?? os.availableParallelism();
  let load1: number | null = null;
  const loadavgRaw = d.readText!(d.loadavgPath ?? "/proc/loadavg");
  if (loadavgRaw != null) {
    const v = Number(loadavgRaw.trim().split(/\s+/)[0]);
    if (Number.isFinite(v)) load1 = v;
  }
  let swapUsedPct: number | null = null;
  const memRaw = d.readText!(d.meminfoPath ?? "/proc/meminfo");
  if (memRaw != null) {
    const total = readMeminfoKb(memRaw, "SwapTotal");
    const free = readMeminfoKb(memRaw, "SwapFree");
    if (total != null && total > 0 && free != null) swapUsedPct = ((total - free) / total) * 100;
  }
  let psiSomeAvg60: number | null = null;
  let psiFullAvg60: number | null = null;
  const psiRaw = d.readText!(d.psiPath ?? envPath("ENG_MCP_PSI_IO_PATH") ?? DEFAULT_PSI_IO_PATH);
  if (psiRaw != null) {
    for (const line of psiRaw.split("\n")) {
      const m = line.match(/^(some|full)\s+avg10=\S+\s+avg60=([\d.]+)/);
      if (m) {
        const v = Number(m[2]);
        if (Number.isFinite(v)) {
          if (m[1] === "some") psiSomeAvg60 = v;
          else psiFullAvg60 = v;
        }
      }
    }
  }
  return { load1, cores, swapUsedPct, psiSomeAvg60, psiFullAvg60 };
}

function readMeminfoKb(raw: string, key: string): number | null {
  const line = raw.split("\n").find((l) => l.startsWith(`${key}:`));
  if (!line) return null;
  const kb = Number(line.trim().split(/\s+/)[1]);
  return Number.isFinite(kb) ? kb : null;
}

/** Gate do plan (§2): swap > 50% OU iowait sustentado. null swap = sem swap configurado (não gatilha). */
export function iowaitSustained(sample: PressureSample): boolean {
  const t = BREAKER_THRESHOLDS;
  return (sample.psiFullAvg60 != null && sample.psiFullAvg60 >= t.planIowaitFullAvg60)
    || (sample.psiSomeAvg60 != null && sample.psiSomeAvg60 >= t.planIowaitSomeAvg60);
}

// ---- filtro de não-interceptação (doutrina) ----

/**
 * Verdadeiro para missões que o breaker NUNCA pausa:
 * needs_operator, P0 marcada operator-now, classes financeiro/aprovação.
 * Determinístico e exportado — o teste de não-interceptação assera este filtro.
 */
export function isProtectedMission(ledger: Record<string, unknown>, missionClass: string | null): { protected: boolean; reason: string | null } {
  if (ledger.needsOperator === true || ledger.needs_operator === true) return { protected: true, reason: "needs_operator" };
  const priority = ledger.priority;
  const operatorNow = ledger.operatorNow === true || ledger.operatorNow === "true" || ledger["operator-now"] === true || ledger["operator-now"] === "true";
  if (priority === 1 && operatorNow) return { protected: true, reason: "P0 operator-now" };
  if (missionClass != null && PROTECTED_CLASSES.has(String(missionClass).toLowerCase())) {
    return { protected: true, reason: `classe ${missionClass} (financeiro/aprovação)` };
  }
  return { protected: false, reason: null };
}

/** Classe da missão: ledger.missionClass/class, senão frontmatter do promptFile (mesmo parser do consume). */
function missionClassOf(d: BreakerDeps, ledger: Record<string, unknown>): string | null {
  const direct = ledger.missionClass ?? ledger.class;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const promptFile = ledger.promptFile;
  if (typeof promptFile === "string" && promptFile.length > 0) {
    try {
      const raw = d.readText!(promptFile);
      return parseFrontmatterClass(raw);
    } catch { return null; }
  }
  return null;
}

interface InFlightMission {
  missionId: string;
  paneId: string | null;
  recency: number; // maior = mais novo
}

/** Missões em voo (dispatched/working), MAIS NOVO primeiro. Fail-open: ilegível sai da lista. */
function listInFlightMissions(d: BreakerDeps): InFlightMission[] {
  const dir = d.missionStateDir ?? "/root/.hermes/mission-state";
  let files: string[] | null = null;
  try {
    files = d.readdir ? d.readdir(dir) : readdirSync(dir);
  } catch { return []; }
  if (files == null) return [];
  const inFlight: InFlightMission[] = [];
  for (const file of files) {
    if (!file.endsWith(".json") || file.endsWith(".verify.json")) continue;
    try {
      const raw = d.readText!(`${dir}/${file}`);
      if (raw == null) continue;
      const ledger = JSON.parse(raw) as Record<string, unknown>;
      const status = ledger.status;
      if (status !== "dispatched" && status !== "working") continue;
      const missionId = typeof ledger.missionId === "string" ? ledger.missionId : file.replace(/\.json$/, "");
      const recency = Date.parse(String(ledger.workingAt ?? ledger.dispatchedAt ?? ledger.updatedAt ?? ledger.createdAt ?? "")) || 0;
      inFlight.push({ missionId, paneId: typeof ledger.paneId === "string" ? ledger.paneId : null, recency });
    } catch { /* ledger malformado: skip */ }
  }
  inFlight.sort((a, b) => b.recency - a.recency);
  return inFlight;
}

// ---- marcador de pausa no ledger (formato WATCHDOG-PAUSE-01 + pausedBy) ----

function readLedger(d: BreakerDeps, missionId: string): { path: string; ledger: Record<string, unknown> } | null {
  const path = `${d.missionStateDir ?? "/root/.hermes/mission-state"}/${missionId}.json`;
  try {
    const raw = d.readText!(path);
    if (raw == null) return null;
    const ledger = JSON.parse(raw) as Record<string, unknown>;
    if (!ledger || typeof ledger !== "object") return null;
    return { path, ledger };
  } catch { return null; }
}

function writeLedger(d: BreakerDeps, path: string, ledger: Record<string, unknown>): boolean {
  const payload = JSON.stringify(ledger, null, 2);
  try {
    if (d.writeText) {
      d.writeText(path, payload);
      return true;
    }
    const tmp = `${path}.tmp-${process.pid}`;
    writeFileSync(tmp, payload, "utf8");
    renameSync(tmp, path);
    return true;
  } catch { return false; }
}

function markPaused(d: BreakerDeps, missionId: string, stage: 1 | 2): boolean {
  const entry = readLedger(d, missionId);
  if (!entry) return false;
  entry.ledger.pause = { paused: true, by: "breaker", pausedBy: "breaker", stage, at: new Date(d.now!()).toISOString() };
  entry.ledger.pausedBy = "breaker";
  return writeLedger(d, entry.path, entry.ledger);
}

function clearPauseMarker(d: BreakerDeps, missionId: string): boolean {
  const entry = readLedger(d, missionId);
  if (!entry) return false;
  delete entry.ledger.pause;
  delete entry.ledger.pausedBy;
  return writeLedger(d, entry.path, entry.ledger);
}

// ---- tick ----

export interface BreakerTickResult {
  sampled: boolean;
  sample: PressureSample | null;
  stage: BreakerStage;
  /** ids pausados NESTE tick (reentrância: quem já estava pausado não reaparece). */
  paused: string[];
  resumed: string[];
  skippedProtected: { missionId: string; reason: string }[];
  breaker: { stage: BreakerStage; paused: string[]; since: string | null } | null;
  herdr: { unresponsive: boolean; streak: number; alerted: boolean } | null;
  actions: string[];
  note: string | null;
}

/**
 * Um tick do breaker = uma amostra + decisões determinísticas. Pureza: toda a I/O
 * (leituras, ledgers, spool, hooks) entra por deps injetadas; produção usa o fs real
 * e os hooks de mission-ops/notify.wiring em tools.ts/orchestrateConsumeDaemon.mjs.
 */
export async function runBreakerTick(_input: Record<string, never> | undefined, deps?: BreakerDeps): Promise<BreakerTickResult> {
  const d: BreakerDeps = {
    now: deps?.now ?? (() => Date.now()),
    readText: deps?.readText ?? defaultReadText,
    readdir: deps?.readdir ?? defaultReaddir,
    appendFile: deps?.appendFile,
    writeText: deps?.writeText,
    existsSync: deps?.existsSync,
    loadavgPath: deps?.loadavgPath,
    meminfoPath: deps?.meminfoPath,
    missionStateDir: deps?.missionStateDir,
    spoolPath: deps?.spoolPath ?? envPath("ENG_MCP_SPOOL_PATH") ?? "/opt/mission-events/spool.jsonl",
    psiPath: deps?.psiPath,
    breakerStatePath: deps?.breakerStatePath,
    cores: deps?.cores,
    pauseMission: deps?.pauseMission,
    resumeMission: deps?.resumeMission,
    notify: deps?.notify,
    probePaneList: deps?.probePaneList,
  };
  const t = BREAKER_THRESHOLDS;
  const actions: string[] = [];
  const skippedProtected: { missionId: string; reason: string }[] = [];
  const pausedNow: string[] = [];
  const resumedNow: string[] = [];
  const state = readBreakerState(d);
  const result: BreakerTickResult = { sampled: false, sample: null, stage: state.stage, paused: pausedNow, resumed: resumedNow, skippedProtected, breaker: null, herdr: null, actions, note: null };

  // (0) herdr irresponsável — detecção apenas, nunca reinício (decisão do operator).
  if (d.probePaneList) {
    const out = d.probePaneList();
    const ok = out != null;
    if (!ok) {
      state.herdrUnresponsiveStreak += 1;
      spoolEvent(d, "herdr_unresponsive", "-", `pane list sem resposta (${state.herdrUnresponsiveStreak} ciclos seguidos)`);
      actions.push(`herdr_unresponsive streak=${state.herdrUnresponsiveStreak}`);
      let alerted = false;
      if (state.herdrUnresponsiveStreak >= 3 && !state.herdrAlerted) {
        alerted = true;
        state.herdrAlerted = true;
        const summary = `herdr irresponsável: pane list falha há ${state.herdrUnresponsiveStreak} ciclos seguidos — detecção apenas; reinício do herdr-server é decisão do operator.`;
        spoolEvent(d, "herdr_alert", "-", summary);
        actions.push("herdr_alert notify");
        try { await d.notify?.(summary, "blocked"); } catch { /* fail-open */ }
      }
      result.herdr = { unresponsive: true, streak: state.herdrUnresponsiveStreak, alerted };
    } else {
      if (state.herdrUnresponsiveStreak > 0) actions.push(`herdr recuperado (streak ${state.herdrUnresponsiveStreak} → 0)`);
      state.herdrUnresponsiveStreak = 0;
      state.herdrAlerted = false;
      result.herdr = { unresponsive: false, streak: 0, alerted: false };
    }
  }

  // (1) amostra — sem dados de pressão = fail-closed: nenhuma ação de pausa/retoma.
  const sample = readPressureSample(d);
  result.sample = sample;
  const hasLoad = sample.load1 != null;
  const hasSwap = sample.swapUsedPct != null;
  if (!hasLoad && !hasSwap) {
    result.note = "sem dados de pressão (load e swap ilegíveis) — fail-closed: nenhuma ação";
    actions.push(result.note);
    result.breaker = breakerView(state);
    writeBreakerState(d, state);
    return result;
  }
  result.sampled = true;
  const load = sample.load1 ?? 0;
  // Sem swap configurado (SwapTotal ausente/0) não há pressão de swap: o gatilho de
  // swap é insatisfeito e a condição de swap da RETOMA conta como satisfeita.
  const swap = sample.swapUsedPct;

  const isCritical = (swap != null && swap > t.stage2SwapPct) || (hasLoad && load > t.stage2LoadFactor * sample.cores);
  const isHigh = (swap != null && swap > t.stage1SwapPct) || (hasLoad && load > t.stage1LoadFactor * sample.cores);
  const isLow = (!hasLoad || load < t.resumeLoadFactor * sample.cores) && (swap == null || swap < t.resumeSwapPct);

  if (isCritical) { state.streaks.critical += 1; state.streaks.high += 1; state.streaks.low = 0; }
  else if (isHigh) { state.streaks.high += 1; state.streaks.critical = 0; state.streaks.low = 0; }
  else if (isLow) { state.streaks.low += 1; state.streaks.high = 0; state.streaks.critical = 0; }
  else { state.streaks.high = 0; state.streaks.critical = 0; state.streaks.low = 0; }

  // (2) RETOMA — 3 amostras calmas revogam a pausa (antes de re-avaliar pausa).
  if (state.streaks.low >= t.samplesToAct && state.paused.length > 0) {
    const ids = state.paused.map((p) => p.missionId);
    for (const rec of state.paused) {
      clearPauseMarker(d, rec.missionId);
      try { await d.resumeMission?.({ missionId: rec.missionId }); } catch { /* fail-open */ }
      resumedNow.push(rec.missionId);
      spoolEvent(d, "orch_breaker_resume", rec.missionId, "FILA LIBERADA — pausa do breaker REVOGADA");
    }
    actions.push(`retoma: ${ids.join(", ")}`);
    const summary = `FILA LIBERADA — pausa do breaker REVOGADA (${ids.join(", ")}). Workers retomam pela re-leitura do contrato (primeira ação concreta).`;
    spoolEvent(d, "orch_breaker_resume_all", "-", summary);
    try { await d.notify?.(summary, "complete"); } catch { /* fail-open */ }
    state.paused = [];
    state.stage = 0;
    state.since = null;
    state.streaks = { high: 0, critical: 0, low: 0 };
    result.stage = 0;
    result.breaker = breakerView(state);
    writeBreakerState(d, state);
    return result;
  }

  // (3) ESTÁGIOS — 3 amostras seguidas de pressão pausam os mais novos em voo.
  const triggeredStage: 0 | 1 | 2 =
    state.streaks.critical >= t.samplesToAct ? 2
      : state.streaks.high >= t.samplesToAct ? 1
        : 0;
  if (triggeredStage > 0) {
    const desired = triggeredStage; // estágio 1 → 1 worker; estágio 2 → 2 workers
    const inFlight = listInFlightMissions(d);
    const alreadyPaused = new Set(state.paused.map((p) => p.missionId));
    // Reentrância: quem já tem pausedBy=breaker não é re-pausado; protegidas nunca.
    const candidates: InFlightMission[] = [];
    for (const m of inFlight) {
      if (alreadyPaused.has(m.missionId)) continue;
      if (state.paused.length + candidates.length >= desired) break;
      const ledgerEntry = readLedger(d, m.missionId);
      const ledger = ledgerEntry?.ledger ?? {};
      const existingPause = (ledger.pause as { paused?: unknown } | undefined);
      if (existingPause && existingPause.paused === true) {
        // marcador presente mas fora do estado do breaker (ex.: restart) — trata como pausado
        alreadyPaused.add(m.missionId);
        continue;
      }
      const cls = missionClassOf(d, ledger);
      const prot = isProtectedMission(ledger, cls);
      if (prot.protected) {
        skippedProtected.push({ missionId: m.missionId, reason: prot.reason! });
        spoolEvent(d, "orch_breaker_skip_protected", m.missionId, `não interceptável: ${prot.reason}`);
        continue;
      }
      candidates.push(m);
    }
    for (const m of candidates) {
      const marked = markPaused(d, m.missionId, triggeredStage as 1 | 2);
      let hookOk = true;
      let hookErr: string | undefined;
      try {
        const r = await d.pauseMission?.({ missionId: m.missionId, paneId: m.paneId, stage: triggeredStage });
        if (r && r.ok === false) { hookOk = false; hookErr = r.error; }
      } catch (err) {
        hookOk = false;
        hookErr = err instanceof Error ? err.message : String(err);
      }
      state.paused.push({ missionId: m.missionId, since: new Date(d.now!()).toISOString(), stage: triggeredStage as 1 | 2 });
      pausedNow.push(m.missionId);
      spoolEvent(d, `orch_breaker_stage${triggeredStage}_pause`, m.missionId,
        `pausado pelo breaker (estágio ${triggeredStage}; marcador=${marked ? "ok" : "falhou"}; nudge=${hookOk ? "ok" : `falhou: ${String(hookErr ?? "?").slice(0, 80)}`})`);
      actions.push(`pausado ${m.missionId} (estágio ${triggeredStage})`);
    }
    if (pausedNow.length > 0) {
      const firstStage1 = triggeredStage === 1 && !state.alertedStage1;
      if (triggeredStage === 1) state.alertedStage1 = true;
      if (state.stage === 0 || firstStage1 || triggeredStage === 2) {
        const ids = [...state.paused.map((p) => p.missionId)];
        const summary = triggeredStage === 1
          ? `BREAKER de pressão ESTÁGIO 1: load ${sample.load1?.toFixed(1) ?? "?"} em ${sample.cores} cores / swap ${swap == null ? "s/ swap" : `${swap.toFixed(0)}%`} — pausado o worker mais novo (${pausedNow.join(", ")}) com PAUSADO. Retoma automática quando load < 1.5×cores e swap < 30% por 3 amostras.`
          : `BREAKER de pressão ESTÁGIO 2: swap ${swap == null ? "s/ swap" : `${swap.toFixed(0)}%`} / load ${sample.load1?.toFixed(1) ?? "?"} em ${sample.cores} cores — pausados 2 workers mais novos (${pausedNow.join(", ")}). Avaliação do operator pode ser necessária.`;
        spoolEvent(d, "orch_breaker_alert", "-", summary);
        try { await d.notify?.(summary, "blocked"); } catch { /* fail-open */ }
      }
      if (state.stage === 0) state.since = new Date(d.now!()).toISOString();
      state.stage = Math.max(state.stage, triggeredStage) as BreakerStage;
    }
  }

  result.stage = state.stage;
  result.breaker = breakerView(state);
  writeBreakerState(d, state);
  return result;
}

function breakerView(state: BreakerState): { stage: BreakerStage; paused: string[]; since: string | null } {
  return { stage: state.stage, paused: state.paused.map((p) => p.missionId), since: state.since };
}

/** Estado do breaker para exposição no orchestrate.plan/list (§3: consultável). */
export function breakerStatusForPlan(deps?: OrchestrateDeps & BreakerDeps): { stage: BreakerStage; paused: string[]; since: string | null } | null {
  const state = readBreakerState({ ...(deps ?? {}), now: deps?.now ?? (() => Date.now()) } as BreakerDeps);
  if (state.stage === 0 && state.paused.length === 0 && !state.updatedAt) return null; // nunca rodou: não inventa estado
  return breakerView(state);
}
