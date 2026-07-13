/**
 * GitHubBringUpEngine — Phase 5.3 Parts 2–4
 * Executes all 12 read-only operations with evidence collection.
 * Uses existing GitHubConnector exclusively — no new HTTP logic.
 */

import { GitHubConnector } from "../connector-runtime/connectors/GitHubConnector";
import { GitHubTokenManager } from "./GitHubTokenManager";
import type { BringUpReport, OperationResult, ValidationEvidence } from "./GitHubBringUpTypes";

function makeEid(): string {
  return `gh_bu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeEvidence(
  operation: string,
  repository: string | null,
  latencyMs: number,
  authState: ValidationEvidence["authState"],
  status: ValidationEvidence["status"],
  payload: Record<string, unknown> = {},
): ValidationEvidence {
  return {
    timestamp: new Date().toISOString(),
    executionId: makeEid(),
    operation,
    connector: "github",
    repository,
    latencyMs,
    authState,
    status,
    payload,
  };
}

export class GitHubBringUpEngine {
  private readonly tokenMgr = new GitHubTokenManager();
  private _repo: { owner: string; repo: string } | null = null;

  setRepository(owner: string, repo: string): void {
    this._repo = { owner, repo };
  }

  async run(targetOwner?: string, targetRepo?: string): Promise<BringUpReport> {
    const t0 = Date.now();
    const id = `bringup_${Date.now()}`;
    const resolution = this.tokenMgr.resolve();
    const operations: OperationResult[] = [];

    if (!resolution.token) {
      const evidence = makeEvidence("auth.check", null, 0, "NOT_CONFIGURED", "SKIPPED");
      const skip = (op: string): OperationResult => ({
        operation: op, status: "SKIPPED",
        detail: "Skipped — __GITHUB_TOKEN__ not configured",
        latencyMs: 0, error: "Token not configured",
        evidence: makeEvidence(op, null, 0, "NOT_CONFIGURED", "SKIPPED"),
      });
      const ops = [
        "current_user", "permissions", "rate_limits", "repository_list",
        "repository_metadata", "default_branch", "branches",
        "commits", "repository_languages", "repository_health",
        "repository_statistics", "file_listing",
      ];
      return {
        id, generatedAt: Date.now(), durationMs: Date.now() - t0,
        authState: "NOT_CONFIGURED", login: null, repository: null,
        operations: [{ operation: "auth.check", status: "SKIPPED", detail: "Token not configured", latencyMs: 0, evidence }, ...ops.map(skip)],
        passed: 0, failed: 0, skipped: ops.length + 1,
        overallStatus: "NOT_CONFIGURED", certificationReady: false,
        summary: "NOT_CONFIGURED — Set __GITHUB_TOKEN__ to proceed",
      };
    }

    const conn = new GitHubConnector();
    const ctx = { executionId: makeEid(), initiatedBy: "GitHubBringUpEngine", timestamp: Date.now() };

    // ── 1. Current User ─────────────────────────────────────────────────────────
    let login: string | null = null;
    {
      const t1 = Date.now();
      const res = await conn.execute("auth.user", {}, ctx);
      const lat = Date.now() - t1;
      login = res.success ? (res.data as any)?.login ?? null : null;
      operations.push({
        operation: "current_user", status: res.success ? "SUCCESS" : "FAILED",
        detail: res.success ? `Authenticated as: ${login}` : `Failed: ${res.error}`,
        latencyMs: lat, data: res.success ? res.data : undefined, error: res.success ? undefined : res.error,
        evidence: makeEvidence("auth.user", null, lat, res.success ? "AUTHENTICATED" : "FAILED", res.success ? "SUCCESS" : "FAILED", { login }),
      });
    }

    if (!login) {
      const authState = "FAILED";
      const skip = (op: string): OperationResult => ({
        operation: op, status: "SKIPPED", detail: "Skipped — auth.user failed",
        latencyMs: 0, error: "Authentication failed",
        evidence: makeEvidence(op, null, 0, authState, "SKIPPED"),
      });
      const ops = ["permissions", "rate_limits", "repository_list", "repository_metadata", "default_branch", "branches", "commits", "repository_languages", "repository_health", "repository_statistics", "file_listing"];
      return {
        id, generatedAt: Date.now(), durationMs: Date.now() - t0,
        authState: "FAILED", login: null, repository: null,
        operations: [...operations, ...ops.map(skip)],
        passed: operations.filter(o => o.status === "SUCCESS").length,
        failed: operations.filter(o => o.status === "FAILED").length,
        skipped: ops.length,
        overallStatus: "FAILED", certificationReady: false,
        summary: "FAILED — Authentication rejected by GitHub API",
      };
    }

    // ── 2. Permissions ──────────────────────────────────────────────────────────
    {
      const t1 = Date.now();
      const res = await conn.execute("auth.permissions", {}, ctx);
      const lat = Date.now() - t1;
      operations.push({
        operation: "permissions", status: res.success ? "SUCCESS" : "FAILED",
        detail: res.success ? `Scopes: ${(res.data as any)?.scopeHeader ?? "fine-grained"}` : `Failed: ${res.error}`,
        latencyMs: lat, data: res.success ? res.data : undefined, error: res.success ? undefined : res.error,
        evidence: makeEvidence("auth.permissions", null, lat, "AUTHENTICATED", res.success ? "SUCCESS" : "FAILED"),
      });
    }

    // ── 3. Rate Limits ──────────────────────────────────────────────────────────
    {
      const t1 = Date.now();
      const res = await conn.execute("connectivity.ping", {}, ctx);
      const lat = Date.now() - t1;
      const rl = (res.data as any)?.rateLimit;
      operations.push({
        operation: "rate_limits", status: res.success ? "SUCCESS" : "FAILED",
        detail: res.success ? `Remaining: ${rl?.remaining ?? "N/A"}/${rl?.limit ?? "N/A"}` : `Failed: ${res.error}`,
        latencyMs: lat, data: res.success ? res.data : undefined,
        evidence: makeEvidence("connectivity.ping", null, lat, "AUTHENTICATED", res.success ? "SUCCESS" : "FAILED", { rateLimit: rl }),
      });
    }

    // ── 4. Repository List ──────────────────────────────────────────────────────
    let firstRepo: { owner: string; repo: string } | null = null;
    {
      const t1 = Date.now();
      const res = await conn.execute("repos.list", { per_page: 5 }, ctx);
      const lat = Date.now() - t1;
      if (res.success) {
        const items = (res.data as any)?.items ?? [];
        if (items.length > 0 && !targetRepo) {
          firstRepo = { owner: items[0].owner ?? login, repo: items[0].name };
        }
        operations.push({
          operation: "repository_list", status: "SUCCESS",
          detail: `Found ${(res.data as any)?.count ?? 0} repositories`,
          latencyMs: lat, data: res.data,
          evidence: makeEvidence("repos.list", null, lat, "AUTHENTICATED", "SUCCESS", { count: (res.data as any)?.count }),
        });
      } else {
        operations.push({
          operation: "repository_list", status: "FAILED",
          detail: `Failed: ${res.error}`, latencyMs: lat, error: res.error,
          evidence: makeEvidence("repos.list", null, lat, "AUTHENTICATED", "FAILED"),
        });
      }
    }

    // Determine target repo
    const owner = targetOwner ?? firstRepo?.owner ?? login;
    const repoName = targetRepo ?? firstRepo?.repo;

    if (!repoName) {
      const skip = (op: string): OperationResult => ({
        operation: op, status: "SKIPPED", detail: "Skipped — no repository available",
        latencyMs: 0, evidence: makeEvidence(op, null, 0, "AUTHENTICATED", "SKIPPED"),
      });
      const remaining = ["repository_metadata", "default_branch", "branches", "commits", "repository_languages", "repository_health", "repository_statistics", "file_listing"];
      return this._finalize(id, t0, "AUTHENTICATED", login, null, [...operations, ...remaining.map(skip)]);
    }

    const repoFull = `${owner}/${repoName}`;

    // ── 5. Repository Metadata ──────────────────────────────────────────────────
    {
      const t1 = Date.now();
      const res = await conn.execute("repos.get", { owner, repo: repoName }, ctx);
      const lat = Date.now() - t1;
      operations.push({
        operation: "repository_metadata", status: res.success ? "SUCCESS" : "FAILED",
        detail: res.success ? `${repoFull} — lang=${(res.data as any)?.language ?? "N/A"} stars=${(res.data as any)?.stargazers_count ?? 0}` : `Failed: ${res.error}`,
        latencyMs: lat, data: res.success ? res.data : undefined,
        evidence: makeEvidence("repos.get", repoFull, lat, "AUTHENTICATED", res.success ? "SUCCESS" : "FAILED"),
      });
    }

    // ── 6. Default Branch ───────────────────────────────────────────────────────
    let defaultBranch = "main";
    {
      const t1 = Date.now();
      const res = await conn.execute("branches.default", { owner, repo: repoName }, ctx);
      const lat = Date.now() - t1;
      if (res.success) defaultBranch = (res.data as any)?.defaultBranch ?? "main";
      operations.push({
        operation: "default_branch", status: res.success ? "SUCCESS" : "FAILED",
        detail: res.success ? `Default branch: ${defaultBranch}` : `Failed: ${res.error}`,
        latencyMs: lat, data: res.success ? res.data : undefined,
        evidence: makeEvidence("branches.default", repoFull, lat, "AUTHENTICATED", res.success ? "SUCCESS" : "FAILED"),
      });
    }

    // ── 7. Branches ─────────────────────────────────────────────────────────────
    {
      const t1 = Date.now();
      const res = await conn.execute("branches.list", { owner, repo: repoName }, ctx);
      const lat = Date.now() - t1;
      operations.push({
        operation: "branches", status: res.success ? "SUCCESS" : "FAILED",
        detail: res.success ? `${(res.data as any)?.count ?? 0} branches found` : `Failed: ${res.error}`,
        latencyMs: lat, data: res.success ? res.data : undefined,
        evidence: makeEvidence("branches.list", repoFull, lat, "AUTHENTICATED", res.success ? "SUCCESS" : "FAILED"),
      });
    }

    // ── 8. Commits ──────────────────────────────────────────────────────────────
    {
      const t1 = Date.now();
      const res = await conn.execute("commits.list", { owner, repo: repoName, per_page: 5 }, ctx);
      const lat = Date.now() - t1;
      operations.push({
        operation: "commits", status: res.success ? "SUCCESS" : "FAILED",
        detail: res.success ? `${(res.data as any)?.count ?? 0} recent commits` : `Failed: ${res.error}`,
        latencyMs: lat, data: res.success ? res.data : undefined,
        evidence: makeEvidence("commits.list", repoFull, lat, "AUTHENTICATED", res.success ? "SUCCESS" : "FAILED"),
      });
    }

    // ── 9. Repository Languages ─────────────────────────────────────────────────
    {
      const t1 = Date.now();
      const res = await conn.execute("repos.languages", { owner, repo: repoName }, ctx);
      const lat = Date.now() - t1;
      operations.push({
        operation: "repository_languages", status: res.success ? "SUCCESS" : "FAILED",
        detail: res.success ? `Primary: ${(res.data as any)?.primaryLanguage ?? "N/A"} — ${(res.data as any)?.languages?.length ?? 0} language(s)` : `Failed: ${res.error}`,
        latencyMs: lat, data: res.success ? res.data : undefined,
        evidence: makeEvidence("repos.languages", repoFull, lat, "AUTHENTICATED", res.success ? "SUCCESS" : "FAILED"),
      });
    }

    // ── 10. Repository Health ───────────────────────────────────────────────────
    {
      const t1 = Date.now();
      const res = await conn.execute("repos.health", { owner, repo: repoName }, ctx);
      const lat = Date.now() - t1;
      operations.push({
        operation: "repository_health", status: res.success ? "SUCCESS" : "FAILED",
        detail: res.success ? `Health: ${(res.data as any)?.health_percentage ?? "N/A"}%` : `Failed: ${res.error}`,
        latencyMs: lat, data: res.success ? res.data : undefined,
        evidence: makeEvidence("repos.health", repoFull, lat, "AUTHENTICATED", res.success ? "SUCCESS" : "FAILED"),
      });
    }

    // ── 11. Repository Statistics ───────────────────────────────────────────────
    {
      const t1 = Date.now();
      const res = await conn.execute("repos.stats", { owner, repo: repoName }, ctx);
      const lat = Date.now() - t1;
      operations.push({
        operation: "repository_statistics", status: res.success ? "SUCCESS" : "FAILED",
        detail: res.success ? `Commits: ${(res.data as any)?.totalCommits ?? 0} · Contributors: ${(res.data as any)?.contributorCount ?? 0}` : `Failed: ${res.error}`,
        latencyMs: lat, data: res.success ? res.data : undefined,
        evidence: makeEvidence("repos.stats", repoFull, lat, "AUTHENTICATED", res.success ? "SUCCESS" : "FAILED"),
      });
    }

    // ── 12. File Listing ────────────────────────────────────────────────────────
    {
      const t1 = Date.now();
      const res = await conn.execute("files.list", { owner, repo: repoName, branch: defaultBranch }, ctx);
      const lat = Date.now() - t1;
      operations.push({
        operation: "file_listing", status: res.success ? "SUCCESS" : "FAILED",
        detail: res.success ? `${(res.data as any)?.totalFiles ?? 0} files in tree` : `Failed: ${res.error}`,
        latencyMs: lat, data: res.success ? res.data : undefined,
        evidence: makeEvidence("files.list", repoFull, lat, "AUTHENTICATED", res.success ? "SUCCESS" : "FAILED"),
      });
    }

    return this._finalize(id, t0, "AUTHENTICATED", login, repoFull, operations);
  }

  private _finalize(
    id: string, t0: number,
    authState: BringUpReport["authState"],
    login: string | null,
    repository: string | null,
    operations: OperationResult[],
  ): BringUpReport {
    const passed  = operations.filter(o => o.status === "SUCCESS").length;
    const failed  = operations.filter(o => o.status === "FAILED").length;
    const skipped = operations.filter(o => o.status === "SKIPPED").length;
    const total   = operations.filter(o => o.status !== "SKIPPED").length;
    const certificationReady = passed >= 8 && failed === 0 && authState === "AUTHENTICATED";
    const overallStatus: BringUpReport["overallStatus"] =
      authState === "NOT_CONFIGURED" ? "NOT_CONFIGURED"
      : authState === "FAILED"       ? "FAILED"
      : certificationReady           ? "OPERATIONAL"
      : failed > 0                   ? "PARTIAL"
      : "OPERATIONAL";

    return {
      id, generatedAt: Date.now(), durationMs: Date.now() - t0,
      authState, login, repository, operations,
      passed, failed, skipped, overallStatus, certificationReady,
      summary: `GitHub Bring-Up: ${passed}/${total} passed · ${authState} · ${overallStatus}`,
    };
  }
}