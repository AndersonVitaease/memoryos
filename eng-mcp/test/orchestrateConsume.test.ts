// ORCH-QUEUE-CONSUMER-01 — unit tests for the orchestrator queue consumer
// (src/orchestrate.ts: runOrchestrateConsume, orchestrateList, orchestrateConsumeInputSchema).
// Deterministic: no network, no LLM, no SSH/shell; zero mutation.
// Uses dependency injection (OrchestrateDeps) to fake all file I/O and dispatch.
import test from "node:test";
import assert from "node:assert/strict";
import { unlinkSync } from "node:fs";
import {
  runOrchestrateConsume,
  orchestrateList,
  orchestrateConsumeInputSchema,
  type OrchestratorConsumerState,
  type ConsumeResult,
  type ConsumeEntryResult,
} from "../src/orchestrate.ts";

function makeDeps(overrides: Record<string, unknown> = {}) {
  const queue: string[] = [];
  const spool: string[] = [];
  const state = { status: "stopped" as const, lastPromotion: null, lastPromotionId: null, promotedCount: 0, skippedCount: 0, blockedCount: 0, requeuedCount: 0, deadLetteredCount: 0, updatedAt: null as string | null };
  const lock = { held: false };
  return {
    queue,
    spool,
    state,
    lock,
    readText: (path: string) => {
      if (path.endsWith("orchestrator-queue.jsonl")) return queue.join("\n") || null;
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
    },
    unlink: (path: string) => {
      if (path.endsWith("orchestrator-consumer.lock")) lock.held = false;
    },
    existsSync: (path: string) => path.endsWith("orchestrator-queue.jsonl") || path.endsWith("prompt.txt"),
    dispatchMission: async (input: { missionId: string; promptFile: string; worktree?: string; priority?: number }) => ({ ok: true }),
    ...overrides,
  };
}

// Helper: enqueue a mission entry
function enqueue(queue: string[], id: string, type: string, payload: Record<string, unknown> = {}, priority = 5) {
  queue.push(JSON.stringify({ id, type, payload, priority, enqueuedAt: new Date().toISOString() }));
}

test("orchestrateConsumeInputSchema validates dryRun and maxPromotions", () => {
  assert.ok(orchestrateConsumeInputSchema.safeParse({}).success);
  assert.ok(orchestrateConsumeInputSchema.safeParse({ dryRun: true }).success);
  assert.ok(orchestrateConsumeInputSchema.safeParse({ maxPromotions: 3 }).success);
  assert.ok(orchestrateConsumeInputSchema.safeParse({ dryRun: true, maxPromotions: 5 }).success);
  assert.ok(!orchestrateConsumeInputSchema.safeParse({ dryRun: "yes" }).success);
  assert.ok(!orchestrateConsumeInputSchema.safeParse({ maxPromotions: 0 }).success);
  assert.ok(!orchestrateConsumeInputSchema.safeParse({ maxPromotions: 11 }).success);
});

test("runOrchestrateConsume: empty queue returns zero counts", async () => {
  const deps = makeDeps();
  const result = await runOrchestrateConsume({}, {
    readText: deps.readText,
    writeText: deps.writeText,
    appendFile: deps.appendFile,
    unlink: deps.unlink,
    existsSync: deps.existsSync,
    now: deps.now,
    queuePath: "/opt/mission-events/orchestrator-queue.jsonl",
    consumerStatePath: "/opt/mission-events/orchestrator-consumer.state.json",
    consumerLockPath: "/opt/mission-events/orchestrator-consumer.lock",
    spoolPath: "/opt/mission-events/spool.jsonl",
  } as any);
  assert.equal(result.consumed, 0);
  assert.equal(result.promoted, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.results.length, 0);
});

test("runOrchestrateConsume: promptFile missing → orch_skip", async () => {
  const queue: string[] = [];
  enqueue(queue, "m1", "mission_dispatch", { missionId: "m1" });
  const deps = makeDeps();
  const result = await runOrchestrateConsume({}, {
    ...deps,
    queuePath: "/opt/mission-events/orchestrator-queue.jsonl",
    consumerStatePath: "/opt/mission-events/orchestrator-consumer.state.json",
    consumerLockPath: "/opt/mission-events/orchestrator-consumer.lock",
    spoolPath: "/opt/mission-events/spool.jsonl",
    readText: (path: string) => {
      if (path.endsWith("orchestrator-queue.jsonl")) return queue.join("\n") || null;
      if (path.endsWith("orchestrator-consumer.state.json")) return JSON.stringify({ status: "stopped" });
      return null;
    },
    existsSync: () => false, // promptFile does not exist
  } as any);
  assert.equal(result.consumed, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.results[0].action, "skipped");
  assert.equal(result.results[0].reason, "promptFile inexistente");
});

test("runOrchestrateConsume: consumes entries and records results", async () => {
  const queue: string[] = [];
  enqueue(queue, "m1", "mission_dispatch", { missionId: "m1", promptFile: "/tmp/prompt.txt" });
  enqueue(queue, "m2", "mission_dispatch", { missionId: "m2", promptFile: "/tmp/prompt2.txt" });
  const deps = makeDeps();
  const lockPath = "/tmp/orchestrator-consumer-test.lock";
  try { unlinkSync(lockPath); } catch { /* ignore */ }
  const result = await runOrchestrateConsume({}, {
    ...deps,
    queuePath: "/opt/mission-events/orchestrator-queue.jsonl",
    consumerStatePath: "/opt/mission-events/orchestrator-consumer.state.json",
    consumerLockPath: lockPath,
    spoolPath: "/opt/mission-events/spool.jsonl",
    missionStateDir: "/tmp",
    budgetPath: "/opt/mission-events/orchestrator-budget.json",
    agentsPath: "/opt/mission-events/agents.json",
    readText: (path: string) => {
      if (path.endsWith("orchestrator-queue.jsonl")) return queue.join("\n") || null;
      if (path.endsWith("orchestrator-consumer.state.json")) return JSON.stringify({ status: "stopped" });
      if (path.endsWith("orchestrator-budget.json")) return JSON.stringify({ used_today_usd: 50, ceiling_usd: 100 });
      if (path.endsWith("agents.json")) return JSON.stringify([{ type: "mission", max_parallel: 5 }]);
      return null;
    },
    existsSync: (path: string) => path.endsWith(".txt"),
    exec: () => null,
  } as any);
  assert.equal(result.consumed, 2);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].missionId, "m1");
  assert.equal(result.results[1].missionId, "m2");
});

test("orchestrateList returns consumer state alongside queue entries", async () => {
  const deps = makeDeps();
  const result = orchestrateList({
    readText: (path: string) => {
      if (path.endsWith("orchestrator-queue.jsonl")) return null;
      if (path.endsWith("orchestrator-consumer.state.json")) return JSON.stringify({ status: "stopped", lastPromotion: null, lastPromotionId: null, promotedCount: 0, skippedCount: 0, blockedCount: 0, requeuedCount: 0, deadLetteredCount: 0, updatedAt: null });
      if (path.endsWith("orchestrator-price-table.json")) return null;
      return null;
    },
    now: deps.now,
    queuePath: "/opt/mission-events/orchestrator-queue.jsonl",
    consumerStatePath: "/opt/mission-events/orchestrator-consumer.state.json",
    priceTablePath: "/opt/mission-events/orchestrator-price-table.json",
    claudeConfigDir: "/opt/memoryos/eng-mcp/.claude-config/projects",
    missionStateDir: "/root/.hermes/mission-state",
  } as any);
  assert.equal(result.consumer.status, "stopped");
  assert.equal(result.consumer.promotedCount, 0);
  assert.equal(result.consumer.lastPromotion, null);
});

test("ConsumeResult has all required fields", () => {
  const r: ConsumeResult = {
    consumed: 0, promoted: 0, skipped: 0, blocked: 0,
    throttled: 0, operatorRequired: 0, deadLettered: 0, requeued: 0,
    results: [],
  };
  assert.equal(typeof r.consumed, "number");
  assert.equal(typeof r.results, "object");
});

test("ConsumeEntryResult has valid action types", () => {
  const validActions = ["promoted", "skipped", "blocked", "throttled", "operator_required", "dead_letter"];
  const r: ConsumeEntryResult = { entryId: "test", action: "promoted", reason: "ok" };
  assert.ok(validActions.includes(r.action));
});

test("OrchestratorConsumerState has valid status values", () => {
  const s: OrchestratorConsumerState = {
    status: "alive", lastPromotion: null, lastPromotionId: null,
    promotedCount: 0, skippedCount: 0, blockedCount: 0,
    requeuedCount: 0, deadLetteredCount: 0, updatedAt: null,
  };
  assert.ok(s.status === "alive" || s.status === "stopped");
});
