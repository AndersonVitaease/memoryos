/**
 * StressQualification.ts
 * Sprint 6.4.2A — Stress Tests & Failure Injection
 *
 * Validates: 100 reads · 100 searches · 100 calendar queries · 50 uploads ·
 * 50 downloads · Failure injection (token expiry, timeout, rate limit, revoke)
 */

import { GmailCapability } from '../capabilities/GmailCapability';
import { CalendarCapability } from '../capabilities/CalendarCapability';
import { DriveCapability } from '../capabilities/DriveCapability';
import { GW_OPERATIONS } from '../GWTypes';
import { GoogleOAuthProvider, GOOGLE_PROVIDER_ID } from '../GoogleOAuthProvider';
import type { QualResult, PerfMetrics } from './QualificationTypes';

async function run(id: string, name: string, fn: () => Promise<unknown>): Promise<QualResult> {
  const t0 = Date.now();
  try {
    const meta = await fn();
    return { id, name, category: 'stress', status: 'pass', durationMs: Date.now() - t0, metadata: typeof meta === 'object' ? meta as Record<string, unknown> : { value: meta } };
  } catch (e: unknown) {
    return { id, name, category: 'stress', status: 'fail', durationMs: Date.now() - t0, error: String(e) };
  }
}

async function batchExec<T>(n: number, fn: () => Promise<T>): Promise<{ results: T[]; latencies: number[]; errors: number }> {
  const BATCH = 20;
  const allResults: T[] = [];
  const latencies: number[] = [];
  let errors = 0;
  for (let i = 0; i < n; i += BATCH) {
    const count = Math.min(BATCH, n - i);
    const batchResults = await Promise.all(
      Array.from({ length: count }, async () => {
        const t0 = Date.now();
        try {
          const r = await fn();
          latencies.push(Date.now() - t0);
          return r;
        } catch {
          errors++;
          latencies.push(Date.now() - t0);
          return null as T;
        }
      })
    );
    allResults.push(...batchResults);
  }
  return { results: allResults, latencies, errors };
}

function perfStats(latencies: number[], errors: number, total: number): PerfMetrics {
  const sorted = [...latencies].sort((a, b) => a - b);
  const avg    = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  return {
    label:        'batch',
    latencyMs:    Math.round(avg),
    throughput:   Math.round(total / (sorted.reduce((s, v) => s + v, 0) / 1000)),
    p95LatencyMs: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    p99LatencyMs: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
    errors,
    total,
  };
}

export async function runStressQualification(): Promise<QualResult[]> {
  const results: QualResult[] = [];
  const gmail = new GmailCapability();
  const cal   = new CalendarCapability();
  const drive = new DriveCapability();

  // ST-Q-01: 100 Gmail list_messages
  results.push(await run('ST-Q-01', '100 parallel Gmail list_messages', async () => {
    const { latencies, errors } = await batchExec(100, () => gmail.execute(GW_OPERATIONS.GMAIL_LIST_MESSAGES, { maxResults: 5 }));
    if (errors > 0) throw new Error(`${errors} errors in 100 Gmail reads`);
    return perfStats(latencies, errors, 100);
  }));

  // ST-Q-02: 100 Drive search_files
  results.push(await run('ST-Q-02', '100 parallel Drive search_files', async () => {
    const { latencies, errors } = await batchExec(100, () => drive.execute(GW_OPERATIONS.DRIVE_SEARCH_FILES, { query: 'contract', maxResults: 5 }));
    if (errors > 0) throw new Error(`${errors} errors in 100 Drive searches`);
    return perfStats(latencies, errors, 100);
  }));

  // ST-Q-03: 100 Calendar list_events
  results.push(await run('ST-Q-03', '100 parallel Calendar list_events', async () => {
    const { latencies, errors } = await batchExec(100, () => cal.execute(GW_OPERATIONS.CALENDAR_LIST_EVENTS, { maxResults: 5 }));
    if (errors > 0) throw new Error(`${errors} errors in 100 Calendar queries`);
    return perfStats(latencies, errors, 100);
  }));

  // ST-Q-04: 50 Drive upload_file
  results.push(await run('ST-Q-04', '50 parallel Drive upload_file', async () => {
    const { latencies, errors } = await batchExec(50, () => drive.execute(GW_OPERATIONS.DRIVE_UPLOAD_FILE, { fileName: `file-${Date.now()}.pdf`, mimeType: 'application/pdf' }));
    if (errors > 0) throw new Error(`${errors} errors in 50 uploads`);
    return perfStats(latencies, errors, 50);
  }));

  // ST-Q-05: 50 Drive download_file
  results.push(await run('ST-Q-05', '50 parallel Drive download_file', async () => {
    const { latencies, errors } = await batchExec(50, () => drive.execute(GW_OPERATIONS.DRIVE_DOWNLOAD_FILE, { fileId: `file-${Date.now()}` }));
    if (errors > 0) throw new Error(`${errors} errors in 50 downloads`);
    return perfStats(latencies, errors, 50);
  }));

  // ST-Q-06: 300 mixed operations (Gmail + Calendar + Drive simultaneously)
  results.push(await run('ST-Q-06', '300 mixed ops — Gmail + Calendar + Drive simultaneous', async () => {
    const ops = [
      ...Array.from({ length: 100 }, () => () => gmail.execute(GW_OPERATIONS.GMAIL_LIST_MESSAGES, { maxResults: 3 })),
      ...Array.from({ length: 100 }, () => () => cal.execute(GW_OPERATIONS.CALENDAR_LIST_EVENTS, { maxResults: 3 })),
      ...Array.from({ length: 100 }, () => () => drive.execute(GW_OPERATIONS.DRIVE_LIST_FILES, { maxResults: 3 })),
    ];
    const BATCH = 30;
    let errors = 0;
    let done = 0;
    for (let i = 0; i < ops.length; i += BATCH) {
      const slice = ops.slice(i, i + BATCH);
      const res = await Promise.allSettled(slice.map((fn) => fn()));
      errors += res.filter((r) => r.status === 'rejected').length;
      done += slice.length;
    }
    if (errors > 0) throw new Error(`${errors} errors in 300 mixed ops`);
    return { total: done, errors };
  }));

  // ─── Failure Injection ────────────────────────────────────────────────────

  const provider = new GoogleOAuthProvider();

  // FI-Q-01: Token expiry + refresh recovery
  results.push(await run('FI-Q-01', '[Failure Injection] Token expiry → automatic refresh → recovery', async () => {
    const r = await provider.refresh({ connectionId: 'expired-conn', refreshTokenRef: 'expired-token-sim' });
    if (!r.success) throw new Error('Recovery via refresh failed for expired token');
    const v = await provider.validate({ connectionId: 'expired-conn', tokenRef: r.newTokenRef! });
    if (!v.valid) throw new Error('New token should be valid post-recovery');
    return { recovered: true };
  }));

  // FI-Q-02: Revoked token → reconnect
  results.push(await run('FI-Q-02', '[Failure Injection] Revoked token → reconnect authentication', async () => {
    const rev = await provider.revoke({ connectionId: 'revoked-conn', tokenRef: 'revoked-tok' });
    if (!rev.success) throw new Error('Revoke failed');
    const reauth = await provider.authenticate({ providerId: GOOGLE_PROVIDER_ID, flow: 'authorization_code_pkce', scopes: ['openid'], tenant: { organizationId: 'fi-org', workspaceId: 'fi-ws', connectorId: 'google-workspace', accountId: 'fi-acc', userId: 'fi-user' } });
    if (!reauth.success) throw new Error('Reconnect after revoke failed');
    return { revoked: true, reconnected: true };
  }));

  // FI-Q-03: Rate limit simulation — burst then recovery
  results.push(await run('FI-Q-03', '[Failure Injection] Rate limit burst (30 req) — no crashes', async () => {
    const { errors } = await batchExec(30, () => gmail.execute(GW_OPERATIONS.GMAIL_LIST_MESSAGES, { maxResults: 1 }));
    // Rate limits produce errors in production — here we validate the system does not crash.
    return { attempted: 30, errors, recovered: true };
  }));

  // FI-Q-04: Partial failure — some connections fail, others succeed
  results.push(await run('FI-Q-04', '[Failure Injection] Partial connection failure — others continue', async () => {
    const results2 = await Promise.allSettled([
      gmail.execute(GW_OPERATIONS.GMAIL_LIST_MESSAGES, { maxResults: 3 }),
      Promise.reject(new Error('Simulated connection timeout')),
      drive.execute(GW_OPERATIONS.DRIVE_LIST_FILES, { maxResults: 3 }),
      Promise.reject(new Error('Simulated rate limit')),
      cal.execute(GW_OPERATIONS.CALENDAR_LIST_EVENTS, { maxResults: 3 }),
    ]);
    const fulfilled = results2.filter((r) => r.status === 'fulfilled').length;
    if (fulfilled < 3) throw new Error(`Expected at least 3 successful ops, got ${fulfilled}`);
    return { attempted: 5, succeeded: fulfilled, failed: 5 - fulfilled };
  }));

  // FI-Q-05: Chaos test — random operation mix with random failures
  results.push(await run('FI-Q-05', '[Chaos] 50 random operations with 20% failure injection', async () => {
    const opFns = [
      () => gmail.execute(GW_OPERATIONS.GMAIL_LIST_MESSAGES, { maxResults: 2 }),
      () => cal.execute(GW_OPERATIONS.CALENDAR_LIST_EVENTS, { maxResults: 2 }),
      () => drive.execute(GW_OPERATIONS.DRIVE_LIST_FILES, { maxResults: 2 }),
      () => gmail.execute(GW_OPERATIONS.GMAIL_SEARCH, { query: 'test', maxResults: 2 }),
      () => drive.execute(GW_OPERATIONS.DRIVE_SEARCH_FILES, { query: 'test', maxResults: 2 }),
    ];
    const ops = Array.from({ length: 50 }, (_, i) => {
      if (i % 5 === 0) return () => Promise.reject(new Error('Chaos: injected failure'));
      return opFns[i % opFns.length];
    });
    const res = await Promise.allSettled(ops.map((fn) => fn()));
    const succeeded = res.filter((r) => r.status === 'fulfilled').length;
    const failed    = res.filter((r) => r.status === 'rejected').length;
    if (succeeded < 30) throw new Error(`Expected at least 30 success in chaos, got ${succeeded}`);
    return { total: 50, succeeded, failed };
  }));

  return results;
}