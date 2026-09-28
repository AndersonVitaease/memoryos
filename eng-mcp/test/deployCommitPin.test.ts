// DEPLOY-COMMIT-PIN-01: the pipeline compiles a DECLARED commit, never the working
// tree. P1 dirty tree -> DEPLOY_DIRTY_TREE listing the files (fail-closed, zero
// build/mutation); P2 clean commit -> image built from the isolated commit tree,
// imageTag == eng-mcp-candidate:commit-<sha>, revision label == sha, one image per
// commit; P3 provenance {commitSha, imageTag, treeClean, builtFrom} in the audit
// trail, written BEFORE any mutation; P4 rollback keeps referencing the SHA.
// Everything runs against a throwaway git monorepo fixture and a fake docker CLI
// (test/fixtures/deploy-commit-pin/fake-docker.mjs) — no daemon, no network, no LLM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execute, listDirtyDeployFiles, commitImageTag, tokenHashFileArgs, DEPLOY_PATHS } from "../scripts/eng-mcp-release.mjs";
import { createReleaseRunner } from "../scripts/eng-mcp-release-runner.mjs";
import { runOfficialReleasePipeline } from "../src/tools.ts";

const FAKE_DOCKER = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "deploy-commit-pin", "fake-docker.mjs");
const PREVIOUS_SHA = "a".repeat(40);

type Fixture = { dir: string; mono: string; proj: string; configFile: string; stateFile: string; dockerState: string; provenance: string; git: (...args: string[]) => string; head: () => string };

async function fixture(): Promise<Fixture> {
  const dir = await mkdtemp(path.join(tmpdir(), "deploy-pin-"));
  const mono = path.join(dir, "mono"); const proj = path.join(mono, "proj");
  await mkdir(path.join(proj, "src"), { recursive: true });
  await mkdir(path.join(proj, "scripts"), { recursive: true });
  await mkdir(path.join(proj, "test"), { recursive: true });
  const git = (...args: string[]) => execFileSync("git", ["-C", mono, ...args], { encoding: "utf8" });
  git("init", "-q", "-b", "main"); git("config", "user.email", "pin@example.invalid"); git("config", "user.name", "Pin Fixture"); git("config", "commit.gpgsign", "false");
  await writeFile(path.join(proj, "src", "tools.ts"), 'register("engineering.fixture.tool", "read", () => undefined);\n');
  await writeFile(path.join(proj, "src", "app.ts"), "export const app = 1;\n");
  await writeFile(path.join(proj, "scripts", "noop.mjs"), "export {};\n");
  await writeFile(path.join(proj, "test", "app.test.ts"), "export {};\n");
  await writeFile(path.join(proj, "package.json"), '{"name":"fixture"}\n');
  await writeFile(path.join(proj, "tsconfig.json"), "{}\n");
  await writeFile(path.join(proj, "Dockerfile"), "FROM scratch\n");
  await writeFile(path.join(proj, "verify.json"), "{}\n");
  await writeFile(path.join(proj, ".gitignore"), "*.token.json\n");
  await writeFile(path.join(mono, "outside.txt"), "not part of the project\n");
  git("add", "-A"); git("commit", "-q", "-m", "fixture");
  const stateFile = path.join(dir, "release-state.json");
  const configFile = path.join(dir, "release-config.json");
  await writeFile(configFile, JSON.stringify({
    canonicalSource: proj, stateFile, imageRepository: "eng-mcp-candidate", requiredTools: [],
    candidate: { port: 3901, dataRoot: path.join(dir, "candidate"), image: "eng-mcp-candidate", containerName: "eng-mcp-candidate" },
    production: { endpoint: "http://127.0.0.1:1/mcp", containerName: "memoryos-eng-mcp", image: "memoryos-eng-mcp", runnerMount: "/run:/run", repositoryMount: `${mono}:${mono}`, dataMount: `${path.join(dir, "prod")}:/data`, port: 1, host: "127.0.0.1", network: "host", restart: "unless-stopped", repositoryRoot: proj, repositoryId: "fixture", tokenRegistryFile: "/data/tokens.json", deployEnvironmentId: "e", deployServerId: "s" }
  }));
  const bin = path.join(dir, "bin"); await mkdir(bin);
  await writeFile(path.join(bin, "docker"), `#!/bin/sh\nexec "${process.execPath}" "${FAKE_DOCKER}" "$@"\n`); await chmod(path.join(bin, "docker"), 0o755);
  const dockerState = path.join(dir, "docker.json");
  await writeFile(dockerState, JSON.stringify({ production: { image: "eng-mcp-candidate:candidate-legacy", imageId: "sha256:legacy" }, images: { "sha256:legacy": { labels: null } }, tags: { "eng-mcp-candidate:candidate-legacy": "sha256:legacy" } }));
  const provenance = path.join(dir, "audit", "deploy-provenance.jsonl");
  await mkdir(path.dirname(provenance), { recursive: true });
  // compat: a retroactive record for the working-tree deploy currently in production
  await writeFile(provenance, `${JSON.stringify({ event: "retroactive_record", imageTag: "eng-mcp-candidate:candidate-legacy", commitSha: PREVIOUS_SHA, builtFrom: "working-tree", treeClean: false })}\n`);
  process.env.PATH = `${bin}:${process.env.PATH}`;
  process.env.FAKE_DOCKER_STATE = dockerState;
  process.env.ENG_MCP_COMMIT_TREE_ROOT = path.join(dir, "trees");
  process.env.ENG_MCP_DEPLOY_PROVENANCE_FILE = provenance;
  process.env.ENG_MCP_SHIP_LOCK_FILE = path.join(dir, "no-ship.lock");
  process.env.ENG_MCP_SHIP_LOCK_AUDIT_FILE = path.join(dir, "ship-lock.jsonl");
  delete process.env.ENG_MCP_COMMIT;
  return { dir, mono, proj, configFile, stateFile, dockerState, provenance, git, head: () => git("rev-parse", "HEAD").trim() };
}

const docker = async (fx: Fixture) => JSON.parse(await readFile(fx.dockerState, "utf8"));
const readState = async (fx: Fixture) => JSON.parse(await readFile(fx.stateFile, "utf8"));
const provenanceLines = async (fx: Fixture) => (await readFile(fx.provenance, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
const MUTATIONS = new Set(["rename", "stop", "rm", "start", "tag"]);
const mutationCalls = (log: string[][] = []) => log.filter((args) => MUTATIONS.has(args[0]) || (args[0] === "run" && args[1] === "-d") || args[0] === "build");

// sourceHash semantics of the pipeline (tracked blobs, byte-sorted, relative to the project)
function expectedSourceHash(fx: Fixture, commit: string): string {
  const listing = fx.git("ls-tree", "-r", "-z", commit, "--", "proj").split("\0").filter(Boolean)
    .map((record) => record.slice(record.indexOf("\t") + 1)).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const hash = createHash("sha256");
  for (const file of listing) hash.update(file.slice("proj/".length)).update("\0").update(execFileSync("git", ["-C", fx.mono, "show", `${commit}:${file}`])).update("\0");
  return hash.digest("hex");
}

async function markCandidatePass(fx: Fixture) {
  const state = await readState(fx);
  await writeFile(fx.stateFile, JSON.stringify({ ...state, candidateStatus: "PASS", candidateImageId: state.imageId }));
}

test("P1: dirty deploy paths -> DEPLOY_DIRTY_TREE listing every dirty file; ignored and non-deploy files never count; zero build", async () => {
  const fx = await fixture();
  try {
    const sha = fx.head();
    await writeFile(path.join(fx.proj, "src", "app.ts"), "export const app = 2;\n");
    await writeFile(path.join(fx.proj, "src", "untracked.ts"), "export {};\n");
    await writeFile(path.join(fx.proj, "src", "secret.token.json"), '{"tokenHash":"x"}\n');
    await writeFile(path.join(fx.proj, "verify.json"), '{"dirty":true}\n');
    await writeFile(path.join(fx.mono, "outside.txt"), "dirty outside the project\n");
    assert.deepEqual(await listDirtyDeployFiles(fx.proj), ["src/app.ts", "src/untracked.ts"]);
    await assert.rejects(execute("test", fx.configFile, { commit: sha }), (error: Error & { code?: string }) => {
      assert.equal(error.code, "DEPLOY_DIRTY_TREE");
      assert.match(error.message, /^DEPLOY_DIRTY_TREE: 2 file\(s\).*src\/app\.ts, src\/untracked\.ts$/);
      assert.doesNotMatch(error.message, /token\.json|verify\.json|outside/);
      return true;
    });
    for (const stage of ["build", "candidate", "deploy"]) await assert.rejects(execute(stage, fx.configFile, { commit: sha }), /^Error: DEPLOY_DIRTY_TREE\b/);
    assert.equal(mutationCalls((await docker(fx)).log).length, 0);
    assert.equal((await provenanceLines(fx)).length, 1, "no deploy line was written");
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});

test("P1: only non-deploy files dirty (verify.json) -> tree counts as clean", async () => {
  const fx = await fixture();
  try {
    await writeFile(path.join(fx.proj, "verify.json"), '{"dirty":true}\n');
    assert.deepEqual(await listDirtyDeployFiles(fx.proj), []);
    const state = await execute("test", fx.configFile, { commit: fx.head() });
    assert.equal(state.testStatus, "PASS");
    assert.equal(state.treeClean, true);
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});

test("P2: clean commit -> image built from the ISOLATED commit tree; imageTag == commit tag; revision label == sha; one image per commit", async () => {
  const fx = await fixture();
  try {
    const sha = fx.head();
    // gitignored token-hash file in the canonical tree: the old working-tree build baked it in
    await writeFile(path.join(fx.proj, "src", "auth-session.token.json"), '{"tokenHash":"x"}\n');
    const tested = await execute("test", fx.configFile, { commit: sha });
    assert.equal(tested.testStatus, "PASS");
    assert.equal(tested.builtFrom, "commit");
    assert.equal(tested.commitSha, sha);
    assert.equal(tested.testSourceHash, expectedSourceHash(fx, sha));
    const images = await docker(fx);
    const build = images.log.find((args: string[]) => args[0] === "build");
    const context = build.at(-1);
    assert.ok(context.startsWith(path.join(fx.dir, "trees") + path.sep), "build context is the isolated commit tree");
    assert.ok(!context.startsWith(fx.proj));
    const built = images.images[tested.testImageId];
    assert.equal(built.labels["org.opencontainers.image.revision"], sha);
    assert.equal(built.labels["io.memoryos.eng-mcp.built-from"], "commit");
    assert.ok(built.files.includes("src/app.ts") && !built.files.includes("src/auth-session.token.json") && !built.files.some((file: string) => file.includes("outside")));
    const builtState = await execute("build", fx.configFile, { commit: sha });
    assert.equal(builtState.imageTag, commitImageTag("eng-mcp-candidate", sha));
    assert.equal(builtState.imageTag, `eng-mcp-candidate:commit-${sha}`);
    assert.equal(builtState.imageId, tested.testImageId);
    // same commit again: the existing commit image is reused, never rebuilt nor re-tagged
    await execute("test", fx.configFile, { commit: sha });
    const again = await execute("build", fx.configFile, { commit: sha });
    assert.equal(again.imageId, builtState.imageId);
    assert.equal((await docker(fx)).builds, 1);
    await rm(path.join(fx.dir, "trees"), { recursive: true, force: true }).catch(() => undefined);
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});

test("P2: build/candidate/deploy without a commit -> DEPLOY_COMMIT_REQUIRED; working-tree test never binds a commit", async () => {
  const fx = await fixture();
  try {
    const sha = fx.head();
    for (const stage of ["build", "candidate", "deploy"]) await assert.rejects(execute(stage, fx.configFile, {}), /^Error: DEPLOY_COMMIT_REQUIRED\b/);
    await writeFile(fx.stateFile, JSON.stringify({ testStatus: "PASS", builtFrom: "working-tree", testSourceHash: "x", testImageId: "sha256:" + "1".repeat(64) }));
    await assert.rejects(execute("build", fx.configFile, { commit: sha }), /^Error: DEPLOY_COMMIT_STATE_MISMATCH\b/);
    // commit outside HEAD history is refused
    fx.git("checkout", "-q", "-b", "side"); await writeFile(path.join(fx.proj, "src", "side.ts"), "export {};\n"); fx.git("add", "-A"); fx.git("commit", "-q", "-m", "side");
    const side = fx.head(); fx.git("checkout", "-q", "main");
    await assert.rejects(execute("test", fx.configFile, { commit: side }), /^Error: DEPLOY_COMMIT_NOT_IN_HISTORY\b/);
    await assert.rejects(execute("test", fx.configFile, { commit: "b".repeat(40) }), /^Error: DEPLOY_COMMIT_NOT_FOUND\b/);
    assert.equal(mutationCalls((await docker(fx)).log).length, 0);
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});

test("P2: an existing commit tag with another revision is a conflict, never overwritten", async () => {
  const fx = await fixture();
  try {
    const sha = fx.head();
    const state = await docker(fx);
    state.images["sha256:" + "9".repeat(64)] = { labels: { "org.opencontainers.image.revision": "c".repeat(40) } };
    state.tags[`eng-mcp-candidate:commit-${sha}`] = "sha256:" + "9".repeat(64);
    await writeFile(fx.dockerState, JSON.stringify(state));
    await assert.rejects(execute("test", fx.configFile, { commit: sha }), /^Error: IMAGE_TAG_COMMIT_CONFLICT\b/);
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});

test("P3+P4: deploy writes provenance BEFORE mutation; a failed deploy rolls back and the trail + state keep referencing the SHA", async () => {
  const fx = await fixture();
  try {
    const sha = fx.head();
    await execute("test", fx.configFile, { commit: sha });
    await execute("build", fx.configFile, { commit: sha });
    await markCandidatePass(fx);
    process.env.FAKE_DOCKER_FAIL_RUN = "1";
    try { await assert.rejects(execute("deploy", fx.configFile, { commit: sha, jobId: "job-pin-1" }), /RELEASE_COMMAND_FAILED:docker/); }
    finally { delete process.env.FAKE_DOCKER_FAIL_RUN; }
    const lines = await provenanceLines(fx);
    assert.deepEqual(lines.map((line) => line.event), ["retroactive_record", "deploy_started", "deploy_failed", "rollback"]);
    const started = lines[1];
    assert.equal(started.commitSha, sha);
    assert.equal(started.imageTag, `eng-mcp-candidate:commit-${sha}`);
    assert.equal(started.treeClean, true);
    assert.equal(started.builtFrom, "commit");
    assert.equal(started.previousCommitSha, PREVIOUS_SHA, "previous commit resolved from the retroactive record");
    assert.equal(started.jobId, "job-pin-1");
    assert.equal(lines[2].errorCode, "RELEASE_COMMAND_FAILED");
    assert.equal(lines[3].commitSha, PREVIOUS_SHA);
    assert.equal(lines[3].imageTag, "eng-mcp-candidate:candidate-legacy");
    assert.equal(lines[3].rolledBackFromCommitSha, sha);
    const state = await readState(fx);
    assert.equal(state.currentCommitSha, PREVIOUS_SHA);
    assert.equal(state.currentRelease, "eng-mcp-candidate:candidate-legacy");
    assert.equal(state.previousCommitSha, PREVIOUS_SHA);
    const log = (await docker(fx)).log.map((args: string[]) => args[0] === "run" ? `run ${args[1]}` : args[0]);
    assert.deepEqual(log.filter((op: string) => ["rename", "stop", "run -d", "rm", "start"].includes(op)), ["rename", "stop", "run -d", "rm", "rename", "start"]);
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});

test("P1+P3: tree dirtied between candidate and deploy -> DEPLOY_DIRTY_TREE with zero production mutation and no deploy line", async () => {
  const fx = await fixture();
  try {
    const sha = fx.head();
    await execute("test", fx.configFile, { commit: sha });
    await execute("build", fx.configFile, { commit: sha });
    await markCandidatePass(fx);
    await writeFile(path.join(fx.proj, "scripts", "late.mjs"), "export {};\n");
    const before = (await docker(fx)).log.length;
    await assert.rejects(execute("deploy", fx.configFile, { commit: sha }), (error: Error) => { assert.match(error.message, /^DEPLOY_DIRTY_TREE: 1 file\(s\).*scripts\/late\.mjs$/); return true; });
    const after = (await docker(fx)).log.slice(before);
    assert.equal(mutationCalls(after).length, 0);
    assert.deepEqual((await provenanceLines(fx)).map((line) => line.event), ["retroactive_record"]);
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});

test("provenance audit unwritable -> deploy refused before any production mutation (fail-closed)", async () => {
  const fx = await fixture();
  try {
    const sha = fx.head();
    await execute("test", fx.configFile, { commit: sha });
    await execute("build", fx.configFile, { commit: sha });
    await markCandidatePass(fx);
    process.env.ENG_MCP_DEPLOY_PROVENANCE_FILE = path.join(fx.stateFile, "not-a-dir", "p.jsonl");
    const before = (await docker(fx)).log.length;
    await assert.rejects(execute("deploy", fx.configFile, { commit: sha }));
    assert.equal(mutationCalls((await docker(fx)).log.slice(before)).length, 0);
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});

test("token-hash files are pointed at through the identity repository mount (never baked into the image)", () => {
  const config = { canonicalSource: "/opt/memoryos/eng-mcp", production: { repositoryMount: "/opt/memoryos:/opt/memoryos" } };
  assert.deepEqual(tokenHashFileArgs(config, () => true), ["-e", "ENG_MCP_AUTH_SESSION_TOKEN_FILE=/opt/memoryos/eng-mcp/src/auth-session.token.json", "-e", "ENG_MCP_IMAGE_RELAY_TOKEN_FILE=/opt/memoryos/eng-mcp/src/imageEdit.token.json"]);
  assert.deepEqual(tokenHashFileArgs(config, () => false), []);
  assert.deepEqual(tokenHashFileArgs({ canonicalSource: "/elsewhere/proj", production: { repositoryMount: "/opt/memoryos:/opt/memoryos" } }, () => true), []);
  assert.ok(DEPLOY_PATHS.includes("scripts") && DEPLOY_PATHS.includes("tsconfig.json") && DEPLOY_PATHS.includes(".claude"));
});

function postRunner(socketPath: string, payload: unknown): Promise<{ httpStatus: number; body: any }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const req = httpRequest({ socketPath, path: "/v1/release", method: "POST", headers: { "content-type": "application/json" } }, (incoming) => {
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => { try { resolve({ httpStatus: incoming.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); } catch (error) { reject(error); } });
    });
    req.on("error", reject);
    req.end(JSON.stringify(payload));
  });
}

test("runner: build/candidate/deploy without commit -> 400 DEPLOY_COMMIT_REQUIRED; commit threaded to the job; commit refused off the pipeline stages", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "deploy-pin-runner-"));
  const executed: Array<{ operation: string; commit?: string }> = [];
  const runner = createReleaseRunner({ socketPath: path.join(dir, "r.sock"), jobsDir: path.join(dir, "jobs"), lockPath: path.join(dir, "r.lock"), pipeline: "/bin/true", execute: async (job: { operation: string; commit?: string }) => { executed.push({ operation: job.operation, commit: job.commit }); return { success: true, exitCode: 0, durationMs: 1, stdout: "", stderr: "", truncated: false, timedOut: false }; } });
  await runner.recover();
  await new Promise<void>((resolve) => runner.server.listen(path.join(dir, "r.sock"), resolve));
  try {
    const sock = path.join(dir, "r.sock"); const sha = "d".repeat(40);
    for (const operation of ["build", "candidate", "deploy"]) {
      const refused = await postRunner(sock, { operation });
      assert.equal(refused.httpStatus, 400);
      assert.equal(refused.body.error, "DEPLOY_COMMIT_REQUIRED");
    }
    assert.equal((await postRunner(sock, { operation: "smoke", commit: sha })).body.error, "COMMIT_NOT_ALLOWED_FOR_OPERATION");
    assert.equal((await postRunner(sock, { operation: "build", commit: "HEAD" })).body.error, "COMMIT_SHA_INVALID");
    const built = await postRunner(sock, { operation: "build", commit: sha });
    assert.equal(built.httpStatus, 200);
    assert.equal(built.body.job.commit, sha);
    const testOnly = await postRunner(sock, { operation: "test" });
    assert.equal(testOnly.httpStatus, 200, "the deploy-free working-tree test stays available");
    const queued = await postRunner(sock, { operation: "deploy", commit: sha });
    assert.equal(queued.httpStatus, 202);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.deepEqual(executed, [{ operation: "build", commit: sha }, { operation: "test", commit: undefined }, { operation: "deploy", commit: sha }]);
  } finally {
    await new Promise<void>((resolve) => runner.server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("MCP pipeline: fresh run without commitSha -> DEPLOY_COMMIT_REQUIRED with ZERO runner calls; with commitSha every pipeline stage carries it", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "deploy-pin-mcp-"));
  const socketPath = path.join(dir, "runner.sock");
  const bodies: any[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")); bodies.push(body);
      const reply = body.operation === "deploy" ? { operation: "deploy", accepted: true, status: "queued", jobId: "0123456789abcdef0123" } : { operation: body.operation, success: true, exitCode: 0, job: { operation: body.operation, status: "success" } };
      response.writeHead(body.operation === "deploy" ? 202 : 200, { "content-type": "application/json" }); response.end(JSON.stringify(reply));
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  const previous = process.env.ENG_MCP_RELEASE_SOCKET; process.env.ENG_MCP_RELEASE_SOCKET = socketPath;
  try {
    const refused = await runOfficialReleasePipeline() as Record<string, unknown>;
    assert.equal(refused.success, false); assert.equal(refused.error, "DEPLOY_COMMIT_REQUIRED"); assert.equal(bodies.length, 0);
    assert.equal((await runOfficialReleasePipeline(undefined, "HEAD") as Record<string, unknown>).error, "DEPLOY_COMMIT_REQUIRED");
    const sha = "e".repeat(40);
    const pending = await runOfficialReleasePipeline(undefined, sha) as Record<string, unknown>;
    assert.equal(pending.pending, true); assert.equal(pending.commitSha, sha);
    assert.deepEqual(bodies, ["test", "build", "candidate", "deploy"].map((operation) => ({ operation, commit: sha })));
  } finally {
    process.env.ENG_MCP_RELEASE_SOCKET = previous;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
