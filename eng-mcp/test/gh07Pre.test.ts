/**
 * PRÉ-GH-07 — compact adjustment proofs. No external provider (no OpenRouter,
 * no GLM, no Anthropic, no paid mission). Real sleeps 100-400ms prove temporal
 * overlap via start/end timestamps and event ordering:
 * - P1  PARALLEL_WORKERS_TESTED=10, MAX_OBSERVED_CONCURRENCY=10, overlap.
 * - P2  DYNAMIC_SLOT_REFILL (event ordering; no full-wave wait).
 * - P3  refill never violates DAG dependencies.
 * - P4  refill never violates resource locks.
 * - P5  refill never bypasses the GLOBAL budget.
 * - P6  default=10 + configurable (contract wins) + scheduler flags.
 * - P7  role models: Guardian-config authority, real ids, no costly fallback.
 * - P8  role context budget: advisor strategic view, worker minimum
 *       sufficient context, supervisor review input (never a transcript).
 * - P9  wide waves guidance + topological waves stay wide.
 * Regressão: as 113 provas GH-01..GH-06A continuam PASS na mesma suíte.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GuardianHarness } from '../src/harness/GuardianHarness.js';
import { createInitialState, MissionContract } from '../src/harness/missionTypes.js';
import { MultiAgentRuntime } from '../src/harness/multiAgentRuntime.js';
import { AdvisorAgent, computeActionWaves, frozenStateView, WIDE_WAVE_GUIDANCE } from '../src/harness/advisor.js';
import { WorkerAgent } from '../src/harness/worker.js';
import { SupervisorAgent } from '../src/harness/supervisor.js';
import {
  ActionExecutionContext,
  PlanAction,
  PlanProposal,
  SupervisorReport,
  SupervisorReviewInput,
} from '../src/harness/multiAgentTypes.js';
import {
  DEFAULT_MAX_PARALLEL_ACTIONS,
  DYNAMIC_SLOT_REFILL,
  WAIT_FOR_FULL_WAVE_COMPLETION,
  WORK_CONSERVING_SCHEDULER,
} from '../src/harness/parallelWaveExecutor.js';
import {
  ClaudeAgentRuntime,
  type ClaudeQueryOptions,
  type QueryFn,
} from '../src/harness/ClaudeAgentRuntime.js';
import { DEFAULT_ROLE_MODELS, resolveRoleModels } from '../src/harness/roleModels.js';

// ===== helpers (mesmo estilo certificado das suítes GH-01..GH-06A) =====

const BASE_TIMESTAMP = 1_700_000_000_000;

function makeContract(overrides: Partial<MissionContract> = {}): MissionContract {
  return {
    missionId: 'GH-07-PRE',
    objective: 'Ajuste pré-GH-07: waves largas, refill dinâmico, modelos e contexto por role.',
    completionCriteria: ['done'],
    maxCycles: 4,
    maxDurationMs: 60_000,
    maxNoProgressCycles: 2,
    ...overrides,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeAction(id: string, opts: { delayMs?: number; okKey?: string; estimatedCostUsd?: number; costUsd?: number; dependsOn?: string[]; resourceKeys?: string[]; mode?: 'read' | 'write' } = {}): PlanAction {
  return {
    id,
    description: `fake action ${id}`,
    dependsOn: opts.dependsOn ?? [],
    resourceKeys: opts.resourceKeys,
    mode: opts.mode,
    estimatedCostUsd: opts.estimatedCostUsd,
    expectedEvidence: opts.okKey ? [opts.okKey] : undefined,
    run: async () => {
      await sleep(opts.delayMs ?? 0);
      return { evidence: [{ type: 'command_result', key: opts.okKey ?? `done:${id}`, status: 'ok', timestamp: BASE_TIMESTAMP, source: 'fake-worker' }], costUsd: opts.costUsd ?? 0 };
    },
  };
}

function makePlan(planId: string, actions: PlanAction[]): PlanProposal {
  return { planId, advisorId: 'fake-advisor', actions };
}

class FakeAdvisor implements AdvisorAgent {
  calls = 0;
  constructor(private readonly plans: PlanProposal[]) {}
  proposePlan(): PlanProposal {
    const plan = this.plans[Math.min(this.calls, this.plans.length - 1)];
    this.calls += 1;
    return plan;
  }
}

type Rec = { status: string; startMs?: number; endMs?: number };
function recordsOf(report: { records: (Rec & { actionId: string })[] }): Map<string, Rec> {
  return new Map(report.records.map((r) => [r.actionId, r]));
}
function startOf(recs: Map<string, Rec>, id: string): number {
  const rec = recs.get(id);
  assert.ok(rec && rec.startMs !== undefined, `${id} nunca iniciou`);
  return rec.startMs;
}
function endOf(recs: Map<string, Rec>, id: string): number {
  const rec = recs.get(id);
  assert.ok(rec && rec.endMs !== undefined, `${id} nunca terminou`);
  return rec.endMs;
}

// ===== P1 — 10 workers REAIS simultâneos (default=10), overlap comum provado =====

test('GH-07/P1 — 10 ações independentes 200ms: MAX_OBSERVED_CONCURRENCY=10, overlap comum, waveCount=1', async () => {
  const ids = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10'];
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p10', ids.map((id) => fakeAction(id, { okKey: `${id}_done`, delayMs: 200 })))]),
    // sem maxParallelActions: o DEFAULT (10) governa
  });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: ids.map((id) => `${id}_done`), maxCycles: 2 }),
    runtime,
  );
  const t0 = Date.now();
  const result = await harness.run();
  const wallMs = Date.now() - t0;
  assert.equal(result.status, 'PASS');
  const report = runtime.lastExecutionReport!;
  assert.equal(report.maxObservedConcurrency, 10); // PARALLEL_WORKERS_TESTED=10
  assert.equal(report.waveCount, 1); // WIDE_WAVES: 10 READY numa única wave
  assert.ok(wallMs < 1500, `wall=${wallMs}ms — serial (~2000ms) excluído`);
  const recs = recordsOf(report);
  // interseção temporal COMUM às 10 janelas [start,end]: overlap provado
  const commonStart = Math.max(...ids.map((id) => startOf(recs, id)));
  const commonEnd = Math.min(...ids.map((id) => endOf(recs, id)));
  assert.ok(commonStart < commonEnd, `sem overlap comum: max(start)=${commonStart} >= min(end)=${commonEnd}`);
  for (const id of ids) assert.equal(report.results.get(id)?.status, 'ok');
});

// ===== P2 — DYNAMIC SLOT REFILL: X1 começa após UM settlement, não após a wave =====

test('GH-07/P2 — 15 ações cap 10: X1 inicia após 1 settlement com 9 iniciais ainda em voo (sem esperar a wave)', async () => {
  const initial = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I10'];
  const extras = ['X1', 'X2', 'X3', 'X4', 'X5'];
  const actions: PlanAction[] = initial.map((id) =>
    fakeAction(id, { okKey: `${id}_done`, delayMs: id === 'I5' ? 100 : 400 }),
  );
  for (const id of extras) actions.push(fakeAction(id, { okKey: `${id}_done`, delayMs: 20 }));
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p15', actions)]),
  });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: [...initial, ...extras].map((id) => `${id}_done`), maxCycles: 2 }),
    runtime,
  );
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  const report = runtime.lastExecutionReport!;
  assert.equal(report.maxObservedConcurrency, 10);
  const recs = recordsOf(report);
  // I5 terminou primeiro (~100ms); as outras 9 iniciais ainda em voo (~400ms)
  const i5End = endOf(recs, 'I5');
  const othersEnd = Math.min(...initial.filter((id) => id !== 'I5').map((id) => endOf(recs, id)));
  // event ordering: start(X1) >= end(I5) e start(X1) < end(min das outras 9)
  const x1Start = startOf(recs, 'X1');
  assert.ok(x1Start >= i5End, `X1 iniciou (${x1Start}) antes de um slot liberar (end(I5)=${i5End})`);
  assert.ok(x1Start < othersEnd, `X1 esperou a wave inteira: start=${x1Start} >= min(end iniciais)=${othersEnd}`);
  // refill em cascata: cada extra seguinte começa quando o anterior libera slot
  for (let i = 1; i < extras.length; i += 1) {
    const prevEnd = endOf(recs, extras[i - 1]);
    const start = startOf(recs, extras[i]);
    assert.ok(start >= prevEnd, `${extras[i]} iniciou (${start}) antes de ${extras[i - 1]} liberar slot (${prevEnd})`);
    assert.ok(start < othersEnd, `${extras[i]} esperou a wave inteira (start=${start} >= ${othersEnd})`);
  }
  for (const id of [...initial, ...extras]) assert.equal(report.results.get(id)?.status, 'ok');
});

// ===== P3 — refill NUNCA viola dependsOn (DAG intacto) =====

test('GH-07/P3 — refill: B1/B2 dependem de I1 e só iniciam após end(I1), mesmo com slot livre no meio', async () => {
  const initial = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I10'];
  const actions: PlanAction[] = initial.map((id) =>
    fakeAction(id, { okKey: `${id}_done`, delayMs: id === 'I5' ? 100 : 400 }),
  );
  // B1/B2 dependem de I1 (400ms): no settle de I5 (~100ms) existe 1 slot livre
  // mas ZERO ação elegível — o refill NÃO pode pular a fila da dependência.
  actions.push(fakeAction('B1', { okKey: 'b1_done', delayMs: 20, dependsOn: ['I1'] }));
  actions.push(fakeAction('B2', { okKey: 'b2_done', delayMs: 20, dependsOn: ['I1'] }));
  const runtime = new MultiAgentRuntime({ advisor: new FakeAdvisor([makePlan('p-deps', actions)]) });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: [...initial.map((id) => `${id}_done`), 'b1_done', 'b2_done'], maxCycles: 2 }),
    runtime,
  );
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  const report = runtime.lastExecutionReport!;
  assert.equal(report.maxObservedConcurrency, 10);
  const recs = recordsOf(report);
  const i1End = endOf(recs, 'I1');
  assert.ok(startOf(recs, 'B1') >= i1End, 'B1 iniciou antes da dependência I1 terminar');
  assert.ok(startOf(recs, 'B2') >= i1End, 'B2 iniciou antes da dependência I1 terminar');
  for (const rec of report.records) assert.notEqual(rec.status, 'budget_blocked');
});

// ===== P4 — refill NUNCA entra em conflito de recursos em voo =====

test('GH-07/P4 — refill: R1 (write file:x) espera o reader I2 em voo; inicia só após end(I2)', async () => {
  const initial = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I10'];
  const actions: PlanAction[] = initial.map((id) => {
    const base = fakeAction(id, { okKey: `${id}_done`, delayMs: id === 'I5' ? 100 : 400 });
    return id === 'I2' ? { ...base, resourceKeys: ['file:x'], mode: 'read' as const } : base;
  });
  // R1 é a 11ª ação: quando I5 libera slot (~100ms), I2 (read file:x) ainda em
  // voo — o refill NÃO pode iniciar R1 (write no mesmo recurso).
  actions.push(fakeAction('R1', { okKey: 'r1_done', delayMs: 20, resourceKeys: ['file:x'], mode: 'write' }));
  const runtime = new MultiAgentRuntime({ advisor: new FakeAdvisor([makePlan('p-locks', actions)]) });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: [...initial.map((id) => `${id}_done`), 'r1_done'], maxCycles: 2 }),
    runtime,
  );
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  const report = runtime.lastExecutionReport!;
  assert.equal(report.maxObservedConcurrency, 10);
  const recs = recordsOf(report);
  const i2End = endOf(recs, 'I2');
  const r1Start = startOf(recs, 'R1');
  assert.ok(r1Start >= i2End, `R1 (write) sobrepôs o reader em voo: start=${r1Start} < end(I2)=${i2End}`);
  // e as 10 iniciais seguiram simultâneas (refill não quebrou a wave larga)
  const commonStart = Math.max(...initial.map((id) => startOf(recs, id)));
  const commonEnd = Math.min(...initial.map((id) => endOf(recs, id)));
  assert.ok(commonStart < commonEnd, 'as 10 iniciais não foram simultâneas');
});

// ===== P5 — refill NUNCA contorna o budget GLOBAL =====

test('GH-07/P5 — cap 0.10, 15 ações x 0.01: só 10 reservam; extras budget_blocked sem start', async () => {
  const ids = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12', 'C13', 'C14', 'C15'];
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p-budget', ids.map((id) => fakeAction(id, { okKey: `${id}_done`, delayMs: 30, estimatedCostUsd: 0.01, costUsd: 0.01 })))]),
  });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: ['C1_done'], maxCycles: 2, maxCostUsd: 0.1 }),
    runtime,
  );
  const result = await harness.run();
  const report = runtime.lastExecutionReport!;
  const recs = recordsOf(report);
  const started = ids.filter((id) => report.results.get(id)?.status === 'ok');
  assert.equal(started.length, 10); // budget é o limite efetivo, não 15
  for (const id of ids.filter((id) => !started.includes(id))) {
    assert.equal(recs.get(id)?.status, 'budget_blocked');
    assert.equal(recs.get(id)?.startMs, undefined); // NUNCA iniciou
  }
  assert.ok(report.totalCostUsd <= 0.1 + 1e-9);
  assert.ok((result.state.spentCostUsd ?? 0) <= 0.1 + 1e-9);
  assert.equal(report.maxObservedConcurrency, 10);
});

// ===== P6 — default=10, configurável, contract vence =====

test('GH-07/P6 — DEFAULT_MAX_PARALLEL_ACTIONS=10; contract.maxParallelActions vence a config', async () => {
  assert.equal(DEFAULT_MAX_PARALLEL_ACTIONS, 10);
  assert.equal(DYNAMIC_SLOT_REFILL, true);
  assert.equal(WORK_CONSERVING_SCHEDULER, true);
  assert.equal(WAIT_FOR_FULL_WAVE_COMPLETION, false);
  // contract wins: contract=1, config=5 -> nunca 2 simultâneos
  const ids = ['K1', 'K2', 'K3', 'K4'];
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p-cap1', ids.map((id) => fakeAction(id, { okKey: `${id}_done`, delayMs: 60 })))]),
    maxParallelActions: 5,
  });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: ids.map((id) => `${id}_done`), maxCycles: 2, maxParallelActions: 1 }),
    runtime,
  );
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.equal(runtime.lastExecutionReport!.maxObservedConcurrency, 1);
});

// ===== P7 — modelos por role: config Guardian é a autoridade =====

test('GH-07/P7a — resolveRoleModels: defaults reais, override por role, blank nunca troca (sem fallback caro)', () => {
  const defaults = resolveRoleModels({});
  assert.deepEqual(defaults, {
    advisor: 'z-ai/glm-5.3-flash',
    supervisor: 'z-ai/glm-5.3-flash',
    worker: 'nvidia/nemotron-3-super-120b-a12b',
  });
  assert.deepEqual(DEFAULT_ROLE_MODELS, defaults);
  // override por role a partir do ambiente do operador
  const overridden = resolveRoleModels({
    GUARDIAN_ADVISOR_MODEL: 'z-ai/glm-5.3-flash',
    GUARDIAN_SUPERVISOR_MODEL: 'z-ai/glm-5.3',
    GUARDIAN_WORKER_MODEL: 'nvidia/nemotron-3-nano-30b-a3b',
  });
  assert.equal(overridden.advisor, 'z-ai/glm-5.3-flash');
  assert.equal(overridden.supervisor, 'z-ai/glm-5.3');
  assert.equal(overridden.worker, 'nvidia/nemotron-3-nano-30b-a3b');
  // blank/whitespace NUNCA troca modelo e NUNCA pede emprestado outro role
  const blank = resolveRoleModels({ GUARDIAN_ADVISOR_MODEL: '   ', GUARDIAN_WORKER_MODEL: '' });
  assert.equal(blank.advisor, 'z-ai/glm-5.3-flash');
  assert.equal(blank.worker, 'nvidia/nemotron-3-super-120b-a12b');
  assert.equal(blank.supervisor, 'z-ai/glm-5.3-flash');
  // override parcial: só o role declarado muda
  const partial = resolveRoleModels({ GUARDIAN_WORKER_MODEL: 'nvidia/nemotron-3-nano-30b-a3b' });
  assert.equal(partial.worker, 'nvidia/nemotron-3-nano-30b-a3b');
  assert.equal(partial.advisor, 'z-ai/glm-5.3-flash');
  assert.equal(partial.supervisor, 'z-ai/glm-5.3-flash');
});

test('GH-07/P7b — ClaudeAgentRuntime: model por role flui da config ao SDK (one-way), sem config = comportamento certificado', async () => {
  type SdkMessageFixture = Record<string, unknown>;
  const resultMessage = (sessionId: string): SdkMessageFixture => ({
    type: 'result', subtype: 'success', session_id: sessionId, is_error: false, total_cost_usd: 0,
  });
  const calls: { prompt: string; options?: ClaudeQueryOptions }[] = [];
  const makeQuery = (): QueryFn => (params) => {
    calls.push({ prompt: params.prompt, options: params.options });
    const iterator = (async function* generate(): AsyncGenerator<SdkMessageFixture, void, unknown> {
      yield resultMessage('s-p7');
    })();
    return Object.assign(iterator, { interrupt: async () => undefined });
  };
  const contract = makeContract({ allowedActions: ['channel:eng-mcp'], completionCriteria: ['claude-agent-sdk:result:success'] });
  const state = createInitialState(contract, BASE_TIMESTAMP);
  const roleModels = {
    advisor: 'z-ai/glm-5.3-flash',
    supervisor: 'z-ai/glm-5.3',
    worker: 'nvidia/nemotron-3-super-120b-a12b',
  };
  const roles = [
    ['advisor', 'z-ai/glm-5.3-flash'],
    ['supervisor', 'z-ai/glm-5.3'],
    ['worker', 'nvidia/nemotron-3-super-120b-a12b'],
  ] as const;
  for (const [role, expected] of roles) {
    calls.length = 0;
    const runtime = new ClaudeAgentRuntime({ queryFactory: makeQuery(), env: {}, roleModels, runtimeRole: role });
    await runtime.runMission(contract, state);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options?.model, expected, `role ${role} deveria usar o modelo configurado`);
  }
  // sem config de role: NENHUM model é setado (env do SDK governa, como certificado)
  calls.length = 0;
  const plain = new ClaudeAgentRuntime({ queryFactory: makeQuery(), env: {} });
  await plain.runMission(contract, state);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options?.model, undefined);
});

// ===== P8 — context budget por role =====

test('GH-07/P8a — Advisor recebe visão estratégica (constraints verbatim) e NUNCA o transcript', async () => {
  let seenObjective: string | undefined;
  let seenView: ReturnType<typeof frozenStateView> | undefined;
  const advisor: AdvisorAgent = {
    proposePlan(objective, state) {
      seenObjective = objective;
      seenView = state;
      return makePlan('p-ctx', [fakeAction('A', { okKey: 'a_done', delayMs: 10 })]);
    },
  };
  const contract = makeContract({
    completionCriteria: ['a_done'],
    allowedFiles: ['src/a.ts'],
    allowedActions: ['tool:read', 'tool:write'],
    forbiddenActions: ['shell:rm'],
    maxCostUsd: 0.5,
  });
  const runtime = new MultiAgentRuntime({ advisor });
  const harness = new GuardianHarness(contract, runtime);
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.equal(seenObjective, contract.objective);
  assert.ok(seenView);
  const view = seenView;
  assert.deepEqual(view.completionCriteria, ['a_done']);
  assert.deepEqual(view.allowedFiles, ['src/a.ts']);
  assert.deepEqual(view.allowedActions, ['tool:read', 'tool:write']);
  assert.deepEqual(view.forbiddenActions, ['shell:rm']);
  assert.equal(view.maxCostUsd, 0.5);
  // visão mínima: resumo de estado congelado, nunca transcript/evidence
  assert.ok(Object.isFrozen(view.completedSteps));
  assert.deepEqual(view.completedSteps, []);
  assert.deepEqual(view.remainingSteps, ['a_done']);
  assert.equal(view.missionId, 'GH-07-PRE');
  assert.equal(view.cycle, 0);
  assert.equal('evidence' in view, false);
  assert.equal('transcript' in view, false);
  assert.equal('messages' in view, false);
});

test('GH-07/P8b — Worker recebe SOMENTE o contexto mínimo da própria ação (nunca transcript)', async () => {
  let captured: ActionExecutionContext | undefined;
  const action: PlanAction = {
    id: 'A',
    description: 'ler arquivo autorizado',
    dependsOn: [],
    resourceKeys: ['file:a.ts'],
    mode: 'write',
    expectedEvidence: ['a_done'],
    run: async (ctx) => {
      captured = ctx;
      await sleep(10);
      return { evidence: [{ type: 'command_result', key: 'a_done', status: 'ok', timestamp: BASE_TIMESTAMP, source: 'fake-worker' }] };
    },
  };
  const runtime = new MultiAgentRuntime({ advisor: new FakeAdvisor([makePlan('p-ctx', [action])]) });
  const harness = new GuardianHarness(
    makeContract({
      completionCriteria: ['a_done'],
      allowedActions: ['tool:read'],
      forbiddenActions: ['shell:rm'],
    }),
    runtime,
  );
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.ok(captured);
  assert.equal(captured.actionId, 'A');
  assert.equal(captured.actionDescription, 'ler arquivo autorizado');
  assert.deepEqual(captured.dependsOn, []);
  assert.deepEqual(captured.resourceKeys, ['file:a.ts']);
  assert.equal(captured.mode, 'write');
  assert.deepEqual(captured.expectedEvidence, ['a_done']);
  assert.deepEqual(captured.allowedActions, ['tool:read']);
  assert.deepEqual(captured.forbiddenActions, ['shell:rm']);
  // FULL_TRANSCRIPT_TO_EVERY_WORKER=NO: nada de state/evidence/outros results
  assert.equal('evidence' in captured, false);
  assert.equal('state' in captured, false);
  assert.equal('messages' in captured, false);
  assert.equal('transcript' in captured, false);
  // e via WorkerAgent direto (sem missionContext) o contexto fica mínimo
  const direct = await new WorkerAgent().perform(action);
  assert.equal(direct.status, 'ok');
});

test('GH-07/P8c — Supervisor recebe objective + plano + results + remainingCriteria (mínimo suficiente)', async () => {
  let seenInput: SupervisorReviewInput | undefined;
  const captureSupervisor: SupervisorAgent = {
    review(input: SupervisorReviewInput): SupervisorReport {
      seenInput = input;
      return { recommendation: 'COMPLETE', gaps: [], reasons: ['captured'] };
    },
  };
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p-sup', [
      fakeAction('A', { okKey: 'a_done', delayMs: 10 }),
      fakeAction('B', { okKey: 'b_done', delayMs: 10, dependsOn: ['A'] }),
    ])]),
    supervisor: captureSupervisor,
  });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: ['a_done'], maxCycles: 2 }),
    runtime,
  );
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.ok(seenInput);
  assert.equal(seenInput.objective, 'Ajuste pré-GH-07: waves largas, refill dinâmico, modelos e contexto por role.');
  // review ocorre ANTES do Guardian consumir os critérios: restante = ['a_done']
  assert.deepEqual([...(seenInput.remainingCriteria ?? [])], ['a_done']);
  assert.equal(seenInput.plan.actions.length, 2);
  assert.equal(seenInput.results.get('A')?.status, 'ok');
  assert.equal(seenInput.results.get('B')?.status, 'ok');
  // transcript jamais presente no input do supervisor
  assert.equal('transcript' in seenInput, false);
  assert.equal('messages' in seenInput, false);
});

// ===== P9 — waves largas: 10 independentes = UMA wave topológica =====

test('GH-07/P9 — waves largas: 10 ações independentes ficam todas na wave 0; guidance anti-dependência artificial', () => {
  const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];
  const waves = computeActionWaves(makePlan('p-wide', ids.map((id) => fakeAction(id))));
  for (const id of ids) assert.equal(waves.get(id), 0);
  const withDep = makePlan('p-dep', [
    ...ids.map((id) => fakeAction(id)),
    fakeAction('Z', { dependsOn: ['A'] }),
  ]);
  const wavesDep = computeActionWaves(withDep);
  assert.equal(wavesDep.get('Z'), 1);
  assert.equal(typeof WIDE_WAVE_GUIDANCE, 'string');
  assert.ok(WIDE_WAVE_GUIDANCE.length > 100);
  const guidance = WIDE_WAVE_GUIDANCE.toLowerCase();
  assert.ok(guidance.includes('never artificial staging'));
  assert.ok(guidance.includes('widest wave'));
});
