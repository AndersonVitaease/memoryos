// ORCH-TOOLS-01 — unit tests for tool_call intents in the orchestrator queue
// consumer (src/orchestrate.ts). Deterministic: no network, no LLM, no shell;
// zero mutation — todo I/O por deps injetadas (padrão HERMÉTICO-FIX-01). Cobre os
// 5 casos do contrato: tiers, teto compartilhado, serialização, dedupe, fail-closed.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runOrchestrateConsume,
  runOrchestrateEnqueue,
  classifyToolTier,
  ORCH_TIER1_TOOLS,
  ORCH_TIER2_TOOLS,
  type OrchestratorConsumerState,
} from "../src/orchestrate.ts";
import { createToolCallHandler } from "../src/orchToolHandlers.ts";
import { orchPreauthAllowsTier2, type OrchPreauthReading } from "../src/orchPreauthArtifact.ts";

const PROMPT_FILE = "/tmp/orch-tools-01-test/prompt.txt";
const PATHS = {
  queuePath: "/tmp/orch-tools-01-test/orchestrator-queue.jsonl",
  consumerStatePath: "/tmp/orch-tools-01-test/orchestrator-consumer.state.json",
  consumerLockPath: "/tmp/orch-tools-01-test/orchestrator-consumer.lock",
  spoolPath: "/tmp/orch-tools-01-test/spool.jsonl",
  consumeAuditPath: "/tmp/orch-tools-01-test/orchestrate-consume-audit.jsonl",
  missionStateDir: "/tmp/orch-tools-01-test/state",
};

function makeDeps(overrides: Record<string, unknown> = {}) {
  const queue: string[] = [];
  const spool: string[] = [];
  const audit: Array<{ decision?: string; missionId?: string; entryId?: string; mode?: string; reason?: string }> = [];
  const state: OrchestratorConsumerState = { status: "stopped", lastPromotion: null, lastPromotionId: null, promotedCount: 0, skippedCount: 0, blockedCount: 0, requeuedCount: 0, deadLetteredCount: 0, updatedAt: null, promotedIds: [] };
  const lock = { held: false };
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  return {
    queue, spool, audit, state, lock, calls,
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
    dispatchMission: async () => ({ ok: true }),
    // ORCH-TOOLS-01: handler fake determinístico que registra as chamadas.
    toolCallHandler: async (tool: string, args: Record<string, unknown>) => {
      calls.push({ tool, args });
      return { ok: true, result: { echoed: tool, args } };
    },
    // ORCH-TOOLS-01: leitura fake do artefato preauth (absent por default).
    readPreauth: (): OrchPreauthReading => ({
      path: "fixture", status: "absent", reason: "ABSENT", hash16: null,
      expiresAt: null, issuer: null, source: "artifact", scope: null,
    }),
    ...overrides,
  };
}

function enqueue(queue: string[], id: string, type: string, payload: Record<string, unknown> = {}, priority = 5) {
  queue.push(JSON.stringify({ id, type, payload, priority, enqueuedAt: new Date().toISOString() }));
}

const validPreauth = (scope = ["mission_dispatch", "tool_call:tier2"]): OrchPreauthReading => ({
  path: "fixture", status: "valid", reason: null, hash16: "abc123def4567890",
  expiresAt: new Date(Date.now() + 3600_000).toISOString(), issuer: "operator",
  source: "artifact", scope,
});

// ---- matriz de tiers ----

test("classifyToolTier: tier-1 leitura/determinísticas (incl. runtime.*)", () => {
  for (const t of ORCH_TIER1_TOOLS) assert.equal(classifyToolTier(t).tier, 1, t);
  assert.equal(classifyToolTier("engineering.runtime.metrics").tier, 1);
  assert.equal(classifyToolTier("engineering.runtime.query").tier, 1);
});

test("classifyToolTier: tier-2 escritas governadas", () => {
  for (const t of ORCH_TIER2_TOOLS) assert.equal(classifyToolTier(t).tier, 2, t);
});

test("classifyToolTier: tier-3 consequência externa (prefixos + marcadores)", () => {
  for (const t of [
    "engineering.release.pipeline", "engineering.release.test", "engineering.release.run",
    "engineering.vps.change_safe", "engineering.vps.secret_write", "engineering.vps.recover",
    "engineering.registry.entry_create", "engineering.registry.scope_grant",
    "engineering.guardian_app_deploy",
    "engineering.upstream.apply", "engineering.upstream.rollback",
  ]) {
    assert.equal(classifyToolTier(t).tier, 3, t);
  }
});

test("classifyToolTier: fora da matriz → tier 0 fail-closed (mesmo tool real, sem categoria declarada)", () => {
  assert.equal(classifyToolTier("engineering.memory.migrate").tier, 0);
  assert.equal(classifyToolTier("engineering.google.gdrive_delete").tier, 0);
  assert.equal(classifyToolTier("engineering.not.a.real.tool").tier, 0);
  assert.equal(classifyToolTier("").tier, 0);
});

test("runOrchestrateEnqueue: tool_call sem payload.tool → ORCHESTRATE_ENQUEUE_INVALID_TOOL_CALL; com tool → dedupe por {type,payload}", () => {
  // Fila REAL em tmpdir: o enqueue grava com appendFileSync (fs real), então o
  // dedupe precisa ler o mesmo arquivo (defaults do resolveDeps leem o disco).
  const dir = mkdtempSync(join(tmpdir(), "orch-tools-01-enqueue-"));
  const queuePath = join(dir, "orchestrator-queue.jsonl");
  const deps = { queuePath, now: () => Date.now() };
  assert.throws(
    () => runOrchestrateEnqueue({ type: "tool_call", payload: {} }, deps as never),
    /ORCHESTRATE_ENQUEUE_INVALID_TOOL_CALL/,
  );
  assert.throws(
    () => runOrchestrateEnqueue({ type: "tool_call", payload: { tool: "   " } }, deps as never),
    /ORCHESTRATE_ENQUEUE_INVALID_TOOL_CALL/,
  );
  const first = runOrchestrateEnqueue({ type: "tool_call", payload: { tool: "engineering.session.roster" } }, deps as never);
  assert.equal(first.enqueued, true);
  const dup = runOrchestrateEnqueue({ type: "tool_call", payload: { tool: "engineering.session.roster" } }, deps as never);
  assert.equal(dup.duplicate, true);
});

// ---- tier-1: execução in-processo, não consome teto ----

test("tier-1 executado in-processo no execute; NÃO consome teto (2 tier-1 + 2 missões com maxPromotions=2)", async () => {
  const deps = makeDeps();
  enqueue(deps.queue, "t1", "tool_call", { tool: "engineering.session.roster" });
  enqueue(deps.queue, "t2", "tool_call", { tool: "engineering.git.status" });
  enqueue(deps.queue, "m1", "mission_dispatch", { missionId: "m1", promptFile: PROMPT_FILE });
  enqueue(deps.queue, "m2", "mission_dispatch", { missionId: "m2", promptFile: PROMPT_FILE });
  const result = await runOrchestrateConsume({ execute: true, approval: { approved: true }, maxPromotions: 2 }, { ...deps } as never);
  assert.equal(result.toolCallsExecuted, 2);
  assert.equal(deps.calls.length, 2);
  assert.equal(deps.calls[0].tool, "engineering.session.roster");
  assert.deepEqual(deps.calls[1].args, {});
  assert.equal(result.results.find((r) => r.entryId === "t1")?.action, "executed");
  assert.equal(result.results.find((r) => r.entryId === "t1")?.tier, 1);
  // missões promovem NORMAIS (tier-1 não consumiu o teto)
  assert.equal(result.promoted, 2);
  assert.equal(deps.state.promotedCount, 2);
  // tool_call executada vai ao dedupe: 2º consume → noop
  const again = await runOrchestrateConsume({ execute: true, approval: { approved: true }, maxPromotions: 2 }, { ...deps } as never);
  assert.equal(again.results.find((r) => r.entryId === "t1")?.action, "noop");
  // toolResults no estado do consumidor
  assert.equal(deps.state.toolResults?.length, 2);
  assert.equal(deps.state.toolResults?.[0].tool, "engineering.session.roster");
  assert.equal(deps.state.toolResults?.[0].ok, true);
});

test("tier-1 em PLAN: GO sem consumir teto (maxPromotions=1, tier-1 + missão ambos 'promoted')", async () => {
  const deps = makeDeps();
  enqueue(deps.queue, "t1", "tool_call", { tool: "engineering.git.status" });
  enqueue(deps.queue, "m1", "mission_dispatch", { missionId: "m1", promptFile: PROMPT_FILE });
  const result = await runOrchestrateConsume({ maxPromotions: 1 }, { ...deps } as never);
  assert.equal(result.mode, "plan");
  assert.equal(result.results[0].action, "promoted");
  assert.equal(result.results[0].tier, 1);
  assert.equal(result.results[1].action, "promoted");
  assert.equal(result.promoted, 2);
  assert.equal(deps.calls.length, 0); // PLAN nunca executa
});

test("tier-1 sem handler → blocked fail-closed; falha do handler → blocked + prova em toolResults (sem retry)", async () => {
  const deps1 = makeDeps({ toolCallHandler: undefined });
  enqueue(deps1.queue, "t1", "tool_call", { tool: "engineering.git.status" });
  const r1 = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps1 } as never);
  assert.equal(r1.results[0].action, "blocked");
  assert.match(r1.results[0].reason, /sem handler de tool configurado/);

  const deps2 = makeDeps({ toolCallHandler: async () => ({ ok: false, error: "ORCH_TOOL_X" }) });
  enqueue(deps2.queue, "t2", "tool_call", { tool: "engineering.git.status" });
  const r2 = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps2 } as never);
  assert.equal(r2.results[0].action, "blocked");
  assert.match(r2.results[0].reason, /ORCH_TOOL_X/);
  assert.equal(deps2.state.toolResults?.length, 1);
  assert.equal(deps2.state.toolResults?.[0].ok, false);
  // decisão final: 2º consume → noop (sem retry-loop)
  const again = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps2 } as never);
  assert.equal(again.results.find((r) => r.entryId === "t2")?.action, "noop");
});

// ---- tier-2: gate preauth + teto compartilhado ----

test("tier-2 sem artefato preauth → awaiting_approval fail-closed; permanece na fila (re-avalia no próximo ciclo)", async () => {
  const deps = makeDeps();
  enqueue(deps.queue, "w1", "tool_call", { tool: "engineering.git.commit", args: { message: "x" } });
  const r1 = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps } as never);
  assert.equal(r1.awaitingApproval, 1);
  assert.equal(r1.results[0].action, "awaiting_approval");
  assert.equal(r1.results[0].tier, 2);
  assert.equal(deps.calls.length, 0); // nada executado
  // não foi ao dedupe: próximo ciclo re-avalia (ainda awaiting_approval)
  const r2 = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps } as never);
  assert.equal(r2.awaitingApproval, 1);
});

test("tier-2 com artefato preauth VÁLIDO executa e consome teto compartilhado com missões", async () => {
  const deps = makeDeps({ readPreauth: () => validPreauth() });
  enqueue(deps.queue, "w1", "tool_call", { tool: "engineering.file.create", args: { path: "/tmp/x", content: "y" } });
  enqueue(deps.queue, "m1", "mission_dispatch", { missionId: "m1", promptFile: PROMPT_FILE });
  const result = await runOrchestrateConsume({ execute: true, approval: { approved: true }, maxPromotions: 2 }, { ...deps } as never);
  assert.equal(result.toolCallsExecuted, 1);
  assert.equal(result.promoted, 1); // só a missão soma 'promoted' em execute
  assert.equal(deps.state.promotedCount, 2); // tier-2 + missão consumiram o teto
  assert.equal(deps.calls.length, 1);
  assert.equal(deps.calls[0].tool, "engineering.file.create");
  // audita com a prova do preauth (hash16 na reason do EXECUTED)
  assert.equal(deps.audit.some((a) => a.decision === "EXECUTED" && /preauth/.test(a.reason ?? "")), true);
});

test("tier-2 esgota o teto compartilhado: 2 tier-2 (maxPromotions=2) e a missão seguinte não é processada", async () => {
  const deps = makeDeps({ readPreauth: () => validPreauth() });
  enqueue(deps.queue, "w1", "tool_call", { tool: "engineering.file.create" });
  enqueue(deps.queue, "w2", "tool_call", { tool: "engineering.file.patch" });
  enqueue(deps.queue, "m1", "mission_dispatch", { missionId: "m1", promptFile: PROMPT_FILE });
  const result = await runOrchestrateConsume({ execute: true, approval: { approved: true }, maxPromotions: 2 }, { ...deps } as never);
  assert.equal(result.toolCallsExecuted, 2);
  assert.equal(result.results.find((r) => r.entryId === "m1"), undefined); // loop quebrou no teto
  assert.equal(deps.state.promotedCount, 2);
});

test("tier-2 com preauth válido mas handler ausente → blocked fail-closed (nunca fake-executar)", async () => {
  const deps = makeDeps({ readPreauth: () => validPreauth(), toolCallHandler: undefined });
  enqueue(deps.queue, "w1", "tool_call", { tool: "engineering.git.commit" });
  const result = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps } as never);
  assert.equal(result.results[0].action, "blocked");
  assert.match(result.results[0].reason, /sem handler de tool configurado/);
  assert.equal(deps.calls.length, 0);
});

// ---- tier-3/unknown: blocked SEMPRE, barreira ANTES do artefato ----

test("tier-3 blocked MESMO com artefato preauth válido (barreira avaliada antes do artefato)", async () => {
  const deps = makeDeps({ readPreauth: () => validPreauth() });
  enqueue(deps.queue, "x1", "tool_call", { tool: "engineering.release.pipeline" });
  enqueue(deps.queue, "x2", "tool_call", { tool: "engineering.vps.secret_write" });
  enqueue(deps.queue, "x3", "tool_call", { tool: "engineering.registry.entry_create" });
  const result = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps } as never);
  assert.equal(result.blocked, 3);
  for (const id of ["x1", "x2", "x3"]) {
    assert.equal(result.results.find((r) => r.entryId === id)?.action, "blocked");
  }
  assert.equal(deps.calls.length, 0); // nada executado
  assert.equal(deps.audit.some((a) => a.decision === "BLOCKED" && /tier3_external_consequence_operator_path/.test(a.reason ?? "")), true);
  // decisão final: 2º consume → noop (não re-avalia a cada ciclo)
  const again = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps } as never);
  assert.equal(again.results.find((r) => r.entryId === "x1")?.action, "noop");
});

// ---- serialização ----

test("tool_call com mission declarada serializa com mission_dispatch da mesma missão no ciclo", async () => {
  const deps = makeDeps();
  enqueue(deps.queue, "m1", "mission_dispatch", { missionId: "M1", promptFile: PROMPT_FILE });
  enqueue(deps.queue, "t1", "tool_call", { tool: "engineering.git.status", mission: "M1" });
  enqueue(deps.queue, "t2", "tool_call", { tool: "engineering.git.status", mission: "M2" });
  const result = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps } as never);
  assert.equal(result.results.find((r) => r.entryId === "m1")?.action, "promoted");
  assert.equal(result.results.find((r) => r.entryId === "t1")?.action, "deferred");
  assert.equal(result.results.find((r) => r.entryId === "t2")?.action, "executed");
});

test("duas tool_calls do mesmo componente serializam (segunda deferred)", async () => {
  const deps = makeDeps();
  enqueue(deps.queue, "t1", "tool_call", { tool: "engineering.git.status", component: "wt-x" });
  enqueue(deps.queue, "t2", "tool_call", { tool: "engineering.git.diff", component: "wt-x" });
  const result = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps } as never);
  assert.equal(result.results.find((r) => r.entryId === "t1")?.action, "executed");
  assert.equal(result.results.find((r) => r.entryId === "t2")?.action, "deferred");
  assert.equal(result.deferred, 1);
});

// ---- handler REAL (orchToolHandlers.ts) ----

test("handler REAL: engineering.mcp.catalog sem provider → erro tipado; tool fora do registro → erro tipado", async () => {
  const handler = createToolCallHandler();
  const call = await handler("engineering.mcp.catalog", {});
  assert.equal(call.ok, false);
  assert.match(String(call.error), /ORCH_TOOL_CATALOG_PROVIDER_REQUIRED/);
  const call2 = await handler("engineering.nao.existe", {});
  assert.equal(call2.ok, false);
  assert.match(String(call2.error), /ORCH_TOOL_NOT_IN_HANDLER_REGISTRY/);
});

test("handler REAL: engineering.session.roster executa de verdade (leitura read-only)", async () => {
  const handler = createToolCallHandler();
  const call = await handler("engineering.session.roster", {});
  assert.equal(call.ok, true);
  assert.equal(call.result != null && typeof call.result === "object", true);
});
