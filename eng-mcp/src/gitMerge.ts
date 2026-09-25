// GIT-MERGE-01: engineering.git.merge — governed LAYERED merge of origin/<branch>
// into the checked-out branch, closing the fetch → merge → push cycle inside the
// tools. The layer is decided by the REAL repo state and is never escalated beyond
// what that state forces:
//   LAYER 1 AUTO_FF (behind > 0, ahead = 0): pure fast-forward through
//     `git merge --ff-only` — no merge commit is created.
//   LAYER 2 NATIVE (ahead > 0 AND behind > 0 with DISJOINT changed-path sets
//     relative to the merge base): one automatic merge commit with a deterministic
//     single-line message; post-validated by parents, tree sha, predicted-vs-actual
//     changed paths and a clean porcelain; ANY postcheck failure restores the
//     pre-merge head (git reset --hard) and reports RESTORED.
//   LAYER 3 ASSISTED (overlapping files → real conflict risk): NEVER executes,
//     not even with approval. The conflicts are reported as a structured list
//     (path + local/remote change kind + nature + recommendation) and the call
//     stops with zero mutation — a conflicting merge is an operator decision.
// Cross-cutting: the default call is a read-only PLAN; execution requires
// execute=true + approval.approved=true + acknowledgeMerge=true; merging a branch
// other than main requires passing `branch` explicitly (the declaration itself is
// the authorization for a non-default branch) and the branch must be checked out.
// Blockers (uncommitted changes, detached HEAD, branch not checked out, missing
// origin/<branch>, unavailable repository) are reported as status BLOCKED, never
// bypassed. NOTHING_TO_MERGE covers both 0/0 and ahead-only (the latter
// recommends engineering.git.push). Zero mutation outside the target is
// snapshot-proven (porcelain byte-identical, tags and every other ref unchanged;
// HEAD and the target branch move ONLY when a merge was actually performed).
// Purely local: no credential, no network, no origin URL anywhere in the output.
// One audit line per terminal outcome in /data/audit/git-merge.jsonl (layer,
// heads, status — never any secret).
//
// GIT-MERGE-02 (2026-09-24): local-merge form — ONE LOCAL branch merged into
// another LOCAL branch of the same repository (worktree → main included). Selected
// explicitly by `sourceBranch` (+ optional `into`, default main): the source may be
// a plain local branch name (refs/heads/<x>, preferred) or remote-tracking
// origin/<x> (refs/remotes/origin/<x>) — auto-resolved by ref existence; an explicit
// "origin/" prefix resolves ONLY the remote-tracking ref. `into` must be a LOCAL
// branch checked out at the repo root (the merge runs on the target checkout; a
// source checked out in another worktree is fine — only the target ref moves, and
// the source worktree is never touched). The same three layers and the same
// postchecks/restore discipline apply to EVERY pair (local→local,
// remote-tracking→local). New typed errors: BRANCH_NOT_FOUND (source/into not
// resolvable), MERGE_NO_OP (source === into), TARGET_DIRTY (target checkout has
// uncommitted tracked changes; untracked ?? paths are tolerated exactly like the
// sync form). Optional cleanup (execute only, default off): cleanup.deleteBranch
// deletes the LOCAL source branch with `git branch -d` semantics (only when fully
// merged — never main, never a checked-out branch, and only after a merge that
// actually landed or when the source is already contained in the target);
// cleanup.removeWorktree removes a registered worktree ONLY if it is fully clean.
// NON-GOALS (by design): the target is always a LOCAL branch (writing to a remote
// is the push tool's domain); engineering.git.push remains main-only; squash merges
// are out of scope (merge commits preserve mission provenance); cross-repository
// merges are out of scope.
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { redactGitHubSecrets } from "./githubRead.ts";

export class GitMergeError extends Error {
  constructor(readonly code: string, readonly detail?: string) {
    super(detail ? `${code}:${redactGitHubSecrets(detail)}` : code);
    this.name = "GitMergeError";
  }
}

export const GIT_MERGE_DEFAULT_BRANCH = "main";
const MERGE_TIMEOUT_MS = 60_000;
const MERGE_OUTPUT_CAP = 65_536;
const AUDIT_FILE_DEFAULT = "/data/audit/git-merge.jsonl";

const CONFLICT_RECOMMENDATION =
  "resolve as the operator (inspect both sides with git log/diff, apply the intended resolution, commit); engineering.git.merge deliberately never auto-merges conflicting paths";

export type GitMergeCleanupInput = { deleteBranch?: boolean; removeWorktree?: string };
export type GitMergeInput = {
  // GIT-MERGE-01 sync form: origin/<branch> → the same-named checked-out branch.
  branch?: string;
  // GIT-MERGE-02 local-merge form: <sourceBranch> → <into> (default main).
  // Presence of sourceBranch and/or into selects this form.
  sourceBranch?: string;
  into?: string;
  mode?: "plan" | "execute";
  // Shared.
  execute?: boolean;
  approval?: { approved?: boolean };
  acknowledgeMerge?: boolean;
  cleanup?: GitMergeCleanupInput;
};
export type GitMergeCleanupOutcome = { requested: boolean; performed: boolean; target: string | null; code: string | null; detail: string | null };
export type GitMergeCleanupResult = {
  requested: boolean;
  status: "performed" | "refused" | "not_applicable";
  deleteBranch: GitMergeCleanupOutcome;
  removeWorktree: GitMergeCleanupOutcome | null;
};
export type GitMergeDeps = {
  repoRoot: string;
  executeGit?: (args: string[], timeoutMs: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  auditFile?: string | null;
  withLock?: <T>(work: () => Promise<T>) => Promise<T>;
  subject?: string | null;
  now?: () => Date;
};
export type MergeConflict = { path: string; localChange: string; remoteChange: string; baseSha: string; nature: string; recommendation: string };
export type GitMergeProof = { worktreeStatusIdentical: boolean; tagsUnchanged: boolean; otherRefsUnchanged: boolean; headUnchanged?: boolean };
export type GitMergeReport = {
  tool: "engineering.git.merge";
  status: "PLAN" | "MERGED" | "RESTORED" | "MANUAL_RECOVERY" | "NOTHING_TO_MERGE" | "ASSISTED" | "BLOCKED";
  layer: "AUTO_FF" | "NATIVE" | "ASSISTED" | null;
  mutationPerformed: boolean;
  branch: string;
  checkedOutBranch: string | null;
  headBefore: string | null;
  headAfter: string | null;
  remoteHead: string | null;
  // GIT-MERGE-02: into = the local target branch (same as `branch` for the sync form).
  into: string;
  sourceBranch: string | null;
  sourceRef: string | null;
  sourceHead: string | null;
  sourceKind: "local" | "remote-tracking" | null;
  cleanup: GitMergeCleanupResult | null;
  baseSha: string | null;
  ahead: number | null;
  behind: number | null;
  conflicts: MergeConflict[];
  predictedPaths: string[] | null;
  actualChangedPaths: string[] | null;
  mergeCommit: { sha: string; tree: string | null; parents: string[]; message: string } | null;
  blockers: string[];
  findings: string[];
  code: string | null;
  detail: string | null;
  zeroMutationProof: GitMergeProof;
  requires: string[];
  audit: string | null;
  durationMs: number;
};

type ExecResult = { stdout: string; stderr: string; exitCode: number };
type GitRunner = (args: string[], timeoutMs: number) => Promise<ExecResult>;
type Snapshot = { status: string; head: string | null; refs: Map<string, string> };

function mergeEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", LANG: "C.UTF-8", GIT_TERMINAL_PROMPT: "0", GIT_MERGE_AUTOEDIT: "no" };
  if (process.env.HOME) env.HOME = process.env.HOME;
  return env;
}

function defaultExecuteGit(repoRoot: string): GitRunner {
  return (args, timeoutMs) => new Promise<ExecResult>((resolve, reject) => {
    const child = spawn("git", args, { cwd: repoRoot, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: mergeEnvironment() });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new GitMergeError("MERGE_TIMEOUT", `git ${args.join(" ")} exceeded ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => { if (stdout.length < MERGE_OUTPUT_CAP) stdout += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk: Buffer) => { if (stderr.length < MERGE_OUTPUT_CAP) stderr += chunk.toString("utf8"); });
    child.on("error", (error: Error) => { if (settled) return; settled = true; clearTimeout(timer); reject(new GitMergeError("MERGE_EXECUTION_FAILED", `git spawn failed: ${error.message}`)); });
    child.on("close", (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: exitCode ?? -1 });
    });
  });
}

function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 12) : "null";
}

function fail(code: string, stderr: string, stdout = ""): never {
  const detail = (stderr || stdout).split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, 4).join(" | ").slice(0, 400);
  throw new GitMergeError(code, detail || "no git output");
}

async function run(git: GitRunner, args: string[]): Promise<ExecResult> {
  return git(args, MERGE_TIMEOUT_MS);
}

async function runOk(git: GitRunner, args: string[], code: string): Promise<ExecResult> {
  const result = await run(git, args);
  if (result.exitCode !== 0) fail(code, result.stderr, result.stdout);
  return result;
}

async function quiet(git: GitRunner, args: string[]): Promise<string | null> {
  const result = await run(git, args);
  if (result.exitCode !== 0) return null;
  return result.stdout.trim();
}

const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/;

function assertSafeInput(input: GitMergeInput): void {
  const allowed = new Set(["branch", "sourceBranch", "into", "mode", "execute", "approval", "acknowledgeMerge", "cleanup"]);
  const forbidden = Object.keys(input ?? {}).filter((key) => !allowed.has(key));
  if (forbidden.length > 0) throw new GitMergeError("MERGE_INPUT_FORBIDDEN", `keys rejected: ${forbidden.join(", ")} — this tool accepts only {branch | sourceBranch+into, mode, execute, approval, acknowledgeMerge, cleanup}`);
  if (input.execute !== undefined && typeof input.execute !== "boolean") throw new GitMergeError("MERGE_INPUT_FORBIDDEN", "execute must be a boolean");
  if (input.mode !== undefined && input.mode !== "plan" && input.mode !== "execute") throw new GitMergeError("MERGE_INPUT_FORBIDDEN", `mode must be "plan" or "execute", got ${JSON.stringify(input.mode)}`);
  if (input.execute !== undefined && input.mode !== undefined && input.execute !== (input.mode === "execute")) throw new GitMergeError("MERGE_INPUT_FORBIDDEN", `execute (${String(input.execute)}) conflicts with mode (${String(input.mode)}) — use one of the two`);
  if (input.acknowledgeMerge !== undefined && input.acknowledgeMerge !== true) throw new GitMergeError("MERGE_INPUT_FORBIDDEN", "acknowledgeMerge must be exactly true when present");
  if (input.approval !== undefined && (typeof input.approval !== "object" || input.approval === null || typeof input.approval.approved !== "boolean")) throw new GitMergeError("MERGE_INPUT_FORBIDDEN", "approval must be {approved: boolean}");
  const isLocalMerge = input.sourceBranch !== undefined || input.into !== undefined;
  if (input.branch !== undefined) {
    if (typeof input.branch !== "string" || !BRANCH_PATTERN.test(input.branch)) throw new GitMergeError("MERGE_INPUT_FORBIDDEN", `branch must match [A-Za-z0-9][A-Za-z0-9._/-]{0,63}, got ${JSON.stringify(input.branch)}`);
    if (input.branch.includes("..") || input.branch === "HEAD" || input.branch.startsWith("refs/")) throw new GitMergeError("MERGE_INPUT_FORBIDDEN", "branch must be a plain branch name — HEAD, refs/* and range syntax are rejected");
    if (isLocalMerge) throw new GitMergeError("MERGE_INPUT_FORBIDDEN", "branch (GIT-MERGE-01 sync form) cannot be combined with sourceBranch/into (GIT-MERGE-02 local-merge form)");
  }
  if (input.sourceBranch !== undefined) {
    const sourceBranch = input.sourceBranch;
    if (typeof sourceBranch !== "string" || sourceBranch.length === 0) throw new GitMergeError("MERGE_INPUT_FORBIDDEN", "sourceBranch must be a non-empty branch name");
    if (sourceBranch.startsWith("origin/")) {
      const tail = sourceBranch.slice("origin/".length);
      if (tail.length === 0 || !BRANCH_PATTERN.test(tail) || tail.includes("..") || tail === "HEAD" || tail.startsWith("refs/")) throw new GitMergeError("MERGE_INPUT_FORBIDDEN", `sourceBranch "origin/<branch>" requires <branch> to be a plain branch name, got ${JSON.stringify(sourceBranch)}`);
    } else {
      if (!BRANCH_PATTERN.test(sourceBranch)) throw new GitMergeError("MERGE_INPUT_FORBIDDEN", `sourceBranch must match [A-Za-z0-9][A-Za-z0-9._/-]{0,63} (or origin/<branch>), got ${JSON.stringify(sourceBranch)}`);
      if (sourceBranch.includes("..") || sourceBranch === "HEAD" || sourceBranch.startsWith("refs/")) throw new GitMergeError("MERGE_INPUT_FORBIDDEN", "sourceBranch must be a plain branch name — HEAD, refs/* and range syntax are rejected");
    }
  }
  if (input.into !== undefined) {
    if (typeof input.into !== "string" || !BRANCH_PATTERN.test(input.into)) throw new GitMergeError("MERGE_INPUT_FORBIDDEN", `into must match [A-Za-z0-9][A-Za-z0-9._/-]{0,63}, got ${JSON.stringify(input.into)}`);
    if (input.into.includes("..") || input.into === "HEAD" || input.into.startsWith("refs/")) throw new GitMergeError("MERGE_INPUT_FORBIDDEN", "into must be a plain branch name — HEAD, refs/* and range syntax are rejected");
  }
  if (input.cleanup !== undefined) {
    if (!isLocalMerge) throw new GitMergeError("MERGE_INPUT_FORBIDDEN", "cleanup applies only to the local-merge form (sourceBranch/into)");
    if (typeof input.cleanup !== "object" || input.cleanup === null) throw new GitMergeError("MERGE_INPUT_FORBIDDEN", "cleanup must be {deleteBranch?: boolean, removeWorktree?: string}");
    if (input.cleanup.deleteBranch !== undefined && typeof input.cleanup.deleteBranch !== "boolean") throw new GitMergeError("MERGE_INPUT_FORBIDDEN", "cleanup.deleteBranch must be a boolean");
    if (input.cleanup.removeWorktree !== undefined && (typeof input.cleanup.removeWorktree !== "string" || input.cleanup.removeWorktree.length === 0)) throw new GitMergeError("MERGE_INPUT_FORBIDDEN", "cleanup.removeWorktree must be a non-empty worktree path");
  }
}

async function takeSnapshot(git: GitRunner): Promise<Snapshot> {
  const status = (await runOk(git, ["status", "--porcelain=v1"], "MERGE_EXECUTION_FAILED")).stdout;
  const head = await quiet(git, ["rev-parse", "HEAD"]);
  const refsRaw = (await runOk(git, ["for-each-ref", "--format=%(refname)%09%(objectname)", "refs/heads", "refs/tags", "refs/remotes"], "MERGE_EXECUTION_FAILED")).stdout;
  const refs = new Map<string, string>();
  for (const line of refsRaw.split(/\r?\n/)) {
    if (!line) continue;
    const separator = line.indexOf("\t");
    if (separator > 0) refs.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return { status, head, refs };
}

function refsEqual(before: Map<string, string>, after: Map<string, string>, prefix: string): boolean {
  for (const [name, value] of before) if (name.startsWith(prefix) && after.get(name) !== value) return false;
  for (const [name, value] of after) if (name.startsWith(prefix) && before.get(name) !== value) return false;
  return true;
}

function refsEqualExcept(before: Map<string, string>, after: Map<string, string>, allowed: Set<string>): boolean {
  for (const [name, value] of before) { if (allowed.has(name)) continue; if (after.get(name) !== value) return false; }
  for (const [name, value] of after) { if (allowed.has(name)) continue; if (before.get(name) !== value) return false; }
  return true;
}

function parseNameStatus(stdout: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const columns = line.split("\t");
    const status = columns[0] ?? "?";
    for (const changedPath of columns.slice(1)) if (changedPath) map.set(changedPath, status);
  }
  return map;
}

function parseAheadBehind(stdout: string): { ahead: number; behind: number } {
  const parts = stdout.trim().split(/\s+/);
  const ahead = Number(parts[0]);
  const behind = Number(parts[1]);
  if (!Number.isInteger(ahead) || !Number.isInteger(behind)) throw new GitMergeError("MERGE_EXECUTION_FAILED", `unparseable ahead/behind output: ${stdout.trim().slice(0, 100)}`);
  return { ahead, behind };
}

function auditLine(auditFile: string | null, entry: Record<string, unknown>): string | null {
  if (!auditFile) return null;
  try {
    mkdirSync(dirname(auditFile), { recursive: true });
    appendFileSync(auditFile, `${JSON.stringify(entry)}\n`);
    return auditFile;
  } catch {
    return null;
  }
}

type MergeCtx = { deps: GitMergeDeps; git: GitRunner; auditFile: string | null; started: number; now: () => Date };
type LocalSource = { branch: string; ref: string; head: string; kind: "local" | "remote-tracking" };
type WorktreeEntry = { path: string; branch: string | null };

function sha16Of(sha: string | null | undefined): string | null {
  return sha ? sha.slice(0, 16) : null;
}

async function listWorktrees(git: GitRunner): Promise<WorktreeEntry[]> {
  const raw = (await runOk(git, ["worktree", "list", "--porcelain"], "MERGE_EXECUTION_FAILED")).stdout;
  const entries: WorktreeEntry[] = [];
  let current: { path?: string; branch: string | null } = {};
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (current.path !== undefined) entries.push({ path: current.path, branch: current.branch });
      current = { path: line.slice("worktree ".length), branch: null };
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).trim();
    }
    // "detached"/"bare" lines leave branch null.
  }
  if (current.path !== undefined) entries.push({ path: current.path, branch: current.branch });
  return entries;
}

// GIT-MERGE-02: a plain name resolves the LOCAL ref first (refs/heads, preferred)
// and falls back to remote-tracking (refs/remotes/origin). An explicit "origin/"
// prefix resolves ONLY refs/remotes/origin/<x> — no fallback to a local branch.
async function resolveLocalSource(git: GitRunner, sourceBranch: string): Promise<LocalSource> {
  if (sourceBranch.startsWith("origin/")) {
    const ref = `refs/remotes/origin/${sourceBranch.slice("origin/".length)}`;
    const head = await quiet(git, ["rev-parse", "--verify", `${ref}^{commit}`]);
    if (head === null) throw new GitMergeError("BRANCH_NOT_FOUND", `sourceBranch ${JSON.stringify(sourceBranch)} resolves to no remote-tracking ref ${ref}`);
    return { branch: sourceBranch, ref, head, kind: "remote-tracking" };
  }
  const localRef = `refs/heads/${sourceBranch}`;
  const localHead = await quiet(git, ["rev-parse", "--verify", `${localRef}^{commit}`]);
  if (localHead !== null) return { branch: sourceBranch, ref: localRef, head: localHead, kind: "local" };
  const remoteRef = `refs/remotes/origin/${sourceBranch}`;
  const remoteHead = await quiet(git, ["rev-parse", "--verify", `${remoteRef}^{commit}`]);
  if (remoteHead !== null) return { branch: sourceBranch, ref: remoteRef, head: remoteHead, kind: "remote-tracking" };
  throw new GitMergeError("BRANCH_NOT_FOUND", `sourceBranch ${JSON.stringify(sourceBranch)} resolves to neither refs/heads/${sourceBranch} nor refs/remotes/origin/${sourceBranch}`);
}

export async function runGitMerge(input: GitMergeInput, deps: GitMergeDeps): Promise<GitMergeReport> {
  const ctx: MergeCtx = {
    deps,
    git: deps.executeGit ?? defaultExecuteGit(deps.repoRoot),
    auditFile: deps.auditFile === null ? null : (deps.auditFile ?? AUDIT_FILE_DEFAULT),
    started: Date.now(),
    now: deps.now ?? (() => new Date()),
  };

  const work = async (): Promise<GitMergeReport> => {
    assertSafeInput(input);
    // GIT-MERGE-02: explicit sourceBranch/into selects the local-merge form.
    if (input.sourceBranch !== undefined || input.into !== undefined) return runLocalMerge(input, ctx);
    // GIT-MERGE-01 sync form (unchanged): origin/<branch> → the same-named
    // checked-out local branch.
    return runSyncMerge(input, ctx);
  };

  try {
    return await (deps.withLock ? deps.withLock(work) : work());
  } catch (error) {
    const code = error instanceof GitMergeError ? error.code : "MERGE_EXECUTION_FAILED";
    auditLine(ctx.auditFile, { ts: ctx.now().toISOString(), subject: ctx.deps.subject ?? null, status: "failed", code, detail: error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400) });
    throw error;
  }
}

// GIT-MERGE-01 sync form — behavior preserved byte-compatibly (legacy callers that
// pass only `branch` keep the exact same outputs and audit lines).
async function runSyncMerge(input: GitMergeInput, ctx: MergeCtx): Promise<GitMergeReport> {
  const { deps, git, auditFile, started, now } = ctx;
  const executeRequested = input.execute === true || input.mode === "execute";
  const branch = input.branch ?? GIT_MERGE_DEFAULT_BRANCH;
    const targetRef = `refs/heads/${branch}`;
    const remoteRef = `refs/remotes/origin/${branch}`;
    const before = await takeSnapshot(git);
    const checkedOut = await quiet(git, ["symbolic-ref", "--quiet", "HEAD"]);

    const blockers: string[] = [];
    if (before.head === null) blockers.push("MERGE_REPOSITORY_UNAVAILABLE");
    if (checkedOut === null) blockers.push("MERGE_DETACHED_HEAD");
    const dirtyLines = before.status.split(/\r?\n/).filter((line) => line.length > 0 && !line.startsWith("??"));
    if (dirtyLines.length > 0) blockers.push("UNCOMMITTED_CHANGES");
    if (checkedOut !== null && checkedOut !== targetRef) blockers.push("BRANCH_NOT_CHECKED_OUT");
    const remoteHead = await quiet(git, ["rev-parse", "--verify", `${remoteRef}^{commit}`]);
    if (remoteHead === null) blockers.push("MERGE_REMOTE_REF_MISSING");

    let layer: GitMergeReport["layer"] = null;
    let ahead: number | null = null;
    let behind: number | null = null;
    let baseSha: string | null = null;
    let conflicts: MergeConflict[] = [];
    let predictedPaths: string[] | null = null;

    if (blockers.length === 0 && remoteHead !== null && before.head !== null) {
      const counts = parseAheadBehind((await runOk(git, ["rev-list", "--left-right", "--count", `${targetRef}...${remoteRef}`], "MERGE_EXECUTION_FAILED")).stdout);
      ahead = counts.ahead;
      behind = counts.behind;
      if (behind > 0 && ahead === 0) {
        layer = "AUTO_FF";
      } else if (behind > 0 && ahead > 0) {
        baseSha = await quiet(git, ["merge-base", targetRef, remoteRef]);
        if (baseSha === null) {
          layer = "ASSISTED";
          conflicts = [{ path: "*", localChange: "history", remoteChange: "history", baseSha: "none", nature: "unrelated histories — the local branch and origin have no common ancestor", recommendation: CONFLICT_RECOMMENDATION }];
        } else {
          const localChanges = parseNameStatus((await runOk(git, ["diff", "--name-status", `${baseSha}..${targetRef}`], "MERGE_EXECUTION_FAILED")).stdout);
          const remoteChanges = parseNameStatus((await runOk(git, ["diff", "--name-status", `${baseSha}..${remoteRef}`], "MERGE_EXECUTION_FAILED")).stdout);
          predictedPaths = [...new Set([...localChanges.keys(), ...remoteChanges.keys()])].sort();
          const overlapping = predictedPaths.filter((changedPath) => localChanges.has(changedPath) && remoteChanges.has(changedPath));
          layer = overlapping.length === 0 ? "NATIVE" : "ASSISTED";
          conflicts = overlapping.map((changedPath) => ({
            path: changedPath,
            localChange: localChanges.get(changedPath) ?? "?",
            remoteChange: remoteChanges.get(changedPath) ?? "?",
            baseSha: shortSha(baseSha),
            nature: "both sides changed this file since the merge base — an automatic merge would conflict or is unsafe to decide",
            recommendation: CONFLICT_RECOMMENDATION,
          }));
        }
      }
    }

    const requires = executeRequested ? [] : ["rerun with execute=true + approval.approved=true + acknowledgeMerge=true (PLAN is read-only)"];

    const buildReport = (partial: Partial<GitMergeReport> & { status: GitMergeReport["status"] }): GitMergeReport => ({
      tool: "engineering.git.merge",
      status: partial.status,
      layer,
      mutationPerformed: partial.mutationPerformed ?? false,
      branch,
      // GIT-MERGE-02 additive fields (sync form: into == branch, source is the remote).
      into: branch,
      sourceBranch: `origin/${branch}`,
      sourceRef: remoteRef,
      sourceHead: remoteHead,
      sourceKind: "remote-tracking" as const,
      cleanup: null,
      checkedOutBranch: checkedOut === null ? null : checkedOut.replace(/^refs\/heads\//, ""),
      headBefore: before.head,
      headAfter: partial.headAfter ?? before.head,
      remoteHead,
      baseSha,
      ahead,
      behind,
      conflicts,
      predictedPaths: partial.predictedPaths ?? predictedPaths,
      actualChangedPaths: partial.actualChangedPaths ?? null,
      mergeCommit: partial.mergeCommit ?? null,
      blockers,
      findings: partial.findings ?? [],
      code: partial.code ?? null,
      detail: partial.detail ?? null,
      zeroMutationProof: partial.zeroMutationProof ?? { worktreeStatusIdentical: true, tagsUnchanged: true, otherRefsUnchanged: true },
      requires,
      audit: null,
      durationMs: Date.now() - started,
    });

    // Non-mutating outcomes: re-take the snapshot and PROVE nothing moved.
    const finishNonMutating = async (partial: Parameters<typeof buildReport>[0]): Promise<GitMergeReport> => {
      const after = await takeSnapshot(git);
      const proof: GitMergeProof = {
        worktreeStatusIdentical: after.status === before.status,
        tagsUnchanged: refsEqual(before.refs, after.refs, "refs/tags/"),
        otherRefsUnchanged: refsEqualExcept(before.refs, after.refs, new Set()),
        headUnchanged: after.head === before.head,
      };
      return buildReport({ ...partial, zeroMutationProof: proof });
    };

    if (blockers.length > 0) {
      const report = await finishNonMutating({ status: "BLOCKED", code: "MERGE_BLOCKED", detail: `merge refused by blockers: ${blockers.join(", ")}`, findings: blockers.map((b) => `blocker: ${b}`) });
      report.audit = auditLine(auditFile, { ts: now().toISOString(), subject: deps.subject ?? null, branch, layer, status: report.status, code: report.code, ahead, behind, headBefore: before.head, headAfter: report.headAfter, conflicts: conflicts.length, mutation: false, durationMs: report.durationMs });
      return report;
    }
    if (behind === 0) {
      const findings = ahead !== null && ahead > 0
        ? [`local ${branch} is ahead of origin/${branch} by ${ahead} commit(s) with nothing remote to merge — nothing to merge; use engineering.git.push`]
        : [`origin/${branch} and ${branch} already agree at ${shortSha(before.head)} — nothing to merge`];
      const report = await finishNonMutating({ status: "NOTHING_TO_MERGE", findings });
      report.audit = auditLine(auditFile, { ts: now().toISOString(), subject: deps.subject ?? null, branch, layer, status: report.status, code: null, ahead, behind, headBefore: before.head, headAfter: report.headAfter, conflicts: 0, mutation: false, durationMs: report.durationMs });
      return report;
    }
    if (!executeRequested) {
      const findings = layer === "AUTO_FF"
        ? [`layer AUTO_FF selected: ${branch} is strictly behind origin/${branch} by ${behind} commit(s) — pure fast-forward, no merge commit`]
        : layer === "NATIVE"
          ? [`layer NATIVE selected: divergent histories (ahead ${ahead}, behind ${behind}) with disjoint changed-path sets — one automatic merge commit with a deterministic message`]
          : [`layer ASSISTED selected: ${conflicts.length} conflicting path(s) between ${branch} and origin/${branch} — a conflicting merge is NEVER automatic`];
      const report = await finishNonMutating({ status: "PLAN", findings });
      report.audit = auditLine(auditFile, { ts: now().toISOString(), subject: deps.subject ?? null, branch, layer, status: report.status, code: null, ahead, behind, headBefore: before.head, headAfter: report.headAfter, conflicts: conflicts.length, mutation: false, durationMs: report.durationMs });
      return report;
    }

    // Execution gates — PLAN-only outcomes above never reached this.
    if (input.acknowledgeMerge !== true) throw new GitMergeError("MERGE_ACKNOWLEDGMENT_REQUIRED", "execute=true requires acknowledgeMerge=true — merging moves local history");
    if (input.approval?.approved !== true) throw new GitMergeError("MERGE_APPROVAL_REQUIRED", "execute=true requires approval.approved=true — a merge is a governed mutation");

    if (layer === "ASSISTED") {
      const report = await finishNonMutating({
        status: "ASSISTED",
        findings: [`${conflicts.length} conflicting path(s) between ${branch} and origin/${branch} — merge stopped by design (layer 3 ASSISTED); resolution is the operator's decision`],
      });
      report.audit = auditLine(auditFile, { ts: now().toISOString(), subject: deps.subject ?? null, branch, layer, status: report.status, code: "MERGE_CONFLICT_ASSISTED_STOP", ahead, behind, headBefore: before.head, headAfter: report.headAfter, conflicts: conflicts.length, mutation: false, durationMs: report.durationMs });
      return report;
    }

    // Mutating outcomes from here — the proof always excludes exactly the target branch ref.
    const mutateProof = (after: Snapshot): GitMergeProof => ({
      worktreeStatusIdentical: after.status === before.status,
      tagsUnchanged: refsEqual(before.refs, after.refs, "refs/tags/"),
      otherRefsUnchanged: refsEqualExcept(before.refs, after.refs, new Set([targetRef])),
    });

    if (layer === "AUTO_FF") {
      const ff = await run(git, ["merge", "--ff-only", remoteRef]);
      if (ff.exitCode !== 0) fail("MERGE_EXECUTION_FAILED", ff.stderr, ff.stdout);
      const after = await takeSnapshot(git);
      if (after.head !== remoteHead) throw new GitMergeError("MERGE_POSTCHECK_FAILED", `HEAD after fast-forward (${shortSha(after.head)}) != origin/${branch} (${shortSha(remoteHead)})`);
      const report = buildReport({
        status: "MERGED",
        mutationPerformed: true,
        headAfter: after.head,
        zeroMutationProof: mutateProof(after),
        findings: [`fast-forwarded ${branch} to origin/${branch} (${shortSha(before.head)} → ${shortSha(remoteHead)}) — no merge commit, porcelain byte-identical`],
      });
      report.audit = auditLine(auditFile, { ts: now().toISOString(), subject: deps.subject ?? null, branch, layer, status: report.status, code: null, ahead, behind, headBefore: before.head, headAfter: after.head, conflicts: 0, mutation: true, durationMs: report.durationMs });
      return report;
    }

    // layer === "NATIVE" (baseSha and heads are non-null here — blockers were empty).
    const headBefore = before.head as string;
    const remote = remoteHead as string;
    const base = baseSha as string;
    const message = `Merge origin/${branch} into ${branch} — governed git.merge (local ${shortSha(headBefore)}, remote ${shortSha(remote)}, base ${shortSha(base)})`;
    const merge = await run(git, ["merge", "--no-ff", remoteRef, "-m", message]);
    if (merge.exitCode !== 0) {
      const started2 = await quiet(git, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]);
      if (started2 === null) throw new GitMergeError("MERGE_EXECUTION_FAILED", `merge refused before starting (nothing applied): ${merge.stderr.trim().slice(0, 300)}`);
      const aborted = await quiet(git, ["merge", "--abort"]);
      const after = await takeSnapshot(git);
      if (aborted !== null && after.head === headBefore) {
        const report = buildReport({ status: "RESTORED", mutationPerformed: true, code: "MERGE_EXECUTION_FAILED", detail: merge.stderr.trim().slice(0, 400), zeroMutationProof: mutateProof(after), findings: ["unexpected merge failure — merge aborted and the pre-merge head restored", `git stderr: ${merge.stderr.trim().slice(0, 200)}`] });
        report.audit = auditLine(auditFile, { ts: now().toISOString(), subject: deps.subject ?? null, branch, layer, status: report.status, code: report.code, ahead, behind, headBefore, headAfter: after.head, conflicts: 0, mutation: true, durationMs: report.durationMs });
        return report;
      }
      const report = buildReport({ status: "MANUAL_RECOVERY", mutationPerformed: true, code: "MERGE_RESTORE_FAILED", detail: merge.stderr.trim().slice(0, 400), zeroMutationProof: mutateProof(after), findings: ["merge failed AND automatic restore failed — operator recovery required (git merge --abort or git reset --hard)"] });
      report.audit = auditLine(auditFile, { ts: now().toISOString(), subject: deps.subject ?? null, branch, layer, status: report.status, code: report.code, ahead, behind, headBefore, headAfter: after.head, conflicts: 0, mutation: true, durationMs: report.durationMs });
      return report;
    }

    const after = await takeSnapshot(git);
    const headAfter = after.head;
    const checks: string[] = [];
    let tree: string | null = null;
    let parents: string[] = [];
    let actualChangedPaths: string[] | null = null;
    if (headAfter === null || headAfter === headBefore) checks.push("HEAD did not advance to a new merge commit");
    if (headAfter !== null && headAfter !== headBefore) {
      const parentsLine = await quiet(git, ["rev-list", "--parents", "-n", "1", headAfter]);
      parents = parentsLine === null ? [] : parentsLine.split(/\s+/).slice(1);
      if (parents.length !== 2 || !parents.includes(headBefore) || !parents.includes(remote)) checks.push(`merge commit parents (${parents.join(", ")}) do not match expected [${shortSha(headBefore)}, ${shortSha(remote)}]`);
      tree = await quiet(git, ["rev-parse", `${headAfter}^{tree}`]);
      if (tree === null) checks.push("merge commit tree sha unreadable");
      // GIT-MERGE-01: actual = everything the merge applied SINCE THE MERGE BASE (union of
      // both sides' contributions) — diffing headBefore..headAfter would only show the
      // remote side's paths because headBefore IS the merge commit's first parent.
      const actualRaw = await quiet(git, ["diff", "--name-only", `${baseSha ?? headBefore}..${headAfter}`]);
      if (actualRaw === null) checks.push("actual changed paths unreadable");
      else {
        const actual = actualRaw.split(/\r?\n/).filter((line) => line.length > 0).sort();
        const predicted = (predictedPaths ?? []).slice().sort();
        if (JSON.stringify(actual) !== JSON.stringify(predicted)) checks.push(`actual changed paths (${actual.join(", ")}) differ from predicted (${predicted.join(", ")})`);
        else actualChangedPaths = actual;
      }
    }
    if (after.status !== before.status) checks.push("working tree porcelain changed after the merge (expected clean)");
    if (!refsEqualExcept(before.refs, after.refs, new Set([targetRef]))) checks.push("refs outside the target branch changed unexpectedly");

    if (checks.length > 0) {
      const reset = await run(git, ["reset", "--hard", headBefore]);
      const restoredHead = await quiet(git, ["rev-parse", "HEAD"]);
      const afterRestore = await takeSnapshot(git);
      if (reset.exitCode === 0 && restoredHead === headBefore) {
        const report = buildReport({ status: "RESTORED", mutationPerformed: true, headAfter: afterRestore.head, code: "MERGE_POSTCHECK_FAILED", detail: checks.join("; ").slice(0, 400), zeroMutationProof: mutateProof(afterRestore), findings: [...checks.map((check) => `postcheck: ${check}`), "postcheck failed — pre-merge head restored via git reset --hard"] });
        report.audit = auditLine(auditFile, { ts: now().toISOString(), subject: deps.subject ?? null, branch, layer, status: report.status, code: report.code, ahead, behind, headBefore, headAfter: afterRestore.head, conflicts: 0, mutation: true, durationMs: report.durationMs });
        return report;
      }
      const report = buildReport({ status: "MANUAL_RECOVERY", mutationPerformed: true, headAfter, code: "MERGE_RESTORE_FAILED", detail: checks.join("; ").slice(0, 400), zeroMutationProof: mutateProof(after), findings: [...checks.map((check) => `postcheck: ${check}`), "postcheck failed AND the automatic restore failed — operator recovery required"] });
      report.audit = auditLine(auditFile, { ts: now().toISOString(), subject: deps.subject ?? null, branch, layer, status: report.status, code: report.code, ahead, behind, headBefore, headAfter, conflicts: 0, mutation: true, durationMs: report.durationMs });
      return report;
    }

    const commitMessage = (await quiet(git, ["log", "-1", "--format=%B"]))?.trim() ?? message;
    const report = buildReport({
      status: "MERGED",
      mutationPerformed: true,
      headAfter,
      actualChangedPaths,
      mergeCommit: { sha: headAfter as string, tree, parents, message: commitMessage },
      zeroMutationProof: mutateProof(after),
      findings: [`merge commit ${shortSha(headAfter)} created (tree ${shortSha(tree)}, parents ${shortSha(headBefore)} + ${shortSha(remote)}); changed paths ${actualChangedPaths?.join(", ") ?? "none"}; porcelain and every ref outside ${targetRef} unchanged`],
    });
    report.audit = auditLine(auditFile, { ts: now().toISOString(), subject: deps.subject ?? null, branch, layer, status: report.status, code: null, ahead, behind, headBefore, headAfter, conflicts: 0, mutation: true, durationMs: report.durationMs });
    return report;
}

// ===== GIT-MERGE-02: local-merge (branch-local → branch-local) =====

function summarizeCleanup(result: GitMergeCleanupResult): Record<string, unknown> {
  return { status: result.status, deleteBranch: { performed: result.deleteBranch.performed, code: result.deleteBranch.code }, removeWorktree: result.removeWorktree ? { performed: result.removeWorktree.performed, code: result.removeWorktree.code } : null };
}

function cleanupOutcome(requested: boolean, target: string | null, performed: boolean, code: string | null, detail: string | null): GitMergeCleanupOutcome {
  return { requested, performed, target, code, detail };
}

type CleanupArgs = { cleanup: GitMergeCleanupInput; source: LocalSource; into: string; intoRef: string; headAfter: string | null; auditFile: string | null; deps: GitMergeDeps; now: () => Date; started: number; findings: string[] };

async function cleanupDeleteBranch(git: GitRunner, args: CleanupArgs): Promise<GitMergeCleanupOutcome> {
  const { source, intoRef, auditFile, deps, now, started, findings } = args;
  const audit = (performed: boolean, code: string | null, detail: string | null) => {
    auditLine(auditFile, { ts: now().toISOString(), subject: deps.subject ?? null, mode: "local-merge-cleanup", into: args.into, sourceBranch: source.branch, action: "deleteBranch", target: source.branch, performed, code, headAfter: args.headAfter, durationMs: Date.now() - started });
  };
  const refuse = (code: string, detail: string): GitMergeCleanupOutcome => {
    audit(false, code, detail);
    findings.push(`cleanup refused: ${code} — ${detail}`);
    return cleanupOutcome(true, source.branch, false, code, detail);
  };
  if (source.kind !== "local") return refuse("CLEANUP_SOURCE_NOT_LOCAL", `source ${source.branch} resolved to ${source.ref} — only local source branches are deletable`);
  if (source.branch === GIT_MERGE_DEFAULT_BRANCH) return refuse("CLEANUP_PROTECTED_REF", `deleting ${GIT_MERGE_DEFAULT_BRANCH} is never permitted`);
  if (source.ref === intoRef) return refuse("CLEANUP_PROTECTED_REF", `source and target are the same branch (${source.branch})`);
  const holder = (await listWorktrees(git)).find((wt) => wt.branch === source.ref);
  if (holder) return refuse("CLEANUP_BRANCH_CHECKED_OUT", `${source.branch} is checked out at ${holder.path} — remove/detach the worktree first (cleanup.removeWorktree) or pick another source`);
  const res = await run(git, ["branch", "-d", source.branch]);
  if (res.exitCode !== 0) return refuse("CLEANUP_NOT_FULLY_MERGED", (res.stderr || res.stdout).trim().slice(0, 300));
  const verify = await quiet(git, ["rev-parse", "--verify", `${source.ref}^{commit}`]);
  if (verify !== null) return refuse("CLEANUP_REMOVE_FAILED", `git branch -d exited 0 but ${source.ref} is still resolvable`);
  audit(true, null, null);
  findings.push(`cleanup: deleted fully-merged source branch ${source.branch} (last head ${shortSha(source.head)})`);
  return cleanupOutcome(true, source.branch, true, null, null);
}

async function cleanupRemoveWorktree(git: GitRunner, args: CleanupArgs, worktreePath: string): Promise<GitMergeCleanupOutcome> {
  const { auditFile, deps, now, started, findings } = args;
  const audit = (performed: boolean, code: string | null, detail: string | null) => {
    auditLine(auditFile, { ts: now().toISOString(), subject: deps.subject ?? null, mode: "local-merge-cleanup", into: args.into, sourceBranch: args.source.branch, action: "removeWorktree", target: worktreePath, performed, code, headAfter: args.headAfter, durationMs: Date.now() - started });
  };
  const refuse = (code: string, detail: string): GitMergeCleanupOutcome => {
    audit(false, code, detail);
    findings.push(`cleanup refused: ${code} — ${detail}`);
    return cleanupOutcome(true, worktreePath, false, code, detail);
  };
  const registered = (await listWorktrees(git)).some((wt) => wt.path === worktreePath);
  if (!registered) return refuse("CLEANUP_WORKTREE_NOT_REGISTERED", `${worktreePath} is not a git worktree registered in this repository`);
  const status = await run(git, ["-C", worktreePath, "status", "--porcelain=v1"]);
  if (status.exitCode !== 0) return refuse("CLEANUP_WORKTREE_REMOVE_FAILED", `worktree status unreadable: ${(status.stderr || status.stdout).trim().slice(0, 200)}`);
  const dirty = status.stdout.split(/\r?\n/).filter((line) => line.length > 0);
  if (dirty.length > 0) return refuse("CLEANUP_WORKTREE_DIRTY", `worktree has ${dirty.length} dirty/untracked path(s) — commit or clean them first: ${dirty.slice(0, 3).join(", ")}`);
  const res = await run(git, ["worktree", "remove", worktreePath]);
  if (res.exitCode !== 0) return refuse("CLEANUP_WORKTREE_REMOVE_FAILED", (res.stderr || res.stdout).trim().slice(0, 300));
  audit(true, null, null);
  findings.push(`cleanup: removed registered worktree ${worktreePath}`);
  return cleanupOutcome(true, worktreePath, true, null, null);
}

// removeWorktree runs FIRST: a branch held only by that worktree becomes deletable afterwards.
async function runLocalMergeCleanup(git: GitRunner, args: CleanupArgs): Promise<GitMergeCleanupResult> {
  let removeWorktree: GitMergeCleanupOutcome | null = null;
  if (args.cleanup.removeWorktree !== undefined) removeWorktree = await cleanupRemoveWorktree(git, args, args.cleanup.removeWorktree);
  const deleteBranch = args.cleanup.deleteBranch === true ? await cleanupDeleteBranch(git, args) : cleanupOutcome(false, null, false, null, null);
  const performed = deleteBranch.performed || (removeWorktree?.performed ?? false);
  const refused = (deleteBranch.requested && !deleteBranch.performed) || (removeWorktree !== null && removeWorktree.requested && !removeWorktree.performed);
  const status: GitMergeCleanupResult["status"] = performed ? "performed" : (refused ? "refused" : "not_applicable");
  if (performed) args.findings.push("note: cleanup mutated refs/worktrees AFTER the merge's zero-mutation proof snapshot — the merge proof describes the merge only; see the cleanup section/audit lines");
  return { requested: true, status, deleteBranch, removeWorktree };
}

async function attachCleanup(git: GitRunner, args: { input: GitMergeInput; report: GitMergeReport; source: LocalSource; into: string; intoRef: string; headAfter: string | null; ctx: MergeCtx }): Promise<void> {
  const cleanup = args.input.cleanup;
  if (!cleanup || (cleanup.deleteBranch !== true && cleanup.removeWorktree === undefined)) return;
  const findings: string[] = [];
  args.report.cleanup = await runLocalMergeCleanup(git, { cleanup, source: args.source, into: args.into, intoRef: args.intoRef, headAfter: args.headAfter, auditFile: args.ctx.auditFile, deps: args.ctx.deps, now: args.ctx.now, started: args.ctx.started, findings });
  args.report.findings = [...args.report.findings, ...findings];
  args.report.durationMs = Date.now() - args.ctx.started;
}

async function runLocalMerge(input: GitMergeInput, ctx: MergeCtx): Promise<GitMergeReport> {
  const { deps, git, auditFile, started, now } = ctx;
  const executeRequested = input.execute === true || input.mode === "execute";
  const into = input.into ?? GIT_MERGE_DEFAULT_BRANCH;
  const intoRef = `refs/heads/${into}`;

  const intoHead = await quiet(git, ["rev-parse", "--verify", `${intoRef}^{commit}`]);
  if (intoHead === null) throw new GitMergeError("BRANCH_NOT_FOUND", `into branch ${JSON.stringify(into)} does not exist (${intoRef})`);
  const source = await resolveLocalSource(git, input.sourceBranch as string);
  if (source.ref === intoRef) throw new GitMergeError("MERGE_NO_OP", `sourceBranch ${JSON.stringify(source.branch)} is ${into} itself — merging a branch into itself is a no-op`);

  const before = await takeSnapshot(git);
  const checkedOut = await quiet(git, ["symbolic-ref", "--quiet", "HEAD"]);

  const blockers: string[] = [];
  if (before.head === null) blockers.push("MERGE_REPOSITORY_UNAVAILABLE");
  if (checkedOut === null) blockers.push("MERGE_DETACHED_HEAD");
  const dirtyLines = before.status.split(/\r?\n/).filter((line) => line.length > 0 && !line.startsWith("??"));
  if (dirtyLines.length > 0) blockers.push("TARGET_DIRTY");
  if (checkedOut !== null && checkedOut !== intoRef) blockers.push("BRANCH_NOT_CHECKED_OUT");

  let layer: GitMergeReport["layer"] = null;
  let ahead: number | null = null;
  let behind: number | null = null;
  let baseSha: string | null = null;
  let conflicts: MergeConflict[] = [];
  let predictedPaths: string[] | null = null;

  if (blockers.length === 0 && before.head !== null) {
    const counts = parseAheadBehind((await runOk(git, ["rev-list", "--left-right", "--count", `${intoRef}...${source.ref}`], "MERGE_EXECUTION_FAILED")).stdout);
    ahead = counts.ahead;
    behind = counts.behind;
    if (behind > 0 && ahead === 0) {
      layer = "AUTO_FF";
    } else if (behind > 0 && ahead > 0) {
      baseSha = await quiet(git, ["merge-base", intoRef, source.ref]);
      if (baseSha === null) {
        layer = "ASSISTED";
        conflicts = [{ path: "*", localChange: "history", remoteChange: "history", baseSha: "none", nature: "unrelated histories — the target branch and the source have no common ancestor", recommendation: CONFLICT_RECOMMENDATION }];
      } else {
        const localChanges = parseNameStatus((await runOk(git, ["diff", "--name-status", `${baseSha}..${intoRef}`], "MERGE_EXECUTION_FAILED")).stdout);
        const sourceChanges = parseNameStatus((await runOk(git, ["diff", "--name-status", `${baseSha}..${source.ref}`], "MERGE_EXECUTION_FAILED")).stdout);
        predictedPaths = [...new Set([...localChanges.keys(), ...sourceChanges.keys()])].sort();
        const overlapping = predictedPaths.filter((changedPath) => localChanges.has(changedPath) && sourceChanges.has(changedPath));
        layer = overlapping.length === 0 ? "NATIVE" : "ASSISTED";
        conflicts = overlapping.map((changedPath) => ({
          path: changedPath,
          localChange: localChanges.get(changedPath) ?? "?",
          remoteChange: sourceChanges.get(changedPath) ?? "?",
          baseSha: shortSha(baseSha),
          nature: "both sides changed this file since the merge base — an automatic merge would conflict or is unsafe to decide",
          recommendation: CONFLICT_RECOMMENDATION,
        }));
      }
    }
  }

  const requires = executeRequested ? [] : [`rerun with mode="execute" (or execute=true) + approval.approved=true + acknowledgeMerge=true (PLAN is read-only)`];

  const buildReport = (partial: Partial<GitMergeReport> & { status: GitMergeReport["status"] }): GitMergeReport => ({
    tool: "engineering.git.merge",
    status: partial.status,
    layer,
    mutationPerformed: partial.mutationPerformed ?? false,
    branch: into,
    into,
    sourceBranch: source.branch,
    sourceRef: source.ref,
    sourceHead: source.head,
    sourceKind: source.kind,
    cleanup: null,
    checkedOutBranch: checkedOut === null ? null : checkedOut.replace(/^refs\/heads\//, ""),
    headBefore: before.head,
    headAfter: partial.headAfter ?? before.head,
    remoteHead: null,
    baseSha,
    ahead,
    behind,
    conflicts,
    predictedPaths: partial.predictedPaths ?? predictedPaths,
    actualChangedPaths: partial.actualChangedPaths ?? null,
    mergeCommit: partial.mergeCommit ?? null,
    blockers,
    findings: partial.findings ?? [],
    code: partial.code ?? null,
    detail: partial.detail ?? null,
    zeroMutationProof: partial.zeroMutationProof ?? { worktreeStatusIdentical: true, tagsUnchanged: true, otherRefsUnchanged: true },
    requires,
    audit: null,
    durationMs: Date.now() - started,
  });

  const finishNonMutating = async (partial: Parameters<typeof buildReport>[0]): Promise<GitMergeReport> => {
    const after = await takeSnapshot(git);
    const proof: GitMergeProof = {
      worktreeStatusIdentical: after.status === before.status,
      tagsUnchanged: refsEqual(before.refs, after.refs, "refs/tags/"),
      otherRefsUnchanged: refsEqualExcept(before.refs, after.refs, new Set()),
      headUnchanged: after.head === before.head,
    };
    return buildReport({ ...partial, zeroMutationProof: proof });
  };

  const auditEntry = (extra: Record<string, unknown>) => ({ ts: now().toISOString(), subject: deps.subject ?? null, mode: "local-merge", branch: into, into, sourceBranch: source.branch, sourceRef: source.ref, sourceKind: source.kind, layer, ...extra });

  if (blockers.length > 0) {
    const report = await finishNonMutating({ status: "BLOCKED", code: "MERGE_BLOCKED", detail: `local-merge refused by blockers: ${blockers.join(", ")}`, findings: blockers.map((b) => `blocker: ${b}`) });
    report.audit = auditLine(auditFile, auditEntry({ status: report.status, code: report.code, ahead, behind, headBefore: before.head, headAfter: report.headAfter, conflicts: conflicts.length, mutation: false, sha16: sha16Of(report.headAfter), durationMs: report.durationMs }));
    return report;
  }
  if (behind === 0) {
    const findings = ahead !== null && ahead > 0
      ? [`${into} is ahead of ${source.branch} by ${ahead} commit(s) with nothing in the source to merge — nothing to merge`]
      : [`${source.branch} and ${into} already agree at ${shortSha(before.head)} — nothing to merge`];
    const cleanupWanted = executeRequested && input.cleanup !== undefined && (input.cleanup.deleteBranch === true || input.cleanup.removeWorktree !== undefined);
    if (!cleanupWanted) {
      const report = await finishNonMutating({ status: "NOTHING_TO_MERGE", findings });
      report.audit = auditLine(auditFile, auditEntry({ status: report.status, code: null, ahead, behind, headBefore: before.head, headAfter: report.headAfter, conflicts: 0, mutation: false, sha16: sha16Of(report.headAfter), durationMs: report.durationMs }));
      return report;
    }
    // Cleanup requested on an already-contained source: cleanup mutates (branch deletion),
    // so the SAME execution gates apply even though the merge itself is a no-op.
    if (input.acknowledgeMerge !== true) throw new GitMergeError("MERGE_ACKNOWLEDGMENT_REQUIRED", `cleanup with mode="execute" requires acknowledgeMerge=true — cleanup deletes the source branch (governed mutation)`);
    if (input.approval?.approved !== true) throw new GitMergeError("MERGE_APPROVAL_REQUIRED", `cleanup with mode="execute" requires approval.approved=true`);
    const report = await finishNonMutating({ status: "NOTHING_TO_MERGE", findings });
    const cleanupFindings: string[] = [];
    report.cleanup = await runLocalMergeCleanup(git, { cleanup: input.cleanup as GitMergeCleanupInput, source, into, intoRef, headAfter: before.head, auditFile, deps, now, started, findings: cleanupFindings });
    report.findings = [...report.findings, ...cleanupFindings];
    report.durationMs = Date.now() - started;
    report.audit = auditLine(auditFile, auditEntry({ status: report.status, code: null, ahead, behind, headBefore: before.head, headAfter: before.head, conflicts: 0, mutation: true, sha16: sha16Of(before.head), cleanup: summarizeCleanup(report.cleanup), durationMs: report.durationMs }));
    return report;
  }
  if (!executeRequested) {
    const findings = layer === "AUTO_FF"
      ? [`layer AUTO_FF selected: ${into} is strictly behind ${source.branch} by ${behind} commit(s) — pure fast-forward, no merge commit`]
      : layer === "NATIVE"
        ? [`layer NATIVE selected: divergent histories (ahead ${ahead}, behind ${behind}) with disjoint changed-path sets — one automatic merge commit with a deterministic message`]
        : [`layer ASSISTED selected: ${conflicts.length} conflicting path(s) between ${into} and ${source.branch} — a conflicting merge is NEVER automatic`];
    if (source.kind === "local") {
      const holder = (await listWorktrees(git)).find((wt) => wt.branch === source.ref);
      if (holder && holder.path !== deps.repoRoot) findings.push(`informational: source branch ${source.branch} is checked out at worktree ${holder.path} — the merge moves only ${intoRef}; the source worktree stays untouched`);
    }
    const report = await finishNonMutating({ status: "PLAN", findings });
    report.audit = auditLine(auditFile, auditEntry({ status: report.status, code: null, ahead, behind, headBefore: before.head, headAfter: report.headAfter, conflicts: conflicts.length, mutation: false, sha16: sha16Of(report.headAfter), durationMs: report.durationMs }));
    return report;
  }

  // Execution gates — PLAN-only outcomes above never reached this.
  if (input.acknowledgeMerge !== true) throw new GitMergeError("MERGE_ACKNOWLEDGMENT_REQUIRED", `mode="execute" (or execute=true) requires acknowledgeMerge=true — merging moves local history`);
  if (input.approval?.approved !== true) throw new GitMergeError("MERGE_APPROVAL_REQUIRED", `mode="execute" (or execute=true) requires approval.approved=true — a merge is a governed mutation`);

  if (layer === "ASSISTED") {
    const report = await finishNonMutating({ status: "ASSISTED", findings: [`${conflicts.length} conflicting path(s) between ${into} and ${source.branch} — merge stopped by design (layer 3 ASSISTED); resolution is the operator's decision`] });
    report.audit = auditLine(auditFile, auditEntry({ status: report.status, code: "MERGE_CONFLICT_ASSISTED_STOP", ahead, behind, headBefore: before.head, headAfter: report.headAfter, conflicts: conflicts.length, mutation: false, sha16: sha16Of(report.headAfter), durationMs: report.durationMs }));
    return report;
  }

  const mutateProof = (after: Snapshot): GitMergeProof => ({
    worktreeStatusIdentical: after.status === before.status,
    tagsUnchanged: refsEqual(before.refs, after.refs, "refs/tags/"),
    otherRefsUnchanged: refsEqualExcept(before.refs, after.refs, new Set([intoRef])),
  });

  if (layer === "AUTO_FF") {
    const ff = await run(git, ["merge", "--ff-only", source.ref]);
    if (ff.exitCode !== 0) fail("MERGE_EXECUTION_FAILED", ff.stderr, ff.stdout);
    const after = await takeSnapshot(git);
    if (after.head !== source.head) throw new GitMergeError("MERGE_POSTCHECK_FAILED", `HEAD after fast-forward (${shortSha(after.head)}) != ${source.ref} (${shortSha(source.head)})`);
    const report = buildReport({ status: "MERGED", mutationPerformed: true, headAfter: after.head, zeroMutationProof: mutateProof(after), findings: [`fast-forwarded ${into} to ${source.branch} (${shortSha(before.head)} → ${shortSha(source.head)}) — no merge commit, porcelain byte-identical`] });
    report.audit = auditLine(auditFile, auditEntry({ status: report.status, code: null, ahead, behind, headBefore: before.head, headAfter: after.head, conflicts: 0, mutation: true, sha16: sha16Of(after.head), durationMs: report.durationMs }));
    await attachCleanup(git, { input, report, source, into, intoRef, headAfter: after.head, ctx });
    return report;
  }

  // layer === "NATIVE" (baseSha and heads are non-null here — blockers were empty).
  const headBefore = before.head as string;
  const sourceHead = source.head;
  const base = baseSha as string;
  const message = `Merge ${source.branch} into ${into} — governed git.merge (into ${shortSha(headBefore)}, source ${shortSha(sourceHead)}, base ${shortSha(base)})`;
  const merge = await run(git, ["merge", "--no-ff", source.ref, "-m", message]);
  if (merge.exitCode !== 0) {
    const startedMerge = await quiet(git, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]);
    if (startedMerge === null) throw new GitMergeError("MERGE_EXECUTION_FAILED", `merge refused before starting (nothing applied): ${merge.stderr.trim().slice(0, 300)}`);
    const aborted = await quiet(git, ["merge", "--abort"]);
    const after = await takeSnapshot(git);
    if (aborted !== null && after.head === headBefore) {
      const report = buildReport({ status: "RESTORED", mutationPerformed: true, code: "MERGE_EXECUTION_FAILED", detail: merge.stderr.trim().slice(0, 400), zeroMutationProof: mutateProof(after), findings: ["unexpected merge failure — merge aborted and the pre-merge head restored", `git stderr: ${merge.stderr.trim().slice(0, 200)}`] });
      report.audit = auditLine(auditFile, auditEntry({ status: report.status, code: report.code, ahead, behind, headBefore, headAfter: after.head, conflicts: 0, mutation: true, sha16: sha16Of(after.head), durationMs: report.durationMs }));
      return report;
    }
    const report = buildReport({ status: "MANUAL_RECOVERY", mutationPerformed: true, code: "MERGE_RESTORE_FAILED", detail: merge.stderr.trim().slice(0, 400), zeroMutationProof: mutateProof(after), findings: ["merge failed AND automatic restore failed — operator recovery required (git merge --abort or git reset --hard)"] });
    report.audit = auditLine(auditFile, auditEntry({ status: report.status, code: report.code, ahead, behind, headBefore, headAfter: after.head, conflicts: 0, mutation: true, sha16: sha16Of(after.head), durationMs: report.durationMs }));
    return report;
  }

  const after = await takeSnapshot(git);
  const headAfter = after.head;
  const checks: string[] = [];
  let tree: string | null = null;
  let parents: string[] = [];
  let actualChangedPaths: string[] | null = null;
  if (headAfter === null || headAfter === headBefore) checks.push("HEAD did not advance to a new merge commit");
  if (headAfter !== null && headAfter !== headBefore) {
    const parentsLine = await quiet(git, ["rev-list", "--parents", "-n", "1", headAfter]);
    parents = parentsLine === null ? [] : parentsLine.split(/\s+/).slice(1);
    if (parents.length !== 2 || !parents.includes(headBefore) || !parents.includes(sourceHead)) checks.push(`merge commit parents (${parents.join(", ")}) do not match expected [${shortSha(headBefore)}, ${shortSha(sourceHead)}]`);
    tree = await quiet(git, ["rev-parse", `${headAfter}^{tree}`]);
    if (tree === null) checks.push("merge commit tree sha unreadable");
    // Same rule as GIT-MERGE-01: actual = everything the merge applied SINCE THE MERGE BASE.
    const actualRaw = await quiet(git, ["diff", "--name-only", `${baseSha ?? headBefore}..${headAfter}`]);
    if (actualRaw === null) checks.push("actual changed paths unreadable");
    else {
      const actual = actualRaw.split(/\r?\n/).filter((line) => line.length > 0).sort();
      const predicted = (predictedPaths ?? []).slice().sort();
      if (JSON.stringify(actual) !== JSON.stringify(predicted)) checks.push(`actual changed paths (${actual.join(", ")}) differ from predicted (${predicted.join(", ")})`);
      else actualChangedPaths = actual;
    }
  }
  if (after.status !== before.status) checks.push("working tree porcelain changed after the merge (expected clean)");
  if (!refsEqualExcept(before.refs, after.refs, new Set([intoRef]))) checks.push("refs outside the target branch changed unexpectedly");

  if (checks.length > 0) {
    const reset = await run(git, ["reset", "--hard", headBefore]);
    const restoredHead = await quiet(git, ["rev-parse", "HEAD"]);
    const afterRestore = await takeSnapshot(git);
    if (reset.exitCode === 0 && restoredHead === headBefore) {
      const report = buildReport({ status: "RESTORED", mutationPerformed: true, headAfter: afterRestore.head, code: "MERGE_POSTCHECK_FAILED", detail: checks.join("; ").slice(0, 400), zeroMutationProof: mutateProof(afterRestore), findings: [...checks.map((check) => `postcheck: ${check}`), "postcheck failed — pre-merge head restored via git reset --hard"] });
      report.audit = auditLine(auditFile, auditEntry({ status: report.status, code: report.code, ahead, behind, headBefore, headAfter: afterRestore.head, conflicts: 0, mutation: true, sha16: sha16Of(afterRestore.head), durationMs: report.durationMs }));
      return report;
    }
    const report = buildReport({ status: "MANUAL_RECOVERY", mutationPerformed: true, headAfter, code: "MERGE_RESTORE_FAILED", detail: checks.join("; ").slice(0, 400), zeroMutationProof: mutateProof(after), findings: [...checks.map((check) => `postcheck: ${check}`), "postcheck failed AND the automatic restore failed — operator recovery required"] });
    report.audit = auditLine(auditFile, auditEntry({ status: report.status, code: report.code, ahead, behind, headBefore, headAfter, conflicts: 0, mutation: true, sha16: sha16Of(headAfter), durationMs: report.durationMs }));
    return report;
  }

  const commitMessage = (await quiet(git, ["log", "-1", "--format=%B"]))?.trim() ?? message;
  const report = buildReport({ status: "MERGED", mutationPerformed: true, headAfter, actualChangedPaths, mergeCommit: { sha: headAfter as string, tree, parents, message: commitMessage }, zeroMutationProof: mutateProof(after), findings: [`merge commit ${shortSha(headAfter)} created (tree ${shortSha(tree)}, parents ${shortSha(headBefore)} + ${shortSha(sourceHead)}); changed paths ${actualChangedPaths?.join(", ") ?? "none"}; porcelain and every ref outside ${intoRef} unchanged`] });
  report.audit = auditLine(auditFile, auditEntry({ status: report.status, code: null, ahead, behind, headBefore, headAfter, conflicts: 0, mutation: true, sha16: sha16Of(headAfter), durationMs: report.durationMs }));
  await attachCleanup(git, { input, report, source, into, intoRef, headAfter, ctx });
  return report;
}
