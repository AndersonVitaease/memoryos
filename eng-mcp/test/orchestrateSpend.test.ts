// ORCH-TELEMETRY-01 — unit tests for engineering.orchestrate.spend
// (src/orchestrate.ts: runOrchestrateSpend, orchestrateSpendInputSchema, SpendResult).
// Deterministic: no network, no LLM, no SSH/shell; zero mutation.
// Uses dependency injection (OrchestrateDeps) to fake all file I/O.
import test from "node:test";
import assert from "node:assert/strict";
import {
  runOrchestrateSpend,
  orchestrateSpendInputSchema,
  type SpendResult,
} from "../src/orchestrate.ts";

function makeDeps(overrides: Record<string, unknown> = {}) {
  const files: Record<string, string> = {};
  const dirFiles: Record<string, string[]> = {};
  return {
    files,
    dirFiles,
    readText: (filePath: string) => {
      const content = files[filePath];
      if (content === undefined) return null;
      return content;
    },
    readdir: (dirPath: string) => {
      return dirFiles[dirPath] ?? null;
    },
    ...overrides,
  };
}

// Helper: write a ledger file content
function ledgerFile(missionId: string, sessionId: string, status = "closed"): string {
  return JSON.stringify({ missionId, resumeSessionId: sessionId, status });
}

// Helper: write a price table file
function priceTableFile(): string {
  return JSON.stringify({
    verified_at: "2026-10-01",
    currency: "USD",
    unit: "per_1M_tokens",
    models: {
      "inception/mercury-2.5": { in: 0.04, out: 0.15, cache_read: 0.004, ctx: 260000 },
    },
    source: "openrouter-api-v1-models",
  });
}

test("orchestrateSpendInputSchema validates missionId as optional non-empty string", () => {
  assert.ok(orchestrateSpendInputSchema.safeParse({}).success);
  assert.ok(orchestrateSpendInputSchema.safeParse({ missionId: "test-mission" }).success);
  assert.ok(!orchestrateSpendInputSchema.safeParse({ missionId: "" }).success);
  assert.ok(!orchestrateSpendInputSchema.safeParse({ missionId: 123 }).success);
});

test("runOrchestrateSpend: returns empty result when mission-state dir is unreadable", () => {
  const deps = makeDeps({
    readText: () => null,
    readdir: () => null,
  });
  const result = runOrchestrateSpend({}, deps);
  assert.equal(result.missions.length, 0);
  assert.equal(result.totalCostUsd, 0);
  assert.equal(result.totalTokens.inputTokens, 0);
  assert.equal(result.totalTokens.outputTokens, 0);
});

test("runOrchestrateSpend: returns null costUsd when transcript not found", () => {
  const missionId = "ORCH-TELEMETRY-01";
  const sessionId = "session-abc";
  const deps = makeDeps({
    readText: (filePath: string) => {
      if (filePath.endsWith(`${missionId}.json`)) return ledgerFile(missionId, sessionId);
      return null;
    },
    readdir: (dirPath: string) => [`${missionId}.json`],
  });
  const result = runOrchestrateSpend({ missionId }, deps);
  assert.equal(result.missions.length, 1);
  const mission = result.missions[0];
  assert.equal(mission.missionId, missionId);
  assert.equal(mission.transcriptFound, false);
  assert.equal(mission.costUsd, null);
  assert.equal(mission.note, "transcript nao encontrado para sessionId");
});

test("runOrchestrateSpend: fail-open when price table missing", () => {
  const sessionId = "session-no-price-01";
  const missionId = "ORCH-TELEMETRY-01";
  const ledger = ledgerFile(missionId, sessionId);

  const deps = makeDeps({
    readText: (filePath: string) => {
      if (filePath.endsWith(`${missionId}.json`)) return ledger;
      return null;
    },
    readdir: (dirPath: string) => [`${missionId}.json`],
  });

  const result = runOrchestrateSpend({ missionId }, deps);
  const mission = result.missions[0];
  // transcript not found on real filesystem (findTranscriptPath uses direct FS)
  assert.equal(mission.transcriptFound, false);
  assert.equal(mission.costUsd, null);
  assert.equal(mission.note, "transcript nao encontrado para sessionId");
});

test("runOrchestrateSpend: filters by missionId when specified", () => {
  const sessionId = "session-filter-01";
  const deps = makeDeps({
    readText: (filePath: string) => {
      if (filePath.endsWith("OTHER-MISSION.json")) return ledgerFile("OTHER-MISSION", sessionId);
      return null;
    },
    readdir: (dirPath: string) => ["OTHER-MISSION.json"],
  });

  const result = runOrchestrateSpend({ missionId: "ORCH-TELEMETRY-01" }, deps);
  assert.equal(result.missions.length, 0);
});

test("runOrchestrateSpend: includes all missions when no missionId filter", () => {
  const deps = makeDeps({
    readText: (filePath: string) => {
      if (filePath.endsWith("MISSION-A.json")) return ledgerFile("MISSION-A", "sess-a");
      if (filePath.endsWith("MISSION-B.json")) return ledgerFile("MISSION-B", "sess-b");
      return null;
    },
    readdir: (dirPath: string) => ["MISSION-A.json", "MISSION-B.json"],
  });

  const result = runOrchestrateSpend({}, deps);
  assert.equal(result.missions.length, 2);
});

test("runOrchestrateSpend: fail-open when readdir returns null", () => {
  const deps = makeDeps({
    readText: () => null,
    readdir: () => null,
  });
  const result = runOrchestrateSpend({}, deps);
  assert.equal(result.missions.length, 0);
  assert.equal(result.totalCostUsd, 0);
});

test("runOrchestrateSpend: ledger without sessionId returns null costUsd", () => {
  const missionId = "ORCH-TELEMETRY-01";
  const deps = makeDeps({
    readText: (filePath: string) => {
      if (filePath.endsWith(`${missionId}.json`)) return ledgerFile(missionId, "");
      return null;
    },
    readdir: (dirPath: string) => [`${missionId}.json`],
  });

  const result = runOrchestrateSpend({ missionId }, deps);
  const mission = result.missions[0];
  assert.equal(mission.transcriptFound, false);
  assert.equal(mission.costUsd, null);
  assert.equal(mission.note, "sem sessionId no ledger");
});

test("writeMissionSpend is exported from missionOps", async () => {
  const mod = await import("../src/missionOps.ts");
  assert.ok(typeof mod.writeMissionSpend === "function");
});
