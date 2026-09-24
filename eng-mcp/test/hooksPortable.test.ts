/**
 * HOOKS-VPS-01 — portable judge hooks: the repo-versioned hook entry
 * (.claude/hooks/judge-hook.mjs) and its idempotent installer
 * (scripts/hooks-install.mjs).
 *
 * The hook runs as a REAL child process (exactly how Claude Code spawns it)
 * against either a dead endpoint or a local mock MCP judge — zero real judge
 * calls, credential is a throwaway temp file. Proves: band 1 without judge,
 * band 2 auto via judge, band 3 always operator, PostToolUseFailure mapping,
 * and the rigid fail-open (judge dead → pass + logged + surfaced, exit 0).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
// @ts-expect-error — plain .mjs module without type declarations
import { planHooks, hookCommand, runInstaller, HOOK_EVENTS } from '../scripts/hooks-install.mjs';

const HOOK = resolve(import.meta.dirname, '..', '.claude', 'hooks', 'judge-hook.mjs');

type HookOut = {
  systemMessage?: string;
  decision?: string;
  hookSpecificOutput?: { hookEventName?: string; permissionDecision?: string; permissionDecisionReason?: string; additionalContext?: string };
};

let dir = '';
let cred = '';
let calls: string[] = [];
let mockAnswer: (tool: string) => unknown = () => ({});
let server: Server;
let mockUrl = '';

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hooks-vps-01-'));
  cred = join(dir, 'cred');
  await writeFile(cred, 'test-bearer-not-real\n', { mode: 0o600 });
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const msg = JSON.parse(body) as { id?: number; method?: string; params?: { name?: string } };
      if (msg.method !== 'tools/call') {
        res.writeHead(msg.id === undefined ? 202 : 200, { 'content-type': 'application/json' });
        res.end(msg.id === undefined ? '' : JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));
        return;
      }
      const tool = String(msg.params?.name);
      calls.push(tool);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify(mockAnswer(tool)) }] } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  mockUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/mcp`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

function runHook(input: object, serverUrl: string, extraEnv: Record<string, string> = {}): Promise<{ code: number | null; out: HookOut; log: string }> {
  const log = join(dir, `log-${Math.random().toString(36).slice(2)}.jsonl`);
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [HOOK, '--server-url', serverUrl], {
      env: { PATH: process.env.PATH ?? '', HOME: dir, JUDGE_HOOK_TOKEN_CREDENTIAL_FILE: cred, JUDGE_HOOK_LOG: log, ...extraEnv },
    });
    let stdout = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.on('error', fail);
    child.on('close', async (code) => {
      let text = '';
      try {
        text = await readFile(log, 'utf8');
      } catch {
        text = '';
      }
      done({ code, out: JSON.parse(stdout.trim() || '{}') as HookOut, log: text });
    });
    child.stdin.end(JSON.stringify(input));
  });
}

const pre = (command: string, session = 'hv1-test') => ({ hook_event_name: 'PreToolUse', session_id: session, tool_name: 'Bash', tool_input: { command } });
const DEAD = 'http://127.0.0.1:1/mcp';
const benign = () => ({ answers: ['q_destructive', 'q_outward_facing', 'q_touches_credentials', 'q_large_blast_radius'].map((id) => ({ id, probability: 0.02 })) });

describe('HOOKS-VPS-01 portable hook (child process, real stdin/stdout contract)', () => {
  it('band 1 trivial: allow with ZERO judge calls', async () => {
    calls = [];
    const r = await runHook(pre('git status'), mockUrl);
    assert.equal(r.code, 0);
    assert.equal(r.out.hookSpecificOutput?.permissionDecision, 'allow');
    // HOOKS-CALIBRATION-01: `git status` now fires the deterministic allowlist
    // (band-1 label evolved from BAND1_TRIVIAL; behavior unchanged: allow,
    // zero judge calls).
    assert.match(r.out.hookSpecificOutput?.permissionDecisionReason ?? '', /BAND1_ALLOWLIST_MATCH/);
    assert.deepEqual(calls, []);
  });

  it('band 2 gray: judge safeScore > 0.9 → auto allow', async () => {
    calls = [];
    mockAnswer = benign;
    const r = await runHook(pre('node -e "console.log(1)"'), mockUrl);
    assert.equal(r.out.hookSpecificOutput?.permissionDecision, 'allow');
    assert.match(r.out.hookSpecificOutput?.permissionDecisionReason ?? '', /BAND2_GRAY_AUTO/);
    assert.deepEqual(calls, ['engineering.judge.evaluate']);
  });

  it('band 3 consequence: ask even when the judge is maximally benign', async () => {
    mockAnswer = benign;
    const r = await runHook(pre('git push origin main'), mockUrl, { JUDGE_CONSEQUENCE_POLICY: 'operator' });
    assert.equal(r.out.hookSpecificOutput?.permissionDecision, 'ask');
  });

  it('PostToolUseFailure is mapped onto the error classifier with the right event name', async () => {
    calls = [];
    mockAnswer = () => ({ answers: [{ id: 'q_error_class', choice: 'change_approach', confidence: 0.8 }] });
    const r = await runHook({ hook_event_name: 'PostToolUseFailure', session_id: 's', tool_name: 'Bash', tool_input: { command: 'x' }, error: 'Exit code 127: x: not found' }, mockUrl);
    assert.equal(r.out.hookSpecificOutput?.hookEventName, 'PostToolUseFailure');
    assert.match(r.out.hookSpecificOutput?.additionalContext ?? '', /class=change_approach/);
    assert.deepEqual(calls, ['engineering.judge.evaluate']);
  });

  it('FAIL-OPEN judge dead: gray command passes (no decision), exit 0, logged + surfaced', async () => {
    const r = await runHook(pre('node -e "console.log(2)"'), DEAD);
    assert.equal(r.code, 0);
    assert.equal(r.out.hookSpecificOutput?.permissionDecision, undefined, 'no decision → normal permission flow');
    assert.match(r.out.systemMessage ?? '', /JUDGE_UNAVAILABLE \(fail-open\)/);
    const line = JSON.parse(r.log.trim().split('\n')[0]) as { status: string; code: string; judgeTool: string };
    assert.equal(line.status, 'unavailable');
    assert.equal(line.code, 'JUDGE_UNAVAILABLE');
    assert.equal(line.judgeTool, 'engineering.judge.evaluate');
    assert.doesNotMatch(r.log, /test-bearer-not-real/, 'credential never logged');
  });

  it('FAIL-OPEN judge dead: band 3 still reaches the operator; Stop never crashes', async () => {
    const r = await runHook(pre('git push origin main'), DEAD, { JUDGE_CONSEQUENCE_POLICY: 'operator' });
    assert.equal(r.code, 0);
    assert.equal(r.out.hookSpecificOutput?.permissionDecision, 'ask');
    const s = await runHook({ hook_event_name: 'Stop', session_id: 's', last_assistant_message: 'Mission complete, all criteria met.' }, DEAD);
    assert.equal(s.code, 0);
    assert.equal(s.out.decision, undefined);
    assert.match(s.out.systemMessage ?? '', /JUDGE_UNAVAILABLE/);
  });

  it('no credential: gate absent, exit 0, surfaced once per session', async () => {
    const env = { JUDGE_HOOK_TOKEN_CREDENTIAL_FILE: join(dir, 'missing') };
    const input = { ...pre('node -e 1', 'nocred-session') };
    // Default credential paths may exist on a VPS host — only assert when the gate is truly absent.
    const a = await runHook(input, DEAD, env);
    assert.equal(a.code, 0);
    if (/NO_CREDENTIAL/.test(a.log)) assert.match(a.out.systemMessage ?? '', /no judge credential/);
  });

  it('escape hatch JUDGE_HOOKS_ENABLED=0 → {}', async () => {
    const r = await runHook(pre('rm -rf /tmp/x'), DEAD, { JUDGE_HOOKS_ENABLED: '0' });
    assert.equal(r.code, 0);
    assert.deepEqual(r.out, {});
  });
});

describe('HOOKS-VPS-01 installer (idempotent, key-detected, preserves foreign config)', () => {
  const cmd = hookCommand('/repo/.claude/hooks/judge-hook.mjs', 'http://127.0.0.1:8787/mcp');
  const foreign = { env: { A: '1' }, hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'echo other' }] }] } };

  it('install → INSTALLED with all 4 events; re-run → NO_OP', () => {
    const first = planHooks(foreign, { command: cmd });
    assert.equal(first.status, 'INSTALLED');
    for (const { event } of HOOK_EVENTS) assert.ok(JSON.stringify(first.settings.hooks[event]).includes('judge-hook.mjs'), event);
    assert.equal(first.settings.env.A, '1');
    assert.equal(first.settings.hooks.PreToolUse[0].hooks[0].command, 'echo other', 'foreign hook kept');
    const second = planHooks(first.settings, { command: cmd });
    assert.equal(second.status, 'NO_OP');
    assert.equal(second.settings, first.settings);
  });

  it('stale entry (different server url) → UPDATED without duplicates', () => {
    const installed = planHooks(foreign, { command: cmd }).settings;
    const updated = planHooks(installed, { command: hookCommand('/repo/.claude/hooks/judge-hook.mjs', 'http://other/mcp') });
    assert.equal(updated.status, 'UPDATED');
    const n = JSON.stringify(updated.settings).split('judge-hook.mjs').length - 1;
    assert.equal(n, HOOK_EVENTS.length);
  });

  it('--remove strips only our entries; second remove → NO_OP', () => {
    const installed = planHooks(foreign, { command: cmd }).settings;
    const removed = planHooks(installed, { remove: true });
    assert.equal(removed.status, 'REMOVED');
    assert.deepEqual(removed.settings, foreign);
    assert.equal(planHooks(removed.settings, { remove: true }).status, 'NO_OP');
  });

  it('runInstaller on disk: install, NO_OP leaves file untouched, invalid JSON refused', async () => {
    const settings = join(dir, 'settings.json');
    const argv = ['--settings', settings, '--server-url', 'http://127.0.0.1:8787/mcp'];
    assert.equal(runInstaller(argv, { HOME: dir }).result.status, 'INSTALLED');
    const before1 = await readFile(settings, 'utf8');
    assert.equal(runInstaller(argv, { HOME: dir }).result.status, 'NO_OP');
    assert.equal(await readFile(settings, 'utf8'), before1);
    assert.equal(runInstaller([...argv, '--remove'], { HOME: dir }).result.status, 'REMOVED');
    await writeFile(settings, '{not json');
    const bad = runInstaller(argv, { HOME: dir });
    assert.equal(bad.exitCode, 1);
    assert.equal(bad.result.code, 'SETTINGS_INVALID_JSON');
    assert.equal(await readFile(settings, 'utf8'), '{not json', 'invalid file untouched');
  });
});
