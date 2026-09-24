// SHIP-LOCK-01 — tests for the deterministic ship-phase lock.
// Layer 1 (src/shipLock.ts): the MCP gate acquires an O_EXCL ship.lock before
// any ship-phase tool handler runs; a present lock is a tier-1 refusal naming
// the holder, its age and the operator revoke path. Layer 2
// (scripts/eng-mcp-release.mjs assertNoShipLock, the FIRST statement of
// deployAction): the release runner independently refuses a deploy while a
// lock is present (gate-bypass proof), passing ONLY the gate's own armed
// pipeline marker. Presence NEVER grants: expired and unreadable locks are
// also refusals — expiry never auto-releases silently. Audit is
// metadata-only JSONL. Deterministic: no network, no LLM, no SSH/shell; every
// artifact lives in a temp dir removed after each test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { ENGINEERING_SERVER_INFO, installToolAliasCompatibility, registerEngineeringTools } from "../src/tools.ts";
import { acquireShipLock, releaseShipLock, readShipLock, shipPhaseGatedServer, type ShipLockRecord } from "../src/shipLock.ts";
import { classifyShipLock, assertNoShipLock, deployAction } from "../scripts/eng-mcp-release.mjs";
import type { RepositoryAdapter } from "../src/repository.ts";
import type { AuthenticatedSubject } from "../src/policy.ts";

const PROBE_CTX = { mcpReq: { requestState: () => undefined } };

function recordFixture(overrides: Partial<ShipLockRecord> = {}): ShipLockRecord {
  const now = Date.now();
  return { version: 1, tool: "engineering.git.commit", holder: "ghost-holder", holderHash16: "0".repeat(16), mission: null, acquiredAt: new Date(now - 30_000).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString(), pid: 12_345, ...overrides };
}

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "shiplock-"));
}

async function waitFor(predicate: () => Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function auditEvents(auditFile: string): Promise<Array<Record<string, unknown>>> {
  const raw = await readFile(auditFile, "utf8");
  return raw.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

test("acquire creates the O_EXCL lock; a second acquire refuses naming holder and age (proof a)", async () => {
  const dir = await tempDir();
  const lockPath = path.join(dir, "ship.lock");
  const auditFile = path.join(dir, "ship-lock.jsonl");
  const first = await acquireShipLock("engineering.git.commit", "mission-a", { lockPath, auditFile });
  assert.equal(first.record.tool, "engineering.git.commit");
  assert.notEqual(first.record.pipelineArmed, true, "only the pipeline tool is armed");
  const locked = await readShipLock(lockPath);
  assert.equal(locked.status, "active");
  await assert.rejects(
    () => acquireShipLock("engineering.git.merge", "second-holder", { lockPath, auditFile }),
    (error: Error) => {
      assert.match(error.message, /SHIP_LOCK_ACTIVE/);
      assert.match(error.message, /mission-a/);
      assert.match(error.message, /ageMs=/);
      assert.match(error.message, /rm /);
      return true;
    },
  );
  await rm(dir, { recursive: true, force: true });
});

test("an expired lock is a refusal with the revoke path; it never auto-releases (proof b)", async () => {
  const dir = await tempDir();
  const lockPath = path.join(dir, "ship.lock");
  const auditFile = path.join(dir, "ship-lock.jsonl");
  const past = recordFixture({ acquiredAt: new Date(Date.now() - 7_300_000).toISOString(), expiresAt: new Date(Date.now() - 100_000).toISOString() });
  await writeFile(lockPath, `${JSON.stringify(past, null, 2)}\n`);
  await assert.rejects(
    () => acquireShipLock("engineering.git.commit", "new-holder", { lockPath, auditFile }),
    (error: Error) => {
      assert.match(error.message, /SHIP_LOCK_EXPIRED/);
      assert.match(error.message, /ghost-holder/);
      assert.match(error.message, /rm /);
      return true;
    },
  );
  const view = await readShipLock(lockPath);
  assert.equal(view.status, "expired", "the expired lock must still be on disk (no silent auto-release)");
  await rm(dir, { recursive: true, force: true });
});

test("an unreadable lock fails closed with SHIP_LOCK_UNREADABLE", async () => {
  const dir = await tempDir();
  const lockPath = path.join(dir, "ship.lock");
  const auditFile = path.join(dir, "ship-lock.jsonl");
  await writeFile(lockPath, "not-a-lock-record{{{");
  await assert.rejects(() => acquireShipLock("engineering.git.commit", "h", { lockPath, auditFile }), /SHIP_LOCK_UNREADABLE/);
  await rm(dir, { recursive: true, force: true });
});

test("release removes only when the lock content is unchanged (owner-drift skip)", async () => {
  const dir = await tempDir();
  const lockPath = path.join(dir, "ship.lock");
  const auditFile = path.join(dir, "ship-lock.jsonl");
  const lock = await acquireShipLock("engineering.git.commit", "owner-a", { lockPath, auditFile });
  assert.equal(await releaseShipLock({ lockPath, auditFile, expectedSha16: lock.sha16 }), "removed");
  assert.equal(await readShipLock(lockPath).then((view) => view.present), false);
  const second = await acquireShipLock("engineering.git.commit", "owner-b", { lockPath, auditFile });
  await writeFile(lockPath, `${JSON.stringify(recordFixture({ holder: "hijacker" }), null, 2)}\n`);
  assert.equal(await releaseShipLock({ lockPath, auditFile, expectedSha16: second.sha16 }), "skipped", "release must NOT delete a lock taken over by another owner");
  const after = await readShipLock(lockPath);
  assert.equal(after.record?.holder, "hijacker");
  await rm(dir, { recursive: true, force: true });
});

test("only engineering.release.pipeline arms the pipeline marker", async () => {
  const dir = await tempDir();
  const lockPath = path.join(dir, "ship.lock");
  const auditFile = path.join(dir, "ship-lock.jsonl");
  const pipeline = await acquireShipLock("engineering.release.pipeline", "owner-p", { lockPath, auditFile });
  assert.equal(pipeline.record.pipelineArmed, true);
  await releaseShipLock({ lockPath, auditFile, expectedSha16: pipeline.sha16 });
  const plain = await acquireShipLock("engineering.git.commit", "owner-c", { lockPath, auditFile });
  assert.notEqual(plain.record.pipelineArmed, true);
  await rm(dir, { recursive: true, force: true });
});

test("gated server: concurrent ship calls — exactly one proceeds, the other refuses naming the holder; audit shows both (proof d)", async () => {
  const dir = await tempDir();
  const lockPath = path.join(dir, "ship.lock");
  const auditFile = path.join(dir, "ship-lock.jsonl");
  const subject: AuthenticatedSubject = { subject: "probe-a-holder", scopes: ["engineering:read", "engineering:write"], tokenHash16: "aaaaaaaaaaaaaaaa" };
  const gated = shipPhaseGatedServer(new McpServer(ENGINEERING_SERVER_INFO), subject, { lockPath, auditFile });
  let resolveA!: () => void;
  const held = new Promise<void>((resolve) => { resolveA = resolve; });
  let calls = 0;
  (gated as unknown as McpServer).registerTool("engineering.release.run", {
    description: "SHIP-LOCK-01 concurrency probe",
    inputSchema: {},
  } as never, async () => {
    calls += 1;
    if (calls === 1) { await held; return { content: [{ type: "text", text: "PROBE-A-OK" }] }; }
    return { content: [{ type: "text", text: `PROBE-N-OK-${calls}` }] };
  });
  const handlers = (gated as unknown as McpServer).server as unknown as { _getRequestHandler(method: string): (request: unknown, ctx: unknown) => Promise<unknown> };
  const call = handlers._getRequestHandler("tools/call") as (request: unknown, ctx: unknown) => Promise<unknown>;
  assert.ok(typeof call === "function");
  const request = { method: "tools/call", params: { name: "engineering.release.run", arguments: {} } };
  const pendingA = call(request, PROBE_CTX);
  await waitFor(async () => (await stat(lockPath).then(() => true, () => false)), "A to acquire the ship lock");
  const resultB = await call(request, PROBE_CTX);
  assert.ok((resultB as { isError?: boolean }).isError, "B must be refused while A holds the lock");
  const textB = ((resultB as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? "");
  assert.match(textB, /SHIP_LOCK_ACTIVE/);
  assert.match(textB, /probe-a-holder/, "the refusal names the holder");
  resolveA();
  const resultA = await pendingA;
  assert.ok(!(resultA as { isError?: boolean }).isError, `A must proceed: ${JSON.stringify(resultA)}`);
  assert.match(((resultA as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? ""), /PROBE-A-OK/);
  const resultC = await call(request, PROBE_CTX);
  assert.ok(!(resultC as { isError?: boolean }).isError, "C must proceed after A released");
  const events = await auditEvents(auditFile);
  const names = events.map((entry) => entry.event);
  assert.ok(names.includes("acquire"), `audit must show acquires: ${JSON.stringify(events)}`);
  assert.ok(names.includes("refuse"), "audit must show the refusal");
  assert.ok(names.includes("release"), "audit must show the release");
  const refuse = events.find((entry) => entry.event === "refuse");
  assert.match(String(refuse?.tool), /engineering\.release\.run/);
  assert.match(String(refuse?.holderHash16 ?? ""), /^[0-9a-f]{16}$/, "audit carries holderHash16, never the holder id");
  await rm(dir, { recursive: true, force: true });
});

test("gated server: an expired lock refuses the ship tool through the real MCP stack (proof b at gate level)", async () => {
  const dir = await tempDir();
  const lockPath = path.join(dir, "ship.lock");
  const auditFile = path.join(dir, "ship-lock.jsonl");
  const past = recordFixture({ tool: "engineering.release.run", acquiredAt: new Date(Date.now() - 8_000_000).toISOString(), expiresAt: new Date(Date.now() - 1000).toISOString() });
  await writeFile(lockPath, `${JSON.stringify(past, null, 2)}\n`);
  const subject: AuthenticatedSubject = { subject: "probe-expired", scopes: ["engineering:read", "engineering:write"], tokenHash16: "bbbbbbbbbbbbbbbb" };
  const gated = shipPhaseGatedServer(new McpServer(ENGINEERING_SERVER_INFO), subject, { lockPath, auditFile });
  (gated as unknown as McpServer).registerTool("engineering.release.run", { description: "probe", inputSchema: {} } as never, async () => ({ content: [{ type: "text", text: "SHOULD-NOT-RUN" }] }));
  const handlers = (gated as unknown as McpServer).server as unknown as { _getRequestHandler(method: string): (request: unknown, ctx: unknown) => Promise<unknown> };
  const call = handlers._getRequestHandler("tools/call") as (request: unknown, ctx: unknown) => Promise<unknown>;
  const result = await call({ method: "tools/call", params: { name: "engineering.release.run", arguments: {} } }, PROBE_CTX);
  assert.ok((result as { isError?: boolean }).isError);
  const text = ((result as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? "");
  assert.match(text, /SHIP_LOCK_EXPIRED/);
  assert.match(text, /rm /);
  await rm(dir, { recursive: true, force: true });
});

test("gated server: non-ship tools are never gated", async () => {
  const dir = await tempDir();
  const lockPath = path.join(dir, "ship.lock");
  const auditFile = path.join(dir, "ship-lock.jsonl");
  const lock = await acquireShipLock("engineering.git.commit", "foreign-ship", { lockPath, auditFile, holder: "someone-else" });
  const subject: AuthenticatedSubject = { subject: "probe-plain", scopes: ["engineering:read"], tokenHash16: "cccccccccccccccc" };
  const gated = shipPhaseGatedServer(new McpServer(ENGINEERING_SERVER_INFO), subject, { lockPath, auditFile });
  (gated as unknown as McpServer).registerTool("engineering.mcp.probe", { description: "plain probe", inputSchema: {} } as never, async () => ({ content: [{ type: "text", text: "PLAIN-OK" }] }));
  const handlers = (gated as unknown as McpServer).server as unknown as { _getRequestHandler(method: string): (request: unknown, ctx: unknown) => Promise<unknown> };
  const call = handlers._getRequestHandler("tools/call") as (request: unknown, ctx: unknown) => Promise<unknown>;
  const result = await call({ method: "tools/call", params: { name: "engineering.mcp.probe", arguments: {} } }, PROBE_CTX);
  assert.ok(!(result as { isError?: boolean }).isError, "a non-ship tool must not be blocked by the ship lock");
  assert.equal((await readShipLock(lockPath)).record?.holder, "someone-else", "the foreign lock is untouched");
  await releaseShipLock({ lockPath, auditFile, expectedSha16: lock.sha16 });
  await rm(dir, { recursive: true, force: true });
});

test("full MCP stack: engineering.release.run goes through the gate and proceeds, lock released after", async () => {
  const dir = await tempDir();
  const lockPath = path.join(dir, "ship.lock");
  const auditFile = path.join(dir, "ship-lock.jsonl");
  const subject: AuthenticatedSubject = { subject: "gate-stack-probe", scopes: ["engineering:read", "engineering:write"], tokenHash16: "dddddddddddddddd" };
  const gated = shipPhaseGatedServer(new McpServer(ENGINEERING_SERVER_INFO), subject, { lockPath, auditFile });
  const repository = new Proxy({}, { get: () => () => Promise.resolve({ operation: "verify", success: true }) }) as unknown as RepositoryAdapter;
  registerEngineeringTools(gated as unknown as McpServer, repository, subject, "memoryos");
  installToolAliasCompatibility((gated as unknown as McpServer).server);
  const handlers = (gated as unknown as McpServer).server as unknown as { _getRequestHandler(method: string): (request: unknown, ctx: unknown) => Promise<unknown> };
  const list = handlers._getRequestHandler("tools/list");
  const call = handlers._getRequestHandler("tools/call");
  const listed = (await list({ method: "tools/list", params: {} }, {})) as { tools: Array<{ name: string }> };
  assert.equal(listed.tools.length, 109, "the gate adds no tool to the catalog");
  const result = await call({ method: "tools/call", params: { name: "engineering.release.run", arguments: { operation: "verify" } } }, PROBE_CTX);
  assert.ok(!(result as { isError?: boolean }).isError, `gate must release after the handler: ${((result as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? "").slice(0, 400)}`);
  assert.equal((await readShipLock(lockPath)).present, false, "lock must be released after the ship tool completes");
  const events = await auditEvents(auditFile);
  assert.ok(events.some((entry) => entry.event === "acquire" && entry.tool === "engineering.release.run"));
  assert.ok(events.some((entry) => entry.event === "release"));
  await rm(dir, { recursive: true, force: true });
});

test("layer 1 / layer 2 parity: classifyShipLock matches readShipLock on the same fixtures", async () => {
  const dir = await tempDir();
  const lockPath = path.join(dir, "ship.lock");
  const now = Date.now();
  await writeFile(lockPath, `${JSON.stringify(recordFixture({ tool: "engineering.release.pipeline", pipelineArmed: true }), null, 2)}\n`);
  const activeGate = await readShipLock(lockPath, now);
  const activeRunner = await classifyShipLock(lockPath, now);
  assert.equal(activeGate.status, activeRunner.status);
  assert.equal(activeGate.present, activeRunner.present);
  assert.deepEqual(activeGate.record, activeRunner.record);
  assert.equal(activeGate.rawSha16, activeRunner.rawSha16);
  await writeFile(lockPath, `${JSON.stringify(recordFixture({ acquiredAt: new Date(now - 8_000_000).toISOString(), expiresAt: new Date(now - 1000).toISOString() }), null, 2)}\n`);
  assert.equal((await readShipLock(lockPath, now)).status, "expired");
  assert.equal((await classifyShipLock(lockPath, now)).status, "expired");
  await writeFile(lockPath, "{{{garbage");
  assert.equal((await readShipLock(lockPath, now)).status, "unreadable");
  assert.equal((await classifyShipLock(lockPath, now)).status, "unreadable");
  const absentGate = await readShipLock(path.join(dir, "missing.lock"), now);
  const absentRunner = await classifyShipLock(path.join(dir, "missing.lock"), now);
  assert.equal(absentGate.status, "absent");
  assert.equal(absentRunner.status, "absent");
  await rm(dir, { recursive: true, force: true });
});

test("layer 2: assertNoShipLock passes absent and gate-armed active locks only", async () => {
  const dir = await tempDir();
  const lockPath = path.join(dir, "ship.lock");
  assert.equal((await assertNoShipLock({ lockPath })).present, false, "no lock: the deploy may proceed");
  await writeFile(lockPath, `${JSON.stringify(recordFixture({ tool: "engineering.release.pipeline", holder: "gate-holder", pipelineArmed: true }), null, 2)}\n`);
  const armed = await assertNoShipLock({ lockPath });
  assert.equal(armed.status, "active", "the gate-chained pipeline deploy passes");
  await writeFile(lockPath, `${JSON.stringify(recordFixture({ holder: "bypass-holder" }), null, 2)}\n`);
  await assert.rejects(() => assertNoShipLock({ lockPath }), (error: Error) => {
    assert.match(error.message, /SHIP_LOCK_ACTIVE/);
    assert.match(error.message, /bypass-holder/);
    return true;
  });
  await writeFile(lockPath, `${JSON.stringify(recordFixture({ tool: "engineering.release.pipeline", acquiredAt: new Date(Date.now() - 9_000_000).toISOString(), expiresAt: new Date(Date.now() - 1000).toISOString(), pipelineArmed: true }), null, 2)}\n`);
  await assert.rejects(() => assertNoShipLock({ lockPath }), /SHIP_LOCK_EXPIRED/, "an expired lock refuses EVEN when armed (presence never grants)");
  await rm(dir, { recursive: true, force: true });
});

test("layer 2: deployAction refuses as its FIRST action when a non-armed lock is present (proof e, zero mutation by construction)", async () => {
  const dir = await tempDir();
  const lockPath = path.join(dir, "ship.lock");
  await writeFile(lockPath, `${JSON.stringify(recordFixture({ holder: "bypass-holder" }), null, 2)}\n`);
  const previous = process.env.ENG_MCP_SHIP_LOCK_FILE;
  process.env.ENG_MCP_SHIP_LOCK_FILE = lockPath;
  try {
    await assert.rejects(() => deployAction({}), (error: Error) => {
      assert.match(error.message, /SHIP_LOCK_ACTIVE/);
      assert.match(error.message, /bypass-holder/);
      return true;
    });
  } finally {
    if (previous === undefined) delete process.env.ENG_MCP_SHIP_LOCK_FILE;
    else process.env.ENG_MCP_SHIP_LOCK_FILE = previous;
    await rm(dir, { recursive: true, force: true });
  }
});