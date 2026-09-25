// GIT-MERGE-02: engineering.git.merge local-merge form — one LOCAL branch merged
// into another LOCAL branch of the same repository (worktree → main included), with
// the same three layers (AUTO_FF / NATIVE / ASSISTED), the same postchecks/restore
// discipline, zero-mutation PLAN proofs, typed errors (BRANCH_NOT_FOUND,
// MERGE_NO_OP, TARGET_DIRTY), source auto-resolution (local preferred,
// remote-tracking fallback, explicit "origin/" prefix) and the optional governed
// cleanup (deleteBranch with `git branch -d` semantics + removeWorktree of clean
// registered worktrees). Legacy sync calls without sourceBranch/into keep their
// byte-compatible behavior (contract (f)).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createEngineeringHttpServer } from "../src/server.js";
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
  const base = mkdtempSync(path.join(tmpdir(), "eng-mcp-gitmerge-local-"));
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

// A commit on ANOTHER LOCAL branch, living in its own worktree (the real mission
// shape: worktree + local branch, no upstream).
function worktreeBranch(fixture: MergeFixture, branch: string, file: string, content: string): { path: string; head: string } {
  const wt = path.join(fixture.base, `wt-${branch}`);
  git(fixture.root, ["worktree", "add", "-b", branch, wt]);
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: wt });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: wt });
  writeFileSync(path.join(wt, file), content);
  execFileSync("git", ["add", "-A"], { cwd: wt });
  execFileSync("git", ["commit", "-m", `${branch}: ${file}`], { cwd: wt });
  return { path: wt, head: git(wt, ["rev-parse", branch]).trim() };
}

function localCommit(fixture: MergeFixture, file: string, content: string): string {
  writeFileSync(path.join(fixture.root, file), content);
  execFileSync("git", ["add", "-A"], { cwd: fixture.root });
  execFileSync("git", ["commit", "-m", `local: ${file}`], { cwd: fixture.root });
  return fixture.head();
}

// A remote-tracking-only branch: pushed to origin by a second actor, fetched, but
// NEVER materialized as a local branch in the work root.
function remoteBranch(fixture: MergeFixture, branch: string, file: string, content: string): string {
  const clone = path.join(fixture.base, `clone-${branch}-${Date.now()}-${Math.random()}`);
  execFileSync("git", ["clone", fixture.origin, clone]);
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: clone });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: clone });
  execFileSync("git", ["checkout", "-B", branch], { cwd: clone });
  writeFileSync(path.join(clone, file), content);
  execFileSync("git", ["add", "-A"], { cwd: clone });
  execFileSync("git", ["commit", "-m", `${branch}: ${file}`], { cwd: clone });
  execFileSync("git", ["push", "origin", `refs/heads/${branch}:refs/heads/${branch}`], { cwd: clone });
  rmSync(clone, { recursive: true, force: true });
  git(fixture.root, ["fetch", "origin"]);
  return git(fixture.root, ["rev-parse", `refs/remotes/origin/${branch}`]).trim();
}

function runMerge(fixture: MergeFixture, input: Parameters<typeof runGitMerge>[0]): Promise<GitMergeReport> {
  return runGitMerge(input, { repoRoot: fixture.root, auditFile: fixture.auditFile });
}

const EXECUTE: Parameters<typeof runGitMerge>[0] = { mode: "execute", approval: { approved: true }, acknowledgeMerge: true };

function lastAuditLine(fixture: MergeFixture): Record<string, unknown> {
  const lines = readFileSync(fixture.auditFile, "utf8").trim().split(/\r?\n/);
  return JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
}

// (a) AUTO_FF local→local: PLAN read-only + EXECUTE fast-forwards the target branch.
test("(a) local→local AUTO_FF: PLAN read-only then execute fast-forwards into main", async () => {
  const fixture = makeMergeFixture();
  const source = worktreeBranch(fixture, "ff-src", "ff-file.txt", "ff change\n");
  const mainBefore = fixture.head();

  const plan = await runMerge(fixture, { sourceBranch: "ff-src", into: "main" });
  assert.equal(plan.status, "PLAN");
  assert.equal(plan.layer, "AUTO_FF");
  assert.equal(plan.branch, "main");
  assert.equal(plan.into, "main");
  assert.equal(plan.sourceBranch, "ff-src");
  assert.equal(plan.sourceRef, "refs/heads/ff-src");
  assert.equal(plan.sourceHead, source.head);
  assert.equal(plan.sourceKind, "local");
  assert.equal(plan.remoteHead, null);
  assert.equal(plan.behind, 1);
  assert.equal(plan.ahead, 0);
  assert.equal(plan.mutationPerformed, false);
  assert.equal(plan.headBefore, mainBefore);
  assert.equal(plan.headAfter, mainBefore);
  assert.equal(plan.zeroMutationProof.headUnchanged, true);
  assert.equal(plan.zeroMutationProof.worktreeStatusIdentical, true);
  assert.ok(plan.findings.some((f) => f.includes("informational: source branch ff-src is checked out at worktree")));

  const report = await runMerge(fixture, { sourceBranch: "ff-src", into: "main", ...EXECUTE });
  assert.equal(report.status, "MERGED");
  assert.equal(report.layer, "AUTO_FF");
  assert.equal(report.mutationPerformed, true);
  assert.equal(report.headAfter, source.head);
  assert.equal(fixture.head(), source.head, "refs/heads/main must equal the source head after the ff");
  const parents = git(fixture.root, ["rev-list", "--parents", "-n", "1", "HEAD"]).trim().split(/\s+/);
  assert.equal(parents.length, 2, "fast-forward must not create a merge commit");
  assert.equal(report.zeroMutationProof.worktreeStatusIdentical, true);
  const audit = lastAuditLine(fixture);
  assert.equal(audit.mode, "local-merge");
  assert.equal(audit.sourceBranch, "ff-src");
  assert.equal(audit.into, "main");
  assert.equal(audit.mutation, true);
});

// (b) NATIVE local→local: disjoint divergence → one merge commit, parents/tree/paths validated.
test("(b) local→local NATIVE: merge commit with validated parents, tree and paths", async () => {
  const fixture = makeMergeFixture();
  const source = worktreeBranch(fixture, "nat-src", "nat-file.txt", "nat change\n");
  const mainHead = localCommit(fixture, "main-file.txt", "main change\n");
  const baseSha = git(fixture.root, ["merge-base", "refs/heads/main", "refs/heads/nat-src"]).trim();

  const plan = await runMerge(fixture, { sourceBranch: "nat-src" });
  assert.equal(plan.status, "PLAN");
  assert.equal(plan.layer, "NATIVE");
  assert.equal(plan.into, "main");
  assert.equal(plan.ahead, 1);
  assert.equal(plan.behind, 1);
  assert.deepEqual(plan.predictedPaths, ["main-file.txt", "nat-file.txt"]);
  assert.equal(plan.conflicts.length, 0);

  const report = await runMerge(fixture, { sourceBranch: "nat-src", ...EXECUTE });
  assert.equal(report.status, "MERGED");
  assert.equal(report.layer, "NATIVE");
  assert.equal(report.mutationPerformed, true);
  assert.equal(report.headAfter, fixture.head());
  assert.ok(report.mergeCommit);
  assert.equal(report.mergeCommit?.sha, report.headAfter);
  assert.deepEqual(report.mergeCommit?.parents, [mainHead, source.head], "merge parents must be exactly [into, source]");
  assert.equal(report.mergeCommit?.tree, git(fixture.root, ["rev-parse", "HEAD^{tree}"]).trim());
  assert.ok(report.mergeCommit?.message.startsWith("Merge nat-src into main — governed git.merge (into "), `unexpected message: ${report.mergeCommit?.message}`);
  assert.deepEqual(report.actualChangedPaths, ["main-file.txt", "nat-file.txt"]);
  assert.equal(report.zeroMutationProof.worktreeStatusIdentical, true);
  assert.equal(report.zeroMutationProof.tagsUnchanged, true);
  assert.equal(report.zeroMutationProof.otherRefsUnchanged, true);
  assert.ok(!JSON.stringify(report).includes("origin.git"), "origin URL must never leak");
  assert.ok(baseSha.length === 40);
  const audit = lastAuditLine(fixture);
  assert.equal(audit.mode, "local-merge");
  assert.equal(audit.sourceBranch, "nat-src");
  assert.ok(typeof audit.sha16 === "string" && /^[0-9a-f]{16}$/.test(audit.sha16), `audit sha16: ${String(audit.sha16)}`);
});

// (c) ASSISTED local→local: overlapping paths — NEVER executes, even with approval.
test("(c) local→local ASSISTED: conflicting file stops the merge with zero mutation", async () => {
  const fixture = makeMergeFixture();
  worktreeBranch(fixture, "conf-src", "app.js", "conflicting change on app.js\n");
  localCommit(fixture, "app.js", "local change on app.js\n");
  const mainBefore = fixture.head();

  const plan = await runMerge(fixture, { sourceBranch: "conf-src", into: "main" });
  assert.equal(plan.status, "PLAN");
  assert.equal(plan.layer, "ASSISTED");
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].path, "app.js");
  assert.equal(plan.conflicts[0].localChange, "M");
  assert.equal(plan.conflicts[0].remoteChange, "M");

  const report = await runMerge(fixture, { sourceBranch: "conf-src", into: "main", ...EXECUTE });
  assert.equal(report.status, "ASSISTED");
  assert.equal(report.layer, "ASSISTED");
  assert.equal(report.mutationPerformed, false);
  assert.equal(report.headAfter, mainBefore);
  assert.equal(report.headBefore, mainBefore);
  assert.equal(report.zeroMutationProof.headUnchanged, true);
  assert.equal(report.zeroMutationProof.worktreeStatusIdentical, true);
  assert.equal(report.zeroMutationProof.tagsUnchanged, true);
  assert.equal(report.zeroMutationProof.otherRefsUnchanged, true);
  assert.equal(readFileSync(path.join(fixture.root, "app.js"), "utf8"), "local change on app.js\n", "the target file must be untouched");
});

// (d) BRANCH_NOT_FOUND for both source and into.
test("(d) unknown source or into branches are typed BRANCH_NOT_FOUND", async () => {
  const fixture = makeMergeFixture();
  await assert.rejects(runMerge(fixture, { sourceBranch: "no-such-branch" }), hasCode("BRANCH_NOT_FOUND"));
  await assert.rejects(runMerge(fixture, { sourceBranch: "ff-src", into: "no-such-branch" }), hasCode("BRANCH_NOT_FOUND"));
  await assert.rejects(runMerge(fixture, { sourceBranch: "origin/no-such-branch" }), hasCode("BRANCH_NOT_FOUND"));
});

// (e) source == into is a typed no-op.
test("(e) sourceBranch equal to into is rejected as MERGE_NO_OP", async () => {
  const fixture = makeMergeFixture();
  await assert.rejects(runMerge(fixture, { sourceBranch: "main", into: "main" }), hasCode("MERGE_NO_OP"));
});

// (f) legacy regression: a call WITHOUT sourceBranch/into keeps the sync form byte-compatible.
test("(f) legacy sync form without into is unchanged (regression)", async () => {
  const fixture = makeMergeFixture();
  const clean = await runMerge(fixture, {});
  assert.equal(clean.status, "NOTHING_TO_MERGE");
  assert.equal(clean.branch, "main");
  assert.equal(clean.into, "main", "additive field: into mirrors branch on the sync form");
  assert.equal(clean.sourceBranch, "origin/main");
  assert.equal(clean.sourceKind, "remote-tracking");
  assert.equal(clean.cleanup, null);

  const localHead = localCommit(fixture, "local-file.txt", "local change\n");
  const remoteHead = remoteBranch(fixture, "main", "remote-file.txt", "remote change\n");
  const plan = await runMerge(fixture, {});
  assert.equal(plan.status, "PLAN");
  assert.equal(plan.layer, "NATIVE");
  assert.equal(plan.ahead, 1);
  assert.equal(plan.behind, 1);
  const report = await runMerge(fixture, EXECUTE);
  assert.equal(report.status, "MERGED");
  assert.equal(report.layer, "NATIVE");
  assert.deepEqual(report.mergeCommit?.parents, [localHead, remoteHead]);
  const audit = lastAuditLine(fixture);
  assert.equal(audit.mode, undefined, "sync audit lines keep the legacy shape (no mode field)");
});

// (h) remote-tracking source → a local target with a DIFFERENT name; explicit origin/ prefix.
test("(h) remote-tracking source auto-detection and explicit origin/ prefix", async () => {
  const fixture = makeMergeFixture();
  const trackedHead = remoteBranch(fixture, "tracked-1", "tracked-file.txt", "tracked change\n");

  // plain name: no refs/heads/tracked-1 → falls back to refs/remotes/origin/tracked-1
  const plan = await runMerge(fixture, { sourceBranch: "tracked-1", into: "main" });
  assert.equal(plan.status, "PLAN");
  assert.equal(plan.layer, "AUTO_FF");
  assert.equal(plan.sourceKind, "remote-tracking");
  assert.equal(plan.sourceRef, "refs/remotes/origin/tracked-1");
  assert.equal(plan.sourceHead, trackedHead);

  // explicit prefix resolves ONLY the remote-tracking ref
  const plan2 = await runMerge(fixture, { sourceBranch: "origin/tracked-1", into: "main" });
  assert.equal(plan2.status, "PLAN");
  assert.equal(plan2.sourceKind, "remote-tracking");
  assert.equal(plan2.sourceRef, "refs/remotes/origin/tracked-1");

  const report = await runMerge(fixture, { sourceBranch: "tracked-1", into: "main", ...EXECUTE });
  assert.equal(report.status, "MERGED");
  assert.equal(report.layer, "AUTO_FF");
  assert.equal(report.headAfter, trackedHead);
  assert.equal(fixture.head(), trackedHead);
});

// (j) TARGET_DIRTY: a dirty TARGET checkout refuses PLAN and EXECUTE without mutating.
test("(j) dirty target checkout is refused as TARGET_DIRTY in PLAN and execute", async () => {
  const fixture = makeMergeFixture();
  const source = worktreeBranch(fixture, "dirty-src", "dirty-file.txt", "change\n");
  const mainBefore = fixture.head();
  writeFileSync(path.join(fixture.root, "app.js"), "dirty tracked edit\n");

  const plan = await runMerge(fixture, { sourceBranch: "dirty-src", into: "main" });
  assert.equal(plan.status, "BLOCKED");
  assert.ok(plan.blockers.includes("TARGET_DIRTY"), `blockers: ${plan.blockers.join(", ")}`);
  const executed = await runMerge(fixture, { sourceBranch: "dirty-src", into: "main", ...EXECUTE });
  assert.equal(executed.status, "BLOCKED");
  assert.ok(executed.blockers.includes("TARGET_DIRTY"));
  assert.equal(executed.mutationPerformed, false);
  assert.equal(fixture.head(), mainBefore, "refused execution must not move main");
  // untracked ?? paths are tolerated exactly like the sync form (tracked file restored first)
  writeFileSync(path.join(fixture.root, "app.js"), "export const hello = 'world';\n");
  writeFileSync(path.join(fixture.root, "untracked.txt"), "?? only\n");
  const tolerated = await runMerge(fixture, { sourceBranch: "dirty-src", into: "main" });
  assert.equal(tolerated.status, "PLAN");
  assert.equal(tolerated.layer, "AUTO_FF");
  rmSync(path.join(fixture.root, "untracked.txt"));
});

// (i) cleanup: happy path (removeWorktree first, then deleteBranch of the fully-merged source).
test("(i) cleanup happy path: worktree removed and fully-merged source branch deleted", async () => {
  const fixture = makeMergeFixture();
  const source = worktreeBranch(fixture, "life-src", "life-file.txt", "lifecycle change\n");

  const report = await runMerge(fixture, { sourceBranch: "life-src", into: "main", mode: "execute", approval: { approved: true }, acknowledgeMerge: true, cleanup: { deleteBranch: true, removeWorktree: source.path } });
  assert.equal(report.status, "MERGED");
  assert.equal(report.layer, "AUTO_FF");
  assert.ok(report.cleanup);
  assert.equal(report.cleanup?.status, "performed");
  assert.equal(report.cleanup?.removeWorktree?.performed, true);
  assert.equal(report.cleanup?.removeWorktree?.target, source.path);
  assert.equal(report.cleanup?.deleteBranch.performed, true);
  assert.equal(report.cleanup?.deleteBranch.target, "life-src");
  assert.ok(existsSync(source.path) === false, "worktree directory must be gone");
  assert.equal(git(fixture.root, ["branch", "--list", "life-src"]).trim(), "", "the source branch must be gone");
  assert.ok(report.findings.some((f) => f.includes("cleanup: deleted fully-merged source branch life-src")));
  const auditLines = readFileSync(fixture.auditFile, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>);
  const cleanupLines = auditLines.filter((line) => line.mode === "local-merge-cleanup");
  assert.deepEqual(cleanupLines.map((line) => line.action), ["removeWorktree", "deleteBranch"]);
  assert.ok(cleanupLines.every((line) => line.performed === true));
});

// (i) guards: CLEANUP_BRANCH_CHECKED_OUT (no removeWorktree requested → branch still checked out).
test("(i) cleanup guard: source still checked out in a worktree → CLEANUP_BRANCH_CHECKED_OUT", async () => {
  const fixture = makeMergeFixture();
  const source = worktreeBranch(fixture, "held-src", "held-file.txt", "held change\n");
  const report = await runMerge(fixture, { sourceBranch: "held-src", into: "main", mode: "execute", approval: { approved: true }, acknowledgeMerge: true, cleanup: { deleteBranch: true } });
  assert.equal(report.status, "MERGED");
  assert.equal(report.cleanup?.status, "refused");
  assert.equal(report.cleanup?.deleteBranch.code, "CLEANUP_BRANCH_CHECKED_OUT");
  assert.equal(report.cleanup?.deleteBranch.performed, false);
  assert.ok(report.findings.some((f) => f.includes("cleanup refused: CLEANUP_BRANCH_CHECKED_OUT")));
  const stillThere = git(fixture.root, ["rev-parse", "refs/heads/held-src"]).trim();
  assert.equal(stillThere, source.head, "the checked-out source branch must survive");
});

// (i) guards: deleting main is never permitted.
test("(i) cleanup refuses to delete main (CLEANUP_PROTECTED_REF)", async () => {
  const fixture = makeMergeFixture();
  // main → dev: nothing to merge (main has no commits dev lacks), but the cleanup
  // gate must still fire on the protected ref even on a no-op merge.
  const dev = worktreeBranch(fixture, "dev", "dev-file.txt", "dev change\n");
  // the merge runs from the checkout where the TARGET (dev) is checked out
  const report = await runGitMerge({ sourceBranch: "main", into: "dev", mode: "execute", approval: { approved: true }, acknowledgeMerge: true, cleanup: { deleteBranch: true } }, { repoRoot: dev.path, auditFile: fixture.auditFile });
  assert.equal(report.status, "NOTHING_TO_MERGE");
  assert.ok(report.cleanup);
  assert.equal(report.cleanup?.status, "refused");
  assert.equal(report.cleanup?.deleteBranch.code, "CLEANUP_PROTECTED_REF");
  assert.equal(git(fixture.root, ["rev-parse", "refs/heads/dev"]).trim(), dev.head, "dev must be untouched");
});

// (i) guard: source not fully merged → `git branch -d` refuses (scripted runner).
test("(i) cleanup refuses a not-fully-merged source (CLEANUP_NOT_FULLY_MERGED)", async () => {
  const DUMMY = "d".repeat(40);
  const MAIN = "1".repeat(40);
  const scripted: GitMergeDeps["executeGit"] = async (args) => {
    const joined = args.join(" ");
    if (joined.startsWith("status")) return { stdout: "", stderr: "", exitCode: 0 };
    if (joined === "rev-parse HEAD") return { stdout: `${MAIN}\n`, stderr: "", exitCode: 0 };
    if (joined.startsWith("symbolic-ref")) return { stdout: "refs/heads/main\n", stderr: "", exitCode: 0 };
    if (joined === "rev-parse --verify refs/heads/main^{commit}") return { stdout: `${MAIN}\n`, stderr: "", exitCode: 0 };
    if (joined === "rev-parse --verify refs/heads/dummy^{commit}") return { stdout: `${DUMMY}\n`, stderr: "", exitCode: 0 };
    if (joined.startsWith("rev-list --left-right")) return { stdout: "0\t0\n", stderr: "", exitCode: 0 };
    if (joined.startsWith("for-each-ref")) return { stdout: `refs/heads/main\t${MAIN}\nrefs/heads/dummy\t${DUMMY}\n`, stderr: "", exitCode: 0 };
    if (joined.startsWith("worktree list")) return { stdout: `worktree /repo\nbranch refs/heads/main\n`, stderr: "", exitCode: 0 };
    if (joined.startsWith("branch -d")) return { stdout: "", stderr: "error: the branch 'dummy' is not fully merged.", exitCode: 1 };
    return { stdout: "", stderr: `unexpected git args: ${joined}`, exitCode: 128 };
  };
  const report = await runGitMerge({ sourceBranch: "dummy", into: "main", mode: "execute", approval: { approved: true }, acknowledgeMerge: true, cleanup: { deleteBranch: true } }, { repoRoot: "/unused", executeGit: scripted, auditFile: null });
  assert.equal(report.status, "NOTHING_TO_MERGE");
  assert.equal(report.cleanup?.status, "refused");
  assert.equal(report.cleanup?.deleteBranch.code, "CLEANUP_NOT_FULLY_MERGED");
  assert.ok(report.findings.some((f) => f.includes("cleanup refused: CLEANUP_NOT_FULLY_MERGED")));
});

// (i) guards: removeWorktree of a dirty worktree and of an unregistered path.
test("(i) cleanup worktree guards: CLEANUP_WORKTREE_DIRTY and CLEANUP_WORKTREE_NOT_REGISTERED", async () => {
  const fixture = makeMergeFixture();
  const source = worktreeBranch(fixture, "wt-src", "wt-file.txt", "wt change\n");
  writeFileSync(path.join(source.path, "uncommitted.txt"), "dirty\n");

  await assert.rejects(
    runMerge(fixture, { sourceBranch: "dirty-src2", into: "main", mode: "execute", approval: { approved: true }, acknowledgeMerge: true, cleanup: { removeWorktree: source.path } }),
    hasCode("BRANCH_NOT_FOUND"),
    "an unknown source branch is typed, cleanup or not",
  );

  // use a real source so the merge proceeds and the worktree guard is exercised
  const cleanSource = worktreeBranch(fixture, "wt-guard-src", "wg-file.txt", "wg change\n");
  writeFileSync(path.join(cleanSource.path, "uncommitted.txt"), "dirty\n");
  const report = await runMerge(fixture, { sourceBranch: "wt-guard-src", into: "main", mode: "execute", approval: { approved: true }, acknowledgeMerge: true, cleanup: { deleteBranch: true, removeWorktree: cleanSource.path } });
  assert.equal(report.status, "MERGED");
  assert.equal(report.cleanup?.removeWorktree?.code, "CLEANUP_WORKTREE_DIRTY");
  assert.equal(report.cleanup?.deleteBranch.code, "CLEANUP_BRANCH_CHECKED_OUT", "the branch is still held by the dirty worktree");
  assert.ok(existsSync(cleanSource.path), "a dirty worktree must survive");

  const notRegistered = await runMerge(fixture, { sourceBranch: "wt-guard-src", into: "main", mode: "execute", approval: { approved: true }, acknowledgeMerge: true, cleanup: { removeWorktree: "/tmp/definitely-not-a-worktree" } });
  assert.equal(notRegistered.cleanup?.removeWorktree?.code, "CLEANUP_WORKTREE_NOT_REGISTERED");
  assert.ok(existsSync(cleanSource.path), "refused removal must leave the worktree in place");
});

// (i) happy removeWorktree alone: a clean registered worktree is removed, branch kept.
test("(i) removeWorktree alone removes a clean registered worktree", async () => {
  const fixture = makeMergeFixture();
  const source = worktreeBranch(fixture, "wtonly-src", "wton-file.txt", "wton change\n");
  const report = await runMerge(fixture, { sourceBranch: "wtonly-src", into: "main", mode: "execute", approval: { approved: true }, acknowledgeMerge: true, cleanup: { removeWorktree: source.path } });
  assert.equal(report.status, "MERGED");
  assert.equal(report.cleanup?.status, "performed");
  assert.equal(report.cleanup?.removeWorktree?.performed, true);
  assert.equal(report.cleanup?.deleteBranch.requested, false);
  assert.ok(existsSync(source.path) === false);
  assert.equal(git(fixture.root, ["rev-parse", "refs/heads/wtonly-src"]).trim(), source.head, "the branch itself must NOT be deleted (only removeWorktree requested)");
});

// Input validation for the local-merge form.
test("input validation rejects forbidden local-merge combinations", async () => {
  const fixture = makeMergeFixture();
  await assert.rejects(runMerge(fixture, { branch: "main", sourceBranch: "x" }), hasCode("MERGE_INPUT_FORBIDDEN"), "branch cannot combine with sourceBranch");
  await assert.rejects(runMerge(fixture, { branch: "main", cleanup: { deleteBranch: true } }), hasCode("MERGE_INPUT_FORBIDDEN"), "cleanup requires the local-merge form");
  await assert.rejects(runMerge(fixture, { sourceBranch: "x", mode: "nonsense" as "plan" }), hasCode("MERGE_INPUT_FORBIDDEN"));
  await assert.rejects(runMerge(fixture, { sourceBranch: "x", execute: true, mode: "plan" }), hasCode("MERGE_INPUT_FORBIDDEN"), "execute/mode must agree");
  for (const into of ["HEAD", "a..b", "refs/heads/main"]) {
    await assert.rejects(runMerge(fixture, { sourceBranch: "x", into }), hasCode("MERGE_INPUT_FORBIDDEN"), `into ${JSON.stringify(into)} must be rejected`);
  }
  await assert.rejects(runMerge(fixture, { sourceBranch: "origin/" }), hasCode("MERGE_INPUT_FORBIDDEN"), "empty origin tail must be rejected");
});

// The MCP HTTP layer exposes the local-merge form end to end.
test("git.merge local-merge form through the MCP HTTP layer (PLAN + EXECUTE)", async () => {
  const fixture = makeMergeFixture();
  const token = "merge-local-token";
  const tokenRegistry = [{ tokenHash: sha256(token), subject: "merge-local-tester", scopes: ["engineering:read", "engineering:git:merge"], allowedRepositoryIds: ["memoryos"], expiresAt: "2099-01-01T00:00:00.000Z" }];
  const { createEngineeringHttpServer } = await import("../src/server.js");
  const server = await createEngineeringHttpServer({ repositoryId: "memoryos", configuredRoot: fixture.root, tokenRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;
  try {
    const mcp = async (id: number, method: string, params: unknown) => {
      const response = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
      assert.equal(response.status, 200);
      const body = await response.text();
      const data = body.split(/\r?\n/).find((line) => line.startsWith("data: "));
      assert.ok(data);
      return JSON.parse(data.slice(6));
    };
    await mcp(1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    await mcp(2, "notifications/initialized", {});
    const source = worktreeBranch(fixture, "mcp-src", "mcp-file.txt", "mcp change\n");
    const payload = (call: any) => {
      const text = call.result?.content?.[0]?.text;
      assert.ok(typeof text === "string", `tool result shape: ${JSON.stringify(call).slice(0, 300)}`);
      return JSON.parse(text);
    };
    const planPayload = payload(await mcp(3, "tools/call", { name: "engineering.git.merge", arguments: { sourceBranch: "mcp-src", into: "main" } }));
    assert.equal(planPayload.status, "PLAN");
    assert.equal(planPayload.layer, "AUTO_FF");
    const execPayload = payload(await mcp(4, "tools/call", { name: "engineering.git.merge", arguments: { sourceBranch: "mcp-src", into: "main", mode: "execute", approval: { approved: true }, acknowledgeMerge: true } }));
    assert.equal(execPayload.status, "MERGED");
    assert.equal(execPayload.layer, "AUTO_FF");
    assert.equal(fixture.head(), source.head);
  } finally { server.close(); }
});