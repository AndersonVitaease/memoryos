/**
 * HOOKS-CALIBRATION-01 — contract tests for the calibrated band-1 allowlist,
 * the Stop-hook operator-question check and the band-2 read-only floor
 * (src/harness/judgeGate.ts).
 *
 * Every allowlist rule gets at least one POSITIVE contract (fires with the
 * right rule name) and one NEGATIVE contract (a near-miss that must NOT
 * fire). Tier-3 invariants are asserted end-to-end through preToolUse: a
 * denylisted command NEVER becomes band 1 because of a redirect to /tmp.
 * Deterministic: mocked judge seam, zero network, zero credentials.
 */
import assert from 'node:assert/strict';
// Same pin as judgeHooks.test.ts: this suite asserts operator-route machinery.
process.env.JUDGE_CONSEQUENCE_POLICY = 'operator';
import { describe, it } from 'node:test';
import {
  ALLOWLIST_VERSION,
  JUDGE_BAND2_READ_ONLY_FLOOR,
  awaitsOperatorInput,
  buildJudgeGate,
  classifyAllowlist,
  isReadOnlyIndicative,
  type JudgeClient,
  type JudgeGateConfig,
  type JudgeGateEvidenceEntry,
  type JudgeHookInput,
  type JudgeHookJSONOutput,
} from '../src/harness/judgeGate.js';

const BAND2_IDS = ['q_destructive', 'q_outward_facing', 'q_touches_credentials', 'q_large_blast_radius'] as const;

/* ------------------------------------------------------------------ */
/* Mock judge client seam (mirrors judgeHooks.test.ts)                 */
/* ------------------------------------------------------------------ */

interface MockCall { tool: string; args: Record<string, unknown> }

function mockJudge(handlers: { evaluate?: unknown; verify?: unknown }): { client: JudgeClient; calls: MockCall[] } {
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

const noulResult = (p: number) => ({
  answers: BAND2_IDS.map((id) => ({ id, type: 'noul', probability: p, complementProbability: 1 - p })),
});

const bashInput = (command: string): JudgeHookInput => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command },
  tool_use_id: 'tu-cal',
});

function gateConfig(over: Partial<JudgeGateConfig> = {}): JudgeGateConfig {
  return { serverUrl: 'http://127.0.0.1:1/mcp', token: 'test-token-never-logged', unattended: true, ...over };
}

const decisionOf = (out: JudgeHookJSONOutput): string | undefined => out.hookSpecificOutput?.permissionDecision;
const reasonOf = (out: JudgeHookJSONOutput): string | undefined => out.hookSpecificOutput?.permissionDecisionReason;

/* ------------------------------------------------------------------ */
/* classifyAllowlist — one positive + one negative per rule            */
/* ------------------------------------------------------------------ */

describe('HOOKS-CALIBRATION-01: classifyAllowlist rule contracts', () => {
  it('version-query: exact version commands fire; near-misses do not', () => {
    assert.equal(classifyAllowlist('node --version'), 'version-query');
    assert.equal(classifyAllowlist('git --version'), 'version-query');
    assert.equal(classifyAllowlist('node --version --help'), null); // extra args → not exact
  });

  it('git-read-inventory: read subcommands (with -C) fire; mutation subcommands do not', () => {
    assert.equal(classifyAllowlist('git status'), 'git-read-inventory');
    assert.equal(classifyAllowlist('git log --oneline -5'), 'git-read-inventory');
    assert.equal(classifyAllowlist('git -C /opt/memoryos status'), 'git-read-inventory');
    assert.equal(classifyAllowlist('git push origin main'), null);
    assert.equal(classifyAllowlist('git reset --hard HEAD'), null);
  });

  it('git-local-write: add/commit/stash/tag/config are local-reversible band 1', () => {
    assert.equal(classifyAllowlist('git add src/a.ts'), 'git-local-write');
    assert.equal(classifyAllowlist('git commit -m "msg"'), 'git-local-write');
    assert.equal(classifyAllowlist('git stash list'), 'git-local-write');
    // denylist-free requirement: a credential path stays OUT even with git add
    assert.equal(classifyAllowlist('git add tokens.json'), null);
  });

  it('docker-read: read subcommands and nested ls fire; mutations do not', () => {
    assert.equal(classifyAllowlist('docker ps'), 'docker-read');
    assert.equal(classifyAllowlist('docker inspect eng-mcp'), 'docker-read');
    assert.equal(classifyAllowlist('docker image ls'), 'docker-read');
    assert.equal(classifyAllowlist('docker container ls -a'), 'docker-read');
    assert.equal(classifyAllowlist('docker system prune -af'), null);
    assert.equal(classifyAllowlist('docker rm x'), null);
  });

  it('find-read: guarded — mutation flags never classify', () => {
    assert.equal(classifyAllowlist('find . -name "*.ts" -type f'), 'find-read');
    assert.equal(classifyAllowlist('find . -name x -delete'), null);
    assert.equal(classifyAllowlist('find . -name x -exec rm {} \\;'), null);
    assert.equal(classifyAllowlist('find . -name x -fls /tmp/out'), null);
  });

  it('env-names-only: bare env only as pipeline HEAD reduced to names by cut', () => {
    assert.equal(classifyAllowlist('env | cut -d= -f1'), 'read-only-pipeline');
    assert.equal(classifyAllowlist('env | sort | cut -d= -f1'), 'read-only-pipeline');
    assert.equal(classifyAllowlist('env'), null); // bare value dump
    assert.equal(classifyAllowlist('env | sort'), null); // no name-reducing cut
    assert.equal(classifyAllowlist('env FOO=bar | cut -d= -f1'), null); // env with args
    assert.equal(classifyAllowlist('printenv | cut -d= -f1'), null); // printenv never allowlisted
    assert.equal(classifyAllowlist('cat x | env'), null); // env not at HEAD
  });

  it('readonly-inspect: single readers fire; anything with an assignment or path prefix does not', () => {
    assert.equal(classifyAllowlist('ls -la /tmp'), 'readonly-inspect');
    assert.equal(classifyAllowlist('cat src/a.ts'), 'readonly-inspect');
    assert.equal(classifyAllowlist('grep -rn pattern src/'), 'readonly-inspect');
    assert.equal(classifyAllowlist('FOO=1 ls'), null); // env assignment prefix
    assert.equal(classifyAllowlist('./script.sh --check'), null); // arbitrary executable
    assert.equal(classifyAllowlist('/usr/bin/local-tool'), null);
  });

  it('local-reversible-write: mkdir/touch fire; rm/chmod never do', () => {
    assert.equal(classifyAllowlist('mkdir -p /tmp/a/b'), 'local-reversible-write');
    assert.equal(classifyAllowlist('touch /tmp/marker'), 'local-reversible-write');
    assert.equal(classifyAllowlist('rm -rf /tmp/a'), null); // denylist (tier 3)
    assert.equal(classifyAllowlist('chmod +x /tmp/a'), null); // denylist (tier 3)
  });

  it('read-only-redirect-tmp: output to /tmp or /dev/null keeps the command inert', () => {
    assert.equal(classifyAllowlist('git status > /tmp/inv.txt'), 'git-read-inventory');
    assert.equal(classifyAllowlist('git status > /tmp/inv.txt 2>&1'), 'git-read-inventory');
    assert.equal(classifyAllowlist('ls -la >> /tmp/inv.txt'), 'readonly-inspect');
    assert.equal(classifyAllowlist('docker ps 2>/dev/null'), 'docker-read');
    // NOT sinks: redirect to a repo path, or input redirection, stays out
    assert.equal(classifyAllowlist('git status > src/inv.txt'), null);
    assert.equal(classifyAllowlist('cat < /etc/passwd'), null);
  });

  it('read-only-pipeline: every stage must classify; a poisoned stage kills the rule', () => {
    assert.equal(classifyAllowlist('git status | head -20'), 'read-only-pipeline');
    assert.equal(classifyAllowlist('cat a | grep b | wc -l'), 'read-only-pipeline');
    assert.equal(classifyAllowlist('cat a | sort -o /tmp/s'), 'read-only-pipeline'); // sort -o to a sink
    assert.equal(classifyAllowlist('cat tokens.json | grep key'), null); // credential denylist in stage
    assert.equal(classifyAllowlist('cat a | sort -o out.txt'), null); // sort -o to a repo path
    assert.equal(classifyAllowlist('curl -s url | jq .'), null); // curl is not a reader
  });

  it('compound-allowlist: every segment must classify on its own', () => {
    assert.equal(classifyAllowlist('mkdir -p /tmp/a && touch /tmp/a/m'), 'compound-allowlist');
    assert.equal(classifyAllowlist('git status; git log --oneline -3'), 'compound-allowlist');
    assert.equal(classifyAllowlist('mkdir /tmp/a && rm -rf /tmp/a'), null); // one bad segment kills it
  });

  it('multi-line and empty commands never classify (defensive)', () => {
    assert.equal(classifyAllowlist(''), null);
    assert.equal(classifyAllowlist('ls\nrm x'), null);
    assert.equal(classifyAllowlist('   '), null);
  });
});

/* ------------------------------------------------------------------ */
/* preToolUse: BAND1_ALLOWLIST_MATCH reason + tier-3 invariants        */
/* ------------------------------------------------------------------ */

describe('HOOKS-CALIBRATION-01: preToolUse band-1 reason and tier-3 invariants', () => {
  it('allowlist match answers BAND1_ALLOWLIST_MATCH with the rule and version, zero judge calls', async () => {
    const { client, calls } = mockJudge({});
    const sink: JudgeGateEvidenceEntry[] = [];
    const gate = buildJudgeGate(gateConfig({ judgeClient: client, evidenceSink: (e) => sink.push(e) }));
    assert.ok(gate);
    const out = await gate.handlers.preToolUse(bashInput('git status > /tmp/inv.txt'), 'cal-1');
    assert.equal(decisionOf(out), 'allow');
    assert.match(reasonOf(out) ?? '', /BAND1_ALLOWLIST_MATCH: rule=git-read-inventory/);
    assert.match(reasonOf(out) ?? '', new RegExp(ALLOWLIST_VERSION));
    assert.equal(calls.length, 0);
    const ev = sink.find((e) => e.key.startsWith('judge_gate:band1:'));
    assert.ok(ev);
    assert.match(ev.value, /"rule":"git-read-inventory"/);
    assert.match(ev.value, new RegExp(ALLOWLIST_VERSION));
  });

  it('INVARIANT tier-3: `git push > /tmp/x` still routes to the operator (denylist wins)', async () => {
    const { client, calls } = mockJudge({ evaluate: (args: Record<string, unknown>) => {
      const state = args.state as { band3?: boolean } | undefined;
      return state?.band3 === true ? { answers: [{ id: 'q_any', type: 'choice', choice: 'production_mutation', probabilities: {}, confidence: 0.9 }] } : noulResult(0.05);
    } });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    const out = await gate.handlers.preToolUse(bashInput('git push origin main > /tmp/push.log'), 'cal-t1');
    assert.equal(decisionOf(out), 'deny');
    assert.match(reasonOf(out) ?? '', /BAND3_CONSEQUENCE/);
    assert.doesNotMatch(reasonOf(out) ?? '', /ALLOWLIST/);
    assert.equal(calls.length, 1); // context-only evaluate (band3:true)
    assert.equal((calls[0].args.state as { band3?: boolean }).band3, true);
  });

  it('INVARIANT tier-3: `rm x > /tmp/y` stays denylisted despite the /tmp redirect', async () => {
    const { client } = mockJudge({ evaluate: noulResult(0.05) });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    const outRm = await gate.handlers.preToolUse(bashInput('rm -rf build > /tmp/rm.log'), 'cal-t2');
    assert.equal(decisionOf(outRm), 'deny');
    assert.match(reasonOf(outRm) ?? '', /BAND3_CONSEQUENCE/);
  });

  it('INVARIANT tier-3: credential file read redirected to /tmp never classifies', async () => {
    const { client, calls } = mockJudge({ evaluate: noulResult(0.05) });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    assert.equal(classifyAllowlist('cat src/auth-session.token.json > /tmp/dump.txt'), null);
    assert.equal(classifyAllowlist('cat /run/secrets/git-credentials'), null);
    const out = await gate.handlers.preToolUse(bashInput('cat src/auth-session.token.json > /tmp/dump.txt'), 'cal-t3');
    assert.equal(decisionOf(out), 'deny');
    assert.match(reasonOf(out) ?? '', /BAND3_CONSEQUENCE|credential/);
    assert.equal(calls.length, 1);
  });
});

/* ------------------------------------------------------------------ */
/* Band-2 read-only floor                                              */
/* ------------------------------------------------------------------ */

describe('HOOKS-CALIBRATION-01: band-2 read-only floor', () => {
  it('read-only-indicative command with safeScore 0.64 auto-executes at the 0.6 floor', async () => {
    const { client, calls } = mockJudge({ evaluate: noulResult(0.36) }); // safe = 0.64
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    const out = await gate.handlers.preToolUse(bashInput('npm ls --depth=0'), 'cal-b1');
    assert.equal(decisionOf(out), 'allow');
    assert.match(reasonOf(out) ?? '', /BAND2_GRAY_AUTO/);
    assert.match(reasonOf(out) ?? '', /read-only floor 0\.6/);
  });

  it('ambiguous command with the same 0.64 score stays in the blocking gray zone', async () => {
    const { client } = mockJudge({ evaluate: noulResult(0.36) }); // safe = 0.64
    const gate = buildJudgeGate(gateConfig({ judgeClient: client }));
    assert.ok(gate);
    const out = await gate.handlers.preToolUse(bashInput('tar -cf /tmp/a.tar /tmp/b'), 'cal-b2');
    assert.equal(decisionOf(out), 'deny');
    assert.match(reasonOf(out) ?? '', /BAND2_GRAY_MEDIUM/);
  });

  it('isReadOnlyIndicative: deterministic signals, never for denylisted commands', () => {
    assert.equal(isReadOnlyIndicative('npm ls'), true);
    assert.equal(isReadOnlyIndicative('pip list'), true);
    assert.equal(isReadOnlyIndicative('tar -tf /tmp/a.tar'), true);
    assert.equal(isReadOnlyIndicative('unzip -l /tmp/a.zip'), true);
    assert.equal(isReadOnlyIndicative('docker image ls'), true);
    assert.equal(isReadOnlyIndicative('git status'), true); // via classifyAllowlist
    assert.equal(isReadOnlyIndicative('git push origin main'), false); // denylist
    assert.equal(isReadOnlyIndicative('tar -cf /tmp/a.tar /tmp/b'), false); // -cf is a write
    assert.equal(isReadOnlyIndicative('npm publish'), false); // denylist
    assert.equal(isReadOnlyIndicative(''), false);
  });

  it('floor constant is the versioned 0.6 contract', () => {
    assert.equal(JUDGE_BAND2_READ_ONLY_FLOOR, 0.6);
    assert.equal(typeof ALLOWLIST_VERSION, 'string');
  });
});

/* ------------------------------------------------------------------ */
/* Stop hook: operator-question close is never blocked                 */
/* ------------------------------------------------------------------ */

describe('HOOKS-CALIBRATION-01: awaitsOperatorInput', () => {
  it('unit contract: closes with question / operator opener', () => {
    assert.equal(awaitsOperatorInput('Quer que eu siga com o deploy?'), true);
    assert.equal(awaitsOperatorInput('Posso prosseguir?'), true);
    assert.equal(awaitsOperatorInput('Prefere a opção A ou B?'), true);
    assert.equal(awaitsOperatorInput('Relatório pronto. Aprova o deploy?'), true);
    assert.equal(awaitsOperatorInput('Tudo pronto. Aguardo sua decisão.'), true);
    assert.equal(awaitsOperatorInput('Do you want me to continue?'), true);
    assert.equal(awaitsOperatorInput('Waiting for your confirmation.'), true);
    assert.equal(awaitsOperatorInput('Mission complete: all criteria met.'), false);
    assert.equal(awaitsOperatorInput('Quer dizer, o teste passou.'), false); // opener mid-sentence, not the close
  });

  it('STOP: message ending in a question + COMPLETION_LIKE opener returns {} with ZERO judge calls', async () => {
    const { client, calls } = mockJudge({ verify: () => ({ aggregate: 'MIXED', claims: [] }) });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client, stopEvidence: () => '{"criteria":["x"]}' }));
    assert.ok(gate);
    const out = await gate.handlers.stop({
      hook_event_name: 'Stop',
      last_assistant_message: 'Missão concluída e critérios atendidos. Quer que eu faça o commit?',
    }, 'cal-s1');
    assert.deepEqual(out, {});
    assert.equal(calls.length, 0);
  });

  it('STOP: genuinely supported completion still verifies (regression guard preserved)', async () => {
    const { client, calls } = mockJudge({
      verify: () => ({ aggregate: 'ALL_SUPPORTED', claims: [{ id: 'sc1', text: 'ok', verdict: 'supported', probability: 0.95 }] }),
    });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client, stopEvidence: () => '{"ok":true}' }));
    assert.ok(gate);
    const out = await gate.handlers.stop({
      hook_event_name: 'Stop',
      last_assistant_message: 'Mission complete: all criteria met.',
    }, 'cal-s2');
    assert.deepEqual(out, {});
    assert.equal(calls.length, 1);
  });

  it('STOP: premature completion with unsupported claims is still blocked (calibration did not loosen the gate)', async () => {
    const { client, calls } = mockJudge({
      verify: () => ({
        aggregate: 'HAS_CONTRADICTIONS',
        claims: [{ id: 'sc1', text: 'deploy done', verdict: 'contradicted', probability: 0.1 }],
      }),
    });
    const gate = buildJudgeGate(gateConfig({ judgeClient: client, stopEvidence: () => '{"missionId":"cal","criteria":["x"]}' }));
    assert.ok(gate);
    const out = await gate.handlers.stop({
      hook_event_name: 'Stop',
      last_assistant_message: 'Deploy finalizado e missão completa.',
    }, 'cal-s3');
    assert.equal(out.decision, 'block');
    assert.match(out.reason ?? '', /JUDGE_STOP_BLOCKED/);
    assert.equal(calls.length, 1);
  });
});
