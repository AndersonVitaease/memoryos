// ORCH-SPEND-LEDGER-01 — unit tests for engineering.orchestrate.mission_spend
// (src/orchestrate.ts: runOrchestrateMissionSpend, orchestrateMissionSpendInputSchema).
// Deterministic: no network, no LLM; the cost>0 case uses a REAL temp transcript file
// (findTranscriptPath reads the filesystem directly, same as orchestrateSpend tests).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  runOrchestrateMissionSpend,
  orchestrateMissionSpendInputSchema,
} from "../src/orchestrate.ts";

function makeDeps(overrides: Record<string, unknown> = {}) {
  const files: Record<string, string> = {};
  return {
    files,
    readText: (filePath: string) => {
      const content = files[filePath];
      if (content === undefined) return null;
      return content;
    },
    ...overrides,
  };
}

// Fixture dir with a REAL transcript jsonl (assistant usage lines, model priced).
function makeTranscriptFixture(sessionId: string, model = "inclusionai/ling-3.0-flash"): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mission-spend-"));
  const projectDir = path.join(dir, "-opt-memoryos-eng-mcp");
  mkdirSync(projectDir, { recursive: true });
  const lines = [
    JSON.stringify({ type: "message", message: { model, role: "assistant" } }),
    JSON.stringify({ type: "assistant", message: { model, usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 200, cache_read_input_tokens: 3000 } } }),
    JSON.stringify({ type: "assistant", message: { model, usage: { input_tokens: 500, output_tokens: 250, cache_creation_input_tokens: 0, cache_read_input_tokens: 1000 } } }),
  ];
  writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), lines.join("\n") + "\n");
  return dir;
}

const PRICE_TABLE = JSON.stringify({
  verified_at: "2026-10-01",
  currency: "USD",
  unit: "per_1M_tokens",
  models: {
    "inclusionai/ling-3.0-flash": { in: 0.021, out: 0.063, cache_read: 0.0042 },
  },
  source: "openrouter-api-v1-models",
});

test("orchestrateMissionSpendInputSchema requires non-empty missionId, rejects extras", () => {
  assert.ok(orchestrateMissionSpendInputSchema.safeParse({ missionId: "M-1" }).success);
  assert.ok(!orchestrateMissionSpendInputSchema.safeParse({}).success);
  assert.ok(!orchestrateMissionSpendInputSchema.safeParse({ missionId: "" }).success);
  assert.ok(!orchestrateMissionSpendInputSchema.safeParse({ missionId: "M-1", extra: 1 }).success);
});

test("mission with sessionId+transcript+price table → costUsd > 0 and typed source", () => {
  const sessionId = "sess-e2e-a";
  const claudeConfigDir = makeTranscriptFixture(sessionId);
  try {
    const deps = makeDeps({
      missionStateDir: "/root/.hermes/mission-state",
      priceTablePath: "/opt/mission-events/orchestrator-price-table.json",
      claudeConfigDir,
      readText: (filePath: string) => {
        if (filePath.endsWith("E2E-SPEND-A.json")) {
          return JSON.stringify({ missionId: "E2E-SPEND-A", resumeSessionId: sessionId, status: "dispatched" });
        }
        if (filePath.endsWith("orchestrator-price-table.json")) return PRICE_TABLE;
        return null;
      },
    });
    const res = runOrchestrateMissionSpend({ missionId: "E2E-SPEND-A" }, deps);
    assert.equal(res.missionId, "E2E-SPEND-A");
    assert.equal(res.sessionId, sessionId);
    assert.equal(res.reason, null);
    assert.ok(res.costUsd != null && res.costUsd > 0, `costUsd>0, got ${res.costUsd}`);
    assert.equal(res.source, "orchestrate.spend:transcript+price-table");
    // inputTokens: 1000+500 assistant usage (cache_read fica fora do in/out)
    assert.equal(res.tokensIn, 1500);
    assert.equal(res.tokensOut, 750);
    assert.equal(res.model, "inclusionai/ling-3.0-flash");
  } finally {
    rmSync(claudeConfigDir, { recursive: true, force: true });
  }
});

test("ledger without sessionId → costUsd null + reason no-session-id (nunca inventa)", () => {
  // RD-OPS-03-SPEND-01: env pinada → lookup multi-root sem scan do FS real (hermético).
  process.env.ENG_MCP_CLAUDE_CONFIG_DIRS = "fixture-claude-config-dirs-no-scan";
  const deps = makeDeps({
    missionStateDir: "/root/.hermes/mission-state",
    claudeConfigDir: "fixture-claude-projects-no-session",
    priceTablePath: "/opt/mission-events/orchestrator-price-table.json",
    readText: (filePath: string) => {
      if (filePath.endsWith("NO-SESSION.json")) {
        return JSON.stringify({ missionId: "NO-SESSION", status: "dispatched" });
      }
      return null;
    },
  });
  const res = runOrchestrateMissionSpend({ missionId: "NO-SESSION" }, deps);
  assert.equal(res.costUsd, null);
  assert.equal(res.tokensIn, null);
  assert.equal(res.tokensOut, null);
  assert.equal(res.source, null);
  assert.equal(res.reason, "no-session-id");
});

test("sessionId without transcript on disk → reason no-transcript", () => {
  process.env.ENG_MCP_CLAUDE_CONFIG_DIRS = "fixture-claude-config-dirs-no-scan";
  const deps = makeDeps({
    missionStateDir: "/root/.hermes/mission-state",
    claudeConfigDir: "fixture-claude-projects-no-transcript",
    priceTablePath: "/opt/mission-events/orchestrator-price-table.json",
    readText: (filePath: string) => {
      if (filePath.endsWith("NO-TRANSCRIPT.json")) {
        return JSON.stringify({ missionId: "NO-TRANSCRIPT", resumeSessionId: "sess-sem-arquivo-01", status: "dispatched" });
      }
      return null;
    },
  });
  const res = runOrchestrateMissionSpend({ missionId: "NO-TRANSCRIPT" }, deps);
  assert.equal(res.costUsd, null);
  assert.equal(res.reason, "no-transcript");
  assert.equal(res.sessionId, "sess-sem-arquivo-01");
});

test("ledger missing → reason no-ledger (fail-open honesto)", () => {
  const deps = makeDeps({
    missionStateDir: "/root/.hermes/mission-state",
    readText: () => null,
  });
  const res = runOrchestrateMissionSpend({ missionId: "MISSING-01" }, deps);
  assert.equal(res.costUsd, null);
  assert.equal(res.reason, "no-ledger");
});

test("model not in price table → costUsd null with note reason, tokens still measured", () => {
  const sessionId = "sess-unpriced";
  const claudeConfigDir = makeTranscriptFixture(sessionId, "unknown/model-x");
  try {
    const deps = makeDeps({
      missionStateDir: "/root/.hermes/mission-state",
      priceTablePath: "/opt/mission-events/orchestrator-price-table.json",
      claudeConfigDir,
      readText: (filePath: string) => {
        if (filePath.endsWith("UNPRICED-01.json")) {
          return JSON.stringify({ missionId: "UNPRICED-01", resumeSessionId: sessionId, status: "dispatched" });
        }
        if (filePath.endsWith("orchestrator-price-table.json")) return PRICE_TABLE;
        return null;
      },
    });
    const res = runOrchestrateMissionSpend({ missionId: "UNPRICED-01" }, deps);
    assert.equal(res.costUsd, null);
    assert.ok((res.reason ?? "").includes("nao no price table"));
    assert.equal(res.tokensIn, 1500); // tokens medidos permanecem honestos
    assert.equal(res.tokensOut, 750);
  } finally {
    rmSync(claudeConfigDir, { recursive: true, force: true });
  }
});

// ---- ORCH-SPEND-SESSIONID-01: fallback por conteúdo (promptFile/missionId pré-assistant) ----

// Fixture com transcript PRÓPRIO de missão: primeira mensagem user = prompt do dispatch
// ("leia <promptFile> e execute"), antes da primeira linha assistant.
function makeOwnTranscriptFixture(userText: string, sessionId = "sess-fb-own"): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mission-spend-fb-"));
  const projectDir = path.join(dir, "-opt-memoryos-eng-mcp");
  mkdirSync(projectDir, { recursive: true });
  const lines = [
    JSON.stringify({ type: "user", message: { content: userText } }),
    JSON.stringify({ type: "assistant", message: { model: "inclusionai/ling-3.0-flash", usage: { input_tokens: 1200, output_tokens: 400, cache_creation_input_tokens: 0, cache_read_input_tokens: 500 } } }),
  ];
  writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), lines.join("\n") + "\n");
  return dir;
}

test("ledger sem sessionId + transcript próprio achado por promptFile → costUsd > 0 (fallback-prompt-file)", () => {
  const promptFile = "/opt/mission-events/missao-e2e-fb-a.md";
  const claudeConfigDir = makeOwnTranscriptFixture(`leia ${promptFile} e execute. Regras de condução.`);
  try {
    const deps = makeDeps({
      missionStateDir: "/root/.hermes/mission-state",
      priceTablePath: "/opt/mission-events/orchestrator-price-table.json",
      claudeConfigDir,
      readText: (filePath: string) => {
        if (filePath.endsWith("E2E-FB-A.json")) {
          return JSON.stringify({ missionId: "E2E-FB-A", resumeSessionId: null, status: "closed", cwd: "/opt/memoryos/eng-mcp", promptFile });
        }
        if (filePath.endsWith("orchestrator-price-table.json")) return PRICE_TABLE;
        return null;
      },
    });
    const res = runOrchestrateMissionSpend({ missionId: "E2E-FB-A" }, deps);
    assert.equal(res.costUsd != null && res.costUsd > 0, true);
    assert.equal(res.sessionId, "sess-fb-own");
    assert.equal(res.sessionSource, "fallback-prompt-file");
    assert.equal(res.source, "orchestrate.spend:fallback-prompt-file+price-table");
    assert.equal(res.reason, null);
    assert.equal(res.tokensIn, 1200);
    assert.equal(res.tokensOut, 400);
  } finally {
    rmSync(claudeConfigDir, { recursive: true, force: true });
  }
});

test("sem promptFile no ledger + missionId na 1ª mensagem user → fallback-mission-id", () => {
  const claudeConfigDir = makeOwnTranscriptFixture("leia o contrato da missão E2E-FB-B e execute.");
  try {
    const deps = makeDeps({
      missionStateDir: "/root/.hermes/mission-state",
      priceTablePath: "/opt/mission-events/orchestrator-price-table.json",
      claudeConfigDir,
      readText: (filePath: string) => {
        if (filePath.endsWith("E2E-FB-B.json")) {
          return JSON.stringify({ missionId: "E2E-FB-B", status: "closed", cwd: "/opt/memoryos/eng-mcp" });
        }
        if (filePath.endsWith("orchestrator-price-table.json")) return PRICE_TABLE;
        return null;
      },
    });
    const res = runOrchestrateMissionSpend({ missionId: "E2E-FB-B" }, deps);
    assert.equal(res.costUsd != null && res.costUsd > 0, true);
    assert.equal(res.sessionId, "sess-fb-own");
    assert.equal(res.sessionSource, "fallback-mission-id");
  } finally {
    rmSync(claudeConfigDir, { recursive: true, force: true });
  }
});

test("sessionId apontando para jsonl inexistente + transcript próprio por promptFile → fallback cobre (caso ORCH-TELEMETRY-01)", () => {
  const promptFile = "/opt/mission-events/missao-e2e-fb-c.md";
  const claudeConfigDir = makeOwnTranscriptFixture(`leia ${promptFile} e execute.`);
  try {
    const deps = makeDeps({
      missionStateDir: "/root/.hermes/mission-state",
      priceTablePath: "/opt/mission-events/orchestrator-price-table.json",
      claudeConfigDir,
      readText: (filePath: string) => {
        if (filePath.endsWith("E2E-FB-C.json")) {
          return JSON.stringify({ missionId: "E2E-FB-C", resumeSessionId: "sess-sumiu-01", status: "closed", cwd: "/opt/memoryos/eng-mcp", promptFile });
        }
        if (filePath.endsWith("orchestrator-price-table.json")) return PRICE_TABLE;
        return null;
      },
    });
    const res = runOrchestrateMissionSpend({ missionId: "E2E-FB-C" }, deps);
    assert.equal(res.costUsd != null && res.costUsd > 0, true);
    assert.equal(res.sessionId, "sess-fb-own");
    assert.equal(res.sessionSource, "fallback-prompt-file");
  } finally {
    rmSync(claudeConfigDir, { recursive: true, force: true });
  }
});

test("menção TARDIA ao missionId (depois do 1º assistant) NÃO atribui — outro chat comentando", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "mission-spend-late-"));
  const projectDir = path.join(dir, "-opt-memoryos-eng-mcp");
  mkdirSync(projectDir, { recursive: true });
  const lines = [
    JSON.stringify({ type: "assistant", message: { model: "inclusionai/ling-3.0-flash", usage: { input_tokens: 10, output_tokens: 5 } } }),
    JSON.stringify({ type: "user", message: { content: "o resultado do E2E-LATE-01 foi bom" } }),
  ];
  writeFileSync(path.join(projectDir, "sess-outro-chat.jsonl"), lines.join("\n") + "\n");
  try {
    const deps = makeDeps({
      missionStateDir: "/root/.hermes/mission-state",
      priceTablePath: "/opt/mission-events/orchestrator-price-table.json",
      claudeConfigDir: dir,
      readText: (filePath: string) => {
        if (filePath.endsWith("E2E-LATE-01.json")) {
          return JSON.stringify({ missionId: "E2E-LATE-01", status: "closed", cwd: "/opt/memoryos/eng-mcp" });
        }
        if (filePath.endsWith("orchestrator-price-table.json")) return PRICE_TABLE;
        return null;
      },
    });
    const res = runOrchestrateMissionSpend({ missionId: "E2E-LATE-01" }, deps);
    assert.equal(res.costUsd, null);
    assert.equal(res.reason, "no-session-id");
    assert.equal(res.sessionId, null);
    assert.equal(res.sessionSource, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
// ---- RD-OPS-03-SPEND-01: lookup multi-root (eng-mcp + panes herdr) + forma do contrato ----
// Os panes herdr rodam claude com CLAUDE_CONFIG_DIR=/opt/mission-events/.claude-config —
// o transcript do worker vive num SEGUNDO root que o lookup antigo não varria (causa real
// dos `spend_no-transcript` de 04/10). Root secundário aqui = fixture tmp (nunca FS real).

import { createHash } from "node:crypto";
import { spendClaudeConfigDirs } from "../src/orchestrate.ts";

test("spendClaudeConfigDirs: env unset → par default (eng-mcp + panes herdr); env set → primary + lista", () => {
  const prev = process.env.ENG_MCP_CLAUDE_CONFIG_DIRS;
  try {
    delete process.env.ENG_MCP_CLAUDE_CONFIG_DIRS;
    const roots = spendClaudeConfigDirs("/opt/memoryos/eng-mcp/.claude-config/projects");
    assert.deepEqual(roots, [
      "/opt/memoryos/eng-mcp/.claude-config/projects",
      "/opt/mission-events/.claude-config/projects",
    ]);
    process.env.ENG_MCP_CLAUDE_CONFIG_DIRS = "/root/x:/root/y";
    const withEnv = spendClaudeConfigDirs("/primary");
    assert.deepEqual(withEnv, ["/primary", "/root/x", "/root/y"]);
    // dedupe: primary repetido na env não duplica
    process.env.ENG_MCP_CLAUDE_CONFIG_DIRS = "/primary:/root/x";
    assert.deepEqual(spendClaudeConfigDirs("/primary"), ["/primary", "/root/x"]);
  } finally {
    if (prev === undefined) delete process.env.ENG_MCP_CLAUDE_CONFIG_DIRS;
    else process.env.ENG_MCP_CLAUDE_CONFIG_DIRS = prev;
  }
});

test("sessionId com transcript NO root herdr (2º root) → costUsd > 0 via ledger-session-id", () => {
  const sessionId = "sess-herdr-root-01";
  const root1 = mkdtempSync(path.join(tmpdir(), "spend-root1-")); // vazio (só eng-mcp)
  const root2 = mkdtempSync(path.join(tmpdir(), "spend-root2-")); // layout herdr
  const projectDir = path.join(root2, "-opt-mission-events");
  mkdirSync(projectDir, { recursive: true });
  const lines = [
    JSON.stringify({ type: "assistant", message: { model: "inclusionai/ling-3.0-flash", usage: { input_tokens: 2000, output_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 4000 } } }),
  ];
  const transcriptPath = path.join(projectDir, `${sessionId}.jsonl`);
  writeFileSync(transcriptPath, lines.join("\n") + "\n");
  try {
    const deps = makeDeps({
      missionStateDir: "/root/.hermes/mission-state",
      priceTablePath: "/opt/mission-events/orchestrator-price-table.json",
      claudeConfigDir: root1,
      readText: (filePath: string) => {
        if (filePath.endsWith("E2E-HERDR-ROOT.json")) {
          return JSON.stringify({ missionId: "E2E-HERDR-ROOT", resumeSessionId: sessionId, status: "dispatched" });
        }
        if (filePath.endsWith("orchestrator-price-table.json")) return PRICE_TABLE;
        return null;
      },
    });
    process.env.ENG_MCP_CLAUDE_CONFIG_DIRS = root2;
    try {
      const res = runOrchestrateMissionSpend({ missionId: "E2E-HERDR-ROOT" }, deps);
      assert.equal(res.reason, null);
      assert.ok(res.costUsd != null && res.costUsd > 0, `costUsd>0, got ${res.costUsd}`);
      assert.equal(res.sessionSource, "ledger-session-id");
      // forma do contrato: breakdown completo + fonte citada (path + sha256-16)
      assert.equal(res.cacheReadTokens, 4000);
      assert.equal(res.transcriptPath, transcriptPath);
      const expectedSha = createHash("sha256").update(
        // mesmo conteúdo gravado: linhas + \n final
        lines.join("\n") + "\n",
      ).digest("hex").slice(0, 16);
      assert.equal(res.transcriptSha16, expectedSha);
    } finally {
      if (process.env.ENG_MCP_CLAUDE_CONFIG_DIRS === root2) delete process.env.ENG_MCP_CLAUDE_CONFIG_DIRS;
    }
  } finally {
    rmSync(root1, { recursive: true, force: true });
    rmSync(root2, { recursive: true, force: true });
  }
});

test("fallback por promptFile NO root herdr (sem sessionId no ledger) → costUsd > 0", () => {
  const root1 = mkdtempSync(path.join(tmpdir(), "spend-fb1-"));
  const root2 = mkdtempSync(path.join(tmpdir(), "spend-fb2-"));
  const projectDir = path.join(root2, "-opt-mission-events");
  mkdirSync(projectDir, { recursive: true });
  const promptBase = "missao-e2e-fallback-herdr.md";
  const lines = [
    JSON.stringify({ type: "user", message: { content: `leia /opt/mission-events/${promptBase} e execute.` } }),
    JSON.stringify({ type: "assistant", message: { model: "inclusionai/ling-3.0-flash", usage: { input_tokens: 500, output_tokens: 250, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }),
  ];
  const sessionId = "sess-fallback-herdr-01";
  writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), lines.join("\n") + "\n");
  try {
    const deps = makeDeps({
      missionStateDir: "/root/.hermes/mission-state",
      priceTablePath: "/opt/mission-events/orchestrator-price-table.json",
      claudeConfigDir: root1,
      readText: (filePath: string) => {
        if (filePath.endsWith("E2E-FB-HERDR.json")) {
          return JSON.stringify({ missionId: "E2E-FB-HERDR", status: "dispatched", cwd: "/opt/mission-events", promptFile: `/opt/mission-events/${promptBase}` });
        }
        if (filePath.endsWith("orchestrator-price-table.json")) return PRICE_TABLE;
        return null;
      },
    });
    process.env.ENG_MCP_CLAUDE_CONFIG_DIRS = root2;
    try {
      const res = runOrchestrateMissionSpend({ missionId: "E2E-FB-HERDR" }, deps);
      assert.equal(res.reason, null);
      assert.ok(res.costUsd != null && res.costUsd > 0, `costUsd>0, got ${res.costUsd}`);
      assert.equal(res.sessionSource, "fallback-prompt-file");
      assert.equal(res.sessionId, sessionId);
    } finally {
      if (process.env.ENG_MCP_CLAUDE_CONFIG_DIRS === root2) delete process.env.ENG_MCP_CLAUDE_CONFIG_DIRS;
    }
  } finally {
    rmSync(root1, { recursive: true, force: true });
    rmSync(root2, { recursive: true, force: true });
  }
});
