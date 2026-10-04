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
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { ENGINEERING_SERVER_INFO, installToolAliasCompatibility, registerEngineeringTools } from "../src/tools.ts";
import { assertSupervisorMutationAllowed, supervisorSubjects, operatorOrderOf } from "../src/supervisorGuard.ts";
import { canonicalJson } from "../src/orchPreauthArtifact.js";
import { EngineeringError, type AuthenticatedSubject } from "../src/policy.js";
import type { RepositoryAdapter } from "../src/repository.ts";

// ---- env isolation (save/restore; tests in one file run sequentially) ----
const ENV_KEYS = [
  "ENG_MCP_GUARD_AUDIT_FILE", "ENG_MCP_ROLES_FILE", "ENG_MCP_SUPERVISOR_SUBJECTS",
  "ENG_MCP_OPERATOR_TOKEN_FILE", "ENG_MCP_OPERATOR_ALLOWLIST_FILE",
  "ENG_MCP_ORDER_ORIGIN_PLATFORM", "ENG_MCP_ORDER_ORIGIN_CHAT_ID",
  "MISSION_OPS_OPERATOR_TOKEN_FILE", "MISSION_OPS_OPERATOR_ALLOWLIST_FILE",
  "MISSION_OPS_ORDER_ORIGIN_PLATFORM", "MISSION_OPS_ORDER_ORIGIN_CHAT_ID",
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

// ---- fixtures SEC-OPERATOR-IDENTITY-01 (token de ordem + binding Telegram) ----
const GUARD_TOKEN = "ordem-token-SEC-OPERATOR-IDENTITY-01-9f2c";

function selfHash16(body: Record<string, unknown>): string {
  const { hash16, ...rest } = body as { hash16?: string };
  return createHash("sha256").update(canonicalJson(rest)).digest("hex").slice(0, 16);
}

function writeTokenFixture(dir: string, extra: Record<string, unknown> = {}, name = "operator-order-token"): string {
  const { hash16, ...rest } = extra as { hash16?: string };
  const body = { version: 1, tokenHash: createHash("sha256").update(GUARD_TOKEN).digest("hex"), ...rest };
  const path = join(dir, `${name}.json`);
  writeFileSync(path, JSON.stringify({ ...body, hash16: hash16 ?? selfHash16(body) }, null, 2) + "\n", "utf8");
  chmodSync(path, 0o600);
  return path;
}

function writeAllowlistFixture(dir: string): string {
  const body = { version: 1, telegram: { chatIds: [{ chatId: "424242", label: "operator" }] } };
  const path = join(dir, "operator-allowlist.json");
  writeFileSync(path, JSON.stringify({ ...body, hash16: selfHash16(body) }, null, 2) + "\n", "utf8");
  chmodSync(path, 0o600);
  return path;
}

function readSpool(path: string): Array<Record<string, unknown>> {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
}

function pluginSpoolHas(path: string, event: string): boolean {
  return readSpool(path).some((l) => l.event === event);
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

test("supervisor with a VALID TOKEN order passes and the pass is audited (operator_order_verified + hash16, nunca o token)", () => {
  const dir = tempDir();
  const spool = join(dir, "spool.jsonl");
  return withEnv({ ENG_MCP_GUARD_AUDIT_FILE: spool, ENG_MCP_ROLES_FILE: undefined, ENG_MCP_SUPERVISOR_SUBJECTS: undefined, ENG_MCP_OPERATOR_TOKEN_FILE: writeTokenFixture(dir) }, () => {
    assert.doesNotThrow(() => assertSupervisorMutationAllowed("engineering.git.merge", "supervisor", { operatorOrder: GUARD_TOKEN }));
    const lines = readSpool(spool);
    const verified = lines.find((l) => l.event === "operator_order_verified");
    assert.ok(verified, "operator_order_verified must be audited");
    assert.equal(verified.basis, "token");
    assert.match(String(verified.tokenHash16), /^[0-9a-f]{16}$/);
    const legacy = lines.find((l) => l.event === "supervisor_mutation_allowed_by_order");
    assert.ok(legacy, "legacy allowed_by_order event preserved");
    assert.ok(!JSON.stringify(lines).includes(GUARD_TOKEN), "token value must never be audited");
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});

test("supervisor with TEXTUAL operatorOrder (sem token): OPERATOR_ORDER_UNVERIFIED, nada executado, audit", () => {
  const dir = tempDir();
  const spool = join(dir, "spool.jsonl");
  // hermético: token file fixado como AUSENTE (default /data/manifests pode ter placeholder do operator)
  return withEnv({ ENG_MCP_GUARD_AUDIT_FILE: spool, ENG_MCP_ROLES_FILE: undefined, ENG_MCP_SUPERVISOR_SUBJECTS: undefined, ENG_MCP_OPERATOR_TOKEN_FILE: join(dir, "absent-token.json") }, () => {
    assert.throws(
      () => assertSupervisorMutationAllowed("engineering.git.push", "supervisor", { operatorOrder: "SHIP-ENG-MCP-04" }),
      (e: unknown) => e instanceof EngineeringError && e.code === "OPERATOR_ORDER_UNVERIFIED",
    );
    const lines = readSpool(spool);
    const unverified = lines.find((l) => l.event === "operator_order_unverified");
    assert.ok(unverified, "operator_order_unverified must be audited");
    assert.equal(unverified.tokenStatus, "absent");
    assert.ok(String(unverified.channelNote).includes("inactive"), "honest note: channel layer inactive (no binding configured)");
    assert.ok(!lines.some((l) => l.event === "supervisor_mutation_forbidden"), "no-order legacy event must NOT fire when an order was presented");
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});

test("token inválido/expirado/revogado: recusa tipada OPERATOR_ORDER_UNVERIFIED com status preservado", () => {
  const dir = tempDir();
  const spool = join(dir, "spool.jsonl");
  const expired = writeTokenFixture(dir, { expiresAt: "2020-01-01T00:00:00Z" }, "expired");
  const revoked = writeTokenFixture(dir, { revoked: true }, "revoked");
  return withEnv({ ENG_MCP_GUARD_AUDIT_FILE: spool, ENG_MCP_ROLES_FILE: undefined, ENG_MCP_SUPERVISOR_SUBJECTS: undefined }, () => {
    for (const [file, status] of [[expired, "expired"], [revoked, "revoked"]] as const) {
      process.env.ENG_MCP_OPERATOR_TOKEN_FILE = file;
      assert.throws(
        () => assertSupervisorMutationAllowed("engineering.git.push", "supervisor", { operatorOrder: GUARD_TOKEN }),
        (e: unknown) => e instanceof EngineeringError && e.code === "OPERATOR_ORDER_UNVERIFIED",
      );
      const lines = readSpool(spool).filter((l) => l.event === "operator_order_unverified");
      assert.ok(lines.some((l) => l.tokenStatus === status), `status ${status} must reach the audit`);
    }
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});

test("camada 2: origem telegram allowlistada resolve como token; binding ausente = inativa (fail-closed)", () => {
  const dir = tempDir();
  const spool = join(dir, "spool.jsonl");
  return withEnv({ ENG_MCP_GUARD_AUDIT_FILE: spool, ENG_MCP_ROLES_FILE: undefined, ENG_MCP_SUPERVISOR_SUBJECTS: undefined, ENG_MCP_OPERATOR_TOKEN_FILE: join(dir, "absent-token.json"), ENG_MCP_OPERATOR_ALLOWLIST_FILE: writeAllowlistFixture(dir), ENG_MCP_ORDER_ORIGIN_PLATFORM: "telegram", ENG_MCP_ORDER_ORIGIN_CHAT_ID: "424242" }, () => {
    assert.doesNotThrow(() => assertSupervisorMutationAllowed("engineering.git.push", "supervisor", { operatorOrder: "SHIP-ENG-MCP-04" }));
    const lines = readSpool(spool);
    const verified = lines.find((l) => l.event === "operator_order_verified");
    assert.ok(verified && verified.basis === "telegram-binding");
    assert.match(String(verified.chatHash16), /^[0-9a-f]{16}$/);
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});

test("camada 2: allowlist presente mas origem estranha NÃO resolve (fail-closed)", () => {
  const dir = tempDir();
  const spool = join(dir, "spool.jsonl");
  return withEnv({ ENG_MCP_GUARD_AUDIT_FILE: spool, ENG_MCP_ROLES_FILE: undefined, ENG_MCP_SUPERVISOR_SUBJECTS: undefined, ENG_MCP_OPERATOR_TOKEN_FILE: join(dir, "absent-token.json"), ENG_MCP_OPERATOR_ALLOWLIST_FILE: writeAllowlistFixture(dir), ENG_MCP_ORDER_ORIGIN_PLATFORM: "telegram", ENG_MCP_ORDER_ORIGIN_CHAT_ID: "999999" }, () => {
    assert.throws(
      () => assertSupervisorMutationAllowed("engineering.git.push", "supervisor", { operatorOrder: "SHIP-ENG-MCP-04" }),
      (e: unknown) => e instanceof EngineeringError && e.code === "OPERATOR_ORDER_UNVERIFIED",
    );
    assert.ok(readSpool(spool).some((l) => l.event === "operator_order_unverified"));
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

test("git.push by supervisor WITH valid TOKEN order: guard passes and the execution boundary is reached", () => {
  const dir = tempDir();
  return withEnv({ ENG_MCP_GUARD_AUDIT_FILE: join(dir, "spool.jsonl"), ENG_MCP_ROLES_FILE: join(dir, "absent.json"), ENG_MCP_SUPERVISOR_SUBJECTS: undefined, ENG_MCP_OPERATOR_TOKEN_FILE: writeTokenFixture(dir) }, async () => {
    const { call, accessed } = buildSpyServer(SUP_PUSH);
    const result = await call({ method: "tools/call", params: { name: "engineering.git.push", arguments: { operatorOrder: GUARD_TOKEN } } }, PROBE_CTX);
    assert.ok(!(result as { isError?: boolean }).isError, `unexpected refusal: ${resultText(result).slice(0, 300)}`);
    assert.ok(accessed.includes("gitPush"), "with the verified token the handler proceeds to the governed push path (PLAN spy)");
    const lines = readSpool(join(dir, "spool.jsonl"));
    assert.ok(lines.some((l) => l.event === "operator_order_verified"));
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});

test("git.push by supervisor with TEXTUAL order (sem token): OPERATOR_ORDER_UNVERIFIED, gitPush never accessed", () => {
  const dir = tempDir();
  return withEnv({ ENG_MCP_GUARD_AUDIT_FILE: join(dir, "spool.jsonl"), ENG_MCP_ROLES_FILE: join(dir, "absent.json"), ENG_MCP_SUPERVISOR_SUBJECTS: undefined }, async () => {
    const { call, accessed } = buildSpyServer(SUP_PUSH);
    const result = await call({ method: "tools/call", params: { name: "engineering.git.push", arguments: { operatorOrder: "SHIP-ENG-MCP-04" } } }, PROBE_CTX);
    assert.ok((result as { isError?: boolean }).isError);
    assert.ok(resultText(result).includes("OPERATOR_ORDER_UNVERIFIED"), `expected typed token refusal, got: ${resultText(result).slice(0, 300)}`);
    assert.ok(!accessed.includes("gitPush"), "nothing executed: textual order no longer authorizes mutation");
    assert.ok(readSpool(join(dir, "spool.jsonl")).some((l) => l.event === "operator_order_unverified"));
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

test("E2E: engineering.mission.nudge by supervisor WITH valid TOKEN passes the guard (handler reached, pane_lost)", () => {
  if (!PLUGIN_PRESENT) return;
  const dir = tempDir();
  fabricateLedger(dir, "guard-e2e-probe");
  return withEnv({
    ENG_MCP_GUARD_AUDIT_FILE: join(dir, "spool.jsonl"),
    ENG_MCP_OPERATOR_TOKEN_FILE: writeTokenFixture(dir, {}, "engmcp-token-fixture"),
    MISSION_OPS_OPERATOR_TOKEN_FILE: writeTokenFixture(dir, {}, "plugin-token-fixture"),
    MISSION_OPS_STATE_DIR: join(dir, "state"),
    MISSION_OPS_GUARD_SPOOL_FILE: join(dir, "plugin-spool.jsonl"),
  }, async () => {
    const { call } = buildSpyServer(SUP_WRITE);
    const result = await call({ method: "tools/call", params: { name: "engineering.mission.nudge", arguments: { missionId: "guard-e2e-probe", message: "probe", operatorOrder: GUARD_TOKEN } } }, PROBE_CTX);
    const text = resultText(result);
    assert.ok(!text.includes("SUPERVISOR_ACTION_NEEDS_ORDER") && !text.includes("OPERATOR_ORDER_UNVERIFIED"), `token must pass the guard, got: ${text.slice(0, 300)}`);
    assert.ok(text.includes("pane_lost") || text.includes("refused_busy"), `handler must be reached (fabricated pane is lost), got: ${text.slice(0, 300)}`);
    const pluginLines = readSpool(join(dir, "plugin-spool.jsonl"));
    assert.ok(pluginLines.some((l) => l.event === "operator_order_verified"), "pass with verified token is audited by the plugin guard");
  }).finally(() => rmSync(dir, { recursive: true, force: true }));
});

test("E2E: engineering.mission.nudge by supervisor with TEXTUAL order -> OPERATOR_ORDER_UNVERIFIED (ledger intocado)", () => {
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
    assert.ok(text.includes("OPERATOR_ORDER_UNVERIFIED"), `textual order must NOT authorize mutation, got: ${text.slice(0, 300)}`);
    assert.ok(pluginSpoolHas(join(dir, "plugin-spool.jsonl"), "operator_order_unverified"), "unverified refusal audited by the plugin guard");
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