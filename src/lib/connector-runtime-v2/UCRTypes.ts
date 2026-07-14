/**
 * UCRTypes.ts
 * Sprint 6.4.1 — Universal Connector Runtime
 *
 * Single source of truth for all types, enums, and contracts.
 * Principles: SRP · Immutability · Zero Circular Dependencies · Multi-Tenant Ready
 */

// ─── Connector Lifecycle ──────────────────────────────────────────────────────

export type ConnectorLifecycleState =
  | 'REGISTERED'
  | 'INITIALIZED'
  | 'READY'
  | 'BUSY'
  | 'SUSPENDED'
  | 'FAILED'
  | 'STOPPED';

export const CONNECTOR_LIFECYCLE_TRANSITIONS: Record<ConnectorLifecycleState, ConnectorLifecycleState[]> = {
  REGISTERED:  ['INITIALIZED', 'FAILED'],
  INITIALIZED: ['READY', 'FAILED'],
  READY:       ['BUSY', 'SUSPENDED', 'STOPPED', 'FAILED'],
  BUSY:        ['READY', 'FAILED', 'SUSPENDED'],
  SUSPENDED:   ['READY', 'STOPPED', 'FAILED'],
  FAILED:      ['REGISTERED', 'STOPPED'],
  STOPPED:     ['REGISTERED'],
};

// ─── Connection State ─────────────────────────────────────────────────────────

export type ConnectionState =
  | 'PENDING'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'REVOKED'
  | 'ERROR'
  | 'DISCONNECTED';

// ─── Connector Category ───────────────────────────────────────────────────────

export type ConnectorCategory =
  | 'email'
  | 'calendar'
  | 'storage'
  | 'communication'
  | 'crm'
  | 'development'
  | 'productivity'
  | 'social'
  | 'analytics'
  | 'other';

// ─── Capabilities ─────────────────────────────────────────────────────────────

export type ConnectorCapability =
  | 'READ_EMAIL'
  | 'SEND_EMAIL'
  | 'READ_CALENDAR'
  | 'CREATE_EVENT'
  | 'UPDATE_EVENT'
  | 'DELETE_EVENT'
  | 'READ_DRIVE'
  | 'UPLOAD_FILE'
  | 'DOWNLOAD_FILE'
  | 'DELETE_FILE'
  | 'SEARCH'
  | 'READ_CONTACTS'
  | 'WRITE_CONTACTS'
  | 'READ_MESSAGES'
  | 'SEND_MESSAGE'
  | 'READ_CHANNELS'
  | 'WEBHOOK'
  | 'BATCH'
  | 'REALTIME';

// ─── Connector Event Bus Types ────────────────────────────────────────────────

export type ConnectorEventType =
  | 'CONNECTOR_REGISTERED'
  | 'CONNECTOR_INITIALIZED'
  | 'CONNECTOR_STOPPED'
  | 'CONNECTOR_FAILED'
  | 'SESSION_STARTED'
  | 'SESSION_ENDED'
  | 'REQUEST_STARTED'
  | 'REQUEST_COMPLETED'
  | 'REQUEST_FAILED'
  | 'HEALTH_CHANGED'
  | 'CAPABILITY_UPDATED'
  | 'CONNECTION_ADDED'
  | 'CONNECTION_REMOVED';

export interface ConnectorEvent {
  id:            string;
  timestamp:     string;
  eventType:     ConnectorEventType;
  connectorId:   string;
  connectionId:  string;
  organizationId: string;
  requestId:     string;
  correlationId: string;
  actor:         string;
  payload:       Record<string, unknown>;
  status:        'SUCCESS' | 'FAILURE' | 'PENDING';
}

// ─── Connector Manifest ───────────────────────────────────────────────────────

export interface ConnectorAuthentication {
  type:       'oauth2' | 'api_key' | 'basic' | 'bearer' | 'none';
  flows?:     string[];
  scopes?:    string[];
  required:   boolean;
}

export interface ConnectorOperation {
  id:          string;
  name:        string;
  description: string;
  capability:  ConnectorCapability;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  requiresAuth: boolean;
  rateLimit?:  { requests: number; windowMs: number };
}

export interface ConnectorHealthCheck {
  id:       string;
  name:     string;
  intervalMs: number;
  timeoutMs:  number;
  critical: boolean;
}

export interface ConnectorManifest {
  id:             string;
  name:           string;
  version:        string;
  vendor:         string;
  category:       ConnectorCategory;
  description:    string;
  icon:           string;
  tags:           string[];
  authentication: ConnectorAuthentication;
  capabilities:   ConnectorCapability[];
  operations:     ConnectorOperation[];
  permissions:    string[];
  healthChecks:   ConnectorHealthCheck[];
  documentation:  string;
  federation?:    { type: 'workspace' | 'organization' | 'enterprise'; supported: boolean };
}

// ─── Connection Record ────────────────────────────────────────────────────────

export interface ConnectionRecord {
  connectionId:   string;
  providerId:     string;
  connectorId:    string;
  organizationId: string;
  workspaceId:    string;
  accountId:      string;
  displayName:    string;
  email:          string;
  state:          ConnectionState;
  scopes:         string[];
  health:         'healthy' | 'degraded' | 'unavailable' | 'unknown';
  lastSync:       string | null;
  expiresAt:      string | null;
  createdAt:      string;
  metadata:       Record<string, unknown>;
}

// ─── Connector Context ────────────────────────────────────────────────────────

export interface ConnectorContext {
  organizationId: string;
  workspaceId:    string;
  userId:         string;
  connectionId:   string;
  connectorId:    string;
  providerId:     string;
  requestId:      string;
  correlationId:  string;
  permissions:    string[];
  metadata:       Record<string, unknown>;
}

// ─── Execution ────────────────────────────────────────────────────────────────

export interface ExecuteRequest {
  operationId:  string;
  context:      ConnectorContext;
  input:        Record<string, unknown>;
  timeout?:     number;
}

export interface ExecuteResult {
  success:      boolean;
  operationId:  string;
  connectionId: string;
  output:       unknown;
  durationMs:   number;
  error?:       string;
  metadata?:    Record<string, unknown>;
}

// ─── Routing ──────────────────────────────────────────────────────────────────

export interface RouteQuery {
  connectorId?:    string;
  providerId?:     string;
  capability?:     ConnectorCapability;
  organizationId?: string;
  workspaceId?:    string;
  connectionId?:   string;
  all?:            boolean; // select ALL matching connections (for fan-out)
}

export interface RouteResult {
  connections:    ConnectionRecord[];
  strategy:       'single' | 'fan_out';
  reason:         string;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export interface ConnectorHealthReport {
  connectorId:  string;
  status:       'healthy' | 'degraded' | 'unavailable';
  latencyMs:    number;
  availability: number; // 0–1
  lastSuccess:  string | null;
  lastFailure:  string | null;
  uptimeMs:     number;
  checkedAt:    string;
  details:      Record<string, unknown>;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface ConnectorMetrics {
  connectorId:      string;
  totalRequests:    number;
  successRequests:  number;
  failedRequests:   number;
  avgLatencyMs:     number;
  throughput:       number; // req/min
  activeConnections: number;
  activeSessions:   number;
  cacheHits:        number;
  cacheMisses:      number;
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface ConnectorAuditRecord {
  id:            string;
  timestamp:     string;
  connectorId:   string;
  connectionId:  string;
  userId:        string;
  organizationId: string;
  operationId:   string;
  outcome:       'success' | 'failure' | 'pending';
  durationMs:    number;
  error?:        string;
  metadata:      Record<string, unknown>;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface ConnectorSession {
  id:            string;
  connectorId:   string;
  connectionId:  string;
  context:       ConnectorContext;
  startedAt:     string;
  lastActiveAt:  string;
  expiresAt:     string;
  state:         'active' | 'idle' | 'expired';
  cache:         Map<string, { value: unknown; expiresAt: string }>;
}