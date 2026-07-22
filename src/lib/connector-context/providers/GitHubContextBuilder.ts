/**
 * GitHubContextBuilder.ts — EXPERIMENTAL (Sprint EF-GITHUB-CTX-01)
 *
 * GitHub implementation of IConnectorContextBuilder.
 *
 * REVERSIBILITY: To remove this experiment:
 *   1. Delete this file.
 *   2. Comment out the two lines added in ConnectorContextBootstrap.ts.
 *   No other file needs to be changed.
 *
 * Responsibilities:
 *   - Define GitHubConnectorContext (GitHub-specific type).
 *   - Implement build(request) to extract owner/repo context from any GitHub step output.
 *   - Export readGitHubContext() for consumers to read the github slot.
 *
 * Registration:
 *   - NOT self-registering. Registered explicitly in ConnectorContextBootstrap.
 *
 * Supported capabilities (output shapes handled):
 *   - repos.list   → output.items: [{ owner, name, default_branch, id }]
 *   - repos.get    → output.owner, output.name, output.default_branch, output.id
 *   - files.get    → output.owner, output.repo (injected by GitHubConnector as params echo)
 *   - Any capability that returns output.owner + output.repo (direct fields)
 *   - Any capability that returns output.repository.owner + output.repository.name
 *
 * SRP: sole responsibility is GitHub context building and reading.
 */

import type { BaseConnectorContext }       from "../ConnectorContextStore";
import type {
  IConnectorContextBuilder,
  ConnectorContextBuildRequest,
}                                          from "../ConnectorContextBuilderRegistry";

// ── GitHub-specific types ─────────────────────────────────────────────────────

export interface GitHubConnectorContext extends BaseConnectorContext {
  connectorId:       "github";
  /** Owner of the resolved repository (e.g. "myorg" or "username") */
  owner:             string;
  /** Repository slug (e.g. "memoryos-app") */
  repo:              string;
  /** Human-readable full name (e.g. "myorg/memoryos-app") */
  repositoryName:    string;
  /** Default branch when available (e.g. "main", "master") */
  defaultBranch:     string | null;
  /** Numeric repository ID from GitHub API when available */
  repositoryId:      number | null;
  /** Capability that produced this context */
  capability:        string;
  /** Execution ID for traceability */
  executionId?:      string;
  updatedAt:         number;
}

// ── Pure factory ──────────────────────────────────────────────────────────────

function _makeContext(
  owner:         string,
  repo:          string,
  defaultBranch: string | null,
  repositoryId:  number | null,
  capability:    string,
  meta:          ConnectorContextBuildRequest["executionMetadata"],
): GitHubConnectorContext {
  return Object.freeze<GitHubConnectorContext>({
    connectorId:    "github",
    owner,
    repo,
    repositoryName: `${owner}/${repo}`,
    defaultBranch,
    repositoryId,
    capability,
    executionId:    meta.executionId,
    updatedAt:      meta.timestamp ?? Date.now(),
  });
}

// ── Read API ──────────────────────────────────────────────────────────────────

/**
 * Safely narrow a BaseConnectorContext to GitHubConnectorContext.
 * Returns null when context is absent or belongs to a different connector.
 */
export function readGitHubContext(
  ctx: BaseConnectorContext | undefined | null,
): GitHubConnectorContext | null {
  if (!ctx || ctx.connectorId !== "github") return null;
  // [EXP-GITHUB-CTX] read
  console.log("[EXP-GITHUB-CTX][READ] ConversationStore.getConnectorContext('github')", {
    owner:          (ctx as GitHubConnectorContext).owner,
    repo:           (ctx as GitHubConnectorContext).repo,
    repositoryName: (ctx as GitHubConnectorContext).repositoryName,
    defaultBranch:  (ctx as GitHubConnectorContext).defaultBranch,
    updatedAt:      (ctx as GitHubConnectorContext).updatedAt,
  });
  return ctx as GitHubConnectorContext;
}

// ── Builder implementation ────────────────────────────────────────────────────

export const GitHubContextBuilder: IConnectorContextBuilder = {
  connectorId: "github",

  build(request: ConnectorContextBuildRequest): GitHubConnectorContext | null {
    const { capability, output, executionMetadata } = request;

    // [EXP-GITHUB-CTX] build called
    console.log("[EXP-GITHUB-CTX][BUILD] GitHubContextBuilder.build() called", {
      capability,
      outputKeys: Object.keys(output),
    });

    // ── Shape 1: repos.list — output.items is an array of repo objects ────────
    // GitHubConnector returns: { items: [{ owner, name, default_branch, id }] }
    const rawItems = output.items;
    if (Array.isArray(rawItems) && rawItems.length > 0) {
      const first = rawItems[0] as Record<string, unknown>;
      const owner = String(first.owner ?? "");
      const repo  = String(first.name  ?? "");
      if (owner && repo) {
        const ctx = _makeContext(
          owner,
          repo,
          typeof first.default_branch === "string" ? first.default_branch : null,
          typeof first.id === "number" ? first.id : null,
          capability,
          executionMetadata,
        );
        // [EXP-GITHUB-CTX] context produced from repos.list
        console.log("[EXP-GITHUB-CTX][BUILD] Context produced from repos.list →", {
          owner:          ctx.owner,
          repo:           ctx.repo,
          repositoryName: ctx.repositoryName,
          defaultBranch:  ctx.defaultBranch,
          itemCount:      rawItems.length,
        });
        return ctx;
      }
    }

    // ── Shape 2: direct owner + name fields (repos.get, repository.read) ─────
    // GitHubConnector may return: { owner, name, default_branch, id, ... }
    const directOwner = String(output.owner ?? "");
    const directName  = String(output.name  ?? output.repo ?? "");
    if (directOwner && directName) {
      const ctx = _makeContext(
        directOwner,
        directName,
        typeof output.default_branch === "string" ? output.default_branch : null,
        typeof output.id === "number" ? output.id : null,
        capability,
        executionMetadata,
      );
      // [EXP-GITHUB-CTX] context produced from direct fields
      console.log("[EXP-GITHUB-CTX][BUILD] Context produced from direct owner/name fields →", {
        owner:          ctx.owner,
        repo:           ctx.repo,
        repositoryName: ctx.repositoryName,
        capability,
      });
      return ctx;
    }

    // ── Shape 3: nested repository object (some capabilities echo params) ─────
    // output.repository: { owner, name } or output.repository: { owner, repo }
    const rawRepo = output.repository as Record<string, unknown> | undefined;
    if (rawRepo && typeof rawRepo === "object") {
      const nestedOwner = String(rawRepo.owner ?? "");
      const nestedName  = String(rawRepo.name  ?? rawRepo.repo ?? "");
      if (nestedOwner && nestedName) {
        const ctx = _makeContext(
          nestedOwner,
          nestedName,
          typeof rawRepo.default_branch === "string" ? rawRepo.default_branch : null,
          typeof rawRepo.id === "number" ? rawRepo.id : null,
          capability,
          executionMetadata,
        );
        // [EXP-GITHUB-CTX] context produced from nested repository object
        console.log("[EXP-GITHUB-CTX][BUILD] Context produced from nested repository →", {
          owner:          ctx.owner,
          repo:           ctx.repo,
          repositoryName: ctx.repositoryName,
          capability,
        });
        return ctx;
      }
    }

    // ── No extractable owner/repo — not actionable ────────────────────────────
    console.log("[EXP-GITHUB-CTX][BUILD] No owner/repo extractable from output", {
      capability,
      outputKeys: Object.keys(output),
    });
    return null;
  },
};