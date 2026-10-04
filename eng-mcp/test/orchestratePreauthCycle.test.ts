// ORCH-PREAUTH-ARTIFACT-01: gate de despacho via ARTEFATO preauth no ciclo do daemon
// (node --import tsx --test). resolveCycleApproval cobre os 4 estados do contrato
// (sem artefato / válido / expirado / revogado ou hash divergente) + fallback compatível
// ao env ORCH_DAEMON_APPROVED=1. Testes de CICLO usam consumeDeps herméticos (padrão
// ORCH-TOOLS-01) — produção (fila/estado/spool/audit) intocada; o artefato fica em
// tmpdir do SO via env ORCH_PREAUTH_PATH (o leitor nunca escreve — bytes idênticos
// são provados após o ciclo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDaemonCycle, resolveCycleApproval, LOCK_PATH } from "../src/orchestrateConsumeDaemon.mjs";
import { artifactHash16, ORCH_PREAUTH_SUBJECT } from "../src/orchPreauthArtifact.ts";

const DIR = mkdtempSync(join(tmpdir(), "preauth-cycle-01-"));

function contractArtifact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    issuer: "operator",
    subject: ORCH_PREAUTH_SUBJECT,
    grantedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    scope: ["mission_dispatch", "tool_call:tier2"],
    ...overrides,
  };
  return { ...body, hash: artifactHash16(body) };
}

function artifactFixture(name: string, body: unknown): string {
  const path = join(DIR, name);
  writeFileSync(path, JSON.stringify(body, null, 2) + "\n");
  return path;
}

const VALID = artifactFixture("valido.json", contractArtifact());
const EXPIRED = artifactFixture("expirado.json", contractArtifact({ expiresAt: new Date(Date.now() - 60_000).toISOString() }));

// ---- resolveCycleApproval: os 4 estados do contrato + fallback do env ----

test("R1. sem artefato e sem env → approval none (fail-closed), preauth absent", () => {
  const r = resolveCycleApproval({ ORCH_PREAUTH_PATH: join(DIR, "nao-existe.json") } as NodeJS.ProcessEnv);
  assert.equal(r.approval, null);
  assert.equal(r.approvalSource, "none");
  assert.equal(r.preauth.status, "absent");
});

test("R2. artefato válido → approvalSource artifact, approval {approved:true}", () => {
  const r = resolveCycleApproval({ ORCH_PREAUTH_PATH: VALID } as NodeJS.ProcessEnv);
  assert.equal(r.approvalSource, "artifact");
  assert.deepEqual(r.approval, { approved: true });
  assert.equal(r.preauth.status, "valid");
  assert.match(String(r.preauth.hash16), /^[0-9a-f]{16}$/);
});

test("R3. artefato expirado sem env → approval none, preauth expired", () => {
  const r = resolveCycleApproval({ ORCH_PREAUTH_PATH: EXPIRED } as NodeJS.ProcessEnv);
  assert.equal(r.approval, null);
  assert.equal(r.approvalSource, "none");
  assert.equal(r.preauth.status, "expired");
});

test("R4. artefato revogado → approval none (fail-closed)", () => {
  const revoked = artifactFixture("revogado.json", { revoked: true });
  const r = resolveCycleApproval({ ORCH_PREAUTH_PATH: revoked } as NodeJS.ProcessEnv);
  assert.equal(r.approval, null);
  assert.equal(r.preauth.status, "revoked");
});

test("R5. hash divergente → approval none (fail-closed)", () => {
  const divergente = contractArtifact();
  divergente.issuer = "intruso";
  const path = artifactFixture("hash-divergente.json", divergente);
  const r = resolveCycleApproval({ ORCH_PREAUTH_PATH: path } as NodeJS.ProcessEnv);
  assert.equal(r.approval, null);
  assert.equal(r.preauth.status, "hash_mismatch");
});

test("R6. fallback compatível: artefato inválido + ORCH_DAEMON_APPROVED=1 → approvalSource env", () => {
  for (const status of ["absent", "expired", "revoked", "hash_mismatch"]) {
    const path = status === "absent" ? join(DIR, "nao-existe.json")
      : status === "expired" ? EXPIRED
      : status === "revoked" ? artifactFixture("revogado-fb.json", { revoked: true })
      : artifactFixture("hash-div-fb.json", { ...contractArtifact(), issuer: "intruso" });
    const r = resolveCycleApproval({ ORCH_PREAUTH_PATH: path, ORCH_DAEMON_APPROVED: "1" } as NodeJS.ProcessEnv);
    assert.equal(r.approvalSource, "env", `status ${status} cai no fallback do env`);
    assert.deepEqual(r.approval, { approved: true });
    assert.equal(r.preauth.status, status, `preauth carrega o estado real (${status}) — log honesto`);
  }
});

test("R7. artefato válido tem precedência sobre o env (approvalSource artifact)", () => {
  const r = resolveCycleApproval({ ORCH_PREAUTH_PATH: VALID, ORCH_DAEMON_APPROVED: "1" } as NodeJS.ProcessEnv);
  assert.equal(r.approvalSource, "artifact");
});

// ---- ciclo real do daemon (consumeDeps herméticos) ----

interface CycleDeps { consumeDeps: Record<string, string>; breakerDeps: Record<string, unknown>; queuePath: string; dispatchCalls: unknown[]; }

function hermeticDeps(): CycleDeps {
  const tmp = mkdtempSync(join(tmpdir(), "preauth-cycle-e2e-"));
  const queuePath = join(tmp, "queue.jsonl");
  const dispatchCalls: unknown[] = [];
  const consumeDeps = {
    queuePath,
    consumerStatePath: join(tmp, "consumer-state.json"),
    consumerLockPath: join(tmp, "consumer.lock"),
    spoolPath: join(tmp, "spool.jsonl"),
    consumeAuditPath: join(tmp, "consume-audit.jsonl"),
    missionStateDir: join(tmp, "mission-state"),
    // RD-ORCH-FILA-01: opt-out hermético do scan roadmap — path inexistente →
    // fail-open "roadmap-ausente" (o ciclo do teste NUNCA lê o ROADMAP real de
    // produção nem enfileira linhas reais na fila fake do fixture).
    roadmapPath: join(tmp, "ROADMAP-ausente.md"),
    // ZERO-EFEITO ESTRUTURAL (pós-ORCH-CHAIN-CWD-01 em voo): o spy substitui o
    // handler real de despacho — um teste de gate NUNCA pode criar pane real, nem
    // quando o comportamento de recusa (INVALID_CWD) muda por WIP de missão irmã.
    // A recusa real pelo caminho governado foi provada NESTA missão na entrega
    // (audit REQUEUED/INVALID_CWD, cabeça d749a291 e anteriores) e permanece
    // provada em HEAD; o que este teste prova é o GATE (approval por artefato).
    dispatchMission: async (input: unknown) => { dispatchCalls.push(input); return { ok: true }; },
  };
  // O plan THROTTLE se mission-state for ilegível (fail-open conservador) — fixture existe.
  mkdirSync(consumeDeps.missionStateDir, { recursive: true });
  // Probes de execução herméticos: systemctl --failed → vazio (0 unidades failed —
  // o bloqueio "systemd com N unidade(s) failed" é estado AMBIENTAL do host, não do
  // gate sob prova); demais probes de exec (df) → null (não bloqueia). Probes de
  // pressão (load/mem/psi/budget/agents) apontam para paths INEXISTENTES do fixture —
  // null não bloqueia; o gate sob prova é a approval por artefato, não a pressão do host.
  const exec = (cmd: string) => (cmd === "systemctl" ? "" : null);
  const probeInexistente = join(tmp, "probe-inexistente");
  const consumeDepsExec = {
    ...consumeDeps,
    exec,
    loadavgPath: probeInexistente,
    meminfoPath: probeInexistente,
    psiPath: probeInexistente,
    budgetPath: probeInexistente,
    agentsPath: probeInexistente,
  } as unknown as Record<string, string>;
  const breakerDeps = {
    readText: () => null, readdir: () => [], existsSync: () => false,
    spoolPath: join(tmp, "breaker-spool.jsonl"), breakerStatePath: join(tmp, "breaker.json"),
    missionStateDir: join(tmp, "mission-state"),
    probePaneList: () => "ok",
    pauseMission: async () => ({ ok: true }), resumeMission: async () => ({ ok: true }),
    notify: async () => ({ delivered: true }),
  };
  return { consumeDeps: consumeDepsExec as unknown as Record<string, string>, breakerDeps, queuePath, dispatchCalls };
}

// Intent mission_dispatch com prompt REAL e worktree INEXISTENTE: o despacho segue
// pelo caminho governado (runMissionDispatch → handler) e o handler recusa com
// INVALID_CWD ANTES de criar qualquer pane — o ciclo prova o GATE sem efeito.
function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) prev[k] = process.env[k];
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
}

// Lock do daemon é COMPARTILHADO com o timer de produção (tmpdir, 30s de frescor) —
// quando o ciclo de produção o segura, runDaemonCycle devolve ok:false "lock held".
// Mesma tolerância do E2E: re-tentar até 5x (25s) antes de falhar — o gate sob prova
// não é o lock, é a approval por artefato.
async function cycleWithRetry(opts: { consumeDeps: Record<string, string>; breakerDeps: Record<string, unknown> }): Promise<Awaited<ReturnType<typeof runDaemonCycle>>> {
  let last: Awaited<ReturnType<typeof runDaemonCycle>> | null = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    last = await runDaemonCycle(opts);
    if (!(last.ok === false && /lock/.test(String(last.reason ?? "")))) return last;
    await new Promise((r) => setTimeout(r, 5_000));
  }
  return last!;
}

test("C1. ciclo: artefato válido → EXECUTE (gate aprova pelo artefato; despacho via SPY — zero efeito)", async () => {
  await withEnv({ ORCH_PREAUTH_PATH: VALID, ORCH_DAEMON_APPROVED: undefined, ORCH_QUEUE_COMPACT: "0", ORCH_HYGIENE: "0" }, async () => {
    const { consumeDeps, breakerDeps, queuePath, dispatchCalls } = hermeticDeps();
    const prompt = join(DIR, "prompt-fixture.md");
    writeFileSync(prompt, "# E2E ORCH-PREAUTH-ARTIFACT-01\n\nFixture de prova — despacho via spy, nunca handler real.\n");
    const worktreeInexistente = join(DIR, "nao-existe", "worktree");
    writeFileSync(queuePath, JSON.stringify({ id: "e2e-c1", type: "mission_dispatch", payload: { missionId: "PREAUTH-CYCLE-E2E-01", prompt, cwd: worktreeInexistente }, priority: 5, enqueuedAt: new Date().toISOString() }) + "\n");
    const cycle = await cycleWithRetry({ consumeDeps, breakerDeps });
    assert.equal(cycle.ok, true);
    assert.equal(cycle.mode, "execute");
    assert.equal(cycle.approvalSource, "artifact");
    assert.equal(cycle.preauth.status, "valid");
    assert.ok(cycle.executed, "execute rodou (não ficou em awaiting_approval)");
    const dec = (cycle.executed.results ?? []).find((r: { entryId: string }) => r.entryId === "e2e-c1");
    assert.ok(dec, "intent foi avaliada no execute");
    assert.equal(dec.action, "promoted", "despacho via spy ok (promoted) — NENHANDLER real, NENHUMA pane");
    assert.equal(dispatchCalls.length, 1, "exatamente 1 chamada de despacho (spy)");
    assert.equal((dispatchCalls[0] as { missionId?: string }).missionId, "PREAUTH-CYCLE-E2E-01");
  });
});

test("C2. ciclo: artefato expirado → PLAN (awaiting_approval fail-closed, approvalSource none, exit 0 ok)", async () => {
  await withEnv({ ORCH_PREAUTH_PATH: EXPIRED, ORCH_DAEMON_APPROVED: undefined, ORCH_QUEUE_COMPACT: "0", ORCH_HYGIENE: "0" }, async () => {
    const { consumeDeps, breakerDeps, queuePath } = hermeticDeps();
    const prompt = join(DIR, "prompt-fixture-2.md");
    writeFileSync(prompt, "# E2E ORCH-PREAUTH-ARTIFACT-01 (expirado)\n");
    writeFileSync(queuePath, JSON.stringify({ id: "e2e-c2", type: "mission_dispatch", payload: { missionId: "PREAUTH-CYCLE-E2E-02", prompt, cwd: join(DIR, "nao-existe", "worktree") }, priority: 5, enqueuedAt: new Date().toISOString() }) + "\n");
    const cycle = await cycleWithRetry({ consumeDeps, breakerDeps });
    assert.equal(cycle.ok, true); // fail-closed é exit 0 (modo plan), nunca crash
    assert.equal(cycle.mode, "plan");
    assert.equal(cycle.executed, null);
    assert.equal(cycle.approvalSource, "none");
    assert.equal(cycle.preauth.status, "expired");
    assert.match(String(cycle.note ?? ""), /approval/);
  });
});

test("C3. ciclo: ANTI-SELF-APPROVE — artefato com bytes idênticos após ciclo com approval artifact", async () => {
  await withEnv({ ORCH_PREAUTH_PATH: VALID, ORCH_DAEMON_APPROVED: undefined, ORCH_QUEUE_COMPACT: "0", ORCH_HYGIENE: "0" }, async () => {
    const { consumeDeps, breakerDeps, queuePath } = hermeticDeps();
    const prompt = join(DIR, "prompt-fixture-3.md");
    writeFileSync(prompt, "# E2E ORCH-PREAUTH-ARTIFACT-01 (anti-self-approve)\n");
    writeFileSync(queuePath, JSON.stringify({ id: "e2e-c3", type: "mission_dispatch", payload: { missionId: "PREAUTH-CYCLE-E2E-03", prompt, cwd: join(DIR, "nao-existe", "worktree") }, priority: 5, enqueuedAt: new Date().toISOString() }) + "\n");
    const before = readFileSync(VALID);
    await runDaemonCycle({ consumeDeps, breakerDeps });
    assert.equal(readFileSync(VALID).equals(before), true, "o ciclo NUNCA altera o artefato (só lê)");
  });
});

test("C4. ciclo: fila sem promovíveis → modo plan, approvalSource/preauth ainda auditados (validação a cada ciclo)", async () => {
  await withEnv({ ORCH_PREAUTH_PATH: VALID, ORCH_QUEUE_COMPACT: "0", ORCH_HYGIENE: "0" }, async () => {
    const { consumeDeps, breakerDeps } = hermeticDeps();
    const cycle = await cycleWithRetry({ consumeDeps, breakerDeps });
    assert.equal(cycle.ok, true);
    assert.equal(cycle.mode, "plan");
    assert.equal(cycle.approvalSource, "artifact");
    assert.equal(cycle.preauth.status, "valid");
  });
});