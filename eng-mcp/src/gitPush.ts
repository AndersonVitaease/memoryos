// GIT-PUSH-01: engineering.git.push — governed outbound push of the authorized
// git repository to origin. The default call is a read-only PLAN (branch, local
// head, LIVE remote head via github.read get_branch_head — never the stale
// refs/remotes/*, ahead classification, pending commits, credential state,
// blockers); a real push requires execute=true + approval.approved=true +
// acknowledgePush=true and re-runs the whole precheck fresh (TOCTOU). The push
// is exactly refs/heads/main:refs/heads/main — no --force, no --tags, no
// deletes, no refspec redirection; hooks always run (never --no-verify); MVP
// branch allowlist is main only. The credential is the operator's git
// credential-store FILE (GIT_CREDENTIALS_FILE, default /run/secrets/
// git-credentials, mounted read-only through the LoadCredential 3-link
// pattern): this module never reads its content — it only stats it, and
// isFile() catches the docker auto-created-empty-dir failure mode seen live on
// the github-pat mount — while git resolves it through an explicitly reset
// credential.helper chain, so no token ever reaches argv, env or logs.
// Remote/URL/credential/refspec input is structurally forbidden. Postcheck
// re-reads the branch head fresh (cache-bypassing) and must equal the pushed
// sha; success is never taken from git stdout. Divergence and non-fast-forward
// are blocked with typed errors — reconciliation (fetch/rebase/merge) is
// operator work and is never attempted by this tool.
import { spawn } from "node:child_process";
import { accessSync, appendFileSync, constants as fsConstants, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fetchBranchHeadFresh, redactGitHubSecrets } from "./githubRead.ts";

export class GitPushError extends Error {
  constructor(readonly code: string, readonly detail?: string) {
    super(detail ? `${code}:${redactGitHubSecrets(detail)}` : code);
    this.name = "GitPushError";
  }
}

const PUSH_BRANCH = "main"; // MVP allowlist — exactly one branch, never caller-supplied
const PUSH_TIMEOUT_MS = 60_000;
const PUSH_OUTPUT_CAP = 65_536;
const PUSH_DETAIL_CAP = 400;
const PUSH_POSTCHECK_ATTEMPTS = 3;
const PUSH_POSTCHECK_DELAY_MS = 2_000;
const CREDENTIAL_FILE_DEFAULT = "/run/secrets/git-credentials";
const AUDIT_FILE_DEFAULT = "/data/audit/git-push.jsonl";
let inFlight = false;

export type GitPushInput = { execute?: boolean; approval?: { approved?: boolean }; expectedHead?: string; acknowledgePush?: boolean };
export type GitPushHead = { sha: string | null; commitDate: string | null };
export type GitPushDeps = {
  repoRoot: string;
  executeGit?: (args: string[], timeoutMs: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  resolveRemoteHead?: (branch: string) => Promise<GitPushHead>;
  credentialFile?: string | null;
  auditFile?: string | null;
  withLock?: <T>(work: () => Promise<T>) => Promise<T>;
  subject?: string | null;
};
export type GitPushReport = {
  status: "PLAN" | "PUSHED";
  mutationPerformed: boolean;
  branch: string;
  localHead: string | null;
  remoteHead: GitPushHead | null;
  relation: "fast-forward" | "non-fast-forward" | "diverged" | "up-to-date";
  aheadCount: number | null;
  pendingCommits: string[];
  uncommitted: { modified: number; untracked: number };
  credential: { state: "mounted" | "missing"; path: string; detail?: string };
  hooks: "enabled";
  refspec: string;
  expectedHead: string | null;
  blockers: string[];
  pushedSha?: string;
  remoteHeadAfter?: GitPushHead | null;
  durationMs?: number;
  audit?: string;
};

type GitRunner = NonNullable<GitPushDeps["executeGit"]>;
type RemoteHead = { sha: string; commitDate: string | null };
type PushAudit = { result: "pushed" | "failed" | "postcheck-failed"; code: string | null; remoteHeadBefore: string | null; pushedSha: string | null; aheadCount: number | null };

function assertSafeInput(input: GitPushInput): void {
  const keys = Object.keys(input ?? {});
  const forbidden = keys.filter((key) => ["remote", "url", "credential", "credentials", "token", "refspec", "force", "branch", "repository"].includes(key));
  if (forbidden.length > 0) throw new GitPushError("PUSH_INPUT_FORBIDDEN", `keys rejected: ${forbidden.join(", ")} — this tool never accepts remote/credential/refspec input`);
  if (input.execute !== undefined && typeof input.execute !== "boolean") throw new GitPushError("PUSH_INPUT_FORBIDDEN", "execute must be a boolean");
  if (input.acknowledgePush !== undefined && input.acknowledgePush !== true) throw new GitPushError("PUSH_INPUT_FORBIDDEN", "acknowledgePush must be exactly true when present");
  if (input.expectedHead !== undefined && !/^[0-9a-f]{40}$/.test(input.expectedHead)) throw new GitPushError("PUSH_INPUT_FORBIDDEN", "expectedHead must be a full 40-hex sha");
}

function resolveCredentialPath(deps: GitPushDeps): string {
  return deps.credentialFile ?? process.env.GIT_CREDENTIALS_FILE ?? CREDENTIAL_FILE_DEFAULT;
}

function credentialState(deps: GitPushDeps): GitPushReport["credential"] {
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

function pushEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", LANG: "C.UTF-8", GIT_TERMINAL_PROMPT: "0" };
  if (process.env.HOME) env.HOME = process.env.HOME;
  return env;
}

function defaultExecuteGit(repoRoot: string): GitRunner {
  return (args, timeoutMs) => new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
    const child = spawn("git", args, { cwd: repoRoot, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: pushEnvironment() });
    let stdout = ""; let stderr = ""; let settled = false;
    const timer = setTimeout(() => {
      if (settled) return; settled = true;
      child.kill();
      reject(new GitPushError("PUSH_TIMEOUT", `git ${args.join(" ")} exceeded ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => { if (stdout.length < PUSH_OUTPUT_CAP) stdout += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk: Buffer) => { if (stderr.length < PUSH_OUTPUT_CAP) stderr += chunk.toString("utf8"); });
    child.once("error", (error) => { if (settled) return; settled = true; clearTimeout(timer); reject(new GitPushError("PUSH_EXECUTION_FAILED", `git binary unavailable: ${error.message}`)); });
    child.once("close", (code) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ stdout, stderr, exitCode: code ?? -1 }); });
  });
}

// FRESH remote head — the same live primitive as github.read get_branch_head,
// cache-bypassing by construction; refs/remotes/* is never consulted.
async function defaultResolveRemoteHead(branch: string): Promise<GitPushHead> {
  const fresh = await fetchBranchHeadFresh(branch);
  return { sha: fresh.sha, commitDate: fresh.commitDate };
}

async function fetchRemoteHead(deps: GitPushDeps, branch: string): Promise<RemoteHead> {
  try {
    const head = deps.resolveRemoteHead ? await deps.resolveRemoteHead(branch) : await defaultResolveRemoteHead(branch);
    if (!head || typeof head.sha !== "string" || !/^[0-9a-f]{40}$/.test(head.sha)) throw new Error("remote head response missing a full 40-hex sha");
    return { sha: head.sha, commitDate: head.commitDate ?? null };
  } catch (error) {
    throw new GitPushError("PUSH_PRECHECK_UNAVAILABLE", error instanceof Error ? error.message : String(error));
  }
}

async function localBranchHead(git: GitRunner, branch: string, timeoutMs: number): Promise<string> {
  const result = await git(["rev-parse", "--verify", `refs/heads/${branch}`], timeoutMs);
  if (result.exitCode !== 0) throw new GitPushError("PUSH_BRANCH_NOT_FOUND", (result.stderr || "branch ref missing").trim());
  return result.stdout.trim();
}

async function pendingCommits(git: GitRunner, remoteHead: string, localHead: string, timeoutMs: number): Promise<string[]> {
  const result = await git(["log", "--oneline", "--max-count=50", `${remoteHead}..${localHead}`], timeoutMs);
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

async function uncommittedCounts(git: GitRunner, timeoutMs: number): Promise<{ modified: number; untracked: number }> {
  const result = await git(["status", "--porcelain"], timeoutMs);
  const lines = result.stdout.split("\n").filter((line) => line.length > 0);
  const untracked = lines.filter((line) => line.startsWith("??")).length;
  return { modified: lines.length - untracked, untracked };
}

type Classification = { relation: GitPushReport["relation"]; aheadCount: number; commits: string[] };

// Local ancestry against the LIVE remote head: absent locally = diverged;
// present but not an ancestor = non-fast-forward; ancestor = fast-forward.
async function classifyRelation(git: GitRunner, localHead: string, remoteHead: string, timeoutMs: number): Promise<Classification> {
  const present = await git(["cat-file", "-e", `${remoteHead}^{commit}`], timeoutMs);
  const counted = await git(["rev-list", "--count", `${remoteHead}..${localHead}`], timeoutMs);
  const parsed = Number.parseInt(counted.stdout.trim(), 10);
  const aheadCount = Number.isFinite(parsed) ? parsed : 0;
  if (present.exitCode !== 0) return { relation: "diverged", aheadCount, commits: [] };
  const ancestor = await git(["merge-base", "--is-ancestor", remoteHead, localHead], timeoutMs);
  if (ancestor.exitCode !== 0) return { relation: "non-fast-forward", aheadCount, commits: aheadCount > 0 ? await pendingCommits(git, remoteHead, localHead, timeoutMs) : [] };
  return { relation: aheadCount === 0 ? "up-to-date" : "fast-forward", aheadCount, commits: aheadCount > 0 ? await pendingCommits(git, remoteHead, localHead, timeoutMs) : [] };
}

function refspec(branch: string): string {
  return `refs/heads/${branch}:refs/heads/${branch}`;
}

async function planPush(deps: GitPushDeps, input: GitPushInput, timeoutMs: number): Promise<GitPushReport> {
  const git = deps.executeGit ?? defaultExecuteGit(deps.repoRoot);
  const credential = credentialState(deps);
  const localHead = await localBranchHead(git, PUSH_BRANCH, timeoutMs);
  const remoteHead = await fetchRemoteHead(deps, PUSH_BRANCH);
  const { relation, aheadCount, commits } = await classifyRelation(git, localHead, remoteHead.sha, timeoutMs);
  const uncommitted = await uncommittedCounts(git, timeoutMs);
  const blockers: string[] = [];
  if (relation === "diverged") blockers.push("PUSH_STATE_DIVERGED");
  if (relation === "non-fast-forward") blockers.push("PUSH_NON_FAST_FORWARD_BLOCKED");
  if (relation === "up-to-date") blockers.push("PUSH_NOTHING_TO_PUSH");
  if (credential.state !== "mounted") blockers.push("PUSH_CREDENTIAL_MISSING");
  if (input.expectedHead && input.expectedHead !== localHead) blockers.push("PUSH_HEAD_MISMATCH");
  return {
    status: "PLAN", mutationPerformed: false, branch: PUSH_BRANCH, localHead, remoteHead,
    relation, aheadCount, pendingCommits: commits, uncommitted, credential,
    hooks: "enabled", refspec: refspec(PUSH_BRANCH), expectedHead: input.expectedHead ?? null, blockers,
  };
}

function mapPushFailure(stderr: string, exitCode: number): GitPushError {
  const detail = stderr.split("\n").map((line) => line.trim()).filter(Boolean).slice(-6).join(" | ").slice(0, PUSH_DETAIL_CAP);
  if (/does not appear to be a git repository|No such remote|'origin' does not exist/i.test(stderr)) return new GitPushError("PUSH_REMOTE_MISSING", detail);
  if (/could not read Username|Authentication failed|401|Invalid username or password|terminal prompts disabled/i.test(stderr)) return new GitPushError("PUSH_AUTH_REJECTED", detail);
  if (/403|Permission to .* denied to/i.test(stderr)) return new GitPushError("PUSH_FORBIDDEN", detail);
  if (/\[remote rejected\]|non-fast-forward|fetch first|remote contains work/i.test(stderr)) return new GitPushError("PUSH_NON_FAST_FORWARD_BLOCKED", detail);
  return new GitPushError("PUSH_EXECUTION_FAILED", `git push exit ${exitCode}: ${detail}`);
}

async function writeAudit(deps: GitPushDeps, entry: PushAudit): Promise<string> {
  const file = deps.auditFile ?? process.env.GIT_PUSH_AUDIT_FILE ?? AUDIT_FILE_DEFAULT;
  const line = JSON.stringify({ ts: new Date().toISOString(), subject: deps.subject ?? null, branch: PUSH_BRANCH, ...entry });
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, `${line}\n`, { encoding: "utf8" });
    return "written";
  } catch (error) {
    return `failed:${error instanceof Error ? error.message : String(error)}`;
  }
}

async function executePush(deps: GitPushDeps, input: GitPushInput, timeoutMs: number): Promise<GitPushReport> {
  const started = Date.now();
  const git = deps.executeGit ?? defaultExecuteGit(deps.repoRoot);
  const localHead = await localBranchHead(git, PUSH_BRANCH, timeoutMs);
  if (input.expectedHead && input.expectedHead !== localHead) throw new GitPushError("PUSH_HEAD_MISMATCH", `expectedHead ${input.expectedHead} != local HEAD ${localHead} — refuse instead of pushing an unexpected state`);
  const credential = credentialState(deps);
  if (credential.state !== "mounted") throw new GitPushError("PUSH_CREDENTIAL_MISSING", credential.detail ?? `credential file ${credential.path} is not a readable file`);
  const remoteHead = await fetchRemoteHead(deps, PUSH_BRANCH);
  const { relation, aheadCount } = await classifyRelation(git, localHead, remoteHead.sha, timeoutMs);
  if (relation === "diverged") throw new GitPushError("PUSH_STATE_DIVERGED", `remote ${PUSH_BRANCH} head ${remoteHead.sha} is absent from the local object database — reconciliation (fetch) is operator work; this tool never fetches`);
  if (relation === "non-fast-forward") throw new GitPushError("PUSH_NON_FAST_FORWARD_BLOCKED", `local ${PUSH_BRANCH} is ${aheadCount} ahead but remote head ${remoteHead.sha} is not an ancestor — a push would be rejected non-fast-forward; reconciliation is operator work`);
  if (relation === "up-to-date") throw new GitPushError("PUSH_NOTHING_TO_PUSH", `local ${localHead} already equals the remote head`);
  const argv = ["-c", "credential.helper=", "-c", `credential.helper=store --file=${credential.path}`, "push", "origin", refspec(PUSH_BRANCH)];
  const push = await git(argv, timeoutMs);
  if (push.exitCode !== 0) {
    const failure = mapPushFailure(push.stderr, push.exitCode);
    await writeAudit(deps, { result: "failed", code: failure.code, remoteHeadBefore: remoteHead.sha, pushedSha: null, aheadCount });
    throw failure;
  }
  // Postcheck: the LIVE remote head must equal the pushed sha — bounded
  // retries absorb brief upstream lag; success is NEVER taken from git stdout.
  let remoteHeadAfter: GitPushHead | null = null;
  for (let attempt = 1; attempt <= PUSH_POSTCHECK_ATTEMPTS; attempt += 1) {
    remoteHeadAfter = await fetchRemoteHead(deps, PUSH_BRANCH);
    if (remoteHeadAfter.sha === localHead) {
      const audit = await writeAudit(deps, { result: "pushed", code: null, remoteHeadBefore: remoteHead.sha, pushedSha: localHead, aheadCount });
      return {
        status: "PUSHED", mutationPerformed: true, branch: PUSH_BRANCH, localHead, remoteHead,
        relation: "fast-forward", aheadCount, pendingCommits: [], uncommitted: await uncommittedCounts(git, timeoutMs),
        credential, hooks: "enabled", refspec: refspec(PUSH_BRANCH), expectedHead: input.expectedHead ?? null,
        blockers: [], pushedSha: localHead, remoteHeadAfter, durationMs: Date.now() - started, audit,
      };
    }
    if (attempt < PUSH_POSTCHECK_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, PUSH_POSTCHECK_DELAY_MS));
  }
  await writeAudit(deps, { result: "postcheck-failed", code: "PUSH_POSTCHECK_FAILED", remoteHeadBefore: remoteHead.sha, pushedSha: localHead, aheadCount });
  throw new GitPushError("PUSH_POSTCHECK_FAILED", `postcheck: remote head is ${remoteHeadAfter?.sha ?? "unknown"} after ${PUSH_POSTCHECK_ATTEMPTS} fresh reads, expected ${localHead}`);
}

export async function runGitPush(input: GitPushInput, deps: GitPushDeps): Promise<GitPushReport> {
  assertSafeInput(input);
  const timeoutMs = PUSH_TIMEOUT_MS;
  if (input.execute !== true) return planPush(deps, input, timeoutMs);
  if (input.approval?.approved !== true || input.acknowledgePush !== true) {
    throw new GitPushError("PUSH_APPROVAL_REQUIRED", "execute=true requires approval.approved=true AND acknowledgePush=true (mirror of the governed git.commit cycle)");
  }
  if (inFlight) throw new GitPushError("PUSH_IN_FLIGHT", "another git.push execution is already in progress; concurrent pushes are refused, not queued");
  inFlight = true;
  try {
    const work = () => executePush(deps, input, timeoutMs);
    return deps.withLock ? await deps.withLock(work) : await work();
  } finally {
    inFlight = false;
  }
}
