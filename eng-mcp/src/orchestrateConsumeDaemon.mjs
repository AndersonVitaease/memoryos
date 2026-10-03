// ORCH-DAEMON-01: driver autônomo determinístico da fila de intents (zero-LLM).
// Ciclo: lê fila via engineering.orchestrate.consume (runOrchestrateConsume, caminho
// JÁ governado mission.dispatch) → PLAN (dryRun) → EXECUTE se houver promovíveis.
// Sem loop interno: o timer systemd dispara o ciclo (padrão zero-LLM systemd).
import { statSync, writeFileSync, unlinkSync, appendFileSync } from "node:fs";
import os from "node:os";
import { runOrchestrateConsume } from "./orchestrate.ts";
import { runMissionDispatch } from "./missionOps.ts";  // ORCH-PREAUTH-01: caminho governado do despacho

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

export async function runDaemonCycle({ maxPromotions = 2 } = {}) {
  if (!acquireLock()) {
    return { ok: false, reason: "lock held by another daemon cycle" };
  }
  try {
    // PLAN: dryRun — decisão sem efeito.
    const plan = await runOrchestrateConsume({ dryRun: true, maxPromotions });
    if (!plan || plan.promoted === 0) {
      return { ok: true, mode: "plan", plan, executed: null };
    }
    // EXECUTE: despacho real pelo caminho governado (mesma runMissionDispatch).
    // ORCH-DAEMON-01 FIX: execute exige approval.approved=true (guard de governança).
    // Sem approval explícito, o daemon permanece em PLAN (fail-safe, nunca falha o ciclo).
    const approval = process.env.ORCH_DAEMON_APPROVED === "1" ? { approved: true } : undefined;
    if (!approval) {
      return { ok: true, mode: "plan", plan, executed: null, note: "promovíveis aguardam approval (ORCH_DAEMON_APPROVED=1)" };
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
    return { ok: true, mode: "execute", plan, executed };
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