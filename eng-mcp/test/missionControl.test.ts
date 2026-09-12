/**
 * GH-04A — Mission control: an INTERMEDIATE FAILURE is not a mission failure.
 * After each executed step the Guardian classifies the observed problem
 * (TRANSIENT / RESOLVABLE / EXPECTATION_MISMATCH / HARD_BLOCKER) and decides
 * deterministically CONTINUE / RECOVER / BLOCK / PASS — never from an agent
 * claim alone. Recovery is bounded and never expands autonomy.
 *
 * Deterministic only: FakeAgentRuntime-style probes, no OpenRouter, no GLM,
 * no Anthropic, no VPS. No paid mission is executed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentCycleResult,
  AgentRuntime,
  Evidence,
  MissionContract,
  MissionState,
  MissionStateStore,
} from '../src/harness/missionTypes.js';
import {
  SWITCH_TO_ALTERNATIVE_SAFE_STRATEGY,
  classifyMissionStep,
  evaluateCompletion,
} from '../src/harness/guards.js';
import { GuardianHarness } from '../src/harness/GuardianHarness.js';
import {
  ClaudeAgentRuntime,
  type ClaudeQueryOptions,
  type QueryFn,
} from '../src/harness/ClaudeAgentRuntime.js';

const CRITERIA = ['backup_created', 'region_1_changed', 'region_2_changed', 'syntax_check_passed'];

function makeContract(overrides: Partial<MissionContract> = {}): MissionContract {
  return {
    missionId: 'GH-04A',
    objective: 'Comprar 5 pães: falha intermediária não encerra a missão.',
    completionCriteria: CRITERIA,
    maxCycles: 8,
    maxDurationMs: 60_000,
    maxNoProgressCycles: 2,
    ...overrides,
  };
}

function ev(type: Evidence['type'], key: string, status: 'ok' | 'fail' = 'ok', value?: string): Evidence {
  return { type, key, status, value, timestamp: 1_700_000_000_000, source: 'fake-runtime' };
}

/** Store that keeps every persisted checkpoint version (auditable continuity). */
class RecordingStore implements MissionStateStore {
  readonly versions: MissionState[] = [];
  async save(state: MissionState): Promise<void> {
    this.versions.push(JSON.parse(JSON.stringify(state)) as MissionState);
  }
  async load(): Promise<MissionState | null> {
    return null;
  }
  /** Last persisted checkpoint with the given cycle number. */
  versionAtCycle(cycle: number): MissionState | undefined {
    for (let i = this.versions.length - 1; i >= 0; i -= 1) {
      if (this.versions[i].cycle === cycle) return this.versions[i];
    }
    return undefined;
  }
}

/**
 * Probe runtime: scripted cycles (run/continue share the script), an optional
 * read-only authoritative source, and an optional safe alternative that is
 * only used when the Guardian's checkpoint orders
 * switch_to_alternative_safe_strategy — proving the checkpoint is the real
 * continuity channel from Guardian to runtime.
 */
class MissionControlProbeRuntime implements AgentRuntime {
  runMissionCalls = 0;
  continueMissionCalls = 0;
  getEvidenceCalls = 0;
  readonly executedStrategies: string[] = [];
  readonly seenContracts: MissionContract[] = [];
  private index = 0;

  constructor(
    private readonly script: AgentCycleResult[],
    private readonly authoritativeEvidence: Evidence[] = [],
    private readonly safeAlternative?: AgentCycleResult,
  ) {}

  private nextCycle(state: MissionState): AgentCycleResult {
    if (
      this.safeAlternative &&
      state.lastDecision?.nextAction === SWITCH_TO_ALTERNATIVE_SAFE_STRATEGY
    ) {
      this.executedStrategies.push(this.safeAlternative.strategy);
      return this.safeAlternative;
    }
    const next = this.script[Math.min(this.index, this.script.length - 1)];
    this.index += 1;
    this.executedStrategies.push(next.strategy);
    return next;
  }

  async runMission(contract: MissionContract, state: MissionState): Promise<AgentCycleResult> {
    this.runMissionCalls += 1;
    this.seenContracts.push(contract);
    return this.nextCycle(state);
  }

  async continueMission(contract: MissionContract, state: MissionState): Promise<AgentCycleResult> {
    this.continueMissionCalls += 1;
    this.seenContracts.push(contract);
    return this.nextCycle(state);
  }

  async cancelMission(): Promise<void> {
    /* no-op */
  }

  async getEvidence(_c: MissionContract, _s: MissionState): Promise<Evidence[]> {
    this.getEvidenceCalls += 1;
    return [...this.authoritativeEvidence];
  }
}

// ===== T9-adjacent: deterministic decision table for classifyMissionStep =====

test('GH-04A/T0 — tabela determinística de classificação × decisão (unidade)', () => {
  const base = {
    cycleEvidence: [] as Evidence[],
    cycleSteps: [] as string[],
    satisfiedCriteriaBefore: 0,
    satisfiedCriteriaAfter: 0,
    noProgressCount: 0,
    transientRetries: 0,
    maxTransientRetries: 2,
    sameStrategyFailures: 0,
  };
  const decide = (over: Partial<typeof base>) => classifyMissionStep({ ...base, ...over });

  // ciclo silencioso: nenhum passo, nenhuma evidência -> EXPECTATION_MISMATCH
  // (a fonte autoritativa reconcilia; o guard no-progress certificado continua soberano)
  const silent = decide({});
  assert.equal(silent.classification, 'EXPECTATION_MISMATCH');
  assert.equal(silent.decision, 'RECOVER');
  assert.equal(silent.nextAction, 'authoritative_source_query');
  // marcador hard: ação necessária não autorizada
  const unauthorized = decide({ cycleEvidence: [ev('tool_result', 'unauthorized_tool:x', 'fail')] });
  assert.equal(unauthorized.classification, 'HARD_BLOCKER');
  assert.equal(unauthorized.decision, 'BLOCK');
  assert.match(unauthorized.reason, /^hard_blocker:unauthorized_tool:x$/);
  // critérios recém-satisfeitos -> CONTINUE
  const progressed = decide({ cycleEvidence: [ev('file_changed', 'backup_created')], satisfiedCriteriaAfter: 1 });
  assert.equal(progressed.classification, 'RESOLVABLE');
  assert.equal(progressed.decision, 'CONTINUE');
  // trabalho ok sem critério -> EXPECTATION_MISMATCH -> fonte autoritativa
  const mismatch = decide({ cycleEvidence: [ev('file_read', 'wander')] });
  assert.equal(mismatch.classification, 'EXPECTATION_MISMATCH');
  assert.equal(mismatch.decision, 'RECOVER');
  assert.equal(mismatch.nextAction, 'authoritative_source_query');
  // mesma estratégia já falhou antes -> alternativa segura distinta
  const switched = decide({ ...base, cycleEvidence: [ev('file_read', 'wander')], sameStrategyFailures: 1 });
  assert.equal(switched.nextAction, SWITCH_TO_ALTERNATIVE_SAFE_STRATEGY);
  // falha resolvível -> adaptação segura dentro das permissões
  const resolvable = decide({ cycleEvidence: [ev('command_result', 'eng-mcp:alias_mismatch', 'fail')] });
  assert.equal(resolvable.classification, 'RESOLVABLE');
  assert.equal(resolvable.decision, 'RECOVER');
  assert.equal(resolvable.nextAction, 'safe_adaptation_within_permissions');
  // transiente -> retry limitado; esgotado -> BLOCK
  const transientFail = { cycleEvidence: [ev('command_result', 'eng-mcp:timeout', 'fail')] };
  const retry = decide(transientFail);
  assert.equal(retry.classification, 'TRANSIENT');
  assert.equal(retry.decision, 'RECOVER');
  assert.equal(retry.nextAction, 'transient_non_llm_retry');
  const exhausted = decide({ ...transientFail, transientRetries: 2 });
  assert.equal(exhausted.classification, 'TRANSIENT');
  assert.equal(exhausted.decision, 'BLOCK');
  assert.match(exhausted.reason, /transient_retries_exhausted\(2\/2\)/);
});

// ===== T1 — TRANSIENT RECOVERY =====

test('GH-04A/T1 — falha transitória não encerra a missão: retry limitado e PASS', async () => {
  const store = new RecordingStore();
  const runtime = new MissionControlProbeRuntime([
    { strategy: 'eng-mcp', steps: [], evidence: [ev('command_result', 'eng-mcp:timeout:read', 'fail', 'ETIMEDOUT')], costUsd: 0.01 },
    { strategy: 'eng-mcp', steps: CRITERIA, evidence: CRITERIA.map((k) => ev('file_changed', k)), costUsd: 0.01 },
  ]);
  const harness = new GuardianHarness(makeContract(), runtime, { store });
  await harness.begin();
  const result = await harness.run();

  assert.equal(result.status, 'PASS', 'a falha intermediária não encerra a missão');
  assert.equal(runtime.runMissionCalls, 1);
  assert.equal(runtime.continueMissionCalls, 1, 'o Guardian continuou a MESMA missão');

  // checkpoint após o ciclo que falhou: erro, classificação e recovery auditáveis
  const afterFailure = store.versionAtCycle(1);
  assert.ok(afterFailure?.lastDecision);
  assert.equal(afterFailure.lastDecision.classification, 'TRANSIENT');
  assert.equal(afterFailure.lastDecision.decision, 'RECOVER');
  assert.equal(afterFailure.lastDecision.nextAction, 'transient_non_llm_retry');
  assert.equal(afterFailure.lastError, 'eng-mcp:timeout:read:ETIMEDOUT');
  assert.equal(afterFailure.transientRetries, 1);

  // recovery executado dentro da mesma missão, mesmo budget, mesmas permissões
  assert.equal(result.state.recoveryAttempts, 1);
  assert.ok(runtime.seenContracts.every((c) => c === harness.contract), 'contrato jamais reescrito');
  assert.equal(result.state.lastDecision?.decision, 'CONTINUE');
  assert.equal(result.state.transientRetries, 0, 'contadores resetam no progresso real');
});

test('GH-04A/T1b — backoff do retry transiente é determinístico e escalado', async () => {
  const delays: number[] = [];
  const runtime = new MissionControlProbeRuntime([
    { strategy: 'eng-mcp', steps: [], evidence: [ev('command_result', 'eng-mcp:503', 'fail', 'Service Unavailable')], costUsd: 0 },
    { strategy: 'eng-mcp', steps: [], evidence: [ev('command_result', 'eng-mcp:503', 'fail', 'Service Unavailable')], costUsd: 0 },
    { strategy: 'eng-mcp', steps: CRITERIA, evidence: CRITERIA.map((k) => ev('file_changed', k)), costUsd: 0 },
  ]);
  const harness = new GuardianHarness(makeContract({ transientRetryBackoffMs: 100, maxTransientRetries: 3 }), runtime, {
    store: new RecordingStore(),
    sleep: async (ms) => { delays.push(ms); },
  });
  await harness.begin();
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.deepEqual(delays, [100, 200], 'backoff linear por tentativa, sem acelerar retries');
});

// ===== T2 — RESOLVABLE RECOVERY =====

test('GH-04A/T2 — representação falha, alternativa equivalente autorizada: adaptação mínima e PASS', async () => {
  const store = new RecordingStore();
  const runtime = new MissionControlProbeRuntime([
    { strategy: 'eng-mcp', steps: [], evidence: [ev('command_result', 'eng-mcp:alias_mismatch:git_status', 'fail', 'alias mismatch: path moved')], costUsd: 0.01 },
    { strategy: 'eng-mcp-adapted', steps: CRITERIA, evidence: CRITERIA.map((k) => ev('file_changed', k)), costUsd: 0.01 },
  ]);
  const contract = makeContract({ maxTransientRetries: 1 });
  const harness = new GuardianHarness(contract, runtime, { store });
  await harness.begin();
  const result = await harness.run();

  assert.equal(result.status, 'PASS');
  assert.deepEqual(runtime.executedStrategies, ['eng-mcp', 'eng-mcp-adapted']);
  const afterFailure = store.versionAtCycle(1);
  assert.equal(afterFailure?.lastDecision?.classification, 'RESOLVABLE');
  assert.equal(afterFailure.lastDecision?.nextAction, 'safe_adaptation_within_permissions');
  // o contrato nunca foi reescrito nem substituído pelo recovery:
  assert.ok(runtime.seenContracts.every((c) => c === contract));
});

// ===== T3 — EXPECTATION_MISMATCH =====

test('GH-04A/T3 — expectativa×realidade divergem: fonte autoritativa comprova equivalência, CONTINUE, PASS', async () => {
  const store = new RecordingStore();
  const runtime = new MissionControlProbeRuntime(
    [
      {
        strategy: 'eng-mcp',
        steps: ['tool_use:mcp__eng-mcp__engineering_git_status'],
        evidence: [ev('tool_result', 'tool:mcp__eng-mcp__engineering_git_status:abc123')],
        costUsd: 0.01,
      },
    ],
    // fonte autoritativa: o status executado com o namespace real É o critério esperado
    [ev('tool_result', 'engineering_git_status')],
  );
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: ['engineering_git_status'] }),
    runtime,
    { store },
  );
  await harness.begin();
  const result = await harness.run();

  assert.equal(result.status, 'PASS', 'equivalência comprovada -> reconciliação -> PASS');
  assert.equal(runtime.runMissionCalls, 1, 'reconciliação read-only, sem segunda inferência');
  assert.equal(runtime.getEvidenceCalls, 1, 'uma consulta à fonte autoritativa');
  const afterFailure = store.versionAtCycle(1);
  assert.equal(afterFailure?.lastDecision?.classification, 'EXPECTATION_MISMATCH');
  assert.equal(afterFailure.lastDecision?.nextAction, 'authoritative_source_query');
  assert.equal(result.state.lastDecision?.reason, 'expectation_mismatch:authoritative_source_query');
});

// ===== T4 — HARD BLOCKER =====

test('GH-04A/T4 — recovery exigiria ação não autorizada: BLOCKED, permissions intactas', async () => {
  const store = new RecordingStore();
  const runtime = new MissionControlProbeRuntime([
    { strategy: 'eng-mcp', steps: [], evidence: [ev('command_result', 'unauthorized_tool:engineering_vps_change_safe', 'fail', 'UNAUTHORIZED_EXECUTION_CHANNEL')], costUsd: 0.01 },
    { strategy: 'eng-mcp', steps: CRITERIA, evidence: CRITERIA.map((k) => ev('file_changed', k)), costUsd: 0.01 },
  ]);
  const contract = makeContract({ allowedTools: ['mcp__eng-mcp__engineering_file_read'] });
  const frozen = Object.freeze(contract);
  const harness = new GuardianHarness(frozen, runtime, { store });
  await harness.begin();
  const result = await harness.run();

  assert.equal(result.status, 'BLOCKED', 'HARD_BLOCKER interrompe de imediato');
  assert.match(result.reason ?? '', /^hard_blocker:unauthorized_tool:/);
  assert.equal(runtime.runMissionCalls, 1);
  assert.equal(runtime.continueMissionCalls, 0, 'nenhuma continuação com marcador hard');
  assert.equal(result.state.lastDecision?.classification, 'HARD_BLOCKER');
  assert.equal(result.state.lastDecision?.decision, 'BLOCK');
  // recovery NUNCA ampliou permissions nem trocou o contrato:
  assert.ok(runtime.seenContracts.every((c) => c === frozen));
  assert.deepEqual(frozen.allowedTools, ['mcp__eng-mcp__engineering_file_read']);
});

// ===== T5 — NO PROGRESS =====

test('GH-04A/T5a — mesma estratégia sem nova evidência: BLOCKED, sem loop', async () => {
  const stuck: AgentCycleResult = {
    strategy: 'eng-mcp-stuck',
    steps: [],
    evidence: [ev('file_read', 'stuck_read')],
    costUsd: 0.01,
  };
  const runtime = new MissionControlProbeRuntime([stuck, stuck, stuck, stuck]);
  const harness = new GuardianHarness(makeContract(), runtime, { store: new RecordingStore() });
  await harness.begin();
  const result = await harness.run();

  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reason ?? '', /no_progress_limit_reached\(2\/2\)/);
  assert.equal(runtime.runMissionCalls + runtime.continueMissionCalls, 3, 'para no limite, não repete indefinidamente');
  assert.equal(result.state.lastDecision?.classification, 'EXPECTATION_MISMATCH');
});

test('GH-04A/T5b — retries transientes esgotados: a própria decisão bloqueia', async () => {
  const failCycle: AgentCycleResult = {
    strategy: 'eng-mcp',
    steps: [],
    evidence: [ev('command_result', 'eng-mcp:timeout:read', 'fail', 'ETIMEDOUT')],
    costUsd: 0.01,
  };
  const runtime = new MissionControlProbeRuntime([failCycle, failCycle, failCycle, failCycle]);
  const harness = new GuardianHarness(
    makeContract({ maxNoProgressCycles: 6, maxTransientRetries: 2 }),
    runtime,
    { store: new RecordingStore() },
  );
  await harness.begin();
  const result = await harness.run();

  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reason ?? '', /transient_retries_exhausted\(2\/2\)/);
  assert.equal(runtime.runMissionCalls + runtime.continueMissionCalls, 3, 'nenhuma 4ª tentativa do mesmo erro');
  assert.equal(result.state.lastDecision?.classification, 'TRANSIENT');
  assert.equal(result.state.transientRetries, 2);
});

test('GH-04A/T5c — no-progress: alternativa segura distinta é executada (não repetição)', async () => {
  const stuck: AgentCycleResult = {
    strategy: 'eng-mcp-wander',
    steps: ['unrelated'],
    evidence: [ev('file_read', 'unrelated_read')],
    costUsd: 0.01,
  };
  const alternative: AgentCycleResult = {
    strategy: 'eng-mcp-alternative',
    steps: CRITERIA,
    evidence: CRITERIA.map((k) => ev('file_changed', k)),
    costUsd: 0.01,
  };
  const runtime = new MissionControlProbeRuntime([stuck, stuck, stuck], [], alternative);
  const harness = new GuardianHarness(
    makeContract({ maxNoProgressCycles: 5, maxCycles: 6 }),
    runtime,
    { store: new RecordingStore() },
  );
  await harness.begin();
  const result = await harness.run();

  assert.equal(result.status, 'PASS', 'a alternativa segura distinta alcança o objetivo');
  assert.deepEqual(runtime.executedStrategies, ['eng-mcp-wander', 'eng-mcp-wander', 'eng-mcp-wander', 'eng-mcp-alternative']);
  assert.equal(runtime.runMissionCalls, 1);
  assert.equal(runtime.continueMissionCalls, 3);
});

// ===== T6 — BUDGET permanece soberano =====

test('GH-04A/T6 — recovery que estoura maxCostUsd: BLOCKED, budget nunca ampliado', async () => {
  const runtime = new MissionControlProbeRuntime([
    { strategy: 'eng-mcp', steps: [], evidence: [ev('command_result', 'eng-mcp:timeout', 'fail')], costUsd: 0.03 },
    { strategy: 'eng-mcp', steps: CRITERIA, evidence: CRITERIA.map((k) => ev('file_changed', k)), costUsd: 0.03 },
  ]);
  const contract = makeContract({ maxCostUsd: 0.05 });
  const harness = new GuardianHarness(contract, runtime, { store: new RecordingStore() });
  await harness.begin();
  const result = await harness.run();

  assert.equal(result.status, 'BLOCKED', 'critérios completos não convertem over-budget em PASS');
  assert.match(result.reason ?? '', /max_cost_exceeded\(0\.06>0\.05\)/);
  assert.equal(result.state.spentCostUsd, 0.06);
  assert.equal(contract.maxCostUsd, 0.05, 'o teto nunca foi alterado pelo recovery');
});

// ===== T7 — SINGLE ATTEMPT permanece soberano =====

test('GH-04A/T7 — recovery local sem nova inferência é permitido; nova inferência é bloqueada', async () => {
  // (i) recovery local read-only resolve a falha sem segunda inferência:
  const localRuntime = new MissionControlProbeRuntime(
    [
      {
        strategy: 'eng-mcp',
        steps: ['backup_created'],
        evidence: [ev('file_changed', 'backup_created')],
        costUsd: 0.01,
      },
    ],
    [ev('file_changed', 'region_1_changed')],
  );
  const localHarness = new GuardianHarness(
    makeContract({ singleAttempt: true, maxCycles: 5, completionCriteria: ['backup_created', 'region_1_changed'] }),
    localRuntime,
    { store: new RecordingStore() },
  );
  await localHarness.begin();
  const local = await localHarness.run();
  assert.equal(local.status, 'PASS');
  assert.equal(localRuntime.runMissionCalls, 1, 'exatamente uma inferência');
  assert.equal(localRuntime.continueMissionCalls, 0);
  assert.equal(localRuntime.getEvidenceCalls, 1, 'recovery local read-only permitido');

  // (ii) recovery exigiria NOVA inferência: bloqueada sob singleAttempt
  const secondRuntime = new MissionControlProbeRuntime([
    { strategy: 'eng-mcp', steps: ['backup_created'], evidence: [ev('file_changed', 'backup_created')], costUsd: 0.01 },
    { strategy: 'eng-mcp', steps: CRITERIA, evidence: CRITERIA.map((k) => ev('file_changed', k)), costUsd: 0.01 },
  ]);
  const secondHarness = new GuardianHarness(
    makeContract({ singleAttempt: true, maxCycles: 5, completionCriteria: ['backup_created', 'region_1_changed'] }),
    secondRuntime,
    { store: new RecordingStore() },
  );
  await secondHarness.begin();
  const closed = await secondHarness.run();
  assert.equal(secondRuntime.runMissionCalls, 1, 'exatamente uma inferência');
  assert.equal(secondRuntime.continueMissionCalls, 0, 'continueMission nunca é chamado sob singleAttempt');
  assert.equal(closed.status, 'FAIL');
  assert.match(closed.reason ?? '', /single_attempt_incomplete\(RESOLVABLE/);
});

// ===== T8 — COMPLETION GUARD permanece soberano =====

test('GH-04A/T8 — após recovery, claim de sucesso sem evidência NÃO é PASS', async () => {
  const runtime = new MissionControlProbeRuntime([
    { strategy: 'eng-mcp', steps: [], evidence: [ev('command_result', 'eng-mcp:timeout', 'fail')], costUsd: 0.01 },
    { strategy: 'eng-mcp', steps: CRITERIA, evidence: [], claimsComplete: true, costUsd: 0.01 },
  ]);
  const harness = new GuardianHarness(makeContract(), runtime, { store: new RecordingStore() });
  await harness.begin();
  const result = await harness.run();

  assert.notEqual(result.status, 'PASS');
  assert.equal(result.status, 'BLOCKED');
  const verdict = evaluateCompletion(makeContract(), result.state);
  assert.equal(verdict.pass, false, 'CompletionGuard recusa o claim sem evidência');
  assert.deepEqual(verdict.missing.sort(), [...CRITERIA].sort());
  assert.equal(result.state.lastDecision?.classification, 'EXPECTATION_MISMATCH', 'claim sem prova é divergência, não sucesso');
});

// ===== T9 — SUCESSO DE RECOVERY END-TO-END (teste principal) =====

test('GH-04A/T9 — erro → classificação → recovery → continuação → evidência → PASS', async () => {
  const store = new RecordingStore();
  const runtime = new MissionControlProbeRuntime([
    { strategy: 'eng-mcp', steps: [], evidence: [ev('command_result', 'eng-mcp:stream_error', 'fail', '503 Service Unavailable')], costUsd: 0.01 },
    { strategy: 'eng-mcp', steps: ['backup_created', 'region_1_changed'], evidence: [ev('file_changed', 'backup_created'), ev('file_changed', 'region_1_changed')], costUsd: 0.01 },
    { strategy: 'eng-mcp', steps: ['region_2_changed', 'syntax_check_passed'], evidence: [ev('file_changed', 'region_2_changed'), ev('syntax_check', 'syntax_check_passed')], costUsd: 0.01 },
  ]);
  const harness = new GuardianHarness(makeContract(), runtime, { store });
  await harness.begin();
  const result = await harness.run();

  // objetivo satisfeito APÓS o erro intermediário, sem ampliar nada:
  assert.equal(result.status, 'PASS');
  assert.equal(runtime.runMissionCalls, 1);
  assert.equal(runtime.continueMissionCalls, 2);
  assert.equal(result.state.recoveryAttempts, 1, 'um ciclo de recovery executado após a decisão RECOVER');

  // etapa 1: erro -> TRANSIENT -> RECOVER (checkpoint auditável)
  const step1 = store.versionAtCycle(1);
  assert.equal(step1?.lastDecision?.classification, 'TRANSIENT');
  assert.equal(step1?.lastDecision?.decision, 'RECOVER');
  assert.equal(step1?.lastDecision?.nextAction, 'transient_non_llm_retry');
  assert.equal(step1?.transientRetries, 1);

  // etapa 2: recovery executado -> progresso real -> RESOLVABLE/CONTINUE
  const step2 = store.versionAtCycle(2);
  assert.equal(step2?.lastDecision?.classification, 'RESOLVABLE');
  assert.equal(step2?.lastDecision?.decision, 'CONTINUE');
  assert.equal(step2?.recoveryAttempts, 1);

  // etapa 3: critérios completos -> CompletionGuard -> PASS
  const verdict = evaluateCompletion(makeContract(), result.state);
  assert.equal(verdict.pass, true);
  assert.deepEqual(result.state.remainingSteps, []);
  assert.deepEqual(runtime.executedStrategies, ['eng-mcp', 'eng-mcp', 'eng-mcp']);
});

// ===== T9b/T9c — o runtime REAL alimenta a classificação (integração) =====

type SdkMessageFixture = Record<string, unknown>;

function systemInit(sessionId: string): SdkMessageFixture {
  return { type: 'system', subtype: 'init', session_id: sessionId };
}

function assistantToolUse(sessionId: string, id: string, name: string, input: unknown): SdkMessageFixture {
  return { type: 'assistant', session_id: sessionId, message: { content: [{ type: 'tool_use', id, name, input }] } };
}

function userToolResult(
  sessionId: string,
  toolUseId: string,
  isError: boolean,
  text?: string,
): SdkMessageFixture {
  const content: Record<string, unknown>[] = [];
  if (text !== undefined) content.push({ type: 'text', text });
  return { type: 'user', session_id: sessionId, message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: isError, content }] } };
}

function resultMessage(sessionId: string, subtype: string, costUsd: number, isError: boolean): SdkMessageFixture {
  return { type: 'result', subtype, session_id: sessionId, is_error: isError, total_cost_usd: costUsd };
}

function fakeQueryFromScripts(scripts: SdkMessageFixture[][]): { query: QueryFn; calls: { prompt: string; options?: ClaudeQueryOptions }[] } {
  const calls: { prompt: string; options?: ClaudeQueryOptions }[] = [];
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

test('GH-04A/T9b — falha de transporte do runtime vira evidência classificável, não crash', async () => {
  const crashing: QueryFn = () => {
    throw new Error('ECONNRESET transport failure');
  };
  const runtime = new ClaudeAgentRuntime({ queryFactory: crashing, env: {} });
  const harness = new GuardianHarness(makeContract({ maxCycles: 4 }), runtime);
  const outcome = await harness.run();

  assert.ok(outcome.reason ?? '', 'o runtime não crasheia a missão');
  assert.equal(outcome.status, 'BLOCKED');
  assert.match(outcome.reason ?? '', /transient_retries_exhausted\(2\/2\)/, 'transporte falho é transiente: retry limitado, depois BLOCK');
  const classified = harness.getState().lastDecision;
  assert.equal(classified?.classification, 'TRANSIENT', 'erro de transporte é transitório, não crash');
  assert.equal(classified?.decision, 'BLOCK', 'orçamento de retry esgotado encerra a missão');
  assert.equal(outcome.state.lastError, 'claude-agent-sdk:stream_error:ECONNRESET transport failure');
  assert.ok(harness.getState().evidence.some((e) => e.key === 'claude-agent-sdk:stream_error' && e.status === 'fail'));
});

test('GH-04A/T9c — fluxo real SDK: erro resolvível → RECOVERY CONTEXT no prompt → PASS', async () => {
  const { query, calls } = fakeQueryFromScripts([
    [
      systemInit('sess-gh04a'),
      assistantToolUse('sess-gh04a', 'tu-1', 'eng.git.status', { repo: 'x' }),
      userToolResult('sess-gh04a', 'tu-1', true, 'alias mismatch: tool renamed'),
      resultMessage('sess-gh04a', 'error_during_execution', 0.01, true),
    ],
    [
      systemInit('sess-gh04a'),
      assistantToolUse('sess-gh04a', 'tu-2', 'eng.git.status', { repo: 'x' }),
      userToolResult('sess-gh04a', 'tu-2', false),
      resultMessage('sess-gh04a', 'success', 0.01, false),
    ],
  ]);
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract = makeContract({
    missionId: 'GH-04A-runtime',
    completionCriteria: ['claude-agent-sdk:result:success'],
    maxCycles: 4,
  });
  const harness = new GuardianHarness(contract, runtime);
  const outcome = await harness.run();

  assert.equal(outcome.status, 'PASS', 'erro intermediário → recovery → continuação → PASS');
  assert.equal(harness.getState().cycle, 2);
  // o prompt do ciclo de recovery carrega o contexto auditável, sem ampliar nada:
  assert.ok(calls[1].prompt.includes('RECOVERY CONTEXT (same mission, same budget, same permissions):'));
  assert.ok(calls[1].prompt.includes('- classification: RESOLVABLE'));
  assert.ok(calls[1].prompt.includes('- next action: safe_adaptation_within_permissions'));
  assert.ok(calls[1].prompt.includes('- last error: tool:eng.git.status:'));
  // allowedTools nunca aparece de graça (contrato não definiu):
  assert.equal(calls[1].options?.allowedTools, undefined);
  assert.equal(outcome.state.lastDecision?.classification, 'RESOLVABLE');
});