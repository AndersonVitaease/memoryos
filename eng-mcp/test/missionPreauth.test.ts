/**
 * AUTO-RUN-01A — engineering.mission.preauth + the gate's manifestCheck seam.
 *
 * Hermetic: temp manifest dir + temp audit file, mocked judge client (zero
 * network), real classification/matching code. Proves the mission's E2E set:
 *   (a) 3 benign manifest operations execute with judge GO (C1), audited;
 *   (b) a command outside the patterns keeps the normal band-2 flow;
 *   (c) expired / corrupt / tampered / insecure / revoked manifests auto-approve nothing;
 *   (d) a manifest carrying a denylist command is REFUSED at creation;
 *   (e) consequences (band 3) stay with the operator even with a match-everything
 *       manifest check — the seam is never even consulted for them;
 *   + apply-time revalidation: drift / scope / metacharacters = outside the manifest.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { buildJudgeGate, type JudgeClient, type JudgeGateEvidenceEntry, type JudgeHookInput } from '../src/harness/judgeGate.js';
// Legacy-semantics suite: pins the operator route (ask/deny). The default
// auto-allow policy (e3e277bd) has its own coverage in judgeHooks.test.ts.
process.env.JUDGE_CONSEQUENCE_POLICY = 'operator';
import { loadActiveManifests, manifestHash16, matchManifests, sha16, validateManifest, type MissionManifest } from '../src/missionManifest.js';
import { runMissionPreauth } from '../src/missionPreauth.js';

const WORK = '/tmp/autorun-01a-work';
const OPERATOR = { subject: 'operator-test-a', scopes: ['engineering:write', 'engineering:mission:preauth'] };
const BENIGN = [
  { id: 'syntax-check', pattern: 'node --check *', fileScope: [`${WORK}/**`] },
  { id: 'eval-probe', pattern: 'node -e "console.log(1)"' },
  { id: 'mkdir-work', pattern: 'mkdir -p *', fileScope: [`${WORK}/**`] },
];

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'autorun-01a-'));
  return { dir: join(root, 'manifests'), auditFile: join(root, 'audit', 'manifests.jsonl') };
}

function create(sb: ReturnType<typeof sandbox>, ops = BENIGN, extra: Record<string, unknown> = {}, now = Date.now()) {
  return runMissionPreauth({ mission: 'AUTO-RUN-01A-TEST', windowMinutes: 30, operations: ops, execute: true, approval: { approved: true }, approvedBy: 'operator-test', ...extra }, { caller: OPERATOR, manifestDir: sb.dir, auditFile: sb.auditFile, now: () => now });
}

function gateWith(sb: ReturnType<typeof sandbox>, judgeAnswer: 'benign' | 'medium' = 'benign', now: () => number = Date.now) {
  const calls: string[] = [];
  const evidence: JudgeGateEvidenceEntry[] = [];
  const judgeClient: JudgeClient = async (tool) => {
    calls.push(tool);
    const p = judgeAnswer === 'benign' ? 0.02 : 0.2;
    return { ok: true, data: { answers: ['q_destructive', 'q_outward_facing', 'q_touches_credentials', 'q_large_blast_radius'].map((id) => ({ id, probability: p })) } };
  };
  const gate = buildJudgeGate({
    token: 't',
    unattended: false,
    judgeClient,
    evidenceSink: (e) => evidence.push(e),
    manifestCheck: (command, cwd) => matchManifests(command, cwd, loadActiveManifests(sb.dir, now()).active),
  });
  assert.ok(gate);
  return { gate: gate!, calls, evidence };
}

const pre = (command: string): JudgeHookInput => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: WORK });

describe('AUTO-RUN-01A admission (engineering.mission.preauth)', () => {
  it('PLAN is the default and performs ZERO mutation; benign ops classify as band 2', () => {
    const sb = sandbox();
    const r = runMissionPreauth({ mission: 'AUTO-RUN-01A-TEST', windowMinutes: 30, operations: BENIGN }, { caller: OPERATOR, manifestDir: sb.dir, auditFile: sb.auditFile });
    assert.equal(r.status, 'PLAN');
    assert.equal(r.mutationPerformed, false);
    assert.deepEqual((r as { classifications: Array<{ band: number }> }).classifications.map((c) => c.band), [2, 2, 2]);
    assert.equal(existsSync(join(sb.dir, 'AUTO-RUN-01A-TEST.json')), false);
  });

  it('(d) a manifest with a denylist command is REFUSED at creation (fixed list, gate band 3, metacharacters)', () => {
    const sb = sandbox();
    for (const [pattern, reason] of [
      ['git push origin main', /CONSEQUENCE_DENYLIST:push/],
      ['rm -rf /tmp/x', /CONSEQUENCE_DENYLIST:rm/],
      ['cat /opt/app/.env', /CONSEQUENCE_DENYLIST:\.env/],
      ['chmod +x /tmp/x', /GATE_BAND3:permission-change/],
      ['node -e 1; id', /SHELL_METACHARACTER/],
    ] as const) {
      const r = create(sb, [...BENIGN, { id: 'bad', pattern }]);
      assert.equal(r.status, 'REFUSED', pattern);
      assert.equal(r.mutationPerformed, false);
      assert.match(JSON.stringify((r as { refused: unknown }).refused), reason, pattern);
      assert.equal(existsSync(join(sb.dir, 'AUTO-RUN-01A-TEST.json')), false, 'nothing written');
    }
    const audit = readFileSync(sb.auditFile, 'utf8');
    assert.match(audit, /"event":"refused"/);
    assert.doesNotMatch(audit, /git push origin main/, 'audit is metadata-only');
  });

  it('execute needs approval; CREATED writes 0600 with a valid hash16; a second create is MANIFEST_ACTIVE', () => {
    const sb = sandbox();
    const noApproval = runMissionPreauth({ mission: 'AUTO-RUN-01A-TEST', operations: BENIGN, execute: true }, { caller: OPERATOR, manifestDir: sb.dir, auditFile: sb.auditFile });
    assert.equal(noApproval.status, 'APPROVAL_REQUIRED');
    const r = create(sb);
    assert.equal(r.status, 'CREATED');
    const path = join(sb.dir, 'AUTO-RUN-01A-TEST.json');
    assert.equal(statSync(path).mode & 0o777, 0o600);
    const m = JSON.parse(readFileSync(path, 'utf8')) as MissionManifest;
    assert.equal(m.holder, m.mission);
    assert.equal(validateManifest(m, Date.now()), null);
    assert.equal(create(sb).status, 'MANIFEST_ACTIVE');
    assert.match(readFileSync(sb.auditFile, 'utf8'), new RegExp(`"event":"create".*"hash16":"${m.hash16}"`));
  });
});

describe('AUTO-RUN-01A apply-time check (gate manifestCheck seam)', () => {
  it('(a) 3 benign manifest operations get judge GO (C1) and are allowed, evidence carries manifest + pattern id', async () => {
    const sb = sandbox();
    create(sb);
    const { gate, calls, evidence } = gateWith(sb);
    for (const [cmd, id] of [[`node --check ${WORK}/a.mjs`, 'syntax-check'], ['node -e "console.log(1)"', 'eval-probe'], [`mkdir -p ${WORK}/sub`, 'mkdir-work']]) {
      const out = await gate.handlers.preToolUse(pre(cmd));
      assert.equal(out.hookSpecificOutput?.permissionDecision, 'allow', cmd);
      assert.match(out.hookSpecificOutput?.permissionDecisionReason ?? '', new RegExp(`MANIFEST_PREAUTH_GO: manifest=AUTO-RUN-01A-TEST pattern=${id}`), cmd);
    }
    assert.deepEqual(calls, ['engineering.judge.evaluate', 'engineering.judge.evaluate', 'engineering.judge.evaluate'], 'C1: one judge triage per manifest match (GO/NO-GO)');
    assert.equal(evidence.filter((e) => e.key.startsWith('judge_gate:manifest-go:AUTO-RUN-01A-TEST:')).length, 3);
    assert.ok(evidence.every((e) => e.key.startsWith('judge_gate:manifest-go:') && JSON.parse(e.value).route === 'allow'), 'all 3 benign matches route allow (GO)');
  });

  it('(b) a command outside the patterns keeps the normal band-2 flow (judge + ask on medium)', async () => {
    const sb = sandbox();
    create(sb);
    const { gate, calls } = gateWith(sb, 'medium');
    const out = await gate.handlers.preToolUse(pre('node -e "console.log(2)"'));
    assert.equal(out.hookSpecificOutput?.permissionDecision, 'ask');
    assert.match(out.hookSpecificOutput?.permissionDecisionReason ?? '', /BAND2_GRAY_MEDIUM/);
    assert.deepEqual(calls, ['engineering.judge.evaluate']);
  });

  it('(c) expired / corrupt / tampered / insecure / revoked manifests auto-approve NOTHING (fail-closed)', async () => {
    const cmd = `node --check ${WORK}/a.mjs`;
    // expired: created 60 min ago with a 30 min window
    const expired = sandbox();
    create(expired, BENIGN, {}, Date.now() - 60 * 60_000);
    assert.equal(loadActiveManifests(expired.dir).rejected[0]?.reason, 'EXPIRED');
    const g1 = gateWith(expired, 'medium');
    assert.equal((await g1.gate.handlers.preToolUse(pre(cmd))).hookSpecificOutput?.permissionDecision, 'ask');
    // tampered: operations edited after approval → hash mismatch
    const tampered = sandbox();
    create(tampered);
    const path = join(tampered.dir, 'AUTO-RUN-01A-TEST.json');
    const m = JSON.parse(readFileSync(path, 'utf8')) as MissionManifest;
    m.operations.push({ id: 'smuggled', pattern: 'node -e "console.log(2)"' });
    writeFileSync(path, JSON.stringify(m), { mode: 0o600 });
    assert.equal(loadActiveManifests(tampered.dir).rejected[0]?.reason, 'HASH_MISMATCH');
    // corrupt
    writeFileSync(path, '{not json', { mode: 0o600 });
    assert.equal(loadActiveManifests(tampered.dir).rejected[0]?.reason, 'UNREADABLE_OR_CORRUPT');
    // insecure mode
    const insecure = sandbox();
    create(insecure);
    chmodSync(join(insecure.dir, 'AUTO-RUN-01A-TEST.json'), 0o666);
    assert.equal(loadActiveManifests(insecure.dir).rejected[0]?.reason, 'INSECURE_MODE');
    // revoked
    const revoked = sandbox();
    create(revoked);
    const rv = runMissionPreauth({ action: 'revoke', mission: 'AUTO-RUN-01A-TEST', execute: true, approval: { approved: true } }, { caller: OPERATOR, manifestDir: revoked.dir, auditFile: revoked.auditFile });
    assert.equal(rv.status, 'REVOKED');
    assert.equal(loadActiveManifests(revoked.dir).rejected[0]?.reason, 'REVOKED');
    for (const sb of [tampered, insecure, revoked]) {
      const g = gateWith(sb, 'medium');
      assert.equal((await g.gate.handlers.preToolUse(pre(cmd))).hookSpecificOutput?.permissionDecision, 'ask');
    }
  });

  it('(e)/point 4: band 3 stays human even with a match-everything seam; a hand-planted consequence manifest is rejected', async () => {
    let consulted = 0;
    const gate = buildJudgeGate({
      token: 't',
      unattended: false,
      judgeClient: async () => ({ ok: true, data: { answers: [] } }),
      manifestCheck: () => {
        consulted += 1;
        return { mission: 'EVIL', patternId: 'all', hash16: '0000000000000000', expiresAt: '2999-01-01T00:00:00Z' };
      },
    })!;
    for (const cmd of ['git push origin main', 'rm -rf /tmp/x', 'chmod 777 /etc/passwd']) {
      const out = await gate.handlers.preToolUse(pre(cmd));
      assert.equal(out.hookSpecificOutput?.permissionDecision, 'ask', cmd);
      assert.match(out.hookSpecificOutput?.permissionDecisionReason ?? '', /BAND3_CONSEQUENCE/);
    }
    assert.equal(consulted, 0, 'the manifest seam is never consulted for band 3');
    // A manifest planted on disk with a consequence pattern (bypassing admission) is refused at load.
    const sb = sandbox();
    create(sb);
    const path = join(sb.dir, 'AUTO-RUN-01A-TEST.json');
    const m = JSON.parse(readFileSync(path, 'utf8')) as MissionManifest;
    m.operations = [{ id: 'push', pattern: 'git push origin main' }];
    m.hash16 = manifestHash16(m);
    writeFileSync(path, JSON.stringify(m), { mode: 0o600 });
    assert.equal(loadActiveManifests(sb.dir).rejected[0]?.reason, 'CONSEQUENCE_IN_MANIFEST');
    assert.equal(matchManifests('git push origin main', WORK, [m]), null, 'matcher re-refuses consequences on the real command');
  });

  it('point 5: apply-time revalidation — drift, out-of-scope paths and metacharacters are outside the manifest', () => {
    const sb = sandbox();
    create(sb);
    const active = loadActiveManifests(sb.dir).active;
    assert.ok(matchManifests(`node --check ${WORK}/a.mjs`, WORK, active));
    assert.ok(matchManifests('node --check a.mjs', WORK, active), 'relative path resolved against cwd inside scope');
    assert.equal(matchManifests('node --check /etc/a.mjs', WORK, active), null, 'out of file scope');
    assert.equal(matchManifests('node --check ../escape.mjs', WORK, active), null, 'relative escape out of scope');
    assert.equal(matchManifests(`node --check ${WORK}/a.mjs --eval x`, WORK, active), null, 'drift: extra args');
    assert.equal(matchManifests(`node --check ${WORK}/a.mjs; id`, WORK, active), null, 'metacharacter chaining');
    assert.equal(matchManifests('node -e "console.log(1)" && id', WORK, active), null);
  });
});

describe('AUTO-RUN-01A through the portable hook (child process)', () => {
  it('benign manifest op → MANIFEST_PREAUTH_GO via judge-hook.mjs; audit match line written', async () => {
    const sb = sandbox();
    create(sb);
    const cred = join(sb.dir, '..', 'cred');
    writeFileSync(cred, 'test-bearer-not-real\n', { mode: 0o600 });
    const hook = resolve(import.meta.dirname, '..', '.claude', 'hooks', 'judge-hook.mjs');
    const out = await new Promise<string>((done, fail) => {
      const child = spawn(process.execPath, [hook, '--server-url', 'http://127.0.0.1:1/mcp'], {
        env: { PATH: process.env.PATH ?? '', HOME: join(sb.dir, '..'), JUDGE_HOOK_TOKEN_CREDENTIAL_FILE: cred, JUDGE_HOOK_LOG: join(sb.dir, '..', 'hook.jsonl'), ENG_MCP_MANIFEST_DIR: sb.dir, ENG_MCP_MANIFEST_AUDIT: sb.auditFile },
      });
      let stdout = '';
      child.stdout.on('data', (c) => (stdout += c));
      child.on('error', fail);
      child.on('close', () => done(stdout));
      child.stdin.end(JSON.stringify({ ...pre(`node --check ${WORK}/x.mjs`), session_id: 'autorun-test' }));
    });
    const parsed = JSON.parse(out.trim()) as { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } };
    // C1 fail-closed: the child hook runs against a DEAD judge → the manifest
    // path HOLDs even pre-approved (prova 2 at the hook level).
    assert.equal(parsed.hookSpecificOutput?.permissionDecision, 'ask');
    assert.match(parsed.hookSpecificOutput?.permissionDecisionReason ?? '', /MANIFEST_HOLD_NOGO: judge unavailable .* AUTO-RUN-01A-TEST pattern=syntax-check holds even pre-approved/);
    assert.match(readFileSync(sb.auditFile, 'utf8'), /"event":"match","manifest":"AUTO-RUN-01A-TEST","patternId":"syntax-check"/);
  });
});

describe('PREAUTH-SCOPE-01 dedicated operator scope (engineering:mission:preauth)', () => {
  const WRITE_ONLY = { subject: 'claude-code-2', scopes: ['engineering:write'] };
  const ops = BENIGN;
  const deps = (sb: ReturnType<typeof sandbox>, caller?: { subject: string; scopes: string[] }) => ({ caller, manifestDir: sb.dir, auditFile: sb.auditFile });

  it('(a) engineering:write WITHOUT the scope: create PLAN and execute are REFUSED AUTHORIZATION_SCOPE_REQUIRED, nothing written', () => {
    const sb = sandbox();
    for (const input of [{ mission: 'SCOPE-TEST', operations: ops }, { mission: 'SCOPE-TEST', operations: ops, execute: true, approval: { approved: true } }]) {
      assert.throws(() => runMissionPreauth(input, deps(sb, WRITE_ONLY)), (e: Error & { code?: string }) => e.code === 'AUTHORIZATION_SCOPE_REQUIRED');
      assert.throws(() => runMissionPreauth(input, deps(sb)), (e: Error & { code?: string }) => e.code === 'AUTHORIZATION_SCOPE_REQUIRED', 'no caller = fail-closed');
    }
    assert.equal(existsSync(join(sb.dir, 'SCOPE-TEST.json')), false);
    const line = JSON.parse(readFileSync(sb.auditFile, 'utf8').trim().split('\n')[0]) as Record<string, unknown>;
    assert.equal(line.event, 'create_refused');
    assert.match(String(line.subjectHash16), /^[0-9a-f]{16}$/);
  });

  it('(b) operator with the scope: PLAN + execute work; status needs no scope; audit carries subjectHash16 + approvedByHash16', () => {
    const sb = sandbox();
    assert.equal(runMissionPreauth({ mission: 'SCOPE-TEST', operations: ops }, deps(sb, OPERATOR)).status, 'PLAN');
    const r = runMissionPreauth({ mission: 'SCOPE-TEST', operations: ops, execute: true, approval: { approved: true }, approvedBy: 'operator-test-a' }, deps(sb, OPERATOR));
    assert.equal(r.status, 'CREATED');
    const m = JSON.parse(readFileSync(join(sb.dir, 'SCOPE-TEST.json'), 'utf8')) as MissionManifest;
    assert.equal(m.createdBySubjectHash16, sha16('operator-test-a'));
    assert.equal(validateManifest(m, Date.now()), null, 'creator hash is inside the hashed body');
    const tampered = { ...m, createdBySubjectHash16: sha16('someone-else') };
    assert.equal(validateManifest(tampered, Date.now()), 'HASH_MISMATCH', 'creator field is tamper-evident');
    assert.equal(runMissionPreauth({ action: 'status' }, deps(sb, WRITE_ONLY)).status, 'STATUS');
    const create = readFileSync(sb.auditFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => l.event === 'create')!;
    assert.equal(create.subjectHash16, sha16('operator-test-a'));
    assert.equal(create.approvedByHash16, sha16('operator-test-a'));
  });

  it('revoke: creator OR operator-* allowed; a foreign non-operator is refused', () => {
    const sb = sandbox();
    const creator = { subject: 'goose-eng-mcp-2', scopes: ['engineering:write', 'engineering:mission:preauth'] };
    runMissionPreauth({ mission: 'SCOPE-TEST', operations: ops, execute: true, approval: { approved: true } }, deps(sb, creator));
    const revoke = { action: 'revoke' as const, mission: 'SCOPE-TEST', execute: true, approval: { approved: true } };
    assert.throws(() => runMissionPreauth(revoke, deps(sb, WRITE_ONLY)), (e: Error & { code?: string }) => e.code === 'AUTHORIZATION_SCOPE_REQUIRED');
    assert.equal(runMissionPreauth(revoke, deps(sb, creator)).status, 'REVOKED', 'creator revokes without the operator prefix');
    const sb2 = sandbox();
    runMissionPreauth({ mission: 'SCOPE-TEST', operations: ops, execute: true, approval: { approved: true } }, deps(sb2, creator));
    assert.equal(runMissionPreauth(revoke, deps(sb2, { subject: 'operator-2026-09-17b', scopes: ['engineering:write'] })).status, 'REVOKED', 'any operator revokes, even without the preauth scope');
  });

  it('pre-v109 manifests (no createdBySubjectHash16) keep validating and matching', () => {
    const now = Date.now();
    const body = { version: 1, mission: 'LEGACY-01A', holder: 'LEGACY-01A', createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 60_000).toISOString(), operations: [{ id: 'p', pattern: 'node -e 1' }], approvedBy: 'op' };
    const legacy = { ...body, hash16: manifestHash16(body) } as MissionManifest;
    assert.equal(validateManifest(legacy, now), null);
    assert.ok(matchManifests('node -e 1', WORK, [legacy]));
  });
});
