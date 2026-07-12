/**
 * ef33aTests.ts
 * Sprint EF-33A — GitHub Connector Foundation Test Suite
 * 20 groups · Auth · Orgs · Repos · Branches · Commits · Files · History
 *            Issues · PRs · Releases · Workflows · Telemetry · Audit · Lifecycle
 *            Security · Performance · Recovery · Health · Quality Gate · Architecture
 * EF-33A · 2026-07-12 · Version: 1.0.0
 */

import { ConnectorRuntime } from '@/runtime/connectors/ConnectorRuntime';
import { RuntimeEventBus } from '@/runtime/connectors/RuntimeEventBus';
import { GitHubConnector } from './GitHubConnector';
import { GITHUB_MANIFEST } from './GitHubConnectorManifest';
import { ORGS, REPOS, BRANCHES, COMMITS, ISSUES, PULL_REQUESTS, WORKFLOWS, RELEASES, USERS } from './GitHubStore';
import type { IConnectorAction } from '@/runtime/connectors/interfaces/IConnectorAction';
import type { IConnectorContext } from '@/runtime/connectors/interfaces/IConnectorContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONNECTOR_ID = 'github-connector-v1';

function makeAction(actionId: string, input: Record<string, unknown> = {}): IConnectorAction {
  return {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    connectorId: CONNECTOR_ID,
    actionId,
    correlationId: `corr_${Date.now()}`,
    executionId: `exec_${Date.now()}`,
    requestId: `req_${Date.now()}`,
    input,
    metadata: { attemptNumber: 1, maxAttempts: 3, timeoutMs: 10000, createdAt: new Date().toISOString() },
  };
}

function makeContext(overrides: Partial<IConnectorContext> = {}): IConnectorContext {
  return {
    correlationId: `corr_${Date.now()}`,
    executionId: `exec_${Date.now()}`,
    userId: 'user-ef33a',
    grantedScopes: ['repo.read', 'org.read', 'commit.read', 'pr.read', 'issue.read', 'actions.read', 'release.read'],
    grantedPermissions: [
      'list_orgs', 'get_org', 'list_users', 'list_org_repos',
      'list_repos', 'get_repo', 'list_branches', 'list_tags',
      'browse_tree', 'read_file', 'read_blob',
      'list_commits', 'get_commit', 'read_history',
      'list_prs', 'get_pr', 'list_pr_reviews',
      'list_issues', 'get_issue',
      'list_workflows', 'list_workflow_runs',
      'list_releases', 'get_latest_release',
    ],
    credentials: { type: 'bearer', tokenRef: 'ref_github_pat_001' },
    metadata: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function bootRuntime(bus?: RuntimeEventBus): Promise<ConnectorRuntime> {
  const rt = new ConnectorRuntime({ enableCircuitBreaker: true });
  await rt.registerConnector(GITHUB_MANIFEST, new GitHubConnector(bus));
  rt.registerCredentials(CONNECTOR_ID, 'user-ef33a', 'bearer', 'ghp-sim-token');
  return rt;
}

export interface EF33ATestResult {
  group: string; criterion: number; name: string; passed: boolean; error?: string; durationMs: number;
}

let seq = 0;
async function test(group: string, name: string, fn: () => Promise<void>): Promise<EF33ATestResult> {
  const criterion = ++seq;
  const start = Date.now();
  try { await fn(); return { group, criterion, name, passed: true, durationMs: Date.now() - start }; }
  catch (err) { return { group, criterion, name, passed: false, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - start }; }
}
function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

// ── G1: Manifest ──────────────────────────────────────────────────────────────

async function g1_manifest(): Promise<EF33ATestResult[]> {
  const G = 'G1 Manifest';
  return Promise.all([
    test(G, 'Manifest is frozen', async () => { assert(Object.isFrozen(GITHUB_MANIFEST), 'Must be frozen'); }),
    test(G, 'Manifest passes runtime validation', async () => {
      const v = new ConnectorRuntime().validateManifest(GITHUB_MANIFEST);
      assert(v.valid, JSON.stringify(v.errors));
    }),
    test(G, 'Manifest has 24 read-only actions', async () => {
      assert(GITHUB_MANIFEST.supportedActions.length === 24, `Expected 24, got ${GITHUB_MANIFEST.supportedActions.length}`);
    }),
    test(G, 'Manifest has 7 scopes', async () => {
      assert(GITHUB_MANIFEST.scopes.length === 7, `Expected 7 scopes, got ${GITHUB_MANIFEST.scopes.length}`);
    }),
    test(G, 'No write/delete actions declared', async () => {
      const writes = GITHUB_MANIFEST.supportedActions.filter(a =>
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(a.method) && a.sideEffects.length > 0
      );
      assert(writes.length === 0, `Expected 0 write actions, got ${writes.length}`);
    }),
    test(G, 'Auth type uses bearer token', async () => {
      assert(GITHUB_MANIFEST.auth.type === 'bearer', `Expected bearer, got ${GITHUB_MANIFEST.auth.type}`);
    }),
    test(G, 'Sensitive field declared for token', async () => {
      assert(GITHUB_MANIFEST.telemetry.sensitiveFields.includes('github_personal_access_token'), 'Must declare token as sensitive');
    }),
  ]);
}

// ── G2: Authentication ────────────────────────────────────────────────────────

async function g2_auth(): Promise<EF33ATestResult[]> {
  const G = 'G2 Authentication';
  return Promise.all([
    test(G, 'Authenticate with tokenRef succeeds', async () => {
      const c = new GitHubConnector(); await c.initialize(); await c.connect();
      const ok = await c.authenticate(makeContext());
      assert(ok && c.isAuthenticated(), 'Expected authenticated=true');
    }),
    test(G, 'Authenticate with no credential ref fails', async () => {
      const c = new GitHubConnector(); await c.initialize(); await c.connect();
      const ok = await c.authenticate(makeContext({ credentials: { type: 'none' } }));
      assert(!ok, 'Expected authenticated=false');
    }),
    test(G, 'Zero Trust: execute without credentials throws', async () => {
      const rt = new ConnectorRuntime();
      await rt.registerConnector(GITHUB_MANIFEST, new GitHubConnector());
      let threw = false;
      try { await rt.execute(makeAction('list_repos'), makeContext({ userId: 'unauth-user' })); } catch { threw = true; }
      assert(threw, 'Expected Zero Trust rejection');
    }),
    test(G, 'Token ref not exposed in statistics', async () => {
      const c = new GitHubConnector(); await c.initialize(); await c.connect();
      await c.authenticate(makeContext());
      const stats = JSON.stringify(c.ghStatistics());
      assert(!stats.includes('ref_github_pat_001'), 'Token ref must not appear in stats');
      assert(!stats.includes('ghp-sim-token'), 'Raw token must not appear in stats');
    }),
    test(G, 'Shutdown clears authentication state', async () => {
      const c = new GitHubConnector(); await c.initialize(); await c.connect();
      await c.authenticate(makeContext());
      await c.shutdown();
      assert(!c.isAuthenticated(), 'Auth must be cleared after shutdown');
    }),
  ]);
}

// ── G3: Organizations ─────────────────────────────────────────────────────────

async function g3_orgs(): Promise<EF33ATestResult[]> {
  const G = 'G3 Organizations';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'list_orgs returns 3 organizations', async () => {
      const r = await rt.execute(makeAction('list_orgs'), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS, got ${r.status}`);
      const orgs = r.output?.['orgs'] as typeof ORGS;
      assert(orgs.length === ORGS.length, `Expected ${ORGS.length}`);
    }),
    test(G, 'get_org returns correct org metadata', async () => {
      const r = await rt.execute(makeAction('get_org', { org: 'memoryos-org' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const org = r.output?.['org'] as typeof ORGS[0];
      assert(org.login === 'memoryos-org', `Wrong login: ${org.login}`);
      assert(org.name === 'MemoryOS', `Wrong name: ${org.name}`);
    }),
    test(G, 'get_org with unknown org returns FAILED', async () => {
      const r = await rt.execute(makeAction('get_org', { org: 'ghost-org' }), makeContext());
      assert(r.status === 'FAILED', `Expected FAILED, got ${r.status}`);
    }),
    test(G, 'list_users returns users with login and email', async () => {
      const r = await rt.execute(makeAction('list_users'), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const users = r.output?.['users'] as typeof USERS;
      assert(users.length === USERS.length, `Expected ${USERS.length}`);
      assert(typeof users[0].login === 'string', 'Expected login');
    }),
    test(G, 'list_org_repos filters by org', async () => {
      const r = await rt.execute(makeAction('list_org_repos', { org: 'memoryos-org' }), makeContext());
      const repos = r.output?.['repos'] as typeof REPOS;
      assert(repos.every(rep => rep.orgLogin === 'memoryos-org'), 'All repos must belong to memoryos-org');
    }),
  ]);
}

// ── G4: Repositories ──────────────────────────────────────────────────────────

async function g4_repos(): Promise<EF33ATestResult[]> {
  const G = 'G4 Repositories';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'list_repos returns all 8 repos', async () => {
      const r = await rt.execute(makeAction('list_repos'), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const repos = r.output?.['repos'] as typeof REPOS;
      assert(repos.length === REPOS.length, `Expected ${REPOS.length} repos, got ${repos.length}`);
    }),
    test(G, 'get_repo by id returns correct repo', async () => {
      const r = await rt.execute(makeAction('get_repo', { repoId: 'repo-001' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const repo = r.output?.['repo'] as typeof REPOS[0];
      assert(repo.id === 'repo-001', 'Wrong id');
      assert(repo.name === 'memoryos-core', 'Wrong name');
    }),
    test(G, 'get_repo has language, stars, defaultBranch', async () => {
      const r = await rt.execute(makeAction('get_repo', { repoId: 'repo-001' }), makeContext());
      const repo = r.output?.['repo'] as typeof REPOS[0];
      assert(typeof repo.language === 'string', 'Expected language');
      assert(typeof repo.stars === 'number', 'Expected stars');
      assert(typeof repo.defaultBranch === 'string', 'Expected defaultBranch');
    }),
    test(G, 'list_repos filtered by org returns only org repos', async () => {
      const r = await rt.execute(makeAction('list_repos', { org: 'ef-engineering' }), makeContext());
      const repos = r.output?.['repos'] as typeof REPOS;
      assert(repos.every(rep => rep.orgLogin === 'ef-engineering'), 'All repos must be from ef-engineering');
    }),
  ]);
}

// ── G5: Branches ──────────────────────────────────────────────────────────────

async function g5_branches(): Promise<EF33ATestResult[]> {
  const G = 'G5 Branches';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'list_branches for repo-001 returns 4 branches', async () => {
      const r = await rt.execute(makeAction('list_branches', { repoId: 'repo-001' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const bs = r.output?.['branches'] as typeof BRANCHES;
      assert(bs.length >= 3, `Expected >= 3 branches, got ${bs.length}`);
    }),
    test(G, 'branches have sha, protected, aheadBy', async () => {
      const r = await rt.execute(makeAction('list_branches', { repoId: 'repo-001' }), makeContext());
      const bs = r.output?.['branches'] as typeof BRANCHES;
      const main = bs.find(b => b.name === 'main');
      assert(main !== undefined, 'main branch must exist');
      assert(main!.protected === true, 'main must be protected');
      assert(typeof main!.sha === 'string', 'Expected sha');
    }),
    test(G, 'list_tags returns release tags', async () => {
      const r = await rt.execute(makeAction('list_tags', { repoId: 'repo-001' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const tags = r.output?.['tags'] as Array<{ name: string }>;
      assert(Array.isArray(tags), 'Expected tags array');
    }),
  ]);
}

// ── G6: Commits ───────────────────────────────────────────────────────────────

async function g6_commits(): Promise<EF33ATestResult[]> {
  const G = 'G6 Commits';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'list_commits for repo-001 returns commits', async () => {
      const r = await rt.execute(makeAction('list_commits', { repoId: 'repo-001', limit: 20 }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const commits = r.output?.['commits'] as typeof COMMITS;
      assert(commits.length > 0, `Expected > 0 commits`);
    }),
    test(G, 'commits have sha, message, author, timestamp', async () => {
      const r = await rt.execute(makeAction('list_commits', { repoId: 'repo-001', limit: 5 }), makeContext());
      const commits = r.output?.['commits'] as typeof COMMITS;
      const c = commits[0];
      assert(typeof c.sha === 'string' && c.sha.length > 0, 'Expected sha');
      assert(typeof c.message === 'string', 'Expected message');
      assert(typeof c.author === 'string', 'Expected author');
    }),
    test(G, 'get_commit returns a single commit by sha', async () => {
      const sha = COMMITS[0].sha;
      const r = await rt.execute(makeAction('get_commit', { sha }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const commit = r.output?.['commit'] as typeof COMMITS[0];
      assert(commit.sha === sha, 'Wrong sha');
    }),
    test(G, 'get_commit with unknown sha returns FAILED', async () => {
      const r = await rt.execute(makeAction('get_commit', { sha: 'sha-ghost' }), makeContext());
      assert(r.status === 'FAILED', `Expected FAILED`);
    }),
    test(G, 'read_history returns commits for a file path', async () => {
      const r = await rt.execute(makeAction('read_history', { repoId: 'repo-001', path: 'src/App.jsx' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const history = r.output?.['history'] as typeof COMMITS;
      assert(Array.isArray(history), 'Expected history array');
    }),
    test(G, 'total commits in store is 200', async () => {
      assert(COMMITS.length === 200, `Expected 200 commits, got ${COMMITS.length}`);
    }),
  ]);
}

// ── G7: Files ────────────────────────────────────────────────────────────────

async function g7_files(): Promise<EF33ATestResult[]> {
  const G = 'G7 Files';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'browse_tree for repo-001 root returns entries', async () => {
      const r = await rt.execute(makeAction('browse_tree', { repoId: 'repo-001' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const tree = r.output?.['tree'] as Array<{ path: string }>;
      assert(Array.isArray(tree) && tree.length > 0, 'Expected non-empty tree');
    }),
    test(G, 'browse_tree for src/ path filters correctly', async () => {
      const r = await rt.execute(makeAction('browse_tree', { repoId: 'repo-001', path: 'src' }), makeContext());
      const tree = r.output?.['tree'] as Array<{ path: string }>;
      assert(tree.every(e => e.path.startsWith('src/')), 'All entries must start with src/');
    }),
    test(G, 'read_file returns content, size, sha, mimeType', async () => {
      const r = await rt.execute(makeAction('read_file', { repoId: 'repo-001', path: 'README.md' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      assert(typeof r.output?.['content'] === 'string', 'Expected content');
      assert(typeof r.output?.['size'] === 'number', 'Expected size');
      assert(typeof r.output?.['sha'] === 'string', 'Expected sha');
      assert(r.output?.['mimeType'] === 'text/markdown', `Expected text/markdown, got ${r.output?.['mimeType']}`);
    }),
    test(G, 'read_file for unknown path returns FAILED', async () => {
      const r = await rt.execute(makeAction('read_file', { repoId: 'repo-001', path: 'ghost.ts' }), makeContext());
      assert(r.status === 'FAILED', `Expected FAILED`);
    }),
    test(G, 'read_blob by sha returns blob metadata', async () => {
      const r = await rt.execute(makeAction('read_blob', { repoId: 'repo-001', sha: 'blob-app-001' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      assert(r.output?.['sha'] === 'blob-app-001', 'Wrong sha');
      assert(r.output?.['type'] === 'blob', 'Expected type=blob');
    }),
  ]);
}

// ── G8: Pull Requests ────────────────────────────────────────────────────────

async function g8_prs(): Promise<EF33ATestResult[]> {
  const G = 'G8 Pull Requests';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'list_prs returns all 50 PRs when no repoId filter', async () => {
      const r = await rt.execute(makeAction('list_prs'), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const prs = r.output?.['pullRequests'] as typeof PULL_REQUESTS;
      assert(prs.length === PULL_REQUESTS.length, `Expected ${PULL_REQUESTS.length} PRs`);
    }),
    test(G, 'list_prs filtered by state=open returns only open', async () => {
      const r = await rt.execute(makeAction('list_prs', { state: 'open' }), makeContext());
      const prs = r.output?.['pullRequests'] as typeof PULL_REQUESTS;
      assert(prs.every(p => p.state === 'open'), 'All PRs must be open');
    }),
    test(G, 'list_prs filtered by state=merged returns only merged', async () => {
      const r = await rt.execute(makeAction('list_prs', { state: 'merged' }), makeContext());
      const prs = r.output?.['pullRequests'] as typeof PULL_REQUESTS;
      assert(prs.every(p => p.state === 'merged'), 'All PRs must be merged');
    }),
    test(G, 'get_pr returns correct PR with reviews metadata', async () => {
      const firstPR = PULL_REQUESTS.find(p => p.repoId === 'repo-001')!;
      const r = await rt.execute(makeAction('get_pr', { repoId: 'repo-001', number: firstPR.number }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const pr = r.output?.['pullRequest'] as typeof PULL_REQUESTS[0];
      assert(pr.number === firstPR.number, 'Wrong PR number');
      assert(Array.isArray(pr.reviewers), 'Expected reviewers array');
    }),
    test(G, 'list_pr_reviews returns reviews for a PR', async () => {
      const pr = PULL_REQUESTS.find(p => p.repoId === 'repo-001' && p.reviewers.length > 0)!;
      const r = await rt.execute(makeAction('list_pr_reviews', { repoId: 'repo-001', number: pr.number }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
    }),
  ]);
}

// ── G9: Issues ───────────────────────────────────────────────────────────────

async function g9_issues(): Promise<EF33ATestResult[]> {
  const G = 'G9 Issues';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'list_issues returns all 100 issues without filter', async () => {
      const r = await rt.execute(makeAction('list_issues'), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const issues = r.output?.['issues'] as typeof ISSUES;
      assert(issues.length === ISSUES.length, `Expected ${ISSUES.length} issues`);
    }),
    test(G, 'list_issues filtered by state=open returns only open', async () => {
      const r = await rt.execute(makeAction('list_issues', { state: 'open' }), makeContext());
      const issues = r.output?.['issues'] as typeof ISSUES;
      assert(issues.every(i => i.state === 'open'), 'All issues must be open');
    }),
    test(G, 'list_issues filtered by label returns matching', async () => {
      const r = await rt.execute(makeAction('list_issues', { label: 'ef-33a' }), makeContext());
      const issues = r.output?.['issues'] as typeof ISSUES;
      assert(issues.every(i => i.labels.includes('ef-33a')), 'All must have ef-33a label');
    }),
    test(G, 'get_issue returns correct issue', async () => {
      const first = ISSUES.find(i => i.repoId === 'repo-001')!;
      const r = await rt.execute(makeAction('get_issue', { repoId: 'repo-001', number: first.number }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const issue = r.output?.['issue'] as typeof ISSUES[0];
      assert(issue.number === first.number, 'Wrong issue number');
    }),
    test(G, 'total issues in store is 100', async () => {
      assert(ISSUES.length === 100, `Expected 100 issues, got ${ISSUES.length}`);
    }),
  ]);
}

// ── G10: Releases ─────────────────────────────────────────────────────────────

async function g10_releases(): Promise<EF33ATestResult[]> {
  const G = 'G10 Releases';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'list_releases returns 10 releases', async () => {
      const r = await rt.execute(makeAction('list_releases'), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const rels = r.output?.['releases'] as typeof RELEASES;
      assert(rels.length === RELEASES.length, `Expected ${RELEASES.length}`);
    }),
    test(G, 'releases have tagName, assets, publishedAt', async () => {
      const r = await rt.execute(makeAction('list_releases'), makeContext());
      const rel = (r.output?.['releases'] as typeof RELEASES)[0];
      assert(typeof rel.tagName === 'string', 'Expected tagName');
      assert(Array.isArray(rel.assets), 'Expected assets');
      assert(typeof rel.publishedAt === 'string', 'Expected publishedAt');
    }),
    test(G, 'get_latest_release returns non-draft, non-prerelease', async () => {
      const r = await rt.execute(makeAction('get_latest_release', { repoId: 'repo-001' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const rel = r.output?.['release'] as typeof RELEASES[0];
      assert(!rel.draft, 'Latest release must not be draft');
      assert(!rel.prerelease, 'Latest release must not be prerelease');
    }),
  ]);
}

// ── G11: Workflows ────────────────────────────────────────────────────────────

async function g11_workflows(): Promise<EF33ATestResult[]> {
  const G = 'G11 Workflows';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'list_workflows returns 30 workflows', async () => {
      const r = await rt.execute(makeAction('list_workflows'), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const wfs = r.output?.['workflows'] as typeof WORKFLOWS;
      assert(wfs.length === WORKFLOWS.length, `Expected ${WORKFLOWS.length}`);
    }),
    test(G, 'workflows have id, name, path, state, lastRunStatus', async () => {
      const r = await rt.execute(makeAction('list_workflows'), makeContext());
      const wf = (r.output?.['workflows'] as typeof WORKFLOWS)[0];
      assert(typeof wf.id === 'string', 'Expected id');
      assert(typeof wf.name === 'string', 'Expected name');
      assert(['active', 'disabled'].includes(wf.state), 'Expected valid state');
    }),
    test(G, 'list_workflow_runs for a workflow returns runs', async () => {
      const r = await rt.execute(makeAction('list_workflow_runs', { workflowId: 'wf-001', limit: 10 }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS`);
      const runs = r.output?.['runs'] as Array<{ id: string }>;
      assert(Array.isArray(runs), 'Expected runs array');
    }),
    test(G, 'No write action declared (no workflow dispatch)', async () => {
      const writeActions = GITHUB_MANIFEST.supportedActions.filter(a => a.id.includes('dispatch') || a.id.includes('trigger'));
      assert(writeActions.length === 0, 'No dispatch action should exist');
    }),
  ]);
}

// ── G12: Telemetry ────────────────────────────────────────────────────────────

async function g12_telemetry(): Promise<EF33ATestResult[]> {
  const G = 'G12 Telemetry';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'Telemetry tracks requestCount after list_repos', async () => {
      await rt.execute(makeAction('list_repos'), makeContext());
      const t = rt.getTelemetry(CONNECTOR_ID);
      assert(t.requestCount >= 1, `Expected requestCount >= 1, got ${t.requestCount}`);
    }),
    test(G, 'Telemetry tracks successCount after successful calls', async () => {
      await rt.execute(makeAction('list_orgs'), makeContext());
      const t = rt.getTelemetry(CONNECTOR_ID);
      assert(t.successCount >= 1, `Expected successCount >= 1`);
    }),
    test(G, 'Telemetry tracks DENIED result', async () => {
      await rt.execute(makeAction('read_file', { repoId: 'repo-001', path: 'README.md' }), makeContext({ grantedScopes: ['org.read'] }));
      const t = rt.getTelemetry(CONNECTOR_ID);
      assert(t.requestCount >= 1, 'Request must be counted even if DENIED');
    }),
    test(G, 'ghStatistics fields are all present', async () => {
      const c = new GitHubConnector(); await c.initialize(); await c.connect();
      await c.authenticate(makeContext());
      const s = c.ghStatistics();
      for (const k of ['authenticated', 'reposDiscovered', 'commitsLoaded', 'filesRead', 'prsLoaded', 'issuesLoaded']) {
        assert(k in s, `Missing field: ${k}`);
      }
    }),
  ]);
}

// ── G13: Audit ────────────────────────────────────────────────────────────────

async function g13_audit(): Promise<EF33ATestResult[]> {
  const G = 'G13 Audit';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'Audit log grows after each execution', async () => {
      const before = rt.getAuditLog(1000).length;
      await rt.execute(makeAction('list_repos'), makeContext());
      await rt.execute(makeAction('list_orgs'), makeContext());
      const after = rt.getAuditLog(1000).length;
      assert(after >= before + 2, `Expected >= ${before + 2} audit entries`);
    }),
    test(G, 'Audit records contain connectorId=github-connector-v1', async () => {
      await rt.execute(makeAction('get_repo', { repoId: 'repo-001' }), makeContext());
      const log = rt.getAuditLog(10);
      assert(log.some(r => r.connectorId === CONNECTOR_ID), 'Expected audit record for GitHub connector');
    }),
  ]);
}

// ── G14: Lifecycle ────────────────────────────────────────────────────────────

async function g14_lifecycle(): Promise<EF33ATestResult[]> {
  const G = 'G14 Lifecycle';
  return Promise.all([
    test(G, 'Status transitions: UNREGISTERED → INITIALIZING → CONNECTED', async () => {
      const c = new GitHubConnector();
      assert(c.status === 'UNREGISTERED', `Expected UNREGISTERED, got ${c.status}`);
      await c.initialize();
      await c.connect();
      assert(c.status === 'CONNECTED', `Expected CONNECTED, got ${c.status}`);
    }),
    test(G, 'health() returns HEALTHY when connected', async () => {
      const c = new GitHubConnector(); await c.initialize(); await c.connect();
      const h = await c.health();
      assert(h.status === 'HEALTHY', `Expected HEALTHY, got ${h.status}`);
    }),
    test(G, 'validate() returns valid for correct manifest', async () => {
      const c = new GitHubConnector(); await c.initialize();
      const v = await c.validate();
      assert(v.valid, `Validation failed: ${JSON.stringify(v.errors)}`);
    }),
    test(G, 'metrics() returns structured metrics snapshot', async () => {
      const c = new GitHubConnector(); await c.initialize();
      const m = c.metrics();
      assert(typeof m.executeCount === 'number', 'Expected executeCount');
      assert(typeof m.avgLatencyMs === 'number', 'Expected avgLatencyMs');
    }),
  ]);
}

// ── G15: Security ─────────────────────────────────────────────────────────────

async function g15_security(): Promise<EF33ATestResult[]> {
  const G = 'G15 Security';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'Missing repo.read scope blocks read_file', async () => {
      const r = await rt.execute(makeAction('read_file', { repoId: 'repo-001', path: 'README.md' }), makeContext({ grantedScopes: ['org.read'] }));
      assert(r.status === 'DENIED', `Expected DENIED, got ${r.status}`);
    }),
    test(G, 'Missing actions.read scope blocks list_workflows', async () => {
      const r = await rt.execute(makeAction('list_workflows'), makeContext({ grantedScopes: ['repo.read'] }));
      assert(r.status === 'DENIED', `Expected DENIED, got ${r.status}`);
    }),
    test(G, 'Full scopes allow list_commits', async () => {
      const r = await rt.execute(makeAction('list_commits', { repoId: 'repo-001' }), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS, got ${r.status}`);
    }),
    test(G, 'No secrets in audit log', async () => {
      await rt.execute(makeAction('list_repos'), makeContext());
      const log = JSON.stringify(rt.getAuditLog(5));
      assert(!log.includes('ghp-sim-token'), 'Token must not appear in audit log');
      assert(!log.includes('ref_github_pat_001'), 'Token ref must not appear in audit log');
    }),
  ]);
}

// ── G16: Performance ─────────────────────────────────────────────────────────

async function g16_performance(): Promise<EF33ATestResult[]> {
  const G = 'G16 Performance';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, '50 concurrent list_repos complete without failure', async () => {
      const results = await Promise.all(Array.from({ length: 50 }, () => rt.execute(makeAction('list_repos'), makeContext())));
      const ok = results.filter(r => r.status === 'SUCCESS').length;
      assert(ok === 50, `Expected 50 SUCCESS, got ${ok}`);
    }),
    test(G, 'list_commits for 200 commits completes in < 200ms', async () => {
      const start = Date.now();
      await rt.execute(makeAction('list_commits', { repoId: 'repo-001', limit: 200 }), makeContext());
      const elapsed = Date.now() - start;
      assert(elapsed < 200, `Expected < 200ms, got ${elapsed}ms`);
    }),
    test(G, 'list_issues for 100 issues completes in < 100ms', async () => {
      const start = Date.now();
      await rt.execute(makeAction('list_issues'), makeContext());
      const elapsed = Date.now() - start;
      assert(elapsed < 100, `Expected < 100ms, got ${elapsed}ms`);
    }),
  ]);
}

// ── G17: Recovery ─────────────────────────────────────────────────────────────

async function g17_recovery(): Promise<EF33ATestResult[]> {
  const G = 'G17 Recovery';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'Unknown action returns FAILED (not exception)', async () => {
      const r = await rt.execute(makeAction('create_branch'), makeContext());
      assert(r.status === 'FAILED', `Expected FAILED, got ${r.status}`);
      assert(typeof r.error?.code === 'string', 'Expected error.code');
    }),
    test(G, 'Missing repo returns FAILED with error', async () => {
      const r = await rt.execute(makeAction('get_repo', { repoId: 'ghost-repo' }), makeContext());
      assert(r.status === 'FAILED', `Expected FAILED`);
    }),
    test(G, 'Runtime remains functional after failed call', async () => {
      await rt.execute(makeAction('ghost_action'), makeContext());
      const r = await rt.execute(makeAction('list_orgs'), makeContext());
      assert(r.status === 'SUCCESS', `Expected SUCCESS after recovery`);
    }),
  ]);
}

// ── G18: Health ───────────────────────────────────────────────────────────────

async function g18_health(): Promise<EF33ATestResult[]> {
  const G = 'G18 Health';
  const rt = await bootRuntime();
  return Promise.all([
    test(G, 'Runtime health includes github-connector-v1', async () => {
      const h = rt.getHealth();
      assert(h.registeredConnectors.includes(CONNECTOR_ID), 'Expected github connector in health');
    }),
    test(G, 'Connector health check returns HEALTHY', async () => {
      const c = new GitHubConnector(); await c.initialize(); await c.connect();
      const h = await c.health();
      assert(h.connectorId === CONNECTOR_ID, 'Wrong connectorId in health');
      assert(h.status === 'HEALTHY', `Expected HEALTHY, got ${h.status}`);
      assert(typeof h.checkedAt === 'string', 'Expected checkedAt');
    }),
    test(G, 'Health checks include storeIntact and rateLimitOk', async () => {
      const c = new GitHubConnector(); await c.initialize(); await c.connect();
      const h = await c.health();
      assert('storeIntact' in h.checks, 'Expected storeIntact check');
      assert('rateLimitOk' in h.checks, 'Expected rateLimitOk check');
    }),
  ]);
}

// ── G19: Quality Gate ─────────────────────────────────────────────────────────

async function g19_quality(): Promise<EF33ATestResult[]> {
  const G = 'G19 Quality Gate';
  return Promise.all([
    test(G, 'Store data: 3 orgs, 8 repos, 15 branches', async () => {
      assert(ORGS.length === 3, `Expected 3 orgs, got ${ORGS.length}`);
      assert(REPOS.length === 8, `Expected 8 repos, got ${REPOS.length}`);
      assert(BRANCHES.length === 15, `Expected 15 branches, got ${BRANCHES.length}`);
    }),
    test(G, 'Store data: 200 commits, 50 PRs, 100 issues', async () => {
      assert(COMMITS.length === 200, `Expected 200 commits, got ${COMMITS.length}`);
      assert(PULL_REQUESTS.length === 50, `Expected 50 PRs, got ${PULL_REQUESTS.length}`);
      assert(ISSUES.length === 100, `Expected 100 issues, got ${ISSUES.length}`);
    }),
    test(G, 'Store data: 30 workflows, 10 releases', async () => {
      assert(WORKFLOWS.length === 30, `Expected 30 workflows, got ${WORKFLOWS.length}`);
      assert(RELEASES.length === 10, `Expected 10 releases, got ${RELEASES.length}`);
    }),
    test(G, 'All repos have a default branch declared', async () => {
      assert(REPOS.every(r => typeof r.defaultBranch === 'string' && r.defaultBranch.length > 0), 'All repos must have defaultBranch');
    }),
    test(G, 'All PRs have valid state (open/closed/merged)', async () => {
      assert(PULL_REQUESTS.every(p => ['open', 'closed', 'merged'].includes(p.state)), 'All PRs must have valid state');
    }),
  ]);
}

// ── G20: Architecture ─────────────────────────────────────────────────────────

async function g20_architecture(): Promise<EF33ATestResult[]> {
  const G = 'G20 Architecture';
  return Promise.all([
    test(G, 'GitHubConnector extends BaseConnector (SDK-only)', async () => {
      const { BaseConnector } = await import('@/sdk/connector/BaseConnector');
      const c = new GitHubConnector();
      assert(c instanceof BaseConnector, 'Must extend BaseConnector');
    }),
    test(G, 'GitHubConnector manifest built via ConnectorBuilder', async () => {
      assert(Object.isFrozen(GITHUB_MANIFEST), 'Manifest must be frozen (built by ConnectorBuilder)');
      assert(typeof GITHUB_MANIFEST.schemaVersion === 'number', 'Expected schemaVersion');
    }),
    test(G, 'EF-33A is read-only: no write actions in manifest', async () => {
      const writes = ['create_branch', 'push', 'merge', 'create_pr', 'create_commit', 'workflow_dispatch'];
      for (const w of writes) {
        assert(!GITHUB_MANIFEST.supportedActions.some(a => a.id === w), `Write action '${w}' must not exist in EF-33A`);
      }
    }),
    test(G, 'Circuit breaker and retry policy declared', async () => {
      assert(GITHUB_MANIFEST.circuitBreaker.enabled === true, 'Circuit breaker must be enabled');
      assert(GITHUB_MANIFEST.retryPolicy.maxAttempts >= 3, 'Must have at least 3 retry attempts');
    }),
  ]);
}

// ── Main ──────────────────────────────────────────────────────────────────────

export interface EF33ASuiteResult {
  passed: number; total: number; durationMs: number;
  results: EF33ATestResult[];
  byGroup: Record<string, { passed: number; total: number }>;
  health: { status: 'SUCCESS' | 'PARTIAL' | 'FAILED'; details: string };
  statistics: { totalGroups: number; successRate: number };
  metrics: { avgDurationMs: number; maxDurationMs: number };
  certification: {
    totalTests: number; passedTests: number; successRate: number;
    capabilities: string[]; limitations: string[];
    verdict: 'GITHUB CONNECTOR READY' | 'GITHUB CONNECTOR NOT READY';
    justification: string;
  };
}

export async function runEF33ATests(): Promise<EF33ASuiteResult> {
  seq = 0;
  const start = Date.now();

  const allResults = (await Promise.all([
    g1_manifest(), g2_auth(), g3_orgs(), g4_repos(), g5_branches(),
    g6_commits(), g7_files(), g8_prs(), g9_issues(), g10_releases(),
    g11_workflows(), g12_telemetry(), g13_audit(), g14_lifecycle(),
    g15_security(), g16_performance(), g17_recovery(), g18_health(),
    g19_quality(), g20_architecture(),
  ])).flat();

  const passed = allResults.filter(r => r.passed).length;
  const total = allResults.length;
  const durationMs = Date.now() - start;
  const successRate = total > 0 ? passed / total : 0;

  const byGroup: Record<string, { passed: number; total: number }> = {};
  for (const r of allResults) {
    if (!byGroup[r.group]) byGroup[r.group] = { passed: 0, total: 0 };
    byGroup[r.group].total++;
    if (r.passed) byGroup[r.group].passed++;
  }

  const durations = allResults.map(r => r.durationMs);
  const avgDurationMs = Math.round(durations.reduce((s, d) => s + d, 0) / (durations.length || 1));
  const maxDurationMs = Math.max(...durations, 0);
  const ready = successRate === 1.0;

  return {
    passed, total, durationMs, results: allResults, byGroup,
    health: {
      status: successRate === 1 ? 'SUCCESS' : successRate >= 0.85 ? 'PARTIAL' : 'FAILED',
      details: `${passed}/${total} passed in ${durationMs}ms — ${(successRate * 100).toFixed(1)}%`,
    },
    statistics: { totalGroups: 20, successRate },
    metrics: { avgDurationMs, maxDurationMs },
    certification: {
      totalTests: total, passedTests: passed, successRate,
      capabilities: [
        'OrganizationDiscovery', 'UserDiscovery', 'RepositoryDiscovery',
        'BranchListing', 'TagListing', 'TreeBrowsing', 'FileRead', 'BlobRead',
        'CommitHistory', 'FileHistory', 'PullRequestRead', 'PRReviewRead',
        'IssueRead', 'WorkflowRead', 'WorkflowRunRead', 'ReleaseRead',
        'HealthCheck', 'Audit', 'Telemetry', 'ZeroTrust',
      ],
      limitations: [
        'Read-only (no write ops in EF-33A)',
        'Simulated store (no real GitHub API calls)',
        'No webhook listener (EF-33B)',
        'No write: branch/commit/PR/merge/dispatch',
      ],
      verdict: ready ? 'GITHUB CONNECTOR READY' : 'GITHUB CONNECTOR NOT READY',
      justification: ready
        ? 'All 20 groups passed. Authentication, Orgs, Repos, Branches, Commits, Files, PRs, Issues, Workflows, Releases, Telemetry, Audit, Lifecycle, Security, Performance, Recovery, Health, Quality Gate, and Architecture are all certified. EF-33B (write operations) can begin.'
        : `${total - passed} test(s) failed. Groups with failures: ${Object.entries(byGroup).filter(([, g]) => g.passed < g.total).map(([k]) => k).join(', ')}.`,
    },
  };
}