/**
 * RepositoryAnalyzer.ts — Cognitive Development Loop
 * Beta-03.1 · 2026-07-13
 *
 * Analyzes a GitHub repository using the GitHub Production Connector.
 * Returns structured RepositoryAnalysis — no business logic.
 */

import { GitHubConnector } from "../connector-runtime/connectors/GitHubConnector";
import type { RepositoryAnalysis, CommitSummary, BranchSummary } from "./CDLTypes";
import { makeCDLId } from "./CDLTypes";

const CTX = { executionId: "cdl_repo_analysis", userId: "cdl", policyContext: {} };

export class RepositoryAnalyzer {
  private readonly connector: GitHubConnector;

  constructor() {
    this.connector = new GitHubConnector();
  }

  async analyze(owner: string, repo: string): Promise<RepositoryAnalysis> {
    const t0 = Date.now();
    await this.connector.initialize(CTX as any);
    const errors: string[] = [];

    // 1. Repo metadata
    let repoData: any = {};
    let defaultBranch = "main";
    let visibility = "unknown";
    let language: string | null = null;
    let lastActivityAt: string | null = null;
    try {
      const r = await this.connector.execute("repos.get", { owner, repo }, CTX as any);
      if (r.success) {
        repoData = r.data as any;
        defaultBranch = repoData.default_branch ?? "main";
        visibility    = repoData.visibility ?? "unknown";
        language      = repoData.language ?? null;
        lastActivityAt= repoData.pushed_at ?? null;
      } else { errors.push(`repos.get: ${r.error}`); }
    } catch (e) { errors.push(`repos.get exception: ${e instanceof Error ? e.message : String(e)}`); }

    // 2. Branches
    const branches: BranchSummary[] = [];
    try {
      const r = await this.connector.execute("branches.list", { owner, repo }, CTX as any);
      if (r.success && (r.data as any)?.items) {
        for (const b of (r.data as any).items) {
          branches.push({ name: b.name, isDefault: b.name === defaultBranch, protected: b.protected ?? false, sha: b.sha ?? null });
        }
      } else { errors.push(`branches.list: ${r.error ?? "no items"}`); }
    } catch (e) { errors.push(`branches.list exception: ${String(e)}`); }

    // 3. Commits
    const commits: CommitSummary[] = [];
    try {
      const r = await this.connector.execute("commits.list", { owner, repo, per_page: 10 }, CTX as any);
      if (r.success && (r.data as any)?.items) {
        for (const c of (r.data as any).items) {
          commits.push({ sha: c.sha, shortSha: c.shortSha, message: c.message, author: c.author, date: c.date });
        }
      } else { errors.push(`commits.list: ${r.error ?? "no items"}`); }
    } catch (e) { errors.push(`commits.list exception: ${String(e)}`); }

    // 4. Languages
    let langs: Array<{ lang: string; pct: number }> = [];
    let primaryLanguage: string | null = language;
    try {
      const r = await this.connector.execute("repos.languages", { owner, repo }, CTX as any);
      if (r.success && (r.data as any)?.languages) {
        langs = (r.data as any).languages;
        primaryLanguage = (r.data as any).primaryLanguage ?? language;
      }
    } catch { /* optional */ }

    // 5. File count
    let totalFiles = 0;
    try {
      const r = await this.connector.execute("files.list", { owner, repo, branch: defaultBranch }, CTX as any);
      if (r.success) totalFiles = (r.data as any)?.totalFiles ?? 0;
    } catch { /* optional */ }

    // 6. Health
    let repoHealth: unknown = null;
    try {
      const r = await this.connector.execute("repos.health", { owner, repo }, CTX as any);
      if (r.success) repoHealth = r.data;
    } catch { /* optional */ }

    const projectState = commits.length > 0 ? "active" : "idle";

    return {
      id:             makeCDLId("repo_analysis"),
      generatedAt:    Date.now(),
      durationMs:     Date.now() - t0,
      owner, repo,
      defaultBranch,
      visibility,
      language,
      branches,
      branchCount:    branches.length,
      recentCommits:  commits,
      commitCount:    commits.length,
      totalFiles,
      primaryLanguage,
      languages:      langs,
      repoHealth,
      projectState,
      lastActivityAt,
      errors,
    };
  }
}