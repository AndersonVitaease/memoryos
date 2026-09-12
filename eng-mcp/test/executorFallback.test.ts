/**
 * GH-06A — AUTHORIZED EXECUTOR FALLBACK: mandatory deterministic tests.
 *
 * All tests are deterministic: probe runtimes emit PendingActions (data only),
 * the Guardian classifies/re-validates/decides. The ONLY real process
 * execution is the explicitly contract-authorized simple command
 * 'shell:node --version' through LocalShellExecutor. No OpenRouter, no GLM,
 * no Anthropic, no deploy, no release, no paid mission.
 *
 * T20 (regression) is proven by the FULL suite run: the 91 certified
 * GH-01..GH-06 tests execute in the same `node --test dist/test/*.test.js`
 * process as these and must all stay PASS.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  AgentCycleResult,
  AgentRuntime,
  Evidence,
  FallbackAttemptRecord,
  MissionContract,
  MissionState,
  PendingAction,
  createInitialState,
} from '../src/harness/missionTypes.js';
import { GuardianHarness, MemoryStateStore } from '../src/harness/GuardianHarness.js';
import {
  AuthorizedExecutor,
  ExecutorExecutionContext,
  ExecutorOutcome,
  LocalShellExecutor,
} from '../src/harness/authorizedExecutors.js';
import {
  EXECUTOR_FAILURE_MARKERS,
  MAX_CONSECUTIVE_FALLBACK_FAILURES,
  actionFingerprint,
  executeFallbacks,
  primaryExecutorFailureOf,
  reconcileFallbackAttempts,
  validateFallback,
} from '../src/harness/executorFallback.js';
import {
  MEMORY_RECOVERY_ALLOWLIST,
  MemoryCheckpointStore,
  MemoryMissionMemoryStore,
  consultMissionMemory,
  errorSignatureOf,
  ErrorRecord,
} from '../src/harness/missionMemory.js';
import { AdvisorAgent } from '../src/harness/advisor.js';
import { PlanAction, PlanProposal, SupervisorReport } from '../src/harness/multiAgentTypes.js';
import { MultiAgentRuntime } from '../src/harness/multiAgentRuntime.js';
import { SupervisorAgent } from '../src/harness/supervisor.js';

const BASE_TIMESTAMP = 1_700_000_000_000;

function ev(type: Evidence['type'], key: string, status: 'ok' | 'fail' = 'ok', value?: string): Evidence {
  return { type, key, status, value, timestamp: BASE_TIMESTAMP, source: 'probe-runtime' };
}

function makeContract(overrides: Partial<MissionContract> = {}): MissionContract {
  return {
    missionId: 'GH-06A',
    objective: 'Fallback de executor autorizado: mesma ação, executor já autorizado, sem expansão.',
    completionCriteria: ['node_version_ok'],
    maxCycles: 6,
    maxDurationMs: 60_000,
    maxNoProgressCycles: 6,
    allowedActions: ['inspect_node', 'shell:node --version', 'channel:agent-runtime', 'channel:local-shell'],
    ...overrides,
  };
}

/** Fail evidence with a RESOLVABLE primary-executor marker (not a HARD marker). */
function failEvidence(key: string, value: string): Evidence {
  return { type: 'tool_result', key, status: 'fail', value, timestamp: BASE_TIMESTAMP, source: 'probe-runtime' };
}

function pendingShellAction(overrides: Partial<PendingAction> = {}): PendingAction {
  return {
    action: 'shell:node --version',
    primaryFailure: 'tool_unavailable:inspect_node',
    expectedEvidence: ['node_version_ok'],
    ...overrides,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface CycleScriptEntry {
  evidence: Evidence[];
  steps?: string[];
  pendingActions?: PendingAction[];
  costUsd?: number;
}

/**
 * Probe runtime: emits the SAME scripted cycle every time (run/continue share
 * it). PendingActions are DATA the runtime hands to the Guardian — the runtime
 * never chooses its fallback and never claims completion.
 */
class ProbeRuntime implements AgentRuntime {
  runMissionCalls = 0;
  continueMissionCalls = 0;
  getEvidenceCalls = 0;
  readonly seenContracts: MissionContract[] = [];
  constructor(private readonly cycle: CycleScriptEntry) {}
  private emit(): AgentCycleResult {
    return {
      strategy: 'probe-runtime',
      steps: this.cycle.steps ?? ['probe_cycle'],
      evidence: this.cycle.evidence,
      pendingActions: this.cycle.pendingActions,
      costUsd: this.cycle.costUsd,
    };
  }
  async runMission(contract: MissionContract, _state: MissionState): Promise<AgentCycleResult> {
    this.runMissionCalls += 1;
    this.seenContracts.push(contract);
    return this.emit();
  }
  async continueMission(contract: MissionContract, state: MissionState): Promise<AgentCycleResult> {
    this.continueMissionCalls += 1;
    this.seenContracts.push(contract);
    return this.emit();
  }
  async cancelMission(): Promise<void> {}
  async getEvidence(): Promise<Evidence[]> {
    this.getEvidenceCalls += 1;
    return [];
  }
}

interface FakeExecutorOptions {
  ok?: boolean;
  delayMs?: number;
  id?: string;
  channel?: string;
  /** When present, canExecute delegates to it; default: accepts everything. */
  accepts?: (action: string) => boolean;
}

/** Deterministic fake executor with REAL counters (the anti-cheat witness).
 * Default channel is 'local-shell' — the contract's authorized fallback channel. */
class FakeFallbackExecutor implements AuthorizedExecutor {
  readonly id: string;
  readonly channel: string;
  executeCalls = 0;
  canExecuteCalls = 0;
  readonly executedActions: string[] = [];
  constructor(private readonly options: FakeExecutorOptions = {}) {
    this.id = options.id ?? 'fake-fallback';
    this.channel = options.channel ?? 'local-shell';
  }
  canExecute(action: string): boolean {
    this.canExecuteCalls += 1;
    return this.options.accepts ? this.options.accepts(action) : true;
  }
  async execute(action: string, _ctx?: ExecutorExecutionContext): Promise<ExecutorOutcome> {
    this.executeCalls += 1;
    this.executedActions.push(action);
    if ((this.options.delayMs ?? 0) > 0) await sleep(this.options.delayMs as number);
    const ok = this.options.ok !== false;
    return {
      ok,
      command: action,
      exitCode: ok ? 0 : 1,
      output: ok ? `fake-output:${action}` : '',
      error: ok ? '' : `fake-failure:${action}`,
      durationMs: (this.options.delayMs ?? 0),
      executorId: this.id,
      channel: this.channel,
      startedAt: BASE_TIMESTAMP,
      endedAt: BASE_TIMESTAMP + (this.options.delayMs ?? 0),
    };
  }
}

// ===== T1 — sucesso do primário NUNCA aciona fallback =====

test('GH-06A/T1 — primário bem-sucedido: fallback não é nem consultado', async () => {
  const executor = new FakeFallbackExecutor();
  const runtime = new ProbeRuntime({ evidence: [ev('command_result', 'node_version_ok', 'ok')] });
  const harness = new GuardianHarness(makeContract({ singleAttempt: true }), runtime, {
    executorFallback: { executors: [executor] },
  });
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.equal(executor.executeCalls, 0);
  assert.equal(executor.canExecuteCalls, 0);
  assert.equal(runtime.runMissionCalls, 1);
  assert.equal(harness.lastFallbackSummary, undefined);
  assert.equal(result.state.fallbackAttempts, undefined);
});

// ===== T2 — falha resolvível do primário -> fallback executa a MESMA ação =====

test('GH-06A/T2 — primário falha (tool_unavailable) -> fallback autorizado executa a mesma ação', async () => {
  const executor = new FakeFallbackExecutor({ ok: true });
  const runtime = new ProbeRuntime({
    evidence: [failEvidence('tool:inspect', 'tool_unavailable:inspect_node')],
    pendingActions: [pendingShellAction()],
  });
  const harness = new GuardianHarness(makeContract({ singleAttempt: true }), runtime, {
    executorFallback: { executors: [executor] },
  });
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.equal(executor.executeCalls, 1);
  assert.equal(executor.executedActions[0], 'shell:node --version');
  assert.ok(result.state.evidence.some((e) => e.key === 'node_version_ok' && e.status === 'ok'));
  const record = result.state.fallbackAttempts?.[0];
  assert.ok(record);
  assert.equal(record.requestedAction, 'shell:node --version');
  assert.equal(record.primaryFailure, 'tool_unavailable:inspect_node');
  assert.equal(record.classification, 'RESOLVABLE');
  assert.equal(record.primaryExecutor, 'probe-runtime');
  assert.equal(record.fallbackExecutor, 'fake-fallback');
  assert.equal(record.executionChannel, 'local-shell');
  assert.equal(record.attempt, 1);
  assert.equal(record.result, 'ok');
});

// ===== T3 — shell fallback REAL (node --version de verdade) =====

test('GH-06A/T3 — LocalShellExecutor REAL: node --version executa (exitCode 0, output vN.N.N)', async () => {
  const shell = new LocalShellExecutor();
  const runtime = new ProbeRuntime({
    evidence: [failEvidence('tool:shell', 'shell_unavailable:no_shell_channel')],
    pendingActions: [pendingShellAction({ primaryFailure: 'shell_unavailable:no_shell_channel' })],
  });
  const harness = new GuardianHarness(makeContract({ singleAttempt: true }), runtime, {
    executorFallback: { executors: [shell] },
  });
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  const fingerprint = actionFingerprint('shell:node --version');
  const outcome = result.state.evidence.find((e) => e.key === `fallback:local-shell:${fingerprint}`);
  assert.ok(outcome, 'evidência de auditoria do shell ausente');
  assert.equal(outcome.source, 'executor-fallback:local-shell@local-shell');
  const parsed = JSON.parse(outcome.value as string) as {
    requestedAction: string;
    fallbackExecutor: string;
    executionChannel: string;
    exitCode: number;
    output: string;
    result: string;
  };
  assert.equal(parsed.requestedAction, 'shell:node --version');
  assert.equal(parsed.fallbackExecutor, 'local-shell');
  assert.equal(parsed.executionChannel, 'local-shell');
  assert.equal(parsed.exitCode, 0);
  assert.equal(parsed.result, 'ok');
  assert.match(parsed.output, /^v\d+\.\d+\.\d+/);
  const criterion = result.state.evidence.find((e) => e.key === 'node_version_ok' && e.status === 'ok');
  assert.ok(criterion, 'critério de conclusão não satisfeito pela execução real');
  assert.match(criterion.value as string, /^v\d+\.\d+\.\d+/);
});

// ===== T4 — canal não autorizado no contrato -> BLOCK, nada executa =====

test('GH-06A/T4 — sem channel:local-shell no contrato -> BLOCKED e comando NUNCA executa', async () => {
  const shell = new LocalShellExecutor();
  const runtime = new ProbeRuntime({
    evidence: [failEvidence('tool:inspect', 'tool_unavailable:inspect_node')],
    pendingActions: [pendingShellAction()],
  });
  const contract = makeContract({
    allowedActions: ['inspect_node', 'shell:node --version', 'channel:agent-runtime'],
  });
  const harness = new GuardianHarness(contract, runtime, {
    executorFallback: { executors: [shell] },
  });
  const result = await harness.run();
  assert.equal(result.status, 'BLOCKED');
  assert.ok(
    (result.reason as string).includes('fallback_not_authorized(shell:node --version:channel_not_authorized)'),
    `razão inesperada: ${result.reason}`,
  );
  assert.equal(shell.executeCount, 0);
  assert.equal(shell.canExecuteCount, 0);
  assert.ok(!result.state.evidence.some((e) => e.key === 'node_version_ok' && e.status === 'ok'));
});

// ===== T5 — ação não autorizada no contrato -> BLOCK =====

test('GH-06A/T5 — ação fora do allowedActions -> BLOCKED (action_not_authorized)', async () => {
  const executor = new FakeFallbackExecutor({ ok: true });
  const runtime = new ProbeRuntime({
    evidence: [failEvidence('tool:inspect', 'tool_unavailable:inspect_node')],
    pendingActions: [pendingShellAction()],
  });
  const contract = makeContract({ allowedActions: ['inspect_node', 'channel:agent-runtime', 'channel:local-shell'] });
  const harness = new GuardianHarness(contract, runtime, {
    executorFallback: { executors: [executor] },
  });
  const result = await harness.run();
  assert.equal(result.status, 'BLOCKED');
  assert.ok((result.reason as string).includes('action_not_authorized'));
  assert.equal(executor.executeCalls, 0);
});

// ===== T6 — ação proibida NUNCA executa (Guardian + piso do executor) =====

test('GH-06A/T6 — forbiddenActions -> BLOCKED; piso Guardian-owned recusa rm/curl/meta-caracteres', async () => {
  const shell = new LocalShellExecutor();
  const runtime = new ProbeRuntime({
    evidence: [failEvidence('tool:inspect', 'tool_unavailable:inspect_node')],
    pendingActions: [pendingShellAction()],
  });
  const contract = makeContract({
    forbiddenActions: ['shell:node --version'],
    allowedActions: ['inspect_node', 'channel:agent-runtime', 'channel:local-shell'],
  });
  const harness = new GuardianHarness(contract, runtime, {
    executorFallback: { executors: [shell] },
  });
  const result = await harness.run();
  assert.equal(result.status, 'BLOCKED');
  assert.ok((result.reason as string).includes('action_forbidden'));
  assert.equal(shell.executeCount, 0);

  // Defense in depth: o piso do executor recusa sozinho, mesmo com contrato
  // (hipoteticamente) tentando autorizar destruição ou alcance externo.
  assert.equal(shell.canExecute('shell:rm -rf .'), false);
  assert.equal(shell.canExecute('shell:curl http://example.com'), false);
  assert.equal(shell.canExecute('shell:git push origin main'), false);
  assert.equal(shell.canExecute('shell:npm publish'), false);
  assert.equal(shell.canExecute('shell:node --version; rm -rf .'), false); // meta-char
  assert.equal(shell.canExecute('shell:node --version && rm -rf .'), false);
  const refused = await shell.execute('shell:rm -rf .');
  assert.equal(refused.ok, false);
  assert.equal(refused.error, 'shell_command_not_executable');
  // o comando autorizado continua executável
  assert.equal(shell.canExecute('shell:node --version'), true);
});

// ===== T7 — NENHUMA expansão de permissão/canal/orçamento =====

test('GH-06A/T7 — fallback nunca modifica o contrato (permissão/canal inalterados)', async () => {
  const executor = new FakeFallbackExecutor({ ok: true });
  const runtime = new ProbeRuntime({
    evidence: [failEvidence('tool:inspect', 'tool_unavailable:inspect_node')],
    pendingActions: [pendingShellAction()],
  });
  const contract = makeContract({ allowedActions: ['inspect_node', 'shell:node --version', 'channel:agent-runtime'] });
  const contractBefore = JSON.stringify(contract);
  const harness = new GuardianHarness(contract, runtime, {
    executorFallback: { executors: [executor] },
  });
  const result = await harness.run();
  assert.equal(result.status, 'BLOCKED');
  assert.equal(JSON.stringify(contract), contractBefore); // contrato imutável
  assert.equal(executor.executeCalls, 0);
  // e a validação estrutural nunca sugere executor fora do contrato:
  const validation = validateFallback([pendingShellAction()], contract, [executor]);
  assert.equal(validation.eligible.length, 0);
  assert.equal(validation.blocked[0]?.reason, 'channel_not_authorized');
});

// ===== T8 — single attempt preservado: UMA inferência, fallback determinístico =====

test('GH-06A/T8 — singleAttempt: 1 inferência + fallback determinístico -> PASS (nunca 2ª inferência)', async () => {
  const executor = new FakeFallbackExecutor({ ok: true });
  const runtime = new ProbeRuntime({
    evidence: [failEvidence('tool:inspect', 'tool_unavailable:inspect_node')],
    pendingActions: [pendingShellAction()],
  });
  const harness = new GuardianHarness(makeContract({ singleAttempt: true }), runtime, {
    executorFallback: { executors: [executor] },
  });
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.equal(runtime.runMissionCalls, 1);
  assert.equal(runtime.continueMissionCalls, 0);
  assert.equal(executor.executeCalls, 1);
  assert.equal(result.state.fallbackAttempts?.[0]?.attempt, 1);
});

// ===== T9 — falha do fallback NÃO vira loop infinito =====

test('GH-06A/T9 — fallback falhando: mission BLOCKED por anti-loop (nunca loop infinito)', async () => {
  const executor = new FakeFallbackExecutor({ ok: false });
  const runtime = new ProbeRuntime({
    evidence: [failEvidence('tool:inspect', 'tool_unavailable:inspect_node')],
    pendingActions: [pendingShellAction()],
  });
  const harness = new GuardianHarness(
    makeContract({ maxCycles: 12, maxNoProgressCycles: 8, maxTransientRetries: 5 }),
    runtime,
    { executorFallback: { executors: [executor] } },
  );
  const result = await harness.run();
  assert.equal(result.status, 'BLOCKED');
  assert.ok((result.reason as string).includes('fallback_loop_detected'));
  // O fallback tentou EXATAMENTE o limite certificado e parou:
  assert.equal(executor.executeCalls, MAX_CONSECUTIVE_FALLBACK_FAILURES);
  assert.equal(runtime.runMissionCalls + runtime.continueMissionCalls, 3); // ciclo 1, 2 executam; ciclo 3 é bloqueado pelo anti-loop
  const attempts = result.state.fallbackAttempts?.filter((r) => r.result === 'fail') ?? [];
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts.map((r) => r.attempt), [1, 2]);
});

// ===== T10 — anti-loop estrutural: 2 falhas consecutivas sem nova evidência -> block =====

test('GH-06A/T10 — reconcile: 1 falha permite retry; 2 falhas sem nova evidência bloqueiam', () => {
  const contract = makeContract();
  const executor = new FakeFallbackExecutor({ ok: false });
  const validation = validateFallback([pendingShellAction()], contract, [executor]);
  assert.equal(validation.eligible.length, 1);
  assert.equal(validation.blocked.length, 0);
  const attemptsOf = (n: number): FallbackAttemptRecord[] =>
    Array.from({ length: n }, (_, i): FallbackAttemptRecord => ({
      requestedAction: 'shell:node --version',
      primaryFailure: 'tool_unavailable:inspect_node',
      classification: 'RESOLVABLE',
      primaryExecutor: 'probe-runtime',
      fallbackExecutor: 'fake-fallback',
      executionChannel: 'fallback-channel',
      attempt: i + 1,
      result: 'fail',
      okEvidenceKeys: [],
      startedAt: BASE_TIMESTAMP + i,
      endedAt: BASE_TIMESTAMP + i + 1,
    }));
  const once = reconcileFallbackAttempts(validation.eligible, attemptsOf(1), new Set());
  assert.equal(once.runnable.length, 1);
  assert.equal(once.loopBlocked.length, 0);
  const twice = reconcileFallbackAttempts(validation.eligible, attemptsOf(2), new Set());
  assert.equal(twice.runnable.length, 0);
  assert.equal(twice.loopBlocked.length, 1);
  assert.equal(twice.loopBlocked[0]?.reason, 'fallback_loop_detected');
  // nova evidência conclusiva substitui o loop: com a evidência ok do critério
  // presente, o fallback é CONCLUSIVO (skipped), nunca bloqueado nem re-executado
  const withEvidence = reconcileFallbackAttempts(validation.eligible, attemptsOf(2), new Set(['node_version_ok']));
  assert.equal(withEvidence.runnable.length, 0);
  assert.equal(withEvidence.loopBlocked.length, 0);
  assert.equal(withEvidence.skipped.length, 1);
  assert.equal(withEvidence.skipped[0]?.reason, 'fallback_already_completed');
});

// ===== T11 — evidência de fallback AUDITÁVEL (todos os campos) =====

test('GH-06A/T11 — evidência auditable: requestedAction/primaryFailure/classification/executores/canal/result/timestamps', async () => {
  const executor = new FakeFallbackExecutor({ ok: true });
  const runtime = new ProbeRuntime({
    evidence: [failEvidence('tool:inspect', 'tool_unavailable:inspect_node')],
    pendingActions: [pendingShellAction()],
  });
  const harness = new GuardianHarness(makeContract({ singleAttempt: true }), runtime, {
    executorFallback: { executors: [executor] },
  });
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  const fingerprint = actionFingerprint('shell:node --version');
  const item = result.state.evidence.find((e) => e.key === `fallback:fake-fallback:${fingerprint}`);
  assert.ok(item);
  const audit = JSON.parse(item.value as string) as Record<string, unknown>;
  for (const field of [
    'requestedAction',
    'primaryFailure',
    'fallbackExecutor',
    'executionChannel',
    'attempt',
    'result',
    'exitCode',
    'output',
    'error',
    'durationMs',
    'startedAt',
    'endedAt',
  ]) {
    assert.ok(field in audit, `campo ausente na evidência: ${field}`);
  }
  assert.equal(audit.requestedAction, 'shell:node --version');
  assert.equal(audit.primaryFailure, 'tool_unavailable:inspect_node');
  assert.equal(audit.fallbackExecutor, 'fake-fallback');
  assert.equal(audit.executionChannel, 'local-shell');
  assert.equal(audit.attempt, 1);
  assert.equal(audit.result, 'ok');
  const record = result.state.fallbackAttempts?.[0];
  assert.ok(record);
  for (const field of [
    'requestedAction',
    'primaryFailure',
    'classification',
    'primaryExecutor',
    'fallbackExecutor',
    'executionChannel',
    'attempt',
    'result',
    'okEvidenceKeys',
    'startedAt',
    'endedAt',
  ]) {
    assert.ok(field in record, `campo ausente no record: ${field}`);
  }
  assert.deepEqual(record.okEvidenceKeys, ['node_version_ok']);
  assert.ok(record.endedAt >= record.startedAt);
  // o executor NUNCA declara PASS: o resultado é derivado do worker/evidência
  assert.equal(record.result === 'ok', true);
  assert.equal(result.state.status, 'PASS'); // conclusão é Guardian-owned
});

// ===== T12 — orçamento: mesmo orçamento, custo local 0, sem reset =====

test('GH-06A/T12 — fallback não altera o orçamento: spentCostUsd preservado, custo local 0', async () => {
  const executor = new FakeFallbackExecutor({ ok: true });
  const runtime = new ProbeRuntime({
    evidence: [failEvidence('tool:inspect', 'tool_unavailable:inspect_node')],
    pendingActions: [pendingShellAction()],
    costUsd: 1.25,
  });
  const harness = new GuardianHarness(
    makeContract({ singleAttempt: true, maxCostUsd: 5 }),
    runtime,
    { executorFallback: { executors: [executor] } },
  );
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.equal(result.state.spentCostUsd, 1.25); // nem reset nem inflação
  // budget cap excedido: o fallback NÃO executa e a missão bloqueia fail-closed
  const overBudgetRuntime = new ProbeRuntime({
    evidence: [failEvidence('tool:inspect', 'tool_unavailable:inspect_node')],
    pendingActions: [pendingShellAction()],
    costUsd: 1.25,
  });
  const overBudgetHarness = new GuardianHarness(
    makeContract({ singleAttempt: true, maxCostUsd: 1 }),
    overBudgetRuntime,
    { executorFallback: { executors: [new FakeFallbackExecutor({ ok: true })] } },
  );
  const overBudget = await overBudgetHarness.run();
  assert.equal(overBudget.status, 'BLOCKED');
  assert.ok((overBudget.reason as string).includes('max_cost_exceeded'));
});

// ===== T13 — resume de checkpoint NÃO re-executa fallback concluído =====

test('GH-06A/T13 — checkpoint resume: fallback concluído é pulado (nunca re-executado)', async () => {
  const shell = new FakeFallbackExecutor({ ok: true, id: 'fake-fallback' });
  const checkpointStore = new MemoryCheckpointStore();
  const contract = makeContract({ maxCycles: 10, maxNoProgressCycles: 6 });
  const runtimeA = new ProbeRuntime({
    evidence: [failEvidence('tool:inspect', 'tool_unavailable:inspect_node')],
    pendingActions: [pendingShellAction()],
  });
  const harnessA = new GuardianHarness(contract, runtimeA, {
    checkpointStore,
    executorFallback: { executors: [shell] },
  });
  const resultA = await harnessA.run();
  assert.equal(resultA.status, 'PASS');
  assert.equal(shell.executeCalls, 1);
  const runtimeB = new ProbeRuntime({
    evidence: [failEvidence('tool:inspect', 'tool_unavailable:inspect_node')],
    pendingActions: [pendingShellAction()],
  });
  const harnessB = new GuardianHarness(contract, runtimeB, {
    checkpointStore,
    executorFallback: { executors: [shell] },
  });
  await harnessB.begin();
  assert.equal(harnessB.resumedFromCheckpoint, true);
  const resultB = await harnessB.run();
  assert.equal(shell.executeCalls, 1); // NÃO re-executou
  assert.equal(resultB.status, 'PASS');
  const skipped = resultB.state.fallbackAttempts?.filter((r) => r.result === 'skipped') ?? [];
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0]?.reason, 'fallback_already_completed');
  assert.equal(skipped[0]?.result, 'skipped');
  // a conclusão continua Guardada: critério permanece ok, sem re-execução
  assert.ok(resultB.state.evidence.some((e) => e.key === 'node_version_ok' && e.status === 'ok'));
});

// ===== T14 — fallback in-flight ('unknown') NUNCA é assumido como sucesso =====

test('GH-06A/T14 — result "unknown" em checkpoint: não é sucesso; fallback re-executa uma vez', async () => {
  const shell = new FakeFallbackExecutor({ ok: true });
  const contract = makeContract({ singleAttempt: false, maxCycles: 6 });
  const state: MissionState = {
    // startedAt AGORA (relógio real) — o relógio do teste não pode ser
    // bloqueado por maxDurationMs de um estado pré-carregado antigo.
    ...createInitialState(contract, Date.now()),
    fallbackAttempts: [
      {
        requestedAction: 'shell:node --version',
        primaryFailure: 'tool_unavailable:inspect_node',
        classification: 'RESOLVABLE',
        primaryExecutor: 'probe-runtime',
        fallbackExecutor: 'fake-fallback',
        executionChannel: 'fallback-channel',
        attempt: 1,
        result: 'unknown',
        okEvidenceKeys: ['node_version_ok'],
        startedAt: BASE_TIMESTAMP,
        endedAt: BASE_TIMESTAMP,
      },
    ],
  };
  const store = new MemoryStateStore();
  await store.save(state);
  const runtime = new ProbeRuntime({
    evidence: [failEvidence('tool:inspect', 'tool_unavailable:inspect_node')],
    pendingActions: [pendingShellAction()],
  });
  const harness = new GuardianHarness(contract, runtime, {
    store,
    executorFallback: { executors: [shell] },
  });
  await harness.begin();
  const result = await harness.run();
  assert.equal(shell.executeCalls, 1); // re-executado (unknown ≠ sucesso)
  assert.equal(result.status, 'PASS');
  const attempts = result.state.fallbackAttempts ?? [];
  assert.equal(attempts[0]?.result, 'unknown'); // preservado, nunca promovido
  assert.equal(attempts.filter((r) => r.result === 'skipped').length, 0);
  assert.equal(attempts[attempts.length - 1]?.result, 'ok');
  assert.equal(attempts[attempts.length - 1]?.attempt, 2);
});

// ===== T15 — paralelismo REAL: 3 fallbacks independentes, overlap ~200ms =====

test('GH-06A/T15 — 3 fallbacks independentes com sleep REAL 200ms: MAX_OBSERVED_CONCURRENCY=3', async () => {
  const executor = new FakeFallbackExecutor({ ok: true, delayMs: 200 });
  const pending: PendingAction[] = [
    { action: 'shell:a-cmd', primaryFailure: 'tool_unavailable:a', expectedEvidence: ['a_ok'] },
    { action: 'shell:b-cmd', primaryFailure: 'tool_unavailable:b', expectedEvidence: ['b_ok'] },
    { action: 'shell:c-cmd', primaryFailure: 'tool_unavailable:c', expectedEvidence: ['c_ok'] },
  ];
  const contract = makeContract({
    completionCriteria: ['a_ok', 'b_ok', 'c_ok'],
    allowedActions: ['shell:a-cmd', 'shell:b-cmd', 'shell:c-cmd', 'channel:agent-runtime', 'channel:local-shell'],
    maxParallelActions: 3,
  });
  const eligible = pending.map((requested) => ({
    requested,
    executor: executor as AuthorizedExecutor,
    resourceKeys: [`fallback:${actionFingerprint(requested.action)}`],
  }));
  const t0 = performance.now();
  const execution = await executeFallbacks({
    eligible,
    contract,
    primaryExecutor: 'probe-runtime',
    priorAttempts: [],
  });
  const elapsed = performance.now() - t0;
  assert.equal(execution.report.maxObservedConcurrency, 3);
  assert.ok(elapsed < 550, `serial seria >= 600ms; medido ${elapsed}ms`);
  // overlap temporal REAL entre pelo menos duas tentativas (timestamps)
  const records = execution.records;
  assert.equal(records.length, 3);
  const overlapping = (() => {
    for (let i = 0; i < records.length; i += 1) {
      for (let j = i + 1; j < records.length; j += 1) {
        if (records[i].startedAt < records[j].endedAt && records[j].startedAt < records[i].endedAt) return true;
      }
    }
    return false;
  })();
  assert.ok(overlapping, 'sem overlap temporal real entre fallbacks independentes');
  assert.ok(records.every((r) => r.result === 'ok'));
  assert.ok(execution.evidence.every((e) => e.status === 'ok'));
});

// ===== T16 — MESMO resourceKey: conflito serializado (zero overlap) =====

test('GH-06A/T16 — resourceKeys conflitantes: fallbacks serializados, ZERO overlap', async () => {
  const executor = new FakeFallbackExecutor({ ok: true, delayMs: 200 });
  const pending: PendingAction[] = [
    { action: 'shell:a-cmd', primaryFailure: 'tool_unavailable:a', expectedEvidence: ['a_ok'], resourceKeys: ['shared:lock'] },
    { action: 'shell:b-cmd', primaryFailure: 'tool_unavailable:b', expectedEvidence: ['b_ok'], resourceKeys: ['shared:lock'] },
    { action: 'shell:c-cmd', primaryFailure: 'tool_unavailable:c', expectedEvidence: ['c_ok'], resourceKeys: ['shared:lock'] },
  ];
  const contract = makeContract({
    completionCriteria: ['a_ok', 'b_ok', 'c_ok'],
    allowedActions: ['shell:a-cmd', 'shell:b-cmd', 'shell:c-cmd', 'channel:agent-runtime', 'channel:local-shell'],
    maxParallelActions: 3,
  });
  const eligible = pending.map((requested) => ({ requested, executor: executor as AuthorizedExecutor, resourceKeys: requested.resourceKeys ?? [] }));
  const t0 = performance.now();
  const execution = await executeFallbacks({ eligible, contract, primaryExecutor: 'probe-runtime', priorAttempts: [] });
  const elapsed = performance.now() - t0;
  assert.equal(execution.report.maxObservedConcurrency, 1);
  assert.ok(elapsed >= 600, `serialização exigiria >= 600ms; medido ${elapsed}ms`);
  const records = execution.records;
  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      const noOverlap =
        records[i].startedAt >= records[j].endedAt || records[j].startedAt >= records[i].endedAt;
      assert.ok(noOverlap, `fallbacks com o MESMO resourceKey se sobrepuseram (${i}, ${j})`);
    }
  }
});

// ===== T17 — conclusão legítima: critérios cobertos pelos fallbacks -> PASS =====

test('GH-06A/T17 — dois fallbacks autorizados cobrem os critérios -> PASS limpo', async () => {
  const executor = new FakeFallbackExecutor({ ok: true });
  const runtime = new ProbeRuntime({
    evidence: [failEvidence('tool:batch', 'tool_unavailable:batch_runner')],
    pendingActions: [
      { action: 'shell:a-cmd', primaryFailure: 'tool_unavailable:batch_runner', expectedEvidence: ['a_ok'] },
      { action: 'shell:b-cmd', primaryFailure: 'tool_unavailable:batch_runner', expectedEvidence: ['b_ok'] },
    ],
  });
  const harness = new GuardianHarness(
    makeContract({
      completionCriteria: ['a_ok', 'b_ok'],
      allowedActions: ['shell:a-cmd', 'shell:b-cmd', 'channel:agent-runtime', 'channel:local-shell'],
      singleAttempt: true,
    }),
    runtime,
    { executorFallback: { executors: [executor] } },
  );
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.equal(executor.executeCalls, 2);
  assert.deepEqual(result.state.remainingSteps, []);
  assert.equal(result.state.blocker, undefined);
});

// ===== T18 — supervisor NÃO governa: COMPLETE sem evidência nunca é PASS =====

test('GH-06A/T18 — supervisor recomenda COMPLETE sem evidência -> NOT PASS (Guardian soberano)', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [fakeAction('A', { okKey: 'a_done', delayMs: 10 })])]),
    supervisor: new AlwaysCompleteSupervisor(),
  });
  const shell = new LocalShellExecutor();
  const harness = new GuardianHarness(
    makeContract({
      missionId: 'GH-06A-T18',
      completionCriteria: ['goal_done'],
      maxCycles: 1,
      allowedActions: ['shell:node --version', 'channel:agent-runtime', 'channel:local-shell'],
    }),
    runtime,
    { executorFallback: { executors: [shell] } },
  );
  const result = await harness.run();
  assert.notEqual(result.status, 'PASS');
  assert.ok(result.state.evidence.some((e) => e.key === 'supervisor:recommendation' && e.status === 'ok'));
  assert.equal(shell.executeCount, 0); // fallback não resgata COMPLETE sem evidência
  assert.ok(result.state.remainingSteps.includes('goal_done'));
});

// ===== T19 — memória sugere fallback; Guardian REVALIDA o contrato atual =====

test('GH-06A/T19 — memória sugere fallback: autorizado executa; não autorizado NÃO executa', async () => {
  // (a) a memória PODE sugerir authorized_executor_fallback (allowlist GH-06A)
  assert.ok(MEMORY_RECOVERY_ALLOWLIST.includes('authorized_executor_fallback'));
  const memory = new MemoryMissionMemoryStore();
  const failText = 'tool:inspect:tool_unavailable:inspect_node';
  const knownError: ErrorRecord = {
    errorSignature: errorSignatureOf(failText),
    classification: 'RESOLVABLE',
    safeRecovery: 'authorized_executor_fallback',
    createdAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
  };
  await memory.recordError(knownError);
  const advice = await consultMissionMemory(memory, failText, 'RECOVER');
  assert.equal(advice.adoptedAction, 'authorized_executor_fallback');

  // (b) contrato AUTORIZA -> fallback executa (memória é advisory; a camada
  // estrutural revalida o contrato atual)
  const shell = new LocalShellExecutor();
  const runtimeOk = new ProbeRuntime({
    evidence: [failEvidence('tool:inspect', 'tool_unavailable:inspect_node')],
    pendingActions: [pendingShellAction()],
  });
  const harnessOk = new GuardianHarness(makeContract({ singleAttempt: false }), runtimeOk, {
    executorFallback: { executors: [shell] },
    memory,
  });
  const resultOk = await harnessOk.run();
  assert.equal(resultOk.status, 'PASS');
  assert.equal(shell.executeCount, 1);
  assert.ok(harnessOk.lastMemoryAdvice?.consulted);

  // (c) contrato NÃO autoriza -> Guardian revalida e bloqueia, mesmo com a
  // memória tendo sugerido o fallback
  const shellDenied = new LocalShellExecutor();
  const runtimeDenied = new ProbeRuntime({
    evidence: [failEvidence('tool:inspect', 'tool_unavailable:inspect_node')],
    pendingActions: [pendingShellAction()],
  });
  const contractDenied = makeContract({
    allowedActions: ['inspect_node', 'shell:node --version', 'channel:agent-runtime'],
  });
  const harnessDenied = new GuardianHarness(contractDenied, runtimeDenied, {
    executorFallback: { executors: [shellDenied] },
    memory,
  });
  const resultDenied = await harnessDenied.run();
  assert.equal(resultDenied.status, 'BLOCKED');
  assert.ok((resultDenied.reason as string).includes('channel_not_authorized'));
  assert.equal(shellDenied.executeCount, 0);
});

// ===== T20 — regressão: superfícies certificadas GH-01..GH-06 intactas =====

test('GH-06A/T20 — superfícies certificadas preservadas (regressão completa roda no suite)', async () => {
  // O SUITE COMPLETO (91 testes GH-01..GH-06 + estes) roda em
  // `node --test dist/test/*.test.js` — T20 é o resultado dessa execução.
  // Aqui, as superfícies que o fallback toca são verificadas structuralmente:
  const { HARD_ERROR_PATTERNS, TRANSIENT_ERROR_PATTERNS, SINGLE_ATTEMPT_RECOVERY_POLICY } = await import(
    '../src/harness/guards.js'
  );
  assert.ok(HARD_ERROR_PATTERNS.includes('permission'));
  assert.ok(HARD_ERROR_PATTERNS.includes('credential'));
  assert.ok(HARD_ERROR_PATTERNS.includes('forbidden'));
  assert.ok(HARD_ERROR_PATTERNS.includes('budget'));
  assert.ok(TRANSIENT_ERROR_PATTERNS.includes('unavailable'));
  assert.ok(SINGLE_ATTEMPT_RECOVERY_POLICY.allowed.length > 0);
  // a allowlist GH-06 PRESERVADA + a entrada GH-06A:
  assert.ok(MEMORY_RECOVERY_ALLOWLIST.length >= SINGLE_ATTEMPT_RECOVERY_POLICY.allowed.length + 2);
  assert.ok(MEMORY_RECOVERY_ALLOWLIST.includes('authorized_executor_fallback'));
  // tipos GH-06A exportados
  const fallbackModule = await import('../src/harness/executorFallback.js');
  assert.equal(typeof fallbackModule.validateFallback, 'function');
  assert.equal(typeof fallbackModule.executeFallbacks, 'function');
  assert.equal(typeof fallbackModule.reconcileFallbackAttempts, 'function');
  assert.equal(typeof fallbackModule.primaryExecutorFailureOf, 'function');
});

// ===== Unidade — classificação do fail primário: HARD sempre domina =====

test('GH-06A/unidade — fail com HARD marker (permission/forbidden) NUNCA cai para fallback', () => {
  assert.equal(primaryExecutorFailureOf([failEvidence('tool:x', 'permission_denied:x')], 'probe-runtime'), null);
  assert.equal(primaryExecutorFailureOf([failEvidence('tool:x', 'forbidden_action:x')], 'probe-runtime'), null);
  assert.equal(primaryExecutorFailureOf([failEvidence('tool:x', 'budget_exceeded:x')], 'probe-runtime'), null);
  // gate de permissão do PRÓPRIO runtime é resolvível (não é policy expansion):
  const gate = primaryExecutorFailureOf(
    [failEvidence('runtime:gate', 'primary_execution_gate:shell_denied')],
    'probe-runtime',
  );
  assert.ok(gate);
  assert.equal(gate.marker, 'primary_execution_gate');
  const resolvable = primaryExecutorFailureOf([failEvidence('tool:y', 'tool_unavailable:y')], 'probe-runtime');
  assert.ok(resolvable);
  assert.equal(resolvable.marker, 'tool_unavailable');
  assert.equal(resolvable.primaryExecutor, 'probe-runtime');
  assert.ok(EXECUTOR_FAILURE_MARKERS.includes('tool_unavailable'));
});

// ===== PROVA CENTRAL — fluxo determinístico end-to-end com shell REAL =====

test('GH-06A/PROVA CENTRAL — primário falha -> Guardian -> executor já autorizado -> mesma ação -> PASS', async () => {
  const contract = makeContract({
    missionId: 'GH-06A-PROOF',
    objective: 'Prova central: execução real do fallback autorizado com shell local.',
    completionCriteria: ['node_version_ok'],
    allowedActions: ['inspect_node', 'shell:node --version', 'channel:agent-runtime', 'channel:local-shell'],
    singleAttempt: true,
    maxCostUsd: 5,
    maxCycles: 5,
  });
  const contractBefore = JSON.stringify(contract);
  const shell = new LocalShellExecutor();
  const runtime = new ProbeRuntime({
    evidence: [failEvidence('tool:inspect', 'tool_unavailable:inspect_node')],
    pendingActions: [pendingShellAction()],
  });
  const harness = new GuardianHarness(contract, runtime, {
    executorFallback: { executors: [shell] },
  });
  const result = await harness.run();

  // MISSION_PASS=YES
  assert.equal(result.status, 'PASS');
  // SECOND_LLM_INFERENCE=NO + SINGLE_ATTEMPT_PRESERVED=YES
  assert.equal(runtime.runMissionCalls, 1);
  assert.equal(runtime.continueMissionCalls, 0);
  // PRIMARY_EXECUTOR_FAILED=YES
  assert.ok(result.state.evidence.some((e) => e.status === 'fail' && (e.value ?? '').includes('tool_unavailable')));
  // FALLBACK_EXECUTOR_USED=YES (REAL, canal autorizado)
  const record = result.state.fallbackAttempts?.[0];
  assert.ok(record);
  assert.equal(record.fallbackExecutor, 'local-shell');
  assert.equal(record.executionChannel, 'local-shell');
  assert.equal(record.result, 'ok');
  assert.equal(record.primaryExecutor, 'probe-runtime');
  // ACTION/EXECUTOR/CHANNEL JÁ AUTORIZADOS + PERMISSION/CHANNEL_EXPANSION=NO
  assert.equal(JSON.stringify(contract), contractBefore); // contrato imutável
  assert.ok(contract.allowedActions?.includes('shell:node --version'));
  assert.ok(contract.allowedActions?.includes('channel:local-shell'));
  assert.equal(result.reason, undefined); // sem blocker
  // FALLBACK_EVIDENCE_AUDITABLE=YES
  const fingerprint = actionFingerprint('shell:node --version');
  const audit = result.state.evidence.find((e) => e.key === `fallback:local-shell:${fingerprint}`);
  assert.ok(audit);
  const auditData = JSON.parse(audit.value as string) as Record<string, unknown>;
  for (const field of [
    'requestedAction',
    'primaryFailure',
    'fallbackExecutor',
    'executionChannel',
    'attempt',
    'result',
    'exitCode',
    'output',
    'error',
    'durationMs',
    'startedAt',
    'endedAt',
  ]) {
    assert.ok(field in auditData, `campo ausente: ${field}`);
  }
  // execução REAL: o node respondeu de verdade
  assert.equal(auditData.exitCode, 0);
  assert.match(String(auditData.output), /^v\d+\.\d+/);
  // BUDGET_EXPANSION=NO: execução local custa 0 e o orçamento não cresceu
  assert.equal(result.state.spentCostUsd, 0);
});

// ===== Helpers do T18 (mesma receita do suite GH-05) =====

class FakeAdvisor implements AdvisorAgent {
  constructor(private readonly plans: PlanProposal[]) {}
  proposePlan(): PlanProposal {
    return this.plans[0];
  }
}

function fakeAction(id: string, opts: { okKey?: string; delayMs?: number } = {}): PlanAction {
  return {
    id,
    description: `fake action ${id}`,
    dependsOn: [],
    estimatedCostUsd: 0,
    expectedEvidence: opts.okKey ? [opts.okKey] : undefined,
    run: async () => {
      await sleep(opts.delayMs ?? 0);
      return {
        evidence: [ev('command_result', opts.okKey ?? `done:${id}`, 'ok')],
        costUsd: 0,
      };
    },
  };
}

function makePlan(planId: string, actions: PlanAction[]): PlanProposal {
  return { planId, advisorId: 'fake-advisor', actions };
}

class AlwaysCompleteSupervisor implements SupervisorAgent {
  review(): SupervisorReport {
    return { recommendation: 'COMPLETE', gaps: [], reasons: ['fake_complete'] };
  }
}
