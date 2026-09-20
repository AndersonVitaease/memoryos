// GIT-MERGE-01: engineering.git.merge governed layered merge — integration through
// the MCP HTTP harness (real git, real bare origin over the filesystem) plus direct
// runGitMerge calls: layer 1 AUTO_FF (fast-forward, no merge commit), layer 2
// NATIVE (disjoint divergences → one merge commit proven by parents + tree sha +
// predicted-vs-actual paths), layer 3 ASSISTED (overlapping paths → NEVER executes,
// structured conflict list, zero mutation), NOTHING_TO_MERGE, blockers, input
// validation, approval/acknowledgment gates, restore-on-failure (scripted runners)
// and the audit trail. The origin URL never appears in any report.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import testRunner from "node:test";

// GIT-MERGE-01 TEMPORARY DEBUG SHIM (remove after diagnosis): this file passes
// 14/14 in file and related modes but fails exactly once inside the 10-worker
// suite run (two runs, 1F each). Shadow the test registrar to record every test
// outcome of this file to a sibling JSONL dump so the failing test's identity
// and error survive the run. The dump write is best-effort and silent.
function test(name: string, fn: () => void | Promise<void>) {
  return testRunner(name, async () => {
    try {
      await fn();
      writeShimDump(name, false, null);
    } catch (error) {
      writeShimDump(name, true, String((error as { message?: string })?.message ?? error));
      throw error;
    }
  });
}

function writeShimDump(name: string, failed: boolean, error: string | null): void {
  try {
    writeFileSync(new URL("./.rg-merge-shim.json", import.meta.url), `${JSON.stringify({ name, failed, error })}\n`, { flag: "a" });
  } catch { /* debug dump is best-effort */ }
}
import { createEngineeringHttpServer } from "../src/server.js";
import { runGitFetch } from "../src/gitFetch.js";
import { GitMergeError, runGitMerge, type GitMergeDeps, type GitMergeInput, type GitMergeReport } from "../src/gitMerge.js";

const sha256 = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");
const hasCode = (code: string) => (error: unknown) => error instanceof GitMergeError && error.code === code;

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

type MergeFixture = {
  base: string;
  root: string;
  origin: string;
  auditFile: string;
  credentials: string;
  head: () => string;
  originHead: () => string;
};

function makeMergeFixture(): MergeFixture {
  const base = mkdtempSync(path.join(tmpdir(), "eng-mcp-gitmerge-"));
  const root = path.join(base, "work");
  const origin = path.join(base, "origin.git");
  execFileSync("git", ["init", "--bare", origin]);
  execFileSync("git", ["init", root]);
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  writeFileSync(path.join(root, "app.js"), "export const hello = 'world';\n");
  execFileSync("git", ["add", "app.js"], { cwd: root });
  execFileSync("git", ["commit", "-m", "fixture initial"], { cwd: root });
  execFileSync("git", ["branch", "-M", "main"], { cwd: root });
  execFileSync("git", ["remote", "add", "origin", origin], { cwd: root });
  execFileSync("git", ["push", "origin", "refs/heads/main:refs/heads/main"], { cwd: root });
  execFileSync("git", ["symbolic-ref", "HEAD", "refs/heads/main"], { cwd: origin });
  const credentials = path.join(base, "git-credentials");
  writeFileSync(credentials, "https://x-access-token:fixture-credential@github.com\n");
  const auditFile = path.join(base, "audit", "git-merge.jsonl");
  return {
    base, root, origin, credentials, auditFile,
    head: () => git(root, ["rev-parse", "refs/heads/main"]).trim(),
    originHead: () => git(origin, ["rev-parse", "refs/heads/main"]).trim(),
  };
}

function localCommit(fixture: MergeFixture, file: string, content: string): string {
  writeFileSync(path.join(fixture.root, file), content);
  execFileSync("git", ["add", "-A"], { cwd: fixture.root });
  execFileSync("git", ["commit", "-m", `local: ${file}`], { cwd: fixture.root });
  return fixture.head();
}

// Simulates a second actor pushing to the origin (the divergence source).
function remoteCommit(fixture: MergeFixture, file: string, content: string): string {
  const clone = path.join(fixture.base, `clone-${Date.now()}-${Math.random()}`);
  execFileSync("git", ["clone", fixture.origin, clone]);
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: clone });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: clone });
  writeFileSync(path.join(clone, file), content);
  execFileSync("git", ["add", "-A"], { cwd: clone });
  execFileSync("git", ["commit", "-m", `remote: ${file}`], { cwd: clone });
  execFileSync("git", ["push", "origin", "refs/heads/main:refs/heads/main"], { cwd: clone });
  rmSync(clone, { recursive: true, force: true });
  return fixture.originHead();
}

function runMerge(fixture: MergeFixture, input: GitMergeInput): Promise<GitMergeReport> {
  return runGitMerge(input, { repoRoot: fixture.root, auditFile: fixture.auditFile });
}

// The governed fetch step of the cycle — refreshes the work repo's remote-tracking
// refs so the merge layer sees the real divergence (fetch → merge → push).
async function fetchOrigin(fixture: MergeFixture): Promise<void> {
  await runGitFetch({}, { repoRoot: fixture.root, credentialFile: fixture.credentials, auditFile: path.join(fixture.base, "audit", "git-fetch.jsonl") });
}

const EXECUTE: GitMergeInput = { execute: true, approval: { approved: true }, acknowledgeMerge: true };

async function startServer(fixture: MergeFixture, scopes: string[]) {
  const token = "merge-integration-token";
  const tokenRegistry = [{ tokenHash: sha256(token), subject: "merge-tester", scopes: [...scopes], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: fixture.root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, endpoint: `http://127.0.0.1:${address.port}/mcp`, token };
}

async function mcp(endpoint: string, token: string, id: number, method: string, params: unknown) {
  const response = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  assert.equal(response.status, 200);
  const body = await response.text();
  const data = body.split(/\r?\n/).find((line) => line.startsWith("data: "));
  assert.ok(data);
  return JSON.parse(data.slice(6));
}

function payload(call: { result?: { content?: Array<{ type: string; text?: string }> } }): Record<string, unknown> {
  const text = call.result?.content?.find((part) => part.type === "text")?.text ?? "";
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return {}; }
}

test("git.merge refuses callers without the engineering:git:merge scope", async () => {
  const fixture = makeMergeFixture();
  const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:write", "engineering:git"]);
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.merge", arguments: {} });
    const text = JSON.stringify(call.result);
    assert.ok(text.includes("AUTHORIZATION_SCOPE_REQUIRED"), `expected scope refusal, got ${text.slice(0, 300)}`);
  } finally { server.close(); }
});

test("git.merge fast-forwards through the MCP HTTP layer (layer 1 AUTO_FF)", async () => {
  const fixture = makeMergeFixture();
  const { server, endpoint, token } = await startServer(fixture, ["engineering:read", "engineering:git:merge"]);
  try {
    await mcp(endpoint, token, 1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(endpoint, token, 2, "notifications/initialized", {});
    remoteCommit(fixture, "remote-file.txt", "remote change\n");
    await fetchOrigin(fixture);
    const call = await mcp(endpoint, token, 3, "tools/call", { name: "engineering.git.merge", arguments: { execute: true, approval: { approved: true }, acknowledgeMerge: true } });
    const report = payload(call);
    assert.equal(report.status, "MERGED");
    assert.equal(report.layer, "AUTO_FF");
    assert.equal(report.mutationPerformed, true);
    assert.equal(report.headAfter, fixture.originHead());
  } finally { server.close(); }
});

test("PLAN reports layer AUTO_FF read-only for a strictly-behind branch", async () => {
  const fixture = makeMergeFixture();
  remoteCommit(fixture, "remote-file.txt", "remote change\n");
  await fetchOrigin(fixture);
  const headBefore = fixture.head();
  const report = await runMerge(fixture, {});
  assert.equal(report.status, "PLAN");
  assert.equal(report.layer, "AUTO_FF");
  assert.equal(report.behind, 1);
  assert.equal(report.ahead, 0);
  assert.equal(report.mutationPerformed, false);
  assert.equal(report.headBefore, headBefore);
  assert.equal(report.headAfter, headBefore);
  assert.equal(report.zeroMutationProof.headUnchanged, true);
  assert.equal(report.zeroMutationProof.worktreeStatusIdentical, true);
  assert.ok(report.requires.length > 0, "PLAN must state what execution requires");
  assert.ok(!JSON.stringify(report).includes("origin.git"), "origin URL must never leak");
});

test("execute requires acknowledgment then approval", async () => {
  const fixture = makeMergeFixture();
  remoteCommit(fixture, "remote-file.txt", "remote change\n");
  await fetchOrigin(fixture);
  const before = fixture.head();
  await assert.rejects(runMerge(fixture, { execute: true }), hasCode("MERGE_ACKNOWLEDGMENT_REQUIRED"));
  await assert.rejects(runMerge(fixture, { execute: true, acknowledgeMerge: true }), hasCode("MERGE_APPROVAL_REQUIRED"));
  await assert.rejects(runMerge(fixture, { execute: true, approval: { approved: true } }), hasCode("MERGE_ACKNOWLEDGMENT_REQUIRED"));
  assert.equal(fixture.head(), before, "refused executions must not move HEAD");
});

test("layer 1 AUTO_FF executes a pure fast-forward with snapshot proofs", async () => {
  const fixture = makeMergeFixture();
  remoteCommit(fixture, "remote-file.txt", "remote change\n");
  await fetchOrigin(fixture);
  const before = fixture.head();
  const report = await runMerge(fixture, EXECUTE);
  assert.equal(report.status, "MERGED");
  assert.equal(report.layer, "AUTO_FF");
  assert.equal(report.mutationPerformed, true);
  assert.equal(report.headBefore, before);
  assert.equal(report.headAfter, fixture.originHead());
  assert.equal(report.zeroMutationProof.worktreeStatusIdentical, true);
  assert.equal(report.zeroMutationProof.tagsUnchanged, true);
  assert.equal(report.zeroMutationProof.otherRefsUnchanged, true);
  // no merge commit: HEAD after the ff has exactly ONE parent
  const parents = git(fixture.root, ["rev-list", "--parents", "-n", "1", "HEAD"]).trim().split(/\s+/);
  assert.equal(parents.length, 2, "fast-forward must not create a merge commit");
  // audit trail written with the layer
  const audit = readFileSync(fixture.auditFile, "utf8").trim().split(/\r?\n/);
  const last = JSON.parse(audit[audit.length - 1]) as Record<string, unknown>;
  assert.equal(last.layer, "AUTO_FF");
  assert.equal(last.status, "MERGED");
});

test("layer 2 NATIVE merges disjoint divergences into one merge commit", async () => {
  const fixture = makeMergeFixture();
  const localHead = localCommit(fixture, "local-file.txt", "local change\n");
  const remoteHead = remoteCommit(fixture, "remote-file.txt", "remote change\n");
  await fetchOrigin(fixture);
  const baseSha = git(fixture.root, ["merge-base", "refs/heads/main", `refs/remotes/origin/main`]).trim();
  const plan = await runMerge(fixture, {});
  assert.equal(plan.status, "PLAN");
  assert.equal(plan.layer, "NATIVE");
  assert.equal(plan.ahead, 1);
  assert.equal(plan.behind, 1);
  assert.deepEqual(plan.predictedPaths, ["local-file.txt", "remote-file.txt"]);
  assert.equal(plan.conflicts.length, 0);

  const report = await runMerge(fixture, EXECUTE);
  assert.equal(report.status, "MERGED");
  assert.equal(report.layer, "NATIVE");
  assert.equal(report.mutationPerformed, true);
  assert.equal(report.headAfter, fixture.head());
  assert.ok(report.mergeCommit, "native merge must report the merge commit");
  assert.equal(report.mergeCommit?.sha, report.headAfter);
  assert.deepEqual(report.mergeCommit?.parents, [localHead, remoteHead]);
  assert.equal(report.mergeCommit?.tree, git(fixture.root, ["rev-parse", "HEAD^{tree}"]).trim());
  assert.ok(report.mergeCommit?.message.startsWith("Merge origin/main into main — governed git.merge"), `unexpected message: ${report.mergeCommit?.message}`);
  assert.deepEqual(report.actualChangedPaths, ["local-file.txt", "remote-file.txt"]);
  assert.equal(report.zeroMutationProof.worktreeStatusIdentical, true);
  assert.equal(report.zeroMutationProof.tagsUnchanged, true);
  assert.equal(report.zeroMutationProof.otherRefsUnchanged, true);
  assert.ok(!JSON.stringify(report).includes("origin.git"), "origin URL must never leak");
  assert.ok(baseSha.length === 40, "merge base must have been computed");
});

test("layer 3 ASSISTED stops on overlapping paths with zero mutation — never executes", async () => {
  const fixture = makeMergeFixture();
  localCommit(fixture, "app.js", "local change on app.js\n");
  const remoteHead = remoteCommit(fixture, "app.js", "remote change on app.js\n");
  await fetchOrigin(fixture);
  const headBefore = fixture.head();
  const plan = await runMerge(fixture, {});
  assert.equal(plan.status, "PLAN");
  assert.equal(plan.layer, "ASSISTED");
  assert.equal(plan.ahead, 1);
  assert.equal(plan.behind, 1);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].path, "app.js");
  assert.equal(plan.conflicts[0].localChange, "M");
  assert.equal(plan.conflicts[0].remoteChange, "M");
  assert.ok(plan.conflicts[0].baseSha.length === 12);
  assert.ok(plan.conflicts[0].recommendation.length > 20);

  // execute WITH approval+ack must STILL not merge — conflicts are operator work
  const report = await runMerge(fixture, EXECUTE);
  assert.equal(report.status, "ASSISTED");
  assert.equal(report.layer, "ASSISTED");
  assert.equal(report.mutationPerformed, false);
  assert.equal(report.headAfter, headBefore);
  assert.equal(report.headBefore, headBefore);
  assert.equal(report.zeroMutationProof.headUnchanged, true);
  assert.equal(report.zeroMutationProof.worktreeStatusIdentical, true);
  assert.equal(report.zeroMutationProof.tagsUnchanged, true);
  assert.equal(report.zeroMutationProof.otherRefsUnchanged, true);
  assert.equal(readFileSync(path.join(fixture.root, "app.js"), "utf8"), "local change on app.js\n", "the worktree file must be untouched");
  assert.equal(fixture.originHead(), remoteHead, "origin must be untouched");
});

test("NOTHING_TO_MERGE covers 0/0 and ahead-only (recommends push)", async () => {
  const clean = makeMergeFixture();
  const cleanReport = await runMerge(clean, {});
  assert.equal(cleanReport.status, "NOTHING_TO_MERGE");
  assert.equal(cleanReport.layer, null);
  assert.equal(cleanReport.behind, 0);
  assert.equal(cleanReport.ahead, 0);
  assert.ok(cleanReport.findings[0].includes("nothing to merge"));

  const ahead = makeMergeFixture();
  localCommit(ahead, "ahead-file.txt", "local only\n");
  const aheadReport = await runMerge(ahead, {});
  assert.equal(aheadReport.status, "NOTHING_TO_MERGE");
  assert.equal(aheadReport.ahead, 1);
  assert.equal(aheadReport.behind, 0);
  assert.ok(aheadReport.findings[0].includes("engineering.git.push"), `finding must recommend push: ${aheadReport.findings[0]}`);
  // execute on an ahead-only state is a harmless no-op (no gates triggered)
  const aheadExecute = await runMerge(ahead, EXECUTE);
  assert.equal(aheadExecute.status, "NOTHING_TO_MERGE");
  assert.equal(aheadExecute.mutationPerformed, false);
});

test("blockers: uncommitted changes refuse PLAN and execute without mutating", async () => {
  const fixture = makeMergeFixture();
  remoteCommit(fixture, "remote-file.txt", "remote change\n");
  await fetchOrigin(fixture);
  writeFileSync(path.join(fixture.root, "app.js"), "dirty local edit\n");
  const headBefore = fixture.head();
  const plan = await runMerge(fixture, {});
  assert.equal(plan.status, "BLOCKED");
  assert.ok(plan.blockers.includes("UNCOMMITTED_CHANGES"), `blockers: ${plan.blockers.join(", ")}`);
  const executed = await runMerge(fixture, EXECUTE);
  assert.equal(executed.status, "BLOCKED");
  assert.ok(executed.blockers.includes("UNCOMMITTED_CHANGES"));
  assert.equal(executed.mutationPerformed, false);
  assert.equal(fixture.head(), headBefore);
});

test("blockers: branch not checked out, missing origin ref and detached HEAD", async () => {
  const fixture = makeMergeFixture();
  execFileSync("git", ["checkout", "-b", "dev"], { cwd: fixture.root });
  const wrongBranch = await runMerge(fixture, {});
  assert.equal(wrongBranch.status, "BLOCKED");
  assert.deepEqual(wrongBranch.blockers, ["BRANCH_NOT_CHECKED_OUT"]);

  const missingRemote = await runMerge(fixture, { branch: "dev" });
  assert.equal(missingRemote.status, "BLOCKED");
  assert.deepEqual(missingRemote.blockers, ["MERGE_REMOTE_REF_MISSING"]);
  assert.equal(missingRemote.branch, "dev");

  execFileSync("git", ["checkout", "--detach"], { cwd: fixture.root });
  const detached = await runMerge(fixture, {});
  assert.equal(detached.status, "BLOCKED");
  assert.ok(detached.blockers.includes("MERGE_DETACHED_HEAD"));
  assert.equal(detached.checkedOutBranch, null);
});

test("input validation rejects unsafe branch names and unknown keys", async () => {
  const fixture = makeMergeFixture();
  for (const branch of ["HEAD", "a..b", "refs/heads/main", "-x", "main extra"]) {
    await assert.rejects(runMerge(fixture, { branch }), hasCode("MERGE_INPUT_FORBIDDEN"), `branch ${JSON.stringify(branch)} must be rejected`);
  }
  await assert.rejects(runGitMerge({ force: true } as unknown as GitMergeInput, { repoRoot: fixture.root, auditFile: null }), hasCode("MERGE_INPUT_FORBIDDEN"));
});

test("unexpected merge failure aborts and restores the pre-merge head (RESTORED)", async () => {
  const HEAD = "1".repeat(40);
  const REMOTE = "2".repeat(40);
  const BASE = "3".repeat(40);
  const scripted: GitMergeDeps["executeGit"] = async (args) => {
    const joined = args.join(" ");
    if (joined.startsWith("status")) return { stdout: "", stderr: "", exitCode: 0 };
    if (joined === "rev-parse HEAD") return { stdout: `${HEAD}\n`, stderr: "", exitCode: 0 };
    if (joined.startsWith("symbolic-ref")) return { stdout: "refs/heads/main\n", stderr: "", exitCode: 0 };
    if (joined.startsWith("for-each-ref")) return { stdout: `refs/heads/main\t${HEAD}\nrefs/remotes/origin/main\t${REMOTE}\n`, stderr: "", exitCode: 0 };
    if (joined.startsWith("rev-parse --verify") && joined.includes("MERGE_HEAD")) return { stdout: `${REMOTE}\n`, stderr: "", exitCode: 0 };
    if (joined.startsWith("rev-parse --verify")) return { stdout: `${REMOTE}\n`, stderr: "", exitCode: 0 };
    if (joined.startsWith("rev-list --left-right")) return { stdout: "1\t1\n", stderr: "", exitCode: 0 };
    if (joined.startsWith("merge-base")) return { stdout: `${BASE}\n`, stderr: "", exitCode: 0 };
    if (joined.startsWith("diff --name-status") && joined.includes("refs/remotes/origin/main")) return { stdout: "M\tremote.txt\n", stderr: "", exitCode: 0 };
    if (joined.startsWith("diff --name-status")) return { stdout: "M\tlocal.txt\n", stderr: "", exitCode: 0 };
    if (joined.startsWith("merge --abort")) return { stdout: "", stderr: "", exitCode: 0 };
    if (joined.startsWith("merge")) return { stdout: "", stderr: "CONFLICT (content): Merge conflict in local.txt\n", exitCode: 1 };
    return { stdout: "", stderr: `unexpected git args: ${joined}`, exitCode: 128 };
  };
  const report = await runGitMerge(EXECUTE, { repoRoot: "/unused", executeGit: scripted, auditFile: null });
  assert.equal(report.status, "RESTORED");
  assert.equal(report.code, "MERGE_EXECUTION_FAILED");
  assert.equal(report.mutationPerformed, true);
  assert.ok(report.findings.some((finding) => finding.includes("restored")), `findings: ${report.findings.join(" | ")}`);
  assert.equal(report.zeroMutationProof.worktreeStatusIdentical, true);
  assert.equal(report.headAfter, HEAD);
});

test("postcheck failure restores the pre-merge head (RESTORED, MERGE_POSTCHECK_FAILED)", async () => {
  const HEAD = "1".repeat(40);
  const REMOTE = "2".repeat(40);
  const BASE = "3".repeat(40);
  const TREE = "4".repeat(40);
  const scripted: GitMergeDeps["executeGit"] = async (args) => {
    const joined = args.join(" ");
    if (joined.startsWith("status")) return { stdout: "", stderr: "", exitCode: 0 };
    if (joined === "rev-parse HEAD") return { stdout: `${HEAD}\n`, stderr: "", exitCode: 0 };
    if (joined.startsWith("symbolic-ref")) return { stdout: "refs/heads/main\n", stderr: "", exitCode: 0 };
    if (joined.startsWith("for-each-ref")) return { stdout: `refs/heads/main\t${HEAD}\nrefs/remotes/origin/main\t${REMOTE}\n`, stderr: "", exitCode: 0 };
    if (joined.startsWith("rev-parse --verify")) return { stdout: `${REMOTE}\n`, stderr: "", exitCode: 0 };
    if (joined.includes("^{tree}")) return { stdout: `${TREE}\n`, stderr: "", exitCode: 0 };
    if (joined.startsWith("rev-list --left-right")) return { stdout: "1\t1\n", stderr: "", exitCode: 0 };
    if (joined.startsWith("merge-base")) return { stdout: `${BASE}\n`, stderr: "", exitCode: 0 };
    if (joined.startsWith("diff --name-status") && joined.includes("refs/remotes/origin/main")) return { stdout: "M\tremote.txt\n", stderr: "", exitCode: 0 };
    if (joined.startsWith("diff --name-status")) return { stdout: "M\tlocal.txt\n", stderr: "", exitCode: 0 };
    if (joined.startsWith("merge")) return { stdout: "Merge made by the 'ort' strategy.\n", stderr: "", exitCode: 0 };
    if (joined.startsWith("reset --hard")) return { stdout: `HEAD is now at ${HEAD}\n`, stderr: "", exitCode: 0 };
    return { stdout: "", stderr: `unexpected git args: ${joined}`, exitCode: 128 };
  };
  // the merge "succeeds" but HEAD is reported unchanged → postcheck fails → reset --hard
  const report = await runGitMerge(EXECUTE, { repoRoot: "/unused", executeGit: scripted, auditFile: null });
  assert.equal(report.status, "RESTORED");
  assert.equal(report.code, "MERGE_POSTCHECK_FAILED");
  assert.equal(report.mutationPerformed, true);
  assert.ok(report.findings.some((finding) => finding.includes("HEAD did not advance")), `findings: ${report.findings.join(" | ")}`);
  assert.ok(report.findings.some((finding) => finding.includes("restored")), `findings: ${report.findings.join(" | ")}`);
});

test("audit trail records layer and status; nothing to merge still audits", async () => {
  const fixture = makeMergeFixture();
  await runMerge(fixture, EXECUTE);
  const lines = readFileSync(fixture.auditFile, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>);
  const last = lines[lines.length - 1];
  assert.equal(last.status, "NOTHING_TO_MERGE");
  assert.equal(last.branch, "main");
  assert.equal(last.mutation, false);
  assert.ok(typeof last.durationMs === "number");
});
