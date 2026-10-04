// GUARD-SUPERVISOR-READONLY-01 — tests for src/supervisorGuard.ts + wiring.
// Coverage: (1) resolução de subjects-supervisor (canonical + env + roles.json
// operator-owned); (2) operatorOrderOf (trim >= 8); (3) recusa tipada
// SUPERVISOR_MUTATION_FORBIDDEN com audit no spool e NADA executado (spy via
// Proxy get-trap — gitPush nunca acessado); (4) passagem com operatorOrder
// (evento allowed_by_order) e não-supervisor passa sem guard (compat worker);
// (5) wiring nas tools de ship (git.push/merge, release.run, mission.*) e E2E
// real do canal http: wrapper repassa subject via env ao plugin mission-ops,
// que recusa close/recover/nudge de supervisor sem ordem com o ledger
// BYTE-IDÊNTECO (estado fabricado em MISSION_OPS_STATE_DIR temporário — zero
// contato com o estado real). Determinístico: sem rede, sem LLM, sem herdr em
// pane vivo (pane fabricado "perdido" → nudge devolve pane_lost sem envio).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { ENGINEERING_SERVER_INFO, installToolAliasCompatibility, registerEngineeringTools } from "../src/tools.ts";
import { assertSupervisorMutationAllowed, supervisorSubjects, operatorOrderOf } from "../src/supervisorGuard.ts";
import { EngineeringError, type AuthenticatedSubject } from "../src/policy.js";
import type { RepositoryAdapter } from "../src/repository.ts";

// ---- env isolation (save/restore; tests in one file run sequentially) ----
const ENV_KEYS = [
  "ENG_MCP_GUARD_AUDIT_FILE", "ENG_MCP_ROLES_FILE", "ENG_MCP_SUPERVISOR_SUBJECTS",
  "MISSION_OPS_STATE_DIR", "MISSION_OPS_GUARD_SPOOL_FILE",
  "MISSION_OPS_GUARD_CHANNEL", "MISSION_OPS_GUARD_SUBJECT",
  "MISSION_OPS_ROLES_FILE", "MISSION_OPS_SUPERVISOR_SUBJECTS",
  "HERDR_PANE_ID", // audit "pane" do guard não deve vazar o pane da sessão host
];
async function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => Promise<T> | T): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "supguard-"));
}

function readSpool(path: string): Array<Record<string, unknown>> {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
}

// ---- unit: resolução de subjects + operatorOrder ----
test("supervisorSubjects: canonical default + env + roles.json operator-owned", () => withEnv({
  ENG_MCP_ROLES_FILE: undefined, ENG_MCP_SUPERVISOR_SUBJECTS: undefined,
}, () => {
  const base = supervisorSubjects();
  assert.ok(base.has("supervisor"), "canonical subject must always be supervisor");
  assert.equal(base.size, 1, "with no roles.json/env overrides the set is exactly {supervisor}");
}));

test("supervisorSubjects: env list and roles.json supervisorSubjects merge in", () => {
  const dir = tempDir();
  const roles = join(dir, "roles.json");
  writeFileSync(roles, JSON.stringify({ supervisorSubjects: ["ops-supervisor", " bot-sup ", 42] }), "utf8");
  return withEnv({ ENG_MCP_ROLES_FILE: roles, ENG_MCP_SUPERVISOR_SUBJECTS: "env-sup, , env-sup2" }, () => {
    const set = supervisorSubjects();
    assert.ok(set.has("supervisor"));
    assert.ok(set.has("env-sup") && set.has("env-sup2"));
    assert.ok(set.has("ops-supervisor") && set.has("bot-sup"), "roles entries are trimmed");
    assert.ok(!set.has("42"), "non-string roles entries are ignored");
    assert.ok(isSupervisorHelper("env-sup") && isSupervisorHelper("supervisor"));
    assert.ok(!isSupervisorHelper("ci-worker"));
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});
function isSupervisorHelper(subject: string): boolean {
  return supervisorSubjects().has(subject);
}

test("operatorOrderOf: string trimmed >= 8 chars, else null", () => {
  assert.equal(operatorOrderOf({ operatorOrder: "SHIP-ENG-MCP-04" }), "SHIP-ENG-MCP-04");
  assert.equal(operatorOrderOf({ operatorOrder: "  order abc 123  " }), "order abc 123");
  assert.equal(operatorOrderOf({ operatorOrder: "short" }), null);
  assert.equal(operatorOrderOf({ operatorOrder: " 1234567 " }), null);
  assert.equal(operatorOrderOf({ operatorOrder: 12345 }), null);
  assert.equal(operatorOrderOf({}), null);
  assert.equal(operatorOrderOf(null), null);
});

// ---- unit: assertSupervisorMutationAllowed (recusa / passagem / compat) ----
test("supervisor without operatorOrder is refused with audit BEFORE any execution", () => {
  const dir = tempDir();
  const spool = join(dir, "spool.jsonl");
  return withEnv({ ENG_MCP_GUARD_AUDIT_FILE: spool, ENG_MCP_ROLES_FILE: undefined, ENG_MCP_SUPERVISOR_SUBJECTS: undefined }, () => {
    assert.throws(
      () => assertSupervisorMutationAllowed("engineering.git.push", "supervisor", { execute: true }),
      (e: unknown) => e instanceof EngineeringError && e.code === "SUPERVISOR_MUTATION_FORBIDDEN",
    );
    const lines = readSpool(spool);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].event, "supervisor_mutation_forbidden");
    assert.equal(lines[0].tool, "engineering.git.push");
    assert.equal(lines[0].subject, "supervisor");
    assert.equal(lines[0].source, "supervisor-guard-engmcp");
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});

test("supervisor with a valid operatorOrder passes and the pass is audited", () => {
  const dir = tempDir();
  const spool = join(dir, "spool.jsonl");
  return withEnv({ ENG_MCP_GUARD_AUDIT_FILE: spool, ENG_MCP_ROLES_FILE: undefined, ENG_MCP_SUPERVISOR_SUBJECTS: undefined }, () => {
    assert.doesNotThrow(() => assertSupervisorMutationAllowed("engineering.git.merge", "supervisor", { operatorOrder: "SHIP-ENG-MCP-04" }));
    const lines = readSpool(spool);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].event, "supervisor_mutation_allowed_by_order");
    assert.equal(lines[0].operatorOrder, "SHIP-ENG-MCP-04");
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});

test("non-supervisor callers pass without guard and without audit (worker compat)", () => {
  const dir = tempDir();
  const spool = join(dir, "spool.jsonl");
  return withEnv({ ENG_MCP_GUARD_AUDIT_FILE: spool, ENG_MCP_ROLES_FILE: undefined, ENG_MCP_SUPERVISOR_SUBJECTS: undefined }, () => {
    assert.doesNotThrow(() => assertSupervisorMutationAllowed("engineering.git.push", "ci-worker", { execute: true }));
    assert.doesNotThrow(() => assertSupervisorMutationAllowed("engineering.git.push", null, {}));
    assert.equal(readSpool(spool).length, 0, "no audit lines for non-supervisor callers");
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});

// ---- server-stack wiring (real tools/call path) ----
function resultText(result: unknown): string {
  const r = result as { content?: Array<{ type?: string; text?: string }> };
  return r.content?.[0]?.text ?? "";
}

const PROBE_CTX = { mcpReq: { requestState: () => undefined } };

// Proxy get-trap = spy: se o guard recusar, o método de mutação NUNCA é
// acessado (nada executado); se passar, o acesso é registrado.
function buildSpyServer(subject: AuthenticatedSubject) {
  const accessed: string[] = [];
  const repository = new Proxy({}, {
    get: (_t, prop) => {
      accessed.push(String(prop));
      return () => Promise.resolve({ plan: true });
    },
  }) as unknown as RepositoryAdapter;
  const mcp = new McpServer(ENGINEERING_SERVER_INFO);
  registerEngineeringTools(mcp, repository, subject, "memoryos");
  installToolAliasCompatibility(mcp.server);
  const handlers = mcp.server as unknown as { _getRequestHandler(method: string): ((request: unknown, ctx: unknown) => Promise<unknown>) | undefined };
  const call = handlers._getRequestHandler("tools/call");
  assert.ok(typeof call === "function", "tools/call handler must be installed");
  return { call: call as (request: unknown, ctx: unknown) => Promise<unknown>, accessed };
}

const SUP_PUSH: AuthenticatedSubject = { subject: "supervisor", scopes: ["engineering:read", "engineering:write", "engineering:git:push"], tokenHash16: "0000000000000000" };
const SUP_WRITE: AuthenticatedSubject = { subject: "supervisor", scopes: ["engineering:read", "engineering:write"], tokenHash16: "0000000000000000" };
const WORKER_PUSH: AuthenticatedSubject = { ...SUP_PUSH, subject: "ci-worker" };

test("git.push by supervisor WITHOUT operatorOrder: typed refusal, gitPush never accessed", () => {
  const dir = tempDir();
  return withEnv({ ENG_MCP_GUARD_AUDIT_FILE: join(dir, "spool.jsonl"), ENG_MCP_ROLES_FILE: join(dir, "absent.json"), ENG_MCP_SUPERVISOR_SUBJECTS: undefined }, async () => {
    const { call, accessed } = buildSpyServer(SUP_PUSH);
    const result = await call({ method: "tools/call", params: { name: "engineering.git.push", arguments: { execute: true, approval: { approved: true }, acknowledgePush: true } } }, PROBE_CTX);
    assert.ok((result as { isError?: boolean }).isError);
    const text = resultText(result);
    assert.ok(text.includes("SUPERVISOR_MUTATION_FORBIDDEN"), `expected typed refusal, got: ${text.slice(0, 300)}`);
    assert.ok(!accessed.includes("gitPush"), "nothing executed: repository.gitPush must never be reached");
    const lines = readSpool(join(dir, "spool.jsonl"));
    assert.equal(lines.length, 1);
    assert.equal(lines[0].event, "supervisor_mutation_forbidden");
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});

test("git.push by supervisor WITH operatorOrder: guard passes and the execution boundary is reached", () => {
  const dir = tempDir();
  return withEnv({ ENG_MCP_GUARD_AUDIT_FILE: join(dir, "spool.jsonl"), ENG_MCP_ROLES_FILE: join(dir, "absent.json"), ENG_MCP_SUPERVISOR_SUBJECTS: undefined }, async () => {
    const { call, accessed } = buildSpyServer(SUP_PUSH);
    const result = await call({ method: "tools/call", params: { name: "engineering.git.push", arguments: { operatorOrder: "SHIP-ENG-MCP-04" } } }, PROBE_CTX);
    assert.ok(!(result as { isError?: boolean }).isError, `unexpected refusal: ${resultText(result).slice(0, 300)}`);
    assert.ok(accessed.includes("gitPush"), "with the order the handler proceeds to the governed push path (PLAN spy)");
    const lines = readSpool(join(dir, "spool.jsonl"));
    assert.ok(lines.some((l) => l.event === "supervisor_mutation_allowed_by_order"));
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});

test("git.push by a WORKER subject without operatorOrder passes the guard (compat)", () => {
  const dir = tempDir();
  return withEnv({ ENG_MCP_GUARD_AUDIT_FILE: join(dir, "spool.jsonl"), ENG_MCP_ROLES_FILE: join(dir, "absent.json"), ENG_MCP_SUPERVISOR_SUBJECTS: undefined }, async () => {
    const { call, accessed } = buildSpyServer(WORKER_PUSH);
    const result = await call({ method: "tools/call", params: { name: "engineering.git.push", arguments: {} } }, PROBE_CTX);
    assert.ok(!(result as { isError?: boolean }).isError, `worker path must not be guarded, got: ${resultText(result).slice(0, 300)}`);
    assert.ok(accessed.includes("gitPush"));
    assert.equal(readSpool(join(dir, "spool.jsonl")).length, 0);
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});

test("git.merge and release.run by supervisor without order: typed refusals at the boundary", () => {
  const dir = tempDir();
  return withEnv({ ENG_MCP_GUARD_AUDIT_FILE: join(dir, "spool.jsonl"), ENG_MCP_ROLES_FILE: join(dir, "absent.json"), ENG_MCP_SUPERVISOR_SUBJECTS: undefined }, async () => {
    const { call, accessed } = buildSpyServer(SUP_WRITE);
    for (const [tool, args] of [
      ["engineering.git.merge", {}],
      ["engineering.release.run", { operation: "deploy" }],
    ] as const) {
      const result = await call({ method: "tools/call", params: { name: tool, arguments: args } }, PROBE_CTX);
      assert.ok((result as { isError?: boolean }).isError, `${tool} must refuse`);
      assert.ok(resultText(result).includes("SUPERVISOR_MUTATION_FORBIDDEN"), `${tool}: got ${resultText(result).slice(0, 200)}`);
    }
    assert.ok(!accessed.includes("gitMerge") && !accessed.includes("releaseRun"), "nothing executed");
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});

// ---- E2E real do canal http (wrapper -> plugin mission-ops, estado fabricado) ----
// O plugin roda de verdade (callHandler); ledger/status/spool todos em dirs
// temporários via env — ZERO contato com o estado real da missão.
function fabricateLedger(dir: string, missionId: string, extra: Record<string, unknown> = {}): string {
  const stateDir = join(dir, "state");
  mkdirSync(stateDir, { recursive: true });
  const ledgerPath = join(stateDir, `${missionId}.json`);
  writeFileSync(ledgerPath, JSON.stringify({ missionId, status: "working", cwd: dir, paneId: "w9:pNOPE", ...extra }, null, 2), "utf8");
  return ledgerPath;
}

const PLUGIN_PRESENT = existsSync("/root/.hermes/plugins/mission-ops/__init__.py");

test("E2E: engineering.mission.close by supervisor WITHOUT order -> SUPERVISOR_ACTION_NEEDS_ORDER, ledger byte-identical", () => {
  if (!PLUGIN_PRESENT) return; // container hermético: recusa honesta é MISSION_OPS_UNAVAILABLE (missionToolsFix02)
  const dir = tempDir();
  const ledgerPath = fabricateLedger(dir, "guard-e2e-probe");
  const before = readFileSync(ledgerPath, "utf8");
  return withEnv({
    ENG_MCP_GUARD_AUDIT_FILE: join(dir, "spool.jsonl"),
    MISSION_OPS_STATE_DIR: join(dir, "state"),
    MISSION_OPS_GUARD_SPOOL_FILE: join(dir, "plugin-spool.jsonl"),
  }, async () => {
    const { call } = buildSpyServer(SUP_WRITE);
    const result = await call({ method: "tools/call", params: { name: "engineering.mission.close", arguments: { missionId: "guard-e2e-probe" } } }, PROBE_CTX);
    const text = resultText(result);
    // Recusa do plugin vem como resultado ok:false (não isError) — mesmo
    // envelope do MISSION_NOT_FOUND (missionToolsFix02). O código tipado é a prova.
    assert.ok(text.includes("SUPERVISOR_ACTION_NEEDS_ORDER"), `expected plugin guard refusal, got: ${text.slice(0, 300)}`);
    assert.equal(readFileSync(ledgerPath, "utf8"), before, "ledger must be byte-identical (nothing executed)");
    const pluginLines = readSpool(join(dir, "plugin-spool.jsonl"));
    assert.ok(pluginLines.some((l) => l.event === "supervisor_action_needs_order"), "plugin guard wrote the typed audit event");
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});

test("E2E: engineering.mission.nudge by supervisor WITH operatorOrder passes the guard (handler reached, pane_lost)", () => {
  if (!PLUGIN_PRESENT) return;
  const dir = tempDir();
  fabricateLedger(dir, "guard-e2e-probe");
  return withEnv({
    ENG_MCP_GUARD_AUDIT_FILE: join(dir, "spool.jsonl"),
    MISSION_OPS_STATE_DIR: join(dir, "state"),
    MISSION_OPS_GUARD_SPOOL_FILE: join(dir, "plugin-spool.jsonl"),
  }, async () => {
    const { call } = buildSpyServer(SUP_WRITE);
    const result = await call({ method: "tools/call", params: { name: "engineering.mission.nudge", arguments: { missionId: "guard-e2e-probe", message: "probe", operatorOrder: "SHIP-ENG-MCP-04" } } }, PROBE_CTX);
    const text = resultText(result);
    assert.ok(!text.includes("SUPERVISOR_ACTION_NEEDS_ORDER"), `order must pass the guard, got: ${text.slice(0, 300)}`);
    assert.ok(text.includes("pane_lost") || text.includes("refused_busy"), `handler must be reached (fabricated pane is lost), got: ${text.slice(0, 300)}`);
    const pluginLines = readSpool(join(dir, "plugin-spool.jsonl"));
    assert.ok(pluginLines.some((l) => l.event === "supervisor_action_allowed_by_order"), "pass with order is audited by the plugin guard");
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});

test("E2E: engineering.mission.nudge by a WORKER subject without order passes the guard (compat)", () => {
  if (!PLUGIN_PRESENT) return;
  const dir = tempDir();
  fabricateLedger(dir, "guard-e2e-probe");
  return withEnv({
    ENG_MCP_GUARD_AUDIT_FILE: join(dir, "spool.jsonl"),
    MISSION_OPS_STATE_DIR: join(dir, "state"),
    MISSION_OPS_GUARD_SPOOL_FILE: join(dir, "plugin-spool.jsonl"),
  }, async () => {
    const { call } = buildSpyServer(WORKER_PUSH);
    const result = await call({ method: "tools/call", params: { name: "engineering.mission.nudge", arguments: { missionId: "guard-e2e-probe", message: "probe" } } }, PROBE_CTX);
    const text = resultText(result);
    assert.ok(!text.includes("SUPERVISOR_ACTION_NEEDS_ORDER"), `worker path must not be guarded, got: ${text.slice(0, 300)}`);
    assert.ok(text.includes("pane_lost") || text.includes("refused_busy"), `handler must be reached, got: ${text.slice(0, 300)}`);
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});