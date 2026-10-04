// ORCH-PREAUTH-ARTIFACT-01: E2E no runner — ciclo REAL do daemon (runDaemonCycle)
// com o artefato preauth de teste em caminho override (env ORCH_PREAUTH_PATH).
//   ciclo 1: artefato VÁLIDO   → execute (despacho tentado pelo caminho governado;
//              handler recusa INVALID_CWD em worktree inexistente — zero pane/efeito)
//   ciclo 2: artefato EXPIRADO → plan (awaiting_approval fail-closed, exit 0)
//   ciclo 3: expirado + env ORCH_DAEMON_APPROVED=1 → execute com approvalSource "env"
//              (compatibilidade até o operador revogar)
// Isolado: fila/estado/spool/audit em fixtures sob o cwd (montado no runner); breaker
// no-op; exec de probe hermético (systemctl --failed → vazio: bloqueio ambiental do
// host não é o gate sob prova); compactação/higiene desligadas. Prova gravada em
// e2e-ORCH-PREAUTH-ARTIFACT-01.json. Run: node --import tsx e2e-ORCH-PREAUTH-ARTIFACT-01.mjs
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { runDaemonCycle, resolveCycleApproval } from "./src/orchestrateConsumeDaemon.mjs";
import { artifactHash16, ORCH_PREAUTH_SUBJECT } from "./src/orchPreauthArtifact.ts";

const FIX = join(process.cwd(), ".e2e-ORCH-PREAUTH-ARTIFACT-01");
rmSync(FIX, { recursive: true, force: true });
mkdirSync(FIX, { recursive: true });

function contractArtifact(overrides = {}) {
  const body = {
    issuer: "operator",
    subject: ORCH_PREAUTH_SUBJECT,
    grantedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    scope: ["mission_dispatch", "tool_call:tier2"],
    ...overrides,
  };
  return { ...body, hash: artifactHash16(body) };
}

const validPath = join(FIX, "valido.json");
const expiredPath = join(FIX, "expirado.json");
writeFileSync(validPath, JSON.stringify(contractArtifact(), null, 2) + "\n");
writeFileSync(expiredPath, JSON.stringify(contractArtifact({ expiresAt: new Date(Date.now() - 60_000).toISOString() }), null, 2) + "\n");

const prompt = join(FIX, "prompt-fixture.md");
writeFileSync(prompt, "# E2E ORCH-PREAUTH-ARTIFACT-01\n\nFixture: o handler de dispatch recusa o cwd inexistente (INVALID_CWD) ANTES de criar qualquer pane.\n");
const worktreeInexistente = join(FIX, "nao-existe", "worktree");

function cycleFixtures(n) {
  const dir = join(FIX, `ciclo-${n}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "mission-state"), { recursive: true });
  const queuePath = join(dir, "queue.jsonl");
  writeFileSync(queuePath, JSON.stringify({
    id: `e2e-preauth-ciclo-${n}`,
    type: "mission_dispatch",
    payload: { missionId: `PREAUTH-ARTIFACT-E2E-CICLO-${n}`, prompt, worktree: worktreeInexistente },
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
  };
}

// Probes herméticos: systemctl --failed → "" (bloqueio ambiental do host não é o gate
// sob prova); demais exec (df) → null. Load/mem/swap seguem reais (máquina calma).
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

async function runCycle(n, env) {
  const consumeDeps = cycleFixtures(n);
  const restore = setEnv(env);
  try {
    // Lock do daemon é compartilhado com o timer de produção (tmpdir, 30s) — o E2E
    // re-tenta até 3x se perder a disputa de lock (race com o timer 2min).
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const cycle = await runDaemonCycle({ consumeDeps, breakerDeps });
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

const checks = {};
const addCheck = (id, verdict, detail) => { checks[id] = { verdict: verdict === true, detail: detail ?? null }; };

// ---- ciclo 1: artefato válido → execute ----
const validBefore = readFileSync(validPath);
const c1 = await runCycle(1, { ORCH_PREAUTH_PATH: validPath, ORCH_QUEUE_COMPACT: "0", ORCH_HYGIENE: "0" });
addCheck("ciclo1_mode_execute", c1.cycle.ok === true && c1.cycle.mode === "execute",
  `mode=${c1.cycle.mode} ok=${c1.cycle.ok} approvalSource=${c1.cycle.approvalSource}`);
addCheck("ciclo1_approvalSource_artifact", c1.cycle.approvalSource === "artifact", `approvalSource=${c1.cycle.approvalSource}`);
addCheck("ciclo1_preauth_valid", c1.cycle.preauth?.status === "valid" && /^[0-9a-f]{16}$/.test(String(c1.cycle.preauth?.hash16 ?? "")),
  JSON.stringify(c1.cycle.preauth ?? null));
addCheck("ciclo1_despacho_governado_recusado", readAudit(c1.consumeDeps).some((a) => a.decision === "REQUEUED" && /INVALID_CWD/.test(a.reason ?? "")),
  "audit REQUEUED com motivo INVALID_CWD (handler recusa cwd inexistente ANTES de criar pane — zero efeito)");
addCheck("anti_self_approve_artefato_inalterado", readFileSync(validPath).equals(validBefore), "bytes do artefato idênticos após o ciclo com approval");

// ---- ciclo 2: artefato expirado → plan (fail-closed) ----
const c2 = await runCycle(2, { ORCH_PREAUTH_PATH: expiredPath, ORCH_QUEUE_COMPACT: "0", ORCH_HYGIENE: "0" });
addCheck("ciclo2_mode_plan", c2.cycle.ok === true && c2.cycle.mode === "plan" && c2.cycle.executed === null,
  `mode=${c2.cycle.mode} executed=${JSON.stringify(c2.cycle.executed)} (ok=${c2.cycle.ok} — fail-closed é exit 0)`);
addCheck("ciclo2_awaiting_approval_none", c2.cycle.approvalSource === "none" && c2.cycle.preauth?.status === "expired",
  `approvalSource=${c2.cycle.approvalSource} preauth=${JSON.stringify(c2.cycle.preauth ?? null)}`);

// ---- ciclo 3: expirado + env → execute com approvalSource env (compat) ----
const c3 = await runCycle(3, { ORCH_PREAUTH_PATH: expiredPath, ORCH_DAEMON_APPROVED: "1", ORCH_QUEUE_COMPACT: "0", ORCH_HYGIENE: "0" });
addCheck("ciclo3_env_fallback_execute", c3.cycle.ok === true && c3.cycle.mode === "execute" && c3.cycle.approvalSource === "env",
  `mode=${c3.cycle.mode} approvalSource=${c3.cycle.approvalSource}`);
addCheck("ciclo3_log_honesto_preauth_expirado", c3.cycle.preauth?.status === "expired",
  `preauth=${JSON.stringify(c3.cycle.preauth ?? null)} (o ciclo carrega o estado REAL do artefato mesmo com fallback do env)`);

// resolveCycleApproval: precedência do artefato sobre o env
const prec = resolveCycleApproval({ ORCH_PREAUTH_PATH: validPath, ORCH_DAEMON_APPROVED: "1" });
addCheck("artefato_tem_precedencia_sobre_env", prec.approvalSource === "artifact", `approvalSource=${prec.approvalSource}`);

const verdicts = Object.values(checks);
const proof = {
  mission: "ORCH-PREAUTH-ARTIFACT-01",
  at: new Date().toISOString(),
  kind: "e2e no runner: ciclo REAL do daemon (runDaemonCycle) com artefato de teste em caminho override (env ORCH_PREAUTH_PATH)",
  hermetic: {
    fixtures: FIX,
    nota: "fila/estado/spool/audit sob o cwd (montado no runner); despacho recusado por INVALID_CWD (worktree inexistente) — zero pane, zero efeito em produção; breaker no-op; probe systemctl hermético; compactação/higiene desligadas",
  },
  checks,
  verdict: verdicts.every((v) => v.verdict === true) ? "PASS" : "FAIL",
};
writeFileSync(join(process.cwd(), "e2e-ORCH-PREAUTH-ARTIFACT-01.json"), JSON.stringify(proof, null, 2) + "\n");
console.log(JSON.stringify({ verdict: proof.verdict, checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.verdict])) }));
process.exit(proof.verdict === "PASS" ? 0 : 1);