import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guardianInputSchema, runVpsGuardian, type VpsGuardianDeps } from "../src/vpsGuardian.ts";

// Fakes only: zero network, zero release runner, zero Dokploy transport.
// Shape mirrors the real contracts (runVpsDoctor / runVpsReconcile / runVpsRecover).

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
  expected: { toolCount: 51, catalogVersion: "eng-mcp-tools-v51" },
  actual: { container: null, catalog: { catalogHash: "h51", catalogVersion: "eng-mcp-tools-v51", toolCount: 51 } },
  findings: [] as unknown[],
  mutationPerformed: false,
  ...over,
});

const recoverPlanResult = (over: Record<string, unknown> = {}) => ({
  status: "PLAN",
  mutationPerformed: false,
  precheck: { reconcile: { status: "DRIFTED", findings: [] }, lkgPresent: true, jobInProgress: false, blockers: [] },
  plan: { action: "rollback", possible: true, requires: ["execute=true", "approval.approved=true"] },
  findings: [] as unknown[],
  ...over,
});

const recoverBlockedResult = (blockers: string[] = ["LKG_MISSING"]) => ({
  status: "BLOCKED",
  mutationPerformed: false,
  precheck: { reconcile: { status: "DRIFTED", findings: [] }, lkgPresent: false, jobInProgress: false, blockers },
  plan: { action: "rollback", possible: false, requires: ["execute=true", "approval.approved=true"] },
  findings: [] as unknown[],
});

const run = (over: VpsGuardianDeps = {}) => runVpsGuardian({}, over);
const runWith = (input: unknown, over: VpsGuardianDeps = {}) => runVpsGuardian(input, over);

// Stateful fake helper: doctor/reconcile fakes that switch results between the live
// pass and the post-validation pass.
const sequential = <T,>(results: T[]) => {
  let index = 0;
  return async (): Promise<T> => results[Math.min(index++, results.length - 1)];
};

// Execution-time result fakes (shape mirrors runVpsRecover / runVpsChangeSafe).
const recoverExecutedResult = (over: Record<string, unknown> = {}) => ({
  status: "RECOVERED",
  mutationPerformed: true,
  precheck: { reconcile: { status: "DRIFTED", findings: [] }, lkgPresent: true, jobInProgress: false, blockers: [] },
  plan: { action: "rollback", possible: true, requires: [] },
  execution: { accepted: true, jobId: "job-recovered", status: "success" },
  jobId: "job-recovered",
  validation: { smoke: "PASS", reconcile: "IN_SYNC", catalog: { catalogHash: "h52", catalogVersion: "eng-mcp-tools-v52", toolCount: 52 } },
  findings: [] as unknown[],
  ...over,
});

const recoverPendingResult = (over: Record<string, unknown> = {}) => ({
  status: "UNKNOWN",
  mutationPerformed: true,
  precheck: { reconcile: { status: "DRIFTED", findings: [] }, lkgPresent: true, jobInProgress: false, blockers: [] },
  plan: { action: "rollback", possible: true, requires: [] },
  execution: { accepted: true, jobId: "job-pending", status: "queued" },
  pending: true,
  jobId: "job-pending",
  nextAction: "Official rollback job job-pending is pending in the durable runner.",
  findings: [{ code: "JOB_STATUS_UNAVAILABLE", severity: "warning" }] as unknown[],
  ...over,
});

const recoverFailedResult = (over: Record<string, unknown> = {}) => ({
  status: "NOT_RECOVERED",
  mutationPerformed: true,
  precheck: { reconcile: { status: "DRIFTED", findings: [] }, lkgPresent: true, jobInProgress: false, blockers: [] },
  plan: { action: "rollback", possible: true, requires: [] },
  execution: { accepted: true, jobId: "job-failed", status: "failed" },
  jobId: "job-failed",
  validation: { smoke: "FAIL", reconcile: "DRIFTED", catalog: null },
  findings: [{ code: "VALIDATION_FAILED", severity: "critical" }] as unknown[],
  ...over,
});

const changeSafeExecutedResult = (over: Record<string, unknown> = {}) => ({
  ok: true,
  mode: "execute",
  action: "redeploy_application",
  executed: true,
  mutation: { attempted: true, occurred: true, ok: true, transport: "fake", status: 200, durationMs: 5 },
  validation: { application: { id: "app-123" }, deployment: null, monitoring: null, externalHealth: "unknown", checks: [] },
  outcome: "EXECUTED_HEALTHY",
  outcomeReason: "newest post-mutation deployment status='done' classified success",
  rollback: { available: false, performed: false },
  ...over,
});

const finding = (code: string, severity = "warning") => ({ code, severity, evidence: code });

describe("engineering.vps.guardian (MVP, read-only composition)", () => {
  it("01 - HEALTHY + IN_SYNC -> HEALTHY / NONE", async () => {
    const result = await run({
      runDoctor: async () => doctorResult(),
      runReconcile: async () => reconcileResult(),
      runRecover: async () => { throw new Error("recover must not be called"); },
    });
    assert.equal(result.status, "HEALTHY");
    assert.equal(result.recommendedAction, "NONE");
    assert.equal(result.health, "HEALTHY");
    assert.equal(result.drift, "IN_SYNC");
  });

  it("02 - DEGRADED + DEPLOYMENT_FAILED + IN_SYNC -> CHANGE_SAFE (recomendação, nunca executa change.safe)", async () => {
    const result = await run({
      runDoctor: async () => doctorResult({ status: "DEGRADED", findings: [finding("DEPLOYMENT_FAILED")] }),
      runReconcile: async () => reconcileResult(),
      runRecover: async () => { throw new Error("recover must not be called"); },
    });
    assert.equal(result.status, "DEGRADED");
    assert.equal(result.recommendedAction, "CHANGE_SAFE");
    assert.match(String(result.recommendedNextAction), /engineering\.vps\.change\.safe/);
    assert.match(String(result.recommendedNextAction), /applicationId/);
  });

  it("03 - DEGRADED + finding não-app (SERVER_STATUS_NOT_ACTIVE) -> INVESTIGATE", async () => {
    const result = await run({
      runDoctor: async () => doctorResult({ status: "DEGRADED", findings: [finding("SERVER_STATUS_NOT_ACTIVE")] }),
      runReconcile: async () => reconcileResult(),
    });
    assert.equal(result.status, "DEGRADED");
    assert.equal(result.recommendedAction, "INVESTIGATE");
  });

  it("04 - CRITICAL -> INVESTIGATE e recover NÃO chamado", async () => {
    let recoverCalls = 0;
    const result = await run({
      runDoctor: async () => doctorResult({ status: "CRITICAL", findings: [finding("NODE_NOT_READY", "critical")] }),
      runReconcile: async () => reconcileResult(),
      runRecover: async () => { recoverCalls += 1; return recoverPlanResult(); },
    });
    assert.equal(result.status, "CRITICAL");
    assert.equal(result.recommendedAction, "INVESTIGATE");
    assert.equal(recoverCalls, 0);
    assert.equal("recover" in (result.evidence as object), false);
  });

  it("05 - DRIFTED + recover PLAN possible=true -> RECOVER (ponteiro para engineering.vps.recover)", async () => {
    let recoverInput: unknown = "not-called";
    const result = await run({
      runDoctor: async () => doctorResult(),
      runReconcile: async () => reconcileResult({ status: "DRIFTED" }),
      runRecover: async (input) => { recoverInput = input; return recoverPlanResult(); },
    });
    assert.equal(result.status, "DRIFTED");
    assert.equal(result.recommendedAction, "RECOVER");
    assert.match(String(result.recommendedNextAction), /engineering\.vps\.recover/);
    assert.deepEqual(recoverInput, {});
  });

  it("06 - DRIFTED + recover BLOCKED LKG_MISSING -> BLOCKED com blocker exposto", async () => {
    const result = await run({
      runDoctor: async () => doctorResult(),
      runReconcile: async () => reconcileResult({ status: "DRIFTED" }),
      runRecover: async () => recoverBlockedResult(["LKG_MISSING"]),
    });
    assert.equal(result.status, "DRIFTED");
    assert.equal(result.recommendedAction, "BLOCKED");
    assert.match(String(result.reason), /LKG_MISSING/);
  });

  it("07 - reconcile UNKNOWN -> UNKNOWN/BLOCKED e recover NÃO chamado", async () => {
    let recoverCalls = 0;
    const result = await run({
      runDoctor: async () => doctorResult(),
      runReconcile: async () => reconcileResult({ status: "UNKNOWN", actual: { container: null, catalog: null } }),
      runRecover: async () => { recoverCalls += 1; return recoverPlanResult(); },
    });
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.recommendedAction, "BLOCKED");
    assert.equal(recoverCalls, 0);
  });

  it("08 - doctor UNKNOWN (UPSTREAM_ERROR) -> UNKNOWN/BLOCKED mas reconcile AINDA executa", async () => {
    let reconcileCalls = 0;
    const result = await run({
      runDoctor: async () => doctorResult({ ok: false, outcome: "UPSTREAM_ERROR", status: "UNKNOWN" }),
      runReconcile: async () => { reconcileCalls += 1; return reconcileResult(); },
    });
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.recommendedAction, "BLOCKED");
    assert.equal(reconcileCalls, 1);
    assert.equal((result.evidence as Record<string, unknown>).reconcile !== undefined, true);
  });

  it("09 - doctor TARGET_AMBIGUOUS (status UNKNOWN) -> UNKNOWN/BLOCKED", async () => {
    const result = await run({
      runDoctor: async () => doctorResult({ ok: false, outcome: "TARGET_AMBIGUOUS", status: "UNKNOWN" }),
      runReconcile: async () => reconcileResult(),
    });
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.recommendedAction, "BLOCKED");
  });

  it("10 - INVARIANTE: recover recebe EXATAMENTE {} (nunca execute/approval) e só em DRIFTED", async () => {
    const inputs: unknown[] = [];
    const drifted = await run({
      runDoctor: async () => doctorResult(),
      runReconcile: async () => reconcileResult({ status: "DRIFTED" }),
      runRecover: async (input) => { inputs.push(input); return recoverPlanResult(); },
    });
    assert.equal(drifted.recommendedAction, "RECOVER");
    const healthy = await run({
      runDoctor: async () => doctorResult(),
      runReconcile: async () => reconcileResult(),
      runRecover: async (input) => { inputs.push(input); return recoverPlanResult(); },
    });
    assert.equal(healthy.recommendedAction, "NONE");
    assert.equal(inputs.length, 1);
    assert.deepEqual(inputs[0], {});
    assert.equal(Object.keys(inputs[0] as object).length, 0);
  });

  it("11 - input público estrito: {}, execute e approval ok; alvo/operação/chave arbitrária rejeitados", () => {
    assert.deepEqual(guardianInputSchema.parse({}), {});
    assert.deepEqual(guardianInputSchema.parse({ execute: true }), { execute: true });
    assert.deepEqual(guardianInputSchema.parse({ approval: { approved: true } }), { approval: { approved: true } });
    assert.deepEqual(guardianInputSchema.parse({ execute: false, approval: { approved: false } }), { execute: false, approval: { approved: false } });
    assert.throws(() => guardianInputSchema.parse({ target: "x" }));
    assert.throws(() => guardianInputSchema.parse({ applicationId: "x" }));
    assert.throws(() => guardianInputSchema.parse({ operation: "rollback" }));
    assert.throws(() => guardianInputSchema.parse({ action: "redeploy_application" }));
    assert.throws(() => guardianInputSchema.parse({ approval: { approved: "yes" } }));
    assert.throws(() => guardianInputSchema.parse({ execute: "true" }));
    assert.throws(() => guardianInputSchema.parse({ arbitrary: 1 }));
  });

  it("12 - mutationPerformed=false em TODOS os caminhos", async () => {
    const paths = await Promise.all([
      run({ runDoctor: async () => doctorResult(), runReconcile: async () => reconcileResult() }),
      run({ runDoctor: async () => doctorResult({ status: "DEGRADED", findings: [finding("QUEUE_PENDING")] }), runReconcile: async () => reconcileResult() }),
      run({ runDoctor: async () => doctorResult({ status: "CRITICAL" }), runReconcile: async () => reconcileResult() }),
      run({ runDoctor: async () => doctorResult(), runReconcile: async () => reconcileResult({ status: "DRIFTED" }), runRecover: async () => recoverPlanResult() }),
      run({ runDoctor: async () => doctorResult(), runReconcile: async () => reconcileResult({ status: "DRIFTED" }), runRecover: async () => recoverBlockedResult() }),
      run({ runDoctor: async () => doctorResult({ status: "UNKNOWN" }), runReconcile: async () => reconcileResult({ status: "UNKNOWN" }) }),
    ]);
    for (const result of paths) assert.equal(result.mutationPerformed, false);
    assert.equal((paths[3] as Record<string, unknown>).mode, "read-only");
  });

  it("13 - guarda: DEGRADED + finding app mas doctor não DIAGNOSED -> INVESTIGATE", async () => {
    const result = await run({
      runDoctor: async () => doctorResult({ status: "DEGRADED", outcome: "UPSTREAM_ERROR", findings: [finding("DEPLOYMENT_FAILED")] }),
      runReconcile: async () => reconcileResult(),
    });
    assert.equal(result.status, "DEGRADED");
    assert.equal(result.recommendedAction, "INVESTIGATE");
  });

  it("14 - default {} continua read-only: NONE, sem execution/validation, mutationPerformed=false", async () => {
    const result = await run({
      runDoctor: async () => doctorResult(),
      runReconcile: async () => reconcileResult(),
      runRecover: async () => { throw new Error("recover must not be called"); },
      runChangeSafe: async () => { throw new Error("change.safe must not be called"); },
    });
    assert.equal(result.status, "HEALTHY");
    assert.equal(result.recommendedAction, "NONE");
    assert.equal(result.mode, "read-only");
    assert.equal(result.mutationPerformed, false);
    assert.equal("execution" in (result as object), false);
    assert.equal("validation" in (result as object), false);
  });

  it("15 - execute=false nunca muta (mesmo DRIFTED): recover só plan-mode {}", async () => {
    const recoverInputs: unknown[] = [];
    const result = await runWith({ execute: false }, {
      runDoctor: async () => doctorResult(),
      runReconcile: async () => reconcileResult({ status: "DRIFTED" }),
      runRecover: async (input) => { recoverInputs.push(input); return recoverPlanResult(); },
    });
    assert.equal(result.recommendedAction, "RECOVER");
    assert.equal(result.mode, "read-only");
    assert.equal(result.mutationPerformed, false);
    assert.deepEqual(recoverInputs, [{}]);
  });

  it("16 - approval=true sem execute não muta (default read-only)", async () => {
    const recoverInputs: unknown[] = [];
    const result = await runWith({ approval: { approved: true } }, {
      runDoctor: async () => doctorResult(),
      runReconcile: async () => reconcileResult({ status: "DRIFTED" }),
      runRecover: async (input) => { recoverInputs.push(input); return recoverPlanResult(); },
    });
    assert.equal(result.mode, "read-only");
    assert.equal(result.mutationPerformed, false);
    assert.deepEqual(recoverInputs, [{}]);
  });

  it("17 - execute=true sem approval -> BLOCKED, nenhuma mutação", async () => {
    const recoverInputs: unknown[] = [];
    const result = await runWith({ execute: true }, {
      runDoctor: async () => doctorResult(),
      runReconcile: async () => reconcileResult({ status: "DRIFTED" }),
      runRecover: async (input) => { recoverInputs.push(input); return recoverPlanResult(); },
    });
    const execution = (result as Record<string, unknown>).execution as Record<string, unknown>;
    assert.equal(execution.status, "BLOCKED");
    assert.equal(execution.authorized, false);
    assert.equal(result.mutationPerformed, false);
    assert.deepEqual(recoverInputs, [{}]); // apenas o plan-mode da classificação
    assert.equal("validation" in (result as object), false);
  });

  it("18 - execute+approval + RECOVER -> executa Recover exatamente uma vez", async () => {
    const recoverInputs: unknown[] = [];
    let changeSafeCalls = 0;
    const result = await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: async () => doctorResult(),
      runReconcile: async () => reconcileResult({ status: "DRIFTED" }),
      runRecover: async (input) => {
        recoverInputs.push(input);
        return recoverInputs.length === 1 ? recoverPlanResult() : recoverExecutedResult();
      },
      runChangeSafe: async () => { changeSafeCalls += 1; return changeSafeExecutedResult(); },
    });
    const execution = (result as Record<string, unknown>).execution as Record<string, unknown>;
    assert.equal(recoverInputs.length, 2); // plan-mode {} + execução única
    assert.equal(execution.status, "PERFORMED");
    assert.equal(execution.performed, true);
    assert.equal(result.mutationPerformed, true);
    assert.equal(changeSafeCalls, 0);
  });

  it("19 - Recover de execução recebe EXATAMENTE {execute:true, approval:{approved:true}}", async () => {
    const recoverInputs: unknown[] = [];
    await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: async () => doctorResult(),
      runReconcile: async () => reconcileResult({ status: "DRIFTED" }),
      runRecover: async (input) => {
        recoverInputs.push(input);
        return recoverInputs.length === 1 ? recoverPlanResult() : recoverExecutedResult();
      },
    });
    assert.equal(recoverInputs.length, 2);
    assert.deepEqual(recoverInputs[1], { execute: true, approval: { approved: true } });
    const keys = Object.keys(recoverInputs[1] as object).sort();
    assert.deepEqual(keys, ["approval", "execute"]);
  });

  it("20 - RECOVER pending (202/queued) NÃO vira sucesso final", async () => {
    const result = await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: async () => doctorResult(),
      runReconcile: sequential([reconcileResult({ status: "DRIFTED" }), reconcileResult({ status: "DRIFTED" })]),
      runRecover: async (input) => (input && typeof input === "object" && "execute" in (input as object)) ? recoverPendingResult() : recoverPlanResult(),
    });
    assert.equal(result.status, "DRIFTED"); // classificação preservada
    const execution = (result as Record<string, unknown>).execution as Record<string, unknown>;
    assert.equal(execution.status, "PENDING");
    assert.equal(execution.success, false);
    const validation = (result as Record<string, unknown>).validation as Record<string, unknown>;
    assert.equal(validation.converged, false);
    assert.equal(result.mutationPerformed, true); // rollback job aceito = mutação real iniciada (espelha a Recover)
  });

  it("21 - RECOVER sucesso + pós-validação saudável -> sucesso final", async () => {
    const result = await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: sequential([doctorResult(), doctorResult()]),
      runReconcile: sequential([reconcileResult({ status: "DRIFTED" }), reconcileResult()]),
      runRecover: async (input) => (input && typeof input === "object" && "execute" in (input as object)) ? recoverExecutedResult() : recoverPlanResult(),
    });
    const execution = (result as Record<string, unknown>).execution as Record<string, unknown>;
    assert.equal(execution.status, "PERFORMED");
    assert.equal(execution.success, true);
    const validation = (result as Record<string, unknown>).validation as Record<string, unknown>;
    assert.equal(validation.converged, true);
    assert.equal(validation.status, "HEALTHY");
    assert.equal(result.mutationPerformed, true);
  });

  it("22 - RECOVER falha (NOT_RECOVERED) -> erro exposto, converged=false", async () => {
    const result = await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: sequential([doctorResult(), doctorResult()]),
      runReconcile: sequential([reconcileResult({ status: "DRIFTED" }), reconcileResult({ status: "DRIFTED" })]),
      runRecover: async (input) => (input && typeof input === "object" && "execute" in (input as object)) ? recoverFailedResult() : recoverPlanResult(),
    });
    const execution = (result as Record<string, unknown>).execution as Record<string, unknown>;
    assert.equal(execution.status, "FAILED");
    const recoverResult = execution.result as Record<string, unknown>;
    assert.ok(Array.isArray(recoverResult.findings) && recoverResult.findings.length > 0); // erro não escondido
    const validation = (result as Record<string, unknown>).validation as Record<string, unknown>;
    assert.equal(validation.converged, false);
    assert.equal(result.mutationPerformed, true); // espelha a Recover (job aceito)
  });

  it("23 - CHANGE_SAFE recomendada mas sem applicationId confiável -> BLOCKED", async () => {
    let changeSafeCalls = 0;
    const result = await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: async () => doctorResult({ status: "DEGRADED", findings: [finding("DEPLOYMENT_FAILED")] }), // application: null
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

  it("24 - CHANGE_SAFE com applicationId do doctor -> chama change.safe exatamente uma vez", async () => {
    let changeSafeCalls = 0;
    const result = await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: sequential([
        doctorResult({ status: "DEGRADED", findings: [finding("DEPLOYMENT_FAILED")], application: { id: "app-123", name: "api", status: "running" } }),
        doctorResult({ status: "DEGRADED", findings: [finding("DEPLOYMENT_FAILED")], application: { id: "app-123", name: "api", status: "running" } }),
      ]),
      runReconcile: async () => reconcileResult(),
      runChangeSafe: async () => { changeSafeCalls += 1; return changeSafeExecutedResult(); },
    });
    const execution = (result as Record<string, unknown>).execution as Record<string, unknown>;
    assert.equal(changeSafeCalls, 1);
    assert.equal(execution.status, "PERFORMED");
    assert.equal(execution.performed, true);
    assert.equal(execution.success, true);
    assert.equal(result.mutationPerformed, true);
  });

  it("25 - change.safe recebe action hardcoded 'redeploy_application' + target só com o applicationId do doctor", async () => {
    const changeSafeInputs: unknown[] = [];
    await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: async () => doctorResult({ status: "DEGRADED", findings: [finding("DEPLOYMENT_FAILED")], application: { id: "app-123", name: "api", status: "running" } }),
      runReconcile: async () => reconcileResult(),
      runChangeSafe: async (input) => { changeSafeInputs.push(input); return changeSafeExecutedResult(); },
    });
    assert.equal(changeSafeInputs.length, 1);
    assert.deepEqual(changeSafeInputs[0], { action: "redeploy_application", target: { applicationId: "app-123" }, execute: true, approval: { approved: true } });
  });

  it("26 - NONE + execute=true + approval -> nenhuma mutação", async () => {
    let recoverCalls = 0;
    let changeSafeCalls = 0;
    const result = await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: async () => doctorResult(),
      runReconcile: async () => reconcileResult(),
      runRecover: async () => { recoverCalls += 1; return recoverPlanResult(); },
      runChangeSafe: async () => { changeSafeCalls += 1; return changeSafeExecutedResult(); },
    });
    const execution = (result as Record<string, unknown>).execution as Record<string, unknown>;
    assert.equal(result.recommendedAction, "NONE");
    assert.equal(execution.status, "BLOCKED");
    assert.equal(recoverCalls, 0);
    assert.equal(changeSafeCalls, 0);
    assert.equal(result.mutationPerformed, false);
  });

  it("27 - INVESTIGATE (CRITICAL) + execute=true -> nenhuma mutação", async () => {
    const result = await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: async () => doctorResult({ status: "CRITICAL", findings: [finding("NODE_NOT_READY", "critical")] }),
      runReconcile: async () => reconcileResult(),
    });
    const execution = (result as Record<string, unknown>).execution as Record<string, unknown>;
    assert.equal(result.recommendedAction, "INVESTIGATE");
    assert.equal(execution.status, "BLOCKED");
    assert.equal(result.mutationPerformed, false);
  });

  it("28 - UNKNOWN/BLOCKED + execute=true -> nenhuma mutação", async () => {
    const result = await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: async () => doctorResult({ status: "UNKNOWN" }),
      runReconcile: async () => reconcileResult({ status: "UNKNOWN", actual: { container: null, catalog: null } }),
    });
    const execution = (result as Record<string, unknown>).execution as Record<string, unknown>;
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.recommendedAction, "BLOCKED");
    assert.equal(execution.status, "BLOCKED");
    assert.equal(result.mutationPerformed, false);
  });

  it("29 - input arbitrário rejeitado em runtime", async () => {
    await assert.rejects(() => runWith({ arbitrary: 1 }, {}));
    await assert.rejects(() => runWith({ target: "x" }, {}));
    await assert.rejects(() => runWith({ applicationId: "x" }, {}));
  });

  it("30 - mutationPerformed exato em todos os caminhos", async () => {
    const defaultHealthy = await run({ runDoctor: async () => doctorResult(), runReconcile: async () => reconcileResult() });
    const driftedPlan = await run({ runDoctor: async () => doctorResult(), runReconcile: async () => reconcileResult({ status: "DRIFTED" }), runRecover: async () => recoverPlanResult() });
    const withoutApproval = await runWith({ execute: true }, { runDoctor: async () => doctorResult(), runReconcile: async () => reconcileResult({ status: "DRIFTED" }), runRecover: async () => recoverPlanResult() });
    const recoverExecuted = await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: sequential([doctorResult(), doctorResult()]),
      runReconcile: sequential([reconcileResult({ status: "DRIFTED" }), reconcileResult()]),
      runRecover: async (input) => (input && typeof input === "object" && "execute" in (input as object)) ? recoverExecutedResult() : recoverPlanResult(),
    });
    const changeSafeExecuted = await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: sequential([
        doctorResult({ status: "DEGRADED", findings: [finding("DEPLOYMENT_FAILED")], application: { id: "app-123", name: "api", status: "running" } }),
        doctorResult({ status: "DEGRADED", findings: [finding("DEPLOYMENT_FAILED")], application: { id: "app-123", name: "api", status: "running" } }),
      ]),
      runReconcile: async () => reconcileResult(),
      runChangeSafe: async () => changeSafeExecutedResult(),
    });
    const changeSafeBlocked = await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: async () => doctorResult({ status: "DEGRADED", findings: [finding("DEPLOYMENT_FAILED")] }),
      runReconcile: async () => reconcileResult(),
    });
    assert.equal(defaultHealthy.mutationPerformed, false);
    assert.equal(driftedPlan.mutationPerformed, false);
    assert.equal(withoutApproval.mutationPerformed, false);
    assert.equal(recoverExecuted.mutationPerformed, true);
    assert.equal(changeSafeExecuted.mutationPerformed, true);
    assert.equal(changeSafeBlocked.mutationPerformed, false);
  });

  it("31 - Guardian nunca executa Recover e change.safe na mesma execução", async () => {
    let recoverExecCalls = 0;
    let changeSafeCalls = 0;
    await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: async () => doctorResult(),
      runReconcile: async () => reconcileResult({ status: "DRIFTED" }),
      runRecover: async (input) => {
        const isExecution = input && typeof input === "object" && "execute" in (input as object);
        if (isExecution) recoverExecCalls += 1;
        return isExecution ? recoverExecutedResult() : recoverPlanResult();
      },
      runChangeSafe: async () => { changeSafeCalls += 1; return changeSafeExecutedResult(); },
    });
    assert.equal(recoverExecCalls, 1);
    assert.equal(changeSafeCalls, 0);
    await runWith({ execute: true, approval: { approved: true } }, {
      runDoctor: async () => doctorResult({ status: "DEGRADED", findings: [finding("DEPLOYMENT_FAILED")], application: { id: "app-123", name: "api", status: "running" } }),
      runReconcile: async () => reconcileResult(),
      runRecover: async (input) => {
        const isExecution = input && typeof input === "object" && "execute" in (input as object);
        if (isExecution) recoverExecCalls += 1;
        return isExecution ? recoverExecutedResult() : recoverPlanResult();
      },
      runChangeSafe: async () => { changeSafeCalls += 1; return changeSafeExecutedResult(); },
    });
    assert.equal(recoverExecCalls, 1); // inalterado: recover não executado de novo
    assert.equal(changeSafeCalls, 1);
  });
});
