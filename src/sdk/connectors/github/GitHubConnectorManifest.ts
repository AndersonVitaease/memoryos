/**
 * GitHubConnectorManifest.ts
 * EF-33A — GitHub Connector Foundation · Manifest Definition
 * Built exclusively via ConnectorBuilder (SDK-only, read-only).
 * EF-33A · 2026-07-12 · Version: 1.0.0
 */

import { ConnectorBuilder } from '@/sdk/connector/ConnectorBuilder';
import type { IConnectorManifest } from '@/runtime/connectors/interfaces/IConnectorManifest';

export const GITHUB_MANIFEST: IConnectorManifest = new ConnectorBuilder(
  'github-connector-v1',
  '1.0.0',
  'GitHub Connector',
)
  .setDescription(
    'Second official MemoryOS connector (EF-33A). Enables discovery, navigation, and reading from GitHub: ' +
    'organizations, repositories, branches, commits, pull requests, issues, workflows, releases, and file trees. ' +
    'Read-only. No write operations in this version.',
  )
  .setOwner('MemoryOS Engineering Team')
  .setCategory('integration')
  .addTag('github')
  .addTag('vcs')
  .addTag('discovery')
  .addTag('read-only')
  .addTag('ef-33a')
  // ── Auth ────────────────────────────────────────────────────────────────
  .setAuth({
    type: 'bearer',
    bearer: {
      headerName: 'Authorization',
      prefix: 'token ',
      tokenRotation: 'manual',
      secretName: 'github_personal_access_token',
    },
  } as any)
  // ── Scopes ──────────────────────────────────────────────────────────────
  .addScope({ id: 'repo.read', name: 'Read Repositories', description: 'List and read public/private repos', required: true, sensitiveData: false, capabilities: ['list_repos', 'get_repo', 'list_branches', 'list_tags', 'browse_tree', 'read_file', 'read_blob'] })
  .addScope({ id: 'org.read', name: 'Read Organizations', description: 'List orgs and members (public)', required: false, sensitiveData: false, capabilities: ['list_orgs', 'get_org', 'list_org_repos', 'list_users'] })
  .addScope({ id: 'commit.read', name: 'Read Commits', description: 'Browse commit history', required: false, sensitiveData: false, capabilities: ['list_commits', 'get_commit', 'read_history'] })
  .addScope({ id: 'pr.read', name: 'Read Pull Requests', description: 'List and read pull requests', required: false, sensitiveData: false, capabilities: ['list_prs', 'get_pr', 'list_pr_reviews', 'list_pr_checks'] })
  .addScope({ id: 'issue.read', name: 'Read Issues', description: 'List and read issues', required: false, sensitiveData: false, capabilities: ['list_issues', 'get_issue', 'list_issue_comments'] })
  .addScope({ id: 'actions.read', name: 'Read Workflows', description: 'List workflows and runs (no dispatch)', required: false, sensitiveData: false, capabilities: ['list_workflows', 'list_workflow_runs', 'get_workflow', 'get_run_logs_metadata'] })
  .addScope({ id: 'release.read', name: 'Read Releases', description: 'List releases, tags, assets', required: false, sensitiveData: false, capabilities: ['list_releases', 'get_latest_release', 'list_tags', 'list_release_assets'] })
  // ── Permissions ─────────────────────────────────────────────────────────
  .addPermission({ action: 'list_orgs', scope: 'org.read', description: 'List accessible organizations', sensitive: false })
  .addPermission({ action: 'get_org', scope: 'org.read', description: 'Get org metadata', sensitive: false })
  .addPermission({ action: 'list_org_repos', scope: 'org.read', description: 'List repos in org', sensitive: false })
  .addPermission({ action: 'list_users', scope: 'org.read', description: 'List GitHub users', sensitive: false })
  .addPermission({ action: 'list_repos', scope: 'repo.read', description: 'List repositories', sensitive: false })
  .addPermission({ action: 'get_repo', scope: 'repo.read', description: 'Get repository metadata', sensitive: false })
  .addPermission({ action: 'list_branches', scope: 'repo.read', description: 'List branches in a repo', sensitive: false })
  .addPermission({ action: 'list_tags', scope: 'repo.read', description: 'List tags', sensitive: false })
  .addPermission({ action: 'browse_tree', scope: 'repo.read', description: 'Browse repository file tree', sensitive: false })
  .addPermission({ action: 'read_file', scope: 'repo.read', description: 'Read file content', sensitive: false })
  .addPermission({ action: 'read_blob', scope: 'repo.read', description: 'Read raw blob by SHA', sensitive: false })
  .addPermission({ action: 'list_commits', scope: 'commit.read', description: 'List commits on a branch', sensitive: false })
  .addPermission({ action: 'get_commit', scope: 'commit.read', description: 'Get single commit detail', sensitive: false })
  .addPermission({ action: 'read_history', scope: 'commit.read', description: 'Read file history', sensitive: false })
  .addPermission({ action: 'list_prs', scope: 'pr.read', description: 'List pull requests', sensitive: false })
  .addPermission({ action: 'get_pr', scope: 'pr.read', description: 'Get PR detail', sensitive: false })
  .addPermission({ action: 'list_pr_reviews', scope: 'pr.read', description: 'List PR reviews', sensitive: false })
  .addPermission({ action: 'list_issues', scope: 'issue.read', description: 'List issues', sensitive: false })
  .addPermission({ action: 'get_issue', scope: 'issue.read', description: 'Get issue detail', sensitive: false })
  .addPermission({ action: 'list_workflows', scope: 'actions.read', description: 'List workflows', sensitive: false })
  .addPermission({ action: 'list_workflow_runs', scope: 'actions.read', description: 'List workflow runs', sensitive: false })
  .addPermission({ action: 'list_releases', scope: 'release.read', description: 'List releases', sensitive: false })
  .addPermission({ action: 'get_latest_release', scope: 'release.read', description: 'Get latest release', sensitive: false })
  // ── Rate Limits ─────────────────────────────────────────────────────────
  .addRateLimit({ id: 'global', description: 'GitHub API rate limit', limit: 5000, windowSeconds: 3600, scope: 'global', strategy: 'token_bucket', onExceeded: 'retry_after', retryAfterSeconds: 60 })
  .addRateLimit({ id: 'search', description: 'GitHub Search API limit', limit: 30, windowSeconds: 60, scope: 'per_action', strategy: 'sliding_window', onExceeded: 'retry_after', retryAfterSeconds: 10 })
  // ── Actions (all read-only) ──────────────────────────────────────────────
  .addAction({ id: 'list_orgs', name: 'List Organizations', description: 'Returns all accessible orgs', method: 'GET', endpoint: '/user/orgs', requiredScopes: ['org.read'], idempotent: true, sideEffects: [], paginated: true, paginationStrategy: 'cursor' })
  .addAction({ id: 'get_org', name: 'Get Organization', description: 'Returns org metadata', method: 'GET', endpoint: '/orgs/:org', requiredScopes: ['org.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'list_users', name: 'List Users', description: 'Returns GitHub users', method: 'GET', endpoint: '/users', requiredScopes: ['org.read'], idempotent: true, sideEffects: [], paginated: true, paginationStrategy: 'cursor' })
  .addAction({ id: 'list_repos', name: 'List Repositories', description: 'Lists repos accessible to the token', method: 'GET', endpoint: '/user/repos', requiredScopes: ['repo.read'], idempotent: true, sideEffects: [], paginated: true, paginationStrategy: 'cursor' })
  .addAction({ id: 'list_org_repos', name: 'List Org Repos', description: 'Lists repos in an org', method: 'GET', endpoint: '/orgs/:org/repos', requiredScopes: ['org.read', 'repo.read'], idempotent: true, sideEffects: [], paginated: true, paginationStrategy: 'cursor' })
  .addAction({ id: 'get_repo', name: 'Get Repository', description: 'Returns repo metadata', method: 'GET', endpoint: '/repos/:owner/:repo', requiredScopes: ['repo.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'list_branches', name: 'List Branches', description: 'Lists branches in a repo', method: 'GET', endpoint: '/repos/:owner/:repo/branches', requiredScopes: ['repo.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'list_tags', name: 'List Tags', description: 'Lists tags in a repo', method: 'GET', endpoint: '/repos/:owner/:repo/tags', requiredScopes: ['repo.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'browse_tree', name: 'Browse Tree', description: 'Lists file tree at a path/ref', method: 'GET', endpoint: '/repos/:owner/:repo/git/trees/:sha', requiredScopes: ['repo.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'read_file', name: 'Read File', description: 'Reads file content at a path', method: 'GET', endpoint: '/repos/:owner/:repo/contents/:path', requiredScopes: ['repo.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'read_blob', name: 'Read Blob', description: 'Reads raw blob by SHA', method: 'GET', endpoint: '/repos/:owner/:repo/git/blobs/:sha', requiredScopes: ['repo.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'list_commits', name: 'List Commits', description: 'Lists commits on a branch/path', method: 'GET', endpoint: '/repos/:owner/:repo/commits', requiredScopes: ['repo.read', 'commit.read'], idempotent: true, sideEffects: [], paginated: true, paginationStrategy: 'cursor' })
  .addAction({ id: 'get_commit', name: 'Get Commit', description: 'Returns a single commit', method: 'GET', endpoint: '/repos/:owner/:repo/commits/:sha', requiredScopes: ['repo.read', 'commit.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'read_history', name: 'Read File History', description: 'Lists commits touching a file', method: 'GET', endpoint: '/repos/:owner/:repo/commits?path=:path', requiredScopes: ['repo.read', 'commit.read'], idempotent: true, sideEffects: [], paginated: true, paginationStrategy: 'cursor' })
  .addAction({ id: 'list_prs', name: 'List Pull Requests', description: 'Lists PRs filtered by state', method: 'GET', endpoint: '/repos/:owner/:repo/pulls', requiredScopes: ['repo.read', 'pr.read'], idempotent: true, sideEffects: [], paginated: true, paginationStrategy: 'cursor' })
  .addAction({ id: 'get_pr', name: 'Get Pull Request', description: 'Returns a single PR', method: 'GET', endpoint: '/repos/:owner/:repo/pulls/:number', requiredScopes: ['repo.read', 'pr.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'list_pr_reviews', name: 'List PR Reviews', description: 'Lists reviews for a PR', method: 'GET', endpoint: '/repos/:owner/:repo/pulls/:number/reviews', requiredScopes: ['repo.read', 'pr.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'list_issues', name: 'List Issues', description: 'Lists issues filtered by state', method: 'GET', endpoint: '/repos/:owner/:repo/issues', requiredScopes: ['repo.read', 'issue.read'], idempotent: true, sideEffects: [], paginated: true, paginationStrategy: 'cursor' })
  .addAction({ id: 'get_issue', name: 'Get Issue', description: 'Returns a single issue', method: 'GET', endpoint: '/repos/:owner/:repo/issues/:number', requiredScopes: ['repo.read', 'issue.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'list_workflows', name: 'List Workflows', description: 'Lists GitHub Actions workflows', method: 'GET', endpoint: '/repos/:owner/:repo/actions/workflows', requiredScopes: ['actions.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'list_workflow_runs', name: 'List Workflow Runs', description: 'Lists runs for a workflow', method: 'GET', endpoint: '/repos/:owner/:repo/actions/workflows/:id/runs', requiredScopes: ['actions.read'], idempotent: true, sideEffects: [], paginated: true, paginationStrategy: 'cursor' })
  .addAction({ id: 'list_releases', name: 'List Releases', description: 'Lists releases in a repo', method: 'GET', endpoint: '/repos/:owner/:repo/releases', requiredScopes: ['release.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'get_latest_release', name: 'Get Latest Release', description: 'Returns the latest published release', method: 'GET', endpoint: '/repos/:owner/:repo/releases/latest', requiredScopes: ['release.read'], idempotent: true, sideEffects: [], paginated: false })
  // ── Webhook ──────────────────────────────────────────────────────────────
  .addWebhook({ id: 'push', eventType: 'github.push', description: 'Fired on push to any branch', signatureVerification: { enabled: true, algorithm: 'hmac-sha256', headerName: 'X-Hub-Signature-256', secretName: 'github_webhook_secret' }, deliveryGuarantee: 'at_least_once' })
  .addWebhook({ id: 'pull_request', eventType: 'github.pull_request', description: 'Fired on PR open/update/close', signatureVerification: { enabled: true, algorithm: 'hmac-sha256', headerName: 'X-Hub-Signature-256', secretName: 'github_webhook_secret' }, deliveryGuarantee: 'at_least_once' })
  // ── Policy ───────────────────────────────────────────────────────────────
  .setHealthCheck({ endpoint: 'https://api.github.com/rate_limit', method: 'GET', expectedStatusCode: 200, timeoutMs: 500, intervalSeconds: 60, failureThreshold: 3, successThreshold: 1 })
  .setRetryPolicy({ maxAttempts: 3, strategy: 'exponential', delayMs: 500, maxDelayMs: 10000, jitter: true, retryOnStatusCodes: [429, 500, 502, 503, 504], dontRetryOnStatusCodes: [400, 401, 403, 404, 422] })
  .setCircuitBreaker({ enabled: true, failureThreshold: 5, successThreshold: 2, timeoutSeconds: 60, monitoringWindowSeconds: 120 })
  .setTelemetry({ trackRequestPayload: false, trackResponsePayload: false, logLevel: 'error', emitEvents: ['github.push', 'github.pull_request'], customMetrics: ['repos_discovered', 'commits_loaded', 'files_read', 'prs_loaded', 'issues_loaded', 'workflows_loaded'], sensitiveFields: ['github_personal_access_token', 'token', 'secret', 'authorization'] })
  .setAuditLevel('full')
  .build();