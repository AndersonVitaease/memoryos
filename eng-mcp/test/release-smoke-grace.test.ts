// ERF-01 RELEASE SMOKE GRACE WINDOW - deterministic, zero-network tests.
// T1 502 transient + success -> PASS; T2 503 transient + success -> PASS;
// T3 persistent transient exhausts the grace window -> FAIL; T3b connection
// reset/refused transient classified; T4 functional failure fails fast;
// T5 catalog/tool-count failure fails fast; T6 rollback semantics intact;
// T7 wiring: smokeAction is wrapped by the grace window helper and rollback
// trigger is unchanged (the official suite certifies the rest).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SMOKE_TRANSIENT_RETRY_MAX_ATTEMPTS,
  SMOKE_TRANSIENT_RETRY_BACKOFF_MS,
  SMOKE_TRANSIENT_RETRY_DEADLINE_MS,
  isTransientSmokeError,
  smokeTransientRetry,
  smokeFailureTransition,
  sanitizeSmokeFailureMessage,
  deriveSmokeFailure,
  markSmokeFailure
} from "../scripts/eng-mcp-release.mjs";

const silence = () => {};

const runnerSource = readFileSync(fileURLToPath(new URL("../scripts/eng-mcp-release.mjs", import.meta.url)), "utf8");

test("T0: grace window constants (attempts <= 8, total backoff <= 30s hard deadline)", () => {
  assert.equal(SMOKE_TRANSIENT_RETRY_MAX_ATTEMPTS, 8);
  assert.ok(SMOKE_TRANSIENT_RETRY_MAX_ATTEMPTS <= 8);
  assert.equal(SMOKE_TRANSIENT_RETRY_BACKOFF_MS.length, SMOKE_TRANSIENT_RETRY_MAX_ATTEMPTS - 1);
  const total = SMOKE_TRANSIENT_RETRY_BACKOFF_MS.reduce((a: number, b: number) => a + b, 0);
  assert.ok(total <= SMOKE_TRANSIENT_RETRY_DEADLINE_MS, "backoff sum must fit the hard deadline");
  assert.ok(SMOKE_TRANSIENT_RETRY_DEADLINE_MS <= 30000);
  assert.ok(SMOKE_TRANSIENT_RETRY_DEADLINE_MS > 15000, "ERF-02 widened the window beyond 15s");
});

test("T1: MCP_HTTP_502 transient then success -> PASS", async () => {
  const waits: number[] = [];
  let calls = 0;
  const result = await smokeTransientRetry("t1", async () => {
    calls += 1;
    if (calls === 1) throw new Error("MCP_HTTP_502");
    return "ok";
  }, { delayFn: async (ms: number) => { waits.push(ms); }, log: silence });
  assert.equal(result, "ok");
  assert.equal(calls, 2);
  assert.deepEqual(waits, [1000]);
});

test("T2: MCP_HTTP_503 transient twice then success -> PASS", async () => {
  const waits: number[] = [];
  let calls = 0;
  const result = await smokeTransientRetry("t2", async () => {
    calls += 1;
    if (calls <= 2) throw new Error("MCP_HTTP_503");
    return "ok";
  }, { delayFn: async (ms: number) => { waits.push(ms); }, log: silence });
  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 2000]);
});

test("T3: persistent transient exhausts the grace window and FAILS", async () => {
  const waits: number[] = [];
  let calls = 0;
  let thrown: unknown = null;
  try {
    await smokeTransientRetry("t3", async () => {
      calls += 1;
      throw new Error("MCP_HTTP_502");
    }, { delayFn: async (ms: number) => { waits.push(ms); }, log: silence });
  } catch (error) { thrown = error; }
  assert.ok(thrown instanceof Error);
  assert.equal((thrown as Error).message, "MCP_HTTP_502");
  assert.equal(calls, SMOKE_TRANSIENT_RETRY_MAX_ATTEMPTS);
  assert.deepEqual(waits, [1000, 2000, 3000, 4000, 5000, 6000, 7000]);
  const total = waits.reduce((a: number, b: number) => a + b, 0);
  assert.ok(total <= SMOKE_TRANSIENT_RETRY_DEADLINE_MS);
});

test("T3-hard-deadline: graceDeadlineMs=0 forbids any second attempt", async () => {
  let calls = 0;
  let thrown: unknown = null;
  try {
    await smokeTransientRetry("t3-hard", async () => {
      calls += 1;
      throw new Error("MCP_HTTP_503");
    }, { graceDeadlineMs: 0, delayFn: async () => {}, log: silence });
  } catch (error) { thrown = error; }
  assert.ok(thrown instanceof Error);
  assert.equal((thrown as Error).message, "MCP_HTTP_503");
  assert.equal(calls, 1);
});

test("T3b: connection reset/refused via cause chain is transient and exhausts", async () => {
  assert.equal(isTransientSmokeError(Object.assign(new Error("fetch failed"), { cause: Object.assign(new Error("other side closed"), { code: "ECONNRESET" }) })), true);
  assert.equal(isTransientSmokeError(Object.assign(new Error("fetch failed"), { cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), { code: "ECONNREFUSED" }) })), true);
  assert.equal(isTransientSmokeError(Object.assign(new Error("request failed"), { cause: Object.assign(new Error("connect timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" }) })), true);
  let calls = 0;
  let thrown: unknown = null;
  try {
    await smokeTransientRetry("t3b", async () => {
      calls += 1;
      throw Object.assign(new Error("fetch failed"), { cause: Object.assign(new Error("other side closed"), { code: "ECONNRESET" }) });
    }, { delayFn: async () => {}, log: silence });
  } catch (error) { thrown = error; }
  assert.ok(thrown instanceof Error);
  assert.equal((thrown as Error).message, "fetch failed");
  assert.equal(calls, SMOKE_TRANSIENT_RETRY_MAX_ATTEMPTS);
});

test("ERF-02 T1b: 502 persists >15s and recovers before 30s -> PASS", async () => {
  let clock = 0;
  const waits: number[] = [];
  let calls = 0;
  const telemetry = { smokeTransientRetries: 0, smokeTransientCodes: [] as string[], smokeRecoveredOnAttempt: null as number | null };
  const result = await smokeTransientRetry("t1b", async () => {
    calls += 1;
    if (calls <= 6) throw new Error("MCP_HTTP_502");
    return "ok";
  }, { delayFn: async (ms: number) => { clock += ms; waits.push(ms); }, nowFn: () => clock, log: silence, telemetry });
  assert.equal(result, "ok");
  assert.equal(calls, 7);
  const elapsed = waits.reduce((a: number, b: number) => a + b, 0);
  assert.ok(elapsed > 15000 && elapsed < 30000, "recovers after the OLD 15s window, before the NEW 30s deadline");
  assert.equal(telemetry.smokeTransientRetries, 6);
  assert.equal(telemetry.smokeRecoveredOnAttempt, 7);
});

test("ERF-02 T2b: 503 persists >15s and recovers on the last allowed attempt -> PASS", async () => {
  let clock = 0;
  let calls = 0;
  const result = await smokeTransientRetry("t2b", async () => {
    calls += 1;
    if (calls <= 7) throw new Error("MCP_HTTP_503");
    return "ok";
  }, { delayFn: async () => {}, nowFn: () => clock, log: silence });
  assert.equal(result, "ok");
  assert.equal(calls, SMOKE_TRANSIENT_RETRY_MAX_ATTEMPTS);
});

test("ERF-02 T3c: transient failure beyond 30s fails fast at the deadline", async () => {
  let clock = 0;
  let calls = 0;
  let thrown: unknown = null;
  try {
    await smokeTransientRetry("t3c", async () => {
      calls += 1;
      clock += 5000;
      throw new Error("MCP_HTTP_502");
    }, { delayFn: async (ms: number) => { clock += ms; }, nowFn: () => clock, log: silence });
  } catch (error) { thrown = error; }
  assert.ok(thrown instanceof Error);
  assert.equal((thrown as Error).message, "MCP_HTTP_502");
  assert.equal(calls, 5);
  assert.ok(clock > 30000, "simulated time passed the 30s deadline");
});

test("ERF-02 T7b: telemetry counts retries, dedups codes, marks recovery attempt", async () => {
  let calls = 0;
  const telemetry = { smokeTransientRetries: 0, smokeTransientCodes: [] as string[], smokeRecoveredOnAttempt: null as number | null };
  const result = await smokeTransientRetry("t7b", async () => {
    calls += 1;
    if (calls === 1 || calls === 2) throw new Error("MCP_HTTP_502");
    if (calls === 3) throw Object.assign(new Error("fetch failed"), { code: "ECONNRESET" });
    return "ok";
  }, { delayFn: async () => {}, log: silence, telemetry });
  assert.equal(result, "ok");
  assert.equal(telemetry.smokeTransientRetries, 3);
  assert.deepEqual(telemetry.smokeTransientCodes, ["MCP_HTTP_502", "ECONNRESET"]);
  assert.equal(telemetry.smokeRecoveredOnAttempt, 4);

  const clean: { smokeTransientRetries: number; smokeTransientCodes: string[]; smokeRecoveredOnAttempt: number | null } = { smokeTransientRetries: 0, smokeTransientCodes: [], smokeRecoveredOnAttempt: null };
  await smokeTransientRetry("t7b-clean", async () => "ok", { delayFn: async () => {}, log: silence, telemetry: clean });
  assert.equal(clean.smokeTransientRetries, 0);
  assert.equal(clean.smokeRecoveredOnAttempt, null);

  let functionalCalls = 0;
  let thrown: unknown = null;
  const ftelemetry: { smokeTransientRetries: number; smokeTransientCodes: string[]; smokeRecoveredOnAttempt: number | null } = { smokeTransientRetries: 0, smokeTransientCodes: [], smokeRecoveredOnAttempt: null };
  try {
    await smokeTransientRetry("t7b-functional", async () => {
      functionalCalls += 1;
      throw new Error("SMOKE_CATALOG_NONDETERMINISTIC");
    }, { delayFn: async () => {}, log: silence, telemetry: ftelemetry });
  } catch (error) { thrown = error; }
  assert.ok(thrown instanceof Error);
  assert.equal(functionalCalls, 1);
  assert.equal(ftelemetry.smokeTransientRetries, 0, "functional failures must not count as transient retries");
  assert.deepEqual(ftelemetry.smokeTransientCodes, []);
});
test("T4: functional failures fail fast (no retry, no backoff)", async () => {
  const functional = [
    "MCP_HTTP_401",
    "MCP_HTTP_400",
    "MCP_HTTP_404",
    "MCP_HTTP_505",
    "MCP_RESPONSE_INVALID",
    "SMOKE_UNAUTH_HTTP_200",
    "SMOKE_UNAUTH_HTTP_500",
    "SMOKE_TEST_RUN_CALL_FAILED",
    "SMOKE_TEST_RUN_FAILED",
    "SMOKE_CATALOG_NONDETERMINISTIC",
    "SMOKE_RELEASE_RUNNER_INVALID",
    "PRODUCTION_NOT_RUNNING"
  ];
  for (const message of functional) {
    assert.equal(isTransientSmokeError(new Error(message)), false, message);
    let calls = 0;
    const waits: number[] = [];
    let thrown: unknown = null;
    try {
      await smokeTransientRetry("t4", async () => {
        calls += 1;
        throw new Error(message);
      }, { delayFn: async (ms: number) => { waits.push(ms); }, log: silence });
    } catch (error) { thrown = error; }
    assert.ok(thrown instanceof Error, message);
    assert.equal((thrown as Error).message, message);
    assert.equal(calls, 1, message);
    assert.equal(waits.length, 0, message);
  }
});

test("T5: tool catalog / tool count failure fails fast", async () => {
  assert.equal(isTransientSmokeError(new Error("TOOL_CATALOG_MISMATCH")), false);
  assert.equal(isTransientSmokeError(new Error("REQUIRED_TOOL_MISSING:engineering.release.pipeline")), false);
  let calls = 0;
  const waits: number[] = [];
  let thrown: unknown = null;
  try {
    await smokeTransientRetry("t5", async () => {
      calls += 1;
      throw new Error("TOOL_CATALOG_MISMATCH");
    }, { delayFn: async (ms: number) => { waits.push(ms); }, log: silence });
  } catch (error) { thrown = error; }
  assert.ok(thrown instanceof Error);
  assert.equal((thrown as Error).message, "TOOL_CATALOG_MISMATCH");
  assert.equal(calls, 1);
  assert.equal(waits.length, 0);
});

test("T6: rollback semantics intact - smokeFailureTransition shape is exact", () => {
  const state: Record<string, unknown> = {
    previousContainer: "memoryos-eng-mcp-rollback-123",
    previousImage: "eng-mcp-candidate:previous",
    smokeStatus: "PASS",
    deployStatus: "PASS",
    rollbackRequired: false,
    sourceHash: "abc"
  };
  const transition = smokeFailureTransition(state) as Record<string, unknown>;
  assert.equal(transition.smokeStatus, "FAIL");
  assert.equal(transition.rollbackRequired, true);
  assert.equal(transition.previousContainer, state.previousContainer);
  assert.equal(transition.previousImage, state.previousImage);
  assert.equal(transition.deployStatus, "PASS");
  assert.equal(transition.sourceHash, "abc");
  assert.throws(() => smokeFailureTransition({ smokeStatus: "PASS" } as unknown as Record<string, unknown>), /ROLLBACK_STATE_MISSING/);
});

test("T6b: exhausted retry rethrows the ORIGINAL transient error (official rollback trigger preserved)", async () => {
  let calls = 0;
  let thrown: unknown = null;
  try {
    await smokeTransientRetry("t6b", async () => {
      calls += 1;
      throw new Error("MCP_HTTP_504");
    }, { maxAttempts: 2, backoffMs: [10], graceDeadlineMs: 50, delayFn: async () => {}, log: silence });
  } catch (error) { thrown = error; }
  assert.ok(thrown instanceof Error);
  assert.equal((thrown as Error).message, "MCP_HTTP_504");
  assert.equal(calls, 2);
});

test("T7: wiring - smokeAction is wrapped by the grace window; rollback trigger unchanged; candidate untouched", () => {
  // grace window helpers exported and wired into smokeAction
  assert.ok(runnerSource.includes("export const SMOKE_TRANSIENT_RETRY_MAX_ATTEMPTS = 8;"));
  assert.ok(runnerSource.includes("export const SMOKE_TRANSIENT_RETRY_BACKOFF_MS = Object.freeze([1000, 2000, 3000, 4000, 5000, 6000, 7000]);"));
  assert.ok(runnerSource.includes("export const SMOKE_TRANSIENT_RETRY_DEADLINE_MS = 30000;"));
  assert.ok(runnerSource.includes("let smokeTelemetrySink = null;"));
  assert.ok(runnerSource.includes('export async function smokeTransientRetry(label, operation, options = {})'));
  assert.ok(runnerSource.includes('smokeTransientRetry("unauth-probe"'));
  assert.ok(runnerSource.includes('smokeTransientRetry("initialize"'));
  assert.ok(runnerSource.includes('smokeTransientRetry("tools-list"'));
  assert.ok(runnerSource.includes('smokeTransientRetry("catalog-call"'));
  assert.ok(runnerSource.includes('smokeTransientRetry("read-call"'));
  // functional validations stay OUTSIDE the retry (fail fast preserved)
  assert.ok(runnerSource.includes("validateToolCatalog(names, state.expectedTools, config.requiredTools);"));
  assert.ok(runnerSource.includes('throw new Error("SMOKE_CATALOG_NONDETERMINISTIC");'));
  // official rollback trigger in deployAction unchanged
  assert.ok(runnerSource.includes("const failed = smokeFailureTransition(state);"));
  assert.ok(runnerSource.includes("failed.smokeTransientRetries = smokeTelemetrySink.smokeTransientRetries ?? 0;"));
  assert.ok(runnerSource.includes("await saveState(config, failed); await rollbackAction(config); throw error;"));
  assert.ok(runnerSource.includes("options.telemetry ?? smokeTelemetrySink"));
  assert.ok(runnerSource.includes("options.nowFn ?? "));
  assert.ok(runnerSource.includes("state.smokeRecoveredOnAttempt = null;"));
  assert.ok(runnerSource.includes("smokeTelemetrySink = null;"));
  // candidateAction must NOT use the grace window (isolation preserved)
  const candidateStart = runnerSource.indexOf("async function candidateAction(config)");
  const helpersStart = runnerSource.indexOf("// ERF-01 RELEASE SMOKE GRACE WINDOW");
  assert.ok(candidateStart > 0);
  assert.ok(helpersStart > candidateStart);
  const candidateSection = runnerSource.slice(candidateStart, helpersStart);
  assert.ok(!candidateSection.includes("smokeTransientRetry("));
});

// SFFF-01 SMOKE FUNCTIONAL FAILURE FORENSICS - minimal failure telemetry (T1-T7).

test("SFFF T1: unauth probe failure persists step, code and sanitized message", () => {
  const state: Record<string, unknown> = {};
  markSmokeFailure(state, "unauth-probe", new Error("SMOKE_UNAUTH_HTTP_200"));
  assert.equal(state.smokeFailedStep, "unauth-probe");
  assert.equal(state.smokeFailureCode, "SMOKE_UNAUTH_HTTP_200");
  assert.equal(state.smokeFailureMessage, "SMOKE_UNAUTH_HTTP_200");
  const secret: Record<string, unknown> = {};
  markSmokeFailure(secret, "unauth-probe", new Error("unauth probe bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 leaked"));
  assert.ok(!String(secret.smokeFailureMessage).includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
  assert.ok(String(secret.smokeFailureMessage).includes("[REDACTED]"));
});

test("SFFF T2: catalog mismatch maps to catalog-validation; catalog-shape codes map to tools-list", () => {
  const state: Record<string, unknown> = {};
  markSmokeFailure(state, null, new Error("SMOKE_CATALOG_NONDETERMINISTIC"));
  assert.equal(state.smokeFailedStep, "catalog-validation");
  assert.equal(state.smokeFailureCode, "SMOKE_CATALOG_NONDETERMINISTIC");
  assert.equal(deriveSmokeFailure(new Error("TOOL_CATALOG_MISMATCH")).step, "tools-list");
  assert.equal(deriveSmokeFailure(new Error("REQUIRED_TOOL_MISSING:engineering.release.pipeline")).step, "tools-list");
});

test("SFFF T3: engineering.test.run failure maps to test-run step and code", () => {
  const state: Record<string, unknown> = {};
  markSmokeFailure(state, null, new Error("SMOKE_TEST_RUN_CALL_FAILED"));
  assert.equal(state.smokeFailedStep, "test-run");
  assert.equal(state.smokeFailureCode, "SMOKE_TEST_RUN_CALL_FAILED");
  assert.equal(state.smokeFailureMessage, "SMOKE_TEST_RUN_CALL_FAILED");
});

test("SFFF T4: read failure maps to read step; runner-service and production covered", () => {
  const state: Record<string, unknown> = {};
  markSmokeFailure(state, null, new Error("SMOKE_READ_FAILED"));
  assert.equal(state.smokeFailedStep, "read");
  assert.equal(state.smokeFailureCode, "SMOKE_READ_FAILED");
  assert.equal(deriveSmokeFailure(new Error("SMOKE_RELEASE_RUNNER_INVALID")).step, "runner-service");
  assert.equal(deriveSmokeFailure(new Error("PRODUCTION_NOT_RUNNING")).step, "production");
});

test("SFFF T5: success keeps failure fields null (sanitizer null-safe)", async () => {
  const telemetry: Record<string, unknown> = { smokeFailedStep: null, smokeFailureCode: null, smokeFailureMessage: null };
  const result = await smokeTransientRetry("sfff-t5", async () => "ok", { delayFn: async () => {}, log: silence, telemetry });
  assert.equal(result, "ok");
  assert.equal(telemetry.smokeFailedStep, null);
  assert.equal(telemetry.smokeFailureCode, null);
  assert.equal(telemetry.smokeFailureMessage, null);
  assert.equal(sanitizeSmokeFailureMessage(null), null);
  assert.equal(sanitizeSmokeFailureMessage(undefined), null);
  assert.equal(deriveSmokeFailure(null).step, null);
  assert.equal(deriveSmokeFailure(null).code, null);
  assert.equal(deriveSmokeFailure(null).message, null);
});

test("SFFF T6: transient retry path still works and never sets functional failure fields", async () => {
  let calls = 0;
  const telemetry: Record<string, unknown> = { smokeTransientRetries: 0, smokeTransientCodes: [] as string[], smokeRecoveredOnAttempt: null, smokeFailedStep: null, smokeFailureCode: null, smokeFailureMessage: null };
  const result = await smokeTransientRetry("sfff-t6", async () => {
    calls += 1;
    if (calls === 1) throw new Error("MCP_HTTP_502");
    return "ok";
  }, { delayFn: async () => {}, log: silence, telemetry });
  assert.equal(result, "ok");
  assert.equal(telemetry.smokeRecoveredOnAttempt, 2);
  assert.equal(telemetry.smokeFailedStep, null);
  assert.equal(telemetry.smokeFailureCode, null);
  assert.equal(telemetry.smokeFailureMessage, null);
});

test("SFFF T7: wiring - deployAction persists failure fields; rollback trigger untouched", () => {
  assert.ok(runnerSource.includes("export function sanitizeSmokeFailureMessage(value)"));
  assert.ok(runnerSource.includes("export function deriveSmokeFailure(error)"));
  assert.ok(runnerSource.includes("export function markSmokeFailure(state, step, error)"));
  assert.ok(runnerSource.includes("if (telemetry && !telemetry.smokeFailedStep) markSmokeFailure(telemetry, label, error);"));
  assert.ok(runnerSource.includes("state.smokeFailedStep = null;"));
  assert.ok(runnerSource.includes("state.smokeFailureCode = null;"));
  assert.ok(runnerSource.includes("state.smokeFailureMessage = null;"));
  assert.ok(runnerSource.includes("if (!smokeTelemetrySink.smokeFailedStep) markSmokeFailure(smokeTelemetrySink, null, error);"));
  assert.ok(runnerSource.includes("failed.smokeFailedStep = smokeTelemetrySink.smokeFailedStep ?? null;"));
  assert.ok(runnerSource.includes("const fallback = deriveSmokeFailure(error);"));
  assert.ok(runnerSource.includes("const failed = smokeFailureTransition(state);"));
  assert.ok(runnerSource.includes("await saveState(config, failed); await rollbackAction(config); throw error;"));
  assert.ok(runnerSource.includes("export const SMOKE_TRANSIENT_RETRY_MAX_ATTEMPTS = 8;"));
  assert.ok(runnerSource.includes("export const SMOKE_TRANSIENT_RETRY_DEADLINE_MS = 30000;"));
});
