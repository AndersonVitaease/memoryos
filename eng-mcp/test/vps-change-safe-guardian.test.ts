// DG01R — Guardian Core (v0.1.0, frozen commit e10626c) integration tests for
// engineering.vps.change.safe. Everything runs fully offline: fake transport,
// no network, no LLM, no SSH/shell, no real Dokploy, ZERO real mutation.
//
// Honest resolution facts: the frozen v0.1.0 package manifest has no "main" and
// no "exports" field, so the bare specifier is not Node-resolvable; the
// operator-side convention (same as memoryos-vps-guardian consumers) is the
// explicit source subpath "memoryos-guardian-core/src/guardianCore.ts". The
// official test image is built from the eng-mcp build context, which cannot
// declare the dependency (manifest paths are policy-protected from agent
// writes) — so inside that image the import fails and every governed flow
// degrades FAIL-CLOSED (zero mutation). The probe below records exactly which
// world the official suite runs in; neither branch is ever invented.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runVpsChangeSafe,
  MUTATION_ALLOWLIST,
  READ_PRIMITIVES,
  findInFlightConflict,
  type VpsTransport,
  type VpsTransportCall,
  type VpsTransportResponse,
} from "../src/vpsChangeSafe.ts";
import {
  loadGuardianCore,
  createGuardianVpsRedeployAdapter,
  type DomainAdapter,
  type GuardianCoreModule,
  type GuardianResult,
} from "../src/guardianVpsAdapter.ts";

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

const APP: Record<string, unknown> = {
  id: "app-1",
  applicationId: "app-1",
  name: "my-app",
  appName: "my-app",
  applicationStatus: "running",
  status: "running",
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

// DG01R: faithful mirror of the frozen Guardian Core's documented orchestration
// (bind -> gate -> apply), used ONLY as the deps-level test seam when the real
// package is not resolvable in this environment. The real Core module is
// exercised by the probe test below (when resolvable) and by the Core's own
// frozen suite (13/13); the Core package is never re-implemented here.
const mirrorGuardianCore: GuardianCoreModule = {
  async executeGuardianIntent<I, B>(intent: I, adapter: DomainAdapter<I, B>): Promise<GuardianResult> {
    const bound = await adapter.bind(intent);
    if ("status" in bound) return adapter.apply(bound.proposal);
    return bound;
  },
};

const run = (transport: VpsTransport, input: Record<string, unknown>, guardianCore: GuardianCoreModule | null = mirrorGuardianCore): Promise<Record<string, unknown>> =>
  runVpsChangeSafe("vps-change-safe-guardian-test", input, { transport, now, dokployServerId: "srv-test", guardianCore });

const mutatingCalls = (log: VpsTransportCall[]): VpsTransportCall[] => log.filter((call) => call.mutating);

// ---------------------------------------------------------------------------
// GUARDIAN_CORE_IMPORT — real dynamic import probe of the frozen Core.
// ---------------------------------------------------------------------------

test("DG01R GUARDIAN_CORE_IMPORT: real import + execution of the frozen Guardian Core v0.1.0 in this runtime", async () => {
  const loaded = await loadGuardianCore();
  if (loaded.core !== null) {
    assert.equal(typeof loaded.core.executeGuardianIntent, "function");
    // Functional round trip: a refusing adapter proves the real frozen module
    // executes end-to-end here (apply unreachable, zero mutation by contract).
    const result = await loaded.core.executeGuardianIntent({ probe: "DG01R" }, {
      async bind() {
        return { outcome: "NOT_EXECUTED", stage: "ELIGIBILITY", refusal: "BLOCKED", effect: { dispatched: false, state: "NONE_PROVEN" }, reasons: ["DG01R_PROBE_REFUSAL"] };
      },
      async apply() {
        throw new Error("DG01R_PROBE_APPLY_MUST_BE_UNREACHABLE");
      },
    });
    assert.equal(result.outcome, "NOT_EXECUTED");
    assert.equal(result.effect.dispatched, false);
    assert.deepEqual(result.reasons, ["DG01R_PROBE_REFUSAL"]);
  } else {
    // The official test image is built from the eng-mcp context without the
    // pinned dependency: record the EXACT resolution failure as evidence.
    assert.match(
      loaded.error ?? "",
      /GUARDIAN_CORE_IMPORT_FAILED.*(ERR_MODULE_NOT_FOUND|Cannot find package|memoryos-guardian-core)/,
      `guardian core unavailability reason: ${loaded.error}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Adapter-level semantics (pure; the adapter contract is testable directly).
// ---------------------------------------------------------------------------

test("DG01R ADAPTER bind: data-only intent fail-closed eligibility — refusal when approval absent, BOUND with proposal when satisfied, zero I/O", async () => {
  const log: VpsTransportCall[] = [];
  const dispatchRecord = { response: null, startedAt: 0, completedAt: 0, revalidation: null };
  const adapter = createGuardianVpsRedeployAdapter({
    transport: fakeTransport({ handlers: defaultHandlers(), log }),
    primitive: "application-redeploy",
    applicationId: "app-1",
    now,
    readDeployments: async () => ({ ok: true, status: 200, deployments: [deployment()] }),
    findInFlightConflict: (deployments) => findInFlightConflict(deployments, now()),
    dispatchRecord,
    registerMutationPrimitive: () => {},
  });
  const refused = (await adapter.bind({ action: "redeploy_application", applicationId: "app-1", approved: false, observedAt: BASE, observedConflictDetected: false })) as Extract<GuardianResult, { outcome: "NOT_EXECUTED" }>;
  assert.equal(refused.outcome, "NOT_EXECUTED");
  assert.equal(refused.stage, "ELIGIBILITY");
  assert.equal(refused.refusal, "BLOCKED");
  assert.equal(refused.effect.dispatched, false);
  assert.equal(refused.effect.state, "NONE_PROVEN");
  assert.deepEqual(refused.reasons, ["APPROVAL_GATE_NOT_SATISFIED"]);
  assert.equal(log.length, 0); // bind is read-only: zero transport calls
  const bound = (await adapter.bind({ action: "redeploy_application", applicationId: "app-1", approved: true, observedAt: BASE, observedConflictDetected: false })) as { status: "BOUND"; proposal: { primitive: string; applicationId: string; observedAt: number } };
  assert.equal(bound.status, "BOUND");
  assert.deepEqual(bound.proposal, { primitive: "application-redeploy", applicationId: "app-1", observedAt: BASE });
});

test("DG01R ADAPTER apply: stale observation -> NOT_EXECUTED(COMPATIBILITY), zero mutation", async () => {
  const log: VpsTransportCall[] = [];
  const dispatchRecord = { response: null, startedAt: 0, completedAt: 0, revalidation: null };
  const adapter = createGuardianVpsRedeployAdapter({
    transport: fakeTransport({ handlers: defaultHandlers(), log }),
    primitive: "application-redeploy",
    applicationId: "app-1",
    now,
    readDeployments: async () => ({
      ok: true,
      status: 200,
      deployments: [deployment(), deployment({ id: "dep-live", status: "building", createdAt: new Date(BASE + 1_000).toISOString() })],
    }),
    findInFlightConflict: (deployments) => findInFlightConflict(deployments, now()),
    dispatchRecord,
    registerMutationPrimitive: () => {},
  });
  const result = await adapter.apply({ primitive: "application-redeploy", applicationId: "app-1", observedAt: BASE });
  assert.equal(result.outcome, "NOT_EXECUTED");
  assert.equal(result.stage, "COMPATIBILITY");
  assert.equal(result.refusal, "BLOCKED");
  assert.equal(result.effect.dispatched, false);
  assert.equal(result.effect.state, "NONE_PROVEN");
  assert.ok(result.reasons.includes("STATE_CHANGED_SINCE_PRECHECK"));
  assert.equal(dispatchRecord.response, null); // the mutating boundary was never reached
  assert.equal(mutatingCalls(log).length, 0);
});

test("DG01R ADAPTER apply: re-proof read failure -> INDETERMINATE before the boundary, zero mutation", async () => {
  const log: VpsTransportCall[] = [];
  const dispatchRecord = { response: null, startedAt: 0, completedAt: 0, revalidation: null };
  const adapter = createGuardianVpsRedeployAdapter({
    transport: fakeTransport({ handlers: defaultHandlers(), log }),
    primitive: "application-redeploy",
    applicationId: "app-1",
    now,
    readDeployments: async () => ({ ok: false, status: 502, error: "FAKE_READ_FAILURE", deployments: [] }),
    findInFlightConflict: (deployments) => findInFlightConflict(deployments, now()),
    dispatchRecord,
    registerMutationPrimitive: () => {},
  });
  const result = await adapter.apply({ primitive: "application-redeploy", applicationId: "app-1", observedAt: BASE });
  assert.equal(result.outcome, "INDETERMINATE");
  assert.equal(result.effect.dispatched, false);
  assert.equal(result.effect.state, "NONE_PROVEN");
  assert.equal(result.reasons[0], "REVALIDATION_READ_FAILED");
  assert.equal(dispatchRecord.response, null);
  assert.equal(dispatchRecord.revalidation?.ok, false);
  assert.equal(mutatingCalls(log).length, 0);
});

test("DG01R ADAPTER apply: boundary reached -> exactly one dispatch with the frozen call shape, honest UNDETERMINED occurrence, response recorded", async () => {
  const log: VpsTransportCall[] = [];
  const dispatchRecord = { response: null, startedAt: 0, completedAt: 0, revalidation: null };
  const adapter = createGuardianVpsRedeployAdapter({
    transport: fakeTransport({ handlers: healthyPostHandlers(), log }),
    primitive: "application-redeploy",
    applicationId: "app-1",
    now,
    readDeployments: async () => ({ ok: true, status: 200, deployments: [deployment()] }),
    findInFlightConflict: (deployments) => findInFlightConflict(deployments, now()),
    dispatchRecord,
    registerMutationPrimitive: () => {},
  });
  const result = await adapter.apply({ primitive: "application-redeploy", applicationId: "app-1", observedAt: BASE });
  assert.equal(result.outcome, "INDETERMINATE");
  assert.equal(result.effect.dispatched, true);
  assert.equal(result.effect.state, "UNDETERMINED");
  const mutations = mutatingCalls(log);
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].toolName, "application-redeploy");
  assert.deepEqual(mutations[0].arguments, { applicationId: "app-1" });
  assert.deepEqual(mutations[0].confirmation, { toolName: "application-redeploy" });
  assert.equal(mutations[0].mutating, true);
  assert.equal(dispatchRecord.response?.ok, true);
  assert.equal(dispatchRecord.startedAt, BASE);
  assert.equal(dispatchRecord.completedAt, BASE);
});

// ---------------------------------------------------------------------------
// Tool-flow semantics through runVpsChangeSafe (governed path).
// ---------------------------------------------------------------------------

test("DG01R A SAFE REFUSAL: execute/approval absent -> Guardian participates (NOT_EXECUTED ELIGIBILITY), PLANNED, zero application-redeploy", async () => {
  for (const extra of [{}, { execute: false }, { execute: true }, { execute: true, approval: { approved: false } }]) {
    const log: VpsTransportCall[] = [];
    const input: Record<string, unknown> = { action: "redeploy_application", target: { applicationId: "app-1" }, ...extra };
    const result = await run(fakeTransport({ handlers: defaultHandlers(), log }), input);
    assert.equal(result.outcome, "PLANNED");
    assert.equal(result.ok, true);
    assert.equal(result.executed, false);
    const guardian = result.guardian as Record<string, unknown>;
    assert.equal(guardian.outcome, "NOT_EXECUTED");
    assert.equal(guardian.stage, "ELIGIBILITY");
    assert.equal(guardian.refusal, "BLOCKED");
    assert.equal((guardian.effect as Record<string, unknown>).dispatched, false);
    assert.equal((guardian.effect as Record<string, unknown>).state, "NONE_PROVEN");
    assert.ok((guardian.reasons as string[]).includes("APPROVAL_GATE_NOT_SATISFIED"));
    assert.equal(mutatingCalls(log).length, 0);
    assert.ok(!log.some((call) => call.toolName === "application-redeploy"));
  }
});

test("DG01R A2 SAFE REFUSAL with the Core absent: honest unavailability marker, refusal still enforced, zero mutation", async () => {
  const log: VpsTransportCall[] = [];
  const result = await run(fakeTransport({ handlers: defaultHandlers(), log }), { action: "redeploy_application", target: { applicationId: "app-1" } }, null);
  assert.equal(result.outcome, "PLANNED");
  assert.equal(result.ok, true);
  assert.equal(result.executed, false);
  const guardian = result.guardian as Record<string, unknown>;
  assert.equal(guardian.available, false);
  assert.ok(guardian.reason === null || String(guardian.reason).includes("GUARDIAN_CORE_IMPORT_FAILED"));
  assert.equal(mutatingCalls(log).length, 0);
  assert.ok(!log.some((call) => call.toolName === "application-redeploy"));
});

test("DG01R B STALE: state changes between pre-check and dispatch -> Guardian NOT_EXECUTED(COMPATIBILITY), CHANGE_BLOCKED, zero application-redeploy", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  let deploymentReads = 0;
  handlers["deployment-all"] = () => {
    deploymentReads += 1;
    return deploymentReads === 1
      ? [deployment()]
      : [deployment(), deployment({ id: "dep-live", status: "building", createdAt: new Date(BASE + 1_000).toISOString() })];
  };
  const result = await run(fakeTransport({ handlers, log }), { action: "redeploy_application", target: { applicationId: "app-1" }, execute: true, approval: { approved: true } });
  assert.equal(result.outcome, "CHANGE_BLOCKED");
  assert.equal(result.ok, false);
  assert.equal(result.executed, false);
  const blocked = result.blocked as Record<string, unknown>;
  assert.equal(blocked.phase, "change");
  assert.equal(blocked.reason, "STATE_CHANGED_SINCE_PRECHECK");
  assert.equal(blocked.stage, "COMPATIBILITY");
  const guardian = result.guardian as Record<string, unknown>;
  assert.equal(guardian.outcome, "NOT_EXECUTED");
  assert.equal(guardian.stage, "COMPATIBILITY");
  assert.equal(guardian.refusal, "BLOCKED");
  assert.equal((guardian.effect as Record<string, unknown>).dispatched, false);
  assert.equal((guardian.effect as Record<string, unknown>).state, "NONE_PROVEN");
  assert.equal(mutatingCalls(log).length, 0);
  assert.ok(!log.some((call) => call.toolName === "application-redeploy"));
});

test("DG01R C AUTHORITY: caller input cannot supply/replace adapter, transport, allowlist or mutation primitive", async () => {
  // module surface: the operator allowlist is runtime-immutable and single-purpose
  assert.equal(Object.isFrozen(MUTATION_ALLOWLIST), true);
  assert.deepEqual(Object.keys(MUTATION_ALLOWLIST), ["redeploy_application"]);
  assert.equal(MUTATION_ALLOWLIST.redeploy_application.primitive, "application-redeploy");
  const log: VpsTransportCall[] = [];
  const hostile: Record<string, unknown> = {
    action: "redeploy_application",
    target: { applicationId: "app-1" },
    execute: true,
    approval: { approved: true },
    // hostile authority-injection keys — data-only, all ignored by the tool
    adapter: { bind: () => { throw new Error("HOSTILE_ADAPTER"); }, apply: () => { throw new Error("HOSTILE_ADAPTER"); } },
    transport: { name: "hostile", call: () => { throw new Error("HOSTILE_TRANSPORT"); } },
    guardianCore: { executeGuardianIntent: () => { throw new Error("HOSTILE_CORE"); } },
    allowlist: { stop_application: { primitive: "stop_application" } },
    MUTATION_ALLOWLIST: { stop_application: { primitive: "stop_application" } },
    mutationPrimitive: "stop_application",
    primitive: "stop_application",
  };
  const result = await run(fakeTransport({ handlers: healthyPostHandlers(), log }), hostile);
  assert.equal(result.executed, true);
  assert.equal(result.outcome, "EXECUTED_HEALTHY");
  assert.equal(result.primitive, "application-redeploy");
  const mutations = mutatingCalls(log);
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].toolName, "application-redeploy");
  assert.deepEqual(mutations[0].arguments, { applicationId: "app-1" });
  const allowed = new Set<string>([...READ_PRIMITIVES, "application-redeploy"]);
  for (const call of log) assert.ok(allowed.has(call.toolName), `unexpected primitive: ${call.toolName}`);
  const guardian = result.guardian as Record<string, unknown>;
  assert.equal(guardian.outcome, "INDETERMINATE"); // honest boundary truth from the governed path
  assert.equal((guardian.effect as Record<string, unknown>).dispatched, true);
});

test("DG01R C2 AUTHORITY fail-closed: with the Core absent, an execute+approved request can NEVER mutate", async () => {
  const log: VpsTransportCall[] = [];
  const result = await run(fakeTransport({ handlers: healthyPostHandlers(), log }), { action: "redeploy_application", target: { applicationId: "app-1" }, execute: true, approval: { approved: true } }, null);
  assert.equal(result.outcome, "UPSTREAM_ERROR");
  assert.equal(result.ok, false);
  assert.equal(result.executed, false);
  const mutation = result.mutation as Record<string, unknown>;
  assert.equal(mutation.attempted, false);
  assert.equal(mutation.occurred, false);
  assert.equal(mutatingCalls(log).length, 0);
  assert.ok(!log.some((call) => call.toolName === "application-redeploy"));
  const guardian = result.guardian as Record<string, unknown>;
  assert.equal(guardian.available, false);
  assert.equal((result.upstream as Record<string, unknown>).primitive, "guardian-core-load");
});

test("DG01R D GOVERNED EXECUTION: approved change goes through executeGuardianIntent and keeps the existing outcome semantics", async () => {
  const log: VpsTransportCall[] = [];
  const result = await run(fakeTransport({ handlers: healthyPostHandlers(), log }), { action: "redeploy_application", target: { applicationId: "app-1" }, execute: true, approval: { approved: true } });
  assert.equal(result.outcome, "EXECUTED_HEALTHY");
  assert.equal(result.executed, true);
  assert.equal(result.mode, "execute");
  assert.equal(result.primitive, "application-redeploy");
  const guardian = result.guardian as Record<string, unknown>;
  assert.equal(guardian.outcome, "INDETERMINATE"); // honest boundary truth; Phase 6 adjudicates the outcome
  assert.equal((guardian.effect as Record<string, unknown>).dispatched, true);
  assert.equal((guardian.effect as Record<string, unknown>).state, "UNDETERMINED");
  assert.equal(mutatingCalls(log).length, 1);
  assert.equal(mutatingCalls(log)[0].toolName, "application-redeploy");
  assert.equal((result.validation as Record<string, unknown>).externalHealth, "unknown");
});

test("DG01R E DISPATCH RE-PROOF fail-closed: revalidation read failure -> boundary never reached, zero mutation", async () => {
  const log: VpsTransportCall[] = [];
  const handlers = defaultHandlers();
  let deploymentReads = 0;
  handlers["deployment-all"] = () => {
    deploymentReads += 1;
    if (deploymentReads === 1) return [deployment()];
    // dispatch-time re-validation read fails; the throw is caught by the
    // adapter's fail-closed re-proof (zero mutation)
    throw new Error("FAKE_REPROOF_READ_FAILURE");
  };
  const result = await run(fakeTransport({ handlers, log }), { action: "redeploy_application", target: { applicationId: "app-1" }, execute: true, approval: { approved: true } });
  assert.equal(result.outcome, "UPSTREAM_ERROR");
  assert.equal(result.ok, false);
  assert.equal(result.executed, false);
  const guardian = result.guardian as Record<string, unknown>;
  assert.equal(guardian.outcome, "INDETERMINATE");
  assert.equal((guardian.effect as Record<string, unknown>).dispatched, false);
  assert.equal((guardian.reasons as string[])[0], "REVALIDATION_READ_FAILED");
  assert.equal((result.upstream as Record<string, unknown>).phase, "change-revalidation");
  assert.equal((result.upstream as Record<string, unknown>).primitive, "deployment-all");
  assert.equal(mutatingCalls(log).length, 0);
  assert.ok(!log.some((call) => call.toolName === "application-redeploy"));
});
