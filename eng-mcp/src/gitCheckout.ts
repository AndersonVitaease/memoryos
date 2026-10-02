// GIT-CHECKOUT-01: engineering.git.checkout — governed checkout of a branch
// into a worktree. The tool NEVER falls back to raw `git checkout` at the
// repository root (that would silently land a checked-out branch in the
// canonical repo, breaking the worktree boundary). All mutations happen
// through `git worktree add` and the worktree is always created under
// WT_ROOT/mission-<id> (or the caller-specified path inside the repo's
// worktree list). If the target branch already lives in another worktree,
// the call refuses with a typed error instead of silently reusing it.
import { spawn } from "node:child_process";
import { accessSync, appendFileSync, constants as fsConstants, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { EngineeringError } from "./policy.js";

const WT_ROOT = "/opt/memoryos";
const CHECKOUT_TIMEOUT_MS = 60_000;
const CHECKOUT_OUTPUT_CAP = 65_536;
const CHECKOUT_DETAIL_CAP = 400;
const CREDENTIAL_FILE_DEFAULT = "/run/secrets/git-credentials";
const AUDIT_FILE_DEFAULT = "/data/audit/git-checkout.jsonl";

export class GitCheckoutError extends Error {
  constructor(readonly code: string, readonly detail?: string) {
    super(detail ? `${code}:${detail}` : code);
    this.name = "GitCheckoutError";
  }
}

export type GitCheckoutDeps = {
  repoRoot: string;
  executeGit?: (args: string[], timeoutMs: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  credentialFile?: string | null;
  auditFile?: string | null;
  withLock?: <T>(work: () => Promise<T>) => Promise<T>;
  subject?: string | null;
};

export type GitCheckoutReport = {
  status: "PLAN" | "CHECKED_OUT";
  branch: string;
  path: string;
  baseSha: string | null;
  newHead: string | null;
  worktreeRegistered: boolean;
  mutationPerformed: boolean;
  blockers: string[];
  credential: { state: "mounted" | "missing"; path: string };
  audit?: string;
};

function defaultExecuteGit(repoRoot: string) {
  return (args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string; exitCode: number }> =>
    new Promise((resolve, reject) => {
      const child = spawn("git", args, { cwd: repoRoot, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = ""; let stderr = ""; let settled = false;
      const timer = setTimeout(() => {
        if (settled) return; settled = true;
        child.kill();
        reject(new GitCheckoutError("CHECKOUT_TIMEOUT", `git ${args.join(" ")} exceeded ${timeoutMs}ms`));
      }, timeoutMs);
      child.stdout?.on("data", (chunk: Buffer) => { if (stdout.length < CHECKOUT_OUTPUT_CAP) stdout += chunk.toString("utf8"); });
      child.stderr?.on("data", (chunk: Buffer) => { if (stderr.length < CHECKOUT_OUTPUT_CAP) stderr += chunk.toString("utf8"); });
      child.once("error", () => { if (settled) return; settled = true; clearTimeout(timer); reject(new GitCheckoutError("CHECKOUT_EXECUTION_FAILED", "git binary unavailable")); });
      child.once("close", (code) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ stdout, stderr, exitCode: code ?? -1 }); });
    });
}

function resolveCredentialPath(deps: GitCheckoutDeps): string {
  return deps.credentialFile ?? process.env.GIT_CREDENTIALS_FILE ?? CREDENTIAL_FILE_DEFAULT;
}

function credentialState(deps: GitCheckoutDeps): GitCheckoutReport["credential"] {
  const target = resolveCredentialPath(deps);
  try {
    const stats = statSync(target);
    if (!stats.isFile()) return { state: "missing", path: target };
    accessSync(target, fsConstants.R_OK);
    return { state: "mounted", path: target };
  } catch {
    return { state: "missing", path: target };
  }
}

async function branchExists(git: (args: string[], timeoutMs: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>, branch: string, timeoutMs: number): Promise<boolean> {
  const result = await git(["show-ref", "--verify", `refs/heads/${branch}`], timeoutMs);
  return result.exitCode === 0;
}

async function worktreeContainsBranch(git: (args: string[], timeoutMs: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>, branch: string, timeoutMs: number): Promise<boolean> {
  const result = await git(["worktree", "list", "--porcelain"], timeoutMs);
  if (result.exitCode !== 0) return false;
  // porcelain emits `worktree <path>` BEFORE `branch <ref>` within each block —
  // collect the branch of the current block and test it when the block ends.
  let currentBranch = "";
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      currentBranch = "";
    } else if (line.startsWith("branch ")) {
      if (line.substring(7) === `refs/heads/${branch}`) return true;
      currentBranch = line.substring(7);
    }
  }
  return false;
}

async function getHeadSha(git: (args: string[], timeoutMs: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>, timeoutMs: number): Promise<string | null> {
  const result = await git(["rev-parse", "--verify", "HEAD"], timeoutMs);
  if (result.exitCode !== 0) return null;
  return result.stdout.trim() || null;
}

async function writeAudit(deps: GitCheckoutDeps, entry: { result: string; code: string | null; branch: string; path: string; baseSha: string | null; newHead: string | null }): Promise<string> {
  const file = deps.auditFile ?? process.env.GIT_CHECKOUT_AUDIT_FILE ?? AUDIT_FILE_DEFAULT;
  const line = JSON.stringify({ ts: new Date().toISOString(), subject: deps.subject ?? null, ...entry });
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, `${line}\n`, { encoding: "utf8" });
    return "written";
  } catch (error) {
    return `failed:${error instanceof Error ? error.message : String(error)}`;
  }
}

async function planCheckout(deps: GitCheckoutDeps, branch: string, timeoutMs: number): Promise<GitCheckoutReport> {
  const git = deps.executeGit ?? defaultExecuteGit(deps.repoRoot);
  const credential = credentialState(deps);
  const blockers: string[] = [];
  const exists = await branchExists(git, branch, timeoutMs);
  if (!exists) blockers.push("CHECKOUT_BRANCH_NOT_FOUND");
  const inOtherWorktree = await worktreeContainsBranch(git, branch, timeoutMs);
  if (inOtherWorktree) blockers.push("CHECKOUT_BRANCH_IN_OTHER_WORKTREE");
  if (credential.state !== "mounted") blockers.push("CHECKOUT_CREDENTIAL_MISSING");
  const currentHead = await getHeadSha(git, timeoutMs);
  return {
    status: "PLAN",
    branch,
    path: `${WT_ROOT}/mission-${branch}`,
    baseSha: currentHead,
    newHead: null,
    worktreeRegistered: false,
    mutationPerformed: false,
    blockers,
    credential,
  };
}

async function executeCheckout(deps: GitCheckoutDeps, branch: string, timeoutMs: number): Promise<GitCheckoutReport> {
  const git = deps.executeGit ?? defaultExecuteGit(deps.repoRoot);
  const credential = credentialState(deps);
  const blockers: string[] = [];

  const exists = await branchExists(git, branch, timeoutMs);
  if (!exists) throw new GitCheckoutError("CHECKOUT_BRANCH_NOT_FOUND", `branch ${branch} does not exist`);
  const inOtherWorktree = await worktreeContainsBranch(git, branch, timeoutMs);
  if (inOtherWorktree) throw new GitCheckoutError("CHECKOUT_BRANCH_IN_OTHER_WORKTREE", `branch ${branch} is already checked out in another worktree`);
  if (credential.state !== "mounted") throw new GitCheckoutError("CHECKOUT_CREDENTIAL_MISSING", credential.path ?? `credential file not mounted`);

  const baseSha = await getHeadSha(git, timeoutMs);
  const worktreePath = `${WT_ROOT}/mission-${branch}`;

  const addResult = await git(["worktree", "add", worktreePath, branch], timeoutMs);
  if (addResult.exitCode !== 0) {
    const detail = addResult.stderr.trim().slice(0, CHECKOUT_DETAIL_CAP) || addResult.stdout.trim().slice(0, CHECKOUT_DETAIL_CAP);
    await writeAudit(deps, { result: "failed", code: "CHECKOUT_WORKTREE_CREATE_FAILED", branch, path: worktreePath, baseSha, newHead: null });
    throw new GitCheckoutError("CHECKOUT_WORKTREE_CREATE_FAILED", detail);
  }

  const registered = await worktreeContainsBranch(git, branch, timeoutMs);
  if (!registered) {
    await writeAudit(deps, { result: "failed", code: "CHECKOUT_WORKTREE_NOT_REGISTERED", branch, path: worktreePath, baseSha, newHead: null });
    throw new GitCheckoutError("CHECKOUT_WORKTREE_NOT_REGISTERED", `worktree for ${branch} was not registered`);
  }

  const newHead = await getHeadSha(git, timeoutMs);
  await writeAudit(deps, { result: "checked_out", code: null, branch, path: worktreePath, baseSha, newHead });

  return {
    status: "CHECKED_OUT",
    branch,
    path: worktreePath,
    baseSha,
    newHead,
    worktreeRegistered: true,
    mutationPerformed: true,
    blockers,
    credential,
  };
}

export type GitCheckoutInput = {
  branch: string;
  execute?: boolean;
  acknowledgeCheckout?: boolean;
};

export async function runGitCheckout(input: GitCheckoutInput, deps: GitCheckoutDeps): Promise<GitCheckoutReport> {
  const timeoutMs = CHECKOUT_TIMEOUT_MS;
  if (!input.branch || typeof input.branch !== "string") throw new GitCheckoutError("CHECKOUT_INPUT_FORBIDDEN", "branch is required and must be a string");
  if (input.execute !== undefined && typeof input.execute !== "boolean") throw new GitCheckoutError("CHECKOUT_INPUT_FORBIDDEN", "execute must be a boolean");
  if (input.acknowledgeCheckout !== undefined && input.acknowledgeCheckout !== true) throw new GitCheckoutError("CHECKOUT_INPUT_FORBIDDEN", "acknowledgeCheckout must be exactly true when present");

  if (input.execute === true) {
    if (!input.acknowledgeCheckout) throw new GitCheckoutError("CHECKOUT_ACKNOWLEDGMENT_REQUIRED", "acknowledgeCheckout=true is required when execute=true");
    return await executeCheckout(deps, input.branch, timeoutMs);
  }
  return await planCheckout(deps, input.branch, timeoutMs);
}
