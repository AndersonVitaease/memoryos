/**
 * GitHubStore.ts
 * EF-33A — GitHub Connector Foundation · Deterministic Simulated Store
 * All data is reproducible and covers: 3 orgs · 8 repos · 15 branches
 * 200 commits · 50 PRs · 100 issues · 30 workflows · 10 releases
 * No real HTTP. No external dependencies.
 * EF-33A · 2026-07-12 · Version: 1.0.0
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GHOrg {
  login: string; name: string; description: string; publicRepos: number; members: number; createdAt: string; avatarUrl: string;
}
export interface GHUser {
  login: string; name: string; email: string; publicRepos: number; followers: number; following: number; createdAt: string;
}
export interface GHRepo {
  id: string; orgLogin: string; name: string; fullName: string; description: string; defaultBranch: string;
  isPrivate: boolean; language: string; stars: number; forks: number; openIssues: number; topics: string[];
  createdAt: string; updatedAt: string; pushedAt: string; size: number;
}
export interface GHBranch {
  repoId: string; name: string; sha: string; protected: boolean; aheadBy: number; behindBy: number; updatedAt: string;
}
export interface GHCommit {
  sha: string; repoId: string; branch: string; message: string; author: string; authorEmail: string;
  timestamp: string; additions: number; deletions: number; files: number; verified: boolean;
}
export interface GHTreeEntry {
  path: string; name: string; type: 'blob' | 'tree'; sha: string; size?: number; mode: string;
}
export interface GHFileContent {
  path: string; content: string; encoding: string; size: number; sha: string; mimeType: string;
}
export interface GHPR {
  number: number; repoId: string; title: string; body: string;
  state: 'open' | 'closed' | 'merged'; author: string; base: string; head: string;
  reviewers: string[]; approvals: number; checksStatus: 'success' | 'failure' | 'pending' | 'skipped';
  createdAt: string; updatedAt: string; mergedAt?: string; labels: string[];
}
export interface GHIssue {
  number: number; repoId: string; title: string; body: string;
  state: 'open' | 'closed'; author: string; assignees: string[]; labels: string[];
  milestone?: string; commentCount: number; createdAt: string; updatedAt: string; closedAt?: string;
}
export interface GHWorkflow {
  id: string; repoId: string; name: string; path: string; state: 'active' | 'disabled';
  lastRunStatus: 'success' | 'failure' | 'cancelled' | 'in_progress' | 'queued';
  lastRunAt: string; totalRuns: number; badge: string;
}
export interface GHWorkflowRun {
  id: string; workflowId: string; repoId: string; status: 'completed' | 'in_progress' | 'queued';
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped'; runNumber: number;
  headBranch: string; headSha: string; createdAt: string; updatedAt: string; durationMs: number;
}
export interface GHRelease {
  id: string; repoId: string; tagName: string; name: string; body: string;
  draft: boolean; prerelease: boolean; author: string;
  assets: Array<{ name: string; size: number; downloadCount: number }>; publishedAt: string;
}

// ── Organizations ─────────────────────────────────────────────────────────────

export const ORGS: GHOrg[] = [
  { login: 'memoryos-org', name: 'MemoryOS', description: 'Living memory platform', publicRepos: 12, members: 5, createdAt: '2025-01-01T00:00:00Z', avatarUrl: 'https://github.com/memoryos-org.png' },
  { login: 'ef-engineering', name: 'EF Engineering', description: 'Engineering First team', publicRepos: 8, members: 3, createdAt: '2025-03-01T00:00:00Z', avatarUrl: 'https://github.com/ef-engineering.png' },
  { login: 'connector-labs', name: 'Connector Labs', description: 'SDK and connector research', publicRepos: 5, members: 2, createdAt: '2025-06-01T00:00:00Z', avatarUrl: 'https://github.com/connector-labs.png' },
];

export const USERS: GHUser[] = [
  { login: 'memoryos-bot', name: 'MemoryOS Bot', email: 'bot@memoryos.dev', publicRepos: 3, followers: 120, following: 5, createdAt: '2025-01-15T00:00:00Z' },
  { login: 'ef-architect', name: 'EF Architect', email: 'architect@memoryos.dev', publicRepos: 8, followers: 240, following: 12, createdAt: '2025-02-01T00:00:00Z' },
];

// ── Repositories ──────────────────────────────────────────────────────────────

export const REPOS: GHRepo[] = [
  { id: 'repo-001', orgLogin: 'memoryos-org', name: 'memoryos-core', fullName: 'memoryos-org/memoryos-core', description: 'Core MemoryOS application', defaultBranch: 'main', isPrivate: false, language: 'TypeScript', stars: 342, forks: 28, openIssues: 12, topics: ['memory', 'ai', 'react'], createdAt: '2025-01-10T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z', pushedAt: '2026-07-12T10:00:00Z', size: 18400 },
  { id: 'repo-002', orgLogin: 'memoryos-org', name: 'connector-sdk', fullName: 'memoryos-org/connector-sdk', description: 'Official Connector SDK', defaultBranch: 'main', isPrivate: false, language: 'TypeScript', stars: 128, forks: 14, openIssues: 5, topics: ['sdk', 'connectors', 'typescript'], createdAt: '2025-04-01T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z', pushedAt: '2026-07-12T08:00:00Z', size: 6200 },
  { id: 'repo-003', orgLogin: 'memoryos-org', name: 'runtime-engine', fullName: 'memoryos-org/runtime-engine', description: 'Connector Runtime Engine', defaultBranch: 'main', isPrivate: true, language: 'TypeScript', stars: 0, forks: 0, openIssues: 3, topics: ['runtime', 'connectors'], createdAt: '2025-05-01T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z', pushedAt: '2026-07-11T00:00:00Z', size: 9100 },
  { id: 'repo-004', orgLogin: 'ef-engineering', name: 'ef-backlog', fullName: 'ef-engineering/ef-backlog', description: 'Engineering First Backlog', defaultBranch: 'main', isPrivate: false, language: 'Markdown', stars: 45, forks: 3, openIssues: 28, topics: ['agile', 'backlog'], createdAt: '2025-06-01T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z', pushedAt: '2026-07-10T00:00:00Z', size: 1200 },
  { id: 'repo-005', orgLogin: 'ef-engineering', name: 'architecture-docs', fullName: 'ef-engineering/architecture-docs', description: 'MemoryOS Architecture v2.0 docs', defaultBranch: 'main', isPrivate: false, language: 'Markdown', stars: 88, forks: 6, openIssues: 2, topics: ['architecture', 'docs'], createdAt: '2025-07-01T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z', pushedAt: '2026-07-09T00:00:00Z', size: 3400 },
  { id: 'repo-006', orgLogin: 'connector-labs', name: 'github-connector', fullName: 'connector-labs/github-connector', description: 'EF-33A GitHub Connector', defaultBranch: 'main', isPrivate: false, language: 'TypeScript', stars: 22, forks: 2, openIssues: 0, topics: ['github', 'connector', 'ef-33'], createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z', pushedAt: '2026-07-12T11:00:00Z', size: 4800 },
  { id: 'repo-007', orgLogin: 'connector-labs', name: 'base44-connector', fullName: 'connector-labs/base44-connector', description: 'EF-32 Base44 Connector', defaultBranch: 'main', isPrivate: false, language: 'TypeScript', stars: 18, forks: 1, openIssues: 0, topics: ['base44', 'connector', 'ef-32'], createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z', pushedAt: '2026-07-12T10:00:00Z', size: 3900 },
  { id: 'repo-008', orgLogin: 'memoryos-org', name: 'memoryos-agents', fullName: 'memoryos-org/memoryos-agents', description: 'AI Agents for MemoryOS', defaultBranch: 'develop', isPrivate: false, language: 'TypeScript', stars: 65, forks: 8, openIssues: 7, topics: ['agents', 'ai'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z', pushedAt: '2026-07-12T09:00:00Z', size: 7800 },
];

// ── Branches ──────────────────────────────────────────────────────────────────

export const BRANCHES: GHBranch[] = [
  { repoId: 'repo-001', name: 'main', sha: 'sha-main-001', protected: true, aheadBy: 0, behindBy: 0, updatedAt: '2026-07-12T10:00:00Z' },
  { repoId: 'repo-001', name: 'develop', sha: 'sha-dev-001', protected: false, aheadBy: 3, behindBy: 0, updatedAt: '2026-07-12T09:00:00Z' },
  { repoId: 'repo-001', name: 'feature/ef-33a', sha: 'sha-feat-001', protected: false, aheadBy: 12, behindBy: 0, updatedAt: '2026-07-12T11:00:00Z' },
  { repoId: 'repo-002', name: 'main', sha: 'sha-main-002', protected: true, aheadBy: 0, behindBy: 0, updatedAt: '2026-07-12T08:00:00Z' },
  { repoId: 'repo-002', name: 'feature/sdk-freeze', sha: 'sha-sdk-freeze', protected: false, aheadBy: 5, behindBy: 0, updatedAt: '2026-07-12T07:00:00Z' },
  { repoId: 'repo-003', name: 'main', sha: 'sha-main-003', protected: true, aheadBy: 0, behindBy: 0, updatedAt: '2026-07-11T00:00:00Z' },
  { repoId: 'repo-004', name: 'main', sha: 'sha-main-004', protected: false, aheadBy: 0, behindBy: 0, updatedAt: '2026-07-10T00:00:00Z' },
  { repoId: 'repo-005', name: 'main', sha: 'sha-main-005', protected: false, aheadBy: 0, behindBy: 0, updatedAt: '2026-07-09T00:00:00Z' },
  { repoId: 'repo-006', name: 'main', sha: 'sha-main-006', protected: true, aheadBy: 0, behindBy: 0, updatedAt: '2026-07-12T11:00:00Z' },
  { repoId: 'repo-006', name: 'feature/ef-33a-foundation', sha: 'sha-feat-033a', protected: false, aheadBy: 8, behindBy: 0, updatedAt: '2026-07-12T11:30:00Z' },
  { repoId: 'repo-007', name: 'main', sha: 'sha-main-007', protected: true, aheadBy: 0, behindBy: 0, updatedAt: '2026-07-12T10:00:00Z' },
  { repoId: 'repo-008', name: 'main', sha: 'sha-main-008', protected: true, aheadBy: 0, behindBy: 0, updatedAt: '2026-07-12T09:00:00Z' },
  { repoId: 'repo-008', name: 'develop', sha: 'sha-dev-008', protected: false, aheadBy: 6, behindBy: 0, updatedAt: '2026-07-12T09:30:00Z' },
  { repoId: 'repo-001', name: 'hotfix/security-patch', sha: 'sha-hotfix-001', protected: false, aheadBy: 1, behindBy: 0, updatedAt: '2026-07-11T00:00:00Z' },
  { repoId: 'repo-003', name: 'release/v2.0', sha: 'sha-rel-003', protected: true, aheadBy: 0, behindBy: 2, updatedAt: '2026-07-10T00:00:00Z' },
];

// ── Commits (200 — build deterministically) ───────────────────────────────────

const COMMIT_AUTHORS = ['ef-architect', 'memoryos-bot', 'contributor-a', 'contributor-b'];
const COMMIT_MESSAGES = [
  'feat: implement EF-33A GitHubConnector foundation',
  'fix: correct scope validation in PermissionManager',
  'refactor: extract telemetry into dedicated subsystem',
  'docs: update architecture v2.0 diagrams',
  'test: add 20 new criteria to validation suite',
  'chore: update dependencies',
  'perf: optimize event bus throughput',
  'feat: add RuntimeEventBus.onAny() subscription',
  'fix: zero trust enforcement in connector execute',
  'feat: implement ConnectorBuilder.setTelemetry()',
];

export const COMMITS: GHCommit[] = Array.from({ length: 200 }, (_, i) => ({
  sha: `sha-commit-${String(i + 1).padStart(4, '0')}`,
  repoId: REPOS[i % REPOS.length].id,
  branch: BRANCHES[i % BRANCHES.length].name,
  message: COMMIT_MESSAGES[i % COMMIT_MESSAGES.length],
  author: COMMIT_AUTHORS[i % COMMIT_AUTHORS.length],
  authorEmail: `${COMMIT_AUTHORS[i % COMMIT_AUTHORS.length]}@memoryos.dev`,
  timestamp: new Date(Date.parse('2026-07-12T00:00:00Z') - i * 3600000).toISOString(),
  additions: (i % 80) + 1,
  deletions: (i % 30),
  files: (i % 10) + 1,
  verified: i % 3 !== 0,
}));

// ── File Tree ─────────────────────────────────────────────────────────────────

export const TREES: Record<string, GHTreeEntry[]> = {
  'repo-001': [
    { path: 'src', name: 'src', type: 'tree', sha: 'tree-src-001', mode: '040000' },
    { path: 'src/sdk', name: 'sdk', type: 'tree', sha: 'tree-sdk-001', mode: '040000' },
    { path: 'src/sdk/connector', name: 'connector', type: 'tree', sha: 'tree-conn-001', mode: '040000' },
    { path: 'src/sdk/connector/BaseConnector.ts', name: 'BaseConnector.ts', type: 'blob', sha: 'blob-base-001', size: 5200, mode: '100644' },
    { path: 'src/sdk/connector/ConnectorBuilder.ts', name: 'ConnectorBuilder.ts', type: 'blob', sha: 'blob-builder-001', size: 6100, mode: '100644' },
    { path: 'src/pages', name: 'pages', type: 'tree', sha: 'tree-pages-001', mode: '040000' },
    { path: 'src/pages/Home.jsx', name: 'Home.jsx', type: 'blob', sha: 'blob-home-001', size: 2100, mode: '100644' },
    { path: 'src/App.jsx', name: 'App.jsx', type: 'blob', sha: 'blob-app-001', size: 4200, mode: '100644' },
    { path: 'package.json', name: 'package.json', type: 'blob', sha: 'blob-pkg-001', size: 3100, mode: '100644' },
    { path: 'README.md', name: 'README.md', type: 'blob', sha: 'blob-readme-001', size: 1800, mode: '100644' },
  ],
  'repo-006': [
    { path: 'src', name: 'src', type: 'tree', sha: 'tree-src-006', mode: '040000' },
    { path: 'src/GitHubConnector.ts', name: 'GitHubConnector.ts', type: 'blob', sha: 'blob-ghconn-001', size: 8400, mode: '100644' },
    { path: 'src/GitHubStore.ts', name: 'GitHubStore.ts', type: 'blob', sha: 'blob-ghstore-001', size: 6800, mode: '100644' },
    { path: 'src/GitHubConnectorManifest.ts', name: 'GitHubConnectorManifest.ts', type: 'blob', sha: 'blob-ghman-001', size: 4200, mode: '100644' },
    { path: 'src/ef33aTests.ts', name: 'ef33aTests.ts', type: 'blob', sha: 'blob-tests-001', size: 18000, mode: '100644' },
    { path: 'README.md', name: 'README.md', type: 'blob', sha: 'blob-readme-006', size: 2200, mode: '100644' },
  ],
};

export const FILE_CONTENTS: Record<string, GHFileContent> = {
  'repo-001/src/App.jsx': { path: 'src/App.jsx', content: '// MemoryOS App.jsx\nimport React from "react";\nexport default function App() { return <div>MemoryOS</div>; }', encoding: 'utf-8', size: 4200, sha: 'blob-app-001', mimeType: 'text/jsx' },
  'repo-001/README.md': { path: 'README.md', content: '# MemoryOS\n\nLiving memory platform — Engineering First.\n\n## Architecture\n- EF-32 Base44 Connector\n- EF-33A GitHub Connector\n- EF-34 Dev Orchestrator', encoding: 'utf-8', size: 1800, sha: 'blob-readme-001', mimeType: 'text/markdown' },
  'repo-001/package.json': { path: 'package.json', content: '{\n  "name": "memoryos-core",\n  "version": "1.0.0",\n  "private": true\n}', encoding: 'utf-8', size: 3100, sha: 'blob-pkg-001', mimeType: 'application/json' },
  'repo-006/README.md': { path: 'README.md', content: '# GitHub Connector (EF-33A)\n\nFirst GitHub integration for MemoryOS. Read-only. SDK-only.', encoding: 'utf-8', size: 2200, sha: 'blob-readme-006', mimeType: 'text/markdown' },
};

// ── Pull Requests (50) ────────────────────────────────────────────────────────

const PR_STATES: GHPR['state'][] = ['open', 'open', 'closed', 'merged'];
const PR_CHECKS: GHPR['checksStatus'][] = ['success', 'success', 'failure', 'pending'];
const PR_LABELS = [['enhancement'], ['bug'], ['documentation'], ['refactor', 'enhancement'], ['ef-33a']];
const PR_REVIEWERS = [['ef-architect'], ['memoryos-bot', 'ef-architect'], ['contributor-a'], []];

export const PULL_REQUESTS: GHPR[] = Array.from({ length: 50 }, (_, i) => ({
  number: i + 1,
  repoId: REPOS[i % REPOS.length].id,
  title: `${PR_STATES[i % PR_STATES.length] === 'merged' ? 'feat' : 'fix'}: ${COMMIT_MESSAGES[i % COMMIT_MESSAGES.length]}`,
  body: `## Summary\nImplementation for EF-33A criterion ${i + 1}.\n\n## Changes\n- ${COMMIT_MESSAGES[i % COMMIT_MESSAGES.length]}`,
  state: PR_STATES[i % PR_STATES.length],
  author: COMMIT_AUTHORS[i % COMMIT_AUTHORS.length],
  base: 'main',
  head: `feature/ef-33a-${i}`,
  reviewers: PR_REVIEWERS[i % PR_REVIEWERS.length],
  approvals: i % 3,
  checksStatus: PR_CHECKS[i % PR_CHECKS.length],
  createdAt: new Date(Date.parse('2026-07-12T00:00:00Z') - i * 7200000).toISOString(),
  updatedAt: new Date(Date.parse('2026-07-12T00:00:00Z') - i * 3600000).toISOString(),
  mergedAt: PR_STATES[i % PR_STATES.length] === 'merged' ? new Date(Date.parse('2026-07-12T00:00:00Z') - i * 1800000).toISOString() : undefined,
  labels: PR_LABELS[i % PR_LABELS.length],
}));

// ── Issues (100) ──────────────────────────────────────────────────────────────

const ISSUE_STATES: GHIssue['state'][] = ['open', 'open', 'closed'];
const ISSUE_LABELS = [['bug'], ['enhancement'], ['documentation'], ['question'], ['ef-33a', 'good-first-issue']];

export const ISSUES: GHIssue[] = Array.from({ length: 100 }, (_, i) => ({
  number: i + 1,
  repoId: REPOS[i % REPOS.length].id,
  title: `Issue ${i + 1}: ${COMMIT_MESSAGES[i % COMMIT_MESSAGES.length]}`,
  body: `Issue body for criterion ${i + 1}. Describes expected behavior and acceptance criteria.`,
  state: ISSUE_STATES[i % ISSUE_STATES.length],
  author: COMMIT_AUTHORS[i % COMMIT_AUTHORS.length],
  assignees: i % 4 === 0 ? ['ef-architect'] : [],
  labels: ISSUE_LABELS[i % ISSUE_LABELS.length],
  milestone: i % 10 === 0 ? 'v2.0' : undefined,
  commentCount: i % 8,
  createdAt: new Date(Date.parse('2026-07-12T00:00:00Z') - i * 5000000).toISOString(),
  updatedAt: new Date(Date.parse('2026-07-12T00:00:00Z') - i * 2500000).toISOString(),
  closedAt: ISSUE_STATES[i % ISSUE_STATES.length] === 'closed' ? new Date(Date.parse('2026-07-12T00:00:00Z') - i * 1000000).toISOString() : undefined,
}));

// ── Workflows (30) ────────────────────────────────────────────────────────────

const WF_STATUS: GHWorkflow['lastRunStatus'][] = ['success', 'success', 'failure', 'in_progress', 'queued'];

export const WORKFLOWS: GHWorkflow[] = Array.from({ length: 30 }, (_, i) => ({
  id: `wf-${String(i + 1).padStart(3, '0')}`,
  repoId: REPOS[i % REPOS.length].id,
  name: ['CI', 'CD', 'Tests', 'Lint', 'Security Scan', 'Build'][i % 6] + ` (${i + 1})`,
  path: `.github/workflows/wf-${i + 1}.yml`,
  state: i % 5 === 0 ? 'disabled' : 'active',
  lastRunStatus: WF_STATUS[i % WF_STATUS.length],
  lastRunAt: new Date(Date.parse('2026-07-12T00:00:00Z') - i * 3600000).toISOString(),
  totalRuns: (i + 1) * 12,
  badge: `https://github.com/memoryos-org/${REPOS[i % REPOS.length].name}/actions/workflows/wf-${i + 1}.yml/badge.svg`,
}));

export const WORKFLOW_RUNS: GHWorkflowRun[] = Array.from({ length: 60 }, (_, i) => ({
  id: `run-${String(i + 1).padStart(3, '0')}`,
  workflowId: WORKFLOWS[i % WORKFLOWS.length].id,
  repoId: WORKFLOWS[i % WORKFLOWS.length].repoId,
  status: i % 5 === 0 ? 'in_progress' : 'completed',
  conclusion: i % 5 === 0 ? undefined : (i % 4 === 0 ? 'failure' : 'success'),
  runNumber: i + 1,
  headBranch: BRANCHES[i % BRANCHES.length].name,
  headSha: COMMITS[i % COMMITS.length].sha,
  createdAt: new Date(Date.parse('2026-07-12T00:00:00Z') - i * 1800000).toISOString(),
  updatedAt: new Date(Date.parse('2026-07-12T00:00:00Z') - i * 900000).toISOString(),
  durationMs: (i % 10 + 1) * 30000,
}));

// ── Releases (10) ─────────────────────────────────────────────────────────────

export const RELEASES: GHRelease[] = Array.from({ length: 10 }, (_, i) => ({
  id: `rel-${String(i + 1).padStart(3, '0')}`,
  repoId: REPOS[i % 4].id,
  tagName: `v${2 - Math.floor(i / 5)}.${i % 5}.0`,
  name: `Release v${2 - Math.floor(i / 5)}.${i % 5}.0`,
  body: `## Release Notes\n- ${COMMIT_MESSAGES[i % COMMIT_MESSAGES.length]}\n- Performance improvements\n- Bug fixes`,
  draft: i === 0,
  prerelease: i % 3 === 0,
  author: COMMIT_AUTHORS[i % COMMIT_AUTHORS.length],
  assets: [
    { name: `memoryos-v${2 - Math.floor(i / 5)}.${i % 5}.0.tar.gz`, size: (i + 1) * 512000, downloadCount: (i + 1) * 45 },
    { name: `memoryos-v${2 - Math.floor(i / 5)}.${i % 5}.0.zip`, size: (i + 1) * 480000, downloadCount: (i + 1) * 30 },
  ],
  publishedAt: new Date(Date.parse('2026-07-12T00:00:00Z') - i * 30 * 24 * 3600000).toISOString(),
}));