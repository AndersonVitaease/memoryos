import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runVpsHealth, runVpsWhyDown, runDeployStatus, runVpsCapacity, runVpsWhatChanged, runAppHealth, runVpsIncidentSummary, runDeployReady, runDockerHealth, runLogsExplain } from "../src/simpleTools.ts";

// SPRINT SIMPLE-TOOLS-01 — engineering.vps.health / engineering.vps.why_down / engineering.deploy.status.
// All tests inject a FAKE runDoctor whose shape mirrors the live runVpsDoctor contract:
// no network, no LLM, no SSH/shell, no real Dokploy calls, zero mutation.
// Fake values are obviously synthetic.

const BASE = 1_756_560_000_000;
const ISO = new Date(BASE).toISOString();
const now = (): number => BASE;

const finding = (code: string, severity: string, evidence: string): Record<string, unknown> => ({ code, severity, evidence });

const APP = { id: "app-1", name: "my-app", status: "running" };

function doctorResult(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ok: true,
    outcome: "DIAGNOSED",
    status: "HEALTHY",
    findings: [],
    server: { serverId: "srv-real", name: "MemoryOS VPS", status: "active", nodeStatus: "ready", availability: "active", role: "manager" },
    application: null,
    deployments: { active: 0, queued: 0, lastStatus: null },
    monitoringAvailable: false,
    logsChecked: false,
    mode: "read-only",
    mutationPerformed: false,
    primitivesInvoked: ["server-all", "cluster-getNodes", "application-search"],
    durationMs: 12,
    recommendedNextAction: "Nenhuma ação requerida.",
    ...over,
  };
}

function deps(log: string[], doctor: Record<string, unknown>) {
  return {
    runDoctor: async (subject: string): Promise<Record<string, unknown>> => {
      log.push(subject);
      return doctor;
    },
    now,
  };
}

const source = (): string => readFileSync(new URL("../src/simpleTools.ts", import.meta.url), "utf8");
const findingsOf = (result: Record<string, unknown>): Array<Record<string, unknown>> => result.findings as Array<Record<string, unknown>>;
const hasFinding = (result: Record<string, unknown>, code: string): boolean => findingsOf(result).some((f) => f.code === code);

// ---- engineering.vps.health (tests 01-05) ----

test("01 vps.health: Doctor HEALTHY -> healthy=true", async () => {
  const log: string[] = [];
  const result = await runVpsHealth("engineering.vps.health", {}, deps(log, doctorResult()));
  assert.equal(result.status, "HEALTHY");
  assert.equal(result.healthy, true);
  assert.equal(result.checkedAt, ISO);
  assert.deepEqual(log, ["engineering.vps.health"]);
  assert.deepEqual(findingsOf(result), []);
});

test("02 vps.health: Doctor DEGRADED -> healthy=false", async () => {
  const doctor = doctorResult({
    status: "DEGRADED",
    findings: [finding("DEPLOYMENT_FAILED", "warning", "deployment dep-1 status='error'")],
  });
  const result = await runVpsHealth("t", {}, deps([], doctor));
  assert.equal(result.status, "DEGRADED");
  assert.equal(result.healthy, false);
  assert.ok(hasFinding(result, "DEPLOYMENT_FAILED"));
});

test("03 vps.health: Doctor CRITICAL -> healthy=false", async () => {
  const doctor = doctorResult({
    status: "CRITICAL",
    findings: [finding("NODE_NOT_READY", "critical", "node node-1 state='down'")],
  });
  const result = await runVpsHealth("t", {}, deps([], doctor));
  assert.equal(result.status, "CRITICAL");
  assert.equal(result.healthy, false);
  assert.ok(hasFinding(result, "NODE_NOT_READY"));
});

test("04 vps.health: Doctor UNKNOWN -> healthy=null (never invents health)", async () => {
  const doctor = doctorResult({
    ok: false,
    outcome: "UPSTREAM_ERROR",
    status: "UNKNOWN",
    findings: [finding("UPSTREAM_ERROR", "critical", "server-all failed (status 502)")],
  });
  const result = await runVpsHealth("t", {}, deps([], doctor));
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.healthy, null);
});

test("05 vps.health: zero applications does NOT turn a healthy VPS into a failure", async () => {
  const doctor = doctorResult({
    findings: [finding("NO_APPLICATIONS_MANAGED", "info", "application-search returned zero applications (server can still be healthy)")],
  });
  const result = await runVpsHealth("t", {}, deps([], doctor));
  assert.equal(result.status, "HEALTHY");
  assert.equal(result.healthy, true);
  assert.ok(hasFinding(result, "NO_APPLICATIONS_MANAGED"));
});

// ---- engineering.vps.why_down (tests 06-09) ----

test("06 vps.why_down: known cause -> cause returned", async () => {
  const doctor = doctorResult({
    status: "CRITICAL",
    findings: [
      finding("NODE_NOT_READY", "critical", "node node-1 state='down' (expected 'ready')"),
      finding("NO_APPLICATIONS_MANAGED", "info", "zero applications"),
    ],
  });
  const result = await runVpsWhyDown("t", {}, deps([], doctor));
  assert.equal(result.status, "CRITICAL");
  assert.equal(result.down, true);
  const cause = result.cause as Record<string, unknown>;
  assert.equal(cause.code, "NODE_NOT_READY");
  assert.equal(cause.severity, "critical");
  const evidence = result.evidence as Array<Record<string, unknown>>;
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].code, "NODE_NOT_READY");
  assert.ok(String(result.summary).includes("NODE_NOT_READY"));
});

test("07 vps.why_down: deployment failure -> correct evidence", async () => {
  const doctor = doctorResult({
    status: "DEGRADED",
    application: APP,
    deployments: { active: 0, queued: 0, lastStatus: "failed" },
    findings: [
      finding("DEPLOYMENT_FAILED", "warning", "deployment dep-1 status='error'"),
      finding("DEPLOYMENT_IN_FLIGHT", "warning", "deployment dep-2 status='running' (in flight)"),
    ],
  });
  const result = await runVpsWhyDown("t", {}, deps([], doctor));
  assert.equal(result.down, true);
  const cause = result.cause as Record<string, unknown>;
  assert.equal(cause.code, "DEPLOYMENT_FAILED");
  const evidence = result.evidence as Array<Record<string, unknown>>;
  assert.equal(evidence.length, 2);
  assert.deepEqual(evidence.map((e) => e.code), ["DEPLOYMENT_FAILED", "DEPLOYMENT_IN_FLIGHT"]);
});

test("08 vps.why_down: no sufficient cause -> does NOT invent one", async () => {
  const doctor = doctorResult({
    findings: [finding("NO_APPLICATIONS_MANAGED", "info", "zero applications (server can still be healthy)")],
  });
  const result = await runVpsWhyDown("t", {}, deps([], doctor));
  assert.equal(result.status, "HEALTHY");
  assert.equal(result.down, false);
  assert.equal(result.cause, null);
  assert.deepEqual(result.evidence, []);
});

test("09 vps.why_down: UNKNOWN upstream -> status UNKNOWN, honest observable cause", async () => {
  const doctor = doctorResult({
    ok: false,
    outcome: "UPSTREAM_ERROR",
    status: "UNKNOWN",
    findings: [finding("UPSTREAM_ERROR", "critical", "server-all failed (status 502): FAKE_UPSTREAM_FAILURE")],
  });
  const result = await runVpsWhyDown("t", {}, deps([], doctor));
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.down, null);
  const cause = result.cause as Record<string, unknown>;
  assert.equal(cause.code, "UPSTREAM_ERROR");
});

// ---- engineering.deploy.status (tests 10-13) ----

test("10 deploy.status: healthy deployment -> OK", async () => {
  const doctor = doctorResult({
    application: APP,
    deployments: { active: 0, queued: 0, lastStatus: "success" },
  });
  const result = await runDeployStatus("t", {}, deps([], doctor));
  assert.equal(result.status, "OK");
  const state = result.deploymentState as Record<string, unknown>;
  assert.equal(state.lastStatus, "success");
  assert.equal(state.queued, 0);
  const application = state.application as Record<string, unknown>;
  assert.equal(application.id, "app-1");
  assert.equal(application.name, "my-app");
});

test("11 deploy.status: deployment failed -> FAILED", async () => {
  const doctor = doctorResult({
    status: "DEGRADED",
    application: APP,
    deployments: { active: 0, queued: 0, lastStatus: "failed" },
    findings: [finding("DEPLOYMENT_FAILED", "warning", "deployment dep-1 status='error'")],
  });
  const result = await runDeployStatus("t", {}, deps([], doctor));
  assert.equal(result.status, "FAILED");
  assert.ok(String(result.summary).includes("my-app"));
});

test("12 deploy.status: queue pending -> PENDING", async () => {
  const doctor = doctorResult({
    application: APP,
    deployments: { active: 0, queued: 2, lastStatus: "success" },
    findings: [finding("QUEUE_PENDING", "warning", "deployment-queueList returned 2 queued item(s)")],
  });
  const result = await runDeployStatus("t", {}, deps([], doctor));
  assert.equal(result.status, "PENDING");
  const state = result.deploymentState as Record<string, unknown>;
  assert.equal(state.queued, 2);
  assert.equal(state.lastStatus, "success");
});

test("13 deploy.status: zero applications -> informative NO_APPLICATIONS_MANAGED (not a VPS failure)", async () => {
  const doctor = doctorResult({
    findings: [finding("NO_APPLICATIONS_MANAGED", "info", "application-search returned zero applications (server can still be healthy)")],
  });
  const result = await runDeployStatus("t", {}, deps([], doctor));
  assert.equal(result.status, "NO_APPLICATIONS_MANAGED");
  const state = result.deploymentState as Record<string, unknown>;
  assert.equal(state.application, null);
  assert.equal(state.active, 0);
  assert.equal(state.queued, 0);
  assert.ok(String(result.summary).includes("não é falha"));
});

// ---- SPRINT SIMPLE-TOOLS-02 (tests 20-32): capacity / what_changed / app.health ----

const monitorDoctor = (over: Record<string, unknown> = {}): Record<string, unknown> => doctorResult({ monitoringAvailable: true, ...over });

test("20 vps.capacity: normal state -> OK (monitoring evidence, no pressure findings)", async () => {
  const log: string[] = [];
  const result = await runVpsCapacity("engineering.vps.capacity", {}, deps(log, monitorDoctor()));
  assert.equal(result.status, "OK");
  assert.equal(result.vpsStatus, "HEALTHY");
  assert.equal(result.monitoringAvailable, true);
  assert.deepEqual(findingsOf(result), []);
  assert.deepEqual(log, ["engineering.vps.capacity"]);
});

test("21 vps.capacity: capacity pressure warning finding -> PRESSURE", async () => {
  const doctor = monitorDoctor({ findings: [finding("DISK_PRESSURE", "warning", "disk usage evidence from the existing mechanism")] });
  const result = await runVpsCapacity("t", {}, deps([], doctor));
  assert.equal(result.status, "PRESSURE");
  assert.ok(hasFinding(result, "DISK_PRESSURE"));
});

test("22 vps.capacity: critical capacity finding -> CRITICAL (beats warning)", async () => {
  const doctor = monitorDoctor({ status: "CRITICAL", findings: [finding("MEMORY_PRESSURE", "warning", "mem"), finding("DISK_FULL", "critical", "disk")] });
  const result = await runVpsCapacity("t", {}, deps([], doctor));
  assert.equal(result.status, "CRITICAL");
});

test("23 vps.capacity: no capacity evidence -> UNKNOWN (nothing invented)", async () => {
  const result = await runVpsCapacity("t", {}, deps([], doctorResult())); // monitoringAvailable=false, no findings
  assert.equal(result.status, "UNKNOWN");
  const doctor = doctorResult({ ok: false, outcome: "UPSTREAM_ERROR", status: "UNKNOWN", findings: [finding("UPSTREAM_ERROR", "critical", "server-all failed (status 502)")] });
  const result2 = await runVpsCapacity("t", {}, deps([], doctor));
  assert.equal(result2.status, "UNKNOWN");
});

test("24 vps.capacity: read-only — exactly one Doctor call, no write path in source", async () => {
  const log: string[] = [];
  await runVpsCapacity("engineering.vps.capacity", {}, deps(log, monitorDoctor()));
  assert.deepEqual(log, ["engineering.vps.capacity"]);
  const src = source();
  for (const primitive of ["application-redeploy", "application-create", "application-saveDockerProvider", "application-deploy"]) {
    assert.ok(!src.includes(primitive), `mutating primitive referenced: ${primitive}`);
  }
});

test("25 vps.what_changed: release changed -> CHANGED with short evidence", async () => {
  const result = await runVpsWhatChanged("engineering.vps.what_changed", {}, { runReleaseState: async () => ({ currentRelease: "img-b", previousImage: "img-a", sourceHash: "hash-b" }) });
  assert.equal(result.status, "CHANGED");
  assert.equal(result.changed, true);
  const release = result.release as Record<string, unknown>;
  assert.equal(release.currentRelease, "img-b");
  assert.equal(release.previousRelease, "img-a");
  assert.ok(String(result.summary).includes("img-a"));
});

test("26 vps.what_changed: same release -> NO_CHANGE", async () => {
  const result = await runVpsWhatChanged("t", {}, { runReleaseState: async () => ({ currentRelease: "img-a", previousImage: "img-a" }) });
  assert.equal(result.status, "NO_CHANGE");
  assert.equal(result.changed, false);
});

test("27 vps.what_changed: insufficient evidence -> UNKNOWN (never invents change)", async () => {
  for (const bad of [null, {}, { currentRelease: "img-b" }]) {
    const result = await runVpsWhatChanged("t", {}, { runReleaseState: async () => bad });
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.changed, null);
  }
});

test("28 vps.what_changed: reader failure -> UNKNOWN, no invented change", async () => {
  const result = await runVpsWhatChanged("t", {}, { runReleaseState: async () => { throw new Error("release-state unavailable"); } });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.changed, null);
});

const healthyAppDoctor = (): Record<string, unknown> => doctorResult({ application: APP, deployments: { active: 0, queued: 0, lastStatus: "success" } });

test("29 app.health: healthy application -> HEALTHY (read-only, one Doctor call)", async () => {
  const log: string[] = [];
  const result = await runAppHealth("engineering.app.health", {}, deps(log, healthyAppDoctor()));
  assert.equal(result.status, "HEALTHY");
  const app = result.application as Record<string, unknown>;
  assert.equal(app.id, "app-1");
  assert.equal(app.name, "my-app");
  assert.deepEqual(log, ["engineering.app.health"]);
});

test("30 app.health: degraded then critical application", async () => {
  const degraded = doctorResult({ status: "DEGRADED", application: APP, deployments: { active: 0, queued: 0, lastStatus: "success" } });
  const resultDegraded = await runAppHealth("t", {}, deps([], degraded));
  assert.equal(resultDegraded.status, "DEGRADED");
  const critical = doctorResult({ status: "DEGRADED", application: APP, deployments: { active: 0, queued: 0, lastStatus: "failed" }, findings: [finding("DEPLOYMENT_FAILED", "warning", "deployment dep-1 status='error'")] });
  const resultCritical = await runAppHealth("t", {}, deps([], critical));
  assert.equal(resultCritical.status, "CRITICAL");
});

test("31 app.health: zero applications -> informative NO_APPLICATION (not an error)", async () => {
  const result = await runAppHealth("t", {}, deps([], doctorResult()));
  assert.equal(result.status, "NO_APPLICATION");
  assert.equal(result.application, null);
  assert.ok(String(result.summary).includes("informativo"));
});

test("32 security: second batch tools reject strict-input violations before any evidence", async () => {
  const BATCH2 = [runVpsCapacity, runVpsWhatChanged, runAppHealth];
  for (const key of FORBIDDEN_KEYS) {
    for (const run of BATCH2) {
      const result = await run("t", { [key]: "x" }, {});
      const error = result.error as Record<string, unknown>;
      assert.equal(error.code, "SIMPLE_TOOL_INPUT_REJECTED", `key ${key}`);
      assert.deepEqual(error.rejectedKeys, [key]);
    }
  }
  for (const bad of ["string", 42, [], null, { extra: 1 }]) {
    for (const run of BATCH2) {
      const result = await run("t", bad as never, {});
      assert.equal((result.error as Record<string, unknown>).code, "SIMPLE_TOOL_INPUT_REJECTED");
    }
  }
});

// ---- SPRINT SIMPLE-TOOLS-03 (tests 33-46) ----

const reconcileResult = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ok: true,
  status: "IN_SYNC",
  expected: {},
  actual: { container: null },
  findings: [],
  mutationPerformed: false,
  ...over,
});

const deps3 = (log: string[], doctor: Record<string, unknown>, reconcile: Record<string, unknown> | null, release: unknown = { deployStatus: "PASS", smokeStatus: "PASS" }) => {
  const base = {
    runDoctor: async (subject: string): Promise<Record<string, unknown>> => { log.push(subject); return doctor; },
    runReleaseState: async (): Promise<unknown> => { log.push("release-state"); return release; },
    now,
  };
  return reconcile === null ? base : { ...base, runReconcile: async (): Promise<unknown> => { log.push("reconcile"); return reconcile; } };
};

test("33 incident.summary: healthy environment -> NO_INCIDENT (Doctor + reconcile read-only)", async () => {
  const log: string[] = [];
  const result = await runVpsIncidentSummary("engineering.vps.incident.summary", {}, deps3(log, doctorResult(), reconcileResult()));
  assert.equal(result.status, "NO_INCIDENT");
  assert.equal(result.incident, false);
  assert.equal(result.cause, null);
  assert.deepEqual(log, ["engineering.vps.incident.summary", "reconcile", "release-state"]);
});

test("34 incident.summary: problem observed -> INCIDENT with deterministic cause", async () => {
  const doctor = doctorResult({ status: "DEGRADED", findings: [finding("DEPLOYMENT_FAILED", "warning", "deployment dep-1 status='error'")] });
  const result = await runVpsIncidentSummary("t", {}, deps3([], doctor, reconcileResult()));
  assert.equal(result.status, "INCIDENT");
  assert.equal(result.incident, true);
  const cause = result.cause as Record<string, unknown>;
  assert.equal(cause.code, "DEPLOYMENT_FAILED");
});

test("35 incident.summary: reconcile drift / release smoke FAIL are incidents; Doctor UNKNOWN -> UNKNOWN", async () => {
  const drift = await runVpsIncidentSummary("t", {}, deps3([], doctorResult(), reconcileResult({ status: "DRIFTED", findings: [finding("CATALOG_HASH_MISMATCH", "critical", "catalog hash differs from release-state")] })));
  assert.equal(drift.status, "INCIDENT");
  const smoke = await runVpsIncidentSummary("t", {}, deps3([], doctorResult(), reconcileResult(), { deployStatus: "PASS", smokeStatus: "FAIL" }));
  assert.equal(smoke.status, "INCIDENT");
  const unknownDoctor = doctorResult({ ok: false, outcome: "UPSTREAM_ERROR", status: "UNKNOWN", server: null, findings: [finding("UPSTREAM_ERROR", "critical", "server-all failed (status 502)")] });
  const unknown = await runVpsIncidentSummary("t", {}, deps3([], unknownDoctor, reconcileResult()));
  assert.equal(unknown.status, "UNKNOWN");
  assert.equal(unknown.incident, null);
});

test("36 deploy.ready: healthy + synced + release PASS -> READY (strictly advisory)", async () => {
  const log: string[] = [];
  const result = await runDeployReady("engineering.deploy.ready", {}, deps3(log, doctorResult(), reconcileResult()));
  assert.equal(result.status, "READY");
  assert.equal(result.ready, true);
  assert.deepEqual(result.blockers, []);
  assert.ok(String(result.summary).includes("Nada é executado"));
  assert.deepEqual(log, ["engineering.deploy.ready", "reconcile", "release-state"]);
});

test("37 deploy.ready: impeding conditions -> NOT_READY", async () => {
  const inflight = await runDeployReady("t", {}, deps3([], doctorResult(), reconcileResult(), { deployStatus: "IN_PROGRESS", smokeStatus: "PASS" }));
  assert.equal(inflight.status, "NOT_READY");
  assert.equal(inflight.ready, false);
  assert.ok((inflight.blockers as string[]).includes("releaseDeployStatus=IN_PROGRESS"));
  const degraded = doctorResult({ status: "DEGRADED", findings: [finding("DEPLOYMENT_FAILED", "warning", "deployment dep-1 status='error'")] });
  const warned = await runDeployReady("t", {}, deps3([], degraded, reconcileResult()));
  assert.equal(warned.status, "NOT_READY");
  assert.ok((warned.blockers as string[]).includes("DEPLOYMENT_FAILED(warning)"));
  const busy = doctorResult({ deployments: { active: 1, queued: 0, lastStatus: null } });
  const active = await runDeployReady("t", {}, deps3([], busy, reconcileResult()));
  assert.equal(active.status, "NOT_READY");
  assert.ok((active.blockers as string[]).includes("deploymentActivity"));
  const reconcileBusy = await runDeployReady("t", {}, deps3([], doctorResult(), reconcileResult({ findings: [finding("DEPLOY_IN_PROGRESS", "warning", "deploy job queued")] })));
  assert.equal(reconcileBusy.status, "NOT_READY");
  assert.ok((reconcileBusy.blockers as string[]).includes("reconcile.DEPLOY_IN_PROGRESS"));
});

test("38 deploy.ready: insufficient evidence -> UNKNOWN; failed readers never break the answer", async () => {
  const unknownDoctor = doctorResult({ ok: false, outcome: "UPSTREAM_ERROR", status: "UNKNOWN", server: null, findings: [finding("UPSTREAM_ERROR", "critical", "server-all failed (status 502)")] });
  const unknown = await runDeployReady("t", {}, deps3([], unknownDoctor, reconcileResult()));
  assert.equal(unknown.status, "UNKNOWN");
  assert.equal(unknown.ready, null);
  // reconcile that could not classify its own comparison (status UNKNOWN) contributes NO blocker.
  const unclassified = await runDeployReady("t", {}, deps3([], doctorResult(), reconcileResult({ status: "UNKNOWN", findings: [finding("ACTUAL_STATE_UNAVAILABLE", "warning", "catalog unavailable")] })));
  assert.equal(unclassified.status, "READY");
  // release-state reader throws -> evaluated from Doctor + reconcile alone.
  const threw = await runDeployReady("t", {}, { runDoctor: async () => doctorResult(), runReconcile: async () => reconcileResult(), runReleaseState: async () => { throw new Error("release-state unavailable"); }, now });
  assert.equal(threw.status, "READY");
});

test("39 docker.health: healthy -> HEALTHY (node evidence, one Doctor call)", async () => {
  const log: string[] = [];
  const doctor = doctorResult({ application: APP, deployments: { active: 0, queued: 0, lastStatus: "success" } });
  const result = await runDockerHealth("engineering.docker.health", {}, deps(log, doctor));
  assert.equal(result.status, "HEALTHY");
  assert.equal(result.containerLevelEvidence, false);
  const node = result.nodeEvidence as Record<string, unknown>;
  assert.equal(node.nodeStatus, "ready");
  assert.deepEqual(log, ["engineering.docker.health"]);
});

test("40 docker.health: Swarm/manager problems -> CRITICAL then DEGRADED", async () => {
  const critical = doctorResult({ status: "CRITICAL", findings: [finding("NODE_NOT_READY", "critical", "node not ready")] });
  assert.equal((await runDockerHealth("t", {}, deps([], critical))).status, "CRITICAL");
  const degraded = doctorResult({ status: "DEGRADED", findings: [finding("NODE_NOT_ACTIVE", "warning", "node drained")] });
  assert.equal((await runDockerHealth("t", {}, deps([], degraded))).status, "DEGRADED");
});

test("41 docker.health: zero managed applications -> NO_CONTAINERS; non-Docker or missing evidence -> UNKNOWN", async () => {
  const none = doctorResult({ findings: [finding("NO_APPLICATIONS_MANAGED", "info", "zero applications managed by Dokploy")] });
  assert.equal((await runDockerHealth("t", {}, deps([], none))).status, "NO_CONTAINERS");
  const appProblem = doctorResult({ status: "CRITICAL", application: APP, findings: [finding("DEPLOYMENT_FAILED", "critical", "deployment dep-1 status='error'")] });
  assert.equal((await runDockerHealth("t", {}, deps([], appProblem))).status, "UNKNOWN");
  assert.equal((await runDockerHealth("t", {}, deps([], doctorResult()))).status, "UNKNOWN");
  const upstream = doctorResult({ ok: false, outcome: "UPSTREAM_ERROR", status: "UNKNOWN", server: null });
  assert.equal((await runDockerHealth("t", {}, deps([], upstream))).status, "UNKNOWN");
});

test("42 logs.explain: no errors -> NO_ERRORS (info findings are not errors)", async () => {
  const clean = await runLogsExplain("engineering.logs.explain", {}, deps([], doctorResult()));
  assert.equal(clean.status, "NO_ERRORS");
  const infoOnly = doctorResult({ findings: [finding("NO_APPLICATIONS_MANAGED", "info", "zero applications managed by Dokploy")] });
  const explained = await runLogsExplain("t", {}, deps([], infoOnly));
  assert.equal(explained.status, "NO_ERRORS");
  const entries = explained.explained as Array<Record<string, unknown>>;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].code, "NO_APPLICATIONS_MANAGED");
});

test("43 logs.explain: known error findings -> EXPLAINED (deterministic table, no LLM)", async () => {
  const doctor = doctorResult({ status: "DEGRADED", findings: [finding("DEPLOYMENT_FAILED", "warning", "deployment dep-1 status='error'"), finding("QUEUE_PENDING", "warning", "queue depth 2")] });
  const result = await runLogsExplain("t", {}, deps([], doctor));
  assert.equal(result.status, "EXPLAINED");
  assert.equal(result.errorCount, 2);
  assert.deepEqual(result.unexplained, []);
  const explanations = result.explained as Array<Record<string, unknown>>;
  assert.equal(explanations.length, 2);
  assert.ok(String(explanations[0].explanation).includes("deployment"));
});

test("44 logs.explain: insufficient evidence -> UNKNOWN (unknown codes; Doctor UNKNOWN)", async () => {
  const weird = doctorResult({ status: "DEGRADED", findings: [finding("TOTALLY_UNKNOWN_CODE", "warning", "mystery")] });
  const partial = await runLogsExplain("t", {}, deps([], weird));
  assert.equal(partial.status, "UNKNOWN");
  assert.deepEqual(partial.unexplained, ["TOTALLY_UNKNOWN_CODE"]);
  const upstream = doctorResult({ ok: false, outcome: "UPSTREAM_ERROR", status: "UNKNOWN", server: null, findings: [finding("UPSTREAM_ERROR", "critical", "server-all failed (status 502)")] });
  assert.equal((await runLogsExplain("t", {}, deps([], upstream))).status, "UNKNOWN");
});

test("45 security: third batch tools reject strict-input violations before any evidence", async () => {
  const BATCH3 = [runVpsIncidentSummary, runDeployReady, runDockerHealth, runLogsExplain];
  for (const key of FORBIDDEN_KEYS) {
    for (const run of BATCH3) {
      const result = await run("t", { [key]: "x" }, {});
      const error = result.error as Record<string, unknown>;
      assert.equal(error.code, "SIMPLE_TOOL_INPUT_REJECTED", `key ${key}`);
      assert.deepEqual(error.rejectedKeys, [key]);
    }
  }
  for (const bad of ["string", 42, [], null, { extra: 1 }]) {
    for (const run of BATCH3) {
      const result = await run("t", bad as never, {});
      assert.equal((result.error as Record<string, unknown>).code, "SIMPLE_TOOL_INPUT_REJECTED");
    }
  }
});

test("46 security: third batch is read-only — exactly one Doctor call per tool, no write/LLM path", async () => {
  const log: string[] = [];
  await runVpsIncidentSummary("engineering.vps.incident.summary", {}, deps3(log, doctorResult(), reconcileResult()));
  await runDeployReady("engineering.deploy.ready", {}, deps3(log, doctorResult(), reconcileResult()));
  await runDockerHealth("engineering.docker.health", {}, deps(log, doctorResult()));
  await runLogsExplain("engineering.logs.explain", {}, deps(log, doctorResult()));
  assert.deepEqual(log, [
    "engineering.vps.incident.summary", "reconcile", "release-state",
    "engineering.deploy.ready", "reconcile", "release-state",
    "engineering.docker.health",
    "engineering.logs.explain",
  ]);
  const src = source();
  for (const primitive of ["application-redeploy", "application-create", "application-saveDockerProvider", "application-deploy"]) {
    assert.ok(!src.includes(primitive), `mutating primitive referenced: ${primitive}`);
  }
  for (const forbidden of ["callReleaseRunner", "child_process", "./vpsGuardian", "./vpsRecover", "./vpsChangeSafe"]) {
    assert.ok(!src.includes(forbidden), `forbidden composition referenced: ${forbidden}`);
  }
});

// ---- Security (tests 14-19) ----

const FORBIDDEN_KEYS = ["execute", "approval", "target", "applicationId", "serverId", "toolName", "action", "command", "shell", "url", "headers", "token"];
const ALL_TOOLS = [runVpsHealth, runVpsWhyDown, runDeployStatus, runVpsCapacity, runVpsWhatChanged, runAppHealth, runVpsIncidentSummary, runDeployReady, runDockerHealth, runLogsExplain];

test("14 security: all three tools reject execute before any evidence collection", async () => {
  for (const run of ALL_TOOLS) {
    const log: string[] = [];
    const result = await run("t", { execute: true }, deps(log, doctorResult()));
    assert.equal(result.ok, false);
    const error = result.error as Record<string, unknown>;
    assert.equal(error.code, "SIMPLE_TOOL_INPUT_REJECTED");
    assert.deepEqual(error.rejectedKeys, ["execute"]);
    assert.equal(result.status, "UNKNOWN");
    assert.deepEqual(log, []); // the Doctor is never called on rejected input
  }
});

test("15 security: all three tools reject every mutation-control/arbitrary-target key (strict {} contract)", async () => {
  for (const key of FORBIDDEN_KEYS) {
    for (const run of ALL_TOOLS) {
      const result = await run("t", { [key]: "x" }, deps([], doctorResult()));
      const error = result.error as Record<string, unknown>;
      assert.equal(error.code, "SIMPLE_TOOL_INPUT_REJECTED", `key ${key}`);
      assert.deepEqual(error.rejectedKeys, [key]);
    }
  }
  // Non-object and non-empty inputs are rejected too.
  for (const bad of ["string", 42, [], null, { extra: 1 }]) {
    for (const run of ALL_TOOLS) {
      const result = await run("t", bad as never, deps([], doctorResult()));
      assert.equal((result.error as Record<string, unknown>).code, "SIMPLE_TOOL_INPUT_REJECTED");
    }
  }
});

test("16 security: the ONLY evidence source is the (read-only) Doctor run — exactly one call per tool", async () => {
  const log: string[] = [];
  await runVpsHealth("engineering.vps.health", {}, deps(log, doctorResult()));
  await runVpsWhyDown("engineering.vps.why_down", {}, deps(log, doctorResult()));
  await runDeployStatus("engineering.deploy.status", {}, deps(log, doctorResult()));
  assert.deepEqual(log, ["engineering.vps.health", "engineering.vps.why_down", "engineering.deploy.status"]);
  // No mutating Dokploy primitive is ever referenced by the implementation.
  const src = source();
  for (const primitive of ["application-redeploy", "application-create", "application-saveDockerProvider", "application-deploy"]) {
    assert.ok(!src.includes(primitive), `mutating primitive referenced: ${primitive}`);
  }
});

test("17 security: the coordinator supertool is never imported/composed", () => {
  const src = source();
  assert.ok(!src.includes("./vpsGuardian"), "simple tools must not compose the coordinator supertool");
  assert.ok(src.includes('from "./vpsDoctor.ts"'), "simple tools must reuse the certified Doctor");
});

test("18 security: the rollback supertool is never imported/composed", () => {
  assert.ok(!source().includes("./vpsRecover"));
});

test("19 security: the controlled change supertool is never imported/composed", () => {
  assert.ok(!source().includes("./vpsChangeSafe"));
});
