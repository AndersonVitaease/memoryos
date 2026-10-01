/**
 * JUDGE-TIMEOUT-FIX-01 — the judge-hook round-trip budget is configurable via
 * env JUDGE_HOOK_TIMEOUT_MS (default 4500 = 2× the worst measured hook cycle
 * + margin). Only the VALUE changes; fail-open semantics are untouched.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildJudgeGate, JUDGE_HOOK_TIMEOUT_MS, resolveJudgeHookTimeoutMs } from '../src/harness/judgeGate.ts';

const gateWith = (env: NodeJS.ProcessEnv) =>
  buildJudgeGate({ serverUrl: 'http://127.0.0.1:1/mcp', token: 'test-token-never-logged', env });

describe('JUDGE-TIMEOUT-FIX-01 judge hook timeout', () => {
  it('(a) no env → default 4500', () => {
    assert.equal(JUDGE_HOOK_TIMEOUT_MS, 4500);
    assert.equal(resolveJudgeHookTimeoutMs({}), 4500);
    assert.equal(gateWith({})?.hooks.PreToolUse[0].timeout, Math.ceil(4500 / 1000) + 1);
  });

  it('(b) env set → env value', () => {
    assert.equal(resolveJudgeHookTimeoutMs({ JUDGE_HOOK_TIMEOUT_MS: '3000' }), 3000);
    assert.equal(resolveJudgeHookTimeoutMs({ JUDGE_HOOK_TIMEOUT_MS: ' 7000 ' }), 7000);
    assert.equal(resolveJudgeHookTimeoutMs({ JUDGE_HOOK_TIMEOUT_MS: '1000' }), 1000);
    assert.equal(gateWith({ JUDGE_HOOK_TIMEOUT_MS: '9000' })?.hooks.PreToolUse[0].timeout, 10);
  });

  it('(c) invalid env → 4500', () => {
    for (const bad of ['', 'abc', '999', '0', '-3000', '2500.5', '3e3', 'NaN', 'Infinity']) {
      assert.equal(resolveJudgeHookTimeoutMs({ JUDGE_HOOK_TIMEOUT_MS: bad }), 4500, `value=${JSON.stringify(bad)}`);
    }
  });

  it('explicit config.timeoutMs still wins over env', () => {
    const gate = buildJudgeGate({ serverUrl: 'http://127.0.0.1:1/mcp', token: 't', timeoutMs: 30, env: { JUDGE_HOOK_TIMEOUT_MS: '9000' } });
    assert.equal(gate?.hooks.PreToolUse[0].timeout, Math.ceil(30 / 1000) + 1);
  });
});
