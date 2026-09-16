import { test, describe, it } from "node:test";
import assert from "node:assert/strict";
import { runVpsDoctor, VPS_DOCTOR_READ_PRIMITIVES, type VpsTransport, type VpsTransportCall } from "../src/vpsDoctor.ts";
import { guardianInputSchema, runVpsGuardian, type VpsGuardianDeps } from "../src/vpsGuardian.ts";

// SPRINT VPS-GUARDIAN-06 — SAFE EXECUTION TARGET RESOLUTION.
// Goal: prove the CHANGE_SAFE applicationId comes EXCLUSIVELY from Doctor evidence
// (deterministic single-application selection), never from the caller, and that
// ambiguity / missing evidence / upstream failure keep Guardian BLOCKED.
// All tests use FAKE transport/deps: no network, no runner, no Dokploy, zero mutation.
// (Separate file: the patch channel rejected hunks on the existing test files this sprint.)

// ---------- Doctor fakes (mirror test/vps-doctor.test.ts shapes) ----------

const BASE = 1_756_560_000_000;
const now = (): number => BASE;

type Handler = (args: Record<string, unknown>) => unknown;

function fakeTransport(options: { handlers?: Record<string, Handler>; failFor?: string[]; log: VpsTransportCall[] }): VpsTransport {
  return {
    name: "fake",
    async call(request: VpsTransportCall) {
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

const SERVER = { serverId: "srv-real", name: "MemoryOS VPS", serverStatus: "active", ipAddress: "203.0.113.10" };

const node = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ID: "node-1",
  Spec: { Role: "manager", Availability: "active" },
  Status: { State: "ready", Addr: "203.0.113.10" },
  ManagerStatus: { Leader: true, Reachability: "reachable", Addr: "203.0.113.10:2377" },
  Description: { Hostname: "srv1882271" },
  ...over,
});

const APP = { applicationId: "app-1", id: "app-1", name: "my-app", appName: "my-app", applicationStatus: "running", status: "running" };

const deployment = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "dep-1",
  applicationId: "app-1",
  status: "done",
  createdAt: new Date(BASE - 3_600_000).toISOString(),
  ...over,
});

const defaultHandlers = (): Record<string, Handler> => ({
  "server-all": () => ({ success: true, message: "server-all completed successfully", data: [SERVER] }),
  "cluster-getNodes": () => ({ success: true, message: "cluster-getNodes completed successfully", data: [node()] }),
  "application-search": () => ({ success: true, message: "ok", data: { items: [], total: 0 } }),
  "application-one": () => APP,
  "deployment-all": () => [deployment()],
  "deployment-queueList": () => [],
  "application-readLogs": () => "recent log line\n",
  "application-readAppMonitoring": () => ({ cpu: 1, memory: 2 }),
});

const runDoctor = (transport: VpsTransport, input: Record<string, unknown>): Promise<Record<string, unknown>> =>
  runVpsDoctor("vps-doctor-target-test", input, { transport, now, dokployServerId: "bridge-test" });

function assertReadOnly(log: VpsTransportCall[]): void {
  for (const call of log) {
    assert.equal(call.mutating, false, `mutating call detected: ${call.toolName}`);
    assert.ok((VPS_DOCTOR_READ_PRIMITIVES as readonly string[]).includes(call.toolName), `non-allowlisted primitive: ${call.toolName}`);
  }
}

const hasFinding = (result: Record<string, unknown>, code: string): boolean =>
  (result.findings as Array<{ code: string }>).some((f) => f.code === code);

// ---------- Guardian fakes (mirror test/vps-guardian.test.ts shapes) ----------

const doctorResult = (over: Record<string, unknown> = {}) => ({
  ok: true,
  outcome: "DIAGNOSED",
  status: "HEALTHY",
  server: { serverId: "s1", name: "srv", status: "active", nodeStatus: "ready", availability: "active", role: "manager" },
  application: null,
  deployments: { active: 0, queued: 0, lastStatus: null },
  monitoringAvailable: true,
  logsChecked: true,
  recommendedNextAction: "Nenhuma ação requerida.",
  findings: [] as unknown[],
  primitivesInvoked: ["server-all", "cluster-getNodes"],
  mode: "read-only",
  mutationPerformed: false,
  durationMs: 1,
  ...over,
});

const reconcileResult = (over: Record<string, unknown> = {}) => ({
  status: "IN_SYNC",
  expected: { toolCount: 52, catalogVersion: "eng-mcp-tools-v52" },
  actual: { container: null, catalog: { catalogHash: "h52", catalogVersion: "eng-mcp-tools-v52", toolCount: 52 } },
  findings: [] as unknown[],
  mutationPerformed: false,
  ...over,
});

const changeSafeExecutedResult = (over: Record<string, unknown> = {}) => ({
  ok: true,
  mode: "execute",
  action: "redeploy_application",
  executed: true,
  mutation: { attempted: true, occurred: true, ok: true, transport: "fake", status: 200, durationMs: 5 },
  validation: { application: { id: "app-1" }, deployment: null, monitoring: null, externalHealth: "unknown", checks: [] },
  outcome: "EXECUTED_HEALTHY",
  outcomeReason: "newest post-mutation deployment status='done' classified success",
  rollback: { available: false, performed: false },
  ...over,
});

const gfinding = (code: string, severity = "warning") => ({ code, severity, evidence: code });

const runWith = (input: unknown, over: VpsGuardianDeps = {}) => runVpsGuardian(input, over);

// ---------- Doctor: deterministic single-application target resolution ----------

test("doctor-target 01 single application WITHOUT explicit target -> deterministic resolution + finding associated", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["application-search"] = () => ({ success: true, message: "ok", data: { items: [APP], total: 1 } });
  handlers["deployment-all"] = () => ({ success: true, message: "ok", data: { items: [deployment({ status: "error", createdAt: new Date(BASE).toISOString() })], total: 1 } });
  const result = await runDoctor(fakeTransport({ handlers, log }), {});
  assert.equal(result.outcome, "DIAGNOSED");
  assert.equal(result.status, "DEGRADED");
  const application = result.application as Record<string, unknown>;
  assert.equal(application.id, "app-1"); // Doctor is the only source of the identity
  assert.ok(hasFinding(result, "DEPLOYMENT_FAILED")); // finding belongs to the diagnosed application
  assert.ok(log.some((c) => c.toolName === "application-one" && c.arguments.applicationId === "app-1"));
  assertReadOnly(log);
});

test("doctor-target 02 multiple applications without target -> application stays null, no per-app primitives", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["application-search"] = () => ({ success: true, message: "ok", data: { items: [APP, { ...APP, applicationId: "app-2", id: "app-2", name: "other-app", appName: "other-app" }], total: 2 } });
  const result = await runDoctor(fakeTransport({ handlers, log }), {});
  assert.equal(result.status, "HEALTHY");
  assert.equal(result.application, null); // never guessed among multiple applications
  assert.ok(!log.some((c) => c.toolName === "application-one"));
  assert.ok(!hasFinding(result, "DEPLOYMENT_FAILED"));
  assertReadOnly(log);
});

test("doctor-target 03 zero applications without target -> no applicationId invented", async () => {
  const log: VpsTransportCall[] = [];
  const result = await runDoctor(fakeTransport({ handlers: defaultHandlers(), log }), {});
  assert.equal(result.application, null);
  assert.ok(hasFinding(result, "NO_APPLICATIONS_MANAGED"));
  assert.deepEqual(log.map((c) => c.toolName), ["server-all", "cluster-getNodes", "application-search"]);
  assertReadOnly(log);
});

test("doctor-target 04 application-search upstream failure -> no applicationId (fail-safe)", async () => {
  const log: VpsTransportCall[] = [];
  const result = await runDoctor(fakeTransport({ handlers: defaultHandlers(), failFor: ["application-search"], log }), {});
  assert.equal(result.status, "DEGRADED");
  assert.equal(result.application, null);
  assert.ok(hasFinding(result, "UPSTREAM_ERROR"));
  assert.ok(!log.some((c) => c.toolName === "application-one"));
  assertReadOnly(log);
});

// ---------- Guardian: applicationId exclusively via Doctor evidence ----------

describe("engineering.vps.guardian (target resolution via Doctor evidence)", () => {
  it("guardian-target 01 CHANGE_SAFE forwards ONLY the Doctor-evidence applicationId to change.safe", async () => {
    const changeSafeInputs: unknown[] = [];
    const result = await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: async () => doctorResult({ status: "DEGRADED", findings: [gfinding("DEPLOYMENT_FAILED")], application: { id: "app-1", name: "my-app", status: "running" } }),
      runReconcile: async () => reconcileResult(),
      runChangeSafe: async (input) => { changeSafeInputs.push(input); return changeSafeExecutedResult(); },
    });
    const execution = (result as Record<string, unknown>).execution as Record<string, unknown>;
    assert.equal(result.recommendedAction, "CHANGE_SAFE");
    assert.equal(changeSafeInputs.length, 1);
    assert.deepEqual(changeSafeInputs[0], { action: "redeploy_application", target: { applicationId: "app-1" }, execute: true, approval: { approved: true } });
    assert.equal(execution.status, "PERFORMED");
    assert.equal(result.mutationPerformed, true);
  });

  it("guardian-target 02 schema keeps rejecting caller-supplied applicationId/target/action", () => {
    assert.throws(() => guardianInputSchema.parse({ applicationId: "app-1" }));
    assert.throws(() => guardianInputSchema.parse({ target: { applicationId: "app-1" } }));
    assert.throws(() => guardianInputSchema.parse({ action: "redeploy_application" }));
    assert.throws(() => guardianInputSchema.parse({ applicationId: "app-1", execute: true }));
  });

  it("guardian-target 03 CHANGE_SAFE recommendation with execute=false -> read-only, change.safe never called", async () => {
    let changeSafeCalls = 0;
    const result = await runWith({ execute: false }, {
      runDoctor: async () => doctorResult({ status: "DEGRADED", findings: [gfinding("DEPLOYMENT_FAILED")], application: { id: "app-1", name: "my-app", status: "running" } }),
      runReconcile: async () => reconcileResult(),
      runChangeSafe: async () => { changeSafeCalls += 1; return changeSafeExecutedResult(); },
    });
    assert.equal(result.recommendedAction, "CHANGE_SAFE");
    assert.equal((result as Record<string, unknown>).mode, "read-only");
    assert.equal(result.mutationPerformed, false);
    assert.equal(changeSafeCalls, 0);
    assert.equal("execution" in (result as object), false);
    assert.equal("validation" in (result as object), false);
  });

  it("guardian-target 04 recommendation CHANGE_SAFE but no reliable applicationId -> BLOCKED, zero change.safe calls", async () => {
    let changeSafeCalls = 0;
    const result = await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: async () => doctorResult({ status: "DEGRADED", findings: [gfinding("DEPLOYMENT_FAILED")], application: null }),
      runReconcile: async () => reconcileResult(),
      runChangeSafe: async () => { changeSafeCalls += 1; return changeSafeExecutedResult(); },
    });
    const execution = (result as Record<string, unknown>).execution as Record<string, unknown>;
    assert.equal(result.recommendedAction, "CHANGE_SAFE");
    assert.equal(execution.status, "BLOCKED");
    assert.match(String(execution.reason), /applicationId/);
    assert.equal(changeSafeCalls, 0);
    assert.equal(result.mutationPerformed, false);
    assert.equal("validation" in (result as object), false);
  });
});
