import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runVpsChangeSafe,
  normalizeMcpResult,
  MUTATION_ALLOWLIST,
  READ_PRIMITIVES,
  type VpsTransport,
  type VpsTransportCall,
  type VpsTransportResponse,
} from "../src/vpsChangeSafe.ts";
import { type DomainAdapter, type GuardianCoreModule, type GuardianResult } from "../src/guardianVpsAdapter.ts";

// SPRINT VPS-SUPERTOOLS-01 — engineering.vps.change.safe (MVP, action=redeploy_application).
// All 13 required behaviors are covered with a FAKE transport: no network, no LLM,
// no SSH/shell, no production access, no real Dokploy calls. Fake record values are
// obviously synthetic ("fake-*-value") and must never appear in any result output.

const BASE = 1_756_560_000_000; // fixed epoch ms -> deterministic clock
const now = (): number => BASE;

type Handler = (args: Record<string, unknown>) => unknown;

function fakeTransport(options: { handlers?: Record<string, Handler>; failFor?: string[]; log: VpsTransportCall[] }): VpsTransport {
  return {
    name: "fake",
    async call(request: VpsTransportCall): Promise<VpsTransportResponse> {
      options.log.push(request);
      if (options.failFor?.includes(request.toolName)) {
        return { ok: false, status: 502, error: `FAKE_UPSTREAM_FAILURE:${request.toolName}`, durationMs: 1 };
      }
      const handler = options.handlers?.[request.toolName];
      if (!handler) return { ok: false, status: 0, error: `FAKE_NO_HANDLER:${request.toolName}`, durationMs: 1 };
      return { ok: true, status: 200, result: handler(request.arguments), durationMs: 1 };
    },
  };
}

const APP: Record<string, unknown> = {
  id: "app-1",
  applicationId: "app-1",
  name: "my-app",
  appName: "my-app",
  applicationStatus: "running",
  status: "running",
  // deliberately sensitive-looking keys with synthetic values: must NEVER reach any output
  env: { SECRET_VALUE: "fake-env-value" },
  userPassword: "fake-password-value",
  token: "fake-token-value",
  apiKey: "fake-api-key-value",
};

const deployment = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "dep-1",
  applicationId: "app-1",
  status: "done",
  createdAt: new Date(BASE - 3_600_000).toISOString(),
  ...over,
});

const defaultHandlers = (): Record<string, Handler> => ({
  "application-one": () => APP,
  "application-search": () => [],
  "deployment-all": () => [deployment()],
  "deployment-queueList": () => [],
  "application-readLogs": () => "building step 1\nbuilding step 2\n",
  "application-readAppMonitoring": () => ({ cpu: 1, memory: 2 }),
});

const healthyPostHandlers = (): Record<string, Handler> => {
  const handlers = defaultHandlers();
  handlers["application-redeploy"] = () => ({ deploymentId: "dep-new-42", message: "redeploy queued" });
  handlers["deployment-all"] = () => [deployment(), deployment({ id: "dep-new", status: "done", createdAt: new Date(BASE + 5_000).toISOString() })];
  return handlers;
};

// DG01R: the governed mutation path is exercised through a faithful mirror of
// the frozen Guardian Core's orchestration (bind -> gate -> apply), injected at
// the operator/test seam (same trust boundary as the transport fake). The real
// Core module is probed in vps-change-safe-guardian.test.ts and proven by its
// own frozen suite; the Core package is never re-implemented here.
const mirrorGuardianCore: GuardianCoreModule = {
  async executeGuardianIntent<I, B>(intent: I, adapter: DomainAdapter<I, B>): Promise<GuardianResult> {
    const bound = await adapter.bind(intent);
    if ("status" in bound) return adapter.apply(bound.proposal);
    return bound;
  },
};

const run = (transport: VpsTransport, input: Record<string, unknown>): Promise<Record<string, unknown>> =>
  runVpsChangeSafe("vps-change-safe-test", input, { transport, now, dokployServerId: "srv-test", guardianCore: mirrorGuardianCore });

const mutatingCalls = (log: VpsTransportCall[]): VpsTransportCall[] => log.filter((call) => call.mutating);

test("01 execute omitted -> PLAN only, no mutation", async () => {
  const log: VpsTransportCall[] = [];
  const result = await run(fakeTransport({ handlers: defaultHandlers(), log }), { action: "redeploy_application", target: { applicationId: "app-1" } });
  assert.equal(result.outcome, "PLANNED");
  assert.equal(result.ok, true);
  assert.equal(result.executed, false);
  assert.equal(result.mode, "plan");
  assert.equal(result.risk, "medium");
  assert.equal(result.approvalRequired, true);
  assert.deepEqual(result.rollback, { available: false, performed: false });
  assert.equal(mutatingCalls(log).length, 0);
  assert.ok((result.before as Record<string, unknown>).application !== null);
});

test("02 execute=false -> no mutation, plan returned", async () => {
  const log: VpsTransportCall[] = [];
  const result = await run(fakeTransport({ handlers: defaultHandlers(), log }), { action: "redeploy_application", target: { applicationId: "app-1" }, execute: false });
  assert.equal(result.outcome, "PLANNED");
  assert.equal(result.executed, false);
  assert.equal((result.approvalGate as Record<string, unknown>).satisfied, false);
  assert.equal((result.before as Record<string, unknown>).application !== null, true);
  assert.equal(mutatingCalls(log).length, 0);
});

test("03 execute=true without approval -> no mutation", async () => {
  for (const approval of [undefined, { approved: false }]) {
    const log: VpsTransportCall[] = [];
    const input: Record<string, unknown> = { action: "redeploy_application", target: { applicationId: "app-1" }, execute: true };
    if (approval) input.approval = approval;
    const result = await run(fakeTransport({ handlers: defaultHandlers(), log }), input);
    assert.equal(result.outcome, "PLANNED");
    assert.equal(result.executed, false);
    assert.equal((result.approvalGate as Record<string, unknown>).satisfied, false);
    assert.equal(mutatingCalls(log).length, 0);
  }
});

test("04 execute=true + approved=true -> application-redeploy executed once with real args", async () => {
  const log: VpsTransportCall[] = [];
  const result = await run(fakeTransport({ handlers: healthyPostHandlers(), log }), { action: "redeploy_application", target: { applicationId: "app-1" }, execute: true, approval: { approved: true } });
  assert.equal(result.executed, true);
  assert.equal(result.mode, "execute");
  assert.equal(result.outcome, "EXECUTED_HEALTHY");
  assert.equal(result.primitive, "application-redeploy");
  const mutations = mutatingCalls(log);
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].toolName, "application-redeploy");
  assert.deepEqual(mutations[0].arguments, { applicationId: "app-1" });
  assert.deepEqual(mutations[0].confirmation, { toolName: "application-redeploy" });
  assert.equal((result.validation as Record<string, unknown>).deployment !== null, true);
  assert.equal(((result.validation as Record<string, unknown>).deployment as Record<string, unknown>).status, "done");
});

test("05 application not found -> TARGET_NOT_FOUND, no mutation", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["application-search"] = () => [];
  const result = await run(fakeTransport({ handlers, log }), { action: "redeploy_application", target: { applicationName: "ghost-app" } });
  assert.equal(result.outcome, "TARGET_NOT_FOUND");
  assert.equal(result.ok, false);
  assert.equal(result.executed, false);
  assert.equal(mutatingCalls(log).length, 0);
});

test("06 ambiguous target -> AMBIGUOUS_TARGET with candidates, never silently picked", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["application-search"] = () => [
    { id: "app-a", name: "dup-app", appName: "dup-app" },
    { id: "app-b", name: "dup-app", appName: "dup-app" },
  ];
  const result = await run(fakeTransport({ handlers, log }), { action: "redeploy_application", target: { applicationName: "dup-app" } });
  assert.equal(result.outcome, "AMBIGUOUS_TARGET");
  assert.equal(result.ok, false);
  assert.equal(result.executed, false);
  const candidates = result.candidates as Array<Record<string, unknown>>;
  assert.equal(candidates.length, 2);
  assert.ok(candidates.some((candidate) => candidate.applicationId === "app-a"));
  assert.ok(candidates.some((candidate) => candidate.applicationId === "app-b"));
  assert.equal(mutatingCalls(log).length, 0);
});

test("07 pre-check conflict (in-flight deployment) -> CHANGE_BLOCKED, no mutation", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["deployment-all"] = () => [
    deployment({ id: "dep-old", status: "done", createdAt: new Date(BASE - 7_200_000).toISOString() }),
    deployment({ id: "dep-live", status: "building", createdAt: new Date(BASE - 60_000).toISOString() }),
  ];
  const result = await run(fakeTransport({ handlers, log }), { action: "redeploy_application", target: { applicationId: "app-1" }, execute: true, approval: { approved: true } });
  assert.equal(result.outcome, "CHANGE_BLOCKED");
  assert.equal(result.ok, false);
  assert.equal(result.executed, false);
  assert.equal((result.blocked as Record<string, unknown>).reason, "CONFLICTING_DEPLOYMENT_IN_FLIGHT");
  assert.equal(mutatingCalls(log).length, 0);
});

test("08 upstream read failure during pre-check -> mutation blocked (UPSTREAM_ERROR)", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  delete handlers["deployment-all"]; // fake transport fails without a handler
  const result = await run(fakeTransport({ handlers, log }), { action: "redeploy_application", target: { applicationId: "app-1" }, execute: true, approval: { approved: true } });
  assert.equal(result.outcome, "UPSTREAM_ERROR");
  assert.equal(result.ok, false);
  assert.equal(result.executed, false);
  assert.equal((result.upstream as Record<string, unknown>).primitive, "deployment-all");
  assert.equal(mutatingCalls(log).length, 0);
});

test("09 redeploy primitive fails -> UPSTREAM_ERROR, executed=false, no retry", async () => {
  const log: VpsTransportCall[] = [];
  const result = await run(fakeTransport({ handlers: defaultHandlers(), failFor: ["application-redeploy"], log }), { action: "redeploy_application", target: { applicationId: "app-1" }, execute: true, approval: { approved: true } });
  assert.equal(result.outcome, "UPSTREAM_ERROR");
  assert.equal(result.ok, false);
  assert.equal(result.executed, false);
  const mutation = result.mutation as Record<string, unknown>;
  assert.equal(mutation.attempted, true);
  assert.equal(mutation.occurred, false);
  assert.equal(mutatingCalls(log).length, 1); // exactly one attempt, never retried
});

test("10 redeploy 200 but post-check fails -> EXECUTED_FAILED, no further mutations", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["application-redeploy"] = () => ({ deploymentId: "dep-new-42", message: "redeploy queued" });
  handlers["deployment-all"] = () => [deployment({ id: "dep-new", status: "error", createdAt: new Date(BASE + 5_000).toISOString() })];
  const result = await run(fakeTransport({ handlers, log }), { action: "redeploy_application", target: { applicationId: "app-1" }, execute: true, approval: { approved: true } });
  assert.equal(result.outcome, "EXECUTED_FAILED");
  assert.equal(result.ok, false);
  assert.equal(result.executed, true);
  assert.equal(mutatingCalls(log).length, 1); // post-check failure never triggers more mutations
});

test("11 post-check healthy -> EXECUTED_HEALTHY with validation evidence; externalHealth stays unknown", async () => {
  const log: VpsTransportCall[] = [];
  const result = await run(fakeTransport({ handlers: healthyPostHandlers(), log }), { action: "redeploy_application", target: { applicationId: "app-1" }, execute: true, approval: { approved: true }, validation: { externalHealth: true } });
  assert.equal(result.outcome, "EXECUTED_HEALTHY");
  assert.equal(result.ok, true);
  assert.deepEqual(result.rollback, { available: false, performed: false });
  const validation = result.validation as Record<string, unknown>;
  assert.equal(validation.externalHealth, "unknown"); // never fabricated
  const checks = validation.checks as Array<Record<string, unknown>>;
  assert.ok(checks.some((check) => check.check === "external-health" && check.result === "unknown"));
  assert.ok((result.primitivesInvoked as string[]).includes("application-redeploy"));
});

test("12 no non-allowlisted primitive is executable", async () => {
  assert.deepEqual(Object.keys(MUTATION_ALLOWLIST), ["redeploy_application"]);
  assert.equal(MUTATION_ALLOWLIST.redeploy_application.primitive, "application-redeploy");
  // unknown action is rejected before ANY transport call
  const rejectedLog: VpsTransportCall[] = [];
  const rejected = await run(fakeTransport({ handlers: defaultHandlers(), log: rejectedLog }), { action: "stop_application", target: { applicationId: "app-1" }, execute: true, approval: { approved: true } });
  assert.equal(rejected.outcome, "CHANGE_BLOCKED");
  assert.equal((rejected.blocked as Record<string, unknown>).reason, "ACTION_NOT_ALLOWLISTED");
  assert.equal(rejectedLog.length, 0);
  // across an executed flow, only allowlisted/read primitives were ever invoked
  const log: VpsTransportCall[] = [];
  await run(fakeTransport({ handlers: healthyPostHandlers(), log }), { action: "redeploy_application", target: { applicationId: "app-1" }, execute: true, approval: { approved: true } });
  const allowed = new Set<string>([...READ_PRIMITIVES, "application-redeploy"]);
  for (const call of log) assert.ok(allowed.has(call.toolName), `unexpected primitive: ${call.toolName}`);
  const mutations = mutatingCalls(log);
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].toolName, "application-redeploy");
});

test("13 no secrets or env values in output", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = healthyPostHandlers();
  handlers["deployment-all"] = () => [deployment({ id: "dep-new", status: "done", createdAt: new Date(BASE + 5_000).toISOString(), secret: "fake-secret-value", env: { TOKEN: "fake-env-value" } })];
  const result = await run(fakeTransport({ handlers, log }), { action: "redeploy_application", target: { applicationId: "app-1" }, execute: true, approval: { approved: true } });
  const serialized = JSON.stringify(result) ?? "";
  for (const forbidden of ["fake-env-value", "fake-password-value", "fake-token-value", "fake-api-key-value", "fake-secret-value"]) {
    assert.ok(!serialized.includes(forbidden), `leaked value: ${forbidden}`);
  }
  assert.equal(/"env":/.test(serialized), false);
  assert.equal(/"userPassword":/.test(serialized), false);
  assert.equal(/"token":/.test(serialized), false);
  assert.equal(/"apiKey":/.test(serialized), false);
});

// SPRINT VPS-SUPERTOOLS-01D — MCP envelope normalization (mcp_execute returns raw callTool envelopes).
// Tests 14-17 prove deterministic unwrapping BEFORE the extractors; 18 proves the fail-safe path.

test("14 MCP envelope with structuredContent -> normalized for extractors", async () => {
  assert.deepEqual(normalizeMcpResult({ structuredContent: { applications: ["x"] }, content: [{ type: "text", text: "ignored" }] }), { applications: ["x"] });
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["application-one"] = () => ({ structuredContent: APP });
  const result = await run(fakeTransport({ handlers, log }), { action: "redeploy_application", target: { applicationId: "app-1" } });
  assert.equal(result.outcome, "PLANNED");
  assert.equal(result.executed, false);
  assert.equal(mutatingCalls(log).length, 0);
});

test("15 MCP envelope with content[0].text JSON object -> parsed, no invented fields", async () => {
  assert.deepEqual(normalizeMcpResult({ content: [{ type: "text", text: JSON.stringify({ applications: [APP] }) }] }), { applications: [APP] });
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["application-one"] = () => ({ content: [{ type: "text", text: JSON.stringify(APP) }] });
  const result = await run(fakeTransport({ handlers, log }), { action: "redeploy_application", target: { applicationId: "app-1" } });
  assert.equal(result.outcome, "PLANNED");
  assert.equal(result.executed, false);
  assert.equal(mutatingCalls(log).length, 0);
});

test("16 MCP envelope with content[0].text JSON array -> parsed", async () => {
  assert.deepEqual(normalizeMcpResult({ content: [{ type: "text", text: JSON.stringify([APP]) }] }), [APP]);
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["application-search"] = () => ({ content: [{ type: "text", text: JSON.stringify([APP]) }] });
  const result = await run(fakeTransport({ handlers, log }), { action: "redeploy_application", target: { applicationName: "my-app" } });
  assert.equal(result.outcome, "PLANNED");
  assert.equal(result.executed, false);
  assert.equal(mutatingCalls(log).length, 0);
});

test("17 MCP envelope with plain text (log) -> preserved as text payload, no invented parse", async () => {
  const envelope = { content: [{ type: "text", text: "building step 1\nbuilding step 2\n" }] };
  assert.deepEqual(normalizeMcpResult(envelope), { text: "building step 1\nbuilding step 2\n" });
  assert.deepEqual(normalizeMcpResult("legacy plain string"), "legacy plain string");
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["application-search"] = () => envelope;
  const result = await run(fakeTransport({ handlers, log }), { action: "redeploy_application", target: { applicationName: "my-app" } });
  assert.equal(result.outcome, "UPSTREAM_ERROR");
  assert.equal((result.upstream as Record<string, unknown>).error, "application-search returned an unexpected shape");
  assert.equal(mutatingCalls(log).length, 0);
});

test("18 malformed/ambiguous MCP envelope -> unchanged raw envelope, fail-safe UPSTREAM_ERROR", async () => {
  const raw = { content: [{ type: "text", text: "{\"a\":1}" }, { type: "text", text: "{\"b\":2}" }, { type: "text", text: "note" }] };
  assert.deepEqual(normalizeMcpResult(raw), raw);
  assert.deepEqual(normalizeMcpResult({ content: [{ type: "text", text: "{not json" }] }), { text: "{not json" });
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["application-search"] = () => raw;
  const result = await run(fakeTransport({ handlers, log }), { action: "redeploy_application", target: { applicationName: "my-app" } });
  assert.equal(result.outcome, "UPSTREAM_ERROR");
  assert.equal((result.upstream as Record<string, unknown>).error, "application-search returned an unexpected shape");
  assert.equal(result.executed, false);
  assert.equal(mutatingCalls(log).length, 0);
});

// SPRINT VPS-SUPERTOOLS-01F — real UMG/Dokploy search contract observed live:
// { success: boolean, message: string, data: { items: Application[], total: number } }.

const REAL_CONTRACT_APP: Record<string, unknown> = {
  id: "app-real-1",
  applicationId: "app-real-1",
  name: "real-app",
  appName: "real-app",
  applicationStatus: "running",
};

test("19 UMG/Dokploy wrapper {success,data:{items,total}} -> resolves, PLANNED, no mutation", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["application-search"] = () => ({ success: true, message: "ok", data: { items: [REAL_CONTRACT_APP], total: 1 } });
  const result = await run(fakeTransport({ handlers, log }), { action: "redeploy_application", target: { applicationName: "real-app" } });
  assert.equal(result.outcome, "PLANNED");
  assert.equal(result.executed, false);
  assert.equal(mutatingCalls(log).length, 0);
});

test("20 UMG wrapper VALID_EMPTY (items:[], total:0) -> TARGET_NOT_FOUND, never UPSTREAM_ERROR", async () => {
  const handlers = defaultHandlers();
  handlers["application-search"] = () => ({ success: true, message: "ok", data: { items: [], total: 0 } });
  const result = await run(fakeTransport({ handlers, log: [] }), { action: "redeploy_application", target: { applicationName: "ghost-app" } });
  assert.equal(result.outcome, "TARGET_NOT_FOUND");
  assert.equal(result.ok, false);
  assert.equal(result.executed, false);
});

test("21 success=false with items -> fail-safe, never treated as a valid list", async () => {
  const handlers = defaultHandlers();
  handlers["application-search"] = () => ({ success: false, message: "boom", data: { items: [REAL_CONTRACT_APP] } });
  const result = await run(fakeTransport({ handlers, log: [] }), { action: "redeploy_application", target: { applicationName: "real-app" } });
  assert.equal(result.outcome, "UPSTREAM_ERROR");
  assert.equal(result.ok, false);
  assert.equal(result.executed, false);
});

test("22 non-array data.items -> fail-safe, never guessed", async () => {
  const handlers = defaultHandlers();
  handlers["application-search"] = () => ({ success: true, data: { items: "invalid", total: 1 } });
  const result = await run(fakeTransport({ handlers, log: [] }), { action: "redeploy_application", target: { applicationName: "real-app" } });
  assert.equal(result.outcome, "UPSTREAM_ERROR");
  assert.equal(result.executed, false);
});

test("23 legacy bare Application[] wrapper still works", async () => {
  const handlers = defaultHandlers();
  handlers["application-search"] = () => [REAL_CONTRACT_APP];
  const result = await run(fakeTransport({ handlers, log: [] }), { action: "redeploy_application", target: { applicationName: "real-app" } });
  assert.equal(result.outcome, "PLANNED");
  assert.equal(result.executed, false);
});

test("24 legacy {applications:[...]} wrapper still works", async () => {
  const handlers = defaultHandlers();
  handlers["application-search"] = () => ({ applications: [REAL_CONTRACT_APP] });
  const result = await run(fakeTransport({ handlers, log: [] }), { action: "redeploy_application", target: { applicationName: "real-app" } });
  assert.equal(result.outcome, "PLANNED");
  assert.equal(result.executed, false);
});
