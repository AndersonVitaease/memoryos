// ORCH-HYGIENE-01: estado-máquina de higiene do sistema (CLEANUP → MERGE →
// DEPLOY_WINDOW → IDLE) — um ciclo determinístico (zero-LLM) que leva o sistema
// de "sujou" para "limpo e trabalhando", com prova em cada passo.
//
// Estados (um ciclo = as três fases em sequência, trilha em /opt/mission-events/hygiene):
//   CLEANUP: inventário + limpeza segura, cada item com prova —
//     (a) Worktrees: mergeada em main (ancestor) e sem diff não-commitado ⇒ remove
//         worktree + branch (git branch -d, nunca -D); com diff ⇒ registra e PULA
//         (nunca descartar trabalho). Detached limpa ⇒ remove worktree (registro com sha).
//     (b) Containers rollback `memoryos-eng-mcp-rollback-*` Exited(137) com mais de
//         7 dias ⇒ docker rm; os 3 mais recentes ficam SEMPRE (retenção do pipeline).
//     (c) Ledgers órfãos (status dispatched/cancelled, >48h, sem pane e sem aba) ⇒
//         marca `hygiene_orphan` no ledger; NUNCA apaga (trilha é imune).
//     (d) Panes fantasma: REUSA o anti-ghost do mission_snapshot (chamada, não cópia).
//   MERGE: worktrees com entregável commitado e branch AHEAD de main ainda não
//     mergeada ⇒ fila serial (uma por vez; nunca duas em paralelo). Merge é SEMPRE
//     --ff-only (nunca force): divergência ⇒ skip registrado, main intocado.
//   DEPLOY_WINDOW: janela segura de deploy SÓ se 0 missões host em voo E memória
//     disponível sob o teto do plano (fator mem/2.5 ≥ 1, mesmo do plan) E swap < 50%
//     (probe do BREAKER reusado — readPressureSample, sem duplicar amostragem; sem
//     swap configurado = sem pressão, mesma semântica do breaker). Sem janela: adiar
//     (deferredSince no estado persistido); atraso > 4h com deploy pendente emite
//     needs_operator — nunca spin silencioso (invariante ORCH-HYGIENE-01 original).
//     O deploy em si NÃO é deste ciclo (governança: ship via missão de ship) — o
//     ciclo emite o sinal `hygiene_deploy_window_open` no spool para o ship consumir.
//   IDLE: grava o resumo do ciclo (trilha + estado) e volta a dormir.
//
// Idempotência: ciclo repetido em estado limpo = no-op com evidência (todas as fases
// acham nada e provam). dryRun (DEFAULT) = projeção read-only: zero escrita, zero
// mutação — teste 3 assera isso. Execute exige chamada explícita com dryRun=false
// (tool: engineering.hygiene.cycle; daemon: ORCH_HYGIENE_APPROVED=1 no drop-in,
// mesmo padrão de aprovação do ORCH-DAEMON-01).
//
// Deploy pendente (sinal determinístico): release-state.json (fonte do release
// runner — mesma fonte do engineering.vps.reconcile) `currentCommitSha` vs HEAD de
// main. Ilegível ⇒ null (desconhecido): janela ainda avaliada, mas deferral só
// rastreia/escala com pendência PROVADA (nunca inventa pendência).
//
// Todo I/O é injetável (padrão HERMÉTICO-FIX-01): testes rodam com fs/runner em
// memória; produção usa fs real + git/docker/herdr via exec.
import { execFileSync } from "node:child_process";
import { existsSync as fsExistsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { readPressureSample } from "./orchestrateBreaker.ts";
import type { OrchestrateDeps } from "./orchestrate.ts";

export const HYGIENE_DEFAULTS = {
  repoRoot: "/opt/memoryos",
  hygieneDir: "/opt/mission-events/hygiene",
  missionStateDir: "/root/.hermes/mission-state",
  spoolPath: "/opt/mission-events/spool.jsonl",
  releaseStatePath: "/opt/memoryos/eng-mcp/release-state.json",
  orphanAgeMs: 48 * 3600 * 1000,
  containerAgeMs: 7 * 24 * 3600 * 1000,
  keepRecentRollbacks: 3,
  deployDeferralThresholdMs: 4 * 3600 * 1000,
  maxWorktreeRemovals: 10,
  maxContainerRemovals: 10,
  maxOrphanMarks: 50,
  maxMerges: 3,
  rollbackPrefix: "memoryos-eng-mcp-rollback-",
} as const;

export interface HygieneRunnerResult { stdout: string | null; code: number }
export type HygieneRunner = (cmd: string, args: string[], opts?: { timeoutMs?: number; cwd?: string }) => HygieneRunnerResult;

export interface HygieneSnapshotResult {
  ghosts?: unknown[];
  fixed?: unknown[];
  summary?: { fixed?: unknown; ghosts?: unknown; ok?: unknown };
  [key: string]: unknown;
}

export interface HygieneDeps extends OrchestrateDeps {
  /** Raiz do repo (worktree principal de main). Default /opt/memoryos. */
  repoRoot?: string;
  /** Dir da trilha/estado do ciclo. Default /opt/mission-events/hygiene. */
  hygieneDir?: string;
  releaseStatePath?: string;
  /** Sonda de comandos (git/docker/herdr). stdout + exit code; stdout null = falha. */
  runner?: HygieneRunner;
  /** Anti-ghost do mission_snapshot REUSADO (chamar, não copiar). Execute apenas. */
  runSnapshot?(): Promise<HygieneSnapshotResult>;
  /** engineering.notify.hermes (best-effort, nunca trava o ciclo). */
  notify?(summary: string, status?: "complete" | "partial" | "failed" | "blocked"): Promise<{ delivered: boolean }>;
  /** Sonda de deploy pendente (default: release-state currentCommitSha vs HEAD). */
  deployPendingProbe?(): boolean | null;
  /** Núcleos lógicos do breaker probe (default os.availableParallelism()); injetável. */
  cores?: number;
  orphanAgeMs?: number;
  containerAgeMs?: number;
  keepRecentRollbacks?: number;
  deployDeferralThresholdMs?: number;
  maxWorktreeRemovals?: number;
  maxContainerRemovals?: number;
  maxOrphanMarks?: number;
  maxMerges?: number;
  rollbackPrefix?: string;
}

export interface HygieneWorktreeItem {
  path: string;
  branch: string | null;
  head: string | null;
  clean: boolean | null;
  mergedIntoMain: boolean | null;
  aheadOfMain: number | null;
  action: "removed" | "would_remove" | "merge_candidate" | "skipped" | "error";
  reason?: string;
  branchDeleted?: boolean;
}

export interface HygieneContainerItem {
  id: string;
  name: string;
  status: string | null;
  ageMs: number | null;
  action: "removed" | "would_remove" | "kept" | "skipped" | "error";
  reason?: string;
}

export interface HygieneOrphanItem {
  missionId: string;
  status: string | null;
  ageMs: number | null;
  action: "marked" | "would_mark" | "skipped";
  reason?: string;
}

export interface HygieneCycleResult {
  ok: boolean;
  dryRun: boolean;
  /** Nada a fazer em nenhum estado (idempotência: 2º ciclo limpo = no-op com prova). */
  noop: boolean;
  /** Estados visitados na ordem da máquina (prova da sequência). */
  states: Array<{ state: string; at: string; ok: boolean; detail: string }>;
  finalState: string;
  cleanup: {
    worktrees: HygieneWorktreeItem[];
    containers: HygieneContainerItem[];
    orphans: HygieneOrphanItem[];
    ghosts: { ran: boolean; ghostCount: number; fixedCount: number; note: string | null };
  };
  merge: { mainClean: boolean | null; candidates: string[]; merged: Array<{ branch: string; fromSha: string; toSha: string }>; skipped: Array<{ branch: string; reason: string }> };
  deployWindow: {
    evaluated: boolean;
    open: boolean | null;
    conditions: { noMissionsInFlight: boolean | null; inFlight: number | null; memOk: boolean | null; memAvailableGb: number | null; swapOk: boolean | null; swapUsedPct: number | null };
    pendingDeploy: boolean | null;
    deferredSince: string | null;
    deferralMs: number | null;
    needsOperatorEmitted: boolean;
    reasons: string[];
  };
  trailPath: string | null;
  error: string | null;
}

export interface HygienePersistedState {
  lastCycleAt: string | null;
  finalState: string | null;
  deferredSince: string | null;
  needsOperatorEmittedAt: string | null;
  lastSummary: Record<string, unknown> | null;
}

const emptyPersistedState = (): HygienePersistedState => ({
  lastCycleAt: null, finalState: null, deferredSince: null, needsOperatorEmittedAt: null, lastSummary: null,
});

const defaultRunner: HygieneRunner = (cmd, args, opts) => {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: "utf8",
      timeout: opts?.timeoutMs ?? 15_000,
      cwd: opts?.cwd,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return { stdout, code: 0 };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { stdout: typeof e.stdout === "string" ? e.stdout : null, code: typeof e.status === "number" ? e.status : 1 };
  }
};

export function resolveHygieneDeps(deps?: HygieneDeps): Required<Pick<HygieneDeps, "readText" | "readdir" | "now">> & HygieneDeps {
  const envPath = (name: string): string | undefined => {
    const v = process.env[name];
    return v && v.trim().length > 0 ? v.trim() : undefined;
  };
  return {
    readText: deps?.readText ?? ((p: string) => { try { return fsExistsSync(p) ? readFileSync(p, "utf8") : null; } catch { return null; } }),
    readdir: deps?.readdir ?? ((p: string) => { try { return readdirSync(p); } catch { return null; } }),
    now: deps?.now ?? (() => Date.now()),
    writeText: deps?.writeText,
    appendFile: deps?.appendFile,
    existsSync: deps?.existsSync,
    repoRoot: deps?.repoRoot ?? HYGIENE_DEFAULTS.repoRoot,
    hygieneDir: deps?.hygieneDir ?? envPath("ENG_MCP_HYGIENE_DIR") ?? HYGIENE_DEFAULTS.hygieneDir,
    missionStateDir: deps?.missionStateDir ?? HYGIENE_DEFAULTS.missionStateDir,
    spoolPath: deps?.spoolPath ?? envPath("ENG_MCP_SPOOL_PATH") ?? HYGIENE_DEFAULTS.spoolPath,
    releaseStatePath: deps?.releaseStatePath ?? HYGIENE_DEFAULTS.releaseStatePath,
    runner: deps?.runner ?? defaultRunner,
    runSnapshot: deps?.runSnapshot,
    notify: deps?.notify,
    deployPendingProbe: deps?.deployPendingProbe,
    orphanAgeMs: deps?.orphanAgeMs ?? HYGIENE_DEFAULTS.orphanAgeMs,
    containerAgeMs: deps?.containerAgeMs ?? HYGIENE_DEFAULTS.containerAgeMs,
    keepRecentRollbacks: deps?.keepRecentRollbacks ?? HYGIENE_DEFAULTS.keepRecentRollbacks,
    deployDeferralThresholdMs: deps?.deployDeferralThresholdMs ?? HYGIENE_DEFAULTS.deployDeferralThresholdMs,
    maxWorktreeRemovals: deps?.maxWorktreeRemovals ?? HYGIENE_DEFAULTS.maxWorktreeRemovals,
    maxContainerRemovals: deps?.maxContainerRemovals ?? HYGIENE_DEFAULTS.maxContainerRemovals,
    maxOrphanMarks: deps?.maxOrphanMarks ?? HYGIENE_DEFAULTS.maxOrphanMarks,
    maxMerges: deps?.maxMerges ?? HYGIENE_DEFAULTS.maxMerges,
    rollbackPrefix: deps?.rollbackPrefix ?? HYGIENE_DEFAULTS.rollbackPrefix,
    loadavgPath: deps?.loadavgPath,
    meminfoPath: deps?.meminfoPath,
    psiPath: deps?.psiPath,
    cores: deps?.cores,
  };
}

// ---- sondas git (todas via runner injetável; stdout null = falha honesta) ----

const git = (d: ReturnType<typeof resolveHygieneDeps>, args: string[], cwd?: string): string | null =>
  d.runner!("git", args, { cwd: cwd ?? d.repoRoot!, timeoutMs: 15_000 }).stdout;

function gitHeadSha(d: ReturnType<typeof resolveHygieneDeps>, cwd?: string): string | null {
  const out = git(d, ["rev-parse", "HEAD"], cwd);
  const sha = out?.trim();
  return sha && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

export interface WorktreeScanItem {
  path: string;
  head: string | null;
  branch: string | null;
  clean: boolean | null;
  mergedIntoMain: boolean | null;
  aheadOfMain: number | null;
}

/**
 * Inventário determinístico das worktrees do repo (git worktree list --porcelain).
 * A worktree principal (repoRoot) é pulada — é o próprio main. Exportado para o
 * gatilho leve (Modo 2) reusar a MESMA leitura sem rodar o ciclo inteiro.
 */
export function scanWorktrees(d: ReturnType<typeof resolveHygieneDeps>): { ok: boolean; mainHead: string | null; items: WorktreeScanItem[]; error: string | null } {
  const raw = git(d, ["worktree", "list", "--porcelain"]);
  if (raw == null) return { ok: false, mainHead: null, items: [], error: "git worktree list ilegível" };
  const mainHead = gitHeadSha(d);
  const items: WorktreeScanItem[] = [];
  let current: Partial<WorktreeScanItem> | null = null;
  for (const line of (raw + "\n").split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current && current.path) items.push(finalizeWorktree(d, current as WorktreeScanItem));
      current = { path: line.slice("worktree ".length).trim() };
    } else if (current && line.startsWith("HEAD ")) {
      current.head = line.slice(5).trim() || null;
    } else if (current && line.startsWith("branch ")) {
      const ref = line.slice(7).trim();
      current.branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
    } else if (line.trim().length === 0 && current && current.path) {
      items.push(finalizeWorktree(d, current as WorktreeScanItem));
      current = null;
    }
  }
  if (current && current.path) items.push(finalizeWorktree(d, current as WorktreeScanItem));
  const root = path.resolve(d.repoRoot!);
  return { ok: true, mainHead, items: items.filter((i) => path.resolve(i.path) !== root), error: null };
}

function finalizeWorktree(d: ReturnType<typeof resolveHygieneDeps>, item: WorktreeScanItem): WorktreeScanItem {
  // clean: `git -C <wt> status --porcelain` vazio = sem diff não-commitado (inclui
  // untracked — nunca descartar trabalho). Falha de leitura ⇒ null (pula com motivo).
  const status = git(d, ["status", "--porcelain"], item.path);
  item.clean = status == null ? null : status.trim().length === 0;
  const ref = item.branch ?? item.head;
  if (ref != null) {
    // mergedIntoMain: `git merge-base --is-ancestor <ref> main` exit 0.
    const merged = d.runner!("git", ["merge-base", "--is-ancestor", ref, "main"], { cwd: d.repoRoot!, timeoutMs: 15_000 });
    item.mergedIntoMain = merged.code === 0;
    const ahead = git(d, ["rev-list", "--count", `main..${ref}`]);
    const n = Number((ahead ?? "").trim());
    item.aheadOfMain = Number.isFinite(n) ? n : null;
  } else {
    item.mergedIntoMain = null;
    item.aheadOfMain = null;
  }
  return item;
}

// ---- CLEANUP: worktrees ----

function cleanupWorktrees(d: ReturnType<typeof resolveHygieneDeps>, dryRun: boolean, out: HygieneWorktreeItem[], mergeCandidates: string[]): void {
  const scan = scanWorktrees(d);
  if (!scan.ok) {
    out.push({ path: d.repoRoot!, branch: null, head: null, clean: null, mergedIntoMain: null, aheadOfMain: null, action: "error", reason: scan.error ?? "scan falhou" });
    return;
  }
  // Ordem determinística: path alfabético.
  const items = [...scan.items].sort((a, b) => a.path.localeCompare(b.path));
  let removals = 0;
  for (const item of items) {
    if (item.clean == null) {
      out.push({ ...item, action: "skipped", reason: "status ilegível (nunca descartar sem prova)" });
      continue;
    }
    if (!item.clean) {
      out.push({ ...item, action: "skipped", reason: "diff não-commitado (nunca descartar trabalho)" });
      continue;
    }
    if (item.branch != null && item.aheadOfMain != null && item.aheadOfMain > 0 && item.mergedIntoMain === false) {
      // Entregável commitado, branch AHEAD e ainda não mergeada → fila do MERGE.
      mergeCandidates.push(item.branch);
      out.push({ ...item, action: "merge_candidate", reason: `ahead de main em ${item.aheadOfMain} commit(s) — merge serial (ff-only) na fase MERGE` });
      continue;
    }
    // Aqui: clean E (merged OU detached). Sem trabalho a perder.
    if (removals >= d.maxWorktreeRemovals!) {
      out.push({ ...item, action: "skipped", reason: `cap de ${d.maxWorktreeRemovals} remoções por ciclo` });
      continue;
    }
    if (dryRun) {
      out.push({ ...item, action: "would_remove", reason: item.branch == null ? "detached limpo (sem branch)" : "mergeada em main e limpa" });
      removals += 1;
      continue;
    }
    const rm = d.runner!("git", ["worktree", "remove", item.path], { cwd: d.repoRoot!, timeoutMs: 30_000 });
    if (rm.code !== 0) {
      out.push({ ...item, action: "error", reason: `git worktree remove falhou (exit ${rm.code}) — nada descartado` });
      continue;
    }
    removals += 1;
    const rec: HygieneWorktreeItem = { ...item, action: "removed", reason: item.branch == null ? "detached limpo (sem branch)" : "mergeada em main e limpa" };
    if (item.branch != null) {
      // git branch -d (safe delete: recusa se não mergeada — segunda barreira).
      const bd = d.runner!("git", ["branch", "-d", item.branch], { cwd: d.repoRoot!, timeoutMs: 15_000 });
      rec.branchDeleted = bd.code === 0;
      if (bd.code !== 0) rec.reason = "worktree removida; branch -d recusou (registro na trilha, branch preservada)";
    }
    out.push(rec);
  }
}

// ---- CLEANUP: containers rollback ----

function cleanupContainers(d: ReturnType<typeof resolveHygieneDeps>, dryRun: boolean, out: HygieneContainerItem[], nowMs: number): void {
  // docker não existe / daemon fora = sonda null → nothing removed (fail-closed honesto).
  const ps = d.runner!("docker", ["ps", "-a", "--filter", `name=${d.rollbackPrefix}`, "--format", "{{.ID}}|{{.Names}}|{{.Status}}|{{.CreatedAt}}"], { timeoutMs: 20_000 });
  if (ps.stdout == null) {
    out.push({ id: "-", name: "-", status: null, ageMs: null, action: "skipped", reason: "docker indisponível (sonda null — nada removido)" });
    return;
  }
  const rows: Array<{ id: string; name: string; status: string; createdAtMs: number | null }> = [];
  for (const line of ps.stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const parts = trimmed.split("|");
    if (parts.length < 4) continue;
    const [id, name, status, createdAt] = parts;
    if (!id || !name) continue;
    rows.push({ id, name, status, createdAtMs: parseDockerDate(createdAt) });
  }
  // Os 3 mais recentes (por createdAt, desc) ficam SEMPRE — retenção do pipeline.
  const byNewest = [...rows].sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
  const protectedIds = new Set(byNewest.slice(0, d.keepRecentRollbacks!).map((r) => r.id));
  let removals = 0;
  for (const row of byNewest) {
    const exited137 = /\bExited \(137\)/.test(row.status);
    const ageMs = row.createdAtMs != null ? nowMs - row.createdAtMs : null;
    const oldEnough = ageMs != null && ageMs > d.containerAgeMs!;
    if (protectedIds.has(row.id)) {
      out.push({ ...row, ageMs, action: "kept", reason: `entre os ${d.keepRecentRollbacks} mais recentes (retenção)` });
      continue;
    }
    if (!exited137) {
      out.push({ ...row, ageMs, action: "kept", reason: `status não é Exited(137): ${row.status}` });
      continue;
    }
    if (!oldEnough) {
      out.push({ ...row, ageMs, action: "kept", reason: "idade ≤ 7 dias (retenção por idade)" });
      continue;
    }
    if (removals >= d.maxContainerRemovals!) {
      out.push({ ...row, ageMs, action: "skipped", reason: `cap de ${d.maxContainerRemovals} remoções por ciclo` });
      continue;
    }
    if (dryRun) {
      out.push({ ...row, ageMs, action: "would_remove", reason: `Exited(137) há ${Math.round(ageMs! / 86400000)} dia(s)` });
      removals += 1;
      continue;
    }
    const rm = d.runner!("docker", ["rm", row.id], { timeoutMs: 30_000 });
    if (rm.code !== 0) {
      out.push({ ...row, ageMs, action: "error", reason: `docker rm falhou (exit ${rm.code})` });
      continue;
    }
    out.push({ ...row, ageMs, action: "removed", reason: `Exited(137) há ${Math.round(ageMs! / 86400000)} dia(s)` });
    removals += 1;
  }
}

/** docker CreatedAt ("2026-10-03 15:38:44 +0000 UTC") → epoch ms (offset aplicado). */
export function parseDockerDate(raw: string): number | null {
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*([+-]\d{2}:?\d{2})?/);
  if (!m) return null;
  const [, y, mo, dd, h, mi, s, frac, off] = m;
  let ms = Date.UTC(Number(y), Number(mo) - 1, Number(dd), Number(h), Number(mi), Number(s), frac ? Number(frac.slice(0, 3).padEnd(3, "0")) : 0);
  if (off) {
    const sign = off.startsWith("-") ? -1 : 1;
    const digits = off.replace(/[+-]/g, "").replace(":", "");
    const oh = Number(digits.slice(0, 2));
    const om = Number(digits.slice(2, 4) || "0");
    ms -= sign * (oh * 3600 + om * 60) * 1000;
  }
  return Number.isFinite(ms) ? ms : null;
}

// ---- CLEANUP: ledgers órfãos ----

interface HerdrView {
  panes: Array<{ pane_id?: string }>;
  tabs: Array<{ tab_id?: string; label?: string }>;
}

function herdrJson(d: ReturnType<typeof resolveHygieneDeps>, sub: "pane list" | "tab list"): HerdrView | null {
  // Mesmo padrão do missionOps (HERDR_LIST): resolve o CLI do herdr no host.
  const probe = d.runner!("bash", ["-lc", "H=$(ls /usr/local/bin/herdr* 2>/dev/null | head -1); $H " + sub], { timeoutMs: 10_000 });
  if (probe.stdout == null) return null;
  try {
    const parsed = JSON.parse(probe.stdout) as { result?: { panes?: Array<{ pane_id?: string }>; tabs?: Array<{ tab_id?: string; label?: string }> } };
    return { panes: parsed.result?.panes ?? [], tabs: parsed.result?.tabs ?? [] };
  } catch {
    return null;
  }
}

function cleanupOrphanLedgers(d: ReturnType<typeof resolveHygieneDeps>, dryRun: boolean, out: HygieneOrphanItem[], nowMs: number): void {
  const ORPHAN_STATUSES = new Set(["dispatched", "cancelled"]);
  const files = d.readdir!(d.missionStateDir!);
  if (files == null) {
    out.push({ missionId: "-", status: null, ageMs: null, action: "skipped", reason: "mission-state ilegível (fail-closed: nada marcado)" });
    return;
  }
  const panes = herdrJson(d, "pane list");
  const tabs = herdrJson(d, "tab list");
  // Fail-closed: sem prova de que o pane/aba NÃO existe (herdr ilegível), nada é
  // marcado — marcar às cegas transformaria missão viva em órfã. Cada candidato é
  // listado com o motivo (trilha honesta).
  const herdrOk = panes != null && tabs != null;
  const livePaneIds = new Set((panes?.panes ?? []).map((p) => p.pane_id).filter((v): v is string => typeof v === "string"));
  const liveTabIds = new Set((tabs?.tabs ?? []).map((t) => t.tab_id).filter((v): v is string => typeof v === "string"));
  const liveTabLabels = (tabs?.tabs ?? []).map((t) => String(t.label ?? ""));
  let marked = 0;
  const names = [...files].sort();
  for (const file of names) {
    if (!file.endsWith(".json") || file.endsWith(".verify.json")) continue;
    const missionId = file.replace(/\.json$/, "");
    const ledgerPath = `${d.missionStateDir}/${file}`;
    let ledger: Record<string, unknown> | null = null;
    try {
      const raw = d.readText!(ledgerPath);
      if (raw != null) ledger = JSON.parse(raw) as Record<string, unknown>;
    } catch { ledger = null; }
    if (!ledger) {
      out.push({ missionId, status: null, ageMs: null, action: "skipped", reason: "ledger ilegível (nunca marca às cegas)" });
      continue;
    }
    const status = typeof ledger.status === "string" ? ledger.status : null;
    if (status == null || !ORPHAN_STATUSES.has(status)) {
      out.push({ missionId, status, ageMs: null, action: "skipped", reason: `status ${status ?? "desconhecido"} não é órfão-candidato` });
      continue;
    }
    // Idade: updatedAt (ISO) do ledger; ausente ⇒ pula (sem prova de idade).
    const updatedAtRaw = typeof ledger.updatedAt === "string" ? ledger.updatedAt : null;
    const updatedAt = updatedAtRaw != null ? Date.parse(updatedAtRaw) : NaN;
    const ageMs = Number.isFinite(updatedAt) ? nowMs - updatedAt : null;
    if (ageMs == null || ageMs <= d.orphanAgeMs!) {
      out.push({ missionId, status, ageMs, action: "skipped", reason: ageMs == null ? "sem updatedAt legível" : "idade ≤ 48h" });
      continue;
    }
    if (!herdrOk) {
      out.push({ missionId, status, ageMs, action: "skipped", reason: "herdr pane/tab ilegível (fail-closed: nada marcado)" });
      continue;
    }
    // Sem pane E sem aba: paneId fora do pane list E nenhuma aba MISSION:<id>/tabId.
    const paneId = typeof ledger.paneId === "string" ? ledger.paneId : null;
    const tabId = typeof ledger.tabId === "string" ? ledger.tabId : null;
    const hasPane = paneId != null && livePaneIds.has(paneId);
    const hasTab = (tabId != null && liveTabIds.has(tabId)) || liveTabLabels.some((l) => l.includes(`MISSION:${missionId}`));
    if (hasPane || hasTab) {
      out.push({ missionId, status, ageMs, action: "skipped", reason: hasPane ? "pane ainda vivo" : "aba MISSION ainda viva" });
      continue;
    }
    if (ledger.hygiene_orphan) {
      out.push({ missionId, status, ageMs, action: "skipped", reason: "já marcado como hygiene_orphan (idempotente)" });
      continue;
    }
    if (marked >= d.maxOrphanMarks!) {
      out.push({ missionId, status, ageMs, action: "skipped", reason: `cap de ${d.maxOrphanMarks} marcações por ciclo` });
      continue;
    }
    const stamp = new Date(nowMs).toISOString();
    if (dryRun) {
      out.push({ missionId, status, ageMs, action: "would_mark", reason: `órfão há ${Math.round(ageMs / 3600000)}h — marcaria hygiene_orphan` });
      marked += 1;
      continue;
    }
    // Marca (NUNCA apaga — trilha é imune): campo hygiene_orphan no ledger.
    ledger.hygiene_orphan = { at: stamp, status, reason: "sem pane e sem aba há >48h (ORCH-HYGIENE-01)" };
    if (writeLedgerJson(d, ledgerPath, ledger)) {
      out.push({ missionId, status, ageMs, action: "marked", reason: `hygiene_orphan gravado (status ${status}, ${Math.round(ageMs / 3600000)}h sem pane/aba)` });
      marked += 1;
    } else {
      out.push({ missionId, status, ageMs, action: "skipped", reason: "falha ao gravar marcação no ledger (nada perdido)" });
    }
  }
}

function writeLedgerJson(d: ReturnType<typeof resolveHygieneDeps>, ledgerPath: string, ledger: Record<string, unknown>): boolean {
  const payload = JSON.stringify(ledger, null, 2);
  try {
    if (d.writeText) {
      d.writeText(ledgerPath, payload);
      return true;
    }
    const tmp = `${ledgerPath}.tmp-${process.pid}`;
    writeFileSync(tmp, payload, "utf8");
    renameSync(tmp, ledgerPath);
    return true;
  } catch {
    return false;
  }
}

// ---- CLEANUP: panes fantasma (REUSA o mission_snapshot — chamada, não cópia) ----

async function cleanupGhostPanes(d: ReturnType<typeof resolveHygieneDeps>, dryRun: boolean): Promise<HygieneCycleResult["cleanup"]["ghosts"]> {
  if (dryRun) {
    return { ran: false, ghostCount: 0, fixedCount: 0, note: "dryRun: mission_snapshot auto-corrige ledger — chamada adiada para o execute" };
  }
  if (!d.runSnapshot) {
    return { ran: false, ghostCount: 0, fixedCount: 0, note: "sem handler do mission_snapshot configurado (fail-open: nada feito)" };
  }
  try {
    const snap = await d.runSnapshot();
    const ghostCount = Array.isArray(snap.ghosts) ? snap.ghosts.length : 0;
    const fixedCount = Array.isArray(snap.fixed) ? snap.fixed.length : 0;
    return { ran: true, ghostCount, fixedCount, note: "anti-ghost reusado do mission_snapshot (chamada)" };
  } catch (err) {
    return { ran: false, ghostCount: 0, fixedCount: 0, note: `snapshot falhou (fail-open): ${err instanceof Error ? err.message : String(err)}`.slice(0, 200) };
  }
}

// ---- MERGE: fila serial (ff-only, nunca force) ----

function mergePhase(d: ReturnType<typeof resolveHygieneDeps>, dryRun: boolean, candidates: string[], result: HygieneCycleResult["merge"]): void {
  if (candidates.length === 0) {
    result.mainClean = null;
    return; // no-op com evidência: sem candidatos, main nem é tocado
  }
  const status = git(d, ["status", "--porcelain"]);
  result.mainClean = status != null && status.trim().length === 0;
  if (!result.mainClean) {
    for (const branch of candidates) result.skipped.push({ branch, reason: "worktree de main com diff não-commitado — merge adiado (nunca mistura trabalho)" });
    return;
  }
  const fromSha = gitHeadSha(d);
  let merges = 0;
  for (const branch of candidates) {
    if (merges >= d.maxMerges!) {
      result.skipped.push({ branch, reason: `cap de ${d.maxMerges} merges por ciclo (fila serial continua no próximo)` });
      continue;
    }
    if (dryRun) {
      result.merged.push({ branch, fromSha: fromSha ?? "?", toSha: "(projeção ff-only — nada mergeado em dryRun)" });
      merges += 1;
      continue;
    }
    const before = gitHeadSha(d);
    const m = d.runner!("git", ["merge", "--ff-only", branch], { cwd: d.repoRoot!, timeoutMs: 60_000 });
    if (m.code !== 0) {
      result.skipped.push({ branch, reason: `git merge --ff-only recusou (exit ${m.code}) — divergência; main intocado, nunca force` });
      continue;
    }
    const after = gitHeadSha(d) ?? "?";
    result.merged.push({ branch, fromSha: before ?? "?", toSha: after });
    merges += 1;
    spoolEvent(d, false, "orch_hygiene_merge", branch, `ff-only merge de ${branch}: ${before ?? "?"} → ${after}`);
  }
}

// ---- DEPLOY_WINDOW ----

function countInFlightMissions(d: ReturnType<typeof resolveHygieneDeps>): { count: number; readable: boolean } {
  const files = d.readdir!(d.missionStateDir!);
  if (files == null) return { count: 0, readable: false };
  let count = 0;
  for (const file of files) {
    if (!file.endsWith(".json") || file.endsWith(".verify.json")) continue;
    try {
      const raw = d.readText!(`${d.missionStateDir}/${file}`);
      if (raw == null) continue;
      const ledger = JSON.parse(raw) as { status?: unknown };
      if (ledger.status === "dispatched") count += 1; // ACTIVE_SLOT_STATUSES do plan
    } catch { /* ledger malformado: skip */ }
  }
  return { count, readable: true };
}

/** Deploy pendente (default): release-state.json currentCommitSha != HEAD de main. */
function defaultDeployPending(d: ReturnType<typeof resolveHygieneDeps>): boolean | null {
  const raw = d.readText!(d.releaseStatePath!);
  if (raw == null) return null;
  try {
    const state = JSON.parse(raw) as { currentCommitSha?: unknown };
    if (typeof state.currentCommitSha !== "string" || state.currentCommitSha.length !== 40) return null;
    const head = gitHeadSha(d);
    if (head == null) return null;
    return head !== state.currentCommitSha;
  } catch {
    return null;
  }
}

function deployWindowPhase(d: ReturnType<typeof resolveHygieneDeps>, dryRun: boolean, result: HygieneCycleResult, persisted: HygienePersistedState, nowMs: number): void {
  const w = result.deployWindow;
  w.evaluated = true;
  const inFlight = countInFlightMissions(d);
  w.conditions.inFlight = inFlight.count;
  w.conditions.noMissionsInFlight = inFlight.readable ? inFlight.count === 0 : null;
  // Pressão: REUSA o probe do breaker (readPressureSample — mesma amostragem).
  const sample = readPressureSample({
    readText: d.readText,
    loadavgPath: d.loadavgPath,
    meminfoPath: d.meminfoPath,
    psiPath: d.psiPath,
    cores: d.cores,
    now: d.now,
  });
  // memAvailableGb: /proc/meminfo MemAvailable (mesma leitura do plan).
  const memRaw = d.readText!(d.meminfoPath ?? "/proc/meminfo");
  let memGb: number | null = null;
  if (memRaw != null) {
    const line = memRaw.split("\n").find((l) => l.startsWith("MemAvailable:"));
    const kb = line ? Number(line.trim().split(/\s+/)[1]) : NaN;
    if (Number.isFinite(kb)) memGb = kb / (1024 * 1024);
  }
  w.conditions.memAvailableGb = memGb;
  // Teto do plano (mesmo fator do plan): floor(memGb / 2.5) ≥ 1 slot. Sem evidência ⇒
  // conservador (não abre — deploy sem prova de memória não segue).
  w.conditions.memOk = memGb != null ? Math.floor(memGb / 2.5) >= 1 : null;
  // Swap < 50% (limiar do breaker §2). Sem swap configurado (null) = sem pressão de
  // swap — mesma semântica do breaker-plan (não gatilha; não há o que medir).
  w.conditions.swapUsedPct = sample.swapUsedPct;
  w.conditions.swapOk = sample.swapUsedPct != null ? sample.swapUsedPct < 50 : true;

  const allOpen = w.conditions.noMissionsInFlight === true && w.conditions.memOk === true && w.conditions.swapOk === true;
  w.open = allOpen;

  // Deploy pendente (sinal determinístico; null = desconhecido).
  const pending = d.deployPendingProbe ? d.deployPendingProbe() : defaultDeployPending(d);
  w.pendingDeploy = pending;

  const reasons: string[] = [];
  if (w.conditions.noMissionsInFlight === false) reasons.push(`${inFlight.count} missão(ões) host em voo`);
  if (w.conditions.noMissionsInFlight == null) reasons.push("mission-state ilegível (fail-closed)");
  if (w.conditions.memOk !== true) reasons.push(memGb == null ? "MemAvailable ilegível (conservador: sem evidência não abre)" : `memória sob teto insuficiente (floor(${memGb.toFixed(1)}/2.5)=${Math.floor(memGb / 2.5)} < 1)`);
  if (w.conditions.swapOk === false) reasons.push(`swap ${sample.swapUsedPct?.toFixed(0)}% ≥ 50%`);
  w.reasons = reasons;

  if (allOpen) {
    // Janela aberta: deferral encerra; sinal ao ship quando há deploy pendente
    // (deploy em si NÃO é deste ciclo — governança: ship via missão de ship).
    if (pending === true) {
      spoolEvent(d, dryRun, "hygiene_deploy_window_open", "-", "janela segura de deploy ABERTA (0 em voo, mem ok, swap < 50%) com deploy pendente — ship decide");
    }
    persisted.deferredSince = null;
    persisted.needsOperatorEmittedAt = null;
    w.deferredSince = null;
    w.deferralMs = null;
    w.needsOperatorEmitted = false;
    return;
  }

  // Sem janela: adiar — mas o atraso só rastreia/escala com deploy pendente PROVADO
  // (null/unknown nunca inventa pendência; a janela técnica é registrada honestamente).
  if (pending === true) {
    const deferredSince = persisted.deferredSince ?? new Date(nowMs).toISOString();
    persisted.deferredSince = deferredSince;
    const sinceMs = Date.parse(deferredSince);
    const deferralMs = Number.isFinite(sinceMs) ? nowMs - sinceMs : 0;
    w.deferredSince = deferredSince;
    w.deferralMs = deferralMs;
    if (deferralMs > d.deployDeferralThresholdMs! && persisted.needsOperatorEmittedAt == null) {
      const summary = `ORCH-HYGIENE-01: janela segura de deploy fechada há ${Math.round(deferralMs / 3600000)}h com deploy pendente (${reasons.join("; ")}) — needs_operator: prioridade elevada, decisão do operator.`;
      spoolEvent(d, dryRun, "orch_hygiene_needs_operator", "-", summary);
      persisted.needsOperatorEmittedAt = new Date(nowMs).toISOString();
      w.needsOperatorEmitted = true;
      if (!dryRun) {
        try { void d.notify?.(summary, "blocked"); } catch { /* fail-open */ }
      }
    } else {
      w.needsOperatorEmitted = false;
    }
  } else {
    persisted.deferredSince = null;
    persisted.needsOperatorEmittedAt = null;
    w.deferredSince = null;
    w.deferralMs = null;
    w.needsOperatorEmitted = false;
  }
}

function spoolEvent(d: ReturnType<typeof resolveHygieneDeps>, dryRun: boolean, kind: string, missionId: string, msg: string): void {
  if (dryRun) return; // defesa em profundidade: dryRun nunca spool
  const line = JSON.stringify({ ts: new Date(d.now!()).toISOString(), event: kind, missionId, msg: msg.slice(0, 300), source: "orchestrate-hygiene" });
  try {
    if (d.appendFile) {
      d.appendFile(d.spoolPath!, line + "\n");
    } else {
      try { mkdirSync(path.dirname(d.spoolPath!), { recursive: true }); } catch { /* dir pode existir */ }
      appendFileSync(d.spoolPath!, line + "\n", "utf8");
    }
  } catch { /* fail-open */ }
}

// ---- persistência (estado + trilha) — execute apenas ----

function readPersistedState(d: ReturnType<typeof resolveHygieneDeps>): HygienePersistedState {
  const raw = d.readText!(`${d.hygieneDir!}/state.json`);
  if (raw == null) return emptyPersistedState();
  try {
    const parsed = JSON.parse(raw) as Partial<HygienePersistedState>;
    return { ...emptyPersistedState(), ...parsed };
  } catch {
    return emptyPersistedState(); // corrompido = sem deferral conhecido (fail-open honesto)
  }
}

function writePersistedState(d: ReturnType<typeof resolveHygieneDeps>, state: HygienePersistedState): string | null {
  const payload = JSON.stringify(state, null, 2);
  try {
    if (d.writeText) {
      d.writeText(`${d.hygieneDir!}/state.json`, payload);
    } else {
      mkdirSync(d.hygieneDir!, { recursive: true });
      const tmp = `${d.hygieneDir!}/state.json.tmp-${process.pid}`;
      writeFileSync(tmp, payload, "utf8");
      renameSync(tmp, `${d.hygieneDir!}/state.json`);
    }
    return `${d.hygieneDir!}/state.json`;
  } catch {
    return null; // fail-open: trilha do ciclo carrega o resumo
  }
}

function writeTrail(d: ReturnType<typeof resolveHygieneDeps>, result: HygieneCycleResult): string | null {
  try {
    const file = path.join(d.hygieneDir!, `ciclo-${new Date(d.now!()).toISOString().replace(/[:.]/g, "-")}.json`);
    const payload = JSON.stringify(result, null, 2);
    if (d.writeText) {
      d.writeText(file, payload);
    } else {
      mkdirSync(d.hygieneDir!, { recursive: true });
      writeFileSync(file, payload, "utf8");
    }
    return file;
  } catch {
    return null; // fail-open: resultado segue no retorno da tool
  }
}

// ---- ciclo ----

/**
 * Um ciclo da máquina de higiene: IDLE → CLEANUP → MERGE → DEPLOY_WINDOW → IDLE.
 * dryRun (DEFAULT true) = projeção read-only (zero escrita, zero mutação).
 * Idempotente: em estado limpo, todas as fases são no-op com evidência.
 */
export async function runOrchestrateHygieneCycle(
  input: { dryRun?: boolean } = {},
  deps?: HygieneDeps,
): Promise<HygieneCycleResult> {
  const d = resolveHygieneDeps(deps);
  const dryRun = input.dryRun !== false; // fail-closed: default é projeção
  const nowMs = d.now!();
  const nowIso = new Date(nowMs).toISOString();
  const persisted = dryRun ? emptyPersistedState() : readPersistedState(d);

  const result: HygieneCycleResult = {
    ok: true,
    dryRun,
    noop: true,
    states: [],
    finalState: "IDLE",
    cleanup: { worktrees: [], containers: [], orphans: [], ghosts: { ran: false, ghostCount: 0, fixedCount: 0, note: null } },
    merge: { mainClean: null, candidates: [], merged: [], skipped: [] },
    deployWindow: { evaluated: false, open: null, conditions: { noMissionsInFlight: null, inFlight: null, memOk: null, memAvailableGb: null, swapOk: null, swapUsedPct: null }, pendingDeploy: null, deferredSince: persisted.deferredSince, deferralMs: null, needsOperatorEmitted: false, reasons: [] },
    trailPath: null,
    error: null,
  };
  const mark = (state: string, ok: boolean, detail: string): void => {
    result.states.push({ state, at: new Date(d.now!()).toISOString(), ok, detail });
  };

  // ---- CLEANUP ----
  try {
    cleanupWorktrees(d, dryRun, result.cleanup.worktrees, result.merge.candidates);
    cleanupContainers(d, dryRun, result.cleanup.containers, nowMs);
    cleanupOrphanLedgers(d, dryRun, result.cleanup.orphans, nowMs);
    result.cleanup.ghosts = await cleanupGhostPanes(d, dryRun);
    const acted = result.cleanup.worktrees.filter((i) => i.action === "removed" || i.action === "would_remove").length
      + result.cleanup.containers.filter((i) => i.action === "removed" || i.action === "would_remove").length
      + result.cleanup.orphans.filter((i) => i.action === "marked" || i.action === "would_mark").length;
    if (acted > 0 || result.cleanup.ghosts.ran) result.noop = false;
    mark("CLEANUP", true, `${result.cleanup.worktrees.length} worktree(s), ${result.cleanup.containers.length} container(es), ${result.cleanup.orphans.length} ledger(s), ghosts=${result.cleanup.ghosts.ran ? "rodou" : "adiado"}`);
  } catch (err) {
    result.ok = false;
    result.error = `CLEANUP_FAILED: ${err instanceof Error ? err.message : String(err)}`;
    mark("CLEANUP", false, result.error);
    result.finalState = "CLEANUP";
  }

  // ---- MERGE ----
  if (result.ok) {
    try {
      mergePhase(d, dryRun, result.merge.candidates, result.merge);
      if (result.merge.merged.length > 0) result.noop = false;
      mark("MERGE", true, result.merge.candidates.length === 0
        ? "sem branch ahead de main (no-op com evidência)"
        : `${result.merge.merged.length} merge(s) ff-only, ${result.merge.skipped.length} skip(s)`);
    } catch (err) {
      result.ok = false;
      result.error = `MERGE_FAILED: ${err instanceof Error ? err.message : String(err)}`;
      mark("MERGE", false, result.error);
      result.finalState = "MERGE";
    }
  }

  // ---- DEPLOY_WINDOW ----
  if (result.ok) {
    try {
      deployWindowPhase(d, dryRun, result, persisted, nowMs);
      if (result.deployWindow.needsOperatorEmitted) result.noop = false;
      mark("DEPLOY_WINDOW", true, result.deployWindow.open
        ? "janela aberta" + (result.deployWindow.pendingDeploy === true ? " com deploy pendente (sinal ao ship)" : " (sem deploy pendente)")
        : `janela fechada: ${result.deployWindow.reasons.join("; ") || "condições não satisfeitas"}`);
    } catch (err) {
      result.ok = false;
      result.error = `DEPLOY_WINDOW_FAILED: ${err instanceof Error ? err.message : String(err)}`;
      mark("DEPLOY_WINDOW", false, result.error);
      result.finalState = "DEPLOY_WINDOW";
    }
  }

  // ---- IDLE: trilha + estado (execute apenas — dryRun é zero-escrita) ----
  if (result.ok && !dryRun) {
    persisted.lastCycleAt = nowIso;
    persisted.finalState = "IDLE";
    persisted.lastSummary = {
      noop: result.noop,
      worktreesRemoved: result.cleanup.worktrees.filter((i) => i.action === "removed").length,
      containersRemoved: result.cleanup.containers.filter((i) => i.action === "removed").length,
      orphansMarked: result.cleanup.orphans.filter((i) => i.action === "marked").length,
      merged: result.merge.merged.length,
      windowOpen: result.deployWindow.open,
      pendingDeploy: result.deployWindow.pendingDeploy,
    };
    result.trailPath = writeTrail(d, result);
    writePersistedState(d, persisted);
    spoolEvent(d, dryRun, "orch_hygiene_cycle", "-", `ciclo ${result.noop ? "no-op" : "com ações"}: wt=${persisted.lastSummary.worktreesRemoved} ct=${persisted.lastSummary.containersRemoved} orphan=${persisted.lastSummary.orphansMarked} merge=${persisted.lastSummary.merged} window=${String(persisted.lastSummary.windowOpen)}`);
    mark("IDLE", true, `trilha gravada em ${result.trailPath ?? "(falha — resultado no retorno)"}`);
  } else if (result.ok) {
    mark("IDLE", true, "dryRun: zero escrita (projeção read-only)");
  }

  return result;
}

// ---- Modo 2: gatilho automático leve (após o consume) ----

export interface HygieneTriggerResult {
  triggered: boolean;
  reason: string;
  cycle: HygieneCycleResult | null;
}

/**
 * Gatilho leve (Modo 2): chamado no FIM de todo ciclo do consume (daemon).
 * Condição determinística de "merge pendente": existe worktree limpa com branch
 * AHEAD de main ainda não mergeada. Sem isso, no-op barato (zero mutação).
 * dryRun é o default; execute só com ORCH_HYGIENE_APPROVED=1 no drop-in
 * (mesmo padrão de aprovação do ORCH-DAEMON-01).
 */
export async function runHygieneTrigger(
  _input: Record<string, never> = {},
  deps?: HygieneDeps,
): Promise<HygieneTriggerResult> {
  const d = resolveHygieneDeps(deps);
  try {
    const scan = scanWorktrees(d);
    if (!scan.ok) return { triggered: false, reason: `scan indisponível: ${scan.error}`, cycle: null };
    const pendingMerge = scan.items.filter((i) => i.clean === true && i.branch != null && i.aheadOfMain != null && i.aheadOfMain > 0 && i.mergedIntoMain === false);
    if (pendingMerge.length === 0) {
      return { triggered: false, reason: "sem merge pendente (nenhuma worktree limpa com branch ahead de main)", cycle: null };
    }
    const approved = process.env.ORCH_HYGIENE_APPROVED === "1";
    const cycle = await runOrchestrateHygieneCycle({ dryRun: !approved }, deps);
    return { triggered: true, reason: approved ? `merge pendente (${pendingMerge.map((p) => p.branch).join(", ")}) — ciclo execute` : `merge pendente (${pendingMerge.map((p) => p.branch).join(", ")}) — ciclo dryRun (ORCH_HYGIENE_APPROVED ausente)`, cycle };
  } catch (err) {
    return { triggered: false, reason: `trigger falhou (fail-open): ${err instanceof Error ? err.message : String(err)}`, cycle: null };
  }
}
