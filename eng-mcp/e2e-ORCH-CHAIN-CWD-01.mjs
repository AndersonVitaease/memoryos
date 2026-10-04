// ORCH-CHAIN-CWD-01: E2E determinístico no runner — ciclo REAL do daemon
// (runDaemonCycle) com fixtures herméticos sob o cwd, cobrindo (a)-(d) do contrato:
//   (a) intent com spawnedBy explícito → 1ª tentativa aceita (recorder), zero
//       dead-letter; pai da cadeia propagado do payload com chainBasis=payload
//   (a-real) caminho REAL do dispatch (plugin governado) intacto: spawnedBy explícito
//       + cwd inexistente → recusa INVALID_CWD ANTES de qualquer pane (zero efeito)
//   (b) intent com payload.cwd → despacho com o cwd verbatim + audit cwd_source=payload
//   (c) payload.cwd ausente → /opt/mission-events + audit cwd_source=default
//   (d) preauth do unit expirando em 1h → spool orch_preauth_expiring (mission/hash16/
//       expiresAt) no ciclo seguinte, SEM re-grant (bytes do artefato intocos); fora
//       da janela (6h) → sem alerta
//   (e) suíte completa re-executada com allowlist ambiental vigente (LIVE /mcp-proxy;
//       GLGPD-02 fixture proof) e AMBIENT_EXTRA=0
// Isolado: fila/estado/spool/audit em tmpdirs; breaker no-op; compactação/higiene
// desligadas. Prova gravada em e2e-ORCH-CHAIN-CWD-01.json.
// Run: node --import tsx e2e-ORCH-CHAIN-CWD-01.mjs
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDaemonCycle } from "./src/orchestrateConsumeDaemon.mjs";
import { artifactHash16, ORCH_PREAUTH_SUBJECT } from "./src/orchPreauthArtifact.ts";

const FIX = join(process.cwd(), ".e2e-ORCH-CHAIN-CWD-01");
rmSync(FIX, { recursive: true, force: true });
mkdirSync(FIX, { recursive: true });

const prompt = join(FIX, "prompt-fixture.md");
writeFileSync(prompt, "# E2E ORCH-CHAIN-CWD-01\n\nFixture: despacho real recusado em cwd inexistente (INVALID_CWD) ANTES de criar qualquer pane.\n");
const cwdInexistente = join(FIX, "nao-existe", "worktree");

function fixturePreauth(expiresInMs) {
  const body = {
    issuer: "operator",
    subject: ORCH_PREAUTH_SUBJECT,
    grantedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    scope: ["mission_dispatch", "tool_call:tier2"],
  };
  return { ...body, hash: artifactHash16(body) };
}
const preauth1h = join(FIX, "preauth-expira-1h.json");
writeFileSync(preauth1h, JSON.stringify(fixturePreauth(60 * 60_000), null, 2) + "\n");
const preauth6h = join(FIX, "preauth-expira-6h.json");
writeFileSync(preauth6h, JSON.stringify(fixturePreauth(6 * 60 * 60_000), null, 2) + "\n");

function cycleFixtures(n, intent) {
  const dir = mkdtempSync(join(tmpdir(), `orch-chain-cwd-ciclo-${n}-`));
  mkdirSync(join(dir, "mission-state"), { recursive: true });
  const queuePath = join(dir, "queue.jsonl");
  writeFileSync(queuePath, JSON.stringify({
    id: `e2e-chain-cwd-ciclo-${n}`,
    type: "mission_dispatch",
    payload: intent,
    priority: 5,
    enqueuedAt: new Date().toISOString(),
  }) + "\n");
  return {
    queuePath,
    consumerStatePath: join(dir, "consumer-state.json"),
    consumerLockPath: join(dir, "consumer.lock"),
    spoolPath: join(dir, "spool.jsonl"),
    consumeAuditPath: join(dir, "consume-audit.jsonl"),
    missionStateDir: join(dir, "mission-state"),
    loadavgPath: join(dir, "probe-inexistente"),
    meminfoPath: join(dir, "probe-inexistente"),
    psiPath: join(dir, "probe-inexistente"),
    budgetPath: join(dir, "probe-inexistente"),
    agentsPath: join(dir, "probe-inexistente"),
    exec: execProbe,
  };
}

const execProbe = (cmd) => (cmd === "systemctl" ? "" : null);
const breakerDeps = {
  readText: () => null, readdir: () => [], existsSync: () => false,
  spoolPath: join(FIX, "breaker-spool.jsonl"), breakerStatePath: join(FIX, "breaker.json"),
  missionStateDir: join(FIX, "mission-state-broken"),
  probePaneList: () => "ok",
  pauseMission: async () => ({ ok: true }), resumeMission: async () => ({ ok: true }),
  notify: async () => ({ delivered: true }),
};

function setEnv(env) {
  const keys = ["ORCH_PREAUTH_PATH", "ORCH_DAEMON_APPROVED", "ORCH_QUEUE_COMPACT", "ORCH_HYGIENE"];
  const prev = {};
  for (const k of keys) prev[k] = process.env[k];
  for (const k of keys) {
    if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k];
  }
  return () => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k];
    }
  };
}

// Recorder: despacho injetado (prova do consume→dispatch); produção segue no caminho real.
function recorderFixture() {
  const captured = [];
  return { captured, dispatchMission: async (i) => { captured.push(i); return { ok: true }; } };
}

async function runCycle(n, env, extraDeps = {}) {
  const consumeDeps = cycleFixtures(n, extraDeps.intent ?? { missionId: `X-${n}`, prompt, spawnedBy: "operator" });
  if (typeof extraDeps.dispatchMission === "function") {
    consumeDeps.dispatchMission = extraDeps.dispatchMission; // recorder (consume→dispatch injetado)
  }
  const restore = setEnv(env);
  try {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const cycle = await runDaemonCycle({ consumeDeps, breakerDeps, ...extraDeps });
      if (!(cycle.ok === false && /lock/.test(String(cycle.reason ?? "")))) {
        return { cycle, consumeDeps };
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }
    return { cycle: { ok: false, reason: "lock held after 3 retries" }, consumeDeps };
  } finally {
    restore();
  }
}

function readAudit(consumeDeps) {
  const p = consumeDeps.consumeAuditPath;
  return existsSync(p) ? readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
}
function readSpool(consumeDeps) {
  const p = consumeDeps.spoolPath;
  return existsSync(p) ? readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
}

const checks = {};
const addCheck = (id, verdict, detail) => { checks[id] = { verdict: verdict === true, detail: detail ?? null }; };

// ---- (a) intent com spawnedBy explícito → 1ª tentativa aceita, zero dead-letter ----
const recA = recorderFixture();
const cA = await runCycle(1, { ORCH_PREAUTH_PATH: preauth6h, ORCH_QUEUE_COMPACT: "0", ORCH_HYGIENE: "0" }, { intent: { missionId: "CHAIN-E2E-A", prompt, spawnedBy: "PAI-EXPLICITO-01", cwd: "/opt/memoryos/eng-mcp" }, dispatchMission: recA.dispatchMission });
addCheck("a_primeira_tentativa_aceita", cA.cycle.ok === true && cA.cycle.mode === "execute" && cA.cycle.executed?.promoted === 1 && cA.cycle.executed?.requeued === 0 && cA.cycle.executed?.deadLettered === 0,
  `mode=${cA.cycle.mode} promoted=${cA.cycle.executed?.promoted} requeued=${cA.cycle.executed?.requeued} deadLettered=${cA.cycle.executed?.deadLettered}`);
addCheck("a_pai_da_cadeia_do_payload", recA.captured.length === 1 && recA.captured[0].spawnedBy === "PAI-EXPLICITO-01" && recA.captured[0].chainBasis === "payload",
  `captured=${JSON.stringify(recA.captured[0] ?? null)}`);
addCheck("a_cwd_do_payload", recA.captured[0]?.cwd === "/opt/memoryos/eng-mcp" && recA.captured[0]?.cwdSource === "payload",
  `cwd=${recA.captured[0]?.cwd} cwdSource=${recA.captured[0]?.cwdSource}`);

// ---- (a-real) caminho REAL do dispatch: spawnedBy explícito + cwd inexistente → recusa honesta, zero pane ----
const cReal = await runCycle(2, { ORCH_PREAUTH_PATH: preauth6h, ORCH_QUEUE_COMPACT: "0", ORCH_HYGIENE: "0" }, { intent: { missionId: "CHAIN-E2E-REAL", prompt, spawnedBy: "operator", cwd: cwdInexistente } });
addCheck("areal_wiring_real_intacto", readAudit(cReal.consumeDeps).some((a) => a.decision === "REQUEUED" && /INVALID_CWD/.test(String(a.reason ?? ""))),
  "audit REQUEUED com motivo INVALID_CWD (plugin governado recusa cwd inexistente ANTES de pane — zero efeito)");
addCheck("areal_sem_dead_letter_na_1a", cReal.cycle.executed?.deadLettered === 0, `deadLettered=${cReal.cycle.executed?.deadLettered}`);

// ---- (b) intent com payload.cwd → despacho verbatim + audit cwd_source=payload ----
const recB = recorderFixture();
const cB = await runCycle(3, { ORCH_PREAUTH_PATH: preauth6h, ORCH_QUEUE_COMPACT: "0", ORCH_HYGIENE: "0" }, { intent: { missionId: "CHAIN-E2E-B", prompt, spawnedBy: "operator", cwd: "/opt/memoryos/eng-mcp" }, dispatchMission: recB.dispatchMission });
addCheck("b_cwd_payload_verbatim", recB.captured[0]?.cwd === "/opt/memoryos/eng-mcp" && recB.captured[0]?.cwdSource === "payload",
  `captured=${JSON.stringify(recB.captured[0] ?? null)}`);
const auditB = readAudit(cB.consumeDeps).find((a) => a.decision === "PROMOTED");
addCheck("b_audit_cwd_source_payload", auditB?.cwd === "/opt/memoryos/eng-mcp" && auditB?.cwd_source === "payload", `audit=${JSON.stringify(auditB ?? null)}`);

// ---- (c) payload.cwd ausente → /opt/mission-events + audit cwd_source=default ----
const recC = recorderFixture();
const cC = await runCycle(4, { ORCH_PREAUTH_PATH: preauth6h, ORCH_QUEUE_COMPACT: "0", ORCH_HYGIENE: "0" }, { intent: { missionId: "CHAIN-E2E-C", prompt, spawnedBy: "operator" }, dispatchMission: recC.dispatchMission });
addCheck("c_cwd_default_documentado", recC.captured[0]?.cwd === "/opt/mission-events" && recC.captured[0]?.cwdSource === "default",
  `captured=${JSON.stringify(recC.captured[0] ?? null)}`);
const auditC = readAudit(cC.consumeDeps).find((a) => a.decision === "PROMOTED");
addCheck("c_audit_cwd_source_default", auditC?.cwd === "/opt/mission-events" && auditC?.cwd_source === "default", `audit=${JSON.stringify(auditC ?? null)}`);

// ---- (d) preauth expirando em 1h → alerta no ciclo; SEM re-grant ----
const preauth1hBefore = readFileSync(preauth1h);
const cD = await runCycle(5, { ORCH_PREAUTH_PATH: preauth1h, ORCH_QUEUE_COMPACT: "0", ORCH_HYGIENE: "0" }, { intent: { missionId: "CHAIN-E2E-D", prompt, spawnedBy: "operator" }, dispatchMission: async () => ({ ok: true }) });
const alertEvents = readSpool(cD.consumeDeps).filter((e) => e.event === "orch_preauth_expiring");
addCheck("d_alerta_tipado_no_ciclo", cD.cycle.preauthAlert?.alerted === true && alertEvents.length === 1,
  `preauthAlert=${JSON.stringify(cD.cycle.preauthAlert ?? null)} spool=${alertEvents.length}`);
const evD = alertEvents[0] ?? {};
addCheck("d_alerta_mission_hash16_expiresat", evD.mission === "orch-daemon-consume" && /^[0-9a-f]{16}$/.test(String(evD.hash16 ?? "")) && typeof evD.expiresAt === "string" && evD.expiresAt === cD.cycle.preauth?.expiresAt,
  `ev=${JSON.stringify({ mission: evD.mission, hash16: evD.hash16, expiresAt: evD.expiresAt })}`);
addCheck("d_sem_regrant_artefato_intocado", readFileSync(preauth1h).equals(preauth1hBefore) && cD.cycle.preauth?.status === "valid",
  "bytes do artefato idênticos após o ciclo (re-grant NUNCA automático; daemon só lê)");

// ---- (d2) fora da janela (6h) → sem alerta ----
const cD2 = await runCycle(6, { ORCH_PREAUTH_PATH: preauth6h, ORCH_QUEUE_COMPACT: "0", ORCH_HYGIENE: "0" }, { intent: { missionId: "CHAIN-E2E-D2", prompt, spawnedBy: "operator" }, dispatchMission: async () => ({ ok: true }) });
addCheck("d2_sem_alerta_fora_da_janela", cD2.cycle.preauthAlert?.alerted === false && readSpool(cD2.consumeDeps).every((e) => e.event !== "orch_preauth_expiring"),
  `preauthAlert=${JSON.stringify(cD2.cycle.preauthAlert ?? null)}`);

// ---- (e) suíte completa re-executada (allowlist ambiental vigente, AMBIENT_EXTRA=0) ----
const TAP = join(process.cwd(), "e2e-ORCH-CHAIN-CWD-01.tap");
const suiteCmd = `cd ${process.cwd()} && PATH=/usr/local/bin:/usr/bin:/bin node --import tsx --test --test-force-exit --test-concurrency=4 --test-reporter=tap test/*.test.ts test/*.test.mjs > ${TAP} 2>&1; NOTOK=$(grep -c "^not ok" ${TAP}); AMBIENT=$(grep "^not ok" ${TAP} | grep -cvE "LIVE /mcp-proxy|GLGPD-02 fixture proof"); PASS=$(grep "^# pass " ${TAP} | grep -oE "[0-9]+" | head -1); echo "SUITE NOTOK=$NOTOK AMBIENT_EXTRA=$AMBIENT PASS=$PASS"; test "$AMBIENT" = 0 && test "$PASS" -ge 1790`;
let suiteOut = "";
let suiteOk = false;
try {
  const { execFileSync } = await import("node:child_process");
  suiteOut = execFileSync("bash", ["-lc", suiteCmd], { timeout: 600_000, encoding: "utf8" });
  suiteOk = /AMBIENT_EXTRA=0/.test(suiteOut);
} catch (error) {
  suiteOut = `${error.stdout ?? ""}${error.stderr ?? ""}`.slice(-2000);
  suiteOk = false;
}
addCheck("e_suite_completa_ambient_extra_0", suiteOk, suiteOut.trim().slice(-400));

// ---- veredito ----
const allOk = Object.values(checks).every((c) => c.verdict);
const report = { mission: "ORCH-CHAIN-CWD-01", at: new Date().toISOString(), ok: allOk, checks, suite: { tap: TAP, tail: suiteOut.trim().slice(-120) } };
writeFileSync(join(process.cwd(), "e2e-ORCH-CHAIN-CWD-01.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
process.exit(allOk ? 0 : 1);