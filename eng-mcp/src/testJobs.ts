// TEST-01-W1: persisted test-job lifecycle (Test Capability Map V1, wave W-T1).
// Long-running verification must never hold an MCP call open: file/related profiles
// run synchronously under the 110s client budget; suite/full profiles execute as
// async jobs through the persistent official release runner, with reconnect-safe
// readback via engineering.test.status (release-state.json reconciliation). The
// store lives OUTSIDE the authorized tree on purpose: verification runs snapshot
// the worktree (baseline/assertVerificationBaseline) and any in-tree write between
// the snapshots would self-trip UNEXPECTED_VERIFICATION_MUTATION.
import { mkdir, open, readdir, readFile, rename, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { EngineeringError, assertNoSensitiveContent } from "./policy.js";

export type TestJobStatus = "QUEUED" | "RUNNING" | "PASS" | "FAIL" | "INFRA_ERROR";
// Deterministic taxonomy (TEST-00 V1): INFRASTRUCTURE_ERROR != TEST_FAILURE - an
// infra failure NEVER increments the failed-test counters.
export type TestFailureClass = "ASSERTION_FAILURE" | "TEST_TIMEOUT" | "PROCESS_CRASH" | "CONFIG_ERROR" | "DEPENDENCY_ERROR" | "INFRASTRUCTURE_ERROR" | "RUNNER_ERROR" | "CANCELLED";

export type TestFailureSummary = { name: string; message?: string | undefined };
export type TestInfraFailure = { failureClass: TestFailureClass; message: string };

export type TestJob = {
  version: 1;
  executionId: string;
  profile: "file" | "related" | "suite" | "full";
  executor: "sync" | "release-runner";
  status: TestJobStatus;
  selection: string[];
  createdAt: string;
  startedAt?: string | undefined;
  finishedAt?: string | undefined;
  timeoutMs?: number | undefined;
  testsDiscovered?: number | null | undefined;
  testsExecuted?: number | null | undefined;
  passed?: number | null | undefined;
  failed?: number | null | undefined;
  skipped?: number | null | undefined;
  failureClass?: TestFailureClass | undefined;
  failureSummaries?: TestFailureSummary[] | undefined;
  infraFailures?: TestInfraFailure[] | undefined;
  truncated?: boolean | undefined;
  outputLocation?: string | undefined;
  wallTimeMs?: number | null | undefined;
  evidenceId: string;
  sourceHash?: string | undefined;
};

const EXECUTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
const FAILURE_SUMMARY_LIMIT = 20;
const FAILURE_NAME_LIMIT = 200;
const FAILURE_MESSAGE_LIMIT = 300;
const LOG_WRITE_LIMIT = 2 * 1024 * 1024;

export function defaultTestJobsRoot(): string {
  return process.env.ENG_MCP_TEST_JOBS_DIR ?? path.join(tmpdir(), "eng-mcp-test-jobs");
}

let singleton: TestJobStore | undefined;
export function getTestJobStore(): TestJobStore {
  if (!singleton) singleton = new TestJobStore(defaultTestJobsRoot());
  return singleton;
}

export function createTestExecutionId(profile: string): string {
  // Unique per start on purpose: a tree-fingerprint derived id could confuse an old
  // execution with a new one after a tree change (TEST-01-W1 constraint). Collision
  // freedom between intentionally distinct runs wins over determinism here.
  return `${profile}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

export class TestJobStore {
  private readonly root: string;
  constructor(root: string) { this.root = root; }
  get jobsRoot(): string { return this.root; }
  private assertId(executionId: string): void {
    if (!EXECUTION_ID_PATTERN.test(executionId)) throw new EngineeringError("TEST_JOB_ID_INVALID");
  }
  private jobPath(executionId: string): string {
    this.assertId(executionId);
    return path.join(this.root, `${executionId}.json`);
  }
  private logPath(executionId: string): string {
    this.assertId(executionId);
    return path.join(this.root, `${executionId}.log`);
  }
  // Atomic persistence: unique temp file -> fsync -> rename. A crash can only leave
  // the previous state or the new one behind, never a partially written job (T10).
  async save(job: TestJob): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const target = this.jobPath(job.executionId);
    const temp = path.join(this.root, `.${randomBytes(8).toString("hex")}.tmp`);
    const handle = await open(temp, "wx");
    try { await handle.writeFile(Buffer.from(JSON.stringify(job, null, 2), "utf8")); await handle.sync(); } finally { await handle.close(); }
    try { await rename(temp, target); } finally { await unlink(temp).catch(() => undefined); }
  }
  async load(executionId: string): Promise<TestJob> {
    let raw: string;
    try { raw = await readFile(this.jobPath(executionId), "utf8"); }
    catch { throw new EngineeringError("TEST_JOB_NOT_FOUND", `no persisted test job for ${executionId}`); }
    try {
      const parsed = JSON.parse(raw) as TestJob;
      if (parsed?.version !== 1 || typeof parsed.executionId !== "string" || typeof parsed.status !== "string") throw new Error("shape");
      return parsed;
    } catch (error) {
      if (error instanceof EngineeringError) throw error;
      throw new EngineeringError("TEST_JOB_CORRUPT", executionId);
    }
  }
  // Full logs stay on disk (bounded) and out of every MCP response (output policy).
  async saveLog(executionId: string, text: string): Promise<string> {
    await mkdir(this.root, { recursive: true });
    const bounded = text.length > LOG_WRITE_LIMIT ? text.slice(0, LOG_WRITE_LIMIT) : text;
    const target = this.logPath(executionId);
    const temp = path.join(this.root, `.${randomBytes(8).toString("hex")}.tmp`);
    const handle = await open(temp, "wx");
    try { await handle.writeFile(Buffer.from(bounded, "utf8")); await handle.sync(); } finally { await handle.close(); }
    try { await rename(temp, target); } finally { await unlink(temp).catch(() => undefined); }
    return target;
  }
  async listTempResidue(): Promise<string[]> {
    try { return (await readdir(this.root)).filter((name) => name.endsWith(".tmp")); }
    catch { return []; }
  }
}

function safeField(value: string): string | undefined {
  try { assertNoSensitiveContent(value); return value; } catch { return undefined; }
}

export function boundedFailureName(value: string): string {
  return safeField(value.trim().slice(0, FAILURE_NAME_LIMIT)) ?? "[REDACTED]";
}

// node --test --test-reporter=tap summary parsing. Returns null when the output
// carries no TAP summary (counters are never invented).
export function parseTapSummary(text: string): { tests: number; passed: number; failed: number; skipped: number; cancelled: number } | null {
  const read = (label: string): number | null => {
    const match = new RegExp(`^# ${label} (\\d+)\\s*$`, "m").exec(text);
    return match === null ? null : Number(match[1]);
  };
  const tests = read("tests");
  if (tests === null) return null;
  return { tests, passed: read("pass") ?? 0, failed: read("fail") ?? 0, skipped: read("skipped") ?? 0, cancelled: read("cancelled") ?? 0 };
}

export function parseTapFailures(text: string, limit = FAILURE_SUMMARY_LIMIT): TestFailureSummary[] {
  const blocks = text.split(/^\s*not ok \d+ - /m).slice(1, limit + 1);
  const failures: TestFailureSummary[] = [];
  for (const block of blocks) {
    const summary: TestFailureSummary = { name: boundedFailureName(block.split("\n")[0]) };
    const messageMatch = /(?:error|message):\s*(?:'([^'\n]+)'|"([^"\n]+)"|([^\n]*))/.exec(block);
    const rawMessage = (messageMatch?.[1] ?? messageMatch?.[2] ?? messageMatch?.[3] ?? "").trim().slice(0, FAILURE_MESSAGE_LIMIT);
    const safeMessage = rawMessage.length > 0 ? safeField(rawMessage) : undefined;
    if (safeMessage !== undefined && safeMessage.length > 0) summary.message = safeMessage;
    failures.push(summary);
  }
  return failures;
}

export type SyncRunOutcome = { status: "PASS" | "FAIL"; failureClass?: TestFailureClass | undefined };

// Deterministic classification matrix (TEST-01-W1 Parte 4). Non-infra classes mean
// the tests themselves produced a verdict; infra classes never touch the counters.
export function classifySyncRunOutcome(input: { timedOut: boolean; exitCode: number | null; testsRun: number; failed: number; output?: string }): SyncRunOutcome {
  if (input.timedOut) return { status: "FAIL", failureClass: "TEST_TIMEOUT" };
  if (input.exitCode === 0) return { status: "PASS" };
  if (input.testsRun === 0) {
    if (/ERR_MODULE_NOT_FOUND|Cannot find module/i.test(input.output ?? "")) return { status: "FAIL", failureClass: "DEPENDENCY_ERROR" };
    return { status: "FAIL", failureClass: "CONFIG_ERROR" };
  }
  if (input.failed > 0) return { status: "FAIL", failureClass: "ASSERTION_FAILURE" };
  return { status: "FAIL", failureClass: "PROCESS_CRASH" };
}

// Map thrown verification-machinery errors to the taxonomy: they are never test
// verdicts, so the failed counter stays untouched (T13 invariant).
export function classifyInfraError(error: unknown): TestFailureClass {
  const code = error instanceof EngineeringError ? error.code : error instanceof Error ? error.message : String(error ?? "");
  if (/DEPENDENCY_UNAVAILABLE/.test(code)) return "DEPENDENCY_ERROR";
  if (/UNEXPECTED_VERIFICATION_MUTATION|BASELINE_LIMIT_EXCEEDED|ENGINEERING_CAPACITY_EXCEEDED/.test(code)) return "RUNNER_ERROR";
  return "INFRASTRUCTURE_ERROR";
}

export function boundedJobView(job: TestJob) {
  return {
    executionId: job.executionId,
    profile: job.profile,
    executor: job.executor,
    status: job.status,
    selection: job.selection,
    createdAt: job.createdAt,
    startedAt: job.startedAt ?? null,
    finishedAt: job.finishedAt ?? null,
    timeoutMs: job.timeoutMs ?? null,
    testsDiscovered: job.testsDiscovered ?? null,
    testsExecuted: job.testsExecuted ?? null,
    passed: job.passed ?? null,
    failed: job.failed ?? null,
    skipped: job.skipped ?? null,
    failureClass: job.failureClass ?? null,
    failureSummaries: job.failureSummaries ?? [],
    infraFailures: job.infraFailures ?? [],
    truncated: job.truncated ?? false,
    outputLocation: job.outputLocation ?? null,
    wallTimeMs: job.wallTimeMs ?? null,
    evidenceId: job.evidenceId,
    sourceHash: job.sourceHash ?? null
  };
}

// ---------- suite/full async jobs (persistent official release runner) ----------

export async function createSuiteJob(store: TestJobStore, profile: "suite" | "full", selection: string[] = []): Promise<TestJob> {
  const executionId = createTestExecutionId(profile);
  const now = new Date().toISOString();
  const job: TestJob = { version: 1, executionId, profile, executor: "release-runner", status: "RUNNING", selection, createdAt: now, startedAt: now, evidenceId: `test-job:${executionId}` };
  await store.save(job);
  return job;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function failureSummariesFrom(value: unknown): TestFailureSummary[] {
  if (!Array.isArray(value)) return [];
  return (value as Array<{ test?: unknown; name?: unknown; message?: unknown }>).slice(0, FAILURE_SUMMARY_LIMIT).map((entry) => {
    const rawName = typeof entry?.test === "string" ? entry.test : typeof entry?.name === "string" ? entry.name : "";
    const summary: TestFailureSummary = { name: rawName.length > 0 ? boundedFailureName(rawName) : "[UNKNOWN]" };
    if (typeof entry?.message === "string") {
      const safe = safeField(entry.message.trim().slice(0, FAILURE_MESSAGE_LIMIT));
      if (safe !== undefined && safe.length > 0) summary.message = safe;
    }
    return summary;
  });
}

// Completes a RUNNING suite job from the official runner response (or its parsed
// FAIL shape). Counters are taken from the body when present, otherwise parsed
// from the TAP it carries; missing counters stay null instead of being invented.
export async function finishSuiteJobFromRunner(store: TestJobStore, executionId: string, body: unknown): Promise<TestJob> {
  const current = await store.load(executionId);
  if (current.status !== "RUNNING" && current.status !== "QUEUED") return current;
  const source = (body ?? {}) as { status?: unknown; tests?: unknown; passed?: unknown; failed?: unknown; failures?: unknown; stdout?: unknown; stderr?: unknown };
  const fromTap = parseTapSummary(typeof source.stderr === "string" && source.stderr.length > 0 ? source.stderr : typeof source.stdout === "string" ? source.stdout : "");
  const explicitFail = source.status === "FAIL";
  const tests = numberOrNull(source.tests) ?? fromTap?.tests ?? null;
  const passed = numberOrNull(source.passed) ?? fromTap?.passed ?? null;
  let failed = numberOrNull(source.failed) ?? fromTap?.failed ?? null;
  if (failed === null && explicitFail && tests !== null && passed !== null) failed = tests - passed;
  const status: TestJobStatus = explicitFail || (failed !== null && failed > 0) ? "FAIL" : "PASS";
  const finishedAt = new Date().toISOString();
  const next: TestJob = {
    ...current,
    status,
    finishedAt,
    testsDiscovered: tests,
    testsExecuted: tests,
    passed,
    failed,
    skipped: tests !== null && passed !== null && failed !== null ? tests - passed - failed : null,
    failureClass: status === "FAIL" ? "ASSERTION_FAILURE" : undefined,
    failureSummaries: failureSummariesFrom(source.failures),
    wallTimeMs: Date.parse(finishedAt) - Date.parse(current.startedAt ?? current.createdAt),
    evidenceId: current.evidenceId
  };
  await store.save(next);
  return next;
}

export async function finishSuiteJobInfra(store: TestJobStore, executionId: string, message: string): Promise<TestJob> {
  const current = await store.load(executionId);
  if (current.status !== "RUNNING" && current.status !== "QUEUED") return current;
  const failureClass: TestFailureClass = /RELEASE_RUNNER_REJECTED|RELEASE_CONFLICT/.test(message) ? "RUNNER_ERROR" : "INFRASTRUCTURE_ERROR";
  const bounded = safeField(message.slice(0, FAILURE_MESSAGE_LIMIT)) ?? "[REDACTED]";
  const finishedAt = new Date().toISOString();
  const next: TestJob = {
    ...current,
    status: "INFRA_ERROR",
    finishedAt,
    failureClass,
    infraFailures: [{ failureClass, message: bounded }],
    wallTimeMs: Date.parse(finishedAt) - Date.parse(current.startedAt ?? current.createdAt),
    evidenceId: current.evidenceId
  };
  await store.save(next);
  return next;
}

// Reconnect-safe readback: the persistent release runner saves release-state.json
// even when every MCP client disconnected. A testedAt strictly AFTER this job's
// start means the suite execution this job waited for finished; the job is then
// reconciled from that persisted evidence. Anything undeterminable returns null
// (the job honestly stays RUNNING) - no state is ever invented here.
export function reconcileSuiteJob(job: TestJob, releaseState: Record<string, unknown>, nowMs = Date.now()): TestJob | null {
  if (job.status !== "RUNNING" && job.status !== "QUEUED") return null;
  const testedAtMs = Date.parse(typeof releaseState.testedAt === "string" ? releaseState.testedAt : "");
  const startedMs = Date.parse(job.startedAt ?? job.createdAt);
  if (!Number.isFinite(testedAtMs) || !Number.isFinite(startedMs) || testedAtMs <= startedMs) return null;
  const testStatus = releaseState.testStatus;
  if (testStatus !== "PASS" && testStatus !== "FAIL") return null;
  const tests = numberOrNull(releaseState.tests);
  const passed = numberOrNull(releaseState.passed);
  const failed = numberOrNull(releaseState.failed);
  return {
    ...job,
    status: testStatus,
    finishedAt: new Date(Math.min(testedAtMs, nowMs)).toISOString(),
    testsDiscovered: tests,
    testsExecuted: tests,
    passed,
    failed,
    skipped: tests !== null && passed !== null && failed !== null ? tests - passed - failed : null,
    failureClass: testStatus === "FAIL" ? "ASSERTION_FAILURE" : undefined,
    failureSummaries: failureSummariesFrom(releaseState.failures),
    sourceHash: typeof releaseState.sourceHash === "string" ? releaseState.sourceHash : undefined,
    evidenceId: job.evidenceId
  };
}
