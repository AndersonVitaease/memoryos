/**
 * AUTO-RUN-01B/C — C2 HOLD notification loop (src/harness/holdNotifier.ts).
 *
 * Proofs (red-then-green discipline):
 *   - proof 5: two HOLDs of the same event (same kind|mission|command) within
 *     the interval produce exactly ONE gateway notification (idempotent per
 *     holdKey; the trail IS the dedupe state — survives process restarts).
 *   - a notify failure never affects the caller's decision (HOLD stands) and
 *     is recorded honestly as delivered:false + outcome 'error:<code>'.
 *   - REGRA INVIOLÁVEL: the notification explains/accelerates the human loop;
 *     it never approves anything (notifyHold only returns a result — the
 *     caller already HOLDed before this runs).
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  composeHoldSummary,
  holdKey,
  HOLD_NOTIFY_MIN_INTERVAL_MS,
  HOLD_TRAIL_FILE,
  notifyHold,
  type HoldNotificationInput,
  type HoldNotifyDeps,
} from '../src/harness/holdNotifier.js';

const baseInput = (over: Partial<HoldNotificationInput> = {}): HoldNotificationInput => ({
  kind: 'manifest_out_of_scope',
  mission: 'auto-run-test',
  command: 'tar -cf /tmp/a.tar /tmp/b',
  safeScore: 0.95,
  reasons: ['q_destructive=0.050'],
  session: 'sess-1234567890',
  ...over,
});

interface Harness {
  deps: HoldNotifyDeps;
  calls: Array<{ tool: string; args: Record<string, unknown> }>;
  setTrailDir: (dir: string) => void;
  failNext: () => void;
}

function harness(): Harness {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  let failing = false;
  const notifyClient = async (tool: string, args: Record<string, unknown>, _signal: AbortSignal) => {
    if (tool !== 'engineering.notify.hermes') return { ok: false as const, error: 'unexpected tool' };
    calls.push({ tool, args });
    if (failing) return { ok: false as const, error: 'AUTHORIZATION_SCOPE_REQUIRED' };
    return { ok: true as const, data: { delivered: true } };
  };
  const deps: HoldNotifyDeps = { notifyClient, trailFile: '', commandSha16: 'cafebabedeadbeef' };
  return {
    deps,
    calls,
    setTrailDir: (dir: string) => { deps.trailFile = join(dir, HOLD_TRAIL_FILE); },
    failNext: () => { failing = true; },
  };
}

describe('AUTO-RUN-01B/C C2: holdNotifier', () => {
  const cleanup: Array<() => Promise<void>> = [];
  after(async () => { for (const c of cleanup) await c(); });

  it('holdKey is deterministic and separates kind/mission/command', () => {
    const a = holdKey('band3', 'm1', 'cmd1');
    const b = holdKey('band3', 'm1', 'cmd1');
    const c = holdKey('manifest_nogo', 'm1', 'cmd1');
    const d = holdKey('band3', null, 'cmd1');
    assert.equal(a, b, 'same inputs → same key (idempotency basis)');
    assert.notEqual(a, c);
    assert.notEqual(a, d);
    assert.match(a, /^[0-9a-f]{16}$/);
  });

  it('summary stays <= 500 chars and carries mission, truncated command, score, how-to-approve', () => {
    const long = 'x'.repeat(600) + ' /tmp/long/path';
    const s = composeHoldSummary(baseInput({ command: long }));
    assert.ok(s.length <= 500);
    assert.match(s, /HOLD manifest_out_of_scope/);
    assert.match(s, /missão=auto-run-test/);
    assert.match(s, /score=0\.950/);
    assert.match(s, /aprovar: responder no chat/);
    assert.ok(!s.includes('x'.repeat(600)), 'command is truncated');
    assert.ok(!s.match(/sk-[a-z0-9]/), 'no credential-shaped content expected in a summary');
  });

  it('proof 5: two HOLDs of the same event within the interval → exactly ONE notification', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hold-notify-'));
    cleanup.push(() => rm(dir, { recursive: true, force: true }));
    const h = harness();
    h.setTrailDir(dir);
    const r1 = await notifyHold(h.deps, baseInput());
    const r2 = await notifyHold(h.deps, baseInput());
    assert.equal(r1.delivered, true);
    assert.equal(r1.outcome, 'sent');
    assert.equal(r2.delivered, false, 'second HOLD of the same event does NOT re-notify');
    assert.equal(r2.outcome, 'idempotent');
    assert.equal(r1.holdKey, r2.holdKey);
    assert.equal(h.calls.length, 1, 'gateway called exactly once for 2 HOLD events');
  });

  it('idempotency state IS the trail: a fresh process (new deps) still dedupes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hold-notify-'));
    cleanup.push(() => rm(dir, { recursive: true, force: true }));
    const h1 = harness();
    h1.setTrailDir(dir);
    await notifyHold(h1.deps, baseInput());
    const h2 = harness(); // NEW deps object — simulates a restarted hook process
    h2.setTrailDir(dir);
    const r2 = await notifyHold(h2.deps, baseInput());
    assert.equal(r2.delivered, false);
    assert.equal(r2.outcome, 'idempotent');
    assert.equal(h2.calls.length, 0, 'no second gateway call across processes');
  });

  it('after the interval passes, the same event re-notifies (at most every 10 min by default)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hold-notify-'));
    cleanup.push(() => rm(dir, { recursive: true, force: true }));
    const h = harness();
    h.setTrailDir(dir);
    const old = baseInput({ at: new Date(Date.now() - HOLD_NOTIFY_MIN_INTERVAL_MS - 1000).toISOString() });
    const r1 = await notifyHold(h.deps, old);
    const r2 = await notifyHold(h.deps, baseInput());
    assert.equal(r1.delivered, true);
    assert.equal(r2.delivered, true, 'older than the interval → notifies again');
    assert.equal(h.calls.length, 2);
  });

  it('notify failure is honest (delivered:false, error outcome) and the trail still records it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hold-notify-'));
    cleanup.push(() => rm(dir, { recursive: true, force: true }));
    const h = harness();
    h.setTrailDir(dir);
    h.failNext();
    const r = await notifyHold(h.deps, baseInput());
    assert.equal(r.delivered, false);
    assert.match(r.outcome, /^error:AUTHORIZATION_SCOPE_REQUIRED/);
    const trail = await readFile(join(dir, HOLD_TRAIL_FILE), 'utf8');
    assert.match(trail, /"outcome":"error:AUTHORIZATION_SCOPE_REQUIRED"/);
    assert.match(trail, /"delivered":false/);
  });

  it('different commands/kinds in the same window each notify (idempotency is per event, not global)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hold-notify-'));
    cleanup.push(() => rm(dir, { recursive: true, force: true }));
    const h = harness();
    h.setTrailDir(dir);
    await notifyHold(h.deps, baseInput());
    // the hook computes commandSha16 per invocation from the REAL command
    h.deps.commandSha16 = '1111111111111111';
    await notifyHold(h.deps, baseInput({ command: 'other-command --flag' }));
    await notifyHold(h.deps, baseInput({ kind: 'band3' }));
    assert.equal(h.calls.length, 3, 'three distinct HOLD events → three notifications');
  });

  it('different missions dedupe separately', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hold-notify-'));
    cleanup.push(() => rm(dir, { recursive: true, force: true }));
    const h = harness();
    h.setTrailDir(dir);
    await notifyHold(h.deps, baseInput({ mission: 'm1' }));
    const r = await notifyHold(h.deps, baseInput({ mission: 'm2' }));
    assert.equal(r.delivered, true);
    assert.notEqual(r.holdKey, holdKey('manifest_out_of_scope', 'm1', 'cafebabedeadbeef'));
  });
});
