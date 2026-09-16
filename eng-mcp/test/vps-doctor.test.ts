import { test } from "node:test";
import assert from "node:assert/strict";
import { runVpsDoctor, VPS_DOCTOR_READ_PRIMITIVES, type VpsTransport, type VpsTransportCall, type VpsTransportResponse } from "../src/vpsDoctor.ts";

// SPRINT VPS-DOCTOR-01 — engineering.vps.doctor (READ-ONLY MVP).
// All tests use a FAKE transport: no network, no LLM, no SSH/shell, no real Dokploy
// calls, zero mutation. Fake values are obviously synthetic.

const BASE = 1_756_560_000_000;
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

const run = (transport: VpsTransport, input: Record<string, unknown>): Promise<Record<string, unknown>> =>
  runVpsDoctor("vps-doctor-test", input, { transport, now, dokployServerId: "bridge-test" });

function assertReadOnly(log: VpsTransportCall[]): void {
  for (const call of log) {
    assert.equal(call.mutating, false, `mutating call detected: ${call.toolName}`);
    assert.ok((VPS_DOCTOR_READ_PRIMITIVES as readonly string[]).includes(call.toolName), `non-allowlisted primitive: ${call.toolName}`);
  }
}

const hasFinding = (result: Record<string, unknown>, code: string): boolean =>
  (result.findings as Array<{ code: string }>).some((f) => f.code === code);

test("01 single healthy server, zero applications -> HEALTHY + NO_APPLICATIONS_MANAGED", async () => {
  const log: VpsTransportCall[] = [];
  const result = await run(fakeTransport({ handlers: defaultHandlers(), log }), {});
  assert.equal(result.ok, true);
  assert.equal(result.status, "HEALTHY");
  assert.equal(result.outcome, "DIAGNOSED");
  assert.ok(hasFinding(result, "NO_APPLICATIONS_MANAGED"));
  const server = result.server as Record<string, unknown>;
  assert.equal(server.serverId, "srv-real");
  assert.equal(server.nodeStatus, "ready");
  assert.equal(server.availability, "active");
  assert.equal(server.role, "manager");
  assert.equal(result.mutationPerformed, false);
  assert.equal(result.monitoringAvailable, false);
  assert.equal(result.logsChecked, false);
  assert.deepEqual(log.map((c) => c.toolName), ["server-all", "cluster-getNodes", "application-search"]);
  assertReadOnly(log);
});

test("02 node not ready -> CRITICAL", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["cluster-getNodes"] = () => ({ success: true, message: "ok", data: [node({ Status: { State: "down", Addr: "203.0.113.10" } })] });
  const result = await run(fakeTransport({ handlers, log }), { serverId: "srv-real" });
  assert.equal(result.status, "CRITICAL");
  assert.ok(hasFinding(result, "NODE_NOT_READY"));
  assertReadOnly(log);
});

test("03 manager unreachable -> CRITICAL", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["cluster-getNodes"] = () => ({ success: true, message: "ok", data: [node({ ManagerStatus: { Leader: true, Reachability: "unreachable", Addr: "203.0.113.10:2377" } })] });
  const result = await run(fakeTransport({ handlers, log }), { serverId: "srv-real" });
  assert.equal(result.status, "CRITICAL");
  assert.ok(hasFinding(result, "MANAGER_UNREACHABLE"));
  assertReadOnly(log);
});

test("04 zero applications is NOT a VPS failure -> server stays HEALTHY", async () => {
  const log: VpsTransportCall[] = [];
  const result = await run(fakeTransport({ handlers: defaultHandlers(), log }), { serverId: "srv-real" });
  assert.equal(result.ok, true);
  assert.equal(result.status, "HEALTHY");
  assert.ok(hasFinding(result, "NO_APPLICATIONS_MANAGED"));
  assertReadOnly(log);
});

test("05 resolved healthy application -> HEALTHY with app/monitoring/logs evidence", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["application-search"] = () => ({ success: true, message: "ok", data: { items: [APP], total: 1 } });
  const result = await run(fakeTransport({ handlers, log }), { applicationId: "app-1" });
  assert.equal(result.status, "HEALTHY");
  const application = result.application as Record<string, unknown>;
  assert.equal(application.id, "app-1");
  assert.equal(application.status, "running");
  assert.equal(result.monitoringAvailable, true);
  assert.equal(result.logsChecked, true);
  const deployments = result.deployments as Record<string, unknown>;
  assert.equal(deployments.queued, 0);
  assert.equal(deployments.lastStatus, "success");
  assertReadOnly(log);
});

test("06 in-flight deployment -> DEGRADED + DEPLOYMENT_IN_FLIGHT", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["application-search"] = () => ({ success: true, message: "ok", data: { items: [APP], total: 1 } });
  handlers["deployment-all"] = () => ({ success: true, message: "ok", data: { items: [deployment({ status: "running", createdAt: new Date(BASE).toISOString() })], total: 1 } });
  const result = await run(fakeTransport({ handlers, log }), { applicationId: "app-1" });
  assert.equal(result.status, "DEGRADED");
  assert.ok(hasFinding(result, "DEPLOYMENT_IN_FLIGHT"));
  assert.equal((result.deployments as Record<string, unknown>).active, 1);
  assertReadOnly(log);
});

test("07 pending queue -> DEGRADED + QUEUE_PENDING", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["application-search"] = () => ({ success: true, message: "ok", data: { items: [APP], total: 1 } });
  handlers["deployment-queueList"] = () => ({ success: true, message: "ok", data: { items: [{ applicationId: "app-1", id: "q-1" }], total: 1 } });
  const result = await run(fakeTransport({ handlers, log }), { applicationId: "app-1" });
  assert.equal(result.status, "DEGRADED");
  assert.ok(hasFinding(result, "QUEUE_PENDING"));
  assert.equal((result.deployments as Record<string, unknown>).queued, 1);
  assertReadOnly(log);
});

test("08 server-all upstream failure -> UNKNOWN + UPSTREAM_ERROR, no further primitives", async () => {
  const log: VpsTransportCall[] = [];
  const result = await run(fakeTransport({ handlers: defaultHandlers(), failFor: ["server-all"], log }), {});
  assert.equal(result.ok, false);
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.outcome, "UPSTREAM_ERROR");
  assert.ok(hasFinding(result, "UPSTREAM_ERROR"));
  assert.deepEqual(log.map((c) => c.toolName), ["server-all"]);
  assertReadOnly(log);
});

test("09 cluster-getNodes upstream failure -> UNKNOWN, only essential primitives called", async () => {
  const log: VpsTransportCall[] = [];
  const result = await run(fakeTransport({ handlers: defaultHandlers(), failFor: ["cluster-getNodes"], log }), { serverId: "srv-real" });
  assert.equal(result.ok, false);
  assert.equal(result.status, "UNKNOWN");
  assert.deepEqual(log.map((c) => c.toolName), ["server-all", "cluster-getNodes"]);
  assertReadOnly(log);
});

test("10 no mutating primitive is ever reachable (closed read allowlist)", async () => {
  const log: VpsTransportCall[] = [];
  await run(fakeTransport({ handlers: defaultHandlers(), log }), {});
  const handlers = defaultHandlers();
  handlers["application-search"] = () => ({ success: true, message: "ok", data: { items: [APP], total: 1 } });
  await run(fakeTransport({ handlers, log }), { applicationName: "my-app" });
  assert.equal(log.filter((c) => c.mutating).length, 0);
  assertReadOnly(log);
});

test("11 mutation-control keys are rejected before any primitive runs", async () => {
  const log: VpsTransportCall[] = [];
  const result = await run(fakeTransport({ handlers: defaultHandlers(), log }), { execute: true });
  assert.equal(result.ok, false);
  assert.equal((result.blocked as Record<string, unknown>).reason, "MUTATION_CONTROL_KEYS_REJECTED");
  assert.equal(log.length, 0);
  assert.equal(result.mutationPerformed, false);
});

test("12 multiple servers without serverId -> TARGET_AMBIGUOUS, never silently picked", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["server-all"] = () => ({ success: true, message: "ok", data: [SERVER, { ...SERVER, serverId: "srv-2", name: "Other VPS" }] });
  const result = await run(fakeTransport({ handlers, log }), {});
  assert.equal(result.ok, false);
  assert.equal(result.outcome, "TARGET_AMBIGUOUS");
  assert.equal(result.status, "UNKNOWN");
  assert.equal((result.candidates as unknown[]).length, 2);
  assert.deepEqual(log.map((c) => c.toolName), ["server-all"]);
  assertReadOnly(log);
});

test("13 invalid items payload -> UPSTREAM_ERROR warning (fail-safe, never invented list)", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["application-search"] = () => ({ success: true, message: "ok", data: { items: "invalid", total: 1 } });
  const result = await run(fakeTransport({ handlers, log }), {});
  assert.equal(result.ok, true);
  assert.equal(result.status, "DEGRADED");
  assert.equal(result.outcome, "DIAGNOSED");
  assert.ok(hasFinding(result, "UPSTREAM_ERROR"));
  assertReadOnly(log);
});

test("14 real mcp_execute contract data:{items:[APP],total:1} -> HEALTHY, app discovered", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  handlers["application-search"] = () => ({ success: true, message: "application-search completed successfully", data: { items: [APP], total: 1 } });
  const result = await run(fakeTransport({ handlers, log }), { applicationName: "my-app" });
  assert.equal(result.ok, true);
  assert.equal(result.status, "HEALTHY");
  assert.equal((result.application as Record<string, unknown>).id, "app-1");
  assert.equal(result.mutationPerformed, false);
  assertReadOnly(log);
});
