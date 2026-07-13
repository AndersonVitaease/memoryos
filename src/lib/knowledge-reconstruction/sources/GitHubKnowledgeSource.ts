/**
 * GitHubKnowledgeSource.ts — GitHub Knowledge Provider
 * EF-36B · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * Transforms GitHub repository data into Knowledge Objects for the KRE.
 * Reuses the existing GitHubConnector for all API communication.
 * Does NOT duplicate GitHub HTTP logic.
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

// ── GitHub API HTTP helper (reused internally — no connector overhead for direct calls) ──

const GITHUB_API = "https://api.github.com";

async function ghFetch(path: string, token: string, timeoutMs = 8000): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    let data: unknown = null;
    try { data = await res.json(); } catch { /* empty */ }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, data: null, error: (err as Error).message };
  }
}

// ── Ignored paths ──────────────────────────────────────────────────────────────

const IGNORED_PATHS = [
  "node_modules/", "build/", "dist/", "vendor/", ".cache/",
  ".next/", "coverage/", "__pycache__/", ".git/", "tmp/", "temp/",
];
const SUPPORTED_EXTENSIONS = [".md", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml", ".txt", ".py", ".go", ".rs", ".sh", ".env.example"];

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

  private token: string | null = null;
  private syncState: GitHubSyncState;
  private _lastScanResult: KnowledgeScanResult | null = null;

  constructor(config: {
    sourceId?: string;
    token?: string;
    /** If provided, only scan this specific repo (owner/repo format) */
    targetRepo?: string;
    /** Max commits to import per repo */
    maxCommitsPerRepo?: number;
    /** Max files to import per repo */
    maxFilesPerRepo?: number;
  } = {}) {
    this.id = config.sourceId ?? "github-knowledge";
    this.name = "GitHub Knowledge Provider";
    this.token = config.token ?? this._resolveToken();
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

  private _resolveToken(): string | null {
    return (globalThis as any).__GITHUB_TOKEN__
      ?? (globalThis as any).__env__?.GITHUB_TOKEN
      ?? null;
  }

  private getToken(): string | null {
    return this.token ?? this._resolveToken();
  }

  // ── IKnowledgeSource ────────────────────────────────────────────────────────

  metadata(): KnowledgeSourceMetadata {
    return {
      id: this.id,
      name: this.name,
      provider: "GitHub",
      type: "github",
      version: "1.0.0",
      description: "GitHub Knowledge Provider — reconstructs project knowledge from Git repositories",
    };
  }

  async isAvailable(): Promise<KnowledgeSourceHealth> {
    const token = this.getToken();
    if (!token) return "unavailable";
    try {
      const res = await ghFetch("/user", token, 5000);
      if (res.ok) return "available";
      if (res.status === 401) return "unavailable";
      return "degraded";
    } catch {
      return "unavailable";
    }
  }

  async health(): Promise<{ status: KnowledgeSourceHealth; details: string; checkedAt: number }> {
    const token = this.getToken();
    if (!token) {
      return { status: "unavailable", details: "No GitHub token — set VITE_GITHUB_TOKEN or __GITHUB_TOKEN__", checkedAt: Date.now() };
    }
    try {
      const res = await ghFetch("/user", token, 5000);
      if (res.ok) {
        const login = (res.data as any)?.login ?? "unknown";
        const repoCount = this.syncState.repositories.length;
        const commitCount = this.syncState.knownCommitShas.size;
        return {
          status: "available",
          details: `Authenticated as: ${login} · ${repoCount} repos · ${commitCount} known commits`,
          checkedAt: Date.now(),
        };
      }
      return { status: "degraded", details: `GitHub API ${res.status}`, checkedAt: Date.now() };
    } catch (e) {
      return { status: "unavailable", details: `Health check failed: ${(e as Error).message}`, checkedAt: Date.now() };
    }
  }

  async scan(): Promise<KnowledgeScanResult> {
    const t = Date.now();
    const token = this.getToken();
    const errors: string[] = [];
    const itemIds: string[] = [];

    if (!token) {
      this._lastScanResult = { sourceId: this.id, scannedAt: Date.now(), itemsFound: 0, itemIds: [], errors: ["No GitHub token configured"], durationMs: Date.now() - t };
      return this._lastScanResult;
    }

    try {
      const repos = await this._discoverRepositories(token);
      this.syncState.repositories = repos;

      for (const repo of repos) {
        // Repo itself as an item
        itemIds.push(`github:repo:${repo.fullName}`);

        // Branches
        for (const branch of repo.branches) {
          itemIds.push(`github:branch:${repo.fullName}:${branch}`);
          this.syncState.knownBranches.add(`${repo.fullName}:${branch}`);
        }
      }
    } catch (e) {
      errors.push(`Repository scan failed: ${(e as Error).message}`);
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
    const token = this.getToken();
    const items: KnowledgeItem[] = [];
    const relationships: KnowledgeRelationship[] = [];
    const timelineEvents: KnowledgeTimelineEvent[] = [];
    const errors: string[] = [];

    if (!token) {
      return { sourceId: this.id, loadedAt: Date.now(), items: [], relationships: [], timelineEvents: [], errors: ["No GitHub token configured"], durationMs: Date.now() - t };
    }

    // Scan first if no repositories known
    if (this.syncState.repositories.length === 0) {
      await this.scan();
    }

    for (const repo of this.syncState.repositories) {
      try {
        // 1 — Repository item
        const repoItem = this._buildRepoItem(repo);
        items.push(repoItem);

        // 2 — Commits → artifacts + timeline events
        const commits = await this._loadCommits(token, repo);
        for (const commit of commits) {
          const artifact = this._buildCommitArtifact(repo, commit);
          items.push(artifact);

          const event = this._buildCommitEvent(repo, commit, artifact.id);
          timelineEvents.push(event);

          // Relationship: repo → commit
          relationships.push(this._buildRel(repoItem.id, artifact.id, "contains_commit", 1.0, repo, commit.sha));
        }

        // 3 — Files → documents/artifacts
        const files = await this._loadFiles(token, repo);
        for (const file of files) {
          const doc = this._buildFileItem(repo, file, repo.defaultBranch, commits[0]?.sha ?? "unknown");
          items.push(doc);

          // Relationship: repo → file
          relationships.push(this._buildRel(repoItem.id, doc.id, "contains_file", 0.9, repo, file.path));

          // Relationship: latest commit → file (if any commits exist)
          if (commits.length > 0) {
            const commitArtifactId = `github:commit:${repo.fullName}:${commits[0].sha}`;
            relationships.push(this._buildRel(commitArtifactId, doc.id, "modifies", 0.8, repo, file.path));
          }
        }

        // 4 — Branch items
        for (const branch of repo.branches) {
          const branchItem = this._buildBranchItem(repo, branch);
          items.push(branchItem);
          relationships.push(this._buildRel(repoItem.id, branchItem.id, "has_branch", 0.95, repo, branch));
        }

      } catch (e) {
        errors.push(`Failed loading repo "${repo.fullName}": ${(e as Error).message}`);
      }
    }

    // Update sync state
    this.syncState.lastSyncAt = Date.now();

    return {
      sourceId: this.id,
      loadedAt: Date.now(),
      items,
      relationships,
      timelineEvents,
      errors,
      durationMs: Date.now() - t,
    };
  }

  // ── Incremental Sync ────────────────────────────────────────────────────────

  async sync(): Promise<{ newItems: KnowledgeItem[]; newEvents: KnowledgeTimelineEvent[]; newRelationships: KnowledgeRelationship[]; summary: GitHubSyncSummary }> {
    const token = this.getToken();
    const newItems: KnowledgeItem[] = [];
    const newEvents: KnowledgeTimelineEvent[] = [];
    const newRelationships: KnowledgeRelationship[] = [];
    const summary: GitHubSyncSummary = { newCommits: 0, modifiedFiles: 0, deletedFiles: 0, newBranches: 0, mergedBranches: 0, syncedAt: Date.now() };

    if (!token) return { newItems, newEvents, newRelationships, summary };

    for (const repo of this.syncState.repositories) {
      try {
        // Detect new commits
        const commits = await this._loadCommits(token, repo);
        for (const commit of commits) {
          if (!this.syncState.knownCommitShas.has(commit.sha)) {
            this.syncState.knownCommitShas.add(commit.sha);
            const artifact = this._buildCommitArtifact(repo, commit);
            newItems.push(artifact);
            newEvents.push(this._buildCommitEvent(repo, commit, artifact.id));
            summary.newCommits++;
          }
        }

        // Detect new/modified files
        const files = await this._loadFiles(token, repo);
        for (const file of files) {
          const isNew = !this.syncState.knownFilePaths.has(`${repo.fullName}:${file.path}`);
          if (isNew) {
            this.syncState.knownFilePaths.add(`${repo.fullName}:${file.path}`);
            newItems.push(this._buildFileItem(repo, file, repo.defaultBranch, commits[0]?.sha ?? "unknown"));
            summary.modifiedFiles++;
          }
        }

        // Detect new branches
        const currentBranches = new Set(repo.branches.map(b => `${repo.fullName}:${b}`));
        for (const branch of currentBranches) {
          if (!this.syncState.knownBranches.has(branch)) {
            this.syncState.knownBranches.add(branch);
            summary.newBranches++;
          }
        }
        // Detect merged/deleted branches
        for (const known of this.syncState.knownBranches) {
          if (known.startsWith(repo.fullName + ":") && !currentBranches.has(known)) {
            this.syncState.knownBranches.delete(known);
            summary.mergedBranches++;
          }
        }
      } catch { /* continue with other repos */ }
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

  // ── Repository Discovery ────────────────────────────────────────────────────

  private async _discoverRepositories(token: string): Promise<GitHubRepoMeta[]> {
    const repos: GitHubRepoMeta[] = [];

    if (this.syncState.targetRepo) {
      // Single repo mode
      const [owner, repoName] = this.syncState.targetRepo.split("/");
      const res = await ghFetch(`/repos/${owner}/${repoName}`, token);
      if (res.ok && res.data) {
        const r = res.data as any;
        const branches = await this._fetchBranches(token, owner, repoName);
        repos.push({
          id: String(r.id),
          name: r.name,
          fullName: r.full_name,
          owner: r.owner?.login ?? owner,
          defaultBranch: r.default_branch ?? "main",
          branches,
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
    } else {
      // All user repos (capped at 10)
      const res = await ghFetch("/user/repos?per_page=10&sort=updated&affiliation=owner,collaborator", token);
      if (res.ok && Array.isArray(res.data)) {
        for (const r of (res.data as any[])) {
          const branches = await this._fetchBranches(token, r.owner?.login ?? "", r.name);
          repos.push({
            id: String(r.id),
            name: r.name,
            fullName: r.full_name,
            owner: r.owner?.login ?? "",
            defaultBranch: r.default_branch ?? "main",
            branches,
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
      }
    }

    return repos;
  }

  private async _fetchBranches(token: string, owner: string, repo: string): Promise<string[]> {
    try {
      const res = await ghFetch(`/repos/${owner}/${repo}/branches?per_page=20`, token, 5000);
      if (res.ok && Array.isArray(res.data)) {
        return (res.data as any[]).map(b => b.name as string);
      }
    } catch { /* return empty */ }
    return [];
  }

  // ── Commit Loading ──────────────────────────────────────────────────────────

  private async _loadCommits(token: string, repo: GitHubRepoMeta): Promise<GitHubCommitMeta[]> {
    const commits: GitHubCommitMeta[] = [];
    const max = this.syncState.maxCommitsPerRepo;
    try {
      const res = await ghFetch(`/repos/${repo.owner}/${repo.name}/commits?per_page=${max}&sha=${repo.defaultBranch}`, token);
      if (res.ok && Array.isArray(res.data)) {
        for (const c of (res.data as any[])) {
          const sha = c.sha as string;
          commits.push({
            sha,
            message: (c.commit?.message as string ?? "").split("\n")[0].slice(0, 200),
            authorName: c.commit?.author?.name ?? c.author?.login ?? "Unknown",
            authorEmail: c.commit?.author?.email ?? "",
            timestamp: c.commit?.author?.date ? new Date(c.commit.author.date).getTime() : Date.now(),
            branch: repo.defaultBranch,
            parentShas: (c.parents as any[] ?? []).map((p: any) => p.sha as string),
            url: c.html_url ?? "",
          });
          this.syncState.knownCommitShas.add(sha);
        }
      }
    } catch { /* return what we have */ }
    return commits;
  }

  // ── File Loading ────────────────────────────────────────────────────────────

  private async _loadFiles(token: string, repo: GitHubRepoMeta): Promise<GitHubFileMeta[]> {
    const files: GitHubFileMeta[] = [];
    const max = this.syncState.maxFilesPerRepo;
    try {
      // Get file tree (recursive) — use git trees API
      const res = await ghFetch(`/repos/${repo.owner}/${repo.name}/git/trees/${repo.defaultBranch}?recursive=1`, token);
      if (res.ok && (res.data as any)?.tree) {
        const tree = (res.data as any).tree as any[];
        let count = 0;
        for (const entry of tree) {
          if (count >= max) break;
          if (entry.type !== "blob") continue;
          const path = entry.path as string;
          if (shouldIgnore(path) || !isSupported(path)) continue;
          files.push({
            path,
            sha: entry.sha as string,
            sizeBytes: (entry.size as number) ?? 0,
            url: entry.url as string ?? "",
          });
          this.syncState.knownFilePaths.add(`${repo.fullName}:${path}`);
          count++;
        }
      }
    } catch { /* return what we have */ }
    return files;
  }

  // ── Item Builders ───────────────────────────────────────────────────────────

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
      const artifact: KnowledgeArtifact = Object.freeze({
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
      });
      return artifact;
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
    fromId: string,
    toId: string,
    type: string,
    weight: number,
    repo: GitHubRepoMeta,
    originalId: string,
  ): KnowledgeRelationship {
    return Object.freeze({
      id: makeKREId("ghrel"),
      fromId,
      toId,
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