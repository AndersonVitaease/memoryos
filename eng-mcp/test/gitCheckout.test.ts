// GIT-CHECKOUT-01: engineering.git.checkout — governed checkout of a branch into a
// worktree. PLAN (default) is read-only: verifies branch existence, worktree
// conflicts and credential mounting without mutating anything. execute=true with
// acknowledgeCheckout=true creates the worktree via `git worktree add -b` under
// WT_ROOT/mission-<branch> — never raw `git checkout` at the repo root.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { GitCheckoutError, runGitCheckout, type GitCheckoutInput, type GitCheckoutReport } from "../src/gitCheckout.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

// Fixture: a real repo with one commit on main, a local branch `feature-a`
// (NOT checked out anywhere), and a branch `occupied` checked out in its own
// worktree (the mission shape that must be refused).
let seq = 0;
function makeFixture(): { root: string; auditFile: string; credentialFile: string; featureHead: string } {
  const base = mkdtempSync(path.join(tmpdir(), `gitcheckout-${++seq}-`));
  const root = path.join(base, "repo");
  git(base, ["init", "-b", "main", root]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(path.join(root, "app.js"), "export const hello = 'world';\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "fixture initial"]);

  // feature-a: local branch, not checked out anywhere
  git(root, ["branch", "feature-a"]);
  const featureHead = git(root, ["rev-parse", "feature-a"]).trim();

  // occupied: branch checked out in its own worktree
  const wt = path.join(base, "wt-occupied");
  git(root, ["worktree", "add", "-b", "occupied", wt]);
  git(wt, ["config", "user.email", "test@example.com"]);
  git(wt, ["config", "user.name", "Test"]);

  const credentialFile = path.join(base, "git-credentials");
  writeFileSync(credentialFile, "https://x-access-token:fixture@github.com\n");
  const auditFile = path.join(base, "audit", "git-checkout.jsonl");
  return { root, auditFile, credentialFile, featureHead };
}

function deps(f: ReturnType<typeof makeFixture>) {
  return {
    repoRoot: f.root,
    credentialFile: f.credentialFile,
    auditFile: f.auditFile,
    subject: "test-subject",
  } as const;
}

function lastAudit(f: ReturnType<typeof makeFixture>): Record<string, unknown> {
  const lines = readFileSync(f.auditFile, "utf8").trim().split(/\r?\n/);
  return JSON.parse(lines[lines.length - 1]);
}

// (a) PLAN read-only: no mutation, blockers empty, credential mounted, path planned.
test("PLAN read-only: verifies branch, no blockers, zero mutation", async () => {
  const f = makeFixture();
  const report = await runGitCheckout({ branch: "feature-a" }, deps(f));
  assert.equal(report.status, "PLAN");
  assert.equal(report.branch, "feature-a");
  assert.equal(report.path, `/opt/memoryos/mission-feature-a`);
  assert.equal(report.baseSha, f.featureHead);
  assert.equal(report.newHead, null);
  assert.equal(report.worktreeRegistered, false);
  assert.equal(report.mutationPerformed, false);
  assert.deepEqual(report.blockers, []);
  assert.equal(report.credential.state, "mounted");
  // zero mutation: no worktree for feature-a exists, audit untouched
  assert.equal(existsSync("/opt/memoryos/mission-feature-a"), false);
  assert.equal(existsSync(f.auditFile), false);
});

// (b) PLAN blockers: branch not found + credential missing surface as blockers, not throws.
test("PLAN surfaces blockers (branch not found, credential missing)", async () => {
  const f = makeFixture();
  const report = await runGitCheckout(
    { branch: "ghost-branch" },
    { repoRoot: f.root, credentialFile: path.join(path.dirname(f.credentialFile), "nope"), auditFile: f.auditFile },
  );
  assert.equal(report.status, "PLAN");
  assert.deepEqual(report.blockers, ["CHECKOUT_BRANCH_NOT_FOUND", "CHECKOUT_CREDENTIAL_MISSING"]);
  assert.equal(report.credential.state, "missing");
});

// (c) execute=true without acknowledgeCheckout is refused (typed).
test("execute without acknowledgeCheckout refused", async () => {
  const f = makeFixture();
  await assert.rejects(
    runGitCheckout({ branch: "feature-a", execute: true }, deps(f)),
    (e: unknown) => e instanceof GitCheckoutError && (e as GitCheckoutError).code === "CHECKOUT_ACKNOWLEDGMENT_REQUIRED",
  );
});

// (d) execute=true on a branch already checked out in another worktree is refused.
test("execute refuses branch checked out in another worktree", async () => {
  const f = makeFixture();
  await assert.rejects(
    runGitCheckout({ branch: "occupied", execute: true, acknowledgeCheckout: true }, deps(f)),
    (e: unknown) => e instanceof GitCheckoutError && (e as GitCheckoutError).code === "CHECKOUT_BRANCH_IN_OTHER_WORKTREE",
  );
});

// (e) execute=true on a missing branch is refused; credential missing refused before mutation.
test("execute refuses missing branch and missing credential", async () => {
  const f = makeFixture();
  await assert.rejects(
    runGitCheckout({ branch: "ghost-branch", execute: true, acknowledgeCheckout: true }, deps(f)),
    (e: unknown) => e instanceof GitCheckoutError && (e as GitCheckoutError).code === "CHECKOUT_BRANCH_NOT_FOUND",
  );
  await assert.rejects(
    runGitCheckout(
      { branch: "feature-a", execute: true, acknowledgeCheckout: true },
      { repoRoot: f.root, credentialFile: path.join(path.dirname(f.credentialFile), "nope"), auditFile: f.auditFile },
    ),
    (e: unknown) => e instanceof GitCheckoutError && (e as GitCheckoutError).code === "CHECKOUT_CREDENTIAL_MISSING",
  );
  // no audit line for refused executions
  assert.equal(existsSync(f.auditFile), false);
});

// (f) CHECKED_OUT: execute+acknowledge creates the worktree for an EXISTING local
// branch (`worktree add <path> <branch>` — no -b), registers it, audits the mutation.
test("CHECKED_OUT: execute+acknowledge creates and registers worktree, audits", async () => {
  const f = makeFixture();
  const branch = `fresh-${Date.now()}`;
  git(f.root, ["branch", branch]);
  const report = await runGitCheckout({ branch, execute: true, acknowledgeCheckout: true }, deps(f));
  try {
    assert.equal(report.status, "CHECKED_OUT");
    assert.equal(report.branch, branch);
    assert.equal(report.path, `/opt/memoryos/mission-${branch}`);
    assert.equal(report.baseSha, git(f.root, ["rev-parse", "HEAD"]).trim());
    assert.equal(report.newHead, report.baseSha); // new branch from HEAD
    assert.equal(report.worktreeRegistered, true);
    assert.equal(report.mutationPerformed, true);
    assert.deepEqual(report.blockers, []);
    assert.ok(existsSync(report.path), "worktree directory must exist");
    // branch materialized at the planned path
    assert.equal(git(f.root, ["rev-parse", branch]).trim(), report.newHead);
    const audit = lastAudit(f);
    assert.equal(audit.result, "checked_out");
    assert.equal(audit.branch, branch);
    assert.equal(audit.subject, "test-subject");
  } finally {
    // cleanup: remove the worktree + branch so the shared WT_ROOT stays clean
    try { git(f.root, ["worktree", "remove", "--force", report.path]); } catch { /* already gone */ }
    try { git(f.root, ["branch", "-D", branch]); } catch { /* already gone */ }
    try { rmSync(report.path, { recursive: true, force: true }); } catch { /* already gone */ }
  }
});

// (g) input validation: forbidden inputs are typed errors.
test("input validation: missing/typed-wrong inputs refused", async () => {
  const f = makeFixture();
  await assert.rejects(
    runGitCheckout({ branch: "" } as GitCheckoutInput, deps(f)),
    (e: unknown) => e instanceof GitCheckoutError && (e as GitCheckoutError).code === "CHECKOUT_INPUT_FORBIDDEN",
  );
  await assert.rejects(
    runGitCheckout({ branch: "feature-a", execute: "yes" } as unknown as GitCheckoutInput, deps(f)),
    (e: unknown) => e instanceof GitCheckoutError && (e as GitCheckoutError).code === "CHECKOUT_INPUT_FORBIDDEN",
  );
  await assert.rejects(
    runGitCheckout({ branch: "feature-a", acknowledgeCheckout: false }, deps(f)),
    (e: unknown) => e instanceof GitCheckoutError && (e as GitCheckoutError).code === "CHECKOUT_INPUT_FORBIDDEN",
  );
});

// (h) PLAN for the occupied branch surfaces the worktree conflict as a blocker.
test("PLAN surfaces CHECKOUT_BRANCH_IN_OTHER_WORKTREE blocker", async () => {
  const f = makeFixture();
  const report = await runGitCheckout({ branch: "occupied" }, deps(f));
  assert.equal(report.status, "PLAN");
  assert.deepEqual(report.blockers, ["CHECKOUT_BRANCH_IN_OTHER_WORKTREE"]);
});