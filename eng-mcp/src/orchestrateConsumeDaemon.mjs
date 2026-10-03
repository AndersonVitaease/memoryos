// ORCH-DAEMON-01: driver autônomo determinístico da fila de intents (zero-LLM).
// Ciclo: lê fila via engineering.orchestrate.consume (runOrchestrateConsume, caminho
// JÁ governado mission.dispatch) → PLAN (dryRun) → EXECUTE se houver promovíveis.
// Sem loop interno: o timer systemd dispara o ciclo (padrão zero-LLM systemd).
import { statSync, writeFileSync, unlinkSync, appendFileSync } from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { runOrchestrateConsume } from "./orchestrate.ts";
import { runMissionDispatch, runMissionRecover, runMissionNudge } from "./missionOps.ts";  // ORCH-PREAUTH-01: caminho governado do despacho
import { runNotifyHermes } from "./notifyHermes.ts";
import { runBreakerTick, PAUSADO_MESSAGE, RESUMO_MESSAGE_PREFIX } from "./orchestrateBreaker.ts";  // ORCH-BREAKER-01: breaker de pressão integrado ao ciclo

// Lock/estado em tmpdir do SO (nunca em /opt/mission-events — área de produção).
export const LOCK_PATH = `${os.tmpdir()}/orchestrator-consumer.daemon.lock`;
export const STATE_PATH = `${os.tmpdir()}/orchestrator-consumer.daemon.state.json`;

function acquireLock() {
  try {
    const st = statSync(LOCK_PATH);
    if (Date.now() - st.mtimeMs < 30_000) return false;
  } catch { /* lock inexistente */ }
  writeFileSync(LOCK_PATH, String(process.pid));
  return true;
}

function releaseLock() {
  try { unlinkSync(LOCK_PATH); } catch { /* ok */ }
}

// ORCH-BREAKER-01: hooks de produção do breaker — pausa/retoma passam SEMPRE pelos
// handlers governados do mission-ops (nunca escrita direta em pane) e o aviso vai
// por engineering.notify.hermes (best-effort, nunca trava o ciclo).
async function breakerPauseMission({ missionId, paneId, stage }) {
  // (a) mission_recover(pattern=interrupted) — deixa o pane num estado limpo p/ o nudge.
  try {
    await runMissionRecover({ paneId, pattern: "interrupted", missionId });
  } catch (error) {
    // fail-open: o nudge de força é a pausa real; o recover é preparação.
    console.error(`[breaker] recover falhou (${missionId}):`, error?.message ?? error);
  }
  // (b) nudge de força — padrão provado em produção (PAUSADO, sem sleep).
  const nudge = await runMissionNudge({
    missionId,
    message: PAUSADO_MESSAGE,
    sender: "breaker",
    force: true,
    verifySeconds: 5,
  });
  return { ok: nudge?.ok === true, error: nudge?.ok === true ? undefined : `nudge stage=${stage} não confirmado` };
}

async function breakerResumeMission({ missionId }) {
  const nudge = await runMissionNudge({
    missionId,
    message: `${RESUMO_MESSAGE_PREFIX} (${missionId}) — releia /opt/mission-events/missao-${missionId.toLowerCase()}.md (ou o contrato do seu cwd) e continue de onde parou.`,
    sender: "breaker",
    force: true,
    verifySeconds: 5,
  });
  return { ok: nudge?.ok === true, error: nudge?.ok === true ? undefined : "nudge de retomada não confirmado" };
}

async function breakerNotify(summary, status) {
  try { return await runNotifyHermes({ summary, status: status ?? "blocked" }); } catch { return { delivered: false }; }
}

// Probe do herdr (§4): pane list com timeout curto → stdout ou null (fail-open).
// Síncrono por contrato do hook (probePaneList(): string|null) — teto de custo 5s/ciclo.
const HERDR_LIST = "H=$(ls /usr/local/bin/herdr* 2>/dev/null | head -1); $H";
function probePaneListSync() {
  try {
    return execFileSync("bash", ["-lc", `${HERDR_LIST} pane list`], { timeout: 5_000, encoding: "utf8", maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null; // timeout/erro = herdr irresponsável NESTA amostra
  }
}

export async function runBreakerCycle(deps) {
  return runBreakerTick(undefined, {
    pauseMission: breakerPauseMission,
    resumeMission: breakerResumeMission,
    notify: breakerNotify,
    probePaneList: probePaneListSync,
    ...deps,
  });
}

export async function runDaemonCycle({ maxPromotions = 2, breakerDeps } = {}) {
  if (!acquireLock()) {
    return { ok: false, reason: "lock held by another daemon cycle" };
  }
  try {
    // ORCH-BREAKER-01: breaker de pressão roda ANTES do consume — amostra o host
    // (load/swap/PSI), pausa workers em voo sob pressão sustentada, detecta herdr
    // irresponsável. Fail-open: qualquer falha do breaker NUNCA trava o consume.
    let breaker = null;
    try {
      breaker = await runBreakerCycle(breakerDeps);
    } catch (error) {
      breaker = { ok: false, error: error instanceof Error ? error.message : String(error) };
      console.error("[breaker] tick falhou (fail-open):", breaker.error);
    }
    // PLAN: dryRun — decisão sem efeito.
    const plan = await runOrchestrateConsume({ dryRun: true, maxPromotions });
    if (!plan || plan.promoted === 0) {
      return { ok: true, mode: "plan", plan, executed: null, breaker };
    }
    // EXECUTE: despacho real pelo caminho governado (mesma runMissionDispatch).
    // ORCH-DAEMON-01 FIX: execute exige approval.approved=true (guard de governança).
    // Sem approval explícito, o daemon permanece em PLAN (fail-safe, nunca falha o ciclo).
    const approval = process.env.ORCH_DAEMON_APPROVED === "1" ? { approved: true } : undefined;
    if (!approval) {
      return { ok: true, mode: "plan", plan, executed: null, note: "promovíveis aguardam approval (ORCH_DAEMON_APPROVED=1)", breaker };
    }
    // ORCH-PREAUTH-01 (elo final): o daemon injeta o MESMO caminho governado do
    // tools.ts (runMissionDispatch) — antes ele chamava execute sem handler e o
    // fail-closed bloqueava TODAS as intents ("sem handler de dispatch configurado").
    const executed = await runOrchestrateConsume({
      maxPromotions, execute: true, approval,
    }, {
      dispatchMission: async (i) => {
        try {
          const result = await runMissionDispatch({
            missionId: i.missionId,
            promptFile: i.promptFile,
            cwd: i.worktree, // worktree da intent → cwd do dispatch (o handler valida existência)
            spawnedBy: "orchestrator",
          });
          if (result && result && result.ok === true) return { ok: true };
          const err = result ?? {};
          return { ok: false, error: `${String(err.error ?? "dispatch refused")}: ${String(err.detail ?? "")}`.trimEnd() };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
    });
    return { ok: true, mode: "execute", plan, executed, breaker };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    releaseLock();
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const result = await runDaemonCycle();
  appendFileSync(STATE_PATH, JSON.stringify({ at: new Date().toISOString(), ...result }) + "\n");
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}