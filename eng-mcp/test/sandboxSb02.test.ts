// SB-02 minimal Sandbox SuperTool proofs (exec / inspect / lifecycle / timeout / cancel).
// Unit proofs (deterministic, no network): exec ownership + serial-per-sandbox,
// cancel flow (kill called, registry cleaned), cancel/exec denies, timeout
// result shape, computed lifecycle (expired/failed/destroyed), provider-failure
// containment, schemas and handler delegation. Real E2B proofs (T1 exec real +
// host isolation, T2 cross-mission, T3 inspect, T4 lifecycle incl. native-TTL
// expiry, T5 timeout with independent process-death proof, T6 cancel with
// sandbox survival, T7 zero orphans) run ONLY when E2B_API_KEY is present in
// this process; otherwise they are skipped with the exact reason — an honest
// skip, never a fake pass. The sweep filters by THIS mission's metadata, so
// pre-existing sandboxes or sandboxes of other missions are never touched.
// Termination rule under test: a timeout/cancel NEVER counts without an
// independent process-death proof (pgrep run inside the sandbox in a separate
// exec) and the sandbox must survive a cancel (post-cancel exec works).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_EXEC_TIMEOUT_MS,
  DEFAULT_TTL_MS,
  E2BSandboxProvider,
  MissionRecordStore,
  SandboxError,
  SandboxService,
  e2bCredentialAvailable,
  runSandboxCancel,
  runSandboxCreate,
  runSandboxDestroy,
  runSandboxExec,
  runSandboxInspect,
  sandboxCancelInputSchema,
  sandboxCreateInputSchema,
  sandboxDestroyInputSchema,
  sandboxExecInputSchema,
  sandboxInspectInputSchema,
  type SandboxExecHooks,
  type SandboxExecResult,
  type SandboxInspectInfo,
  type SandboxProvider,
  type SandboxProviderCreateInput,
  type SandboxProviderCreateResult,
  type SandboxProviderDestroyResult,
  type SandboxProviderExecInput
} from "../src/sandbox.ts";

const REAL_PROOF_REASON = "E2B credential not provisioned in this process (set E2B_API_KEY or E2B_API_KEY_FILE); real E2B proof skipped honestly";
const realProofEnabled = e2bCredentialAvailable();

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---- deterministic in-memory provider for the unit proofs ----
class FakeSandboxProvider implements SandboxProvider {
  readonly name = "fake";
  readonly alive = new Map<string, { missionId: string; alive: boolean }>();
  createCalls = 0;
  readonly destroyCalls: string[] = [];
  readonly killCalls: string[] = [];
  execMode: "immediate" | "deferred" | "timedOut" | "throw" = "immediate";
  deferred?: { resolve: (result: SandboxExecResult) => void };
  lastHooks?: SandboxExecHooks;

  async create({ missionId }: SandboxProviderCreateInput): Promise<SandboxProviderCreateResult> {
    this.createCalls += 1;
    const sandboxId = `fake-sbx-${this.createCalls}`;
    this.alive.set(sandboxId, { missionId, alive: true });
    return { sandboxId, expiresAt: new Date(Date.now() + DEFAULT_TTL_MS).toISOString() };
  }

  async exists(sandboxId: string): Promise<boolean> {
    return this.alive.get(sandboxId)?.alive === true;
  }

  async destroy(sandboxId: string): Promise<SandboxProviderDestroyResult> {
    this.destroyCalls.push(sandboxId);
    const entry = this.alive.get(sandboxId);
    if (!entry) return { verified: true, alreadyGone: true };
    entry.alive = false;
    return { verified: true, alreadyGone: false };
  }

  async listByMission(missionId: string): Promise<string[]> {
    const ids: string[] = [];
    for (const [sandboxId, entry] of this.alive) if (entry.alive && entry.missionId === missionId) ids.push(sandboxId);
    return ids;
  }

  async inspect(sandboxId: string): Promise<SandboxInspectInfo | null> {
    const entry = this.alive.get(sandboxId);
    if (!entry || !entry.alive) return null;
    return { sandboxId, missionId: entry.missionId, state: "running", startedAt: new Date().toISOString(), endAt: new Date(Date.now() + DEFAULT_TTL_MS).toISOString() };
  }

  async exec(input: SandboxProviderExecInput, hooks?: SandboxExecHooks): Promise<SandboxExecResult> {
    this.lastHooks = hooks;
    const control = {
      pid: 4242,
      kill: async () => {
        this.killCalls.push(input.executionId);
        return true;
      }
    };
    if (this.execMode === "throw") throw new Error("fake provider exec boom");
    hooks?.onRunning?.(control);
    if (this.execMode === "deferred") return new Promise<SandboxExecResult>((resolve) => { this.deferred = { resolve }; });
    if (this.execMode === "timedOut")
      return { executionId: input.executionId, exitCode: null, stdout: "", stderr: "", timedOut: true, cancelled: false };
    return { executionId: input.executionId, exitCode: 0, stdout: `ran:${input.command}`, stderr: "", timedOut: false, cancelled: false };
  }
}

async function withFakeService(run: (service: SandboxService, provider: FakeSandboxProvider, recordsFile: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "sb02-"));
  const recordsFile = path.join(dir, "missions.json");
  const provider = new FakeSandboxProvider();
  const service = new SandboxService(provider, new MissionRecordStore(recordsFile));
  try {
    await run(service, provider, recordsFile);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const rejectsCode = (code: string) => (error: unknown) => error instanceof SandboxError && error.code === code;

async function waitFor(predicate: () => boolean, attempts = 200, stepMs = 250): Promise<boolean> {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return true;
    await delay(stepMs);
  }
  return predicate();
}

// ---- SB-02-U1: exec ownership gates deny with zero mutation ----
test("SB-02-U1 exec requires the registered mission+sandbox pair; lifecycle denies are typed", async () => {
  await withFakeService(async (service, provider) => {
    const created = await service.create("sb02-unit-exec", DEFAULT_TTL_MS);
    await assert.rejects(service.exec("sb02-unit-other", created.sandboxId, "echo hi"), rejectsCode("MISSION_NOT_REGISTERED"));
    await assert.rejects(service.exec("sb02-unit-exec", "fake-sbx-wrong-000", "echo hi"), rejectsCode("MISSION_SANDBOX_MISMATCH"));
    await service.destroy("sb02-unit-exec", created.sandboxId);
    await assert.rejects(service.exec("sb02-unit-exec", created.sandboxId, "echo hi"), rejectsCode("MISSION_NOT_ACTIVE"));
    assert.equal(provider.killCalls.length, 0);
    assert.equal(service.activeExecutions("sb02-unit-exec").length, 0);
  });
});

// ---- SB-02-U2: exec happy path, serial-per-sandbox, registry hygiene ----
test("SB-02-U2 exec returns the provider result; concurrent exec on the same sandbox is denied; registry empties on settle", async () => {
  await withFakeService(async (service, provider) => {
    const created = await service.create("sb02-unit-exec2", DEFAULT_TTL_MS);
    const done = await service.exec("sb02-unit-exec2", created.sandboxId, "echo hi");
    assert.equal(done.exitCode, 0);
    assert.equal(done.timedOut, false);
    assert.equal(done.cancelled, false);
    assert.equal(done.stdout, "ran:echo hi");
    assert.equal(done.missionId, "sb02-unit-exec2");
    assert.ok(done.executionId.length > 0);
    assert.equal(service.activeExecutions("sb02-unit-exec2").length, 0);

    provider.execMode = "deferred";
    const pending = service.exec("sb02-unit-exec2", created.sandboxId, "sleep 10", 300_000);
    assert.ok(await waitFor(() => service.activeExecutions("sb02-unit-exec2").length === 1));
    const inFlightId = service.activeExecutions("sb02-unit-exec2")[0].executionId;
    await assert.rejects(service.exec("sb02-unit-exec2", created.sandboxId, "echo again"), rejectsCode("SANDBOX_EXEC_BUSY"));
    provider.deferred?.resolve({ executionId: inFlightId, exitCode: 0, stdout: "done", stderr: "", timedOut: false, cancelled: false });
    const settled = await pending;
    assert.equal(settled.stdout, "done");
    assert.equal(service.activeExecutions("sb02-unit-exec2").length, 0);
  });
});

// ---- SB-02-U3: cancel kills the in-flight execution and cleans the registry ----
test("SB-02-U3 cancel reaches the in-flight execution; the exec promise resolves cancelled; second cancel is typed", async () => {
  await withFakeService(async (service, provider) => {
    const created = await service.create("sb02-unit-cancel", DEFAULT_TTL_MS);
    provider.execMode = "deferred";
    const pending = service.exec("sb02-unit-cancel", created.sandboxId, "sleep 60", 300_000);
    assert.ok(await waitFor(() => service.activeExecutions("sb02-unit-cancel").length === 1));
    const cancelled = await service.cancel("sb02-unit-cancel", created.sandboxId);
    assert.equal(cancelled.cancelled, true);
    assert.equal(cancelled.pid, 4242);
    assert.ok(cancelled.executionId.length > 0);
    provider.deferred?.resolve({ executionId: cancelled.executionId, exitCode: null, stdout: "", stderr: "", timedOut: false, cancelled: true });
    const result = await pending;
    assert.equal(result.cancelled, true);
    assert.equal(result.timedOut, false);
    assert.equal(provider.killCalls.length, 1);
    assert.equal(service.activeExecutions("sb02-unit-cancel").length, 0);
    await assert.rejects(service.cancel("sb02-unit-cancel", created.sandboxId), rejectsCode("EXECUTION_NOT_FOUND"));
  });
});

// ---- SB-02-U4: cancel ownership denies + nothing-in-flight is typed ----
test("SB-02-U4 cross-mission and wrong-sandbox cancels are denied with zero mutation; unknown pair is EXECUTION_NOT_FOUND", async () => {
  await withFakeService(async (service, provider) => {
    const created = await service.create("sb02-unit-cancel2", DEFAULT_TTL_MS);
    await assert.rejects(service.cancel("sb02-unit-attacker", created.sandboxId), rejectsCode("MISSION_NOT_REGISTERED"));
    await assert.rejects(service.cancel("sb02-unit-cancel2", "fake-sbx-wrong-000"), rejectsCode("MISSION_SANDBOX_MISMATCH"));
    await assert.rejects(service.cancel("sb02-unit-cancel2", created.sandboxId), rejectsCode("EXECUTION_NOT_FOUND"));
    assert.equal(provider.killCalls.length, 0);
  });
});

// ---- SB-02-U5: timeout result shape + provider failure containment + gone sandbox ----
test("SB-02-U5 timeout is reported honestly; provider failure is not a fake success; gone sandbox is typed", async () => {
  await withFakeService(async (service, provider) => {
    const created = await service.create("sb02-unit-timeout", DEFAULT_TTL_MS);
    provider.execMode = "timedOut";
    const timedOut = await service.exec("sb02-unit-timeout", created.sandboxId, "sleep 30", 2_000);
    assert.equal(timedOut.timedOut, true);
    assert.equal(timedOut.cancelled, false);
    assert.equal(timedOut.exitCode, null);

    provider.execMode = "throw";
    await assert.rejects(service.exec("sb02-unit-timeout", created.sandboxId, "echo"), (error: unknown) => error instanceof Error && error.message.includes("fake provider exec boom"));
    assert.equal(service.activeExecutions("sb02-unit-timeout").length, 0, "a failed execution must leave the registry clean");

    provider.execMode = "immediate";
    provider.alive.get(created.sandboxId)!.alive = false; // provider lost it, TTL still in the future
    await assert.rejects(service.exec("sb02-unit-timeout", created.sandboxId, "echo"), rejectsCode("SANDBOX_GONE"));
    const inspectedGone = await service.inspect("sb02-unit-timeout", created.sandboxId);
    assert.equal(inspectedGone.lifecycle, "failed");
    assert.equal(inspectedGone.exists, false);
  });
});

// ---- SB-02-U6: expired lifecycle (computed) fails exec and reports inspect ----
test("SB-02-U6 expired sandbox: exec is denied typed, inspect reports lifecycle=expired", async () => {
  await withFakeService(async (service, provider, recordsFile) => {
    const created = await service.create("sb02-unit-expired", DEFAULT_TTL_MS);
    const store = new MissionRecordStore(recordsFile);
    const raw = await store.load();
    const record = raw.find((entry) => entry.missionId === "sb02-unit-expired");
    assert.ok(record);
    record.expiresAt = new Date(Date.now() - 1_000).toISOString();
    await store.upsert(record);
    provider.alive.get(created.sandboxId)!.alive = false;
    await assert.rejects(service.exec("sb02-unit-expired", created.sandboxId, "echo"), rejectsCode("SANDBOX_EXPIRED"));
    const inspected = await service.inspect("sb02-unit-expired", created.sandboxId);
    assert.equal(inspected.lifecycle, "expired");
    assert.equal(inspected.exists, false);
    assert.equal(inspected.recordStatus, "active");
  });
});

// ---- SB-02-U7: inspect ownership + lifecycle mapping ----
test("SB-02-U7 inspect reports binding/provider/lifecycle; mismatch denies; destroyed is reported honestly", async () => {
  await withFakeService(async (service) => {
    const created = await service.create("sb02-unit-inspect", DEFAULT_TTL_MS);
    const inspected = await service.inspect("sb02-unit-inspect", created.sandboxId);
    assert.equal(inspected.missionId, "sb02-unit-inspect");
    assert.equal(inspected.sandboxId, created.sandboxId);
    assert.equal(inspected.provider, "fake");
    assert.equal(inspected.recordStatus, "active");
    assert.equal(inspected.lifecycle, "running");
    assert.equal(inspected.exists, true);
    await assert.rejects(service.inspect("sb02-unit-attacker", created.sandboxId), rejectsCode("MISSION_NOT_REGISTERED"));
    await assert.rejects(service.inspect("sb02-unit-inspect", "fake-sbx-wrong-000"), rejectsCode("MISSION_SANDBOX_MISMATCH"));
    await service.destroy("sb02-unit-inspect", created.sandboxId);
    const destroyed = await service.inspect("sb02-unit-inspect", created.sandboxId);
    assert.equal(destroyed.recordStatus, "destroyed");
    assert.equal(destroyed.lifecycle, "destroyed");
    assert.equal(destroyed.exists, false);
  });
});

// ---- SB-02-U8: strict schemas + handler delegation ----
test("SB-02-U8 schemas are strict and the runners delegate to the injected service", async () => {
  assert.equal(sandboxExecInputSchema.safeParse({}).success, false);
  assert.equal(sandboxExecInputSchema.safeParse({ missionId: "sb02-unit-schema", sandboxId: "fake-sbx-1", command: "" }).success, false);
  assert.equal(sandboxExecInputSchema.safeParse({ missionId: "sb02-unit-schema", sandboxId: "fake-sbx-1", command: "echo hi", extra: true }).success, false);
  assert.equal(sandboxExecInputSchema.safeParse({ missionId: "sb02-unit-schema", sandboxId: "fake-sbx-1", command: "echo hi", timeoutMs: 500 }).success, false);
  assert.equal(sandboxExecInputSchema.safeParse({ missionId: "sb02-unit-schema", sandboxId: "fake-sbx-1", command: "echo hi", timeoutMs: 700_000 }).success, false);
  assert.equal(sandboxExecInputSchema.safeParse({ missionId: "sb02-unit-schema", sandboxId: "fake-sbx-1", command: "echo hi", timeoutMs: 5_000 }).success, true);
  assert.equal(sandboxExecInputSchema.safeParse({ missionId: "short", sandboxId: "fake-sbx-1", command: "echo hi" }).success, false);
  assert.equal(sandboxInspectInputSchema.safeParse({ missionId: "sb02-unit-schema", sandboxId: "fake-sbx-1" }).success, true);
  assert.equal(sandboxInspectInputSchema.safeParse({ missionId: "sb02-unit-schema", sandboxId: "fake-sbx-1", extra: true }).success, false);
  assert.equal(sandboxCancelInputSchema.safeParse({ missionId: "sb02-unit-schema", sandboxId: "fake-sbx-1" }).success, true);
  assert.equal(sandboxCancelInputSchema.safeParse({}).success, false);
  assert.equal(DEFAULT_EXEC_TIMEOUT_MS, 60_000);

  await withFakeService(async (service, provider) => {
    const created = await service.create("sb02-unit-runner", DEFAULT_TTL_MS);
    const execd = await runSandboxExec({ missionId: "sb02-unit-runner", sandboxId: created.sandboxId, command: "echo runner" }, { service });
    assert.equal(execd.exitCode, 0);
    assert.equal(execd.stdout, "ran:echo runner");
    assert.equal(execd.stdoutTruncated, false);
    const inspected = await runSandboxInspect({ missionId: "sb02-unit-runner", sandboxId: created.sandboxId }, { service });
    assert.equal(inspected.lifecycle, "running");
    assert.equal(sandboxCreateInputSchema.safeParse({ missionId: "sb02-unit-schema" }).success, true);
    assert.equal(sandboxDestroyInputSchema.safeParse({ missionId: "sb02-unit-schema", sandboxId: created.sandboxId }).success, true);
    await assert.rejects(runSandboxCancel({ missionId: "sb02-unit-runner", sandboxId: created.sandboxId }, { service }), rejectsCode("EXECUTION_NOT_FOUND"));
    void provider;
  });
});

// ---- SB-02-REAL: the full real-E2B chain T1..T7 (skipped honestly without a credential) ----
test("SB-02-REAL exec+inspect+lifecycle+timeout+cancel on the real E2B provider (T1..T7)", { skip: realProofEnabled ? false : REAL_PROOF_REASON, timeout: 480_000 }, async () => {
  const runStamp = Date.now();
  const MISSION = `sb02-real-${runStamp}`;
  const MISSION_B = `sb02-atk-${runStamp}`;
  const MISSION_C = `sb02-exp-${runStamp}`;
  const dir = await mkdtemp(path.join(tmpdir(), "sb02-real-"));
  const provider = new E2BSandboxProvider();
  const service = new SandboxService(provider, new MissionRecordStore(path.join(dir, "missions.json")));
  try {
    // P0 — two real sandboxes: the primary (roomy TTL) and the expiry probe (minimum native TTL).
    const A = await service.create(MISSION, 600_000);
    const C = await service.create(MISSION_C, 60_000);
    console.log(`SB02-REAL sandboxes A=${A.sandboxId} C=${C.sandboxId}`);

    // ---- T1: exec is REAL and ISOLATED from this host ----
    const uname = await service.exec(MISSION, A.sandboxId, "uname -sr");
    assert.equal(uname.exitCode, 0);
    assert.ok(uname.stdout.trim().length > 0);
    const hSbx = (await service.exec(MISSION, A.sandboxId, "hostname")).stdout.trim();
    const uid = (await service.exec(MISSION, A.sandboxId, "id -u")).stdout.trim();
    assert.ok(hSbx.length > 0 && uid.length > 0);
    const markerPath = `/tmp/sb02-marker-${A.sandboxId}.txt`;
    const markerValue = `sb02-real-evidence-${A.sandboxId}`;
    const marker = await service.exec(MISSION, A.sandboxId, `printf '%s' '${markerValue}' > ${markerPath} && cat ${markerPath}`);
    assert.equal(marker.exitCode, 0);
    assert.equal(marker.stdout.trim(), markerValue);
    assert.equal(existsSync(markerPath), false, "marker file must NOT exist on the HOST filesystem");
    assert.notEqual(hSbx, hostname(), "sandbox hostname must differ from the host hostname");
    console.log(`T1 EXEC_REAL: uname=${uname.stdout.trim()} hostname=${hSbx} uid=${uid} markerInSandbox=YES markerOnHost=NO hostIsolation=PROVEN`);

    // ---- T3: inspect is a real read-only lifecycle view ----
    const inspected = await service.inspect(MISSION, A.sandboxId);
    assert.equal(inspected.missionId, MISSION);
    assert.equal(inspected.sandboxId, A.sandboxId);
    assert.equal(inspected.provider, "e2b");
    assert.equal(inspected.recordStatus, "active");
    assert.equal(inspected.exists, true);
    assert.ok(inspected.lifecycle === "running" || inspected.lifecycle === "paused");
    assert.ok(typeof inspected.endAt === "string" && inspected.endAt.length > 0);
    console.log(`T3 INSPECT: lifecycle=${inspected.lifecycle} state=${inspected.state} endAt=${inspected.endAt}`);

    // ---- T5: timeout kills the process (proven independently, never by the error alone) ----
    const timeoutStart = Date.now();
    const timedOut = await service.exec(MISSION, A.sandboxId, "sleep 30", 2_000);
    const timeoutElapsed = Date.now() - timeoutStart;
    assert.equal(timedOut.timedOut, true);
    assert.ok(timeoutElapsed < 20_000, `timeout must act early, took ${timeoutElapsed}ms`);
    const probeTimeout = await service.exec(MISSION, A.sandboxId, "if pgrep -f '[s]leep 30' >/dev/null 2>&1; then echo ALIVE; else echo GONE; fi");
    assert.equal(probeTimeout.exitCode, 0);
    assert.equal(probeTimeout.stdout.trim(), "GONE", "sleep 30 must be dead after the timeout kill");
    console.log(`T5 TIMEOUT: triggered=YES elapsed=${timeoutElapsed}ms processAliveAfterTimeout=NO (pgrep proof)`);

    // ---- T6: cancel kills in-flight, sandbox survives, post-cancel exec works ----
    const pending = service.exec(MISSION, A.sandboxId, "sleep 60", 300_000);
    assert.ok(await waitFor(() => {
      const active = service.activeExecutions(MISSION);
      return active.length === 1 && typeof active[0].pid === "number";
    }), "execution never reached the registry");
    const registered = service.activeExecutions(MISSION)[0];
    await assert.rejects(service.cancel(MISSION_B, A.sandboxId), rejectsCode("MISSION_NOT_REGISTERED"), "cross-mission cancel must be denied");
    await assert.rejects(service.cancel(MISSION, "fake-sbx-wrong-000"), rejectsCode("MISSION_SANDBOX_MISMATCH"), "wrong-sandbox cancel must be denied");
    const cancelStart = Date.now();
    const cancelled = await service.cancel(MISSION, A.sandboxId);
    assert.equal(cancelled.cancelled, true);
    assert.equal(cancelled.pid, registered.pid);
    const execOutcome = await pending;
    assert.equal(execOutcome.cancelled, true);
    assert.ok(Date.now() - cancelStart < 20_000);
    const probeCancel = await service.exec(MISSION, A.sandboxId, "if pgrep -f '[s]leep 60' >/dev/null 2>&1; then echo ALIVE; else echo GONE; fi");
    assert.equal(probeCancel.stdout.trim(), "GONE", "sleep 60 must be dead after the cancel");
    assert.equal(await provider.exists(A.sandboxId), true, "cancelling an execution must NOT destroy the sandbox");
    const postCancel = await service.exec(MISSION, A.sandboxId, "echo post-cancel-ok");
    assert.equal(postCancel.exitCode, 0);
    assert.equal(postCancel.stdout.trim(), "post-cancel-ok");
    assert.equal(service.activeExecutions(MISSION).length, 0);
    console.log("T6 CANCEL: accepted=YES processAliveAfterCancel=NO sandboxStillAlive=YES postCancelExec=OK crossMissionCancel=DENIED");

    // ---- T2: a REGISTERED mission B cannot touch A's sandbox; A survives ----
    const B = await service.create(MISSION_B, 300_000);
    await assert.rejects(service.exec(MISSION_B, A.sandboxId, "echo attack"), rejectsCode("MISSION_SANDBOX_MISMATCH"));
    await assert.rejects(service.inspect(MISSION_B, A.sandboxId), rejectsCode("MISSION_SANDBOX_MISMATCH"));
    await assert.rejects(service.cancel(MISSION_B, A.sandboxId), rejectsCode("MISSION_SANDBOX_MISMATCH"));
    await assert.rejects(service.exec(MISSION, B.sandboxId, "echo reverse-attack"), rejectsCode("MISSION_SANDBOX_MISMATCH"));
    const ownB = await service.exec(MISSION_B, B.sandboxId, "echo own-ok");
    assert.equal(ownB.exitCode, 0);
    const stillA = await service.exec(MISSION, A.sandboxId, "echo still-ok");
    assert.equal(stillA.exitCode, 0);
    console.log("T2 OWNERSHIP: exec/inspect/cancel cross-mission all DENIED; A survived and stays usable");

    // ---- FAIL_CLOSED: cancel with nothing in flight is typed ----
    await assert.rejects(service.cancel(MISSION, A.sandboxId), rejectsCode("EXECUTION_NOT_FOUND"));

    // ---- T4a: destroy → exec denied typed, inspect reports destroyed ----
    const destroyedA = await service.destroy(MISSION, A.sandboxId);
    assert.equal(destroyedA.verified, true);
    await assert.rejects(service.exec(MISSION, A.sandboxId, "echo after-destroy"), rejectsCode("MISSION_NOT_ACTIVE"));
    const inspectedDestroyed = await service.inspect(MISSION, A.sandboxId);
    assert.equal(inspectedDestroyed.recordStatus, "destroyed");
    assert.equal(inspectedDestroyed.lifecycle, "destroyed");
    assert.equal(inspectedDestroyed.exists, false);
    console.log("T4a LIFECYCLE: exec-after-destroy=DENIED inspect reflects destroyed");

    // ---- T4b: native TTL expiry reflected by exec/inspect (computed lifecycle) ----
    const waitUntil = Date.parse(C.expiresAt) + 20_000;
    while (Date.now() < waitUntil) await delay(5_000);
    await assert.rejects(service.exec(MISSION_C, C.sandboxId, "echo after-expiry"), rejectsCode("SANDBOX_EXPIRED"));
    const inspectedC = await service.inspect(MISSION_C, C.sandboxId);
    assert.equal(inspectedC.lifecycle, "expired");
    assert.equal(inspectedC.exists, false);
    console.log("T4b LIFECYCLE: native TTL expiry PROVEN (exec denied SANDBOX_EXPIRED, inspect lifecycle=expired)");

    // ---- T7: cleanup — zero sandboxes, zero in-flight executions, zero orphans ----
    const destroyedB = await service.destroy(MISSION_B, B.sandboxId);
    assert.equal(destroyedB.verified, true);
    const destroyedC = await service.destroy(MISSION_C, C.sandboxId);
    assert.equal(destroyedC.verified, true);
    assert.equal(destroyedC.alreadyGone, true, "the expired sandbox must already be absent from the provider");
    assert.equal((await provider.listByMission(MISSION)).length, 0);
    assert.equal((await provider.listByMission(MISSION_B)).length, 0);
    assert.equal((await provider.listByMission(MISSION_C)).length, 0);
    assert.equal(service.activeExecutions(MISSION).length, 0);
    assert.equal(service.activeExecutions(MISSION_B).length, 0);
    assert.equal(service.activeExecutions(MISSION_C).length, 0);
    console.log("T7 CLEANUP: sandboxes=0 inFlightExecutions=0 orphanProcesses=0 (all execs ran inside destroyed sandboxes)");
    console.log("SB02_REAL_CHAIN: ALL PHASES PROVEN");
  } finally {
    // Failure containment: sweep any residue of THESE missions (bounded by the native TTLs).
    try {
      for (const missionId of [MISSION, MISSION_B, MISSION_C]) {
        for (const sandboxId of await provider.listByMission(missionId)) {
          try { await provider.destroy(sandboxId); } catch { /* best-effort sweep */ }
        }
      }
    } catch { /* sweep is best-effort */ }
    await rm(dir, { recursive: true, force: true });
  }
});
