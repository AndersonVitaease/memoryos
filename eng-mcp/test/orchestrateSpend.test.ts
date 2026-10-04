// ORCH-TELEMETRY-01 — unit tests for engineering.orchestrate.spend
// (src/orchestrate.ts: runOrchestrateSpend, orchestrateSpendInputSchema, SpendResult).
// Deterministic: no network, no LLM, no SSH/shell; zero mutation.
// Uses dependency injection (OrchestrateDeps) to fake all file I/O.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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

// RD-OPS-03-SPEND-01: o lookup multi-root (eng-mcp + panes herdr) varre o FS real
// quando o root primário existe — testes que exigem AUSÊNCIA de match pinam a env
// ENG_MCP_CLAUDE_CONFIG_DIRS num path inexistente (nenhum root real é escaneado).
function pinNoScanEnv(): void {
  process.env.ENG_MCP_CLAUDE_CONFIG_DIRS = "fixture-claude-config-dirs-no-scan";
}
function unpinEnv(): void {
  delete process.env.ENG_MCP_CLAUDE_CONFIG_DIRS;
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
  pinNoScanEnv();
  const missionId = "ORCH-TELEMETRY-01";
  const sessionId = "session-abc";
  const deps = makeDeps({
    readText: (filePath: string) => {
      if (filePath.endsWith(`${missionId}.json`)) return ledgerFile(missionId, sessionId);
      return null;
    },
    readdir: (dirPath: string) => [`${missionId}.json`],
    // ORCH-SPEND-SESSIONID-01: claudeConfigDir inexistente — o fallback por conteúdo
    // nunca escaneia o FS real do host (determinismo da suíte).
    claudeConfigDir: "fixture-claude-projects-no-transcript",
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
  pinNoScanEnv();
  const sessionId = "session-no-price-01";
  const missionId = "ORCH-TELEMETRY-01";
  const ledger = ledgerFile(missionId, sessionId);

  const deps = makeDeps({
    readText: (filePath: string) => {
      if (filePath.endsWith(`${missionId}.json`)) return ledger;
      return null;
    },
    readdir: (dirPath: string) => [`${missionId}.json`],
    claudeConfigDir: "fixture-claude-projects-no-price-table",
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
    claudeConfigDir: "fixture-claude-projects-filter",
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
    claudeConfigDir: "fixture-claude-projects-all",
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
  pinNoScanEnv();
  const missionId = "ORCH-TELEMETRY-01";
  const deps = makeDeps({
    readText: (filePath: string) => {
      if (filePath.endsWith(`${missionId}.json`)) return ledgerFile(missionId, "");
      return null;
    },
    readdir: (dirPath: string) => [`${missionId}.json`],
    claudeConfigDir: "fixture-claude-projects-no-session",
  });

  const result = runOrchestrateSpend({ missionId }, deps);
  const mission = result.missions[0];
  assert.equal(mission.transcriptFound, false);
  assert.equal(mission.costUsd, null);
  assert.equal(mission.note, "sem sessionId no ledger");
});

// ORCH-SPEND-SESSIONID-01 — fallback por conteúdo: transcript próprio achado pelo
// promptFile do dispatch (região pré-assistant) mesmo sem resumeSessionId no ledger.
function makeFallbackFixture(transcriptLines: string[], projectSlug = "-opt-memoryos-eng-mcp"): string {
  const dir = mkdtempSync(path.join(tmpdir(), "spend-fallback-"));
  mkdirSync(path.join(dir, projectSlug), { recursive: true });
  writeFileSync(path.join(dir, projectSlug, "sess-fb-own.jsonl"), transcriptLines.join("\n") + "\n");
  return dir;
}

test("runOrchestrateSpend: fallback prompt-file finds own transcript without sessionId (costUsd > 0)", () => {
  const missionId = "FB-TOOLS-LIKE-01";
  const promptFile = "/opt/mission-events/missao-fb-tools-like.md";
  const userLine = JSON.stringify({ type: "user", message: { content: `leia ${promptFile} e execute. Regras de condução.` } });
  const asstLine = JSON.stringify({ type: "assistant", message: { model: "inception/mercury-2.5", usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 } } });
  const claudeConfigDir = makeFallbackFixture([userLine, asstLine]);
  try {
    const deps = makeDeps({
      readText: (filePath: string) => {
        if (filePath.endsWith(`${missionId}.json`)) {
          return JSON.stringify({ missionId, resumeSessionId: null, status: "closed", cwd: "/opt/memoryos/eng-mcp", promptFile });
        }
        return priceTableFile();
      },
      readdir: (dirPath: string) => [`${missionId}.json`],
      claudeConfigDir,
    });
    const result = runOrchestrateSpend({ missionId }, deps);
    const mission = result.missions[0];
    assert.equal(mission.transcriptFound, true);
    assert.equal(mission.sessionId, "sess-fb-own");
    assert.equal(mission.sessionSource, "fallback-prompt-file");
    assert.ok(mission.costUsd != null && mission.costUsd > 0, `costUsd>0, got ${mission.costUsd}`);
    assert.equal(mission.model, "inception/mercury-2.5");
    assert.equal(result.totalCostUsd, mission.costUsd);
  } finally {
    rmSync(claudeConfigDir, { recursive: true, force: true });
  }
});

test("runOrchestrateSpend: mention of the mission AFTER the first assistant line does not attribute (outro chat)", () => {
  const missionId = "FB-LATE-MENTION-01";
  const asstLine = JSON.stringify({ type: "assistant", message: { model: "inception/mercury-2.5", usage: { input_tokens: 10, output_tokens: 5 } } });
  const userLate = JSON.stringify({ type: "user", message: { content: `o resultado do ${missionId} foi bom` } });
  const claudeConfigDir = makeFallbackFixture([asstLine, userLate]);
  try {
    const deps = makeDeps({
      readText: (filePath: string) => {
        if (filePath.endsWith(`${missionId}.json`)) {
          return JSON.stringify({ missionId, resumeSessionId: null, status: "closed", cwd: "/opt/memoryos/eng-mcp" });
        }
        return priceTableFile();
      },
      readdir: (dirPath: string) => [`${missionId}.json`],
      claudeConfigDir,
    });
    const result = runOrchestrateSpend({ missionId }, deps);
    const mission = result.missions[0];
    assert.equal(mission.transcriptFound, false);
    assert.equal(mission.costUsd, null);
    assert.equal(mission.note, "sem sessionId no ledger");
  } finally {
    rmSync(claudeConfigDir, { recursive: true, force: true });
  }
});

test("writeMissionSpend is exported from missionOps", async () => {
  const mod = await import("../src/missionOps.ts");
  assert.ok(typeof mod.writeMissionSpend === "function");
});
