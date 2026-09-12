/**
 * GH-06 — MISSION CONTEXT + CHECKPOINT/RESUME + EXPERIENCE/ERROR MEMORY.
 * 20 provas determinísticas (T1–T19 + PROVA CENTRAL). Nenhum provider externo
 * (sem OpenRouter, sem GLM, sem Anthropic, sem missão paga).
 * Regressão T20 = as 71 provas GH-01..GH-05 continuam PASS na mesma suíte.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GuardianHarness } from '../src/harness/GuardianHarness.js';
import {
  createInitialState,
  Evidence,
  fingerprintEvidence,
  MissionContract,
  MissionState,
} from '../src/harness/missionTypes.js';
import { MultiAgentRuntime } from '../src/harness/multiAgentRuntime.js';
import { AdvisorAgent, MissionStateView } from '../src/harness/advisor.js';
import {
  buildMissionContext,
  checkpointActionStates,
  classifyCheckpointActions,
  consultMissionMemory,
  createCheckpoint,
  errorSignatureOf,
  FileCheckpointStore,
  FileMissionMemoryStore,
  filterCompletedActions,
  MemoryCheckpointStore,
  MemoryMissionMemoryStore,
  MissionCheckpoint,
} from '../src/harness/missionMemory.js';
import { ParallelExecutionReport, PlanAction, PlanProposal } from '../src/harness/multiAgentTypes.js';

// ===== helpers (mesmo estilo certificado das suítes GH-01..GH-05) =====

const BASE = 1_700_000_000_000;

function ev(type: Evidence['type'], key: string, status: 'ok' | 'fail' = 'ok', value?: string): Evidence {
  const evidence: Evidence = { type, key, status, timestamp: BASE, source: 'fake-worker' };
  if (value !== undefined) evidence.value = value; // key omitida: roundtrip JSON fiel
  return evidence;
}

function makeContract(overrides: Partial<MissionContract> = {}): MissionContract {
  return {
    missionId: 'GH-06',
    objective: 'Continuar a missão a partir de checkpoint sem transcript.',
    completionCriteria: ['ev:goal'],
    maxCycles: 4,
    maxDurationMs: 60_000,
    maxNoProgressCycles: 3,
    maxCostUsd: 1.0,
    ...overrides,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FakeActionOptions {
  okKey?: string;
  failKey?: string;
  failValue?: string;
  costUsd?: number;
  estimatedCostUsd?: number;
  dependsOn?: string[];
  delayMs?: number;
}

/** Ação fake limitada: conta execuções (prova de duplicate-work), nunca lança. */
function fakeAction(id: string, opts: FakeActionOptions = {}, runCounts?: Map<string, number>): PlanAction {
  return {
    id,
    description: `fake action ${id}`,
    dependsOn: opts.dependsOn ?? [],
    estimatedCostUsd: opts.estimatedCostUsd,
    expectedEvidence: opts.okKey ? [opts.okKey] : undefined,
    run: async () => {
      if (runCounts) runCounts.set(id, (runCounts.get(id) ?? 0) + 1);
      await sleep(opts.delayMs ?? 0);
      if (opts.failKey) {
        return { evidence: [ev('tool_result', opts.failKey, 'fail', opts.failValue)], costUsd: opts.costUsd ?? 0 };
      }
      return { evidence: [ev('command_result', opts.okKey ?? `done:${id}`)], costUsd: opts.costUsd ?? 0 };
    },
  };
}

/** Advisor determinístico que planeja a partir do estado congelado (frozen view). */
class PlannedAdvisor implements AdvisorAgent {
  calls = 0;
  constructor(private readonly build: (view: MissionStateView) => PlanAction[]) {}
  proposePlan(_objective: string, view: MissionStateView): PlanProposal {
    this.calls += 1;
    return { planId: `p${this.calls}`, advisorId: 'planned', actions: this.build(view) };
  }
}

function withTempDir(name: string, fn: (dir: string) => Promise<void> | void): Promise<void> | void {
  const dir = mkdtempSync(join(tmpdir(), `gh06-${name}-`));
  const finish = () => rmSync(dir, { recursive: true, force: true });
  try {
    const out = fn(dir);
    if (out instanceof Promise) return out.finally(finish);
    finish();
    return out;
  } catch (error) {
    finish();
    throw error;
  }
}

function near(expected: number, actual: number | undefined): boolean {
  return Math.abs((actual ?? 0) - expected) < 1e-9;
}

// ===== T1 — contexto compacto =====

test('GH-06/T1 — contexto compacto: só dados operacionais, evidência por referência, sem transcript', () => {
  const contract = makeContract({
    missionId: 'ctx-1',
    objective: 'Executar trabalho com contexto mínimo.',
    allowedFiles: ['src/a.ts'],
    completionCriteria: ['ev:x'],
  });
  const state = createInitialState(contract, BASE);
  state.cycle = 2;
  state.completedSteps = ['step-a'];
  state.remainingSteps = ['ev:x'];
  state.evidence = [
    ev('file_read', 'src/a.ts'),
    ev('command_result', 'step-a', 'fail', 'boom'.repeat(100)),
  ];
  state.lastStrategy = 'multi-agent';
  state.blocker = 'blocker-text';

  const ctx = buildMissionContext(contract, state, BASE + 5);
  assert.equal(ctx.schemaVersion, 1);
  assert.equal(ctx.missionId, 'ctx-1');
  assert.equal(ctx.objective, 'Executar trabalho com contexto mínimo.');
  assert.deepEqual(ctx.completedSteps, ['step-a']);
  assert.deepEqual(ctx.pendingSteps, ['ev:x']);
  assert.deepEqual(ctx.relevantResources, ['src/a.ts']);
  // evidência viaja como REFERÊNCIA — nenhum valor bruto é copiado
  assert.deepEqual(ctx.evidenceRefs, ['file_read:src/a.ts:ok', 'command_result:step-a:fail']);
  const serialized = JSON.stringify(ctx);
  assert.ok(!serialized.includes('boom'.repeat(100)), 'valor de evidência vazou para o contexto');
  assert.ok(!serialized.toLowerCase().includes('transcript'));
  assert.ok(serialized.length < 2000, `contexto não compacto: ${serialized.length} bytes`);
  assert.ok(ctx.recoveryTried.includes('multi-agent'));
  assert.deepEqual(ctx.knownBlockers, ['blocker-text']);

  // histórico de decisões é limitado (nunca cresce sem bound)
  state.decisionLog = Array.from({ length: 30 }, (_, i) => ({
    cycle: i,
    decision: 'CONTINUE' as const,
    classification: 'RESOLVABLE' as const,
    reason: `r${i}`,
    at: BASE,
  }));
  const ctx2 = buildMissionContext(contract, state, BASE + 6);
  assert.equal(ctx2.decisions.length, 20);
});

// ===== T2 — checkpoint salvo (íntegro, versionado, atômico, determinístico) =====

test('GH-06/T2 — checkpoint salvo em arquivo: versionado, íntegro, atômico (sem .tmp sobrando)', async () => {
  await withTempDir('t2', async (dir) => {
    const contract = makeContract({ missionId: 'cp-save', completionCriteria: ['ev:a'] });
    const state = createInitialState(contract, BASE);
    state.completedSteps = ['a'];
    state.evidence = [ev('command_result', 'ev:a')];

    const cp = createCheckpoint({ contract, state, now: BASE + 10 });
    assert.equal(cp.schemaVersion, 1);
    assert.match(cp.checkpointId, /^[0-9a-f]{16}$/);
    // id determinístico: mesmos inputs -> mesmo id
    assert.equal(createCheckpoint({ contract, state, now: BASE + 10 }).checkpointId, cp.checkpointId);

    const store = new FileCheckpointStore(join(dir, 'nested', 'checkpoint.json'));
    await store.save(cp);
    const raw = JSON.parse(readFileSync(join(dir, 'nested', 'checkpoint.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(raw.schemaVersion, 1);
    assert.equal((raw.state as MissionState).missionId, 'cp-save');
    // atomicidade: nenhum arquivo .tmp- sobrando depois do rename
    const leftovers = readdirSync(join(dir, 'nested')).filter((f) => f.includes('.tmp-'));
    assert.equal(leftovers.length, 0);
  });
});

// ===== T3 — checkpoint carregado é equivalente ao salvo =====

test('GH-06/T3 — checkpoint load: estado e contexto equivalentes aos salvos', async () => {
  const contract = makeContract({ missionId: 'cp-load', completionCriteria: ['ev:a'] });
  const state = createInitialState(contract, BASE);
  state.cycle = 3;
  state.spentCostUsd = 0.42;
  state.transientRetries = 1;
  state.evidence = [ev('file_hash', 'ev:a')];
  state.decisionLog = [{ cycle: 1, decision: 'RECOVER', classification: 'TRANSIENT', reason: 'transient_retry(1/2)', at: BASE }];
  const cp = createCheckpoint({ contract, state, now: BASE + 3 });

  const memStore = new MemoryCheckpointStore();
  await memStore.save(cp);
  const fromMemory = await memStore.load();
  assert.ok(fromMemory);
  assert.deepEqual(fromMemory.state, state);
  assert.deepEqual(fromMemory.context, cp.context);
  assert.equal(fromMemory.checkpointId, cp.checkpointId);

  await withTempDir('t3', async (dir) => {
    const fileStore = new FileCheckpointStore(join(dir, 'cp.json'));
    await fileStore.save(cp);
    const fromFile = await fileStore.load();
    assert.ok(fromFile);
    assert.deepEqual(fromFile.state, state);
    assert.deepEqual(fromFile.context, cp.context);
    assert.equal(fromFile.contract.missionId, 'cp-load');
  });
});

// ===== T4 — resume com NOVO runtime (sem transcript) =====

test('GH-06/T4 — resume em runtime NOVO: continua exatamente onde parou, sem transcript', async () => {
  await withTempDir('t4', async (dir) => {
    const cpPath = join(dir, 'cp.json');
    const runCounts = new Map<string, number>();
    const contractA = makeContract({ missionId: 'resume-1', completionCriteria: ['ev:a', 'ev:b'], maxCycles: 1 });
    const runtimeA = new MultiAgentRuntime({
      advisor: new PlannedAdvisor(() => [fakeAction('a', { okKey: 'ev:a', costUsd: 0.1 }, runCounts)]),
    });
    const harnessA = new GuardianHarness(contractA, runtimeA, {
      checkpointStore: new FileCheckpointStore(cpPath),
      now: () => BASE,
    });
    const resultA = await harnessA.run();
    assert.equal(resultA.status, 'BLOCKED'); // interrompida pelo cap de ciclos
    assert.match(resultA.reason as string, /max_cycles_exhausted/);
    assert.equal(runCounts.get('a'), 1);
    assert.equal(resultA.state.spentCostUsd, 0.1);

    // Runtime B: objeto NOVO — zero histórico, zero transcript em memória
    const contractB = makeContract({ missionId: 'resume-1', completionCriteria: ['ev:a', 'ev:b'], maxCycles: 4 });
    const runtimeB = new MultiAgentRuntime({
      advisor: new PlannedAdvisor(() => [fakeAction('b', { okKey: 'ev:b', costUsd: 0.1 }, runCounts)]),
    });
    const harnessB = new GuardianHarness(contractB, runtimeB, {
      checkpointStore: new FileCheckpointStore(cpPath),
      now: () => BASE + 1,
    });
    await harnessB.begin();
    assert.equal(harnessB.resumedFromCheckpoint, true);
    assert.equal(harnessB.getState().cycle, 1);
    assert.equal(harnessB.getState().spentCostUsd, 0.1);
    assert.ok(harnessB.getState().evidence.some((e) => e.key === 'ev:a' && e.status === 'ok'));
    assert.ok(harnessB.checkpointContext);
    assert.equal(harnessB.checkpointContext!.missionId, 'resume-1');

    const resultB = await harnessB.run();
    assert.equal(resultB.status, 'PASS');
    assert.equal(runCounts.get('a'), 1); // nunca re-executou
    assert.equal(runCounts.get('b'), 1);
    assert.equal(runtimeB.executionReports.length, 1); // só o ciclo próprio
    assert.equal(runtimeB.executeCycleCalls, 1);
  });
});

// ===== T5 — step concluído NÃO re-executa (filtro estrutural) =====

test('GH-06/T5 — ação concluída com evidência conclusiva NUNCA re-executa após resume', async () => {
  const runCounts = new Map<string, number>();
  const contract = makeContract({ missionId: 'dup-1', completionCriteria: ['ev:a', 'ev:b'] });
  const state = createInitialState(contract, BASE);
  state.completedSteps = ['a']; // concluído ANTES do checkpoint
  state.evidence = [ev('command_result', 'ev:a')];

  const proposal: PlanProposal = {
    planId: 'p', advisorId: 'planned',
    actions: [
      fakeAction('a', { okKey: 'ev:a' }, runCounts),
      fakeAction('b', { okKey: 'ev:b', dependsOn: ['a'] }, runCounts),
    ],
  };

  // filtro estrutural: 'a' skip; dependência de 'b' sobre 'a' resolvida
  const filtered = filterCompletedActions(proposal, state);
  assert.deepEqual(filtered.skipped, ['a']);
  assert.deepEqual(filtered.executable.map((x) => x.id), ['b']);
  assert.deepEqual(filtered.executable[0].dependsOn, []);

  const report = {
    planId: 'p', waveCount: 1, maxObservedConcurrency: 1, aborted: false,
    records: [
      { actionId: 'a', wave: 0, status: 'ok', startMs: 1, endMs: 2, costUsd: 0 },
      { actionId: 'b', wave: 1, status: 'budget_blocked', costUsd: 0 },
    ],
    evidence: [], totalCostUsd: 0,
    results: new Map([['a', { actionId: 'a', status: 'ok', started: true, startMs: 1, endMs: 2, evidence: [ev('command_result', 'ev:a')], costUsd: 0 }]]),
  } as unknown as ParallelExecutionReport;
  const cp = createCheckpoint({
    contract, state, now: BASE,
    waveState: { planId: 'p1', actions: checkpointActionStates(report) },
  });

  // reconciliação: a=completed (prova conclusiva), b=pending (nunca iniciou)
  const disposals = classifyCheckpointActions(cp, proposal);
  assert.equal(disposals.get('a'), 'completed');
  assert.equal(disposals.get('b'), 'pending');

  const cpStore = new MemoryCheckpointStore();
  await cpStore.save(cp);
  const runtimeB = new MultiAgentRuntime({
    advisor: new PlannedAdvisor(() => proposal.actions), // re-propõe TUDO
  });
  const harnessB = new GuardianHarness(contract, runtimeB, { checkpointStore: cpStore, now: () => BASE });
  const result = await harnessB.run();
  assert.equal(result.status, 'PASS');
  assert.deepEqual(runtimeB.lastSkippedActionIds, ['a']);
  assert.equal(runCounts.get('a'), undefined); // 'a' JAMAIS re-executou
  assert.equal(runCounts.get('b'), 1);         // pendente executou (dependência resolvida)
});

// ===== T6 — budget preservado =====

test('GH-06/T6 — spentCostUsd sobrevive; trabalho novo respeita o RESTANTE do cap', async () => {
  const contract = makeContract({ missionId: 'budget-1', completionCriteria: ['ev:c'], maxCycles: 6 });
  const state = createInitialState(contract, BASE);
  state.spentCostUsd = 0.7; // consumido antes do checkpoint (cap 1.0)
  const cpStore = new MemoryCheckpointStore();
  await cpStore.save(createCheckpoint({ contract, state, now: BASE }));

  const runtime = new MultiAgentRuntime({
    advisor: new PlannedAdvisor(() => [
      { id: 'c', dependsOn: [], expectedEvidence: ['ev:c'], estimatedCostUsd: 0.4, run: async () => ({ evidence: [ev('command_result', 'ev:c')], costUsd: 0.4 }) },
      { id: 'd', dependsOn: [], estimatedCostUsd: 0.4, run: async () => ({ evidence: [] }) },
    ]),
  });
  const harness = new GuardianHarness(contract, runtime, { checkpointStore: cpStore, now: () => BASE });
  await harness.begin();
  assert.equal(harness.getState().spentCostUsd, 0.7); // preservado — nunca resetado

  const result = await harness.run();
  // 0.7 + reserva 0.4 > 1.0 → NENHUM worker inicia (budget_blocked, sem startMs)
  const report = runtime.lastExecutionReport!;
  const recordOf = (id: string) => report.records.find((r) => r.actionId === id);
  assert.equal(recordOf('c')?.status, 'budget_blocked');
  assert.equal(recordOf('c')?.startMs, undefined); // nunca iniciou
  assert.equal(recordOf('d')?.status, 'budget_blocked');
  assert.equal(result.state.spentCostUsd, 0.7); // nada novo foi gasto
  assert.notEqual(result.status, 'PASS');       // orçamento não compra PASS
});

// ===== T7 — recovery state preservado =====

test('GH-06/T7 — recovery state (transientRetries/recoveryAttempts/last*) sobrevive ao checkpoint', async () => {
  const contract = makeContract({ missionId: 'rec-1' });
  const state = createInitialState(contract, BASE);
  state.transientRetries = 1;
  state.recoveryAttempts = 1;
  state.lastTransientFailKey = 'svc:timeout';
  state.lastStrategy = 'multi-agent';
  state.lastClassification = 'TRANSIENT';
  state.sameStrategyFailures = 1;
  state.lastError = 'svc:timeout:request timed out';
  const cpStore = new MemoryCheckpointStore();
  await cpStore.save(createCheckpoint({ contract, state, now: BASE }));

  const runtime = new MultiAgentRuntime({ advisor: new PlannedAdvisor(() => []) });
  const harness = new GuardianHarness(contract, runtime, { checkpointStore: cpStore, now: () => BASE });
  await harness.begin();
  const resumed = harness.getState();
  assert.equal(resumed.transientRetries, 1);
  assert.equal(resumed.recoveryAttempts, 1);
  assert.equal(resumed.lastTransientFailKey, 'svc:timeout');
  assert.equal(resumed.lastStrategy, 'multi-agent');
  assert.equal(resumed.lastClassification, 'TRANSIENT');
  assert.equal(resumed.sameStrategyFailures, 1);
  assert.equal(resumed.lastError, 'svc:timeout:request timed out');
  assert.equal(resumed.decisionLog, undefined); // estados antigos carregam intactos
});

// ===== T8 — no-progress preservado =====

test('GH-06/T8 — noProgressCount preservado; novo ciclo sem progresso atinge o limite normalmente', async () => {
  const contract = makeContract({ missionId: 'np-1', completionCriteria: ['ev:x'], maxNoProgressCycles: 2, maxCycles: 6 });
  const state = createInitialState(contract, BASE);
  state.noProgressCount = 1;
  state.lastProgressFingerprint = fingerprintEvidence([], []);
  const cpStore = new MemoryCheckpointStore();
  await cpStore.save(createCheckpoint({ contract, state, now: BASE }));

  // UM ciclo sem progresso a partir de 1 deve bloquear (2/2) — não recomeça do zero
  const runtime = new MultiAgentRuntime({
    advisor: new PlannedAdvisor(() => [fakeAction('f', { failKey: 'op:fail', failValue: 'boom' })]),
  });
  const harness = new GuardianHarness(contract, runtime, { checkpointStore: cpStore, now: () => BASE });
  const result = await harness.run();
  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reason as string, /^no_progress_limit_reached\(2\/2\)/);
  assert.equal(result.state.noProgressCount, 2);
});

// ===== T9 — evidência preservada =====

test('GH-06/T9 — evidência sobrevive ao checkpoint e CompletionGuard a usa (zero ciclos novos)', async () => {
  const contract = makeContract({ missionId: 'ev-1', completionCriteria: ['ev:a', 'ev:b'] });
  const state = createInitialState(contract, BASE);
  state.completedSteps = ['a'];
  state.evidence = [ev('file_hash', 'ev:a'), ev('tool_result', 'ev:b')];
  const cpStore = new MemoryCheckpointStore();
  await cpStore.save(createCheckpoint({ contract, state, now: BASE }));

  const runtime = new MultiAgentRuntime({ advisor: new PlannedAdvisor(() => []) });
  const harness = new GuardianHarness(contract, runtime, { checkpointStore: cpStore, now: () => BASE });
  await harness.begin();
  assert.equal(harness.getState().evidence.length, 2);
  const result = await harness.evaluateCompletionOnly();
  assert.equal(result.status, 'PASS'); // critérios satisfeitos SÓ com evidência preservada
  assert.equal(result.state.cycle, 0); // nenhum trabalho re-executado
});

// ===== T10 — error memory: erro conhecido é reutilizado =====

test('GH-06/T10 — erro conhecido: memória consultada, recovery allowlisted adotado, sem re-investigação', async () => {
  const memory = new MemoryMissionMemoryStore();
  await memory.recordError({
    errorSignature: errorSignatureOf('svc:timeout:request timed out'),
    classification: 'TRANSIENT',
    knownCause: 'upstream briefly unavailable',
    safeRecovery: 'retry_with_backoff',
    lastOutcome: 'RECOVER',
    createdAt: BASE,
    updatedAt: BASE,
  });
  let attempts = 0;
  const runtime = new MultiAgentRuntime({
    advisor: new PlannedAdvisor(() => [
      attempts++ === 0
        ? fakeAction('a', { failKey: 'svc:timeout', failValue: 'request timed out' })
        : fakeAction('b', { okKey: 'ev:goal' }),
    ]),
  });
  const harness = new GuardianHarness(
    makeContract({ missionId: 'mem-10', completionCriteria: ['ev:goal'] }),
    runtime,
    { memory, now: () => BASE },
  );
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.ok(harness.lastMemoryAdvice?.consulted);
  // recovery conhecida reutilizada (alias retry_with_backoff -> transient_non_llm_retry)
  const advice = await consultMissionMemory(memory, 'svc:timeout:request timed out', 'RECOVER');
  assert.equal(advice.adoptedAction, 'transient_non_llm_retry');
  assert.equal(advice.knownError?.classification, 'TRANSIENT');
  // sem segunda investigação equivalente: exatamente 2 ciclos (falha -> retry conhecido -> ok)
  assert.equal(runtime.executeCycleCalls, 2);
  // experiência de sucesso registrada para a situação equivalente
  const experience = await memory.findExperience('svc:timeout:request timed out');
  assert.ok(experience);
  assert.equal(experience.outcome, 'success');
});

// ===== T11 — experience memory =====

test('GH-06/T11 — experiência (situação+ação+outcome) registrada e consultável; persiste em arquivo', async () => {
  const memory = new MemoryMissionMemoryStore();
  await memory.recordExperience({
    signature: errorSignatureOf('deploy:locked:database is locked'),
    situation: 'deploy:locked:database is locked',
    classification: 'RESOLVABLE',
    actionTaken: 'safe_adaptation_within_permissions',
    outcome: 'success',
    evidenceRefs: ['command_result:ev:fix'],
    createdAt: BASE,
  });
  const found = await memory.findExperience('deploy:locked:DATABASE   IS locked'); // equivalente por normalização
  assert.ok(found);
  assert.equal(found.outcome, 'success');
  assert.equal(found.actionTaken, 'safe_adaptation_within_permissions');
  assert.deepEqual(found.evidenceRefs, ['command_result:ev:fix']);
  assert.equal(await memory.findExperience('outra:coisa'), null);

  await withTempDir('t11', async (dir) => {
    const fileMemory = new FileMissionMemoryStore(join(dir, 'memory.json'));
    await fileMemory.recordError({
      errorSignature: 'svc:503', classification: 'TRANSIENT',
      safeRecovery: 'transient_non_llm_retry', createdAt: BASE, updatedAt: BASE,
    });
    const reloaded = new FileMissionMemoryStore(join(dir, 'memory.json'));
    const err = await reloaded.findError('svc:503');
    assert.ok(err);
    assert.equal(err.classification, 'TRANSIENT');
    assert.equal(reloaded.lastLoadDegraded, false);
  });
});

// ===== T12 — memória NÃO governa =====

test('GH-06/T12 — memória NÃO governa: memória "otimista" mas evidência insuficiente -> NUNCA PASS', async () => {
  const memory = new MemoryMissionMemoryStore();
  await memory.recordExperience({ signature: 'goal', situation: 'goal', actionTaken: 'everything', outcome: 'success', evidenceRefs: [], createdAt: BASE });
  await memory.recordError({ errorSignature: 'goal', classification: 'RESOLVABLE', safeRecovery: 'authoritative_source_query', createdAt: BASE, updatedAt: BASE });

  const contract = makeContract({ missionId: 'mem-12', completionCriteria: ['ev:goal'] });
  const state = createInitialState(contract, BASE); // SEM evidência
  const cpStore = new MemoryCheckpointStore();
  await cpStore.save(createCheckpoint({ contract, state, now: BASE }));

  const runtime = new MultiAgentRuntime({ advisor: new PlannedAdvisor(() => []) });
  const harness = new GuardianHarness(contract, runtime, { checkpointStore: cpStore, memory, now: () => BASE });
  await harness.begin();
  const result = await harness.evaluateCompletionOnly();
  assert.equal(result.status, 'FAIL'); // CompletionGuard soberano
  assert.match(result.reason as string, /completion_criteria_missing/);
  assert.equal(harness.getState().evidence.length, 0); // memória não fabrica evidência

  // memória só orienta AÇÃO (allowlist) — não existe canal para PASS
  const advice = await consultMissionMemory(memory, 'goal', 'RECOVER');
  assert.equal(advice.adoptedAction, 'authoritative_source_query');
});

// ===== T13 — memória stale não vence =====

test('GH-06/T13 — memória STALE não vence: evidência/estado atuais sobrepõem recomendação antiga', async () => {
  const memory = new MemoryMissionMemoryStore();
  await memory.recordError({
    errorSignature: errorSignatureOf('svc:timeout:request timed out'),
    classification: 'TRANSIENT',
    safeRecovery: 'switch_to_alternative_safe_strategy', // recomendação antiga
    createdAt: BASE - 1000,
    updatedAt: BASE - 1000,
  });
  let calls = 0;
  const runtime = new MultiAgentRuntime({
    advisor: new PlannedAdvisor(() => [
      calls++ === 0
        ? fakeAction('a', { failKey: 'svc:timeout', failValue: 'request timed out' })
        : fakeAction('b', { okKey: 'ev:goal' }),
    ]),
  });
  const harness = new GuardianHarness(
    makeContract({ missionId: 'stale-1', completionCriteria: ['ev:goal'] }),
    runtime,
    { memory, now: () => BASE },
  );
  const result = await harness.run();
  // a recomendação antiga nunca governa: a evidência ATUAL (retry ok) conclui a missão
  assert.equal(result.status, 'PASS');
  assert.ok(result.state.evidence.some((e) => e.key === 'ev:goal' && e.status === 'ok'));
  assert.equal(runtime.executeCycleCalls, 2);

  // decisão CONTINUE nunca é governada por memória
  const adviceContinue = await consultMissionMemory(memory, 'svc:timeout:request timed out', 'CONTINUE');
  assert.equal(adviceContinue.adoptedAction, undefined);
  // e ação fora da allowlist NUNCA é adotada (second_mission etc.)
  await memory.recordError({ errorSignature: 'x:boom', classification: 'TRANSIENT', safeRecovery: 'second_mission', createdAt: BASE, updatedAt: BASE });
  const denied = await consultMissionMemory(memory, 'x:boom', 'RECOVER');
  assert.equal(denied.adoptedAction, undefined);
});

// ===== T14 — checkpoint corrompido: FAIL-CLOSED =====

test('GH-06/T14 — checkpoint corrompido: FAIL-CLOSED (nunca reconstrói por adivinhação)', async () => {
  await withTempDir('t14', async (dir) => {
    const path = join(dir, 'cp.json');
    const store = new FileCheckpointStore(path);
    writeFileSync(path, '{not-json-at-all', 'utf8');
    await assert.rejects(() => store.load(), /CHECKPOINT_CORRUPT/);
    // JSON válido, estrutura inválida
    writeFileSync(path, JSON.stringify({ hello: 'world' }), 'utf8');
    await assert.rejects(() => store.load(), /CHECKPOINT_CORRUPT/);
    // checkpoint truncado no meio de uma escrita
    const contract = makeContract({ missionId: 'corrupt-1' });
    const good = createCheckpoint({ contract, state: createInitialState(contract, BASE), now: BASE });
    const goodJson = JSON.stringify(good);
    writeFileSync(path, goodJson.slice(0, Math.floor(goodJson.length / 2)), 'utf8');
    await assert.rejects(() => store.load(), /CHECKPOINT_CORRUPT/);
    // o Guardian também falha fechado no begin() — não começa missão nova por cima
    const runtime = new MultiAgentRuntime({ advisor: new PlannedAdvisor(() => []) });
    const harness = new GuardianHarness(contract, runtime, { checkpointStore: store, now: () => BASE });
    await assert.rejects(() => harness.begin(), /CHECKPOINT_CORRUPT/);
    assert.equal(harness.getState(), undefined);
  });
});

// ===== T15 — schemaVersion incompatível: BLOCK/FAIL-CLOSED =====

test('GH-06/T15 — schemaVersion incompatível: FAIL-CLOSED (sem adivinhar formato)', async () => {
  await withTempDir('t15', async (dir) => {
    const path = join(dir, 'cp.json');
    const contract = makeContract({ missionId: 'version-1' });
    const good = createCheckpoint({ contract, state: createInitialState(contract, BASE), now: BASE });
    const store = new FileCheckpointStore(path);
    writeFileSync(path, JSON.stringify({ ...JSON.parse(JSON.stringify(good)), schemaVersion: 999 }), 'utf8');
    await assert.rejects(() => store.load(), /CHECKPOINT_SCHEMA_VERSION_UNSUPPORTED:999/);
    writeFileSync(path, JSON.stringify({ ...JSON.parse(JSON.stringify(good)), schemaVersion: 0 }), 'utf8');
    await assert.rejects(() => store.load(), /CHECKPOINT_SCHEMA_VERSION_UNSUPPORTED:0/);
    const runtime = new MultiAgentRuntime({ advisor: new PlannedAdvisor(() => []) });
    const harness = new GuardianHarness(contract, runtime, { checkpointStore: store, now: () => BASE });
    await assert.rejects(() => harness.begin(), /CHECKPOINT_SCHEMA_VERSION_UNSUPPORTED/);
  });
});

// ===== T16 — wave + checkpoint =====

test('GH-06/T16 — wave A/B ok + C não conclusivo: resume não repete A/B e NÃO assume C concluído', async () => {
  const runCounts = new Map<string, number>();
  let cAttempts = 0;
  const cAction = (delayMs: number): PlanAction => ({
    id: 'C', dependsOn: [], expectedEvidence: ['ev:c'],
    run: async () => {
      runCounts.set('C', (runCounts.get('C') ?? 0) + 1);
      await sleep(delayMs);
      if (++cAttempts === 1) return { evidence: [ev('tool_result', 'svc:timeout', 'fail', 'timed out')] };
      return { evidence: [ev('command_result', 'ev:c')] };
    },
  });
  const plan = (): PlanAction[] => [
    fakeAction('A', { okKey: 'ev:a', delayMs: 150 }, runCounts),
    fakeAction('B', { okKey: 'ev:b', delayMs: 150 }, runCounts),
    cAction(100),
  ];

  const cpStore = new MemoryCheckpointStore();
  const contractA = makeContract({ missionId: 'wave-1', completionCriteria: ['ev:a', 'ev:b', 'ev:c'], maxCycles: 1, maxParallelActions: 3 });
  const runtimeA = new MultiAgentRuntime({ advisor: new PlannedAdvisor(plan), maxParallelActions: 3 });
  const resultA = await new GuardianHarness(contractA, runtimeA, { checkpointStore: cpStore, now: () => BASE }).run();
  assert.equal(resultA.status, 'BLOCKED'); // interrompida após a 1ª wave
  assert.equal(runCounts.get('A'), 1);
  assert.equal(runCounts.get('B'), 1);
  assert.equal(runCounts.get('C'), 1);

  // waveState no checkpoint: A/B conclusivos; C iniciado SEM prova conclusiva
  const cp = await cpStore.load();
  assert.ok(cp?.waveState);
  const disposals = classifyCheckpointActions(cp as MissionCheckpoint);
  assert.equal(disposals.get('A'), 'completed');
  assert.equal(disposals.get('B'), 'completed');
  assert.equal(disposals.get('C'), 'reconcile'); // nunca assumido como concluído

  // resume: advisor re-propõe o MESMO plano [A,B,C]
  const contractB = makeContract({ missionId: 'wave-1', completionCriteria: ['ev:a', 'ev:b', 'ev:c'], maxCycles: 4, maxParallelActions: 3 });
  const runtimeB = new MultiAgentRuntime({ advisor: new PlannedAdvisor(plan), maxParallelActions: 3 });
  const harnessB = new GuardianHarness(contractB, runtimeB, { checkpointStore: cpStore, now: () => BASE });
  const resultB = await harnessB.run();
  assert.equal(resultB.status, 'PASS');
  assert.deepEqual(runtimeB.lastSkippedActionIds, ['A', 'B']); // concluídas não repetem
  assert.equal(runCounts.get('A'), 1);
  assert.equal(runCounts.get('B'), 1);
  assert.equal(runCounts.get('C'), 2); // reconciliada por RE-EXECUÇÃO com evidência nova
  for (const key of ['ev:a', 'ev:b', 'ev:c']) {
    assert.ok(resultB.state.evidence.some((e) => e.key === key && e.status === 'ok'));
  }
});

// ===== T17 — global budget + resume =====

test('GH-06/T17 — budget global consumido por workers sobrevive; runtime novo respeita o restante', async () => {
  const cpStore = new MemoryCheckpointStore();
  const base = { missionId: 'gbudget-1', completionCriteria: ['ev:c1', 'ev:c2', 'ev:c3'], maxCostUsd: 1.0, maxParallelActions: 3 };
  const contractA = makeContract({ ...base, maxCycles: 1 });
  const runtimeA = new MultiAgentRuntime({
    advisor: new PlannedAdvisor(() => [
      fakeAction('w1', { okKey: 'ev:c1', estimatedCostUsd: 0.35, costUsd: 0.35 }),
      fakeAction('w2', { okKey: 'ev:c2', estimatedCostUsd: 0.35, costUsd: 0.35 }),
    ]),
    maxParallelActions: 3,
  });
  const resultA = await new GuardianHarness(contractA, runtimeA, { checkpointStore: cpStore, now: () => BASE }).run();
  assert.equal(resultA.status, 'BLOCKED');
  assert.equal(resultA.state.spentCostUsd, 0.7); // 2 workers consumiram 0.70 de 1.00

  const contractB = makeContract({ ...base, maxCycles: 4 });
  const runtimeB = new MultiAgentRuntime({
    advisor: new PlannedAdvisor(() => [
      fakeAction('w4', { okKey: 'ev:c3', estimatedCostUsd: 0.3, costUsd: 0.3 }),
      fakeAction('w5', { estimatedCostUsd: 0.3 }),
    ]),
    maxParallelActions: 3,
  });
  const harnessB = new GuardianHarness(contractB, runtimeB, { checkpointStore: cpStore, now: () => BASE });
  await harnessB.begin();
  assert.equal(harnessB.getState().spentCostUsd, 0.7);
  const resultB = await harnessB.run();
  const report = runtimeB.lastExecutionReport!;
  const recordOf = (id: string) => report.records.find((r) => r.actionId === id);
  // restante global = 0.30: w4 cabe; w5 NÃO cabe mais (reserva nunca passa do cap)
  assert.equal(report.results.get('w4')?.status, 'ok');
  assert.equal(recordOf('w5')?.status, 'budget_blocked');
  assert.equal(recordOf('w5')?.startMs, undefined); // nunca iniciou
  assert.equal(resultB.status, 'PASS');
  assert.ok(near(1.0, resultB.state.spentCostUsd));
});

// ===== T18 — recovery + experience memory =====

test('GH-06/T18 — erro conhecido: Guardian usa a recovery registrada; missão continua sem 2ª investigação', async () => {
  const memory = new MemoryMissionMemoryStore();
  await memory.recordError({
    errorSignature: errorSignatureOf('db:locked:database is locked'),
    classification: 'RESOLVABLE',
    knownCause: 'concurrent writer holds the lock',
    safeRecovery: 'safe_adaptation_within_permissions',
    lastOutcome: 'RECOVER',
    createdAt: BASE,
    updatedAt: BASE,
  });
  let calls = 0;
  const runtime = new MultiAgentRuntime({
    advisor: new PlannedAdvisor(() => [
      calls++ === 0
        ? fakeAction('a', { failKey: 'db:locked', failValue: 'database is locked' })
        : fakeAction('b', { okKey: 'ev:goal' }),
    ]),
  });
  const harness = new GuardianHarness(
    makeContract({ missionId: 'rec-mem-1', completionCriteria: ['ev:goal'] }),
    runtime,
    { memory, now: () => BASE },
  );
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.equal(runtime.executeCycleCalls, 2); // sem segunda investigação equivalente
  // a recovery ADOPTADA da memória (não a da tabela fresca) ficou no registro do erro
  const known = await memory.findError('db:locked:database is locked');
  assert.ok(known);
  assert.equal(known.safeRecovery, 'safe_adaptation_within_permissions');
  assert.equal(known.lastOutcome, 'RECOVER');
  // experiência de recuperação bem-sucedida registrada
  const experience = await memory.findExperience('db:locked:database is locked');
  assert.ok(experience);
  assert.equal(experience.outcome, 'success');
});

// ===== T19 — múltiplos resumes =====

test('GH-06/T19 — múltiplos resumes: estado cumulativo correto (ciclos, custo, evidência)', async () => {
  const cpStore = new MemoryCheckpointStore();
  const runCounts = new Map<string, number>();
  const base = { missionId: 'multi-1', completionCriteria: ['ev:1', 'ev:2', 'ev:3'], maxCostUsd: 1.0 };
  const mk = (maxCycles: number) => makeContract({ ...base, maxCycles });

  const runtime1 = new MultiAgentRuntime({ advisor: new PlannedAdvisor(() => [fakeAction('r1', { okKey: 'ev:1', costUsd: 0.1 }, runCounts)]) });
  const h1 = new GuardianHarness(mk(1), runtime1, { checkpointStore: cpStore, now: () => BASE });
  assert.equal((await h1.run()).status, 'BLOCKED');

  const runtime2 = new MultiAgentRuntime({ advisor: new PlannedAdvisor(() => [fakeAction('r2', { okKey: 'ev:2', costUsd: 0.1 }, runCounts)]) });
  const h2 = new GuardianHarness(mk(2), runtime2, { checkpointStore: cpStore, now: () => BASE });
  assert.equal((await h2.run()).status, 'BLOCKED');
  assert.equal(h2.resumedFromCheckpoint, true);

  const runtime3 = new MultiAgentRuntime({ advisor: new PlannedAdvisor(() => [fakeAction('r3', { okKey: 'ev:3', costUsd: 0.1 }, runCounts)]) });
  const h3 = new GuardianHarness(mk(4), runtime3, { checkpointStore: cpStore, now: () => BASE });
  const result = await h3.run();
  assert.equal(h3.resumedFromCheckpoint, true);
  assert.equal(result.status, 'PASS');
  assert.equal(result.state.cycle, 3);
  assert.ok(near(0.3, result.state.spentCostUsd));
  for (const key of ['ev:1', 'ev:2', 'ev:3']) {
    assert.ok(result.state.evidence.some((e) => e.key === key && e.status === 'ok'));
  }
  assert.equal(runCounts.get('r1'), 1);
  assert.equal(runCounts.get('r2'), 1);
  assert.equal(runCounts.get('r3'), 1);
  assert.ok((result.state.decisionLog?.length ?? 0) >= 3);
});

// ===== PROVA CENTRAL — end-to-end determinístico =====

test('GH-06/PROVA — missão completa: Advisor->Workers->Supervisor, checkpoint, runtime descartado, resume, PASS', async () => {
  await withTempDir('proof', async (dir) => {
    const cpPath = join(dir, 'checkpoint.json');
    const memPath = join(dir, 'memory.json');
    const runCounts = new Map<string, number>();
    let planAttempts = 0;
    let buildAttempts = 0;
    const TRANSIENT_FAIL = { key: 'svc:unavailable', value: 'service unavailable' };

    // Advisor determinístico: planeja exatamente os steps restantes (PARALLEL BY DEFAULT)
    const makeActions = (view: MissionStateView): PlanAction[] => {
      const remaining = view.remainingSteps.map((s) => s.replace('ev:', ''));
      const actions: PlanAction[] = [];
      for (const id of remaining) {
        if (id === 'plan' || id === 'build') {
          const isFirstAttempt = id === 'plan' ? ++planAttempts : ++buildAttempts;
          actions.push({
            id, dependsOn: [], expectedEvidence: [`ev:${id}`], estimatedCostUsd: 0.1,
            run: async () => {
              runCounts.set(id, (runCounts.get(id) ?? 0) + 1);
              if (isFirstAttempt === 1) return { evidence: [ev('tool_result', TRANSIENT_FAIL.key, 'fail', TRANSIENT_FAIL.value)] };
              return { evidence: [ev('command_result', `ev:${id}`)], costUsd: 0.1 };
            },
          });
        } else if (id === 'verify') {
          actions.push({
            id: 'verify',
            dependsOn: remaining.includes('build') ? ['build'] : [],
            expectedEvidence: ['ev:verify'],
            estimatedCostUsd: 0.1,
            run: async () => {
              runCounts.set('verify', (runCounts.get('verify') ?? 0) + 1);
              return { evidence: [ev('command_result', 'ev:verify')], costUsd: 0.1 };
            },
          });
        } else {
          actions.push({
            id, dependsOn: [], expectedEvidence: [`ev:${id}`], estimatedCostUsd: 0.1,
            run: async () => {
              runCounts.set(id, (runCounts.get(id) ?? 0) + 1);
              return { evidence: [ev('command_result', `ev:${id}`)], costUsd: 0.1 };
            },
          });
        }
      }
      return actions;
    };

    const contractFields = {
      missionId: 'gh06-proof',
      objective: 'Provar checkpoint/resume end-to-end.',
      completionCriteria: ['ev:plan', 'ev:build', 'ev:verify'],
      maxCostUsd: 1.0,
      maxParallelActions: 3,
      maxNoProgressCycles: 3,
      allowedFiles: ['src/app.ts'],
    };
    const contractA = makeContract({ ...contractFields, maxCycles: 1 });
    const runtimeA = new MultiAgentRuntime({ advisor: new PlannedAdvisor(makeActions), maxParallelActions: 3 });
    const memoryA = new FileMissionMemoryStore(memPath);
    const harnessA = new GuardianHarness(contractA, runtimeA, {
      checkpointStore: new FileCheckpointStore(cpPath),
      memory: memoryA,
      now: () => BASE,
    });
    const resultA = await harnessA.run();
    assert.equal(resultA.status, 'BLOCKED'); // runtime A interrompido (maxCycles)
    assert.equal(resultA.state.cycle, 1);
    // recuperação GH-04A exercitada ANTES do checkpoint: transient -> RECOVER
    assert.equal(resultA.state.lastDecision?.decision, 'RECOVER');
    assert.equal(resultA.state.transientRetries, 1);
    assert.equal(resultA.state.lastError, 'svc:unavailable:service unavailable');

    // Runtime B: NOVO runtime, NENHUM transcript — só o checkpoint + memória
    const contractB = makeContract({ ...contractFields, maxCycles: 4 });
    const runtimeB = new MultiAgentRuntime({ advisor: new PlannedAdvisor(makeActions), maxParallelActions: 3 });
    const memoryB = new FileMissionMemoryStore(memPath); // recarrega do disco
    const harnessB = new GuardianHarness(contractB, runtimeB, {
      checkpointStore: new FileCheckpointStore(cpPath),
      memory: memoryB,
      now: () => BASE + 1,
    });
    await harnessB.begin();
    assert.equal(harnessB.resumedFromCheckpoint, true);
    // TRANSCRIPT_RECONSTRUCTION_REQUIRED=NO: checkpoint não carrega transcript algum
    const cpRaw = readFileSync(cpPath, 'utf8');
    assert.ok(!cpRaw.toLowerCase().includes('transcript'));
    assert.equal(runtimeB.executionReports.length, 0); // zero histórico prévio
    // RECOVERY_STATE_LOST=NO
    assert.equal(harnessB.getState().transientRetries, 1);
    assert.equal(harnessB.getState().lastTransientFailKey, 'svc:unavailable');
    // BUDGET_RESET=NO
    assert.equal(harnessB.getState().spentCostUsd, 0);

    const resultB = await harnessB.run();
    assert.equal(resultB.status, 'PASS'); // CompletionGuard concluiu
    assert.equal(resultB.state.recoveryAttempts, 1); // RECOVER do checkpoint continuou em B
    // COMPLETED_WORK_REPEATED=NO: cada step executou o mínimo necessário
    assert.equal(runCounts.get('plan'), 2); // 1 falha + 1 retry (nunca concluído 2×)
    assert.equal(runCounts.get('build'), 2);
    assert.equal(runCounts.get('verify'), 1);
    // EVIDENCE_LOST=NO
    for (const key of ['ev:plan', 'ev:build', 'ev:verify']) {
      assert.ok(resultB.state.evidence.some((e) => e.key === key && e.status === 'ok'));
    }
    // Supervisor avaliou (advisory) e o Guardian concluiu
    assert.ok(resultB.state.evidence.some((e) => e.key === 'supervisor:recommendation' && e.status === 'ok'));
    assert.equal(runtimeB.executeCycleCalls, 1);
    assert.equal(runtimeB.executionReports.length, 1);
    // custo cumulativo preservado (0 de A + 0.3 de B)
    assert.ok(near(0.3, resultB.state.spentCostUsd));
    // memória persistida: erro conhecido + experiência de sucesso da recuperação
    const knownErr = await memoryB.findError('svc:unavailable:service unavailable');
    assert.ok(knownErr);
    assert.equal(knownErr.classification, 'TRANSIENT');
    const experience = await memoryB.findExperience('svc:unavailable:service unavailable');
    assert.ok(experience);
    assert.equal(experience.outcome, 'success');
  });
});
