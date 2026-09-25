/**
 * JUDGE-HOOKS-01 — tests for the 3-band approval policy + judge-backed
 * arbitration gate (src/harness/judgeGate.ts), the CLI dispatch contract and
 * the runtime wiring seam (src/harness/ClaudeAgentRuntime.ts).
 *
 * Deterministic: the judge is a mocked client seam (judgeClient) — zero
 * network, zero real judge calls, zero credentials. The REGRA INVIOLÁVEL is
 * asserted as behavior: band 3 reaches the operator even when the judge
 * answers with a maximally benign high-confidence response, and band 1 makes
 * ZERO judge calls by construction.
 */
import assert from 'node:assert/strict';
// Legacy-semantics suite: the operator's 24/09 policy (JUDGE_CONSEQUENCE_POLICY
// unset = auto-allow) is covered by its OWN test at the bottom. Everything here
// tests the operator-route machinery, so pin the flag explicitly.
process.env.JUDGE_CONSEQUENCE_POLICY = 'operator';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  buildJudgeGate,
  isTrivialCommand,
  judgeSafeScore,
  matchDenylist,
  type JudgeClient,
  type JudgeGateConfig,
  type JudgeGateEvidenceEntry,
  type JudgeHookInput,
  type JudgeHookJSONOutput,
} from '../src/harness/judgeGate.js';
import { ClaudeAgentRuntime, type ClaudeQueryOptions, type QueryFn } from '../src/harness/ClaudeAgentRuntime.js';
import { createInitialState, type MissionContract } from '../src/harness/missionTypes.js';

const BAND2_IDS = ['q_destructive', 'q_outward_facing', 'q_touches_credentials', 'q_large_blast_radius'] as const;

/* ------------------------------------------------------------------ */
/* Mock judge client seam                                              */
/* ------------------------------------------------------------------ */

interface MockCall { tool: string; args: Record<string, unknown> }

function mockJudge(handlers: {
  /** Canned payload OR (args) => payload. */
  evaluate?: unknown;
  /** Canned payload OR (args) => payload. */
  verify?: unknown;
}): { client: JudgeClient; calls: MockCall[] } {
  const calls: MockCall[] = [];
  const asFn = (v: unknown): (args: Record<string, unknown>) => unknown =>
    typeof v === 'function' ? (v as (args: Record<string, unknown>) => unknown) : () => v;
  const client: JudgeClient = async (tool, args) => {
    calls.push({ tool, args });
    if (tool === 'engineering.judge.evaluate') {
      return handlers.evaluate !== undefined ? { ok: true, data: asFn(handlers.evaluate)(args) } : { ok: false, error: 'no evaluate handler' };
    }
    if (tool === 'engineering.judge.verify') {
      return handlers.verify !== undefined ? { ok: true, data: asFn(handlers.verify)(args) } : { ok: false, error: 'no verify handler' };
    }
    return { ok: false, error: 'unknown tool' };
  };
  return { client, calls };
}

// Mirrors the REAL envelope of engineering.judge.evaluate (src/judge.ts): { answers: [...] }.
const noulResult = (p: number) => ({
  answers: BAND2_IDS.map((id) => ({ id, type: 'noul', probability: p, complementProbability: 1 - p })),
});

const choiceResult = (choice: string, confidence: number) => ({
  answers: [{ id: 'q_any', type: 'choice', choice, probabilities: {}, confidence }],
});

/** Evaluate dispatcher: band-3 context calls (state.band3) vs band-2 risk calls. */
const bandDispatcher = (band2: unknown, band3: unknown) => (args: Record<string, unknown>) => {
  const state = args.state as { band3?: boolean } | undefined;
  return state?.band3 === true ? band3 : band2;
};

/* ------------------------------------------------------------------ */
/* Input builders + config helper                                      */
/* ------------------------------------------------------------------ */

const bashInput = (command: string): JudgeHookInput => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command },
  tool_use_id: 'tu-1',
});

function gateConfig(over: Partial<JudgeGateConfig> = {}): JudgeGateConfig {
  return {
    serverUrl: 'http://127.0.0.1:1/mcp',
    token: 'test-token-never-logged',
    unattended: true,
    ...over,
  };
}

const decisionOf = (out: JudgeHookJSONOutput): string | undefined => out.hookSpecificOutput?.permissionDecision;
const reasonOf = (out: JudgeHookJSONOutput): string | undefined => out.hookSpecificOutput?.permissionDecisionReason;

/* ------------------------------------------------------------------ */
/* Gate — band classification                                          */
/* ------------------------------------------------------------------ */

describe('JUDGE-HOOKS-01 gate: band classification', () => {
  it('band 1: trivial read-only command auto-allows with ZERO judge calls', async () => {
    const { client, calls } = mockJudge({});
    const sink: JudgeGateEvidenceEntry[] = [];
    const gate = buildJudgeGate(gateConfig({ judgeClient: client, evidenceSink: (e) => sink.push(e) }));
    assert.ok(gate);
    const out = await gate.handlers.preToolUse(bashInput('ls /tmp/judge-hooks-e2e'), 'tu-1');
    assert.equal(decisionOf(out), 'allow');
    // HOOKS-CALIBRATION-01: the calibrated allowlist fires FIRST and answers
    // with the rule that matched (auditable).
    assert.match(reasonOf(out) ?? '', /BAND1_ALLOWLIST_MATCH: rule=readonly-inspect/);
    assert.match(reasonOf(out) ?? '', /band1-allowlist-v1/);
    assert.equal(calls.length, 0); // zero judge calls for band 1 — the core guarantee
    assert.ok(sink.some((e) => e.key.startsWith('judge_gate:band1:')));
  });

  it('band 1 classifier: exact/version commands, git+docker read subcommands, metachars', () => {
    assert.equal(isTrivialCommand('node --version'), true);
    assert.equal(isTrivialCommand('git status'), true);
    assert.equal(isTrivialCommand('docker ps'), true);
    assert.equal(isTrivialCommand('free -h'), true);
    assert.equal(isTrivialCommand('cat a | grep b'), false); // metachar → not band 1
    assert.equal(isTrivialCommand('git push origin main'), false); // subcommand not read-only
    assert.equal(isTrivialCommand(''), false);
    assert.equal(matchDenylist('rm -rf /tmp/x'), 'destructive-filesystem');
    assert.equal(matchDenylist('ls /tmp/x'), null);
  });

  it('band 3: denylist command routes to the operator and calls the judge for CONTEXT only', async () => {
    const { client, calls } = mockJudge({ evaluate: bandDispatcher(noulResult(0.05), choiceResult('production_mutation', 0.9)) });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    const out = await gate.handlers.preToolUse(bashInput('git push origin main'), 'tu-2');
    assert.equal(decisionOf(out), 'deny'); // unattended → deny (round-trips to operator)
    assert.match(reasonOf(out) ?? '', /BAND3_CONSEQUENCE/);
    assert.match(reasonOf(out) ?? '', /judge never approves/);
    assert.match(reasonOf(out) ?? '', /judge context: production_mutation/);
    // EXACTLY one judge call, and it is the context-only evaluate (band3:true)
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tool, 'engineering.judge.evaluate');
    assert.equal((calls[0].args.state as { band3?: boolean }).band3, true);
  });

  it('REGRA INVIOLÁVEL: judge answering benign conf 0.99 does NOT flip band 3', async () => {
    const { client, calls } = mockJudge({ evaluate: bandDispatcher(noulResult(0.01), choiceResult('other', 0.99)) });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    const out = await gate.handlers.preToolUse(bashInput('sudo systemctl restart memoryos-eng-mcp'), 'tu-3');
    assert.equal(decisionOf(out), 'deny'); // operator route REGARDLESS of the judge answer
    assert.match(reasonOf(out) ?? '', /BAND3_CONSEQUENCE/);
    assert.equal(calls.length, 1); // context only — the scoring evaluate never runs in band 3
  });

  it('band 3 attended mode asks instead of denying', async () => {
    const { client } = mockJudge({ evaluate: choiceResult('other', 0.5) });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client, unattended: false }));
    assert.ok(gate);
    const out = await gate.handlers.preToolUse(bashInput('docker system prune -af'), 'tu-4');
    assert.equal(decisionOf(out), 'ask');
    assert.match(reasonOf(out) ?? '', /BAND3_CONSEQUENCE/);
    assert.match(reasonOf(out) ?? '', /judge context: other/);
  });

  it('band 2 gray-high: safeScore > 0.9 auto-executes with audit evidence', async () => {
    const { client, calls } = mockJudge({ evaluate: noulResult(0.05) }); // safe = 0.95
    const sink: JudgeGateEvidenceEntry[] = [];
    const gate = buildJudgeGate(gateConfig({ judgeClient: client, evidenceSink: (e) => sink.push(e) }));
    assert.ok(gate);
    const out = await gate.handlers.preToolUse(bashInput('run-migrations --now'), 'tu-5');
    assert.equal(decisionOf(out), 'allow');
    assert.match(reasonOf(out) ?? '', /BAND2_GRAY_AUTO/);
    assert.match(reasonOf(out) ?? '', /0\.950/);
    assert.equal(calls.length, 1); // exactly one evaluate
    assert.deepEqual(calls[0].args.questions?.map((q: { id: string }) => q.id), [...BAND2_IDS]);
    assert.ok(sink.some((e) => e.key.startsWith('judge_gate:band2:') && e.value.includes('0.95')));
  });

  it('band 2 gray-medium (0.6-0.9): operator route WITH score and per-question risks', async () => {
    const { client } = mockJudge({ evaluate: noulResult(0.3) }); // safe = 0.7
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    const out = await gate.handlers.preToolUse(bashInput('tar -cf /tmp/a.tar /tmp/b'), 'tu-6');
    assert.equal(decisionOf(out), 'deny');
    assert.match(reasonOf(out) ?? '', /BAND2_GRAY_MEDIUM/);
    assert.match(reasonOf(out) ?? '', /safeScore 0\.700/);
    assert.match(reasonOf(out) ?? '', /q_destructive=0\.300/);
  });

  it('band 2 gray-low (<0.6): operator route with the low band label', async () => {
    const { client } = mockJudge({ evaluate: noulResult(0.9) }); // safe = 0.1
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    const out = await gate.handlers.preToolUse(bashInput('tar -cf /tmp/a.tar /tmp/b'), 'tu-7');
    assert.equal(decisionOf(out), 'deny');
    assert.match(reasonOf(out) ?? '', /BAND2_GRAY_LOW/);
  });

  it('band 2 fail-closed scoring: missing question probabilities count as max risk', () => {
    assert.equal(judgeSafeScore({ answers: [] }).safeScore, 0);
    assert.equal(judgeSafeScore({}).safeScore, 0);
    const partial = judgeSafeScore({ answers: [{ id: 'q_destructive', probability: 0.2 }] });
    assert.equal(partial.safeScore, 0); // 3 missing questions => worst = 1
    assert.equal(partial.probabilities.q_destructive, 0.2);
  });

  it('credential redaction: secrets in the command are redacted before judge and evidence', async () => {
    const secret = 'sk-abcdefgh12345678secret';
    const { client, calls } = mockJudge({ evaluate: noulResult(0.05) });
    const sink: JudgeGateEvidenceEntry[] = [];
    const gate = buildJudgeGate(gateConfig({ judgeClient: client, evidenceSink: (e) => sink.push(e) }));
    assert.ok(gate);
    await gate.handlers.preToolUse(bashInput(`upload-helper --token ${secret}`), 'tu-8');
    assert.equal(calls.length, 1);
    assert.equal(JSON.stringify(calls[0].args).includes(secret), false); // never leaves to the judge
    assert.equal(JSON.stringify(sink).includes(secret), false); // never lands in evidence
    assert.ok(JSON.stringify(sink).includes('[REDACTED]'));
  });
});

/* ------------------------------------------------------------------ */
/* Gate — fail-open transversal                                        */
/* ------------------------------------------------------------------ */

describe('JUDGE-HOOKS-01 gate: fail-open', () => {
  it('judge connection refused: unattended gray command continues with JUDGE_FAIL_OPEN marker', async () => {
    const { client, calls } = mockJudge({});
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    const out = await gate.handlers.preToolUse(bashInput('run-migrations --now'), 'tu-9');
    assert.equal(decisionOf(out), 'allow');
    assert.match(reasonOf(out) ?? '', /JUDGE_FAIL_OPEN/);
    assert.equal(calls.length, 1);
  });

  it('judge connection refused: attended mode returns no decision (normal flow resumes)', async () => {
    const { client } = mockJudge({});
    const gate = buildJudgeGate(gateConfig({ judgeClient: client, unattended: false }));
    assert.ok(gate);
    const out = await gate.handlers.preToolUse(bashInput('run-migrations --now'), 'tu-10');
    assert.deepEqual(out, {});
    assert.equal(decisionOf(out), undefined);
  });

  it('judge timeout: abort surfaces as fail-open allow (mission never stalls)', async () => {
    const hanging: JudgeClient = (_tool, _args, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('timeout-abort')));
      });
    const gate = buildJudgeGate(gateConfig({ judgeClient: hanging, timeoutMs: 30 }));
    assert.ok(gate);
    const out = await gate.handlers.preToolUse(bashInput('run-migrations --now'), 'tu-11');
    assert.equal(decisionOf(out), 'allow');
    assert.match(reasonOf(out) ?? '', /JUDGE_FAIL_OPEN/);
  });

  it('non-Bash tools and missing commands bypass the gate entirely (zero judge calls)', async () => {
    const { client, calls } = mockJudge({ evaluate: noulResult(0.05) });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    assert.deepEqual(await gate.handlers.preToolUse({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'a.ts' } }, 'tu-12'), {});
    assert.deepEqual(await gate.handlers.preToolUse({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {} }, 'tu-13'), {});
    assert.equal(calls.length, 0);
  });
});

/* ------------------------------------------------------------------ */
/* PostToolUse + Stop                                                  */
/* ------------------------------------------------------------------ */

describe('JUDGE-HOOKS-01 gate: PostToolUse error classification and Stop verify', () => {
  it('PostToolUse: tool error is classified and injected as CONTEXT ONLY', async () => {
    const { client, calls } = mockJudge({ evaluate: choiceResult('retryable', 0.8) });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    const out = await gate.handlers.postToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_response: { isError: true, stdout: '', stderr: 'command not found' },
    }, 'tu-14');
    const context = out.hookSpecificOutput?.additionalContext ?? '';
    assert.match(context, /JUDGE_POSTTOOLUSE_ERROR/);
    assert.match(context, /class=retryable/);
    assert.match(context, /not a command/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tool, 'engineering.judge.evaluate');
  });

  it('PostToolUse: non-error tool responses make zero judge calls', async () => {
    const { client, calls } = mockJudge({ evaluate: choiceResult('retryable', 0.8) });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    assert.deepEqual(await gate.handlers.postToolUse({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: { isError: false } }, 'tu-15'), {});
    assert.deepEqual(await gate.handlers.postToolUse({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: undefined }, 'tu-16'), {});
    assert.equal(calls.length, 0);
  });

  it('PostToolUse: structured error envelope feeds the judge state (ERROR-01 point 6)', async () => {
    const { client, calls } = mockJudge({ evaluate: choiceResult('retryable', 0.8) });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    const envelope = { code: 'FILE_VERSION_CONFLICT', category: 'state', retryable: true, remediation: 're-read and re-apply the patch', message: 'FILE_VERSION_CONFLICT', evidenceRefs: [] };
    const out = await gate.handlers.postToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'engineering.file.patch',
      tool_response: { isError: true, content: [{ type: 'text', text: JSON.stringify(envelope) }] },
    }, 'tu-env-1');
    const context = out.hookSpecificOutput?.additionalContext ?? '';
    assert.match(context, /JUDGE_POSTTOOLUSE_ERROR/);
    assert.match(context, /not a command/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tool, 'engineering.judge.evaluate');
    const state = calls[0].args.state as Record<string, unknown>;
    assert.deepEqual(state.errorEnvelope, { code: 'FILE_VERSION_CONFLICT', category: 'state', retryable: true });
    const instructions = (calls[0].args.questions as Array<{ instructions: string }>)[0].instructions;
    assert.match(instructions, /errorEnvelope/);
    assert.match(instructions, /FILE_VERSION_CONFLICT/);
  });

  it('PostToolUse: non-envelope error responses carry no errorEnvelope and keep legacy instructions', async () => {
    const { client, calls } = mockJudge({ evaluate: choiceResult('change_approach', 0.7) });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    await gate.handlers.postToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_response: { isError: true, stdout: '', stderr: 'command not found' },
    }, 'tu-env-2');
    assert.equal(calls.length, 1);
    const state = calls[0].args.state as Record<string, unknown>;
    assert.equal('errorEnvelope' in state, false);
    const instructions = (calls[0].args.questions as Array<{ instructions: string }>)[0].instructions;
    assert.doesNotMatch(instructions, /errorEnvelope/);
  });

  it('Stop: premature completion with unsupported claims is BLOCKED with reasons', async () => {
    const { client, calls } = mockJudge({
      verify: () => ({
        aggregate: 'MIXED',
        claims: [
          { id: 'sc1', text: 'build passed', verdict: 'supported', probability: 0.9 },
          { id: 'sc2', text: 'tests all green', verdict: 'uncertain', probability: 0.3 },
        ],
      }),
    });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client, stopEvidence: () => '{"missionId":"jh-stop","criteria":["x"]}' }));
    assert.ok(gate);
    const out = await gate.handlers.stop({
      hook_event_name: 'Stop',
      last_assistant_message: 'Mission complete: all criteria met and deliverable delivered.',
    }, 'tu-17');
    assert.equal(out.decision, 'block');
    assert.match(out.reason ?? '', /JUDGE_STOP_BLOCKED/);
    assert.match(out.reason ?? '', /aggregate=MIXED/);
    assert.match(out.reason ?? '', /sc2/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tool, 'engineering.judge.verify');
  });

  it('Stop: genuinely supported completion is allowed (no decision)', async () => {
    const { client, calls } = mockJudge({
      verify: () => ({
        aggregate: 'ALL_SUPPORTED',
        claims: [{ id: 'sc1', text: 'suite green', verdict: 'supported', probability: 0.95 }],
      }),
    });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client, stopEvidence: () => '{"ok":true}' }));
    assert.ok(gate);
    const out = await gate.handlers.stop({
      hook_event_name: 'Stop',
      last_assistant_message: 'Mission complete: all criteria met.',
    }, 'tu-18');
    assert.deepEqual(out, {});
    assert.equal(calls.length, 1);
  });

  it('Stop: anti-loop (stop_hook_active) and non-completion messages make zero judge calls', async () => {
    const { client, calls } = mockJudge({ verify: () => ({ aggregate: 'ALL_SUPPORTED', claims: [] }) });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    assert.deepEqual(await gate.handlers.stop({ hook_event_name: 'Stop', stop_hook_active: true, last_assistant_message: 'Mission complete: all criteria met.' }, 'tu-19'), {});
    assert.deepEqual(await gate.handlers.stop({ hook_event_name: 'Stop', last_assistant_message: 'Still investigating the migration failure.' }, 'tu-20'), {});
    assert.equal(calls.length, 0);
  });
});

/* ------------------------------------------------------------------ */
/* Wiring gate (null paths) + runtime seam                             */
/* ------------------------------------------------------------------ */

describe('JUDGE-HOOKS-01: wiring gate and runtime seam', () => {
  const created: string[] = [];
  after(async () => {
    // cleanup is best-effort; tmpdirs are session-scoped anyway
    void created;
  });

  it('gate is null when disabled by env escape hatch (even with a token)', () => {
    assert.equal(buildJudgeGate(gateConfig({ env: { JUDGE_HOOKS_ENABLED: '0' } })), null);
    assert.equal(buildJudgeGate(gateConfig({ enabled: false })), null);
  });

  it('gate is null when no credential is resolvable (credentialPaths seam)', () => {
    const gate = buildJudgeGate(gateConfig({
      token: undefined,
      tokenCredentialFile: '/nonexistent/judge-hooks-no-token',
      credentialPaths: ['/nonexistent/judge-hooks-no-token'],
    }));
    assert.equal(gate, null);
  });

  it('hooks shape matches the official SDK contract', () => {
    const { client } = mockJudge({});
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    assert.equal(gate.hooks.PreToolUse?.[0]?.matcher, 'Bash');
    assert.equal(gate.hooks.PostToolUse?.[0]?.matcher, '*');
    assert.equal(gate.hooks.Stop?.[0]?.matcher, undefined);
    assert.equal(gate.hooks.PreToolUse?.[0]?.timeout, 3); // ceil(2000/1000)+1
    assert.equal(typeof gate.hooks.PreToolUse?.[0]?.hooks[0], 'function');
  });

  type SdkMessageFixture = Record<string, unknown>;

  function fakeQueryFromScripts(scripts: SdkMessageFixture[][]): { query: QueryFn; calls: Array<{ prompt: string; options?: ClaudeQueryOptions }> } {
    const calls: Array<{ prompt: string; options?: ClaudeQueryOptions }> = [];
    const query: QueryFn = (params) => {
      calls.push({ prompt: params.prompt, options: params.options });
      const messages = scripts[Math.min(calls.length - 1, scripts.length - 1)];
      const iterator = (async function* generate(): AsyncGenerator<SdkMessageFixture, void, unknown> {
        for (const message of messages) yield message;
      })();
      return Object.assign(iterator, { interrupt: async () => undefined });
    };
    return { query, calls };
  }

  function minimalContract(missionId: string): MissionContract {
    return {
      missionId,
      objective: `execute ${missionId}`,
      allowedActions: ['channel:eng-mcp'],
      completionCriteria: ['claude-agent-sdk:result:success'],
      maxCycles: 3,
      maxDurationMs: 60_000,
    };
  }

  const resultMessage = (sessionId: string): SdkMessageFixture =>
    ({ type: 'result', subtype: 'success', session_id: sessionId, is_error: false, total_cost_usd: 0 });

  it('runtime wires judge gate hooks when a bearer is resolvable; absent with the escape hatch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'judge-hooks-'));
    const credFile = join(dir, 'token');
    await writeFile(credFile, 'jh-runtime-token-value', 'utf8');
    created.push(dir);

    const first = fakeQueryFromScripts([[resultMessage('sess-jh-1')]]);
    const runtime = new ClaudeAgentRuntime({ queryFactory: first.query, env: { JUDGE_HOOK_TOKEN_CREDENTIAL_FILE: credFile } });
    await runtime.runMission(minimalContract('jh-runtime-on'), createInitialState(minimalContract('jh-runtime-on'), 1000));
    const hooks = first.calls[0].options?.hooks;
    assert.ok(hooks, 'hooks must be wired when the credential resolves');
    assert.ok(Array.isArray(hooks.PreToolUse) && hooks.PreToolUse.length > 0);
    assert.ok(Array.isArray(hooks.PostToolUse) && hooks.PostToolUse.length > 0);
    assert.ok(Array.isArray(hooks.Stop) && hooks.Stop.length > 0);

    const second = fakeQueryFromScripts([[resultMessage('sess-jh-2')]]);
    const runtimeOff = new ClaudeAgentRuntime({ queryFactory: second.query, env: { JUDGE_HOOKS_ENABLED: '0' } });
    await runtimeOff.runMission(minimalContract('jh-runtime-off'), createInitialState(minimalContract('jh-runtime-off'), 1000));
    assert.equal(second.calls[0].options?.hooks, undefined);
  });
});

/* ------------------------------------------------------------------ */
/* OPERATOR POLICY 2026-09-24 (e3e277bd): default auto-allow route      */
/* ------------------------------------------------------------------ */

describe('JUDGE-HOOKS-01 gate: operator policy auto (JUDGE_CONSEQUENCE_POLICY unset)', () => {
  it('consequence route auto-allows with CONSEQUENCE_AUTO marker when the flag is unset', async () => {
    const prev = process.env.JUDGE_CONSEQUENCE_POLICY;
    delete process.env.JUDGE_CONSEQUENCE_POLICY;
    try {
      const { client } = mockJudge({ evaluate: noulResult(0.05) });
      const gate = buildJudgeGate(gateConfig({ judgeClient: client, unattended: false }));
      assert.ok(gate);
      const out = await gate.handlers.preToolUse(bashInput('rm -rf /tmp/policy-auto-proof'), 'tu-policy-1');
      assert.equal(decisionOf(out), 'allow');
      assert.match(reasonOf(out) ?? '', /CONSEQUENCE_AUTO_ALLOWED/);
    } finally {
      if (prev === undefined) delete process.env.JUDGE_CONSEQUENCE_POLICY;
      else process.env.JUDGE_CONSEQUENCE_POLICY = prev;
    }
  });
});
