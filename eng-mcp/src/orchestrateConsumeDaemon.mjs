// ORCH-DAEMON-01: driver autônomo determinístico da fila de intents (zero-LLM).
// Ciclo: lê fila via engineering.orchestrate.consume (runOrchestrateConsume, caminho
// JÁ governado mission.dispatch) → PLAN (dryRun) → EXECUTE se houver promovíveis.
// Sem loop interno: o timer systemd dispara o ciclo (padrão zero-LLM systemd).
import { statSync, writeFileSync, unlinkSync, appendFileSync } from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { runOrchestrateConsume } from "./orchestrate.ts";
import { runOrchestrateQueueCompaction } from "./orchestrateCompaction.ts";  // ORCH-QUEUE-COMPACT-01: arquivamento no fim de todo ciclo
import { runMissionDispatch, runMissionRecover, runMissionNudge } from "./missionOps.ts";  // ORCH-PREAUTH-01: caminho governado do despacho
import { runNotifyHermes } from "./notifyHermes.ts";
import { runBreakerTick, PAUSADO_MESSAGE, RESUMO_MESSAGE_PREFIX } from "./orchestrateBreaker.ts";  // ORCH-BREAKER-01: breaker de pressão integrado ao ciclo
import { runHygieneTrigger } from "./orchestrateHygiene.ts";  // ORCH-HYGIENE-01: gatilho leve no fim do ciclo
import { createToolCallHandler } from "./orchToolHandlers.ts";  // ORCH-TOOLS-01: executor in-processo de tool_call
import { readPreauthArtifact, orchPreauthPath, assertPreauthArtifactAccess } from "./orchPreauthArtifact.ts";  // ORCH-PREAUTH-ARTIFACT-01: leitor do artefato preauth (SÓ leitura)

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

// ORCH-QUEUE-COMPACT-01: compactação/arquivamento da fila no fim de TODO ciclo do
// daemon (plan ou execute — é o "fim do ciclo do consume" do contrato; em execute a
// compactação já rodou dentro do runOrchestrateConsume, aqui vira passagem de prova).
// Fail-open: qualquer falha NUNCA trava o ciclo. ORCH_QUEUE_COMPACT=0 desliga
// (escape hatch de suítes locais; produção sem a var = ligada).
function maybeCompactQueue(executed) {
  if (executed && typeof executed.compacted === "number") {
    return { ok: true, via: "consume-execute", moved: executed.compacted };
  }
  if (process.env.ORCH_QUEUE_COMPACT === "0") {
    return { ok: true, via: "disabled", reason: "ORCH_QUEUE_COMPACT=0", moved: 0 };
  }
  try {
    return { ...runOrchestrateQueueCompaction({}), via: "daemon-cycle" };
  } catch (error) {
    return { ok: false, via: "daemon-cycle", error: error instanceof Error ? error.message : String(error) };
  }
}

// ORCH-HYGIENE-01 (Modo 2): gatilho automático LEVE no fim de todo ciclo do daemon —
// se há worktree limpa com branch ahead de main (merge pendente), roda 1 ciclo de
// higiene: dryRun é o default (fail-closed); execute só com ORCH_HYGIENE_APPROVED=1
// no drop-in (mesmo padrão de aprovação do ORCH-DAEMON-01). Fail-open: qualquer
// falha NUNCA trava o ciclo do consume. ORCH_HYGIENE=0 desliga (escape hatch de
// suítes locais; produção sem a var = ligado).
async function maybeHygieneCycle() {
  if (process.env.ORCH_HYGIENE === "0") {
    return { triggered: false, reason: "ORCH_HYGIENE=0", cycle: null };
  }
  try {
    return await runHygieneTrigger();
  } catch (error) {
    return { triggered: false, reason: `hygiene fail-open: ${error instanceof Error ? error.message : String(error)}`, cycle: null };
  }
}

// ORCH-PREAUTH-ARTIFACT-01: fonte da approval do EXECUTE — o ARTEFATO preauth
// operador-concedido (leitor read-only; forma do contrato OU manifesto do
// engineering.mission.preauth) com fallback compatível ao env ORCH_DAEMON_APPROVED=1
// (mantido até o operador revogar). O ciclo carrega approvalSource (artifact|env|none)
// + o estado do artefato — log honesto de qual fonte valeu. ANTI-SELF-APPROVE: o
// daemon NUNCA cria/escreve o artefato (guarda explícita no módulo dono do caminho;
// aqui a única operação usada é "read"). Fail-closed: artefato ausente/expirado/
// revogado/hash divergente/corrompido NUNCA libera execute — sem env, o ciclo fica
// em awaiting_approval (PLAN, exit 0).
export function resolveCycleApproval(env = process.env) {
  assertPreauthArtifactAccess("read", orchPreauthPath(env));
  const reading = readPreauthArtifact(orchPreauthPath(env));
  const preauth = { path: reading.path, status: reading.status, reason: reading.reason, hash16: reading.hash16, expiresAt: reading.expiresAt, source: reading.source };
  if (reading.status === "valid") {
    return { approval: { approved: true }, approvalSource: "artifact", preauth };
  }
  if (env.ORCH_DAEMON_APPROVED === "1") {
    return { approval: { approved: true }, approvalSource: "env", preauth };
  }
  return { approval: null, approvalSource: "none", preauth };
}

// ORCH-CHAIN-CWD-01 (item 3): o preauth do daemon tem TTL e expira em silêncio — no
// início de TODO ciclo, manifesto preauth ATIVO do unit (status valid, subject/mission
// = orch-daemon-conume validado pelo leitor) com expiração < 2h emite alerta tipado:
// spool orch_preauth_expiring + evento no bus (o bus consome o spool) com mission/
// hash16/expiresAt no corpo e na msg (msg é o campo que o bus entrega ao subscriber).
// RE-GRANT NUNCA automático — a concessão é do operator; o daemon só LE e alerta
// (anti-self-approve intocado). Alerta por ciclo (o bus dedupa/rate-limita a entrega).
export const PREAUTH_EXPIRY_WARN_MS = 2 * 60 * 60 * 1000;
export const PREAUTH_UNIT = "orch-daemon-consume";

export function emitPreauthExpiryAlert(reading, { spoolPath, nowMs = Date.now(), appendFile = appendFileSync, warnWindowMs = PREAUTH_EXPIRY_WARN_MS } = {}) {
  if (!reading || reading.status !== "valid" || !reading.expiresAt) {
    return { alerted: false, reason: `preauth não ativo (status=${reading?.status ?? "null"})` };
  }
  const expMs = Date.parse(reading.expiresAt);
  if (!Number.isFinite(expMs)) {
    return { alerted: false, reason: `expiresAt não-parseável: ${reading.expiresAt}` };
  }
  const remainingMs = expMs - nowMs;
  if (remainingMs >= warnWindowMs) {
    return { alerted: false, reason: `expiração fora da janela (${Math.round(remainingMs / 60_000)}min restantes ≥ ${Math.round(warnWindowMs / 60_000)}min)` };
  }
  const line = {
    ts: new Date(nowMs).toISOString(),
    event: "orch_preauth_expiring",
    kind: "orch_preauth_expiring",
    mission: PREAUTH_UNIT,
    hash16: reading.hash16,
    expiresAt: reading.expiresAt,
    remainingMinutes: Math.max(0, Math.round(remainingMs / 60_000)),
    msg: `preauth do unit ${PREAUTH_UNIT} (hash16 ${reading.hash16 ?? "?"}) expira em ${Math.max(0, Math.round(remainingMs / 60_000))}min (${reading.expiresAt}) — re-grant NUNCA automático, concessão é do operator`,
    source: "orchestrator-daemon",
  };
  const target = spoolPath ?? (process.env.ENG_MCP_SPOOL_PATH || "/opt/mission-events/spool.jsonl");
  try {
    appendFile(target, JSON.stringify(line) + "\n");
  } catch (error) {
    // fail-open: alerta nunca trava o ciclo
    return { alerted: false, reason: `spool fail-open: ${error instanceof Error ? error.message : String(error)}` };
  }
  return { alerted: true, mission: PREAUTH_UNIT, hash16: reading.hash16, expiresAt: reading.expiresAt, remainingMinutes: line.remainingMinutes };
}

export async function runDaemonCycle({ maxPromotions = 2, breakerDeps, consumeDeps } = {}) {
  if (!acquireLock()) {
    return { ok: false, reason: "lock held by another daemon cycle" };
  }
  try {
    // ORCH-CHAIN-CWD-01: alerta de expiração do preauth no INÍCIO de todo ciclo —
    // manifesto ativo do unit com expiração < 2h → spool orch_preauth_expiring + bus.
    // Fail-open: qualquer falha NUNCA trava o ciclo. Re-grant NUNCA automático.
    let preauthAlert = { alerted: false, reason: "não avaliado" };
    try {
      const startReading = readPreauthArtifact(orchPreauthPath());
      preauthAlert = emitPreauthExpiryAlert(startReading, { spoolPath: consumeDeps?.spoolPath });
    } catch (error) {
      preauthAlert = { alerted: false, reason: `fail-open: ${error instanceof Error ? error.message : String(error)}` };
    }
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
    // PLAN: dryRun — decisão sem efeito. consumeDeps (ORCH-TOOLS-01) permite provas
    // E2E herméticas (paths isolados) sem tocar produção.
    // ORCH-PREAUTH-ARTIFACT-01: o artefato é validado em TODO ciclo (o resultado do
    // ciclo sempre carrega preauth + approvalSource — auditoria por ciclo no state jsonl).
    const { approval, approvalSource, preauth } = resolveCycleApproval();
    const plan = await runOrchestrateConsume({ dryRun: true, maxPromotions }, consumeDeps);
    if (!plan || plan.promoted === 0) {
      const hygiene = await maybeHygieneCycle();
      return { ok: true, mode: "plan", plan, executed: null, approvalSource, preauth, preauthAlert, breaker, compaction: maybeCompactQueue(null), hygiene };
    }
    // EXECUTE: despacho real pelo caminho governado (mesma runMissionDispatch).
    // ORCH-DAEMON-01 FIX: execute exige approval.approved=true (guard de governança).
    // ORCH-PREAUTH-ARTIFACT-01: a approval vem do artefato preauth (approvalSource
    // "artifact") ou, em fallback, do env ORCH_DAEMON_APPROVED=1 ("env") — sem
    // nenhuma das duas, o ciclo permanece em PLAN/awaiting_approval (fail-closed).
    if (!approval) {
      const hygiene = await maybeHygieneCycle();
      return { ok: true, mode: "plan", plan, executed: null, note: "promovíveis aguardam approval (artefato preauth ausente/expirado/revogado e ORCH_DAEMON_APPROVED indefinido)", approvalSource, preauth, preauthAlert, breaker, compaction: maybeCompactQueue(null), hygiene };
    }
    // ORCH-PREAUTH-01 (elo final): o daemon injeta o MESMO caminho governado do
    // tools.ts (runMissionDispatch) — antes ele chamava execute sem handler e o
    // fail-closed bloqueava TODAS as intents ("sem handler de dispatch configurado").
    const executed = await runOrchestrateConsume({
      maxPromotions, execute: true, approval,
    }, {
      // ORCH-TOOLS-01: consumeDeps herméticos (provas E2E) passam TAMBÉM ao execute —
      // sem isso o execute cairia nos paths de produção.
      ...consumeDeps,
      // ORCH-TOOLS-01: handler de tool_call in-processo (tiers 1/2) — MESMO executor
      // do tools.ts (sem provider de catálogo: o daemon não constrói catálogo).
      toolCallHandler: createToolCallHandler(),
      // ORCH-CHAIN-CWD-01: despacho injetável para provas E2E herméticas (recorder) —
      // produção segue SEMPRE no caminho real governado (runMissionDispatch).
      dispatchMission: consumeDeps?.dispatchMission ?? (async (i) => {
        try {
          // ORCH-CHAIN-CWD-01: cwd/spawnedBy propagados do payload do intent (o consume
          // já resolveu os defaults documentados — /opt/mission-events e "operator") e
          // chainBasis="payload": o gate do plugin lê o pai da cadeia EXCLUSIVAMENTE da
          // declaração do payload; ambiente (pane do daemon) NUNCA decide.
          const result = await runMissionDispatch({
            missionId: i.missionId,
            promptFile: i.promptFile,
            cwd: i.cwd, // cwd do payload → ledger nasce fiel ao intent
            spawnedBy: i.spawnedBy,
            chainBasis: i.chainBasis,
          });
          if (result && result && result.ok === true) return { ok: true };
          const err = result ?? {};
          return { ok: false, error: `${String(err.error ?? "dispatch refused")}: ${String(err.detail ?? "")}`.trimEnd() };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }),
    });
    const hygiene = await maybeHygieneCycle();
    return { ok: true, mode: "execute", plan, executed, approvalSource, preauth, preauthAlert, breaker, compaction: maybeCompactQueue(executed), hygiene };
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