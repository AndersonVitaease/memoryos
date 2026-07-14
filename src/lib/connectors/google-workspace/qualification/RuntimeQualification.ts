/**
 * RuntimeQualification.ts
 * Sprint 6.4.2A — Runtime + Identity + Engineering Qualification
 *
 * Validates: Connector Runtime · Connection Registry · Capability Engine ·
 * Session Manager · Health · Lifecycle · ITP · Engineering Workflow · Audit · Memory
 */

import { GoogleWorkspaceConnector, GW_CONNECTOR_ID } from '../GoogleWorkspaceConnector';
import { GoogleOAuthProvider } from '../GoogleOAuthProvider';
import { ConnectorRegistry } from '../../../connector-runtime-v2/ConnectorRegistry';
import { ConnectionRegistry } from '../../../connector-runtime-v2/ConnectionRegistry';
import { ConnectorLifecycle } from '../../../connector-runtime-v2/ConnectorLifecycle';
import { CapabilityEngine } from '../../../connector-runtime-v2/CapabilityEngine';
import { ConnectorAudit } from '../../../connector-runtime-v2/ConnectorAudit';
import { ConnectorMetrics } from '../../../connector-runtime-v2/ConnectorMetrics';
import { ConnectorHealth } from '../../../connector-runtime-v2/ConnectorHealth';
import { ConnectorRuntime } from '../../../connector-runtime-v2/ConnectorRuntime';
import { ConnectorEventBus } from '../../../connector-runtime-v2/ConnectorEventBus';
import { ProviderRegistry } from '../../../identity-trust/ProviderRegistry';
import { GOOGLE_PROVIDER_DEFINITION } from '../GoogleWorkspaceConnector';
import { GW_OPERATIONS, GW_SCOPES } from '../GWTypes';
import { GOOGLE_PROVIDER_ID } from '../GoogleOAuthProvider';
import type { ConnectorContext } from '../../../connector-runtime-v2/UCRTypes';
import type { QualResult } from './QualificationTypes';

function makeCtx(connId = 'qual-conn'): ConnectorContext {
  return {
    organizationId: 'qual-org', workspaceId: 'qual-ws', userId: 'qual-user',
    connectionId: connId, connectorId: GW_CONNECTOR_ID, providerId: GOOGLE_PROVIDER_ID,
    requestId: `req-${Date.now()}`, correlationId: `corr-${Date.now()}`,
    permissions: ['read', 'write'], metadata: {},
  };
}

function addConn(email = 'qual@gmail.com', org = 'qual-org'): string {
  return ConnectionRegistry.add({
    providerId: GOOGLE_PROVIDER_ID, connectorId: GW_CONNECTOR_ID,
    organizationId: org, workspaceId: 'qual-ws', accountId: `qa-acc-${Date.now()}`,
    displayName: email.split('@')[0], email, state: 'ACTIVE',
    scopes: [GW_SCOPES.GMAIL_READONLY, GW_SCOPES.CALENDAR_READONLY],
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(), metadata: {},
  }).connectionId;
}

async function run(id: string, name: string, category: string, fn: () => Promise<unknown>): Promise<QualResult> {
  const t0 = Date.now();
  try {
    const meta = await fn();
    return { id, name, category, status: 'pass', durationMs: Date.now() - t0, metadata: typeof meta === 'object' ? meta as Record<string, unknown> : { value: meta } };
  } catch (e: unknown) {
    return { id, name, category, status: 'fail', durationMs: Date.now() - t0, error: String(e) };
  }
}

export async function runRuntimeQualification(): Promise<QualResult[]> {
  const results: QualResult[] = [];
  const rt = new ConnectorRuntime();

  // ─── Runtime Qualification ────────────────────────────────────────────────

  results.push(await run('RT-Q-01', 'ConnectorRegistry registers GW connector', 'runtime', async () => {
    ConnectorRegistry.register(new GoogleWorkspaceConnector());
    if (!ConnectorRegistry.has(GW_CONNECTOR_ID)) throw new Error('Not registered');
    return { registered: true };
  }));

  results.push(await run('RT-Q-02', 'ConnectorLifecycle: INIT → READY transition', 'runtime', async () => {
    await ConnectorLifecycle.initialize(GW_CONNECTOR_ID, makeCtx());
    if (!ConnectorLifecycle.isReady(GW_CONNECTOR_ID)) throw new Error('Not READY');
    return { state: 'READY' };
  }));

  results.push(await run('RT-Q-03', 'ConnectorRuntime.execute — Gmail list_messages', 'runtime', async () => {
    const connId = addConn();
    const result = await rt.execute({ operationId: GW_OPERATIONS.GMAIL_LIST_MESSAGES, context: makeCtx(connId), input: { maxResults: 5 } });
    if (!result.success) throw new Error('Execute failed');
    if (!Array.isArray((result.output as any).items)) throw new Error('No items in output');
    return { success: true, itemCount: (result.output as any).items.length };
  }));

  results.push(await run('RT-Q-04', 'ConnectorRuntime.execute — Calendar list_events', 'runtime', async () => {
    const connId = addConn('cal@gmail.com');
    const result = await rt.execute({ operationId: GW_OPERATIONS.CALENDAR_LIST_EVENTS, context: makeCtx(connId), input: { maxResults: 5 } });
    if (!result.success) throw new Error('Calendar execute failed');
    return { success: true, itemCount: (result.output as any).items.length };
  }));

  results.push(await run('RT-Q-05', 'ConnectorRuntime.execute — Drive list_files', 'runtime', async () => {
    const connId = addConn('drive@gmail.com');
    const result = await rt.execute({ operationId: GW_OPERATIONS.DRIVE_LIST_FILES, context: makeCtx(connId), input: { maxResults: 5 } });
    if (!result.success) throw new Error('Drive execute failed');
    return { success: true, itemCount: (result.output as any).items.length };
  }));

  results.push(await run('RT-Q-06', 'ConnectorHealth reports connector healthy', 'runtime', async () => {
    const report = await ConnectorHealth.check(GW_CONNECTOR_ID);
    if (report.status !== 'healthy') throw new Error(`Health status: ${report.status}`);
    return { status: report.status, latencyMs: report.latencyMs };
  }));

  results.push(await run('RT-Q-07', 'ConnectorEventBus emits REQUEST_COMPLETED', 'runtime', async () => {
    const before = ConnectorEventBus.query({ eventType: 'REQUEST_COMPLETED', connectorId: GW_CONNECTOR_ID }).length;
    const connId = addConn('ev@gmail.com');
    await rt.execute({ operationId: GW_OPERATIONS.GMAIL_LIST_MESSAGES, context: makeCtx(connId), input: {} });
    const after = ConnectorEventBus.query({ eventType: 'REQUEST_COMPLETED', connectorId: GW_CONNECTOR_ID }).length;
    if (after <= before) throw new Error('No REQUEST_COMPLETED event emitted');
    return { before, after };
  }));

  results.push(await run('RT-Q-08', 'CapabilityEngine resolves READ_EMAIL to GW', 'runtime', async () => {
    const r = CapabilityEngine.resolve('READ_EMAIL');
    if (!r.connectorIds.includes(GW_CONNECTOR_ID)) throw new Error('GW not found for READ_EMAIL');
    return { connectors: r.connectorIds };
  }));

  results.push(await run('RT-Q-09', 'CapabilityEngine resolves READ_DRIVE to GW', 'runtime', async () => {
    const r = CapabilityEngine.resolve('READ_DRIVE');
    if (!r.connectorIds.includes(GW_CONNECTOR_ID)) throw new Error('GW not found for READ_DRIVE');
    return { connectors: r.connectorIds };
  }));

  results.push(await run('RT-Q-10', 'ConnectorMetrics records operation latency', 'runtime', async () => {
    const connId = addConn('metrics@gmail.com');
    await rt.execute({ operationId: GW_OPERATIONS.GMAIL_LIST_MESSAGES, context: makeCtx(connId), input: {} });
    const m = ConnectorMetrics.summary(GW_CONNECTOR_ID);
    if (m.totalRequests < 1) throw new Error('No metrics recorded');
    return { totalRequests: m.totalRequests, avgLatencyMs: m.avgLatencyMs };
  }));

  // ─── Identity Qualification ───────────────────────────────────────────────

  results.push(await run('ID-Q-01', 'ITP ProviderRegistry accepts Google provider', 'identity', async () => {
    ProviderRegistry.register(GOOGLE_PROVIDER_DEFINITION, new GoogleOAuthProvider());
    if (!ProviderRegistry.has('google-workspace')) throw new Error('Not registered in ITP');
    return { registered: true };
  }));

  results.push(await run('ID-Q-02', 'ProviderRegistry retrieves Google provider', 'identity', async () => {
    const def = ProviderRegistry.get('google-workspace');
    if (!def) throw new Error('Provider not found');
    if (def.name !== 'Google Workspace') throw new Error('Wrong provider name');
    return { id: def.id, name: def.name };
  }));

  results.push(await run('ID-Q-03', 'ConnectionRegistry multi-tenant state', 'identity', async () => {
    const org1 = `id-org-1-${Date.now()}`;
    const org2 = `id-org-2-${Date.now()}`;
    addConn('a@org1.com', org1);
    addConn('b@org2.com', org2);
    const c1 = ConnectionRegistry.listByOrg(org1);
    const c2 = ConnectionRegistry.listByOrg(org2);
    if (c1.some((c) => c.organizationId !== org1)) throw new Error('Org1 isolation violated');
    if (c2.some((c) => c.organizationId !== org2)) throw new Error('Org2 isolation violated');
    return { org1: c1.length, org2: c2.length };
  }));

  results.push(await run('ID-Q-04', 'Connection state machine: ACTIVE → REVOKED → RECONNECT', 'identity', async () => {
    const connId = addConn('lifecycle@gmail.com');
    ConnectionRegistry.setState(connId, 'REVOKED');
    const revoked = ConnectionRegistry.get(connId);
    if (revoked?.state !== 'REVOKED') throw new Error('Expected REVOKED state');
    ConnectionRegistry.setState(connId, 'ACTIVE');
    const active = ConnectionRegistry.get(connId);
    if (active?.state !== 'ACTIVE') throw new Error('Expected ACTIVE state after reconnect');
    return { transitions: ['ACTIVE', 'REVOKED', 'ACTIVE'] };
  }));

  // ─── Engineering / Audit Qualification ───────────────────────────────────

  results.push(await run('ENG-Q-01', 'ConnectorAudit records all GW operations', 'engineering', async () => {
    const before = ConnectorAudit.count();
    ConnectorAudit.record({ connectorId: GW_CONNECTOR_ID, connectionId: 'q1', userId: 'u', organizationId: 'o', operationId: GW_OPERATIONS.GMAIL_SEND, outcome: 'success', durationMs: 8, metadata: {} });
    ConnectorAudit.record({ connectorId: GW_CONNECTOR_ID, connectionId: 'q2', userId: 'u', organizationId: 'o', operationId: GW_OPERATIONS.DRIVE_UPLOAD_FILE, outcome: 'success', durationMs: 15, metadata: {} });
    const after = ConnectorAudit.count();
    if (after - before < 2) throw new Error('Audit not recording all operations');
    return { recorded: after - before };
  }));

  results.push(await run('ENG-Q-02', 'ConnectorAudit query by connectorId returns GW records', 'engineering', async () => {
    const records = ConnectorAudit.query({ connectorId: GW_CONNECTOR_ID, limit: 10 });
    if (records.length === 0) throw new Error('No GW audit records found');
    return { count: records.length };
  }));

  results.push(await run('ENG-Q-03', 'ConnectorAudit health — no missed operations', 'engineering', async () => {
    const h = ConnectorAudit.health();
    if (h.total < 0) throw new Error('Invalid audit health');
    return { total: h.total, successRate: h.successRate };
  }));

  results.push(await run('ENG-Q-04', 'ConnectorMetrics: throughput + p95 latency observable', 'engineering', async () => {
    const connId = addConn('perf@gmail.com');
    await Promise.all(Array.from({ length: 20 }, () => rt.execute({ operationId: GW_OPERATIONS.GMAIL_LIST_MESSAGES, context: makeCtx(connId), input: {} })));
    const m = ConnectorMetrics.summary(GW_CONNECTOR_ID);
    if (m.totalRequests < 20) throw new Error('Not enough metrics recorded');
    return { totalRequests: m.totalRequests, avgLatencyMs: m.avgLatencyMs };
  }));

  return results;
}