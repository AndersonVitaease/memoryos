// ORCH-QUEUE-CONSUMER-01 + ORCH-QUEUE-PROMOTE-01 — unit tests for the orchestrator
// queue consumer (src/orchestrate.ts: runOrchestrateConsume, orchestrateList,
// orchestrateConsumeInputSchema). Deterministic: no network, no LLM, no SSH/shell;
// zero mutation — todos os paths caem sob /tmp/orch-queue-promote-test/ e todo I/O
// é roteado por deps injetadas (padrão HERMÉTICO-FIX-01; nada toca /opt/mission-events
// nem /root/.hermes).
import test from "node:test";
import assert from "node:assert/strict";
import {
  runOrchestrateConsume,
  orchestrateList,
  orchestrateConsumeInputSchema,
  type OrchestratorConsumerState,
  type ConsumeResult,
  type ConsumeEntryResult,
} from "../src/orchestrate.ts";

const PROMPT_FILE = "/tmp/orch-queue-promote-test/prompt.txt";
const PATHS = {
  queuePath: "/tmp/orch-queue-promote-test/orchestrator-queue.jsonl",
  consumerStatePath: "/tmp/orch-queue-promote-test/orchestrator-consumer.state.json",
  consumerLockPath: "/tmp/orch-queue-promote-test/orchestrator-consumer.lock",
  spoolPath: "/tmp/orch-queue-promote-test/spool.jsonl",
  consumeAuditPath: "/tmp/orch-queue-promote-test/orchestrate-consume-audit.jsonl",
  missionStateDir: "/tmp/orch-queue-promote-test/state",
};

function makeDeps(overrides: Record<string, unknown> = {}) {
  const queue: string[] = [];
  const spool: string[] = [];
  const audit: Array<{ decision?: string; missionId?: string; entryId?: string; mode?: string; reason?: string }> = [];
  const state: OrchestratorConsumerState = { status: "stopped", lastPromotion: null, lastPromotionId: null, promotedCount: 0, skippedCount: 0, blockedCount: 0, requeuedCount: 0, deadLetteredCount: 0, updatedAt: null, promotedIds: [] };
  const lock = { held: false };
  return {
    queue,
    spool,
    audit,
    state,
    lock,
    ...PATHS,
    readText: (path: string) => {
      if (path.endsWith("orchestrator-queue.jsonl")) return queue.length > 0 ? queue.join("\n") : null;
      if (path.endsWith("orchestrator-consumer.state.json")) return JSON.stringify(state);
      return null;
    },
    now: () => Date.now(),
    writeText: (path: string, data: string) => {
      if (path.endsWith("orchestrator-consumer.state.json")) {
        Object.assign(state, JSON.parse(data));
      }
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
    // GO determinístico: sem arquivos no mission-state, sem probes de sistema
    readdir: () => [],
    exec: () => null,
    dispatchMission: async (input: { missionId: string; promptFile: string; worktree?: string; priority?: number }) => ({ ok: true }),
    ...overrides,
  };
}

// Helper: enqueue a mission entry
function enqueue(queue: string[], id: string, type: string, payload: Record<string, unknown> = {}, priority = 5) {
  queue.push(JSON.stringify({ id, type, payload, priority, enqueuedAt: new Date().toISOString() }));
}

test("orchestrateConsumeInputSchema validates plan/execute fields", () => {
  assert.ok(orchestrateConsumeInputSchema.safeParse({}).success);
  assert.ok(orchestrateConsumeInputSchema.safeParse({ dryRun: true }).success);
  assert.ok(orchestrateConsumeInputSchema.safeParse({ maxPromotions: 3 }).success);
  assert.ok(orchestrateConsumeInputSchema.safeParse({ dryRun: true, maxPromotions: 5 }).success);
  // ORCH-QUEUE-PROMOTE-01: execute + approval governam a mutação
  assert.ok(orchestrateConsumeInputSchema.safeParse({ execute: true }).success);
  assert.ok(orchestrateConsumeInputSchema.safeParse({ execute: true, approval: { approved: true } }).success);
  assert.ok(!orchestrateConsumeInputSchema.safeParse({ dryRun: "yes" }).success);
  assert.ok(!orchestrateConsumeInputSchema.safeParse({ execute: "yes" }).success);
  assert.ok(!orchestrateConsumeInputSchema.safeParse({ approval: { approved: "yes" } }).success);
  assert.ok(!orchestrateConsumeInputSchema.safeParse({ maxPromotions: 0 }).success);
  assert.ok(!orchestrateConsumeInputSchema.safeParse({ maxPromotions: 11 }).success);
});

test("runOrchestrateConsume: empty queue returns zero counts", async () => {
  const deps = makeDeps();
  const result = await runOrchestrateConsume({}, { ...deps } as any);
  assert.equal(result.consumed, 0);
  assert.equal(result.promoted, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.results.length, 0);
});

test("runOrchestrateConsume: promptFile missing → orch_skip", async () => {
  const deps = makeDeps();
  enqueue(deps.queue, "m1", "mission_dispatch", { missionId: "m1" });
  const result = await runOrchestrateConsume({}, {
    ...deps,
    existsSync: () => false, // promptFile does not exist
  } as any);
  assert.equal(result.consumed, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.results[0].action, "skipped");
  assert.equal(result.results[0].reason, "promptFile inexistente: (nenhum)");
});

test("runOrchestrateConsume: evaluates entries in order and records results", async () => {
  const deps = makeDeps();
  enqueue(deps.queue, "m1", "mission_dispatch", { missionId: "m1", promptFile: PROMPT_FILE });
  enqueue(deps.queue, "m2", "mission_dispatch", { missionId: "m2", promptFile: PROMPT_FILE });
  const result = await runOrchestrateConsume({}, { ...deps } as any);
  assert.equal(result.consumed, 2);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].missionId, "m1");
  assert.equal(result.results[1].missionId, "m2");
});

// ---- ORCH-QUEUE-PROMOTE-01 ----

test("PLAN é o default: lista o que promoveria sem despachar nem gravar nada", async () => {
  const deps = makeDeps();
  let dispatched = 0;
  enqueue(deps.queue, "pl-1", "mission_dispatch", { missionId: "pl", promptFile: PROMPT_FILE });
  const result = await runOrchestrateConsume({}, {
    ...deps,
    dispatchMission: async () => { dispatched += 1; return { ok: true }; },
  } as any);
  assert.equal(result.mode, "plan");
  assert.equal(result.promoted, 1); // decisão computada
  assert.equal(result.results[0].reason, "plan GO (plan mode: nada despachado)");
  assert.equal(dispatched, 0); // nada despachou
  assert.equal(deps.state.status, "stopped"); // estado do consumidor intocado
  assert.deepEqual(deps.state.promotedIds, []); // dedupe NÃO registrado em plan
  assert.equal(deps.audit.length, 0); // PLAN não audita
  assert.equal(deps.spool.length, 0); // PLAN não faz spool
});

test("execute sem approval → recusa tipada ORCH_CONSUME_APPROVAL_REQUIRED", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => runOrchestrateConsume({ execute: true }, { ...deps } as any),
    /ORCH_CONSUME_APPROVAL_REQUIRED/,
  );
  await assert.rejects(
    () => runOrchestrateConsume({ execute: true, approval: { approved: false } }, { ...deps } as any),
    /ORCH_CONSUME_APPROVAL_REQUIRED/,
  );
  assert.equal(deps.audit.length, 0);
});

test("ordem da fila: priority (1=alta) depois FIFO", async () => {
  const deps = makeDeps();
  const order: string[] = [];
  enqueue(deps.queue, "a-low", "mission_dispatch", { missionId: "a-low", promptFile: PROMPT_FILE, component: "compA" }, 9);
  enqueue(deps.queue, "b-high", "mission_dispatch", { missionId: "b-high", promptFile: PROMPT_FILE, component: "compB" }, 1);
  enqueue(deps.queue, "c-high", "mission_dispatch", { missionId: "c-high", promptFile: PROMPT_FILE, component: "compC" }, 1);
  const result = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, {
    ...deps,
    dispatchMission: async (i) => { order.push(i.missionId); return { ok: true }; },
  } as any);
  assert.deepEqual(order, ["b-high", "c-high", "a-low"]);
  assert.equal(result.mode, "execute");
  assert.equal(result.promoted, 3);
});

test("matriz de conflito: intents do mesmo componente serializam", async () => {
  const deps = makeDeps();
  const dispatched: string[] = [];
  enqueue(deps.queue, "x1", "mission_dispatch", { missionId: "x1", promptFile: PROMPT_FILE, component: "orchestrate" }, 1);
  enqueue(deps.queue, "x2", "mission_dispatch", { missionId: "x2", promptFile: PROMPT_FILE, component: "orchestrate" }, 1);
  enqueue(deps.queue, "y1", "mission_dispatch", { missionId: "y1", promptFile: PROMPT_FILE, component: "roster" }, 1);
  const result = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, {
    ...deps,
    dispatchMission: async (i) => { dispatched.push(i.missionId); return { ok: true }; },
  } as any);
  assert.deepEqual(dispatched, ["x1", "y1"]);
  assert.equal(result.promoted, 2);
  assert.equal(result.deferred, 1);
  const deferred = result.results.find((r) => r.action === "deferred");
  assert.equal(deferred?.missionId, "x2");
  assert.ok(deferred?.reason.includes("orchestrate"));
});

test("matriz de conflito: mesmo worktree serializa (proxy de arquivos)", async () => {
  const deps = makeDeps();
  const dispatched: string[] = [];
  enqueue(deps.queue, "w1", "mission_dispatch", { missionId: "w1", promptFile: PROMPT_FILE, worktree: "/opt/memoryos/eng-mcp-wt-shared" }, 1);
  enqueue(deps.queue, "w2", "mission_dispatch", { missionId: "w2", promptFile: PROMPT_FILE, worktree: "/opt/memoryos/eng-mcp-wt-shared" }, 1);
  const result = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, {
    ...deps,
    dispatchMission: async (i) => { dispatched.push(i.missionId); return { ok: true }; },
  } as any);
  assert.deepEqual(dispatched, ["w1"]);
  assert.equal(result.deferred, 1);
});

test("probe de recursos: plan BLOCK para o ciclo (orçamento >90%)", async () => {
  const deps = makeDeps();
  let dispatched = 0;
  enqueue(deps.queue, "blk-1", "mission_dispatch", { missionId: "blk", promptFile: PROMPT_FILE });
  enqueue(deps.queue, "blk-2", "mission_dispatch", { missionId: "blk2", promptFile: PROMPT_FILE });
  const result = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, {
    ...deps,
    readText: (path: string) => {
      if (path.endsWith("orchestrator-budget.json")) return JSON.stringify({ used_today_usd: 95, ceiling_usd: 100 });
      if (path.endsWith("orchestrator-queue.jsonl")) return deps.queue.length > 0 ? deps.queue.join("\n") : null;
      if (path.endsWith("orchestrator-consumer.state.json")) return JSON.stringify(deps.state);
      return null;
    },
    dispatchMission: async () => { dispatched += 1; return { ok: true }; },
  } as any);
  assert.equal(result.blocked, 1);
  assert.equal(dispatched, 0);
  assert.equal(result.results.length, 1); // break no primeiro BLOCK
  assert.equal(result.results[0].action, "blocked");
  assert.ok(result.results[0].reason.includes("BLOCK"));
});

test("dedupe idempotente: intent já promovida → NO_OP tipado, nunca re-despacha", async () => {
  const deps = makeDeps();
  let dispatches = 0;
  enqueue(deps.queue, "dup-1", "mission_dispatch", { missionId: "dup", promptFile: PROMPT_FILE });
  const first = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, {
    ...deps,
    dispatchMission: async () => { dispatches += 1; return { ok: true }; },
  } as any);
  assert.equal(first.promoted, 1);
  assert.deepEqual(deps.state.promotedIds, ["dup-1"]);

  const second = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, {
    ...deps,
    dispatchMission: async () => { dispatches += 1; return { ok: true }; },
  } as any);
  assert.equal(second.mode, "execute");
  assert.equal(second.noop, 1);
  assert.equal(second.promoted, 0);
  assert.equal(dispatches, 1); // NUNCA re-despachou
  assert.equal(second.results[0].action, "noop");
  assert.ok(second.results[0].reason.includes("promovida"));
});

test("execute audita cada decisão em /data/audit (trilha com decision + motivo)", async () => {
  const deps = makeDeps();
  enqueue(deps.queue, "aud-1", "mission_dispatch", { missionId: "aud", promptFile: PROMPT_FILE });
  enqueue(deps.queue, "aud-2", "mission_dispatch", { missionId: "aud2" }); // promptFile ausente → SKIPPED
  await runOrchestrateConsume({ execute: true, approval: { approved: true } }, { ...deps } as any);
  assert.equal(deps.audit.length, 2);
  assert.equal(deps.audit[0].decision, "PROMOTED");
  assert.equal(deps.audit[0].missionId, "aud");
  assert.equal(deps.audit[0].entryId, "aud-1");
  assert.ok((deps.audit[0].reason ?? "").length > 0);
  assert.equal(deps.audit[1].decision, "SKIPPED");
  // spool acompanha em execute
  assert.ok(deps.spool.some((l) => l.includes("orch_promoted")));
  assert.ok(deps.spool.some((l) => l.includes("orch_skip")));
});

test("PLAN não escreve na trilha de audit (read-only por contrato)", async () => {
  const deps = makeDeps();
  enqueue(deps.queue, "na-1", "mission_dispatch", { missionId: "na", promptFile: PROMPT_FILE });
  await runOrchestrateConsume({}, { ...deps } as any);
  assert.equal(deps.audit.length, 0);
});

test("execute sem handler de dispatch → fail-closed (nada fake-promovido)", async () => {
  const deps = makeDeps();
  enqueue(deps.queue, "nh-1", "mission_dispatch", { missionId: "nh", promptFile: PROMPT_FILE });
  const result = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, {
    ...deps,
    dispatchMission: undefined,
  } as any);
  assert.equal(result.promoted, 0);
  assert.equal(result.blocked, 1);
  assert.equal(result.results[0].action, "blocked");
  assert.ok(result.results[0].reason.includes("fail-closed"));
  assert.deepEqual(deps.state.promotedIds, []);
});

test("class=pesada → operator_required mesmo em execute com GO", async () => {
  // o conteúdo vem de readFileSync real — usamos um arquivo que existe de verdade
  const realPrompt = "/tmp/orch-queue-promote-test/pesada-prompt.md";
  const { writeFileSync, mkdirSync, unlinkSync } = await import("node:fs");
  mkdirSync("/tmp/orch-queue-promote-test", { recursive: true });
  writeFileSync(realPrompt, "---\nclass: pesada\n---\nconteúdo", "utf8");
  const deps = makeDeps();
  enqueue(deps.queue, "p-1", "mission_dispatch", { missionId: "p", promptFile: realPrompt });
  const result = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, {
    ...deps,
    existsSync: (path: string) => path.endsWith("orchestrator-queue.jsonl") || path === realPrompt,
  } as any);
  try { unlinkSync(realPrompt); } catch { /* ignore */ }
  assert.equal(result.operatorRequired, 1);
  assert.equal(result.promoted, 0);
  assert.equal(result.results[0].action, "operator_required");
});

test("orchestrateList returns consumer state alongside queue entries", async () => {
  const deps = makeDeps();
  const result = orchestrateList({
    ...PATHS,
    readText: (path: string) => {
      if (path.endsWith("orchestrator-queue.jsonl")) return null;
      if (path.endsWith("orchestrator-consumer.state.json")) return JSON.stringify({ status: "stopped", lastPromotion: null, lastPromotionId: null, promotedCount: 0, skippedCount: 0, blockedCount: 0, requeuedCount: 0, deadLetteredCount: 0, updatedAt: null });
      if (path.endsWith("orchestrator-price-table.json")) return null;
      return null;
    },
    now: deps.now,
    missionStateDir: PATHS.missionStateDir,
  } as any);
  assert.equal(result.consumer.status, "stopped");
  assert.equal(result.consumer.promotedCount, 0);
  assert.equal(result.consumer.lastPromotion, null);
});

test("ConsumeResult has all required fields (incl. ORCH-QUEUE-PROMOTE-01)", () => {
  const r: ConsumeResult = {
    consumed: 0, promoted: 0, skipped: 0, blocked: 0,
    throttled: 0, operatorRequired: 0, deadLettered: 0, requeued: 0,
    noop: 0, deferred: 0, mode: "plan",
    results: [],
  };
  assert.equal(typeof r.consumed, "number");
  assert.equal(typeof r.noop, "number");
  assert.equal(typeof r.deferred, "number");
  assert.ok(r.mode === "plan" || r.mode === "execute");
  assert.equal(typeof r.results, "object");
});

test("ConsumeEntryResult has valid action types (incl. noop/deferred)", () => {
  const validActions = ["promoted", "skipped", "blocked", "throttled", "operator_required", "dead_letter", "noop", "deferred"];
  const r: ConsumeEntryResult = { entryId: "test", action: "promoted", reason: "ok" };
  assert.ok(validActions.includes(r.action));
  const noop: ConsumeEntryResult = { entryId: "test", action: "noop", reason: "já promovida" };
  const deferred: ConsumeEntryResult = { entryId: "test", action: "deferred", reason: "conflito" };
  assert.ok(validActions.includes(noop.action));
  assert.ok(validActions.includes(deferred.action));
});

test("OrchestratorConsumerState has valid status values", () => {
  const s: OrchestratorConsumerState = {
    status: "alive", lastPromotion: null, lastPromotionId: null,
    promotedCount: 0, skippedCount: 0, blockedCount: 0,
    requeuedCount: 0, deadLetteredCount: 0, updatedAt: null,
  };
  assert.ok(s.status === "alive" || s.status === "stopped");
});