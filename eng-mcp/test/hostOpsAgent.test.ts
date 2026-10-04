// ENG-HOST-GOVERNED-OPS-01 — contract tests for the HOST agent core
// (src/hostOpsAgent.ts): the second barrier. Coverage: agent catalog
// validation; builtin tier-0 (critical units/verbs); unit/verb must be in the
// agent catalog; mutation requires a verified operatorOrder; argv is EXACT
// (sudo only when non-root, shell:false); deterministic fail-closed on unknown
// everything; socket integration (one request per connection, size cap, bad
// JSON) with the REAL server + REAL unix socket.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  handleAgentRequest, validateAgentCatalog, loadAgentCatalog, agentArgvFor, startHostOpsAgent,
  type AgentDeps, type AgentExecOutcome
} from "../src/hostOpsAgent.ts";
import { connectHostAgent, canonicalJsonHostOps } from "../src/hostSystemd.ts";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "host-ops-agent-test-"));
}

const AGENT_CATALOG = {
  version: 1,
  readOnlyUnits: ["eng-mcp-release-runner.service", "eng-mcp-host-ops-probe.service"],
  mutationUnits: [
    { unit: "eng-mcp-host-ops-probe.service", verbs: ["restart", "reload"] },
    { unit: "eng-mcp-release-runner.service", verbs: ["restart", "reload"] },
    { unit: "(manager)", verbs: ["daemon-reload"] }
  ],
  forbiddenUnits: ["cloudflared"],
  note: "test"
};

const TOKEN = "agent-test-order-token-00112233";

function writeTokenFixture(dir: string, token: string): string {
  const body: Record<string, unknown> = {
    version: 1,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    createdAt: "2026-10-04T00:00:00.000Z"
  };
  const hash16 = createHash("sha256").update(canonicalJsonHostOps(body)).digest("hex").slice(0, 16);
  const path = join(dir, "operator-order-token.json");
  writeFileSync(path, `${JSON.stringify({ ...body, hash16 })}\n`, "utf8");
  chmodSync(path, 0o600);
  return path;
}

interface AgentCtx {
  dir: string;
  tokenPath: string;
  auditLines: () => Record<string, unknown>[];
  calls: () => string[][];
}

function agentDeps(dir: string, overrides: Partial<AgentDeps> = {}): AgentDeps & { _calls: string[][] } {
  const calls: string[][] = [];
  const base: AgentDeps = {
    exec: async (argv): Promise<AgentExecOutcome> => {
      calls.push([...argv]);
      return { exitCode: 0, stdout: "ok\n", stderr: "", timedOut: false, durationMs: 2 };
    },
    getuid: () => 12345, // não-root por default: mutação DEVE passar por sudo
    now: () => new Date(1728000000000),
    catalog: { ok: true, catalog: AGENT_CATALOG, sha16: "a".repeat(16) },
    tokenPath: join(dir, "operator-order-token.json"),
    auditFile: join(dir, "agent-audit.jsonl"),
    ...overrides
  };
  return { ...base, _calls: calls } as AgentDeps & { _calls: string[][] };
}

function ctxFor(dir: string, overrides: Partial<AgentDeps> = {}): AgentCtx & { deps: ReturnType<typeof agentDeps> } {
  const tokenPath = writeTokenFixture(dir, TOKEN);
  const deps = agentDeps(dir, overrides);
  return {
    dir,
    tokenPath,
    deps,
    auditLines: () => readFileSync(join(dir, "agent-audit.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)),
    calls: () => deps._calls
  };
}

describe("agent catalog validation", () => {
  test("valid catalog passes; bad shapes fail with reason", () => {
    assert.equal(validateAgentCatalog(AGENT_CATALOG).ok, true);
    assert.equal(validateAgentCatalog({ ...AGENT_CATALOG, version: 2 }).ok, false);
    assert.equal(validateAgentCatalog({ ...AGENT_CATALOG, mutationUnits: [{ unit: "x.service", verbs: ["status"] }] }).ok, false, "read verbs are not mutations");
    assert.equal(validateAgentCatalog({ ...AGENT_CATALOG, mutationUnits: [{ unit: "x.service", verbs: [] }] }).ok, false);
    assert.equal(validateAgentCatalog({ ...AGENT_CATALOG, readOnlyUnits: "nope" }).ok, false);
    assert.equal(validateAgentCatalog({ ...AGENT_CATALOG, forbiddenUnits: [42] }).ok, false);
    const dup = { ...AGENT_CATALOG, mutationUnits: [{ unit: "x.service", verbs: ["restart"] }, { unit: "x.service", verbs: ["reload"] }] };
    assert.equal(validateAgentCatalog(dup).ok, false);
  });
  test("loadAgentCatalog: absent file fails closed with reason", () => {
    const loaded = loadAgentCatalog(join(tmp(), "does-not-exist.json"));
    assert.equal(loaded.ok, false);
  });
});

describe("agent core — deterministic policy", () => {
  test("ping answers with catalog sha16 and no exec", async () => {
    const dir = tmp();
    try {
      const ctx = ctxFor(dir);
      const response = await handleAgentRequest({ op: "ping", id: "p1" }, ctx.deps);
      assert.equal(response.ok, true);
      assert.equal(response.pong, true);
      assert.equal(response.agentCatalogSha16, "a".repeat(16));
      assert.equal(ctx.calls().length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("read of catalogued unit spawns EXACT argv (no shell, no sudo)", async () => {
    const dir = tmp();
    try {
      const ctx = ctxFor(dir);
      const response = await handleAgentRequest({ op: "exec", id: "r1", verb: "status", unit: "eng-mcp-release-runner.service", args: [] }, ctx.deps);
      assert.equal(response.ok, true);
      assert.equal(response.exitCode, 0);
      assert.deepEqual(ctx.calls()[0], ["/usr/bin/systemctl", "status", "eng-mcp-release-runner.service"]);
      const audit = ctx.auditLines().filter((l) => l.decision === "executed");
      assert.equal(audit.length, 1);
      assert.equal(audit[0].isRoot, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("read of UNKNOWN unit → AGENT_REFUSED (fail-closed honest)", async () => {
    const dir = tmp();
    try {
      const ctx = ctxFor(dir);
      const response = await handleAgentRequest({ op: "exec", id: "r2", verb: "status", unit: "whatever.service", args: [] }, ctx.deps);
      assert.equal(response.ok, false);
      assert.equal(response.code, "AGENT_REFUSED");
      assert.equal(ctx.calls().length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("builtin tier-0 (sshd) and catalog forbiddenUnits refuse", async () => {
    const dir = tmp();
    try {
      const ctx = ctxFor(dir);
      const sshd = await handleAgentRequest({ op: "exec", id: "t1", verb: "status", unit: "sshd.service", args: [] }, ctx.deps);
      assert.equal(sshd.code, "HOST_OPS_FORBIDDEN");
      const cloudflared = await handleAgentRequest({ op: "exec", id: "t2", verb: "status", unit: "cloudflared.service", args: [] }, ctx.deps);
      assert.equal(cloudflared.code, "HOST_OPS_FORBIDDEN");
      assert.equal(ctx.calls().length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("forbidden VERB (even with order) refuses", async () => {
    const dir = tmp();
    try {
      const ctx = ctxFor(dir);
      const response = await handleAgentRequest({ op: "exec", id: "t3", verb: "mask", unit: "eng-mcp-host-ops-probe.service", operatorOrder: TOKEN }, ctx.deps);
      assert.equal(response.code, "HOST_OPS_FORBIDDEN");
      assert.equal(ctx.calls().length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("mutation requires operatorOrder; UNVERIFIED order refuses; VERIFIED executes via sudo -n (non-root)", async () => {
    const dir = tmp();
    try {
      const ctx = ctxFor(dir);
      const noOrder = await handleAgentRequest({ op: "exec", id: "m1", verb: "restart", unit: "eng-mcp-host-ops-probe.service" }, ctx.deps);
      assert.equal(noOrder.code, "HOST_OPS_ORDER_REQUIRED");
      const badOrder = await handleAgentRequest({ op: "exec", id: "m2", verb: "restart", unit: "eng-mcp-host-ops-probe.service", operatorOrder: "not-the-token-999" }, ctx.deps);
      assert.equal(badOrder.code, "OPERATOR_ORDER_UNVERIFIED");
      assert.equal(ctx.calls().length, 0, "nothing executes before a verified order");
      const good = await handleAgentRequest({ op: "exec", id: "m3", verb: "restart", unit: "eng-mcp-host-ops-probe.service", operatorOrder: TOKEN }, ctx.deps);
      assert.equal(good.ok, true);
      assert.deepEqual(ctx.calls()[0], ["sudo", "-n", "/usr/bin/systemctl", "restart", "eng-mcp-host-ops-probe.service"]);
      const audit = ctx.auditLines().filter((l) => l.decision === "executed" && l.verb === "restart");
      assert.equal(audit.length, 1);
      assert.match(audit[0].orderHash16 ?? "", /^[0-9a-f]{16}$/);
      assert.equal(JSON.stringify(audit[0]).includes(TOKEN), false, "token never reaches the audit");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("mutation outside the agent catalog refuses even WITH a verified order", async () => {
    const dir = tmp();
    try {
      const ctx = ctxFor(dir);
      const response = await handleAgentRequest({ op: "exec", id: "m4", verb: "restart", unit: "some-other.service", operatorOrder: TOKEN }, ctx.deps);
      assert.equal(response.ok, false);
      assert.equal(response.code, "AGENT_REFUSED");
      assert.equal(ctx.calls().length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("daemon-reload needs the (manager) entry + verified order; argv is exact", async () => {
    const dir = tmp();
    try {
      const ctx = ctxFor(dir);
      const good = await handleAgentRequest({ op: "exec", id: "d1", verb: "daemon-reload", operatorOrder: TOKEN }, ctx.deps);
      assert.equal(good.ok, true);
      assert.deepEqual(ctx.calls()[0], ["sudo", "-n", "/usr/bin/systemctl", "daemon-reload"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("unknown verb and bad requests refuse deterministically", async () => {
    const dir = tmp();
    try {
      const ctx = ctxFor(dir);
      assert.equal((await handleAgentRequest({ op: "exec", id: "u1", verb: "tickle", unit: "eng-mcp-host-ops-probe.service" }, ctx.deps)).code, "AGENT_VERB_NOT_EXPOSED");
      assert.equal((await handleAgentRequest({ op: "exec", id: "u2", verb: "status", unit: "a b" }, ctx.deps)).code, "AGENT_BAD_REQUEST");
      assert.equal((await handleAgentRequest({ op: "wat", id: "u3" }, ctx.deps)).code, "AGENT_BAD_REQUEST");
      assert.equal((await handleAgentRequest("not-an-object", ctx.deps)).code, "AGENT_BAD_REQUEST");
      assert.equal(ctx.calls().length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("agent catalog unavailable → NOTHING executes (the catalog IS the host frontier)", async () => {
    const dir = tmp();
    try {
      const ctx = ctxFor(dir, { catalog: { ok: false, error: "absent" } });
      const response = await handleAgentRequest({ op: "exec", id: "c1", verb: "status", unit: "eng-mcp-release-runner.service", args: [] }, ctx.deps);
      assert.equal(response.ok, false);
      assert.equal(response.code, "AGENT_CATALOG_UNAVAILABLE");
      assert.equal(ctx.calls().length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("agentArgvFor — exact argv, sudo only when non-root", () => {
  test("non-root mutation wraps sudo -n with absolute systemctl", () => {
    assert.deepEqual(agentArgvFor("restart", "x.service", [], false), ["sudo", "-n", "/usr/bin/systemctl", "restart", "x.service"]);
    assert.deepEqual(agentArgvFor("daemon-reload", null, [], false), ["sudo", "-n", "/usr/bin/systemctl", "daemon-reload"]);
  });
  test("root runs systemctl directly (dev/test mode only)", () => {
    assert.deepEqual(agentArgvFor("restart", "x.service", [], true), ["/usr/bin/systemctl", "restart", "x.service"]);
  });
  test("read argv puts validated args before the verb", () => {
    assert.deepEqual(agentArgvFor("list-units", null, ["--type=service"], false), ["/usr/bin/systemctl", "--type=service", "list-units"]);
    assert.deepEqual(agentArgvFor("status", "x.service", [], false), ["/usr/bin/systemctl", "status", "x.service"]);
  });
});

describe("socket integration — REAL server, REAL unix socket", () => {
  test("round-trip exec + ping through the socket", async () => {
    const dir = tmp();
    try {
      const tokenPath = writeTokenFixture(dir, TOKEN);
      const calls: string[][] = [];
      const server = await startHostOpsAgent({
        socketPath: join(dir, "agent.sock"),
        deps: {
          exec: async (argv) => {
            calls.push([...argv]);
            return { exitCode: 0, stdout: "active", stderr: "", timedOut: false, durationMs: 1 };
          },
          getuid: () => 0,
          catalog: { ok: true, catalog: AGENT_CATALOG, sha16: "b".repeat(16) },
          tokenPath,
          auditFile: join(dir, "agent-audit.jsonl")
        }
      });
      try {
        const ping = await connectHostAgent(server.socketPath, { id: "p", op: "ping", ts: "t" }, 5000);
        assert.equal(ping.pong, true);
        const exec = await connectHostAgent(server.socketPath, { id: "e", op: "exec", verb: "is-active", unit: "eng-mcp-host-ops-probe.service", args: [], ts: "t" }, 5000);
        assert.equal(exec.ok, true);
        assert.deepEqual(calls[0], ["/usr/bin/systemctl", "is-active", "eng-mcp-host-ops-probe.service"]);
      } finally {
        await server.close();
      }
      assert.equal(existsSync(server.socketPath), false, "socket file is removed on close");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("oversized and non-JSON requests get AGENT_BAD_REQUEST over the socket", async () => {
    const dir = tmp();
    try {
      const server = await startHostOpsAgent({
        socketPath: join(dir, "agent.sock"),
        deps: { catalog: { ok: true, catalog: AGENT_CATALOG, sha16: "c".repeat(16) }, auditFile: join(dir, "agent-audit.jsonl") }
      });
      try {
        const net = await import("node:net");
        const huge = `${JSON.stringify({ op: "exec", verb: "status", unit: "x.service", args: [], pad: "x".repeat(70_000) })}\n`;
        const oversized = await new Promise<string>((resolve) => {
          const socket = net.connect(server.socketPath, () => socket.write(huge));
          let buf = "";
          socket.on("data", (chunk: Buffer) => {
            buf += chunk.toString("utf8");
            if (buf.includes("\n")) resolve(buf);
          });
        });
        assert.match(oversized, /AGENT_BAD_REQUEST/);
        const badJson = await new Promise<string>((resolve) => {
          const socket = net.connect(server.socketPath, () => socket.write("{not json\n"));
          let buf = "";
          socket.on("data", (chunk: Buffer) => {
            buf += chunk.toString("utf8");
            if (buf.includes("\n")) resolve(buf);
          });
        });
        assert.match(badJson, /AGENT_BAD_REQUEST/);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
