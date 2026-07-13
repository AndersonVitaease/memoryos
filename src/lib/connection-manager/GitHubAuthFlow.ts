/**
 * GitHubAuthFlow.ts — Phase 5.7.0 · EF-57.2
 * GitHub authentication + resource discovery
 * Uses the real GitHub REST API via the ConnectorInvocationService.
 */

import { ConnectorInvocationService } from "../cognitive-connector/ConnectorInvocationService";
import type { AuthToken, AuthResult, DiscoveredData, DiscoveredResource, ConnectorId } from "./ConnectionManagerTypes";
import { makeCMId } from "./ConnectionManagerTypes";

const CONNECTOR_ID: ConnectorId = "github";

export class GitHubAuthFlow {
  private readonly cis = new ConnectorInvocationService();

  // ── Authenticate ──────────────────────────────────────────────────────────

  async authenticate(): Promise<AuthResult> {
    const t0 = Date.now();
    try {
      // Validate the token by pinging the GitHub connector
      const ping = await this.cis.invoke(
        CONNECTOR_ID, "connectivity.ping", {},
        { originComponent: "GitHubAuthFlow", reason: "EF-57.2: token validation" }
      );

      if (ping.record.status === "NOT_CONFIGURED") {
        return {
          success:       false,
          connectorId:   CONNECTOR_ID,
          state:         "AUTH_REQUIRED",
          token:         null,
          error:         "GitHub token not configured — inject VITE_GITHUB_TOKEN",
          durationMs:    Date.now() - t0,
          discoveredData: null,
        };
      }

      if (ping.record.status !== "SUCCESS") {
        return {
          success:     false,
          connectorId: CONNECTOR_ID,
          state:       "ERROR",
          token:       null,
          error:       `GitHub ping failed: ${ping.record.status}`,
          durationMs:  Date.now() - t0,
          discoveredData: null,
        };
      }

      const token: AuthToken = {
        connectorId: CONNECTOR_ID,
        token:       "***github-pat***",   // redacted — stored in CIS layer
        tokenType:   "pat",
        expiresAt:   null,
        scopes:      ["repo", "read:org", "read:user"],
        acquiredAt:  Date.now(),
        issuedBy:    "github.com",
      };

      const discoveredData = await this.discover();

      return {
        success:       true,
        connectorId:   CONNECTOR_ID,
        state:         "CONNECTED",
        token,
        error:         null,
        durationMs:    Date.now() - t0,
        discoveredData,
      };
    } catch (e) {
      return {
        success:       false,
        connectorId:   CONNECTOR_ID,
        state:         "ERROR",
        token:         null,
        error:         String(e),
        durationMs:    Date.now() - t0,
        discoveredData: null,
      };
    }
  }

  // ── Token Validation ──────────────────────────────────────────────────────

  async validateToken(): Promise<{ valid: boolean; error: string | null }> {
    try {
      const ping = await this.cis.invoke(
        CONNECTOR_ID, "connectivity.ping", {},
        { originComponent: "GitHubAuthFlow", reason: "EF-57.2: token re-validation" }
      );
      return { valid: ping.record.status === "SUCCESS", error: null };
    } catch (e) {
      return { valid: false, error: String(e) };
    }
  }

  // ── Discover Resources ────────────────────────────────────────────────────

  async discover(): Promise<DiscoveredData> {
    const resources: DiscoveredResource[] = [];
    try {
      // Repositories
      const repoInv = await this.cis.githubListRepos({
        originComponent: "GitHubAuthFlow",
        reason: "EF-57.2: resource discovery — repositories",
      });
      const repos = (repoInv.result?.data as any)?.items ?? [];
      resources.push({ type: "repositories", count: repos.length, items: repos.slice(0, 5).map((r: any) => r.name ?? r) });

      // Branches (first repo)
      if (repos.length > 0) {
        const firstRepo = repos[0];
        const owner = firstRepo?.owner ?? "unknown";
        const name  = firstRepo?.name  ?? firstRepo;
        const branchInv = await this.cis.githubListBranches(owner, name, {
          originComponent: "GitHubAuthFlow",
          reason: "EF-57.2: discovery — branches",
        });
        const branches = (branchInv.result?.data as any)?.items ?? [];
        resources.push({ type: "branches", count: (branchInv.result?.data as any)?.count ?? branches.length, items: branches.slice(0, 5).map((b: any) => b.name ?? b) });

        // Commits
        const commitInv = await this.cis.githubListCommits(owner, name, {
          originComponent: "GitHubAuthFlow",
          reason: "EF-57.2: discovery — commits",
        });
        const commits = (commitInv.result?.data as any)?.items ?? [];
        resources.push({ type: "commits", count: (commitInv.result?.data as any)?.count ?? commits.length, items: commits.slice(0, 3).map((c: any) => c.message ?? c.sha ?? String(c)) });
      }
    } catch (_) {
      // partial discovery — report what we have
    }

    return {
      connectorId:  CONNECTOR_ID,
      discoveredAt: Date.now(),
      resources,
      summary:      `${resources.map(r => `${r.count} ${r.type}`).join(", ")}`,
    };
  }
}