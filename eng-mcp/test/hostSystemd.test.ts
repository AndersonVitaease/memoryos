// ENG-HOST-GOVERNED-OPS-01 — contract tests for engineering.host.systemd
// (src/hostSystemd.ts) + the host agent (src/hostOpsAgent.ts) over a REAL unix
// socket. Coverage: (a) tier-0 wins over operatorOrder (critical units/verbs,
// HOST_OPS_FORBIDDEN, nothing sent); (b) tier-1 read executes via socket with
// catalog sha16 in the audit and NO judge call; (c) tier-1 mutation requires a
// VERIFIED operatorOrder (missing → HOST_OPS_ORDER_REQUIRED, unverified →
// OPERATOR_ORDER_UNVERIFIED, supervisor guard codes preserved); (d) tier-2
// judge safe/unsafe/unavailable-fail-closed; (e) tier-3 operator forwarding
// with the agent still refusing outside its own catalog; (f)
// HOST_AGENT_UNAVAILABLE typed (socket absent / silent); (g) token-file
// semantics (0600, revoked, disabled, TTL, self-hash); (h) audit trail shape.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  runHostSystemd, hostSystemdInputSchema, classifyHostOp, verifyOperatorOrderLocal,
  canonicalJsonHostOps, loadHostOpsAllowlistCatalog, validateHostOpsAllowlistCatalog,
  hostOpsSocketState, HOST_OPS_TIER2_QUESTIONS, normalizeUnitName, isValidUnitName,
  type HostSystemdInput, type HostRunDeps
} from "../src/hostSystemd.ts";
import { startHostOpsAgent, type AgentDeps, type AgentExecOutcome } from "../src/hostOpsAgent.ts";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "host-systemd-test-"));
}

const SAFE_ANSWERS = { answers: HOST_OPS_TIER2_QUESTIONS.map((q) => ({ id: q.id, probability: 0.01 })) };
const RISKY_ANSWERS = { answers: [{ id: "q_destructive", probability: 0.95 }, { id: "q_outward_facing", probability: 0.02 }, { id: "q_touches_credentials", probability: 0.02 }, { id: "q_large_blast_radius", probability: 0.02 }] };

function writeCatalog(dir: string, body: unknown, name = "host-ops-allowlist-eng-mcp.json"): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(body, null, 2), "utf8");
  return path;
}

function seedCatalog(dir: string): string {
  return writeCatalog(dir, {
    component: "eng-mcp",
    version: 1,
    rules: [
      { id: "status_runner", pattern: "^status eng-mcp-release-runner\\.service$" },
      { id: "is_active_probe", pattern: "^is-active eng-mcp-host-ops-probe\\.service$" },
      { id: "list_units_services", pattern: "^list-units --type=service$" }
    ],
    mutationUnits: ["eng-mcp-release-runner.service", "eng-mcp-host-ops-probe.service", "(manager)"],
    note: "test seed"
  });
}

/** Token fixture no MESMO formato do arquivo operator-order (0600, hash16 de autointegridade). */
function writeTokenFixture(dir: string, token: string, overrides: Record<string, unknown> = {}): string {
  const body: Record<string, unknown> = {
    version: 1,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    createdAt: "2026-10-04T00:00:00.000Z",
    ...overrides
  };
  const hash16 = createHash("sha256").update(canonicalJsonHostOps(body)).digest("hex").slice(0, 16);
  const path = join(dir, "operator-order-token.json");
  writeFileSync(path, `${JSON.stringify({ ...body, hash16 })}\n`, "utf8");
  chmodSync(path, 0o600);
  return path;
}

/** Agente de teste REAL (startHostOpsAgent) com exec espiado — o mesmo código
 *  do daemon, sem sudo (getuid 0) e sem tocar systemctl de produção. */
async function startTestAgent(dir: string, execImpl?: AgentDeps["exec"], catalogBody?: unknown): Promise<{ socketPath: string; execCalls: string[][]; stop: () => Promise<void>; catalogFile: string | null }> {
  const execCalls: string[][] = [];
  const exec: AgentDeps["exec"] = execImpl ?? ((argv) => {
    execCalls.push([...argv]);
    return Promise.resolve({ exitCode: 0, stdout: "active\n", stderr: "", timedOut: false, durationMs: 3 } satisfies AgentExecOutcome);
  });
  let catalogFile: string | null = null;
  if (catalogBody !== undefined) {
    catalogFile = join(dir, "host-ops-agent-catalog.json");
    writeFileSync(catalogFile, JSON.stringify(catalogBody, null, 2), "utf8");
  }
  const server = await startHostOpsAgent({
    socketPath: join(dir, "agent.sock"),
    deps: { exec, getuid: () => 0, catalog: catalogFile ? loadAgentCatalog(catalogFile) : undefined, auditFile: join(dir, "agent-audit.jsonl"), tokenPath: join(dir, "operator-order-token.json") }
  });
  return { socketPath: server.socketPath, execCalls, stop: () => server.close(), catalogFile };
}

import { loadAgentCatalog } from "../src/hostOpsAgent.ts";

const AGENT_CATALOG = {
  version: 1,
  readOnlyUnits: ["eng-mcp-release-runner.service", "eng-mcp-host-ops-probe.service"],
  mutationUnits: [
    { unit: "eng-mcp-host-ops-probe.service", verbs: ["restart", "reload"] },
    { unit: "eng-mcp-release-runner.service", verbs: ["restart", "reload"] },
    { unit: "(manager)", verbs: ["daemon-reload"] }
  ],
  forbiddenUnits: ["cloudflared"],
  note: "test agent catalog"
};

const TOKEN = "test-order-token-0123456789abcdef";

interface Ctx {
  dir: string;
  agentSocket: string;
  stopAgent: () => Promise<void>;
  execCalls: string[][];
  tokenPath: string;
  catalogDir: string;
}

async function withAgentAndCatalog(fn: (ctx: Ctx) => Promise<void> | void): Promise<void> {
  const dir = tmp();
  const tokenPath = writeTokenFixture(dir, TOKEN);
  seedCatalog(dir);
  const agent = await startTestAgent(dir, undefined, AGENT_CATALOG);
  try {
    await fn({ dir, agentSocket: agent.socketPath, stopAgent: agent.stop, execCalls: agent.execCalls, tokenPath, catalogDir: dir });
  } finally {
    await agent.stop();
    rmSync(dir, { recursive: true, force: true });
  }
}

function deps(ctx: Partial<HostRunDeps> & { dir?: string } = {}): HostRunDeps {
  const dir = ctx.dir ?? tmp();
  return {
    socketPath: ctx.socketPath,
    auditFile: join(dir, "host-ops.jsonl"),
    catalogDir: dir,
    verifyToken: ctx.verifyToken,
    judge: ctx.judge,
    subject: ctx.subject,
    send: ctx.send,
    now: () => new Date(1728000000000)
  } as HostRunDeps;
}

describe("tier 0 — critical units/verbs win over everything", () => {
  test("forbidden verb refuses even WITH operatorOrder; nothing reaches the socket", async () => {
    await withAgentAndCatalog(async (ctx) => {
      const result = await runHostSystemd({ verb: "disable", unit: "eng-mcp-host-ops-probe.service", operatorOrder: TOKEN }, { ...deps({ dir: ctx.dir, socketPath: ctx.agentSocket }), verifyToken: () => ({ verified: true, status: "valid", reason: null, tokenHash16: "0123456789abcdef", presentedHash16: "0123456789abcdef" }) });
      assert.equal(result.status, "refused");
      assert.equal(result.tier, 0);
      assert.equal(result.code, "HOST_OPS_FORBIDDEN");
      assert.equal(ctx.execCalls.length, 0, "nothing may execute");
      const audit = readFileSync(join(ctx.dir, "host-ops.jsonl"), "utf8").trim().split("\n");
      const entry = JSON.parse(audit[audit.length - 1]);
      assert.equal(entry.code, "HOST_OPS_FORBIDDEN");
      assert.equal(entry.rule, "verb:disable");
    });
  });

  test("critical unit (sshd) refuses even WITH operatorOrder (tier-0 wins)", async () => {
    await withAgentAndCatalog(async (ctx) => {
      const result = await runHostSystemd({ verb: "status", unit: "sshd.service", operatorOrder: TOKEN }, deps({ dir: ctx.dir, socketPath: ctx.agentSocket }));
      assert.equal(result.status, "refused");
      assert.equal(result.code, "HOST_OPS_FORBIDDEN");
      assert.equal(result.rule, "unit:sshd");
      assert.equal(ctx.execCalls.length, 0);
    });
  });

  test("docker/agent/orchestrator units are all tier-0", async () => {
    const allowlist = { ok: true as const, component: "eng-mcp", path: "x", sha16: "0".repeat(16), rules: [], mutationUnits: [] };
    for (const unit of ["docker.service", "docker.socket", "eng-mcp-host-ops-agent.service", "or-mission-supervisor.service", "herdr-server.service"]) {
      const cls = classifyHostOp({ verb: "restart", unit, args: [] }, allowlist);
      assert.equal(cls.tier, 0, unit);
      assert.equal(cls.code, "HOST_OPS_FORBIDDEN");
    }
  });
});

describe("input validation", () => {
  test("bad unit names / args / mutation-with-args refuse INPUT_INVALID", async () => {
    await withAgentAndCatalog(async (ctx) => {
      for (const input of [
        { verb: "status", unit: "../etc/passwd" },
        { verb: "status", unit: "foo bar" },
        { verb: "status", unit: "a*b" },
        { verb: "status", unit: "ok.service", args: ["bad;arg"] },
        { verb: "restart", unit: "eng-mcp-host-ops-probe.service", args: ["--now"] }
      ]) {
        const result = await runHostSystemd(input as HostSystemdInput, deps({ dir: ctx.dir, socketPath: ctx.agentSocket }));
        assert.equal(result.status, "refused", JSON.stringify(input));
        assert.equal(result.code, "INPUT_INVALID", JSON.stringify(input));
      }
      assert.equal(ctx.execCalls.length, 0);
    });
  });

  test("schema is strict (no unknown fields)", () => {
    assert.equal(hostSystemdInputSchema.safeParse({ verb: "status", unit: "x.service", evil: 1 }).success, false);
    assert.equal(hostSystemdInputSchema.safeParse({ verb: "status", unit: "x.service" }).success, true);
  });
});

describe("tier 1 — read executes via socket, zero LLM", () => {
  test("status of catalogued unit executes; judge NEVER called; audit carries catalog sha16", async () => {
    await withAgentAndCatalog(async (ctx) => {
      let judgeCalls = 0;
      const result = await runHostSystemd({ verb: "status", unit: "eng-mcp-release-runner.service" }, deps({
        dir: ctx.dir, socketPath: ctx.agentSocket,
        judge: async () => { judgeCalls += 1; return SAFE_ANSWERS; }
      }));
      assert.equal(judgeCalls, 0, "tier 1 must be zero-cost");
      assert.equal(result.status, "executed");
      assert.equal(result.tier, 1);
      assert.equal(result.exitCode, 0);
      assert.match(result.rule ?? "", /^catalog:/);
      assert.match(result.audit, /^written$/);
      const lines = readFileSync(join(ctx.dir, "host-ops.jsonl"), "utf8").trim().split("\n");
      const entry = JSON.parse(lines[lines.length - 1]);
      assert.equal(entry.tier, 1);
      assert.match(entry.catalogSha16, /^[0-9a-f]{16}$/);
      assert.equal(entry.status, "executed");
      assert.equal(ctx.execCalls.length, 1);
      assert.deepEqual(ctx.execCalls[0], ["/usr/bin/systemctl", "status", "eng-mcp-release-runner.service"]);
    });
  });

  test("read on a mutation-catalog unit is tier-1 (mutation-unit-read) when no rule matches", async () => {
    await withAgentAndCatalog(async (ctx) => {
      const result = await runHostSystemd({ verb: "show", unit: "eng-mcp-host-ops-probe.service" }, deps({ dir: ctx.dir, socketPath: ctx.agentSocket }));
      assert.equal(result.status, "executed");
      assert.equal(result.rule, "catalog:mutation-unit-read");
    });
  });
});

describe("tier 1 mutation — operatorOrder ALWAYS required", () => {
  test("mutation WITHOUT order → HOST_OPS_ORDER_REQUIRED, agent never called", async () => {
    await withAgentAndCatalog(async (ctx) => {
      const result = await runHostSystemd({ verb: "restart", unit: "eng-mcp-host-ops-probe.service" }, deps({ dir: ctx.dir, socketPath: ctx.agentSocket }));
      assert.equal(result.status, "refused");
      assert.equal(result.code, "HOST_OPS_ORDER_REQUIRED");
      assert.equal(ctx.execCalls.length, 0, "nothing executes without an order");
    });
  });

  test("mutation with UNVERIFIED order → OPERATOR_ORDER_UNVERIFIED, agent never called", async () => {
    await withAgentAndCatalog(async (ctx) => {
      const result = await runHostSystemd({ verb: "restart", unit: "eng-mcp-host-ops-probe.service", operatorOrder: "wrong-token-value-000" }, deps({ dir: ctx.dir, socketPath: ctx.agentSocket }));
      assert.equal(result.status, "refused");
      assert.equal(result.code, "OPERATOR_ORDER_UNVERIFIED");
      assert.equal(ctx.execCalls.length, 0);
      const lines = readFileSync(join(ctx.dir, "host-ops.jsonl"), "utf8").trim().split("\n");
      const entry = JSON.parse(lines[lines.length - 1]);
      assert.match(entry.orderHash16, /^[0-9a-f]{16}$/);
      assert.equal(JSON.stringify(entry).includes("wrong-token-value"), false, "token value never reaches the audit");
    });
  });

  test("mutation with VERIFIED order (real token fixture) executes via agent", async () => {
    await withAgentAndCatalog(async (ctx) => {
      const result = await runHostSystemd(
        { verb: "restart", unit: "eng-mcp-host-ops-probe.service", operatorOrder: TOKEN },
        { ...deps({ dir: ctx.dir, socketPath: ctx.agentSocket }), verifyToken: (candidate) => verifyOperatorOrderLocal(candidate, ctx.tokenPath) }
      );
      assert.equal(result.status, "executed");
      assert.equal(result.tier, 1);
      assert.equal(ctx.execCalls.length, 1);
      assert.deepEqual(ctx.execCalls[0], ["/usr/bin/systemctl", "restart", "eng-mcp-host-ops-probe.service"]);
      const lines = readFileSync(join(ctx.dir, "host-ops.jsonl"), "utf8").trim().split("\n");
      const entry = JSON.parse(lines[lines.length - 1]);
      assert.equal(entry.status, "executed");
      assert.match(entry.orderHash16, /^[0-9a-f]{16}$/);
      assert.equal(JSON.stringify(entry).includes(TOKEN), false, "token value never reaches the audit");
    });
  });

  test("supervisor WITHOUT order → SUPERVISOR_MUTATION_FORBIDDEN (guard legacy)", async () => {
    await withAgentAndCatalog(async (ctx) => {
      const rolesFile = join(ctx.dir, "roles.json");
      writeFileSync(rolesFile, JSON.stringify({ supervisorSubjects: ["supervisor"] }), "utf8");
      const savedRoles = process.env.ENG_MCP_ROLES_FILE;
      const savedAudit = process.env.ENG_MCP_GUARD_AUDIT_FILE;
      process.env.ENG_MCP_ROLES_FILE = rolesFile;
      process.env.ENG_MCP_GUARD_AUDIT_FILE = join(ctx.dir, "guard-spool.jsonl");
      try {
        const result = await runHostSystemd({ verb: "restart", unit: "eng-mcp-host-ops-probe.service" }, deps({ dir: ctx.dir, socketPath: ctx.agentSocket, subject: "supervisor" }));
        assert.equal(result.status, "refused");
        assert.equal(result.code, "SUPERVISOR_MUTATION_FORBIDDEN");
        assert.equal(ctx.execCalls.length, 0);
      } finally {
        if (savedRoles === undefined) delete process.env.ENG_MCP_ROLES_FILE; else process.env.ENG_MCP_ROLES_FILE = savedRoles;
        if (savedAudit === undefined) delete process.env.ENG_MCP_GUARD_AUDIT_FILE; else process.env.ENG_MCP_GUARD_AUDIT_FILE = savedAudit;
      }
    });
  });
});

describe("tier 2 — unknown read goes to Jev (fail-closed)", () => {
  test("judge safe → forwarded to agent; agent refuses unknown unit honestly", async () => {
    await withAgentAndCatalog(async (ctx) => {
      const result = await runHostSystemd({ verb: "status", unit: "some-unknown.service" }, deps({ dir: ctx.dir, socketPath: ctx.agentSocket, judge: async () => SAFE_ANSWERS }));
      assert.equal(result.status, "refused");
      assert.equal(result.tier, 2);
      assert.equal(result.code, "AGENT_REFUSED");
      assert.equal(result.agentRefused, true, "the agent is the second barrier");
      assert.equal(ctx.execCalls.length, 0, "agent refused before exec");
    });
  });

  test("judge unsafe → HOST_OPS_JUDGE_REFUSED", async () => {
    await withAgentAndCatalog(async (ctx) => {
      const result = await runHostSystemd({ verb: "status", unit: "some-unknown.service" }, deps({ dir: ctx.dir, socketPath: ctx.agentSocket, judge: async () => RISKY_ANSWERS }));
      assert.equal(result.status, "refused");
      assert.equal(result.code, "HOST_OPS_JUDGE_REFUSED");
      assert.equal(ctx.execCalls.length, 0);
    });
  });

  test("judge unavailable → fail-closed HOST_OPS_JUDGE_UNAVAILABLE", async () => {
    await withAgentAndCatalog(async (ctx) => {
      const result = await runHostSystemd({ verb: "status", unit: "some-unknown.service" }, deps({ dir: ctx.dir, socketPath: ctx.agentSocket, judge: async () => { throw new Error("provider down"); } }));
      assert.equal(result.status, "refused");
      assert.equal(result.code, "HOST_OPS_JUDGE_UNAVAILABLE");
      assert.equal(ctx.execCalls.length, 0);
    });
  });
});

describe("tier 3 — operator consequence, agent still applies its own catalog", () => {
  test("verb outside phase-1 without order → HOST_OPS_ORDER_REQUIRED", async () => {
    await withAgentAndCatalog(async (ctx) => {
      const result = await runHostSystemd({ verb: "enable", unit: "eng-mcp-host-ops-probe.service" }, deps({ dir: ctx.dir, socketPath: ctx.agentSocket }));
      assert.equal(result.status, "refused");
      assert.equal(result.tier, 3);
      assert.equal(result.code, "HOST_OPS_ORDER_REQUIRED");
    });
  });

  test("verb outside phase-1 with verified order → forwarded; agent refuses (AGENT_VERB_NOT_EXPOSED)", async () => {
    await withAgentAndCatalog(async (ctx) => {
      const result = await runHostSystemd(
        { verb: "enable", unit: "eng-mcp-host-ops-probe.service", operatorOrder: TOKEN },
        { ...deps({ dir: ctx.dir, socketPath: ctx.agentSocket }), verifyToken: (candidate) => verifyOperatorOrderLocal(candidate, ctx.tokenPath) }
      );
      assert.equal(result.status, "refused");
      assert.equal(result.tier, 3);
      assert.equal(result.code, "AGENT_VERB_NOT_EXPOSED");
      assert.equal(result.agentRefused, true);
      assert.equal(ctx.execCalls.length, 0);
    });
  });

  test("mutation outside the mutation catalog with verified order → agent refuses (defense in depth)", async () => {
    await withAgentAndCatalog(async (ctx) => {
      const result = await runHostSystemd(
        { verb: "restart", unit: "some-unknown.service", operatorOrder: TOKEN },
        { ...deps({ dir: ctx.dir, socketPath: ctx.agentSocket }), verifyToken: (candidate) => verifyOperatorOrderLocal(candidate, ctx.tokenPath) }
      );
      assert.equal(result.status, "refused");
      assert.equal(result.tier, 3);
      assert.equal(result.code, "AGENT_REFUSED");
      assert.equal(ctx.execCalls.length, 0);
    });
  });
});

describe("anti-fragile — HOST_AGENT_UNAVAILABLE is honest", () => {
  test("socket absent → HOST_AGENT_UNAVAILABLE (never fakes execution)", async () => {
    const dir = tmp();
    try {
      seedCatalog(dir);
      const result = await runHostSystemd({ verb: "status", unit: "eng-mcp-release-runner.service" }, deps({ dir, socketPath: join(dir, "nope.sock") }));
      assert.equal(result.status, "refused");
      assert.equal(result.code, "HOST_AGENT_UNAVAILABLE");
      const lines = readFileSync(join(dir, "host-ops.jsonl"), "utf8").trim().split("\n");
      const entry = JSON.parse(lines[lines.length - 1]);
      assert.equal(entry.code, "HOST_AGENT_UNAVAILABLE");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("socket alive but silent → timeout → HOST_AGENT_UNAVAILABLE", async () => {
    const dir = tmp();
    try {
      seedCatalog(dir);
      const net = await import("node:net");
      const silent = net.createServer(() => { /* never responds */ });
      const silentPath = join(dir, "silent.sock");
      await new Promise<void>((resolve) => silent.listen(silentPath, () => resolve()));
      const result = await runHostSystemd({ verb: "status", unit: "eng-mcp-release-runner.service", timeoutMs: 600 }, deps({ dir, socketPath: silentPath }));
      assert.equal(result.status, "refused");
      assert.equal(result.code, "HOST_AGENT_UNAVAILABLE");
      silent.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("ping answers when the agent is up; HOST_AGENT_UNAVAILABLE when down", async () => {
    await withAgentAndCatalog(async (ctx) => {
      const up = await runHostSystemd({ op: "ping" }, deps({ dir: ctx.dir, socketPath: ctx.agentSocket }));
      assert.equal(up.status, "executed");
      assert.match(up.agentCatalogSha16 ?? "", /^[0-9a-f]{16}$/, "ping carries the agent catalog sha16");
      await ctx.stopAgent();
      const down = await runHostSystemd({ op: "ping" }, deps({ dir: ctx.dir, socketPath: ctx.agentSocket }));
      assert.equal(down.status, "refused");
      assert.equal(down.code, "HOST_AGENT_UNAVAILABLE");
    });
  });
});

describe("catalog semantics", () => {
  test("invalid catalog is ignored with the error in the audit (fail-open to builtin, never to danger)", async () => {
    const dir = tmp();
    try {
      writeCatalog(dir, { component: "eng-mcp", version: 0, rules: [] });
      const loaded = loadHostOpsAllowlistCatalog("eng-mcp", dir);
      assert.equal(loaded && loaded.ok, false);
      const net = await import("node:net");
      const silent = net.createServer(() => {});
      const silentPath = join(dir, "silent.sock");
      await new Promise<void>((resolve) => silent.listen(silentPath, () => resolve()));
      const result = await runHostSystemd({ verb: "status", unit: "eng-mcp-release-runner.service", timeoutMs: 600 }, deps({ dir, socketPath: silentPath, judge: async () => { throw new Error("test: judge down"); } }));
      // deps() já aponta catalogDir=dir (catálogo inválido gravado acima)
      assert.equal(result.status, "refused");
      assert.equal(result.code, "HOST_OPS_JUDGE_UNAVAILABLE", "invalid catalog → read falls to tier-2 → judge fail-closes");
      silent.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("validateHostOpsAllowlistCatalog rejects bad shapes", () => {
    assert.equal(validateHostOpsAllowlistCatalog({ component: "eng-mcp", version: 1, rules: [] }).ok, true);
    assert.equal(validateHostOpsAllowlistCatalog({ component: "other", version: 1, rules: [] }, "eng-mcp").ok, false);
    assert.equal(validateHostOpsAllowlistCatalog({ component: "eng-mcp", version: 1, rules: [{ id: "a", pattern: "(" }] }).ok, false);
    assert.equal(validateHostOpsAllowlistCatalog({ component: "eng-mcp", version: 1, rules: [], mutationUnits: "nope" }).ok, false);
    assert.equal(validateHostOpsAllowlistCatalog({ component: "eng-mcp", version: 1, rules: [], mutationUnits: ["../evil"] }).ok, false);
  });
});

describe("verifyOperatorOrderLocal — same interface as SEC-OPERATOR-IDENTITY-01", () => {
  test("valid token verifies; wrong token does not", () => {
    const dir = tmp();
    try {
      const path = writeTokenFixture(dir, TOKEN);
      assert.equal(verifyOperatorOrderLocal(TOKEN, path).verified, true);
      assert.equal(verifyOperatorOrderLocal("another-token-entirely", path).verified, false);
      assert.equal(verifyOperatorOrderLocal("another-token-entirely", path).status, "invalid");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("absent / insecure mode / revoked / disabled / expired / hash-mismatch all fail closed", () => {
    const dir = tmp();
    try {
      assert.equal(verifyOperatorOrderLocal(TOKEN, join(dir, "absent.json")).status, "absent");
      const insecure = writeTokenFixture(dir, TOKEN, {});
      chmodSync(insecure, 0o644);
      assert.equal(verifyOperatorOrderLocal(TOKEN, insecure).reason, "INSECURE_MODE");
      const revoked = writeTokenFixture(dir, TOKEN, { revoked: true });
      assert.equal(verifyOperatorOrderLocal(TOKEN, revoked).status, "revoked");
      const disabled = writeTokenFixture(dir, TOKEN, { disabled: true });
      assert.equal(verifyOperatorOrderLocal(TOKEN, disabled).status, "disabled");
      const expired = writeTokenFixture(dir, TOKEN, { expiresAt: "2026-01-01T00:00:00.000Z" });
      assert.equal(verifyOperatorOrderLocal(TOKEN, expired).status, "expired");
      const mismatch = writeTokenFixture(dir, TOKEN);
      const body = JSON.parse(readFileSync(mismatch, "utf8"));
      body.hash16 = "0".repeat(16);
      writeFileSync(mismatch, JSON.stringify(body), "utf8");
      chmodSync(mismatch, 0o600);
      assert.equal(verifyOperatorOrderLocal(TOKEN, mismatch).status, "hash_mismatch");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("unit name + socket state helpers", () => {
  test("isValidUnitName / normalizeUnitName", () => {
    assert.equal(isValidUnitName("eng-mcp-release-runner.service"), true);
    assert.equal(isValidUnitName("a..b"), false);
    assert.equal(isValidUnitName("a/b"), false);
    assert.equal(normalizeUnitName("sshd.service"), "sshd");
    assert.equal(normalizeUnitName("Docker.Socket"), "docker");
  });
  test("hostOpsSocketState reports absence honestly", () => {
    const state = hostOpsSocketState();
    assert.equal(typeof state.socketPath, "string");
    assert.equal(typeof state.present, "boolean");
  });
});
