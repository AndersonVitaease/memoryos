// ORCH-CHAIN-CWD-01 — unit tests herméticos (padrão orchestrateConsume.test.ts):
// (a) intent com spawnedBy explícito → despacho na 1ª tentativa, zero requeue/dead-letter,
//     pai da cadeia propagado do payload (chainBasis=payload — ambiente nunca decide);
// (b) intent com payload.cwd → despacho com o cwd verbatim + audit cwd_source=payload;
// (c) payload.cwd ausente → cwd=/opt/mission-events + audit cwd_source=default;
// (d) preauth expirando em <2h → alerta tipado orch_preauth_expiring (mission/hash16/
//     expiresAt), sem re-grant (artefato intocado); fora da janela/expirado → sem alerta.
// Zero mutation fora dos paths injetados; nada toca /opt/mission-events nem /root/.hermes.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runOrchestrateConsume,
  runOrchestrateEnqueue,
  resolveChainDispatch,
  DEFAULT_DISPATCH_CWD,
  DEFAULT_SPAWNED_BY,
  type OrchestratorConsumerState,
} from "../src/orchestrate.ts";
import { emitPreauthExpiryAlert, PREAUTH_EXPIRY_WARN_MS } from "../src/orchestrateConsumeDaemon.mjs";
import { artifactHash16, ORCH_PREAUTH_SUBJECT } from "../src/orchPreauthArtifact.ts";

const PROMPT_FILE = "/tmp/orch-chain-cwd-test/prompt.txt";
const PATHS = {
  queuePath: "/tmp/orch-chain-cwd-test/orchestrator-queue.jsonl",
  consumerStatePath: "/tmp/orch-chain-cwd-test/orchestrator-consumer.state.json",
  consumerLockPath: "/tmp/orch-chain-cwd-test/orchestrator-consumer.lock",
  spoolPath: "/tmp/orch-chain-cwd-test/spool.jsonl",
  consumeAuditPath: "/tmp/orch-chain-cwd-test/orchestrate-consume-audit.jsonl",
  missionStateDir: "/tmp/orch-chain-cwd-test/state",
};

interface DispatchInput { missionId: string; promptFile?: string; worktree?: string; priority?: number; spawnedBy?: string; cwd?: string; cwdSource?: string; chainBasis?: string }

function makeDeps(overrides: Record<string, unknown> = {}) {
  const queue: string[] = [];
  const spool: string[] = [];
  const audit: Array<Record<string, unknown>> = [];
  const state: OrchestratorConsumerState = { status: "stopped", lastPromotion: null, lastPromotionId: null, promotedCount: 0, skippedCount: 0, blockedCount: 0, requeuedCount: 0, deadLetteredCount: 0, updatedAt: null, promotedIds: [] };
  const lock = { held: false };
  return {
    queue, spool, audit, state, lock,
    ...PATHS,
    readText: (path: string) => {
      if (path.endsWith("orchestrator-queue.jsonl")) return queue.length > 0 ? queue.join("\n") : null;
      if (path.endsWith("orchestrator-consumer.state.json")) return JSON.stringify(state);
      return null;
    },
    now: () => Date.now(),
    writeText: (path: string, data: string) => {
      if (path.endsWith("orchestrator-consumer.state.json")) Object.assign(state, JSON.parse(data));
    },
    appendFile: (path: string, data: string) => {
      if (path.endsWith("orchestrator-queue.jsonl")) queue.push(data.trim());
      if (path.endsWith("spool.jsonl")) spool.push(data.trim());
      if (path.endsWith("orchestrate-consume-audit.jsonl")) audit.push(JSON.parse(data.trim()));
    },
    unlink: (path: string) => {
      if (path.endsWith("orchestrator-consumer.lock")) lock.held = false;
    },
    existsSync: (path: string) => path.endsWith("orchestrator-queue.jsonl") || path === PROMPT_FILE,
    readdir: () => [],
    exec: () => null,
    dispatchMission: async (_i: DispatchInput) => ({ ok: true }),
    ...overrides,
  };
}

function enqueue(queue: string[], id: string, type: string, payload: Record<string, unknown> = {}, priority = 5) {
  queue.push(JSON.stringify({ id, type, payload, priority, enqueuedAt: new Date().toISOString() }));
}

// ---- (a) spawnedBy explícito: 1ª tentativa aceita, pai da cadeia = payload ----

test("(a) intent com spawnedBy explícito → despacho na 1ª tentativa, zero requeue/dead-letter, pai propagado do payload com chainBasis=payload", async () => {
  const deps = makeDeps();
  const dispatches: DispatchInput[] = [];
  deps.dispatchMission = async (i: DispatchInput) => { dispatches.push(i); return { ok: true }; };
  enqueue(deps.queue, "a1", "mission_dispatch", { missionId: "FILHO-A", promptFile: PROMPT_FILE, spawnedBy: "PAI-A-01", cwd: "/opt/memoryos/eng-mcp" });
  const result = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps } as any);
  assert.equal(result.promoted, 1);
  assert.equal(result.requeued, 0);
  assert.equal(result.deadLettered, 0);
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].spawnedBy, "PAI-A-01");
  assert.equal(dispatches[0].chainBasis, "payload"); // gate lê o pai EXCLUSIVAMENTE da declaração
  assert.equal(dispatches[0].cwd, "/opt/memoryos/eng-mcp");
  // audit carrega spawned_by do payload
  const promoted = deps.audit.find((a) => a.decision === "PROMOTED");
  assert.ok(promoted, "audit PROMOTED presente");
  assert.equal(promoted?.spawned_by, "PAI-A-01");
});

test("(a) spawnedBy ausente no intent (legado) → consume usa o default documentado operator (nunca ambiente)", async () => {
  const deps = makeDeps();
  const dispatches: DispatchInput[] = [];
  deps.dispatchMission = async (i: DispatchInput) => { dispatches.push(i); return { ok: true }; };
  enqueue(deps.queue, "a2", "mission_dispatch", { missionId: "FILHO-B", promptFile: PROMPT_FILE });
  await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps } as any);
  assert.equal(dispatches[0].spawnedBy, DEFAULT_SPAWNED_BY);
  assert.equal(dispatches[0].chainBasis, "payload");
});

// ---- (b) payload.cwd propagado + cwd_source=payload ----

test("(b) intent com payload.cwd → despacho com o cwd verbatim e audit cwd_source=payload", async () => {
  const deps = makeDeps();
  const dispatches: DispatchInput[] = [];
  deps.dispatchMission = async (i: DispatchInput) => { dispatches.push(i); return { ok: true }; };
  enqueue(deps.queue, "b1", "mission_dispatch", { missionId: "CWD-B", promptFile: PROMPT_FILE, cwd: "/opt/memoryos/eng-mcp", spawnedBy: "operator" });
  await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps } as any);
  assert.equal(dispatches[0].cwd, "/opt/memoryos/eng-mcp");
  assert.equal(dispatches[0].cwdSource, "payload");
  const promoted = deps.audit.find((a) => a.decision === "PROMOTED");
  assert.equal(promoted?.cwd, "/opt/memoryos/eng-mcp");
  assert.equal(promoted?.cwd_source, "payload");
});

test("(b) payload.cwd com espaços → trim (valor declarado fiel, sem ruído)", async () => {
  const deps = makeDeps();
  const dispatches: DispatchInput[] = [];
  deps.dispatchMission = async (i: DispatchInput) => { dispatches.push(i); return { ok: true }; };
  enqueue(deps.queue, "b2", "mission_dispatch", { missionId: "CWD-B2", promptFile: PROMPT_FILE, cwd: "  /opt/memoryos/eng-mcp  " });
  await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps } as any);
  assert.equal(dispatches[0].cwd, "/opt/memoryos/eng-mcp");
});

// ---- (c) cwd ausente → default + cwd_source=default no audit (nunca herdar silenciosamente) ----

test("(c) payload.cwd ausente → /opt/mission-events + audit cwd_source=default", async () => {
  const deps = makeDeps();
  const dispatches: DispatchInput[] = [];
  deps.dispatchMission = async (i: DispatchInput) => { dispatches.push(i); return { ok: true }; };
  enqueue(deps.queue, "c1", "mission_dispatch", { missionId: "CWD-C", promptFile: PROMPT_FILE, spawnedBy: "operator" });
  await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps } as any);
  assert.equal(dispatches[0].cwd, DEFAULT_DISPATCH_CWD);
  assert.equal(dispatches[0].cwdSource, "default");
  const promoted = deps.audit.find((a) => a.decision === "PROMOTED");
  assert.equal(promoted?.cwd, DEFAULT_DISPATCH_CWD);
  assert.equal(promoted?.cwd_source, "default");
});

test("(c) falha de dispatch re-enfileirada também audita cwd/cwd_source/spawned_by do payload", async () => {
  const deps = makeDeps();
  deps.dispatchMission = async () => ({ ok: false, error: "INVALID_CWD: cwd não existe: /x" });
  enqueue(deps.queue, "c2", "mission_dispatch", { missionId: "CWD-C2", promptFile: PROMPT_FILE, cwd: "/opt/memoryos/eng-mcp", spawnedBy: "PAI-C" });
  await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps } as any);
  const requeued = deps.audit.find((a) => a.decision === "REQUEUED");
  assert.ok(requeued, "audit REQUEUED presente");
  assert.equal(requeued?.cwd, "/opt/memoryos/eng-mcp");
  assert.equal(requeued?.cwd_source, "payload");
  assert.equal(requeued?.spawned_by, "PAI-C");
});

// ---- enqueue: validar/embedar spawnedBy (default documentado) ----
// Fila REAL em tmpdir: o enqueue grava com appendFileSync (fs real), então o embed
// e o dedupe precisam ler o mesmo arquivo (padrão orchestrateConsumeToolCall.test.ts).

test("enqueue embute spawnedBy=default operator + spawnedBySource=default quando o chamador não declara", () => {
  const dir = mkdtempSync(join(tmpdir(), "orch-chain-cwd-enq-"));
  const queuePath = join(dir, "orchestrator-queue.jsonl");
  const out = runOrchestrateEnqueue({ type: "mission_dispatch", payload: { missionId: "E1", promptFile: PROMPT_FILE } }, { queuePath, now: () => Date.now() } as any);
  assert.ok(out.enqueued);
  const stored = JSON.parse(readFileSync(queuePath, "utf8").trim().split("\n").pop()!);
  assert.equal(stored.payload.spawnedBy, "operator");
  assert.equal(stored.payload.spawnedBySource, "default");
});

test("enqueue preserva spawnedBy declarado + spawnedBySource=declared", () => {
  const dir = mkdtempSync(join(tmpdir(), "orch-chain-cwd-enq-"));
  const queuePath = join(dir, "orchestrator-queue.jsonl");
  runOrchestrateEnqueue({ type: "mission_dispatch", payload: { missionId: "E2", promptFile: PROMPT_FILE, spawnedBy: "PAI-E2" } }, { queuePath, now: () => Date.now() } as any);
  const stored = JSON.parse(readFileSync(queuePath, "utf8").trim());
  assert.equal(stored.payload.spawnedBy, "PAI-E2");
  assert.equal(stored.payload.spawnedBySource, "declared");
});

test("enqueue com spawnedBy inválido (não-string / vazio) → erro tipado, nada gravado", () => {
  const dir = mkdtempSync(join(tmpdir(), "orch-chain-cwd-enq-"));
  const queuePath = join(dir, "orchestrator-queue.jsonl");
  assert.throws(() => runOrchestrateEnqueue({ type: "mission_dispatch", payload: { missionId: "E3", promptFile: PROMPT_FILE, spawnedBy: 42 } } as any, { queuePath, now: () => Date.now() } as any), /ORCHESTRATE_ENQUEUE_INVALID_SPAWNED_BY/);
  assert.throws(() => runOrchestrateEnqueue({ type: "mission_dispatch", payload: { missionId: "E4", promptFile: PROMPT_FILE, spawnedBy: "  " } } as any, { queuePath, now: () => Date.now() } as any), /ORCHESTRATE_ENQUEUE_INVALID_SPAWNED_BY/);
  assert.ok(!existsSync(queuePath));
});

test("enqueue: dedupe consistente com/sem spawnedBy explícito (default operator é idempotente)", () => {
  const dir = mkdtempSync(join(tmpdir(), "orch-chain-cwd-enq-"));
  const queuePath = join(dir, "orchestrator-queue.jsonl");
  const deps = { queuePath, now: () => Date.now() };
  const first = runOrchestrateEnqueue({ type: "mission_dispatch", payload: { missionId: "E5", promptFile: PROMPT_FILE } }, deps as any);
  const second = runOrchestrateEnqueue({ type: "mission_dispatch", payload: { missionId: "E5", promptFile: PROMPT_FILE, spawnedBy: "operator" } }, deps as any);
  assert.ok(first.enqueued);
  assert.ok(second.duplicate);
  assert.equal(readFileSync(queuePath, "utf8").trim().split("\n").length, 1);
});

// ---- resolveChainDispatch (unidade) ----

test("resolveChainDispatch: payload exclusivo, defaults documentados, ambiente nunca consultado", () => {
  assert.deepEqual(resolveChainDispatch({ spawnedBy: "PAI-X", cwd: "/a/b" }), { spawnedBy: "PAI-X", cwd: "/a/b", cwdSource: "payload" });
  assert.deepEqual(resolveChainDispatch({}), { spawnedBy: "operator", cwd: "/opt/mission-events", cwdSource: "default" });
  assert.deepEqual(resolveChainDispatch({ spawnedBy: "  ", cwd: "" }), { spawnedBy: "operator", cwd: "/opt/mission-events", cwdSource: "default" });
});

// ---- (d) preauth expirando: alerta tipado, sem re-grant ----

function contractArtifact(expiresInMs: number): Record<string, unknown> {
  const body = {
    issuer: "operator",
    subject: ORCH_PREAUTH_SUBJECT,
    grantedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    scope: ["mission_dispatch", "tool_call:tier2"],
  };
  return { ...body, hash: artifactHash16(body) };
}

test("(d) manifesto válido expirando em 1h → spool orch_preauth_expiring com mission/hash16/expiresAt", () => {
  const reading = { path: "/fix/orch-daemon-consume.json", status: "valid", reason: null, hash16: "0d9ea2e40adb568a", expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(), issuer: "operator", source: "preauth-manifest", scope: null };
  const spool: string[] = [];
  const out = emitPreauthExpiryAlert(reading as any, { spoolPath: "/fix/spool.jsonl", appendFile: (_p: string, d: string) => { spool.push(d.trim()); } });
  assert.ok(out.alerted);
  assert.equal(out.mission, "orch-daemon-consume");
  assert.equal(out.hash16, "0d9ea2e40adb568a");
  const ev = JSON.parse(spool[0]);
  assert.equal(ev.event, "orch_preauth_expiring");
  assert.equal(ev.kind, "orch_preauth_expiring");
  assert.equal(ev.mission, "orch-daemon-consume");
  assert.equal(ev.hash16, "0d9ea2e40adb568a");
  assert.equal(ev.expiresAt, reading.expiresAt);
  assert.ok(/re-grant NUNCA automático/.test(ev.msg));
  assert.ok(/orch-daemon-consume/.test(ev.msg) && /0d9ea2e40adb568a/.test(ev.msg)); // msg carrega os dados para o bus
});

test("(d) fora da janela (6h restantes) e expirado → sem alerta", () => {
  const spool: string[] = [];
  const app = (_p: string, d: string) => { spool.push(d.trim()); };
  const okFar = { path: "/f", status: "valid", reason: null, hash16: "h", expiresAt: new Date(Date.now() + 6 * 60 * 60_000).toISOString(), issuer: null, source: "artifact", scope: null };
  const r1 = emitPreauthExpiryAlert(okFar as any, { spoolPath: "/f", appendFile: app });
  assert.ok(!r1.alerted);
  const expired = { path: "/f", status: "expired", reason: "EXPIRED", hash16: "h", expiresAt: new Date(Date.now() - 60_000).toISOString(), issuer: null, source: "artifact", scope: null };
  const r2 = emitPreauthExpiryAlert(expired as any, { spoolPath: "/f", appendFile: app });
  assert.ok(!r2.alerted);
  assert.equal(spool.length, 0);
});

test("(d) janela de alerta = 2h (contrato) e expiresAt não-parseável → fail-open honesto", () => {
  assert.equal(PREAUTH_EXPIRY_WARN_MS, 2 * 60 * 60 * 1000);
  const bad = { path: "/f", status: "valid", reason: null, hash16: "h", expiresAt: "não-é-data", issuer: null, source: "artifact", scope: null };
  const r = emitPreauthExpiryAlert(bad as any, { spoolPath: "/f", appendFile: () => {} });
  assert.ok(!r.alerted);
  assert.match(String(r.reason), /não-parseável/);
});