/**
 * Base44Connector.ts
 * EF-32 — First Official MemoryOS Connector
 *
 * Implements read-only discovery, navigation, file reading, and synchronization
 * against Base44-hosted projects. Uses exclusively the Connector SDK.
 *
 * Lifecycle:  initialize → connect → authenticate → execute → disconnect → shutdown
 * Operations: WorkspaceDiscovery · ProjectDiscovery · DirectoryListing
 *             FileListing · FileRead · MetadataRead · ProjectSearch · Sync
 *
 * Security:   Zero Trust · Least Privilege · No secrets in logs · No persistent tokens
 *
 * EF-32 · 2026-07-12 · Version: 1.0.0
 */

import { BaseConnector } from '@/sdk/connector/BaseConnector';
import { BASE44_MANIFEST } from './Base44ConnectorManifest';
import { RuntimeEventBus } from '@/runtime/connectors/RuntimeEventBus';
import {
  WORKSPACES, PROJECTS, FILES, FILE_CONTENTS, SYNC_SNAPSHOTS,
} from './Base44Store';
import type { IConnectorAction } from '@/runtime/connectors/interfaces/IConnectorAction';
import type { IConnectorContext } from '@/runtime/connectors/interfaces/IConnectorContext';
import type { IConnectorSession } from '@/runtime/connectors/interfaces/IConnectorSession';
import type { IConnectorResult } from '@/runtime/connectors/interfaces/IConnectorResult';
import type { IConnectorHealth } from '@/runtime/connectors/interfaces/IConnectorHealth';

// ── Internal state types ─────────────────────────────────────────────────────

interface AuthState {
  authenticated: boolean;
  userId: string;
  credentialRef: string;
  authenticatedAt?: string;
}

interface SyncState {
  projectId: string;
  lastSyncAt: string;
  fileCount: number;
  changeCount: number;
}

// ── Base44Connector ──────────────────────────────────────────────────────────

export class Base44Connector extends BaseConnector {
  /** Optional external event bus — injected by caller, never required */
  private eventBus?: RuntimeEventBus;

  private authState: AuthState = { authenticated: false, userId: '', credentialRef: '' };
  private readonly syncStates = new Map<string, SyncState>();

  // Counters for telemetry
  private workspacesDiscovered = 0;
  private projectsDiscovered = 0;
  private filesRead = 0;
  private syncRuns = 0;

  constructor(eventBus?: RuntimeEventBus) {
    super(BASE44_MANIFEST);
    this.eventBus = eventBus;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected async onInitialize(): Promise<void> {
    this.authState = { authenticated: false, userId: '', credentialRef: '' };
    this.syncStates.clear();
    this.emit('ConnectorInitialized', { version: this.version });
  }

  protected async onConnect(): Promise<void> {
    // Simulate connection setup — no real HTTP
    this.emit('ConnectorConnected', { connectorId: this.id });
  }

  protected async onAuthenticate(context: IConnectorContext): Promise<boolean> {
    // Zero Trust: credential ref must exist
    const ref = context.credentials?.apiKeyRef;
    if (!ref) {
      this.emit('ConnectorExecutionFailed', { reason: 'NO_CREDENTIAL_REF', userId: context.userId });
      return false;
    }
    // Simulate validation: any non-empty ref is accepted in simulation mode
    this.authState = {
      authenticated: true,
      userId: context.userId,
      credentialRef: ref,
      authenticatedAt: new Date().toISOString(),
    };
    this.emit('ConnectorInitialized', { event: 'ConnectorAuthenticated', userId: context.userId, credentialRef: ref });
    return true;
  }

  protected async onDisconnect(_session: IConnectorSession): Promise<void> {
    this.authState = { authenticated: false, userId: '', credentialRef: '' };
    this.emit('ConnectorDisconnected', { connectorId: this.id });
  }

  protected async onShutdown(): Promise<void> {
    this.authState = { authenticated: false, userId: '', credentialRef: '' };
    this.syncStates.clear();
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
        case 'list_workspaces':   output = this.execListWorkspaces(); break;
        case 'get_workspace':     output = this.execGetWorkspace(action); break;
        case 'list_projects':     output = this.execListProjects(action); break;
        case 'get_project':       output = this.execGetProject(action); break;
        case 'search_projects':   output = this.execSearchProjects(action); break;
        case 'list_directory':    output = this.execListDirectory(action); break;
        case 'list_files':        output = this.execListFiles(action); break;
        case 'read_file':         output = await this.execReadFile(action); break;
        case 'get_file_metadata': output = this.execGetFileMetadata(action); break;
        case 'search_files':      output = this.execSearchFiles(action); break;
        case 'sync_status':       output = this.execSyncStatus(action); break;
        case 'list_changes':      output = this.execListChanges(action); break;
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

  // ── Action Implementations ───────────────────────────────────────────────

  private execListWorkspaces(): Record<string, unknown> {
    this.workspacesDiscovered = WORKSPACES.length;
    this.emit('ConnectorExecutionCompleted', { action: 'list_workspaces', count: WORKSPACES.length });
    return { workspaces: WORKSPACES, count: WORKSPACES.length };
  }

  private execGetWorkspace(action: IConnectorAction): Record<string, unknown> {
    const id = String(action.input['workspaceId'] ?? action.input['id'] ?? '');
    const ws = WORKSPACES.find(w => w.id === id);
    if (!ws) throw Object.assign(new Error(`Workspace '${id}' not found`), { statusCode: 404 });
    return { workspace: ws };
  }

  private execListProjects(action: IConnectorAction): Record<string, unknown> {
    const workspaceId = String(action.input['workspaceId'] ?? '');
    const projects = workspaceId
      ? PROJECTS.filter(p => p.workspaceId === workspaceId)
      : PROJECTS;
    this.projectsDiscovered = Math.max(this.projectsDiscovered, projects.length);
    this.emit('ConnectorExecutionCompleted', { action: 'list_projects', count: projects.length, workspaceId });
    return { projects, count: projects.length };
  }

  private execGetProject(action: IConnectorAction): Record<string, unknown> {
    const id = String(action.input['projectId'] ?? action.input['id'] ?? '');
    const proj = PROJECTS.find(p => p.id === id);
    if (!proj) throw Object.assign(new Error(`Project '${id}' not found`), { statusCode: 404 });
    this.emit('ConnectorExecutionCompleted', { action: 'get_project', projectId: id });
    return { project: proj };
  }

  private execSearchProjects(action: IConnectorAction): Record<string, unknown> {
    const q = String(action.input['query'] ?? '').toLowerCase();
    const tag = String(action.input['tag'] ?? '').toLowerCase();
    const results = PROJECTS.filter(p => {
      const matchName = !q || p.name.toLowerCase().includes(q) || p.slug.includes(q);
      const matchTag = !tag || p.tags.some(t => t.includes(tag));
      return matchName && matchTag;
    });
    return { projects: results, count: results.length, query: q };
  }

  private execListDirectory(action: IConnectorAction): Record<string, unknown> {
    const projectId = String(action.input['projectId'] ?? '');
    const dirPath = String(action.input['path'] ?? '');
    const allFiles = FILES[projectId] ?? [];
    const entries = dirPath
      ? allFiles.filter(f => f.path.startsWith(dirPath + '/') && !f.path.slice(dirPath.length + 1).includes('/'))
      : allFiles.filter(f => !f.path.includes('/'));
    this.emit('ConnectorExecutionCompleted', { action: 'list_directory', projectId, path: dirPath, count: entries.length });
    return { entries, path: dirPath || '/', count: entries.length };
  }

  private execListFiles(action: IConnectorAction): Record<string, unknown> {
    const projectId = String(action.input['projectId'] ?? '');
    const entries = (FILES[projectId] ?? []).filter(f => f.type === 'file');
    return { files: entries, count: entries.length, projectId };
  }

  private async execReadFile(action: IConnectorAction): Promise<Record<string, unknown>> {
    const projectId = String(action.input['projectId'] ?? '');
    const path = String(action.input['path'] ?? '');
    const key = `${projectId}/${path}`;

    const entry = FILES[projectId]?.find(f => f.path === path && f.type === 'file');
    if (!entry) throw Object.assign(new Error(`File '${path}' not found in project '${projectId}'`), { statusCode: 404 });

    const content = FILE_CONTENTS[key] ?? `// ${path} — content not available in simulation`;
    this.filesRead++;
    this.emit('ConnectorExecutionCompleted', { action: 'file.read', projectId, path, sizeBytes: entry.sizeBytes });

    return {
      path,
      content,
      encoding: entry.encoding,
      sizeBytes: entry.sizeBytes,
      modifiedAt: entry.modifiedAt,
      hash: entry.hash ?? '',
      mimeType: this.mimeType(entry.extension),
    };
  }

  private execGetFileMetadata(action: IConnectorAction): Record<string, unknown> {
    const projectId = String(action.input['projectId'] ?? '');
    const path = String(action.input['path'] ?? '');
    const entry = FILES[projectId]?.find(f => f.path === path);
    if (!entry) throw Object.assign(new Error(`File '${path}' not found`), { statusCode: 404 });
    return { metadata: entry };
  }

  private execSearchFiles(action: IConnectorAction): Record<string, unknown> {
    const projectId = String(action.input['projectId'] ?? '');
    const q = String(action.input['query'] ?? '').toLowerCase();
    const ext = String(action.input['extension'] ?? '').toLowerCase();
    const allFiles = (FILES[projectId] ?? []).filter(f => f.type === 'file');
    const matches = allFiles.filter(f => {
      const matchQ = !q || f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
      const matchExt = !ext || (f.extension ?? '') === ext || (f.extension ?? '').replace('.', '') === ext.replace('.', '');
      return matchQ && matchExt;
    });
    return { files: matches, count: matches.length, query: q, extension: ext };
  }

  private execSyncStatus(action: IConnectorAction): Record<string, unknown> {
    const projectId = String(action.input['projectId'] ?? '');
    const state = this.syncStates.get(projectId);
    const changes = SYNC_SNAPSHOTS[projectId] ?? [];
    return {
      projectId,
      lastSyncAt: state?.lastSyncAt ?? null,
      pendingChanges: changes.length,
      totalFiles: FILES[projectId]?.filter(f => f.type === 'file').length ?? 0,
      synced: !!state,
    };
  }

  private execListChanges(action: IConnectorAction): Record<string, unknown> {
    const projectId = String(action.input['projectId'] ?? '');
    const changes = SYNC_SNAPSHOTS[projectId] ?? [];
    const now = new Date().toISOString();

    this.syncRuns++;
    this.emit('ConnectorExecutionCompleted', { action: 'sync', projectId, changeCount: changes.length });

    if (!this.syncStates.has(projectId)) {
      this.emit('ConnectorExecutionStarted', { action: 'SynchronizationStarted', projectId });
    }

    this.syncStates.set(projectId, {
      projectId,
      lastSyncAt: now,
      fileCount: FILES[projectId]?.filter(f => f.type === 'file').length ?? 0,
      changeCount: changes.length,
    });

    const status = changes.length === 0 ? 'UP_TO_DATE' : 'CHANGES_DETECTED';
    this.emit('ConnectorExecutionCompleted', { action: 'SynchronizationCompleted', projectId, status, changeCount: changes.length });

    return {
      projectId,
      snapshotAt: now,
      status,
      changes,
      totalChanges: changes.length,
    };
  }

  // ── Health ────────────────────────────────────────────────────────────────

  protected async onHealthCheck(): Promise<IConnectorHealth> {
    return {
      connectorId: this.id,
      status: 'HEALTHY',
      details: `Base44 Connector v${this.version} — authenticated=${this.authState.authenticated}, filesRead=${this.filesRead}, syncRuns=${this.syncRuns}`,
      checks: {
        initialized: !!this.initializedAt,
        connected: !!this.connectedAt,
        authenticated: this.authState.authenticated,
        storeIntact: WORKSPACES.length > 0 && PROJECTS.length > 0,
      },
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
    };
  }

  // ── Accessors (for tests / dashboard) ────────────────────────────────────

  isAuthenticated(): boolean { return this.authState.authenticated; }
  getWorkspacesDiscovered(): number { return this.workspacesDiscovered; }
  getProjectsDiscovered(): number { return this.projectsDiscovered; }
  getFilesRead(): number { return this.filesRead; }
  getSyncRuns(): number { return this.syncRuns; }
  getSyncStates(): Map<string, SyncState> { return new Map(this.syncStates); }

  b44Statistics() {
    return {
      ...this.statistics(),
      workspacesDiscovered: this.workspacesDiscovered,
      projectsDiscovered: this.projectsDiscovered,
      filesRead: this.filesRead,
      syncRuns: this.syncRuns,
      authenticated: this.authState.authenticated,
      authenticatedAt: this.authState.authenticatedAt,
      syncStates: this.syncRuns,
    };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private emit(type: Parameters<RuntimeEventBus['emit']>[0], payload: Record<string, unknown> = {}): void {
    try { this.eventBus?.emit(type, this.id, payload); } catch { /* event bus errors must never crash the connector */ }
  }

  private mimeType(ext?: string): string {
    const map: Record<string, string> = {
      '.jsx': 'text/jsx', '.tsx': 'text/tsx', '.ts': 'text/typescript',
      '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
      '.json': 'application/json', '.md': 'text/markdown',
    };
    return map[ext ?? ''] ?? 'text/plain';
  }
}