/**
 * GitHubConnectorService.ts — Thin Service Layer over GitHubConnector
 * EF-36B.1 · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * ARCHITECTURE RULE:
 *   This is the ONLY gateway between the GitHub Knowledge Provider and GitHub API.
 *   The Provider calls this service. This service calls GitHubConnector.execute().
 *   GitHubConnector calls githubFetch(). Zero other paths exist.
 *
 * The Provider MUST NOT:
 *   - Call fetch() directly
 *   - Read or store tokens
 *   - Interpret HTTP status codes
 *   - Implement retry or rate limit logic
 */

import { GitHubConnector } from "../../connector-runtime/connectors/GitHubConnector";
import { makeExecutionId } from "../../connector-runtime/ConnectorTypes";
import type { ConnectorContext } from "../../connector-runtime/ConnectorTypes";
import type { GitHubRepoMeta, GitHubCommitMeta, GitHubFileMeta } from "./GitHubKnowledgeTypes";

// ── Service Result — structured, no HTTP codes ─────────────────────────────────

export interface ServiceResult<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
  notConfigured: boolean;
}

function success<T>(data: T): ServiceResult<T> {
  return { ok: true, data, error: null, notConfigured: false };
}

function failure<T>(error: string): ServiceResult<T> {
  return { ok: false, data: null, error, notConfigured: false };
}

function notConfigured<T>(): ServiceResult<T> {
  return { ok: false, data: null, error: "GitHub token not configured", notConfigured: true };
}

// ── Service ────────────────────────────────────────────────────────────────────

export class GitHubConnectorService {
  private readonly connector: GitHubConnector;

  constructor(connector?: GitHubConnector) {
    // Accepts an injected connector (for testing) or creates a default instance
    this.connector = connector ?? new GitHubConnector();
  }

  private makeCtx(extra?: Partial<ConnectorContext>): ConnectorContext {
    return {
      executionId: makeExecutionId(),
      userId: "kre-github-provider",
      projectId: "knowledge-reconstruction",
      sessionId: "kre-session",
      ...extra,
    };
  }

  // ── Availability check ─────────────────────────────────────────────────────

  async checkAvailability(): Promise<{ available: boolean; login: string | null; notConfigured: boolean }> {
    const result = await this.connector.execute("auth.validate", {}, this.makeCtx());
    if (result.status === "NOT_CONFIGURED") return { available: false, login: null, notConfigured: true };
    if (result.status === "SUCCESS") return { available: true, login: (result.data as any)?.login ?? null, notConfigured: false };
    return { available: false, login: null, notConfigured: false };
  }

  // ── Repository listing ─────────────────────────────────────────────────────

  async listRepositories(perPage = 10): Promise<ServiceResult<GitHubRepoMeta[]>> {
    const result = await this.connector.execute("repos.list", { per_page: perPage, sort: "updated" }, this.makeCtx());
    if (result.status === "NOT_CONFIGURED") return notConfigured();
    if (result.status !== "SUCCESS") return failure(result.error ?? "repos.list failed");

    const raw = (result.data as any)?.items ?? [];
    const repos: GitHubRepoMeta[] = raw.map((r: any) => ({
      id: String(r.id ?? ""),
      name: r.name ?? "",
      fullName: r.full_name ?? "",
      owner: (r.full_name ?? "").split("/")[0] ?? "",
      defaultBranch: r.default_branch ?? "main",
      branches: [], // populated by getBranches()
      language: r.language ?? "Unknown",
      languages: r.language ? [r.language] : [],
      isPrivate: !!r.private,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
      description: r.description ?? "",
      stars: r.stargazers_count ?? 0,
      forks: r.forks_count ?? 0,
      openIssues: r.open_issues_count ?? 0,
    }));

    return success(repos);
  }

  // ── Single repository ──────────────────────────────────────────────────────

  async getRepository(owner: string, repo: string): Promise<ServiceResult<GitHubRepoMeta>> {
    const result = await this.connector.execute("repos.get", { owner, repo }, this.makeCtx());
    if (result.status === "NOT_CONFIGURED") return notConfigured();
    if (result.status !== "SUCCESS") return failure(result.error ?? "repos.get failed");

    const r = result.data as any;
    return success({
      id: String(r.id ?? ""),
      name: r.name ?? "",
      fullName: r.full_name ?? "",
      owner: (r.full_name ?? "").split("/")[0] ?? owner,
      defaultBranch: r.default_branch ?? "main",
      branches: [],
      language: r.language ?? "Unknown",
      languages: r.language ? [r.language] : [],
      isPrivate: !!r.private,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
      description: r.description ?? "",
      stars: r.stargazers_count ?? 0,
      forks: r.forks_count ?? 0,
      openIssues: r.open_issues_count ?? 0,
    });
  }

  // ── Branches ───────────────────────────────────────────────────────────────

  async getBranches(owner: string, repo: string): Promise<ServiceResult<string[]>> {
    const result = await this.connector.execute("repos.branches", { owner, repo }, this.makeCtx());
    if (result.status === "NOT_CONFIGURED") return notConfigured();
    if (result.status !== "SUCCESS") return failure(result.error ?? "repos.branches failed");

    const items = (result.data as any)?.items ?? [];
    return success(items.map((b: any) => b.name as string));
  }

  // ── Commits ────────────────────────────────────────────────────────────────
  // NOTE: GitHubConnector does not currently expose commits/files operations.
  // These are extended operations the Provider needs beyond what the Connector
  // declared in EF-33/EF-35. We call the connector's execute() with the new
  // operations — if the connector does not support them, it returns FAILED with
  // "Unknown operation". The service translates that to a graceful fallback.
  // This keeps the Provider 100% network-free while signaling missing capabilities.

  async getCommits(owner: string, repo: string, branch: string, perPage: number): Promise<ServiceResult<GitHubCommitMeta[]>> {
    const result = await this.connector.execute(
      "repos.commits",
      { owner, repo, branch, per_page: perPage },
      this.makeCtx(),
    );
    if (result.status === "NOT_CONFIGURED") return notConfigured();
    if (result.status !== "SUCCESS") {
      // Connector does not support repos.commits yet — signal gracefully
      return failure(result.error ?? "repos.commits not supported by connector");
    }

    const items = (result.data as any)?.items ?? [];
    return success(items.map((c: any): GitHubCommitMeta => ({
      sha: c.sha ?? "",
      message: (c.message ?? "").slice(0, 200),
      authorName: c.author_name ?? c.author ?? "Unknown",
      authorEmail: c.author_email ?? "",
      timestamp: c.timestamp ? new Date(c.timestamp).getTime() : Date.now(),
      branch,
      parentShas: c.parent_shas ?? [],
      url: c.url ?? "",
    })));
  }

  // ── File Tree ──────────────────────────────────────────────────────────────

  async getFileTree(owner: string, repo: string, branch: string): Promise<ServiceResult<GitHubFileMeta[]>> {
    const result = await this.connector.execute(
      "repos.tree",
      { owner, repo, branch, recursive: true },
      this.makeCtx(),
    );
    if (result.status === "NOT_CONFIGURED") return notConfigured();
    if (result.status !== "SUCCESS") {
      return failure(result.error ?? "repos.tree not supported by connector");
    }

    const items = (result.data as any)?.items ?? [];
    return success(items.map((f: any): GitHubFileMeta => ({
      path: f.path ?? "",
      sha: f.sha ?? "",
      sizeBytes: f.size ?? 0,
      url: f.url ?? "",
    })));
  }
}