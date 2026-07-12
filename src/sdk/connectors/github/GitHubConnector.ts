/**
 * GitHubConnector.ts
 * EF-33A — GitHub Connector Foundation
 *
 * Second official MemoryOS connector. Read-only.
 * Implements: Organizations · Repositories · Branches · Commits · File Tree
 *             Pull Requests · Issues · Workflows · Releases · Health
 *
 * Security: Zero Trust · Least Privilege · No secrets in logs · No persistent tokens
 * All operations use exclusively the Connector SDK.
 *
 * EF-33A · 2026-07-12 · Version: 1.0.0
 */

import { BaseConnector } from '@/sdk/connector/BaseConnector';
import { GITHUB_MANIFEST } from './GitHubConnectorManifest';
import { RuntimeEventBus } from '@/runtime/connectors/RuntimeEventBus';
import {
  ORGS, USERS, REPOS, BRANCHES, COMMITS, TREES, FILE_CONTENTS,
  PULL_REQUESTS, ISSUES, WORKFLOWS, WORKFLOW_RUNS, RELEASES,
} from './GitHubStore';
import type { IConnectorAction } from '@/runtime/connectors/interfaces/IConnectorAction';
import type { IConnectorContext } from '@/runtime/connectors/interfaces/IConnectorContext';
import type { IConnectorSession } from '@/runtime/connectors/interfaces/IConnectorSession';
import type { IConnectorResult } from '@/runtime/connectors/interfaces/IConnectorResult';
import type { IConnectorHealth } from '@/runtime/connectors/interfaces/IConnectorHealth';

// ── Internal state ────────────────────────────────────────────────────────────

interface AuthState {
  authenticated: boolean;
  userId: string;
  credentialRef: string;
  authenticatedAt?: string;
  scopes: string[];
}

// ── GitHubConnector ───────────────────────────────────────────────────────────

export class GitHubConnector extends BaseConnector {
  private eventBus?: RuntimeEventBus;
  private authState: AuthState = { authenticated: false, userId: '', credentialRef: '', scopes: [] };

  // Telemetry counters
  private reposDiscovered = 0;
  private commitsLoaded = 0;
  private filesRead = 0;
  private prsLoaded = 0;
  private issuesLoaded = 0;
  private workflowsLoaded = 0;
  private releasesLoaded = 0;

  constructor(eventBus?: RuntimeEventBus) {
    super(GITHUB_MANIFEST);
    this.eventBus = eventBus;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected async onInitialize(): Promise<void> {
    this.authState = { authenticated: false, userId: '', credentialRef: '', scopes: [] };
    this.emit('ConnectorInitialized', { connectorId: this.id, version: this.version });
  }

  protected async onConnect(): Promise<void> {
    this.emit('ConnectorConnected', { connectorId: this.id });
  }

  protected async onAuthenticate(context: IConnectorContext): Promise<boolean> {
    const ref = context.credentials?.tokenRef ?? context.credentials?.apiKeyRef;
    if (!ref) {
      this.emit('ConnectorExecutionFailed', { reason: 'NO_CREDENTIAL_REF', userId: context.userId });
      return false;
    }
    this.authState = {
      authenticated: true,
      userId: context.userId,
      credentialRef: ref,
      authenticatedAt: new Date().toISOString(),
      scopes: [...context.grantedScopes],
    };
    this.emit('ConnectorInitialized', { event: 'AuthenticationValidated', userId: context.userId });
    return true;
  }

  protected async onDisconnect(_session: IConnectorSession): Promise<void> {
    this.authState = { authenticated: false, userId: '', credentialRef: '', scopes: [] };
    this.emit('ConnectorDisconnected', { connectorId: this.id });
  }

  protected async onShutdown(): Promise<void> {
    this.authState = { authenticated: false, userId: '', credentialRef: '', scopes: [] };
    this.emit('ConnectorShutdown', { connectorId: this.id });
  }

  // ── Action Dispatch ───────────────────────────────────────────────────────

  protected async onExecute(
    action: IConnectorAction,
    _context: IConnectorContext,
    _session: IConnectorSession,
  ): Promise<IConnectorResult> {
    const start = Date.now();
    const now = new Date().toISOString();
    const base = {
      id: `res_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      connectorId: this.id,
      executionId: action.executionId,
      correlationId: action.correlationId,
      requestId: action.requestId,
      attemptNumber: action.metadata.attemptNumber,
      completedAt: now,
      retryable: false,
      telemetry: { requestSentAt: now, responseReceivedAt: now, latencyMs: 0, retryCount: 0 },
    };

    let output: Record<string, unknown>;

    try {
      switch (action.actionId) {
        // Orgs
        case 'list_orgs':       output = this.execListOrgs(); break;
        case 'get_org':         output = this.execGetOrg(action); break;
        case 'list_users':      output = this.execListUsers(); break;
        case 'list_org_repos':  output = this.execListOrgRepos(action); break;
        // Repos
        case 'list_repos':      output = this.execListRepos(action); break;
        case 'get_repo':        output = this.execGetRepo(action); break;
        // Branches
        case 'list_branches':   output = this.execListBranches(action); break;
        case 'list_tags':       output = this.execListTags(action); break;
        // Tree / Files
        case 'browse_tree':     output = this.execBrowseTree(action); break;
        case 'read_file':       output = this.execReadFile(action); break;
        case 'read_blob':       output = this.execReadBlob(action); break;
        // Commits
        case 'list_commits':    output = this.execListCommits(action); break;
        case 'get_commit':      output = this.execGetCommit(action); break;
        case 'read_history':    output = this.execReadHistory(action); break;
        // PRs
        case 'list_prs':        output = this.execListPRs(action); break;
        case 'get_pr':          output = this.execGetPR(action); break;
        case 'list_pr_reviews': output = this.execListPRReviews(action); break;
        // Issues
        case 'list_issues':     output = this.execListIssues(action); break;
        case 'get_issue':       output = this.execGetIssue(action); break;
        // Workflows
        case 'list_workflows':      output = this.execListWorkflows(action); break;
        case 'list_workflow_runs':  output = this.execListWorkflowRuns(action); break;
        // Releases
        case 'list_releases':       output = this.execListReleases(action); break;
        case 'get_latest_release':  output = this.execGetLatestRelease(action); break;

        default:
          return {
            ...base, actionId: action.actionId, status: 'FAILED', latencyMs: Date.now() - start,
            error: { code: 'UNKNOWN_ACTION', message: `Action '${action.actionId}' not supported`, retryable: false, category: 'VALIDATION' as const, occurredAt: now },
            telemetry: { ...base.telemetry, latencyMs: Date.now() - start },
          };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ...base, actionId: action.actionId, status: 'FAILED', latencyMs: Date.now() - start,
        error: { code: 'EXECUTION_ERROR', message: msg, retryable: true, category: 'SERVER_ERROR' as const, occurredAt: now },
        telemetry: { ...base.telemetry, latencyMs: Date.now() - start },
      };
    }

    const latencyMs = Date.now() - start;
    return {
      ...base, actionId: action.actionId, status: 'SUCCESS', output, latencyMs,
      telemetry: { ...base.telemetry, latencyMs },
    };
  }

  // ── Action Implementations ────────────────────────────────────────────────

  private execListOrgs(): Record<string, unknown> {
    this.emit('ConnectorExecutionCompleted', { action: 'list_orgs', count: ORGS.length });
    return { orgs: ORGS, count: ORGS.length };
  }

  private execGetOrg(action: IConnectorAction): Record<string, unknown> {
    const login = String(action.input['org'] ?? '');
    const org = ORGS.find(o => o.login === login);
    if (!org) throw new Error(`Organization '${login}' not found`);
    return { org };
  }

  private execListUsers(): Record<string, unknown> {
    return { users: USERS, count: USERS.length };
  }

  private execListRepos(action: IConnectorAction): Record<string, unknown> {
    const org = String(action.input['org'] ?? '');
    const repos = org ? REPOS.filter(r => r.orgLogin === org) : REPOS;
    this.reposDiscovered = Math.max(this.reposDiscovered, repos.length);
    this.emit('ConnectorExecutionCompleted', { action: 'RepositoryDiscovered', count: repos.length });
    return { repos, count: repos.length };
  }

  private execListOrgRepos(action: IConnectorAction): Record<string, unknown> {
    const org = String(action.input['org'] ?? '');
    const repos = REPOS.filter(r => r.orgLogin === org);
    this.reposDiscovered = Math.max(this.reposDiscovered, repos.length);
    this.emit('ConnectorExecutionCompleted', { action: 'RepositoryDiscovered', count: repos.length, org });
    return { repos, count: repos.length };
  }

  private execGetRepo(action: IConnectorAction): Record<string, unknown> {
    const repoId = String(action.input['repoId'] ?? '');
    const name = String(action.input['repo'] ?? '');
    const repo = REPOS.find(r => r.id === repoId || r.name === name || r.fullName === name);
    if (!repo) throw new Error(`Repository not found`);
    this.emit('ConnectorExecutionCompleted', { action: 'RepositoryLoaded', repoId: repo.id });
    return { repo };
  }

  private execListBranches(action: IConnectorAction): Record<string, unknown> {
    const repoId = String(action.input['repoId'] ?? '');
    const branches = BRANCHES.filter(b => b.repoId === repoId);
    this.emit('ConnectorExecutionCompleted', { action: 'BranchLoaded', repoId, count: branches.length });
    return { branches, count: branches.length };
  }

  private execListTags(_action: IConnectorAction): Record<string, unknown> {
    const tags = RELEASES.map(r => ({ name: r.tagName, sha: `sha-tag-${r.id}`, repoId: r.repoId }));
    return { tags, count: tags.length };
  }

  private execBrowseTree(action: IConnectorAction): Record<string, unknown> {
    const repoId = String(action.input['repoId'] ?? '');
    const path = String(action.input['path'] ?? '');
    const all = TREES[repoId] ?? [];
    const entries = path
      ? all.filter(e => e.path.startsWith(path + '/') && !e.path.slice(path.length + 1).includes('/'))
      : all.filter(e => !e.path.includes('/'));
    return { tree: entries, path: path || '/', count: entries.length };
  }

  private execReadFile(action: IConnectorAction): Record<string, unknown> {
    const repoId = String(action.input['repoId'] ?? '');
    const path = String(action.input['path'] ?? '');
    const key = `${repoId}/${path}`;
    const file = FILE_CONTENTS[key];
    if (!file) throw new Error(`File '${path}' not found in repository`);
    this.filesRead++;
    this.emit('ConnectorExecutionCompleted', { action: 'FileRead', repoId, path });
    return { ...file };
  }

  private execReadBlob(action: IConnectorAction): Record<string, unknown> {
    const sha = String(action.input['sha'] ?? '');
    // Search all trees for matching blob
    for (const entries of Object.values(TREES)) {
      const e = entries.find(x => x.sha === sha && x.type === 'blob');
      if (e) return { sha, path: e.path, size: e.size ?? 0, encoding: 'utf-8', type: 'blob' };
    }
    throw new Error(`Blob '${sha}' not found`);
  }

  private execListCommits(action: IConnectorAction): Record<string, unknown> {
    const repoId = String(action.input['repoId'] ?? '');
    const branch = String(action.input['branch'] ?? '');
    const limit = Number(action.input['limit'] ?? 50);
    let commits = COMMITS.filter(c => c.repoId === repoId);
    if (branch) commits = commits.filter(c => c.branch === branch);
    commits = commits.slice(0, limit);
    this.commitsLoaded += commits.length;
    this.emit('ConnectorExecutionCompleted', { action: 'CommitLoaded', repoId, count: commits.length });
    return { commits, count: commits.length, repoId };
  }

  private execGetCommit(action: IConnectorAction): Record<string, unknown> {
    const sha = String(action.input['sha'] ?? '');
    const commit = COMMITS.find(c => c.sha === sha);
    if (!commit) throw new Error(`Commit '${sha}' not found`);
    this.emit('ConnectorExecutionCompleted', { action: 'CommitLoaded', sha });
    return { commit };
  }

  private execReadHistory(action: IConnectorAction): Record<string, unknown> {
    const repoId = String(action.input['repoId'] ?? '');
    const path = String(action.input['path'] ?? '');
    // Simulate: return commits that modified files matching the path pattern
    const history = COMMITS.filter(c => c.repoId === repoId && c.files > 0).slice(0, 20);
    return { history, path, count: history.length };
  }

  private execListPRs(action: IConnectorAction): Record<string, unknown> {
    const repoId = String(action.input['repoId'] ?? '');
    const state = String(action.input['state'] ?? 'all');
    let prs = PULL_REQUESTS.filter(p => repoId ? p.repoId === repoId : true);
    if (state !== 'all') prs = prs.filter(p => p.state === state);
    this.prsLoaded = Math.max(this.prsLoaded, prs.length);
    this.emit('ConnectorExecutionCompleted', { action: 'PullRequestLoaded', count: prs.length });
    return { pullRequests: prs, count: prs.length };
  }

  private execGetPR(action: IConnectorAction): Record<string, unknown> {
    const repoId = String(action.input['repoId'] ?? '');
    const num = Number(action.input['number'] ?? 0);
    const pr = PULL_REQUESTS.find(p => p.repoId === repoId && p.number === num);
    if (!pr) throw new Error(`PR #${num} not found in ${repoId}`);
    this.emit('ConnectorExecutionCompleted', { action: 'PullRequestLoaded', number: num });
    return { pullRequest: pr };
  }

  private execListPRReviews(action: IConnectorAction): Record<string, unknown> {
    const repoId = String(action.input['repoId'] ?? '');
    const num = Number(action.input['number'] ?? 0);
    const pr = PULL_REQUESTS.find(p => p.repoId === repoId && p.number === num);
    if (!pr) throw new Error(`PR #${num} not found`);
    const reviews = pr.reviewers.map((r, i) => ({
      id: `review-${num}-${i}`, reviewer: r,
      state: i < pr.approvals ? 'APPROVED' : 'COMMENTED',
      submittedAt: new Date().toISOString(),
    }));
    return { reviews, count: reviews.length };
  }

  private execListIssues(action: IConnectorAction): Record<string, unknown> {
    const repoId = String(action.input['repoId'] ?? '');
    const state = String(action.input['state'] ?? 'all');
    const label = String(action.input['label'] ?? '');
    let issues = ISSUES.filter(i => repoId ? i.repoId === repoId : true);
    if (state !== 'all') issues = issues.filter(i => i.state === state);
    if (label) issues = issues.filter(i => i.labels.includes(label));
    this.issuesLoaded = Math.max(this.issuesLoaded, issues.length);
    this.emit('ConnectorExecutionCompleted', { action: 'IssueLoaded', count: issues.length });
    return { issues, count: issues.length };
  }

  private execGetIssue(action: IConnectorAction): Record<string, unknown> {
    const repoId = String(action.input['repoId'] ?? '');
    const num = Number(action.input['number'] ?? 0);
    const issue = ISSUES.find(i => i.repoId === repoId && i.number === num);
    if (!issue) throw new Error(`Issue #${num} not found in ${repoId}`);
    this.emit('ConnectorExecutionCompleted', { action: 'IssueLoaded', number: num });
    return { issue };
  }

  private execListWorkflows(action: IConnectorAction): Record<string, unknown> {
    const repoId = String(action.input['repoId'] ?? '');
    const wfs = WORKFLOWS.filter(w => repoId ? w.repoId === repoId : true);
    this.workflowsLoaded = Math.max(this.workflowsLoaded, wfs.length);
    this.emit('ConnectorExecutionCompleted', { action: 'WorkflowLoaded', count: wfs.length });
    return { workflows: wfs, count: wfs.length };
  }

  private execListWorkflowRuns(action: IConnectorAction): Record<string, unknown> {
    const workflowId = String(action.input['workflowId'] ?? '');
    const limit = Number(action.input['limit'] ?? 20);
    const runs = WORKFLOW_RUNS.filter(r => workflowId ? r.workflowId === workflowId : true).slice(0, limit);
    return { runs, count: runs.length };
  }

  private execListReleases(action: IConnectorAction): Record<string, unknown> {
    const repoId = String(action.input['repoId'] ?? '');
    const rels = RELEASES.filter(r => repoId ? r.repoId === repoId : true);
    this.releasesLoaded = Math.max(this.releasesLoaded, rels.length);
    this.emit('ConnectorExecutionCompleted', { action: 'ReleaseLoaded', count: rels.length });
    return { releases: rels, count: rels.length };
  }

  private execGetLatestRelease(action: IConnectorAction): Record<string, unknown> {
    const repoId = String(action.input['repoId'] ?? '');
    const rels = RELEASES.filter(r => (repoId ? r.repoId === repoId : true) && !r.draft && !r.prerelease);
    if (rels.length === 0) throw new Error('No published release found');
    const latest = rels.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
    this.emit('ConnectorExecutionCompleted', { action: 'ReleaseLoaded', tagName: latest.tagName });
    return { release: latest };
  }

  // ── Health ────────────────────────────────────────────────────────────────

  protected async onHealthCheck(): Promise<IConnectorHealth> {
    return {
      connectorId: this.id,
      status: 'HEALTHY',
      details: `GitHub Connector v${this.version} — authenticated=${this.authState.authenticated}, repos=${this.reposDiscovered}, commits=${this.commitsLoaded}, prs=${this.prsLoaded}, issues=${this.issuesLoaded}`,
      checks: {
        initialized: !!this.initializedAt,
        connected: !!this.connectedAt,
        authenticated: this.authState.authenticated,
        storeIntact: REPOS.length >= 8 && COMMITS.length >= 200,
        rateLimitOk: true,
      },
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
    };
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  isAuthenticated(): boolean { return this.authState.authenticated; }
  getReposDiscovered(): number { return this.reposDiscovered; }
  getCommitsLoaded(): number { return this.commitsLoaded; }
  getFilesRead(): number { return this.filesRead; }
  getPRsLoaded(): number { return this.prsLoaded; }
  getIssuesLoaded(): number { return this.issuesLoaded; }
  getWorkflowsLoaded(): number { return this.workflowsLoaded; }

  ghStatistics() {
    return {
      ...this.statistics(),
      authenticated: this.authState.authenticated,
      authenticatedAt: this.authState.authenticatedAt,
      reposDiscovered: this.reposDiscovered,
      commitsLoaded: this.commitsLoaded,
      filesRead: this.filesRead,
      prsLoaded: this.prsLoaded,
      issuesLoaded: this.issuesLoaded,
      workflowsLoaded: this.workflowsLoaded,
      releasesLoaded: this.releasesLoaded,
    };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private emit(type: Parameters<RuntimeEventBus['emit']>[0], payload: Record<string, unknown> = {}): void {
    try { this.eventBus?.emit(type, this.id, payload); } catch { /* silent */ }
  }
}