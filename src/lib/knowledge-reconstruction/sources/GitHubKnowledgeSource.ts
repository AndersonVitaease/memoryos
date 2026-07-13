/**
 * GitHubKnowledgeSource.ts — GitHub Knowledge Provider
 * EF-36B.1 · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * ARCHITECTURE COMPLIANCE — EF-36B.1:
 *   Zero direct GitHub networking.
 *   Zero token reading/storing.
 *   Zero HTTP clients.
 *   Zero fetch() calls.
 *   Zero status code interpretation.
 *
 * Communication path (single, official):
 *   GitHubKnowledgeSource
 *     → GitHubConnectorService
 *       → GitHubConnector.execute()
 *         → githubFetch()
 *           → GitHub API
 */

import type { IKnowledgeSource } from "../IKnowledgeSource";
import type {
  KnowledgeSourceMetadata,
  KnowledgeSourceHealth,
  KnowledgeScanResult,
  KnowledgeLoadResult,
  KnowledgeItem,
  KnowledgeArtifact,
  KnowledgeRelationship,
  KnowledgeTimelineEvent,
  KnowledgeProvenance,
} from "../KRETypes";
import { makeKREId } from "../KRETypes";
import type { GitHubSyncState, GitHubRepoMeta, GitHubCommitMeta, GitHubFileMeta } from "./GitHubKnowledgeTypes";
import { GitHubConnectorService } from "./GitHubConnectorService";

// ── File classification helpers (pure, no networking) ─────────────────────────

const IGNORED_PATHS = [
  "node_modules/", "build/", "dist/", "vendor/", ".cache/",
  ".next/", "coverage/", "__pycache__/", ".git/", "tmp/", "temp/",
];

const SUPPORTED_EXTENSIONS = [
  ".md", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml",
  ".txt", ".py", ".go", ".rs", ".sh", ".env.example",
];

function shouldIgnore(path: string): boolean {
  return IGNORED_PATHS.some(p => path.startsWith(p) || path.includes("/" + p));
}

function isSupported(path: string): boolean {
  return SUPPORTED_EXTENSIONS.some(ext => path.endsWith(ext));
}

function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
    py: "Python", go: "Go", rs: "Rust", sh: "Shell",
    md: "Markdown", json: "JSON", yaml: "YAML", yml: "YAML",
    txt: "Text", env: "Config",
  };
  return map[ext] ?? "Unknown";
}

function detectFileType(path: string): KnowledgeItem["type"] {
  if (path.endsWith(".md")) return "document";
  if (path.includes("adr") || path.includes("ADR")) return "adr";
  if (path.includes("rfc") || path.includes("RFC")) return "rfc";
  if (path.includes("decision") || path.includes("Decision")) return "decision";
  return "artifact";
}

function makeGitHubProvenance(
  sourceId: string,
  repo: string,
  branch: string,
  commitSha: string,
  originalId: string,
  confidence: number,
): KnowledgeProvenance {
  return {
    sourceId,
    sourceName: `GitHub: ${repo}`,
    sourceType: "github",
    provider: "GitHub",
    originalIdentifier: originalId,
    importedAt: Date.now(),
    lastUpdatedAt: Date.now(),
    confidence,
    verificationStatus: "VERIFIED",
  };
}

// ── Main Source ────────────────────────────────────────────────────────────────

export class GitHubKnowledgeSource implements IKnowledgeSource {
  readonly id: string;
  readonly name: string;

  // ── ARCHITECTURE: The service is the ONLY communication channel ──────────────
  private readonly service: GitHubConnectorService;
  private syncState: GitHubSyncState;
  private _lastScanResult: KnowledgeScanResult | null = null;

  constructor(config: {
    sourceId?: string;
    /** If provided, only scan this specific repo (owner/repo format) */
    targetRepo?: string;
    /** Max commits to import per repo */
    maxCommitsPerRepo?: number;
    /** Max files to import per repo */
    maxFilesPerRepo?: number;
    /** Injected service (for testing) — if omitted, default GitHubConnectorService is used */
    service?: GitHubConnectorService;
  } = {}) {
    this.id = config.sourceId ?? "github-knowledge";
    this.name = "GitHub Knowledge Provider";
    // All networking goes through the service — Provider owns zero credentials
    this.service = config.service ?? new GitHubConnectorService();
    this.syncState = {
      lastSyncAt: null,
      knownCommitShas: new Set(),
      knownFilePaths: new Set(),
      knownBranches: new Set(),
      targetRepo: config.targetRepo ?? null,
      maxCommitsPerRepo: config.maxCommitsPerRepo ?? 20,
      maxFilesPerRepo: config.maxFilesPerRepo ?? 50,
      repositories: [],
    };
  }

  // ── IKnowledgeSource ────────────────────────────────────────────────────────

  metadata(): KnowledgeSourceMetadata {
    return {
      id: this.id,
      name: this.name,
      provider: "GitHub",
      type: "github",
      version: "1.1.0",
      description: "GitHub Knowledge Provider — EF-36B.1 decoupled, all comms via GitHubConnectorService",
    };
  }

  async isAvailable(): Promise<KnowledgeSourceHealth> {
    // Delegates to service — no token access here
    const { available, notConfigured } = await this.service.checkAvailability();
    if (notConfigured) return "unavailable";
    if (available) return "available";
    return "degraded";
  }

  async health(): Promise<{ status: KnowledgeSourceHealth; details: string; checkedAt: number }> {
    const { available, login, notConfigured } = await this.service.checkAvailability();
    if (notConfigured) {
      return { status: "unavailable", details: "GitHub token not configured — set via GitHubConnector", checkedAt: Date.now() };
    }
    if (available) {
      const repoCount = this.syncState.repositories.length;
      const commitCount = this.syncState.knownCommitShas.size;
      return {
        status: "available",
        details: `Authenticated as: ${login ?? "unknown"} · ${repoCount} repos · ${commitCount} known commits`,
        checkedAt: Date.now(),
      };
    }
    return { status: "degraded", details: "GitHub connector returned unavailable", checkedAt: Date.now() };
  }

  async scan(): Promise<KnowledgeScanResult> {
    const t = Date.now();
    const errors: string[] = [];
    const itemIds: string[] = [];

    const repos = await this._discoverRepositories();
    if (repos === null) {
      this._lastScanResult = {
        sourceId: this.id, scannedAt: Date.now(), itemsFound: 0, itemIds: [],
        errors: ["GitHub token not configured — cannot scan repositories"], durationMs: Date.now() - t,
      };
      return this._lastScanResult;
    }

    this.syncState.repositories = repos;

    for (const repo of repos) {
      itemIds.push(`github:repo:${repo.fullName}`);
      for (const branch of repo.branches) {
        itemIds.push(`github:branch:${repo.fullName}:${branch}`);
        this.syncState.knownBranches.add(`${repo.fullName}:${branch}`);
      }
    }

    this._lastScanResult = {
      sourceId: this.id,
      scannedAt: Date.now(),
      itemsFound: itemIds.length,
      itemIds,
      errors,
      durationMs: Date.now() - t,
    };
    return this._lastScanResult;
  }

  async load(): Promise<KnowledgeLoadResult> {
    const t = Date.now();
    const items: KnowledgeItem[] = [];
    const relationships: KnowledgeRelationship[] = [];
    const timelineEvents: KnowledgeTimelineEvent[] = [];
    const errors: string[] = [];

    // Check availability through service — no token reading
    const { available, notConfigured } = await this.service.checkAvailability();
    if (notConfigured) {
      return { sourceId: this.id, loadedAt: Date.now(), items: [], relationships: [], timelineEvents: [], errors: ["GitHub token not configured"], durationMs: Date.now() - t };
    }
    if (!available) {
      return { sourceId: this.id, loadedAt: Date.now(), items: [], relationships: [], timelineEvents: [], errors: ["GitHub connector unavailable"], durationMs: Date.now() - t };
    }

    if (this.syncState.repositories.length === 0) {
      await this.scan();
    }

    for (const repo of this.syncState.repositories) {
      try {
        const repoItem = this._buildRepoItem(repo);
        items.push(repoItem);

        // Commits → artifacts + timeline events
        const commits = await this._loadCommits(repo);
        for (const commit of commits) {
          const artifact = this._buildCommitArtifact(repo, commit);
          items.push(artifact);
          timelineEvents.push(this._buildCommitEvent(repo, commit, artifact.id));
          relationships.push(this._buildRel(repoItem.id, artifact.id, "contains_commit", 1.0, repo, commit.sha));
        }

        // Files → documents/artifacts
        const files = await this._loadFiles(repo);
        for (const file of files) {
          const doc = this._buildFileItem(repo, file, repo.defaultBranch, commits[0]?.sha ?? "unknown");
          items.push(doc);
          relationships.push(this._buildRel(repoItem.id, doc.id, "contains_file", 0.9, repo, file.path));
          if (commits.length > 0) {
            relationships.push(this._buildRel(
              `github:commit:${repo.fullName}:${commits[0].sha}`,
              doc.id, "modifies", 0.8, repo, file.path,
            ));
          }
        }

        // Branch items
        for (const branch of repo.branches) {
          const branchItem = this._buildBranchItem(repo, branch);
          items.push(branchItem);
          relationships.push(this._buildRel(repoItem.id, branchItem.id, "has_branch", 0.95, repo, branch));
        }

      } catch (e) {
        errors.push(`Failed loading repo "${repo.fullName}": ${(e as Error).message}`);
      }
    }

    this.syncState.lastSyncAt = Date.now();
    return { sourceId: this.id, loadedAt: Date.now(), items, relationships, timelineEvents, errors, durationMs: Date.now() - t };
  }

  // ── Incremental Sync ────────────────────────────────────────────────────────

  async sync(): Promise<{ newItems: KnowledgeItem[]; newEvents: KnowledgeTimelineEvent[]; newRelationships: KnowledgeRelationship[]; summary: GitHubSyncSummary }> {
    const newItems: KnowledgeItem[] = [];
    const newEvents: KnowledgeTimelineEvent[] = [];
    const newRelationships: KnowledgeRelationship[] = [];
    const summary: GitHubSyncSummary = { newCommits: 0, modifiedFiles: 0, deletedFiles: 0, newBranches: 0, mergedBranches: 0, syncedAt: Date.now() };

    const { available, notConfigured } = await this.service.checkAvailability();
    if (notConfigured || !available) return { newItems, newEvents, newRelationships, summary };

    for (const repo of this.syncState.repositories) {
      try {
        const commits = await this._loadCommits(repo);
        for (const commit of commits) {
          if (!this.syncState.knownCommitShas.has(commit.sha)) {
            this.syncState.knownCommitShas.add(commit.sha);
            const artifact = this._buildCommitArtifact(repo, commit);
            newItems.push(artifact);
            newEvents.push(this._buildCommitEvent(repo, commit, artifact.id));
            summary.newCommits++;
          }
        }

        const files = await this._loadFiles(repo);
        for (const file of files) {
          const key = `${repo.fullName}:${file.path}`;
          if (!this.syncState.knownFilePaths.has(key)) {
            this.syncState.knownFilePaths.add(key);
            newItems.push(this._buildFileItem(repo, file, repo.defaultBranch, commits[0]?.sha ?? "unknown"));
            summary.modifiedFiles++;
          }
        }

        const currentBranches = new Set(repo.branches.map(b => `${repo.fullName}:${b}`));
        for (const branch of currentBranches) {
          if (!this.syncState.knownBranches.has(branch)) {
            this.syncState.knownBranches.add(branch);
            summary.newBranches++;
          }
        }
        for (const known of this.syncState.knownBranches) {
          if (known.startsWith(repo.fullName + ":") && !currentBranches.has(known)) {
            this.syncState.knownBranches.delete(known);
            summary.mergedBranches++;
          }
        }
      } catch { /* continue */ }
    }

    this.syncState.lastSyncAt = Date.now();
    return { newItems, newEvents, newRelationships, summary };
  }

  getSyncState(): Readonly<GitHubSyncState> {
    return {
      ...this.syncState,
      knownCommitShas: new Set(this.syncState.knownCommitShas),
      knownFilePaths: new Set(this.syncState.knownFilePaths),
      knownBranches: new Set(this.syncState.knownBranches),
    };
  }

  // ── Internal helpers — all use service, zero networking ─────────────────────

  private async _discoverRepositories(): Promise<GitHubRepoMeta[] | null> {
    if (this.syncState.targetRepo) {
      const [owner, repoName] = this.syncState.targetRepo.split("/");
      const result = await this.service.getRepository(owner, repoName);
      if (result.notConfigured) return null;
      if (!result.ok || !result.data) return [];
      const repo = result.data;
      const branchResult = await this.service.getBranches(owner, repoName);
      repo.branches = branchResult.ok && branchResult.data ? branchResult.data : [];
      return [repo];
    }

    const result = await this.service.listRepositories(10);
    if (result.notConfigured) return null;
    if (!result.ok || !result.data) return [];

    // Populate branches for each repo
    for (const repo of result.data) {
      const [owner, repoName] = repo.fullName.split("/");
      const branchResult = await this.service.getBranches(owner, repoName);
      repo.branches = branchResult.ok && branchResult.data ? branchResult.data : [];
    }
    return result.data;
  }

  private async _loadCommits(repo: GitHubRepoMeta): Promise<GitHubCommitMeta[]> {
    const result = await this.service.getCommits(
      repo.owner, repo.name, repo.defaultBranch, this.syncState.maxCommitsPerRepo,
    );
    if (!result.ok || !result.data) return [];
    for (const c of result.data) this.syncState.knownCommitShas.add(c.sha);
    return result.data;
  }

  private async _loadFiles(repo: GitHubRepoMeta): Promise<GitHubFileMeta[]> {
    const result = await this.service.getFileTree(repo.owner, repo.name, repo.defaultBranch);
    if (!result.ok || !result.data) return [];

    const filtered: GitHubFileMeta[] = [];
    let count = 0;
    for (const file of result.data) {
      if (count >= this.syncState.maxFilesPerRepo) break;
      if (shouldIgnore(file.path) || !isSupported(file.path)) continue;
      filtered.push(file);
      this.syncState.knownFilePaths.add(`${repo.fullName}:${file.path}`);
      count++;
    }
    return filtered;
  }

  // ── Item builders — pure, no networking ────────────────────────────────────

  private _buildRepoItem(repo: GitHubRepoMeta): KnowledgeItem {
    return Object.freeze({
      id: `github:repo:${repo.fullName}`,
      type: "artifact" as const,
      title: `Repository: ${repo.fullName}`,
      content: `${repo.description || "No description"} | Language: ${repo.language} | Branch: ${repo.defaultBranch} | Stars: ${repo.stars}`,
      tags: Object.freeze(["github", "repository", repo.language.toLowerCase(), repo.isPrivate ? "private" : "public"]),
      provenance: Object.freeze(makeGitHubProvenance(this.id, repo.fullName, repo.defaultBranch, "HEAD", `repo:${repo.fullName}`, 0.98)),
      createdAt: repo.createdAt,
    });
  }

  private _buildCommitArtifact(repo: GitHubRepoMeta, commit: GitHubCommitMeta): KnowledgeArtifact {
    return Object.freeze({
      id: `github:commit:${repo.fullName}:${commit.sha}`,
      type: "artifact" as const,
      title: `Commit: ${commit.message.slice(0, 80)}`,
      content: `${commit.message} | Author: ${commit.authorName} | Branch: ${commit.branch} | SHA: ${commit.sha}`,
      tags: Object.freeze(["github", "commit", repo.name, commit.branch]),
      provenance: Object.freeze(makeGitHubProvenance(this.id, repo.fullName, commit.branch, commit.sha, `commit:${commit.sha}`, 0.99)),
      createdAt: commit.timestamp,
      artifactKind: "commit",
      version: commit.sha.slice(0, 7),
      filePath: `${repo.fullName}@${commit.sha.slice(0, 7)}`,
      language: repo.language,
    });
  }

  private _buildCommitEvent(repo: GitHubRepoMeta, commit: GitHubCommitMeta, artifactId: string): KnowledgeTimelineEvent {
    return Object.freeze({
      id: makeKREId("ghevt"),
      eventType: "commit" as const,
      title: `[${repo.name}] ${commit.message.slice(0, 80)}`,
      description: `Author: ${commit.authorName} · Branch: ${commit.branch} · SHA: ${commit.sha.slice(0, 7)}${commit.parentShas.length > 0 ? ` · Parent: ${commit.parentShas[0].slice(0, 7)}` : ""}`,
      occurredAt: commit.timestamp,
      relatedItemIds: Object.freeze([artifactId, `github:repo:${repo.fullName}`]),
      provenance: Object.freeze(makeGitHubProvenance(this.id, repo.fullName, commit.branch, commit.sha, `commit:${commit.sha}`, 0.99)),
    });
  }

  private _buildFileItem(repo: GitHubRepoMeta, file: GitHubFileMeta, branch: string, commitSha: string): KnowledgeItem {
    const fileType = detectFileType(file.path);
    const lang = detectLanguage(file.path);
    const fileName = file.path.split("/").pop() ?? file.path;

    if (fileType === "artifact") {
      return Object.freeze({
        id: `github:file:${repo.fullName}:${file.sha}`,
        type: "artifact" as const,
        title: fileName,
        content: `Source file: ${file.path} | Language: ${lang} | Size: ${file.sizeBytes}B | Repo: ${repo.fullName}`,
        tags: Object.freeze(["github", "file", lang.toLowerCase(), repo.name]),
        provenance: Object.freeze(makeGitHubProvenance(this.id, repo.fullName, branch, commitSha, `file:${file.path}@${file.sha}`, 0.92)),
        createdAt: repo.updatedAt,
        artifactKind: "source_file",
        version: file.sha.slice(0, 7),
        filePath: file.path,
        language: lang,
      } as KnowledgeArtifact);
    }

    return Object.freeze({
      id: `github:file:${repo.fullName}:${file.sha}`,
      type: fileType,
      title: fileName,
      content: `${fileType} file: ${file.path} | Size: ${file.sizeBytes}B | Repo: ${repo.fullName} | Branch: ${branch}`,
      tags: Object.freeze(["github", "file", fileType, repo.name]),
      provenance: Object.freeze(makeGitHubProvenance(this.id, repo.fullName, branch, commitSha, `file:${file.path}@${file.sha}`, 0.92)),
      createdAt: repo.updatedAt,
    });
  }

  private _buildBranchItem(repo: GitHubRepoMeta, branch: string): KnowledgeItem {
    return Object.freeze({
      id: `github:branch:${repo.fullName}:${branch}`,
      type: "artifact" as const,
      title: `Branch: ${branch}`,
      content: `Branch "${branch}" in repository ${repo.fullName}${branch === repo.defaultBranch ? " (default)" : ""}`,
      tags: Object.freeze(["github", "branch", repo.name, branch === repo.defaultBranch ? "default" : "feature"]),
      provenance: Object.freeze(makeGitHubProvenance(this.id, repo.fullName, branch, "HEAD", `branch:${repo.fullName}:${branch}`, 0.95)),
      createdAt: repo.updatedAt,
    });
  }

  private _buildRel(
    fromId: string, toId: string, type: string, weight: number,
    repo: GitHubRepoMeta, originalId: string,
  ): KnowledgeRelationship {
    return Object.freeze({
      id: makeKREId("ghrel"),
      fromId, toId,
      relationshipType: type,
      weight,
      provenance: Object.freeze(makeGitHubProvenance(this.id, repo.fullName, repo.defaultBranch, "HEAD", originalId, 0.9)),
      createdAt: Date.now(),
    });
  }
}

export interface GitHubSyncSummary {
  newCommits: number;
  modifiedFiles: number;
  deletedFiles: number;
  newBranches: number;
  mergedBranches: number;
  syncedAt: number;
}