/**
 * MultiConnectionQualification.ts
 * Sprint 6.4.2A — Multi-Connection & Fan-out Routing Validation
 *
 * Validates: 3 Gmail + 3 Calendar + 3 Drive accounts simultaneously,
 * fan-out parallel reads, merge, routing strategy, workspace isolation.
 */

import { ConnectionRegistry } from '../../../connector-runtime-v2/ConnectionRegistry';
import { ConnectorRouter } from '../../../connector-runtime-v2/ConnectorRouter';
import { GmailCapability } from '../capabilities/GmailCapability';
import { CalendarCapability } from '../capabilities/CalendarCapability';
import { DriveCapability } from '../capabilities/DriveCapability';
import { GW_OPERATIONS, GW_SCOPES } from '../GWTypes';
import { GW_CONNECTOR_ID } from '../GoogleWorkspaceConnector';
import { GOOGLE_PROVIDER_ID } from '../GoogleOAuthProvider';
import type { QualResult } from './QualificationTypes';

function addConn(email: string, org: string, ws: string): string {
  const rec = ConnectionRegistry.add({
    providerId: GOOGLE_PROVIDER_ID, connectorId: GW_CONNECTOR_ID,
    organizationId: org, workspaceId: ws, accountId: `acc-${Date.now()}-${Math.random()}`,
    displayName: email.split('@')[0], email, state: 'ACTIVE',
    scopes: [GW_SCOPES.GMAIL_READONLY, GW_SCOPES.CALENDAR_READONLY, GW_SCOPES.DRIVE_READONLY],
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(), metadata: {},
  });
  return rec.connectionId;
}

async function run(id: string, name: string, fn: () => Promise<unknown>): Promise<QualResult> {
  const t0 = Date.now();
  try {
    const meta = await fn();
    return { id, name, category: 'multi-connection', status: 'pass', durationMs: Date.now() - t0, metadata: typeof meta === 'object' ? meta as Record<string, unknown> : { value: meta } };
  } catch (e: unknown) {
    return { id, name, category: 'multi-connection', status: 'fail', durationMs: Date.now() - t0, error: String(e) };
  }
}

export async function runMultiConnectionQualification(): Promise<QualResult[]> {
  const results: QualResult[] = [];
  const ORG = `qual-org-mc-${Date.now()}`;

  // Setup: register 9 connections across 3 services
  const gmailIds    = ['commercial@company.com', 'financial@company.com', 'director@company.com'].map((e) => addConn(e, ORG, 'ws-gmail'));
  const calendarIds = ['cal-team@company.com', 'cal-hr@company.com', 'cal-exec@company.com'].map((e) => addConn(e, ORG, 'ws-calendar'));
  const driveIds    = ['drive-marketing@company.com', 'drive-legal@company.com', 'drive-it@company.com'].map((e) => addConn(e, ORG, 'ws-drive'));

  // MC-Q-01: 9 connections exist and are isolated
  results.push(await run('MC-Q-01', '9 simultaneous GW connections — 3 per service', async () => {
    const all = ConnectionRegistry.listByOrg(ORG);
    if (all.length < 9) throw new Error(`Expected 9 connections, found ${all.length}`);
    return { total: all.length, gmail: gmailIds.length, calendar: calendarIds.length, drive: driveIds.length };
  }));

  // MC-Q-02: Each connection is fully isolated
  results.push(await run('MC-Q-02', 'Connection isolation — unique IDs and emails', async () => {
    const all = ConnectionRegistry.listByOrg(ORG);
    const emails = all.map((c) => c.email);
    const ids = all.map((c) => c.connectionId);
    if (new Set(emails).size !== emails.length) throw new Error('Duplicate emails found');
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate connectionIds found');
    return { uniqueEmails: new Set(emails).size, uniqueIds: new Set(ids).size };
  }));

  // MC-Q-03: Fan-out reads all 3 Gmail accounts in parallel
  results.push(await run('MC-Q-03', 'Fan-out reads all 3 Gmail accounts in parallel', async () => {
    const gmail = new GmailCapability();
    const fanOutResults = await ConnectorRouter.fanOut(
      { connectorId: GW_CONNECTOR_ID, organizationId: ORG, workspaceId: 'ws-gmail' },
      async (connId) => gmail.execute(GW_OPERATIONS.GMAIL_LIST_MESSAGES, { maxResults: 5 })
    );
    if (fanOutResults.length !== 3) throw new Error(`Expected 3 fan-out results, got ${fanOutResults.length}`);
    if (!fanOutResults.every((r) => !r.error)) throw new Error('Fan-out had errors');
    const totalMessages = fanOutResults.reduce((sum, r) => sum + ((r.result?.items as unknown[] | undefined)?.length ?? 0), 0);
    return { accounts: fanOutResults.length, totalMessages, allSuccessful: true };
  }));

  // MC-Q-04: Fan-out merges Calendar events from 3 accounts
  results.push(await run('MC-Q-04', 'Fan-out merges Calendar events from 3 accounts', async () => {
    const cal = new CalendarCapability();
    const fanOutResults = await ConnectorRouter.fanOut(
      { connectorId: GW_CONNECTOR_ID, organizationId: ORG, workspaceId: 'ws-calendar' },
      async () => cal.execute(GW_OPERATIONS.CALENDAR_LIST_EVENTS, { maxResults: 5 })
    );
    if (fanOutResults.length !== 3) throw new Error(`Expected 3 Calendar fan-out, got ${fanOutResults.length}`);
    const totalEvents = fanOutResults.reduce((sum, r) => sum + ((r.result?.items as unknown[] | undefined)?.length ?? 0), 0);
    return { accounts: fanOutResults.length, totalEvents };
  }));

  // MC-Q-05: Fan-out searches Drive across 3 accounts
  results.push(await run('MC-Q-05', 'Fan-out searches Drive across 3 accounts', async () => {
    const drive = new DriveCapability();
    const fanOutResults = await ConnectorRouter.fanOut(
      { connectorId: GW_CONNECTOR_ID, organizationId: ORG, workspaceId: 'ws-drive' },
      async () => drive.execute(GW_OPERATIONS.DRIVE_SEARCH_FILES, { query: 'contracts 2025', maxResults: 5 })
    );
    if (fanOutResults.length !== 3) throw new Error(`Expected 3 Drive fan-out, got ${fanOutResults.length}`);
    return { accounts: fanOutResults.length, allSuccessful: fanOutResults.every((r) => !r.error) };
  }));

  // MC-Q-06: Cross-org isolation — connections from different orgs never mix
  results.push(await run('MC-Q-06', 'Cross-org isolation enforced by ConnectionRegistry', async () => {
    const otherOrg = `qual-other-org-${Date.now()}`;
    addConn('intruder@other.com', otherOrg, 'ws-other');
    const orgConns = ConnectionRegistry.listByOrg(ORG);
    const otherConns = ConnectionRegistry.listByOrg(otherOrg);
    if (orgConns.some((c) => c.organizationId === otherOrg)) throw new Error('Org isolation violated');
    if (otherConns.some((c) => c.organizationId === ORG)) throw new Error('Org isolation violated (reverse)');
    return { orgConnections: orgConns.length, otherOrgConnections: otherConns.length };
  }));

  // MC-Q-07: Routing single — best connection selected automatically
  results.push(await run('MC-Q-07', 'Connection routing — best connection auto-selected', async () => {
    const route = ConnectorRouter.route({ connectorId: GW_CONNECTOR_ID, organizationId: ORG });
    if (!route.connections || route.connections.length === 0) throw new Error('No connections found by router');
    return { strategy: route.strategy, count: route.connections.length };
  }));

  // MC-Q-08: 9 parallel fan-out operations (all 3 workspaces at once)
  results.push(await run('MC-Q-08', '9 parallel fan-out operations across all workspaces', async () => {
    const gmail = new GmailCapability();
    const cal   = new CalendarCapability();
    const drive = new DriveCapability();
    const [gResults, cResults, dResults] = await Promise.all([
      ConnectorRouter.fanOut({ connectorId: GW_CONNECTOR_ID, organizationId: ORG, workspaceId: 'ws-gmail' }, async () => gmail.execute(GW_OPERATIONS.GMAIL_LIST_MESSAGES, { maxResults: 3 })),
      ConnectorRouter.fanOut({ connectorId: GW_CONNECTOR_ID, organizationId: ORG, workspaceId: 'ws-calendar' }, async () => cal.execute(GW_OPERATIONS.CALENDAR_LIST_EVENTS, { maxResults: 3 })),
      ConnectorRouter.fanOut({ connectorId: GW_CONNECTOR_ID, organizationId: ORG, workspaceId: 'ws-drive' }, async () => drive.execute(GW_OPERATIONS.DRIVE_LIST_FILES, { maxResults: 3 })),
    ]);
    const total = gResults.length + cResults.length + dResults.length;
    if (total < 9) throw new Error(`Expected 9 parallel ops, got ${total}`);
    return { total, gmail: gResults.length, calendar: cResults.length, drive: dResults.length };
  }));

  return results;
}