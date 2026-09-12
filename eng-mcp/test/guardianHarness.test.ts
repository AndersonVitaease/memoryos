/**
 * GH-01 — First proof: FakeAgentRuntime simulating the mission
 * "Alterar duas regiões de um arquivo, fazer backup e validar sintaxe".
 * Criteria: backup_created, region_1_changed, region_2_changed, syntax_check_passed
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AgentCycleResult,
  AgentRuntime,
  Evidence,
  MissionContract,
  MissionState,
  deserializeState,
  serializeState,
} from '../src/harness/missionTypes.js';
import {
  classifySingleAttemptOutcome,
  evaluateCompletion,
  evaluateProgress,
  SINGLE_ATTEMPT_RECOVERY_POLICY,
  verifyEvidence,
} from '../src/harness/guards.js';
import { GuardianHarness, MemoryStateStore, okEvidence } from '../src/harness/GuardianHarness.js';

const OBJECTIVE = 'Alterar duas regiões de um arquivo, fazer backup e validar sintaxe.';
const CRITERIA = ['backup_created', 'region_1_changed', 'region_2_changed', 'syntax_check_passed'];

function makeContract(overrides: Partial<MissionContract> = {}): MissionContract {
  return {
    missionId: 'GH-01',
    objective: OBJECTIVE,
    allowedFiles: ['src/example.ts'],
    allowedActions: ['file_read', 'file_write', 'syntax_check'],
    forbiddenActions: ['git_push', 'deploy'],
    completionCriteria: CRITERIA,
    maxCycles: 10,
    maxDurationMs: 60_000,
    maxNoProgressCycles: 2,
    ...overrides,
  };
}

/** Fake runtime: scripted cycles, records executed steps (for resume proof). */
class FakeAgentRuntime implements AgentRuntime {
  executedSteps: string[] = [];
  cyclesRun = 0;
  private readonly script: AgentCycleResult[];

  constructor(script: AgentCycleResult[]) {
    this.script = script;
  }

  private async cycle(state: MissionState): Promise<AgentCycleResult> {
    this.cyclesRun += 1;
    const next = this.script[Math.min(this.cyclesRun - 1, this.script.length - 1)];
    const done = new Set(state.completedSteps);
    // Skip steps already completed (resume must not redo them).
    const steps = next.steps.filter((s) => !done.has(s));
    this.executedSteps.push(...steps);
    const now = Date.now();
    return {
      strategy: next.strategy,
      steps,
      evidence: steps.length > 0 ? next.evidence.map((e) => ({ ...e, timestamp: now })) : [],
      claimsComplete: next.claimsComplete,
      costUsd: next.costUsd,
    };
  }

  runMission(_c: MissionContract, state: MissionState): Promise<AgentCycleResult> {
    return this.cycle(state);
  }

  async continueMission(_c: MissionContract, state: MissionState): Promise<AgentCycleResult> {
    return this.cycle(state);
  }

  async cancelMission(): Promise<void> {
    /* no-op for fake */
  }

  async getEvidence(_c: MissionContract, state: MissionState): Promise<Evidence[]> {
    return state.evidence;
  }
}

function ev(type: Evidence['type'], key: string, status: 'ok' | 'fail' = 'ok'): Evidence {
  return {
    type,
    key,
    status,
    timestamp: 1_700_000_000_000,
    source: 'fake-runtime',
  };
}

test('GH-01/T1 — CompletionGuard recusa falso PASS sem evidência (agente alega "concluído")', async () => {
  const runtime = new FakeAgentRuntime([
    { strategy: 'claim-only', steps: ['backup_created', 'region_1_changed', 'region_2_changed', 'syntax_check_passed'], evidence: [], claimsComplete: true, costUsd: 0.01 },
  ]);
  const harness = new GuardianHarness(makeContract({ maxCycles: 1 }), runtime, { store: new MemoryStateStore() });
  await harness.begin();
  const result = await harness.run();
  assert.equal(result.status, 'BLOCKED', 'agente não pode forçar PASS');
  assert.match(result.reason ?? '', /max_cycles_exhausted/);
  // And the standalone evaluation also refuses:
  const verdict = evaluateCompletion(makeContract(), result.state);
  assert.equal(verdict.pass, false);
  assert.deepEqual(verdict.missing.sort(), [...CRITERIA].sort());
});

test('GH-01/T2 — PASS somente quando TODAS as evidências existem', async () => {
  const runtime = new FakeAgentRuntime([
    { strategy: 'do-work', steps: ['backup_created', 'region_1_changed', 'region_2_changed', 'syntax_check_passed'], evidence: [ev('file_changed', 'backup_created'), ev('file_changed', 'region_1_changed'), ev('file_changed', 'region_2_changed'), ev('syntax_check', 'syntax_check_passed')], claimsComplete: true, costUsd: 0.02 },
  ]);
  const harness = new GuardianHarness(makeContract(), runtime, { store: new MemoryStateStore() });
  await harness.begin();
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  const checks = verifyEvidence(CRITERIA, result.state.evidence);
  assert.equal(checks.every((c) => c.satisfied), true);
});

test('GH-01/T3 — duas rodadas sem progresso -> BLOCKED (no-progress guard)', async () => {
  const stuckEvidence = [ev('file_read', 'stuck_read')];
  const runtime = new FakeAgentRuntime([
    { strategy: 'stuck', steps: [], evidence: stuckEvidence, costUsd: 0.01 },
    { strategy: 'stuck', steps: [], evidence: stuckEvidence, costUsd: 0.01 },
    { strategy: 'stuck', steps: [], evidence: stuckEvidence, costUsd: 0.01 },
  ]);
  const harness = new GuardianHarness(makeContract({ maxCycles: 10 }), runtime, { store: new MemoryStateStore() });
  await harness.begin();
  const result = await harness.run();
  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reason ?? '', /no_progress_limit_reached\(2\/2\)/);
  assert.equal(runtime.cyclesRun, 3, 'para no limite, não entra em loop');
});

test('GH-01/T4 — maxCycles é respeitado', async () => {
  const runtime = new FakeAgentRuntime([
    { strategy: 'partial-1', steps: ['backup_created'], evidence: [ev('file_changed', 'backup_created')], costUsd: 0.01 },
    { strategy: 'partial-2', steps: ['region_1_changed'], evidence: [ev('file_changed', 'region_1_changed')], costUsd: 0.01 },
  ]);
  const harness = new GuardianHarness(makeContract({ maxCycles: 2 }), runtime, { store: new MemoryStateStore() });
  await harness.begin();
  const result = await harness.run();
  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reason ?? '', /max_cycles_exhausted\(2\/2\)/);
});

test('GH-01/T5 — estado serializa e resume: passos completos não são refeitos', async () => {
  const store = new MemoryStateStore();
  const runtime = new FakeAgentRuntime([
    { strategy: 'phase-1', steps: ['backup_created', 'region_1_changed'], evidence: [ev('file_changed', 'backup_created'), ev('file_changed', 'region_1_changed')], costUsd: 0.01 },
    { strategy: 'phase-2', steps: ['region_2_changed', 'syntax_check_passed'], evidence: [ev('file_changed', 'region_2_changed'), ev('syntax_check', 'syntax_check_passed')], costUsd: 0.01 },
  ]);
  const first = new GuardianHarness(makeContract(), runtime, { store });
  await first.begin();
  const before = await first.run();
  // Simulate interruption after partial progress: hand-crafted interrupted state.
  const interrupted = JSON.parse(before.serializedState) as MissionState;
  interrupted.status = 'RUNNING';
  interrupted.completedSteps = ['backup_created', 'region_1_changed'];
  interrupted.evidence = [ev('file_changed', 'backup_created'), ev('file_changed', 'region_1_changed')];
  await store.save(interrupted);

  const runtime2 = new FakeAgentRuntime([
    { strategy: 'phase-2-resume', steps: ['backup_created', 'region_1_changed', 'region_2_changed', 'syntax_check_passed'], evidence: [ev('file_changed', 'backup_created'), ev('file_changed', 'region_1_changed'), ev('file_changed', 'region_2_changed'), ev('syntax_check', 'syntax_check_passed')], costUsd: 0.01 },
  ]);
  const resumed = new GuardianHarness(makeContract(), runtime2, { store });
  await resumed.begin(); // loads persisted state
  const result = await resumed.run();
  assert.equal(result.status, 'PASS');
  // Completed steps were not redone on resume:
  assert.deepEqual(runtime2.executedSteps.sort(), ['region_2_changed', 'syntax_check_passed']);
  assert.ok(result.state.cycle >= 2);
  // Round-trip serialization is lossless:
  const again = deserializeState(serializeState(result.state));
  assert.equal(again.missionId, 'GH-01');
  assert.equal(again.status, 'PASS');
});

test('GH-01/T6 — maxCostUsd bloqueia de forma explícita', async () => {
  const runtime = new FakeAgentRuntime([
    { strategy: 'expensive-1', steps: ['backup_created'], evidence: [ev('file_changed', 'backup_created')], costUsd: 0.5 },
    { strategy: 'expensive-2', steps: ['region_1_changed'], evidence: [ev('file_changed', 'region_1_changed')], costUsd: 0.5 },
    { strategy: 'expensive-3', steps: ['region_2_changed'], evidence: [ev('file_changed', 'region_2_changed')], costUsd: 0.5 },
  ]);
  const harness = new GuardianHarness(makeContract({ maxCostUsd: 1.0 }), runtime, { store: new MemoryStateStore() });
  await harness.begin();
  const result = await harness.run();
  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reason ?? '', /max_cost_exceeded/);
  assert.ok((result.state.spentCostUsd ?? 0) > 1.0);
});

test('GH-01/T7 — maxDurationMs com clock injetado (determinístico)', async () => {
  const runtime = new FakeAgentRuntime([
    { strategy: 'any', steps: ['backup_created'], evidence: [ev('file_changed', 'backup_created')], costUsd: 0.01 },
  ]);
  // startedAt = 0 (clock no begin); em run o clock já está em 2000ms > orçamento 1000ms.
  let clock = 0;
  const harness = new GuardianHarness(makeContract({ maxCycles: 10, maxDurationMs: 1_000 }), runtime, {
    store: new MemoryStateStore(),
    now: () => clock,
  });
  await harness.begin(); // clock = 0 -> startedAt = 0
  clock = 2_000;
  const result = await harness.run();
  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reason ?? '', /max_duration_exceeded\(2000ms>1000ms\)/);
  assert.equal(runtime.cyclesRun, 0, 'nenhum ciclo executa após estouro de duração');
});

test('GH-01/T8 — EvidenceVerifier unitário: critério exige status ok e guard afasta fail/unknown', () => {
  const evidence = [ev('file_changed', 'backup_created'), ev('syntax_check', 'syntax_check_passed', 'fail')];
  const checks = verifyEvidence(CRITERIA, evidence);
  const backup = checks.find((c) => c.key === 'backup_created');
  const syntax = checks.find((c) => c.key === 'syntax_check_passed');
  assert.equal(backup?.satisfied, true);
  assert.equal(syntax?.satisfied, false);
  assert.deepEqual(
    checks.filter((c) => c.satisfied === false).map((c) => c.key).sort(),
    ['region_1_changed', 'region_2_changed', 'syntax_check_passed'],
  );
});

test('GH-01/T9 — ProgressGuard: fingerprint determinístico detecta mudança relevante vs estagnação', () => {
  const base: MissionState = {
    missionId: 'GH-01', status: 'RUNNING', cycle: 1, startedAt: 0, updatedAt: 0,
    completedSteps: [], remainingSteps: CRITERIA, evidence: [ev('file_read', 'r')],
    lastProgressFingerprint: null, noProgressCount: 0, spentCostUsd: 0,
  };
  const first = evaluateProgress(base);
  assert.equal(first.progressed, true);
  base.lastProgressFingerprint = first.fingerprint;
  const same = evaluateProgress(base);
  assert.equal(same.progressed, false);
  base.evidence.push(ev('file_changed', 'backup_created'));
  const grown = evaluateProgress(base);
  assert.equal(grown.progressed, true);
});

test('GH-01/T10 — contrato do catálogo: fixtures de teste presentes no arquivo', () => {
  const self = readFileSync(new URL(import.meta.url), 'utf8');
  for (const criterion of CRITERIA) assert.ok(self.includes(criterion));
  assert.ok(self.includes('FakeAgentRuntime'));
});

// ===== GH-03A.4 — fechamento: custo pós-ciclo e singleAttempt/recovery =====

/** Probe: separa ciclos LLM (run/continue) da consulta read-only getEvidence. */
class SingleAttemptProbeRuntime implements AgentRuntime {
  runMissionCalls = 0;
  continueMissionCalls = 0;
  getEvidenceCalls = 0;
  private readonly script: AgentCycleResult[];

  private readonly recoveryEvidence: Evidence[];

  constructor(script: AgentCycleResult[], recoveryEvidence: Evidence[] = []) {
    this.script = script;
    this.recoveryEvidence = recoveryEvidence;
  }

  async runMission(): Promise<AgentCycleResult> {
    this.runMissionCalls += 1;
    return this.script[Math.min(this.runMissionCalls - 1, this.script.length - 1)];
  }

  async continueMission(): Promise<AgentCycleResult> {
    this.continueMissionCalls += 1;
    return this.script[Math.min(this.runMissionCalls, this.script.length - 1)];
  }

  async cancelMission(): Promise<void> {
    /* no-op */
  }

  async getEvidence(_c: MissionContract, state: MissionState): Promise<Evidence[]> {
    this.getEvidenceCalls += 1;
    return [...state.evidence, ...this.recoveryEvidence];
  }
}

test('GH-03A.4/T3 — spentCostUsd <= maxCostUsd pode PASS (fronteira inclusiva, custo real do ciclo)', async () => {
  const runtime = new FakeAgentRuntime([
    { strategy: 'one-cycle', steps: CRITERIA, evidence: CRITERIA.map((k) => ev('file_changed', k)), costUsd: 0.5 },
  ]);
  const harness = new GuardianHarness(makeContract({ maxCycles: 1, maxCostUsd: 0.5 }), runtime, { store: new MemoryStateStore() });
  await harness.begin();
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.equal(result.state.spentCostUsd, 0.5);
});

test('GH-03A.4/T4 — spentCostUsd > maxCostUsd NUNCA pode PASS (critérios completos incluídos)', async () => {
  const runtime = new FakeAgentRuntime([
    { strategy: 'complete-but-expensive', steps: CRITERIA, evidence: CRITERIA.map((k) => ev('file_changed', k)), costUsd: 0.6 },
  ]);
  const store = new MemoryStateStore();
  const harness = new GuardianHarness(makeContract({ maxCycles: 1, maxCostUsd: 0.5 }), runtime, { store });
  await harness.begin();
  const result = await harness.run();
  assert.equal(result.status, 'BLOCKED', 'over-budget não pode PASS mesmo com critérios completos');
  assert.match(result.reason ?? '', /max_cost_exceeded/);
  assert.ok((result.state.spentCostUsd ?? 0) > 0.5);
  // A decisão isolada do Guardian também não converte over-budget em PASS:
  const persisted = JSON.parse(result.serializedState) as MissionState;
  persisted.status = 'RUNNING';
  await store.save(persisted);
  const evaluator = new GuardianHarness(makeContract({ maxCycles: 1, maxCostUsd: 0.5 }), runtime, { store });
  await evaluator.begin();
  const verdict = await evaluator.evaluateCompletionOnly();
  assert.equal(verdict.status, 'BLOCKED');
  assert.match(verdict.reason ?? '', /max_cost_exceeded/);
});

test('GH-03A.4/T5 — singleAttempt=true impede a segunda inferência LLM', async () => {
  const runtime = new SingleAttemptProbeRuntime([
    { strategy: 'partial', steps: ['backup_created'], evidence: [ev('file_changed', 'backup_created')], costUsd: 0.01 },
  ]);
  const harness = new GuardianHarness(
    makeContract({ maxCycles: 5, singleAttempt: true, completionCriteria: ['backup_created', 'region_1_changed'] }),
    runtime,
    { store: new MemoryStateStore() },
  );
  await harness.begin();
  const result = await harness.run();
  assert.equal(runtime.runMissionCalls, 1, 'exatamente uma inferência LLM');
  assert.equal(runtime.continueMissionCalls, 0, 'continueMission nunca é chamado');
  assert.equal(result.state.cycle, 1);
  // Falha intermediária com progresso real NÃO é BLOCKED automático:
  assert.equal(result.status, 'FAIL');
  assert.match(result.reason ?? '', /single_attempt_incomplete\(RESOLVABLE/);
});

test('GH-03A.4/T5b — TRANSIENT (só evidência de falha) encerra sem BLOCKED e sem segundo ciclo', async () => {
  const runtime = new SingleAttemptProbeRuntime([
    { strategy: 'stream-error', steps: [], evidence: [ev('command_result', 'claude-agent-sdk:stream_error', 'fail')], costUsd: 0.01 },
  ]);
  const harness = new GuardianHarness(makeContract({ maxCycles: 5, singleAttempt: true }), runtime, { store: new MemoryStateStore() });
  await harness.begin();
  const result = await harness.run();
  assert.equal(runtime.runMissionCalls, 1);
  assert.equal(runtime.continueMissionCalls, 0);
  assert.equal(result.status, 'FAIL', 'falha transitória não é bloqueio permanente');
  assert.match(result.reason ?? '', /single_attempt_terminated\(TRANSIENT/);
});

test('GH-03A.4/T5c — HARD_BLOCKER (nenhuma evidência) encerra imediatamente como BLOCKED', async () => {
  const runtime = new SingleAttemptProbeRuntime([
    { strategy: 'silent', steps: [], evidence: [], costUsd: 0 },
  ]);
  const harness = new GuardianHarness(makeContract({ maxCycles: 5, singleAttempt: true }), runtime, { store: new MemoryStateStore() });
  await harness.begin();
  const result = await harness.run();
  assert.equal(runtime.runMissionCalls, 1);
  assert.equal(runtime.continueMissionCalls, 0);
  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reason ?? '', /single_attempt_terminated\(HARD_BLOCKER/);
});

test('GH-03A.4/T5d — EXPECTATION_MISMATCH: evidência ok sem critérios não vira BLOCKED', async () => {
  const runtime = new SingleAttemptProbeRuntime([
    { strategy: 'wandering', steps: ['unrelated'], evidence: [ev('file_read', 'unrelated_read')], costUsd: 0.01 },
  ]);
  const harness = new GuardianHarness(makeContract({ maxCycles: 5, singleAttempt: true }), runtime, { store: new MemoryStateStore() });
  await harness.begin();
  const result = await harness.run();
  assert.equal(runtime.runMissionCalls, 1);
  assert.equal(runtime.continueMissionCalls, 0);
  assert.equal(result.status, 'FAIL');
  assert.match(result.reason ?? '', /single_attempt_incomplete\(EXPECTATION_MISMATCH/);
});

test('GH-03A.4/T6 — recovery read-only na mesma tentativa é permitido e pode concluir', async () => {
  const recovery: Evidence[] = [ev('file_changed', 'region_1_changed')];
  const runtime = new SingleAttemptProbeRuntime(
    [{ strategy: 'partial', steps: ['backup_created'], evidence: [ev('file_changed', 'backup_created')], costUsd: 0.01 }],
    recovery,
  );
  const harness = new GuardianHarness(
    makeContract({ maxCycles: 5, singleAttempt: true, completionCriteria: ['backup_created', 'region_1_changed'] }),
    runtime,
    { store: new MemoryStateStore() },
  );
  await harness.begin();
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.equal(runtime.runMissionCalls, 1, 'recovery não gera segunda inferência LLM');
  assert.equal(runtime.continueMissionCalls, 0, 'continueMission nunca é chamado');
  assert.equal(runtime.getEvidenceCalls, 1, 'consulta read-only à fonte autoritativa');
  assert.equal(result.state.cycle, 1);
});

test('GH-03A.4/T6b — política singleAttempt: recovery local permitido, escalada proibida, 4 classes', () => {
  const policy = SINGLE_ATTEMPT_RECOVERY_POLICY;
  assert.deepEqual([...policy.allowed].sort(), [
    'authoritative_source_query',
    'namespace_schema_path_reconciliation',
    'read_only_recovery',
    'safe_adaptation_within_permissions',
    'transient_non_llm_retry',
  ]);
  assert.deepEqual([...policy.denied].sort(), [
    'budget_increase',
    'model_swap',
    'permission_expansion',
    'provider_swap',
    'second_llm_inference',
    'second_mission',
  ]);
  const okOnly: Evidence[] = [ev('file_read', 'any')];
  const classify = (cycleEvidence: Evidence[], before: number, after: number) =>
    classifySingleAttemptOutcome({ cycleEvidence, satisfiedCriteriaBefore: before, satisfiedCriteriaAfter: after });
  assert.equal(classify(okOnly, 0, 1).failureClass, 'RESOLVABLE');
  assert.equal(classify(okOnly, 0, 1).terminateImmediately, false);
  assert.equal(classify(okOnly, 0, 0).failureClass, 'EXPECTATION_MISMATCH');
  assert.equal(classify([ev('command_result', 'x', 'fail')], 0, 0).failureClass, 'TRANSIENT');
  assert.equal(classify([ev('command_result', 'x', 'fail')], 0, 0).terminateImmediately, true);
  assert.equal(classify([], 0, 0).failureClass, 'HARD_BLOCKER');
  assert.equal(classify([], 0, 0).terminateImmediately, true);
});
