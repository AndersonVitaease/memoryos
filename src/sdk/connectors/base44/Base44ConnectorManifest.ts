/**
 * Base44ConnectorManifest.ts
 * EF-32 — Base44 Connector · Manifest Definition
 * Built exclusively via ConnectorBuilder (SDK only).
 * EF-32 · 2026-07-12 · Version: 1.0.0
 */

import { ConnectorBuilder } from '@/sdk/connector/ConnectorBuilder';
import type { IConnectorManifest } from '@/runtime/connectors/interfaces/IConnectorManifest';

export const BASE44_MANIFEST: IConnectorManifest = new ConnectorBuilder(
  'base44-connector-v1',
  '1.0.0',
  'Base44 Connector',
)
  .setDescription(
    'First official MemoryOS connector. Enables workspace discovery, project navigation, and file reading ' +
    'from Base44-hosted projects. Read-only. No destructive operations in this version.',
  )
  .setOwner('MemoryOS Engineering Team')
  .setCategory('utility')
  .addTag('base44')
  .addTag('workspace')
  .addTag('discovery')
  .addTag('read-only')
  .addTag('ef-32')
  .setAuth({
    type: 'apikey',
    apikey: { headerName: 'X-Base44-Key', rotationPolicy: 'manual', secretName: 'base44_api_key' },
  })
  // ── Scopes ────────────────────────────────────────────────────
  .addScope({
    id: 'workspace.read',
    name: 'Read Workspaces',
    description: 'List and inspect Base44 workspaces',
    required: true,
    sensitiveData: false,
    capabilities: ['list_workspaces', 'get_workspace'],
  })
  .addScope({
    id: 'project.read',
    name: 'Read Projects',
    description: 'Discover and inspect projects within a workspace',
    required: true,
    sensitiveData: false,
    capabilities: ['list_projects', 'get_project', 'search_projects'],
  })
  .addScope({
    id: 'files.read',
    name: 'Read Files',
    description: 'List directories and read file contents',
    required: false,
    sensitiveData: false,
    capabilities: ['list_directory', 'list_files', 'read_file', 'get_file_metadata'],
  })
  .addScope({
    id: 'sync.read',
    name: 'Read Sync State',
    description: 'Detect file changes for read-only synchronization',
    required: false,
    sensitiveData: false,
    capabilities: ['sync_status', 'list_changes'],
  })
  // ── Permissions ───────────────────────────────────────────────
  .addPermission({ action: 'list_workspaces', scope: 'workspace.read', description: 'List all accessible workspaces', sensitive: false })
  .addPermission({ action: 'get_workspace', scope: 'workspace.read', description: 'Get workspace metadata', sensitive: false })
  .addPermission({ action: 'list_projects', scope: 'project.read', description: 'List projects in workspace', sensitive: false })
  .addPermission({ action: 'get_project', scope: 'project.read', description: 'Get project metadata', sensitive: false })
  .addPermission({ action: 'search_projects', scope: 'project.read', description: 'Search projects by name', sensitive: false })
  .addPermission({ action: 'list_directory', scope: 'files.read', description: 'List directory contents', sensitive: false })
  .addPermission({ action: 'list_files', scope: 'files.read', description: 'List all files in a project', sensitive: false })
  .addPermission({ action: 'read_file', scope: 'files.read', description: 'Read file content', sensitive: false })
  .addPermission({ action: 'get_file_metadata', scope: 'files.read', description: 'Read file metadata', sensitive: false })
  .addPermission({ action: 'search_files', scope: 'files.read', description: 'Search files by name or extension', sensitive: false })
  .addPermission({ action: 'sync_status', scope: 'sync.read', description: 'Get current sync status', sensitive: false })
  .addPermission({ action: 'list_changes', scope: 'sync.read', description: 'List detected changes since last sync', sensitive: false })
  // ── Rate Limits ───────────────────────────────────────────────
  .addRateLimit({ id: 'global', description: 'Global rate limit', limit: 200, windowSeconds: 60, scope: 'global', strategy: 'token_bucket', onExceeded: 'retry_after', retryAfterSeconds: 5 })
  .addRateLimit({ id: 'file_read', description: 'Per-file read rate limit', limit: 50, windowSeconds: 60, scope: 'per_action', strategy: 'sliding_window', onExceeded: 'retry_after', retryAfterSeconds: 2 })
  // ── Actions (read-only) ───────────────────────────────────────
  .addAction({ id: 'list_workspaces', name: 'List Workspaces', description: 'Returns all accessible workspaces', method: 'GET', endpoint: '/api/workspaces', requiredScopes: ['workspace.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'get_workspace', name: 'Get Workspace', description: 'Returns workspace metadata by id', method: 'GET', endpoint: '/api/workspaces/:id', requiredScopes: ['workspace.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'list_projects', name: 'List Projects', description: 'Lists all projects in a workspace', method: 'GET', endpoint: '/api/workspaces/:workspaceId/projects', requiredScopes: ['workspace.read', 'project.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'get_project', name: 'Get Project', description: 'Returns project metadata', method: 'GET', endpoint: '/api/projects/:id', requiredScopes: ['project.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'search_projects', name: 'Search Projects', description: 'Search projects by name or tag', method: 'GET', endpoint: '/api/projects/search', requiredScopes: ['project.read'], idempotent: true, sideEffects: [], paginated: true, paginationStrategy: 'cursor' })
  .addAction({ id: 'list_directory', name: 'List Directory', description: 'Lists entries in a project directory', method: 'GET', endpoint: '/api/projects/:projectId/files/ls', requiredScopes: ['project.read', 'files.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'list_files', name: 'List Files', description: 'Lists all files in a project recursively', method: 'GET', endpoint: '/api/projects/:projectId/files', requiredScopes: ['project.read', 'files.read'], idempotent: true, sideEffects: [], paginated: true, paginationStrategy: 'cursor' })
  .addAction({ id: 'read_file', name: 'Read File', description: 'Reads file content by path', method: 'GET', endpoint: '/api/projects/:projectId/files/read', requiredScopes: ['project.read', 'files.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'get_file_metadata', name: 'Get File Metadata', description: 'Returns file size, type, modified date, hash', method: 'GET', endpoint: '/api/projects/:projectId/files/meta', requiredScopes: ['project.read', 'files.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'search_files', name: 'Search Files', description: 'Search files by name, extension, or content', method: 'GET', endpoint: '/api/projects/:projectId/files/search', requiredScopes: ['project.read', 'files.read'], idempotent: true, sideEffects: [], paginated: true, paginationStrategy: 'cursor' })
  .addAction({ id: 'sync_status', name: 'Sync Status', description: 'Returns current sync state snapshot', method: 'GET', endpoint: '/api/projects/:projectId/sync/status', requiredScopes: ['project.read', 'sync.read'], idempotent: true, sideEffects: [], paginated: false })
  .addAction({ id: 'list_changes', name: 'List Changes', description: 'Returns file changes detected since last sync', method: 'GET', endpoint: '/api/projects/:projectId/sync/changes', requiredScopes: ['project.read', 'sync.read'], idempotent: true, sideEffects: [], paginated: false })
  // ── Webhook ───────────────────────────────────────────────────
  .addWebhook({ id: 'project_changed', eventType: 'base44.project.changed', description: 'Fired when a project structure changes', signatureVerification: { enabled: true, algorithm: 'hmac-sha256', headerName: 'X-Base44-Signature', secretName: 'base44_webhook_secret' }, deliveryGuarantee: 'at_least_once' })
  // ── Policy ────────────────────────────────────────────────────
  .setHealthCheck({ endpoint: '/api/health', method: 'GET', expectedStatusCode: 200, timeoutMs: 100, intervalSeconds: 30, failureThreshold: 3, successThreshold: 1 })
  .setRetryPolicy({ maxAttempts: 3, strategy: 'exponential', delayMs: 300, maxDelayMs: 8000, jitter: true, retryOnStatusCodes: [429, 500, 502, 503, 504], dontRetryOnStatusCodes: [400, 401, 403, 404, 422] })
  .setCircuitBreaker({ enabled: true, failureThreshold: 5, successThreshold: 2, timeoutSeconds: 60, monitoringWindowSeconds: 120 })
  .setTelemetry({ trackRequestPayload: false, trackResponsePayload: false, logLevel: 'error', emitEvents: ['base44.project.changed', 'base44.file.read'], customMetrics: ['workspace_count', 'project_count', 'file_read_count', 'sync_delta_count'], sensitiveFields: ['base44_api_key', 'token', 'secret', 'authorization', 'password'] })
  .setAuditLevel('full')
  .build();