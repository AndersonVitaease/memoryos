// FASE 2: engineering.github.read — GitHub READ-ONLY super tool backend (10
// operations over the GitHub REST API, GET-only by construction, fetch native —
// zero new dependencies). Credential follows the E2B precedent (sandbox.ts):
// GITHUB_TOKEN env wins, else GITHUB_TOKEN_FILE (the same credential-file mount
// pattern), else GITHUB_CREDENTIAL_MISSING — no anonymous fallback, ever. The
// token is never returned, logged or echoed: error details pass through
// redactGitHubSecrets and the get_file content path passes the house gate
// assertNoSensitiveContent. Rate protection is 3-layer: every response reports
// {limit, remaining, resetAt}; a bounded TTL cache absorbs repeat calls; a local
// floor (ENG_MCP_GITHUB_RATE_FLOOR, default 50) refuses to burn the last quota
// with GITHUB_RATE_LIMIT_LOW before the upstream 403 ever happens (get_rate_limit
// is exempt — the /rate_limit endpoint does not count against the quota). The
// repo is allowlisted per call (ENG_MCP_GITHUB_REPO, default
// AndersonVitaease/memoryos). Every upstream call is bounded by an
// AbortController timeout (ENG_MCP_GITHUB_TIMEOUT_MS, default 10s).
import { readFileSync } from "node:fs";
import * as z from "zod/v4";
import { assertNoSensitiveContent, isSensitivePath } from "./policy.ts";
import { redactSensitive } from "./vpsTransport.ts";

export class GitHubReadError extends Error {
  constructor(readonly code: string, readonly detail?: string) {
    super(detail ? `${code}:${redactGitHubSecrets(detail)}` : code);
    this.name = "GitHubReadError";
  }
}

const GITHUB_TOKEN_PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9_]{16,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{16,}\b/g,
  /\bBearer\s+\S+/g
];

export function redactGitHubSecrets(text: string): string {
  let out = text;
  for (const pattern of GITHUB_TOKEN_PATTERNS) out = out.replace(pattern, "[REDACTED_SECRET]");
  return out.slice(0, 500);
}

function resolveGithubToken(): string {
  const inline = process.env.GITHUB_TOKEN;
  if (typeof inline === "string" && inline.trim().length > 0) return inline.trim();
  const credentialFile = process.env.GITHUB_TOKEN_FILE;
  if (typeof credentialFile === "string" && credentialFile.trim().length > 0) {
    let value = "";
    try { value = readFileSync(credentialFile.trim(), "utf8").trim(); } catch { value = ""; }
    if (value.length > 0) return value;
    throw new GitHubReadError("GITHUB_CREDENTIAL_MISSING", `credential file not readable (GITHUB_TOKEN_FILE=${credentialFile.trim()})`);
  }
  throw new GitHubReadError("GITHUB_CREDENTIAL_MISSING", "GitHub token is not provisioned in the server env (set GITHUB_TOKEN or GITHUB_TOKEN_FILE; operator-issued fine-grained PAT, read-only)");
}

function defaultRepo(): string {
  const raw = process.env.ENG_MCP_GITHUB_REPO?.trim();
  return raw && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw) ? raw : "AndersonVitaease/memoryos";
}

function resolveRepo(input?: string): string {
  if (input === undefined || input === "") return defaultRepo();
  if (input.includes("..") || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input)) throw new GitHubReadError("GITHUB_VALIDATION_FAILED", "repo must match owner/name");
  if (input !== defaultRepo()) throw new GitHubReadError("GITHUB_REPO_NOT_ALLOWLISTED", `${input} (allowlist: ${defaultRepo()})`);
  return input;
}

type RateLimit = { limit: number; remaining: number; resetAt: string } | null;
let lastKnownRemaining: number | null = null;
let lastKnownResetAt: string | null = null;

function rateFloor(): number {
  const raw = Number(process.env.ENG_MCP_GITHUB_RATE_FLOOR);
  return Number.isInteger(raw) && raw >= 0 ? raw : 50;
}

function assertLocalRateBudget(): void {
  if (lastKnownRemaining === null) return;
  if (lastKnownRemaining < rateFloor()) {
    throw new GitHubReadError("GITHUB_RATE_LIMIT_LOW", `local guard: ${lastKnownRemaining} upstream calls remain, floor is ${rateFloor()}; quota resets at ${lastKnownResetAt ?? "unknown"} (get_rate_limit is free and never counted)`);
  }
}

function readRateLimitHeaders(headers: Headers): RateLimit {
  const limit = Number(headers.get("x-ratelimit-limit"));
  const remaining = Number(headers.get("x-ratelimit-remaining"));
  const reset = Number(headers.get("x-ratelimit-reset"));
  if (!Number.isFinite(limit) || !Number.isFinite(remaining) || !Number.isFinite(reset)) return null;
  return { limit, remaining, resetAt: new Date(reset * 1000).toISOString() };
}

const CACHE_TTL_MS: Record<string, number> = { get_repo: 60_000, list_refs: 60_000, get_pr: 60_000, list_action_runs: 60_000, compare: 30_000, get_commit: 30_000, list_commits: 30_000, get_branch_head: 30_000, get_file: 30_000, get_rate_limit: 0 };
const CACHE_MAX_ENTRIES = 64;
const cache = new Map<string, { at: number; value: Record<string, unknown> }>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function timeoutMs(): number {
  const raw = Number(process.env.ENG_MCP_GITHUB_TIMEOUT_MS);
  return Number.isInteger(raw) && raw >= 250 ? raw : 10_000;
}

const GITHUB_API_BASE = "https://api.github.com";

async function githubFetchJson(pathname: string): Promise<{ body: unknown; rateLimit: RateLimit }> {
  const token = resolveGithubToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  let response: Response;
  try {
    response = await fetch(`${GITHUB_API_BASE}${pathname}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "memoryos-eng-mcp (github.read; read-only)" },
      signal: controller.signal,
      redirect: "error"
    });
  } catch (error) {
    if (controller.signal.aborted) throw new GitHubReadError("GITHUB_TIMEOUT", `upstream did not answer within ${timeoutMs()}ms`);
    throw new GitHubReadError("GITHUB_UNREACHABLE", error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
  const rateLimit = readRateLimitHeaders(response.headers);
  if (rateLimit !== null) { lastKnownRemaining = rateLimit.remaining; lastKnownResetAt = rateLimit.resetAt; }
  let body: unknown = null;
  if (response.status !== 204) {
    const text = await response.text();
    try { body = text.length > 0 ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  }
  if (response.status === 200 || response.status === 201) return { body, rateLimit };
  const message = isRecord(body) && typeof body.message === "string" ? body.message : "(no message)";
  if (response.status === 401) throw new GitHubReadError("GITHUB_AUTH_REJECTED", `token rejected by GitHub (invalid, revoked or expired): ${message}`);
  if (response.status === 403 || response.status === 429) {
    if ((response.headers.get("x-ratelimit-remaining") ?? "1") === "0") throw new GitHubReadError("GITHUB_RATE_LIMIT_EXCEEDED", `upstream quota exhausted, resets at ${rateLimit?.resetAt ?? "unknown"}`);
    throw new GitHubReadError("GITHUB_FORBIDDEN", `GitHub refused this resource for the token (fine-grained PAT missing a permission?): ${message}`);
  }
  if (response.status === 404) throw new GitHubReadError("GITHUB_NOT_FOUND", `resource does not exist, or is a private repo the token cannot see (GitHub answers 404 to avoid leaking existence): ${message}`);
  if (response.status === 422) throw new GitHubReadError("GITHUB_VALIDATION_FAILED", `GitHub rejected the request: ${message}`);
  throw new GitHubReadError("GITHUB_UNEXPECTED_STATUS", `HTTP ${response.status}: ${message}`);
}

function commitMeta(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const commit = isRecord(value.commit) ? value.commit : {};
  const author = isRecord(commit.author) ? commit.author : {};
  const user = isRecord(value.author) ? value.author : {};
  return {
    sha: value.sha ?? null,
    message: typeof commit.message === "string" ? commit.message.split("\n")[0].slice(0, 200) : null,
    date: author.date ?? null,
    author: user.login ?? author.name ?? null
  };
}

async function fetchDefaultBranch(repo: string): Promise<string> {
  const { body } = await githubFetchJson(`/repos/${repo}`);
  const value = isRecord(body) ? body.default_branch : undefined;
  if (typeof value !== "string" || value.length === 0) throw new GitHubReadError("GITHUB_OUTPUT_INVALID", "default_branch missing in repo payload");
  return value;
}

async function opCompare(args: GithubCompareArgs): Promise<Record<string, unknown>> {
  const repo = resolveRepo(args.repo);
  const head = args.head ?? "main";
  const base = args.base ?? await fetchDefaultBranch(repo);
  const { body, rateLimit } = await githubFetchJson(`/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
  if (!isRecord(body)) throw new GitHubReadError("GITHUB_OUTPUT_INVALID", "compare payload missing");
  const commits = Array.isArray(body.commits) ? body.commits.map(commitMeta).slice(0, 50) : [];
  return {
    operation: "compare", repo, base, head,
    aheadBy: body.ahead_by ?? null, behindBy: body.behind_by ?? null, status: body.status ?? null,
    commits, truncated: Array.isArray(body.commits) && body.commits.length > 50,
    bothRefsAreRemote: true,
    note: "compare sees only refs that exist ON GitHub — unpushed local commits are invisible here; use local git tools for those",
    rateLimit
  };
}

const MAX_PATCH_BYTES = 32_768;

async function opGetCommit(args: GithubGetCommitArgs): Promise<Record<string, unknown>> {
  const repo = resolveRepo(args.repo);
  const { body, rateLimit } = await githubFetchJson(`/repos/${repo}/commits/${encodeURIComponent(args.ref)}`);
  if (!isRecord(body)) throw new GitHubReadError("GITHUB_OUTPUT_INVALID", "commit payload missing");
  const commit = isRecord(body.commit) ? body.commit : {};
  const commitAuthor = isRecord(commit.author) ? commit.author : {};
  const files = Array.isArray(body.files) ? body.files : [];
  let anyPatchTruncated = false;
  const mappedFiles = files.slice(0, 100).map((entry) => {
    if (!isRecord(entry)) return {} as Record<string, unknown>;
    const file: Record<string, unknown> = { filename: entry.filename ?? null, status: entry.status ?? null, additions: entry.additions ?? null, deletions: entry.deletions ?? null, changes: entry.changes ?? null };
    if (args.includePatch === true && typeof entry.patch === "string") {
      file.patch = entry.patch.length > MAX_PATCH_BYTES ? entry.patch.slice(0, MAX_PATCH_BYTES) : entry.patch;
      file.patchTruncated = entry.patch.length > MAX_PATCH_BYTES;
      if (file.patchTruncated) anyPatchTruncated = true;
    }
    return file;
  });
  return {
    operation: "get_commit", repo, ref: args.ref, sha: body.sha ?? null,
    message: typeof commit.message === "string" ? commit.message.split("\n")[0].slice(0, 300) : null,
    author: isRecord(body.author) ? body.author.login ?? null : null,
    date: commitAuthor.date ?? null,
    stats: isRecord(body.stats) ? { additions: body.stats.additions ?? null, deletions: body.stats.deletions ?? null, total: body.stats.total ?? null } : null,
    includePatch: args.includePatch === true,
    files: mappedFiles, filesTruncated: files.length > 100, anyPatchTruncated,
    rateLimit
  };
}

async function opListCommits(args: GithubListCommitsArgs): Promise<Record<string, unknown>> {
  const repo = resolveRepo(args.repo);
  const maxCount = args.maxCount ?? 50;
  if (args.sinceSha) {
    const head = args.ref ?? "main";
    const { body, rateLimit } = await githubFetchJson(`/repos/${repo}/compare/${encodeURIComponent(args.sinceSha)}...${encodeURIComponent(head)}`);
    const rawCommits = isRecord(body) && Array.isArray(body.commits) ? body.commits : [];
    return { operation: "list_commits", repo, mode: "range", sinceSha: args.sinceSha, ref: head, commits: rawCommits.map(commitMeta).slice(0, maxCount), truncated: rawCommits.length > maxCount, rateLimit };
  }
  const params = new URLSearchParams({ per_page: String(maxCount) });
  if (args.ref) params.set("sha", args.ref);
  if (args.since) {
    if (Number.isNaN(Date.parse(args.since))) throw new GitHubReadError("GITHUB_VALIDATION_FAILED", `since must be an ISO-8601 date, got ${args.since}`);
    params.set("since", new Date(args.since).toISOString());
  }
  const { body, rateLimit } = await githubFetchJson(`/repos/${repo}/commits?${params.toString()}`);
  const list = Array.isArray(body) ? body.map(commitMeta).slice(0, maxCount) : [];
  return { operation: "list_commits", repo, mode: "since", ref: args.ref ?? null, since: args.since ?? null, commits: list, truncated: list.length === maxCount, rateLimit };
}

async function opGetBranchHead(args: GithubGetBranchHeadArgs): Promise<Record<string, unknown>> {
  const repo = resolveRepo(args.repo);
  const branch = args.branch ?? await fetchDefaultBranch(repo);
  const { body, rateLimit } = await githubFetchJson(`/repos/${repo}/branches/${encodeURIComponent(branch)}`);
  if (!isRecord(body) || !isRecord(body.commit)) throw new GitHubReadError("GITHUB_OUTPUT_INVALID", "branch payload missing commit");
  const commit = isRecord(body.commit.commit) ? body.commit.commit : {};
  const committer = isRecord(commit.committer) ? commit.committer : {};
  return { operation: "get_branch_head", repo, branch, sha: body.commit.sha ?? null, commitDate: committer.date ?? null, rateLimit };
}

// GIT-PUSH-01: cache-bypassing branch head for the governed push precheck and
// postcheck — the get_branch_head TTL cache would happily serve a pre-push sha
// to a postcheck seconds later; the push must always read the live head.
export async function fetchBranchHeadFresh(branch: string): Promise<{ repo: string; branch: string; sha: string | null; commitDate: string | null }> {
  const repo = defaultRepo();
  const { body } = await githubFetchJson(`/repos/${repo}/branches/${encodeURIComponent(branch)}`);
  if (!isRecord(body) || !isRecord(body.commit)) throw new GitHubReadError("GITHUB_OUTPUT_INVALID", "branch payload missing commit");
  const commit = isRecord(body.commit.commit) ? body.commit.commit : {};
  const committer = isRecord(commit.committer) ? commit.committer : {};
  return { repo, branch, sha: typeof body.commit.sha === "string" ? body.commit.sha : null, commitDate: typeof committer.date === "string" ? committer.date : null };
}

async function opGetRepo(args: GithubGetRepoArgs): Promise<Record<string, unknown>> {
  const repo = resolveRepo(args.repo);
  const { body, rateLimit } = await githubFetchJson(`/repos/${repo}`);
  if (!isRecord(body)) throw new GitHubReadError("GITHUB_OUTPUT_INVALID", "repo payload missing");
  return {
    operation: "get_repo", repo,
    fullName: body.full_name ?? null, private: body.private === true, visibility: body.visibility ?? null,
    defaultBranch: typeof body.default_branch === "string" ? body.default_branch : null,
    pushedAt: body.pushed_at ?? null, htmlUrl: body.html_url ?? null,
    description: typeof body.description === "string" ? body.description.slice(0, 300) : null,
    rateLimit
  };
}


async function opGetPr(args: GithubGetPrArgs): Promise<Record<string, unknown>> {
  const repo = resolveRepo(args.repo);
  const { body, rateLimit } = await githubFetchJson(`/repos/${repo}/pulls/${args.number}`);
  if (!isRecord(body)) throw new GitHubReadError("GITHUB_OUTPUT_INVALID", "pull request payload missing");
  const result: Record<string, unknown> = {
    operation: "get_pr", repo, number: args.number,
    state: body.state ?? null, draft: body.draft === true, merged: body.merged === true,
    mergeable: body.mergeable ?? null, mergeableState: body.mergeable_state ?? null,
    title: typeof body.title === "string" ? body.title.slice(0, 300) : null,
    base: isRecord(body.base) ? body.base.ref ?? null : null,
    head: isRecord(body.head) ? body.head.ref ?? null : null,
    headSha: isRecord(body.head) ? body.head.sha ?? null : null,
    createdAt: body.created_at ?? null, updatedAt: body.updated_at ?? null, htmlUrl: body.html_url ?? null,
    rateLimit
  };
  if (args.includeReviews === true) {
    const reviewsRes = await githubFetchJson(`/repos/${repo}/pulls/${args.number}/reviews`);
    const reviews = Array.isArray(reviewsRes.body) ? reviewsRes.body.slice(0, 50).map((review) => {
      if (!isRecord(review)) return {} as Record<string, unknown>;
      return { user: isRecord(review.user) ? review.user.login ?? null : null, state: review.state ?? null, submittedAt: review.submitted_at ?? null, body: typeof review.body === "string" ? review.body.slice(0, 256) : "" };
    }) : [];
    result.reviews = reviews;
    result.rateLimit = reviewsRes.rateLimit;
  }
  if (args.includeChecks === true) {
    const headSha = result.headSha;
    if (typeof headSha !== "string") throw new GitHubReadError("GITHUB_OUTPUT_INVALID", "head sha missing; checks cannot be fetched");
    const checksRes = await githubFetchJson(`/repos/${repo}/commits/${headSha}/check-runs`);
    const checkRuns = isRecord(checksRes.body) && Array.isArray(checksRes.body.check_runs) ? checksRes.body.check_runs.slice(0, 50).map((run) => {
      if (!isRecord(run)) return {} as Record<string, unknown>;
      return { name: run.name ?? null, status: run.status ?? null, conclusion: run.conclusion ?? null, htmlUrl: run.html_url ?? null };
    }) : [];
    const statusRes = await githubFetchJson(`/repos/${repo}/commits/${headSha}/status`);
    result.checkRuns = checkRuns;
    result.commitStatus = isRecord(statusRes.body) ? statusRes.body.state ?? null : null;
    result.rateLimit = statusRes.rateLimit;
  }
  return result;
}

async function opListActionRuns(args: GithubListActionRunsArgs): Promise<Record<string, unknown>> {
  const repo = resolveRepo(args.repo);
  const maxCount = args.maxCount ?? 30;
  const params = new URLSearchParams({ per_page: String(maxCount) });
  if (args.branch) params.set("branch", args.branch);
  const { body, rateLimit } = await githubFetchJson(`/repos/${repo}/actions/runs?${params.toString()}`);
  const runs = isRecord(body) && Array.isArray(body.workflow_runs) ? body.workflow_runs.slice(0, maxCount).map((entry) => {
    if (!isRecord(entry)) return {} as Record<string, unknown>;
    return { name: entry.name ?? null, event: entry.event ?? null, status: entry.status ?? null, conclusion: entry.conclusion ?? null, branch: entry.head_branch ?? null, sha: entry.head_sha ?? null, createdAt: entry.created_at ?? null, htmlUrl: entry.html_url ?? null };
  }) : [];
  return { operation: "list_action_runs", repo, branch: args.branch ?? null, totalCount: isRecord(body) ? body.total_count ?? null : null, runs, truncated: runs.length === maxCount, rateLimit };
}

async function opListRefs(args: GithubListRefsArgs): Promise<Record<string, unknown>> {
  const repo = resolveRepo(args.repo);
  const maxCount = args.maxCount ?? 50;
  const { body, rateLimit } = await githubFetchJson(`/repos/${repo}/${args.kind === "tags" ? "tags" : "releases"}?per_page=${maxCount}`);
  const list = Array.isArray(body) ? body.slice(0, maxCount).map((entry) => {
    if (!isRecord(entry)) return {} as Record<string, unknown>;
    if (args.kind === "tags") return { name: entry.name ?? null, sha: isRecord(entry.commit) ? entry.commit.sha ?? null : null };
    return { name: entry.name ?? null, tagName: entry.tag_name ?? null, publishedAt: entry.published_at ?? null, draft: entry.draft === true, prerelease: entry.prerelease === true };
  }) : [];
  return { operation: "list_refs", repo, kind: args.kind, items: list, truncated: list.length === maxCount, rateLimit };
}

async function opGetFile(args: GithubGetFileArgs): Promise<Record<string, unknown>> {
  const repo = resolveRepo(args.repo);
  const filePath = args.path;
  if (filePath.includes("\\") || /[\u0000-\u001f\u007f]/.test(filePath)) throw new GitHubReadError("GITHUB_PATH_INVALID", "path contains a backslash or control character");
  const segments = filePath.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) throw new GitHubReadError("GITHUB_PATH_INVALID", "path must be repo-relative with no empty/./.. segments");
  if (/^[A-Za-z]:/.test(filePath)) throw new GitHubReadError("GITHUB_PATH_INVALID", "path must be repo-relative");
  if (isSensitivePath(filePath)) throw new GitHubReadError("PATH_DENIED", "path matches the house sensitive-path denylist");
  const maxBytes = args.maxBytes ?? 65_536;
  const query = args.ref ? `?ref=${encodeURIComponent(args.ref)}` : "";
  const { body, rateLimit } = await githubFetchJson(`/repos/${repo}/contents/${segments.map((segment) => encodeURIComponent(segment)).join("/")}${query}`);
  if (!isRecord(body)) throw new GitHubReadError("GITHUB_OUTPUT_INVALID", "contents payload missing");
  if (body.type !== "file") throw new GitHubReadError("GITHUB_FILE_NOT_FILE", "path is a directory or symlink; address a concrete file");
  const size = typeof body.size === "number" ? body.size : null;
  if (size !== null && size > maxBytes) throw new GitHubReadError("GITHUB_FILE_TOO_LARGE", `file is ${size} bytes, maxBytes is ${maxBytes}; refusing instead of truncating`);
  if (typeof body.content !== "string" || (body.content.length === 0 && size !== null && size > 0)) {
    throw new GitHubReadError("GITHUB_FILE_TOO_LARGE", `file is ${size ?? "unknown"} bytes; the contents API omits content above 1MB and this tool refuses instead of using the blob API`);
  }
  const decoded = body.encoding === "base64" ? Buffer.from(body.content.replace(/\s+/g, ""), "base64") : Buffer.from(body.content, "utf8");
  if (decoded.includes(0)) throw new GitHubReadError("GITHUB_FILE_BINARY", "decoded content contains a null byte — binary files are refused");
  const text = decoded.toString("utf8");
  assertNoSensitiveContent(text);
  return { operation: "get_file", repo, path: filePath, ref: args.ref ?? null, size, sha: body.sha ?? null, bytes: decoded.length, content: text, truncated: false, rateLimit };
}

async function opGetRateLimit(_args: GithubGetRateLimitArgs): Promise<Record<string, unknown>> {
  const { body, rateLimit } = await githubFetchJson("/rate_limit");
  if (!isRecord(body) || !isRecord(body.resources) || !isRecord(body.resources.core)) throw new GitHubReadError("GITHUB_OUTPUT_INVALID", "rate_limit payload missing core");
  const core = body.resources.core;
  return { operation: "get_rate_limit", core: { limit: core.limit ?? null, used: core.used ?? null, remaining: core.remaining ?? null, resetAt: typeof core.reset === "number" ? new Date(core.reset * 1000).toISOString() : null }, rateLimit };
}

const repoSchema = z.string().max(256).regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).optional();

export const githubReadInputSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("compare"), base: z.string().min(1).max(256).optional(), head: z.string().min(1).max(256).optional(), repo: repoSchema }).strict(),
  z.object({ operation: z.literal("get_commit"), ref: z.string().min(1).max(256), includePatch: z.boolean().optional(), repo: repoSchema }).strict(),
  z.object({ operation: z.literal("list_commits"), ref: z.string().min(1).max(256).optional(), since: z.string().max(64).optional(), sinceSha: z.string().min(1).max(256).optional(), maxCount: z.number().int().min(1).max(100).optional(), repo: repoSchema }).strict(),
  z.object({ operation: z.literal("get_branch_head"), branch: z.string().min(1).max(256).optional(), repo: repoSchema }).strict(),
  z.object({ operation: z.literal("get_repo"), repo: repoSchema }).strict(),
  z.object({ operation: z.literal("get_pr"), number: z.number().int().min(1).max(1_000_000), includeReviews: z.boolean().optional(), includeChecks: z.boolean().optional(), repo: repoSchema }).strict(),
  z.object({ operation: z.literal("list_action_runs"), branch: z.string().min(1).max(256).optional(), maxCount: z.number().int().min(1).max(30).optional(), repo: repoSchema }).strict(),
  z.object({ operation: z.literal("list_refs"), kind: z.enum(["tags", "releases"]), maxCount: z.number().int().min(1).max(50).optional(), repo: repoSchema }).strict(),
  z.object({ operation: z.literal("get_file"), path: z.string().min(1).max(512), ref: z.string().min(1).max(256).optional(), maxBytes: z.number().int().min(64).max(65_536).optional(), repo: repoSchema }).strict(),
  z.object({ operation: z.literal("get_rate_limit") }).strict()
]);

export type GithubReadArgs = z.infer<typeof githubReadInputSchema>;
type GithubCompareArgs = Extract<GithubReadArgs, { operation: "compare" }>;
type GithubGetCommitArgs = Extract<GithubReadArgs, { operation: "get_commit" }>;
type GithubListCommitsArgs = Extract<GithubReadArgs, { operation: "list_commits" }>;
type GithubGetBranchHeadArgs = Extract<GithubReadArgs, { operation: "get_branch_head" }>;
type GithubGetRepoArgs = Extract<GithubReadArgs, { operation: "get_repo" }>;
type GithubGetPrArgs = Extract<GithubReadArgs, { operation: "get_pr" }>;
type GithubListActionRunsArgs = Extract<GithubReadArgs, { operation: "list_action_runs" }>;
type GithubListRefsArgs = Extract<GithubReadArgs, { operation: "list_refs" }>;
type GithubGetFileArgs = Extract<GithubReadArgs, { operation: "get_file" }>;
type GithubGetRateLimitArgs = Extract<GithubReadArgs, { operation: "get_rate_limit" }>;

async function withCache(op: string, input: Record<string, unknown>, compute: () => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> {
  const ttl = CACHE_TTL_MS[op] ?? 0;
  if (ttl > 0) {
    const key = `${op}|${JSON.stringify(input)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return { ...hit.value, cached: true };
    const value = await compute();
    cache.set(key, { at: Date.now(), value });
    if (cache.size > CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return value;
  }
  return compute();
}

export async function runGithubRead(input: unknown): Promise<Record<string, unknown>> {
  const parsed = githubReadInputSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ").slice(0, 300);
    throw new GitHubReadError("GITHUB_VALIDATION_FAILED", detail);
  }
  const args = parsed.data;
  if (args.operation !== "get_rate_limit") assertLocalRateBudget();
  const result = await withCache(args.operation, args as Record<string, unknown>, async () => {
    switch (args.operation) {
      case "compare": return opCompare(args);
      case "get_commit": return opGetCommit(args);
      case "list_commits": return opListCommits(args);
      case "get_branch_head": return opGetBranchHead(args);
      case "get_repo": return opGetRepo(args);
      case "get_pr": return opGetPr(args);
      case "list_action_runs": return opListActionRuns(args);
      case "list_refs": return opListRefs(args);
      case "get_file": return opGetFile(args);
      case "get_rate_limit": return opGetRateLimit(args);
    }
  });
  return redactSensitive(result) as Record<string, unknown>;
}

// Test-only hook (used by the unit suite): clears the module-local rate-limit
// memory and TTL cache so tests are order-independent.
export function __resetGithubReadStateForTests(): void {
  lastKnownRemaining = null;
  lastKnownResetAt = null;
  cache.clear();
}
