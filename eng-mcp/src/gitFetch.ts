// GIT-FETCH-01: engineering.git.fetch — governed READ-ONLY fetch of the authorized
// git repository. Runs exactly ONE controlled `git fetch --no-tags origin`: never
// merge/pull/checkout/rebase, no --prune, no refspec, no caller-controlled anything
// (strict empty schema; the remote is always the repository's own origin). The
// mutation boundary is remote-tracking refs (refs/remotes/origin/*) ONLY — the
// working tree, HEAD, local branches and tags are snapshot-compared before/after
// and ANY change fails closed (FETCH_LOCAL_STATE_MUTATED), so a fetch can never
// surprise a dirty or detached worktree. This is the reconciliation PREREQUISITE
// for engineering.git.push: it refreshes the remote-tracking refs and reports
// ahead/behind + divergent commit lists per compared branch (every local branch
// with an origin counterpart, main always first, capped at 10), answering live
// what the stale refs/remotes/* of git.remote_compare cannot. The credential is
// the same operator git credential-store FILE as git.push (GIT_CREDENTIALS_FILE,
// default /run/secrets/git-credentials, mounted read-only through the LoadCredential
// 3-link pattern): this module never reads its content — it only stats it — while
// git resolves it through an explicitly reset credential.helper chain, so no token
// ever reaches argv, env or logs, and the origin URL is NEVER returned (only the
// fixed remote name). An audit line lands in /data/audit/git-fetch.jsonl.
import { spawn } from "node:child_process";
import { accessSync, appendFileSync, constants as fsConstants, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { redactGitHubSecrets } from "./githubRead.ts";

export class GitFetchError extends Error {
  constructor(readonly code: string, readonly detail?: string) {
    super(detail ? `${code}:${redactGitHubSecrets(detail)}` : code);
    this.name = "GitFetchError";
  }
}

const REMOTE = "origin"; // fixed — never caller-supplied
const MAIN_BRANCH = "main";
const COMPARE_BRANCHES_MAX = 10;
const COMMIT_LIST_MAX = 20;
const REF_DIFF_CAP = 10;
const FETCH_TIMEOUT_MS = 60_000;
const FETCH_OUTPUT_CAP = 65_536;
const FETCH_DETAIL_CAP = 400;
const CREDENTIAL_FILE_DEFAULT = "/run/secrets/git-credentials";
const AUDIT_FILE_DEFAULT = "/data/audit/git-fetch.jsonl";

export type GitFetchInput = Record<string, never>;
export type GitFetchCommit = { sha: string; subject: string };
export type GitFetchBranchReport = {
  branch: string;
  localHead: string;
  remoteHead: string;
  remoteCommitDate: string | null;
  ahead: number;
  behind: number;
  aheadCommits: GitFetchCommit[];
  behindCommits: GitFetchCommit[];
};
export type GitFetchRefChange = { ref: string; before: string | null; after: string };
export type GitFetchDeps = {
  repoRoot: string;
  executeGit?: (args: string[], timeoutMs: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  credentialFile?: string | null;
  auditFile?: string | null;
  subject?: string | null;
  withLock?: <T>(work: () => Promise<T>) => Promise<T>;
};
export type GitFetchReport = {
  status: "FETCHED";
  mutationPerformed: false;
  boundary: string;
  remote: string;
  credential: { state: "mounted" | "missing"; path: string; detail?: string };
  fetch: {
    exitCode: number;
    remoteTrackingRefs: { updated: number; added: number; removed: number; changes: GitFetchRefChange[] };
  };
  comparison: GitFetchBranchReport[];
  zeroMutationProof: { worktreeStatusIdentical: boolean; headUnchanged: boolean; localBranchAndTagRefsUnchanged: boolean };
  durationMs: number;
  audit: string;
};

type GitRunner = NonNullable<GitFetchDeps["executeGit"]>;
type RefSnapshot = Map<string, string>;
type Snapshot = { status: string; head: string; localRefs: string; remoteRefs: RefSnapshot };

function assertNoInput(input: GitFetchInput): void {
  const keys = Object.keys(input ?? {});
  if (keys.length > 0) throw new GitFetchError("FETCH_INPUT_FORBIDDEN", `keys rejected: ${keys.join(", ")} — this tool accepts no input: remote, refspec, credential and URL are structurally fixed`);
}

function resolveCredentialPath(deps: GitFetchDeps): string {
  return deps.credentialFile ?? process.env.GIT_CREDENTIALS_FILE ?? CREDENTIAL_FILE_DEFAULT;
}

function credentialState(deps: GitFetchDeps): GitFetchReport["credential"] {
  const target = resolveCredentialPath(deps);
  try {
    const stats = statSync(target);
    if (!stats.isFile()) return { state: "missing", path: target, detail: "path exists but is a directory (the docker auto-created-empty-dir failure mode) — credential is not usable" };
    accessSync(target, fsConstants.R_OK);
    return { state: "mounted", path: target };
  } catch (error) {
    return { state: "missing", path: target, detail: error instanceof Error ? error.message : String(error) };
  }
}

function fetchEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", LANG: "C.UTF-8", GIT_TERMINAL_PROMPT: "0" };
  if (process.env.HOME) env.HOME = process.env.HOME;
  return env;
}

function defaultExecuteGit(repoRoot: string): GitRunner {
  return (args, timeoutMs) => new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
    const child = spawn("git", args, { cwd: repoRoot, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: fetchEnvironment() });
    let stdout = ""; let stderr = ""; let settled = false;
    const timer = setTimeout(() => {
      if (settled) return; settled = true;
      child.kill();
      reject(new GitFetchError("FETCH_TIMEOUT", `git ${args.join(" ")} exceeded ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => { if (stdout.length < FETCH_OUTPUT_CAP) stdout += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk: Buffer) => { if (stderr.length < FETCH_OUTPUT_CAP) stderr += chunk.toString("utf8"); });
    child.once("error", (error) => { if (settled) return; settled = true; clearTimeout(timer); reject(new GitFetchError("FETCH_EXECUTION_FAILED", `git binary unavailable: ${error.message}`)); });
    child.once("close", (code) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ stdout, stderr, exitCode: code ?? -1 }); });
  });
}

function parseRefs(output: string): RefSnapshot {
  const refs: RefSnapshot = new Map();
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.lastIndexOf(" ");
    if (separator <= 0) continue;
    refs.set(trimmed.slice(0, separator), trimmed.slice(separator + 1));
  }
  return refs;
}

async function snapshot(git: GitRunner, timeoutMs: number): Promise<Snapshot> {
  const status = await git(["status", "--porcelain"], timeoutMs);
  const head = await git(["rev-parse", "HEAD"], timeoutMs);
  const localRefs = await git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads", "refs/tags"], timeoutMs);
  const remoteRefs = await git(["for-each-ref", "--format=%(refname) %(objectname)", `refs/remotes/${REMOTE}`], timeoutMs);
  return { status: status.stdout, head: head.stdout.trim(), localRefs: localRefs.stdout, remoteRefs: parseRefs(remoteRefs.stdout) };
}

function diffRemoteRefs(before: RefSnapshot, after: RefSnapshot): { updated: number; added: number; removed: number; changes: GitFetchRefChange[] } {
  const changes: GitFetchRefChange[] = [];
  let updated = 0; let added = 0;
  for (const [ref, sha] of after) {
    const previous = before.get(ref);
    if (previous === undefined) { added += 1; if (changes.length < REF_DIFF_CAP) changes.push({ ref, before: null, after: sha }); }
    else if (previous !== sha) { updated += 1; if (changes.length < REF_DIFF_CAP) changes.push({ ref, before: previous, after: sha }); }
  }
  let removed = 0;
  for (const ref of before.keys()) if (!after.has(ref)) removed += 1;
  return { updated, added, removed, changes };
}

function shortName(remoteRef: string): string | null {
  const prefix = `refs/remotes/${REMOTE}/`;
  return remoteRef.startsWith(prefix) ? remoteRef.slice(prefix.length) : null;
}

function parseCommitLines(output: string): GitFetchCommit[] {
  return output.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.indexOf("\t");
    return separator > 0 ? { sha: line.slice(0, separator), subject: line.slice(separator + 1) } : { sha: line, subject: "" };
  });
}

async function compareBranch(git: GitRunner, branch: string, timeoutMs: number): Promise<GitFetchBranchReport> {
  const localRef = `refs/heads/${branch}`;
  const remoteRef = `refs/remotes/${REMOTE}/${branch}`;
  const localHead = (await git(["rev-parse", "--verify", localRef], timeoutMs)).stdout.trim();
  const remoteHead = (await git(["rev-parse", "--verify", remoteRef], timeoutMs)).stdout.trim();
  const counted = await git(["rev-list", "--left-right", "--count", `${localRef}...${remoteRef}`], timeoutMs);
  const [aheadRaw, behindRaw] = counted.stdout.trim().split(/\s+/);
  const ahead = Number.parseInt(aheadRaw ?? "0", 10);
  const behind = Number.parseInt(behindRaw ?? "0", 10);
  const aheadOutput = ahead > 0 ? await git(["log", `--format=%h%x09%s`, `--max-count=${COMMIT_LIST_MAX}`, `${remoteRef}..${localRef}`], timeoutMs) : { stdout: "" };
  const behindOutput = behind > 0 ? await git(["log", `--format=%h%x09%s`, `--max-count=${COMMIT_LIST_MAX}`, `${localRef}..${remoteRef}`], timeoutMs) : { stdout: "" };
  const dateOutput = await git(["log", "-1", "--format=%cI", remoteHead], timeoutMs);
  return {
    branch, localHead, remoteHead,
    remoteCommitDate: dateOutput.exitCode === 0 ? dateOutput.stdout.trim() || null : null,
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
    aheadCommits: ahead > 0 ? parseCommitLines(aheadOutput.stdout) : [],
    behindCommits: behind > 0 ? parseCommitLines(behindOutput.stdout) : [],
  };
}

async function compareBranches(git: GitRunner, snapshotAfter: Snapshot, timeoutMs: number): Promise<GitFetchBranchReport[]> {
  const localBranches = [...snapshotAfter.localRefs.split("\n")].map((line) => line.trim()).filter(Boolean)
    .map((line) => line.slice("refs/heads/".length, line.lastIndexOf(" "))).filter((name) => !name.includes(" "));
  const remoteBranches = new Set([...snapshotAfter.remoteRefs.keys()].map(shortName).filter((name): name is string => name !== null));
  const eligible = localBranches.filter((branch) => remoteBranches.has(branch));
  if (!eligible.includes(MAIN_BRANCH)) throw new GitFetchError("FETCH_BRANCH_NOT_FOUND", `no ${REMOTE}/${MAIN_BRANCH} remote-tracking ref after the fetch — the branch report requires at least main`);
  eligible.sort((left, right) => (left === MAIN_BRANCH ? -1 : right === MAIN_BRANCH ? 1 : left.localeCompare(right)));
  const reports: GitFetchBranchReport[] = [];
  for (const branch of eligible.slice(0, COMPARE_BRANCHES_MAX)) reports.push(await compareBranch(git, branch, timeoutMs));
  return reports;
}

function assertLocalStateUnchanged(before: Snapshot, after: Snapshot): void {
  const violated: string[] = [];
  if (after.status !== before.status) violated.push("worktree status changed");
  if (after.head !== before.head) violated.push(`HEAD moved ${before.head} -> ${after.head}`);
  if (after.localRefs !== before.localRefs) violated.push("local branch/tag refs changed");
  if (violated.length > 0) throw new GitFetchError("FETCH_LOCAL_STATE_MUTATED", `zero-mutation boundary violated: ${violated.join("; ")} — a fetch must never touch the working tree, HEAD or local refs`);
}

function mapFetchFailure(stderr: string, exitCode: number): GitFetchError {
  const detail = stderr.split("\n").map((line) => line.trim()).filter(Boolean).slice(-6).join(" | ").slice(0, FETCH_DETAIL_CAP);
  if (/does not appear to be a git repository|No such remote|'origin' does not exist/i.test(stderr)) return new GitFetchError("FETCH_REMOTE_MISSING", detail);
  if (/could not read Username|could not read Password|Authentication failed|401|Invalid username or password|terminal prompts disabled/i.test(stderr)) return new GitFetchError("FETCH_AUTH_REJECTED", detail);
  if (/403|Permission to .* denied to/i.test(stderr)) return new GitFetchError("FETCH_FORBIDDEN", detail);
  if (/Could not resolve host|Connection (timed out|refused)|Network is unreachable|SSL certificate problem/i.test(stderr)) return new GitFetchError("FETCH_NETWORK_UNREACHABLE", detail);
  return new GitFetchError("FETCH_EXECUTION_FAILED", `git fetch exit ${exitCode}: ${detail}`);
}

type FetchAudit = { result: "fetched" | "failed"; code: string | null; ahead: number | null; behind: number | null; remoteTrackingChanged: boolean };

async function writeAudit(deps: GitFetchDeps, entry: FetchAudit): Promise<string> {
  const file = deps.auditFile ?? process.env.GIT_FETCH_AUDIT_FILE ?? AUDIT_FILE_DEFAULT;
  const line = JSON.stringify({ ts: new Date().toISOString(), subject: deps.subject ?? null, remote: REMOTE, branch: MAIN_BRANCH, ...entry });
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, `${line}\n`, { encoding: "utf8" });
    return "written";
  } catch (error) {
    return `failed:${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function runGitFetch(input: GitFetchInput, deps: GitFetchDeps): Promise<GitFetchReport> {
  assertNoInput(input);
  const started = Date.now();
  const timeoutMs = FETCH_TIMEOUT_MS;
  const credential = credentialState(deps);
  if (credential.state !== "mounted") throw new GitFetchError("FETCH_CREDENTIAL_MISSING", credential.detail ?? `credential file ${credential.path} is not a readable file`);
  const git = deps.executeGit ?? defaultExecuteGit(deps.repoRoot);
  let audit: FetchAudit = { result: "failed", code: null, ahead: null, behind: null, remoteTrackingChanged: false };
  try {
    // Remote existence is prechecked read-only (and the URL is deliberately never read
    // into a report — it may embed credentials; only the fixed NAME is ever reported).
    const remote = await git(["remote", "get-url", REMOTE], timeoutMs);
    if (remote.exitCode !== 0) throw mapFetchFailure(remote.stderr || `git remote get-url ${REMOTE} exited ${remote.exitCode}`, remote.exitCode);
    const before = await snapshot(git, timeoutMs);
    // The ONLY mutation boundary of this tool: remote-tracking refs. --no-tags keeps
    // auto-followed tags out of refs/tags; --prune stays off so nothing is ever deleted.
    const argv = ["-c", "credential.helper=", "-c", `credential.helper=store --file=${credential.path}`, "fetch", "--no-tags", REMOTE];
    const fetched = await git(argv, timeoutMs);
    if (fetched.exitCode !== 0) throw mapFetchFailure(fetched.stderr, fetched.exitCode);
    const after = await snapshot(git, timeoutMs);
    assertLocalStateUnchanged(before, after);
    const remoteTrackingRefs = diffRemoteRefs(before.remoteRefs, after.remoteRefs);
    const comparison = await compareBranches(git, after, timeoutMs);
    const main = comparison.find((entry) => entry.branch === MAIN_BRANCH) ?? null;
    audit = { result: "fetched", code: null, ahead: main?.ahead ?? null, behind: main?.behind ?? null, remoteTrackingChanged: remoteTrackingRefs.updated + remoteTrackingRefs.added > 0 };
    return {
      status: "FETCHED", mutationPerformed: false,
      boundary: "remote-tracking refs only (refs/remotes/origin/*); the working tree, HEAD, local branches and tags are snapshot-proven unchanged",
      remote: REMOTE, credential,
      fetch: { exitCode: fetched.exitCode, remoteTrackingRefs },
      comparison,
      zeroMutationProof: {
        worktreeStatusIdentical: after.status === before.status,
        headUnchanged: after.head === before.head,
        localBranchAndTagRefsUnchanged: after.localRefs === before.localRefs,
      },
      durationMs: Date.now() - started,
      audit: await writeAudit(deps, audit),
    };
  } catch (error) {
    const code = error instanceof GitFetchError ? error.code : "FETCH_EXECUTION_FAILED";
    await writeAudit(deps, { ...audit, result: "failed", code });
    throw error;
  }
}
