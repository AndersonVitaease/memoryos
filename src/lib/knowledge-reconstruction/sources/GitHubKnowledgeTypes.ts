/**
 * GitHubKnowledgeTypes.ts — GitHub Provider Internal Types
 * EF-36B · Project Independence · Foundation v1.0
 */

export interface GitHubRepoMeta {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  defaultBranch: string;
  branches: string[];
  language: string;
  languages: string[];
  isPrivate: boolean;
  createdAt: number;
  updatedAt: number;
  description: string;
  stars: number;
  forks: number;
  openIssues: number;
}

export interface GitHubCommitMeta {
  sha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  timestamp: number;
  branch: string;
  parentShas: string[];
  url: string;
}

export interface GitHubFileMeta {
  path: string;
  sha: string;
  sizeBytes: number;
  url: string;
}

export interface GitHubSyncState {
  lastSyncAt: number | null;
  knownCommitShas: Set<string>;
  knownFilePaths: Set<string>;
  knownBranches: Set<string>;
  targetRepo: string | null;
  maxCommitsPerRepo: number;
  maxFilesPerRepo: number;
  repositories: GitHubRepoMeta[];
}