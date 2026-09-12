/**
 * GH-05 — MULTI-AGENT (ADVISOR + SUPERVISOR + WORKER + MAX SAFE PARALLELISM).
 * 17 provas determinísticas (T1–T17). Nenhum provider externo (sem OpenRouter,
 * sem GLM, sem Anthropic, sem missão paga). Ações fake com sleep REAL de
 * 150–200ms provam overlap temporal real via start/end timestamps.
 * Regressão T18 = as 49 provas GH-01..GH-04B continuam PASS na mesma suíte.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GuardianHarness, okEvidence } from '../src/harness/GuardianHarness.js';
import { createInitialState, Evidence, MissionContract } from '../src/harness/missionTypes.js';
import { MultiAgentRuntime } from '../src/harness/multiAgentRuntime.js';
import {
  AdvisorAgent,
  computeActionWaves,
  frozenStateView,
  validatePlan,
} from '../src/harness/advisor.js';
import { classifyWorkerStatus } from '../src/harness/worker.js';
import { SupervisorAgent } from '../src/harness/supervisor.js';
import {
  GlobalBudgetGuard,
  PlanAction,
  PlanProposal,
  SupervisorReport,
} from '../src/harness/multiAgentTypes.js';

// ===== helpers (mesmo estilo certificado das suítes GH-01..GH-04B) =====

const BASE_TIMESTAMP = 1_700_000_000_000;

function ev(type: Evidence['type'], key: string, status: 'ok' | 'fail' = 'ok', value?: string): Evidence {
  return { type, key, status, value, timestamp: BASE_TIMESTAMP, source: 'fake-worker' };
}

function makeContract(overrides: Partial<MissionContract> = {}): MissionContract {
  return {
    missionId: 'GH-05',
    objective: 'Executar plano multi-agente com paralelismo seguro.',
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

interface FakeActionOptions {
  delayMs?: number;
  okKey?: string;
  extraOkKeys?: string[];
  failKey?: string;
  failValue?: string;
  costUsd?: number;
  estimatedCostUsd?: number;
  dependsOn?: string[];
  resourceKeys?: string[];
  mode?: 'read' | 'write';
}

/** One bounded fake action: REAL sleep, then ok or fail evidence (never throws). */
function fakeAction(id: string, opts: FakeActionOptions = {}): PlanAction {
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
      if (opts.failKey) {
        return {
          evidence: [ev('tool_result', opts.failKey, 'fail', opts.failValue)],
          costUsd: opts.costUsd ?? 0,
        };
      }
      const keys = [opts.okKey ?? `done:${id}`, ...(opts.extraOkKeys ?? [])];
      return {
        evidence: keys.map((key) => ev('command_result', key, 'ok')),
        costUsd: opts.costUsd ?? 0,
      };
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

class ThrowingAdvisor implements AdvisorAgent {
  proposePlan(): PlanProposal {
    throw new Error('advisor_boom');
  }
}

/** T2 probe: a supervisor that lies COMPLETE — the Guardian must not care. */
class AlwaysCompleteSupervisor implements SupervisorAgent {
  review(): SupervisorReport {
    return { recommendation: 'COMPLETE', gaps: [], reasons: ['fake_complete'] };
  }
}

type Rec = { status: string; startMs?: number; endMs?: number };
function recordsOf(report: { records: (Rec & { actionId: string })[] }): Map<string, Rec> {
  return new Map(report.records.map((r) => [r.actionId, r]));
}

/** Timestamps extraídos com assertion (nunca casts soltos em comparações). */
function startOf(recs: Map<string, Rec>, id: string): number {
  const rec = recs.get(id);
  assert.ok(rec, `sem resultado para ${id}`);
  assert.ok(rec.startMs !== undefined, `${id} nunca iniciou`);
  return rec.startMs;
}
function endOf(recs: Map<string, Rec>, id: string): number {
  const rec = recs.get(id);
  assert.ok(rec, `sem resultado para ${id}`);
  assert.ok(rec.endMs !== undefined, `${id} nunca terminou`);
  return rec.endMs;
}

/** Real temporal overlap from worker timestamps (the ONLY accepted proof). */
function overlaps(
  a: { startMs?: number; endMs?: number },
  b: { startMs?: number; endMs?: number },
): boolean {
  return (a.startMs as number) < (b.endMs as number) && (b.startMs as number) < (a.endMs as number);
}

// ===== T1 — Advisor: propõe plano; plano inválido nunca executa =====

test('GH-05/T1a — Advisor: validação estrutural, waves topológicas e estado congelado', () => {
  const good = makePlan('p1', [
    fakeAction('A', { okKey: 'a_done' }),
    fakeAction('B', { okKey: 'b_done', dependsOn: ['A'] }),
  ]);
  assert.equal(validatePlan(good).valid, true);
  // ids duplicados / run ausente / custo negativo / dep desconhecida / self-dep
  assert.equal(validatePlan(makePlan('p', [
    fakeAction('A'), fakeAction('A'),
  ])).detail, 'action_id_duplicated:A');
  assert.equal(validatePlan(makePlan('p', [{ ...fakeAction('A'), run: undefined as unknown as PlanAction['run'] }])).detail, 'action_run_missing:A');
  assert.equal(validatePlan(makePlan('p', [fakeAction('A', { estimatedCostUsd: -1 })])).detail, 'action_cost_invalid:A');
  assert.equal(validatePlan(makePlan('p', [fakeAction('B', { dependsOn: ['A'] })])).detail, 'dependency_unknown:B:A');
  assert.equal(validatePlan(makePlan('p', [fakeAction('A', { dependsOn: ['A'] })])).detail, 'dependency_self:A');
  // ciclo A->B->A é rejeitado (Kahn)
  const cyclic = makePlan('p', [
    fakeAction('A', { dependsOn: ['B'] }),
    fakeAction('B', { dependsOn: ['A'] }),
  ]);
  assert.match(validatePlan(cyclic).detail as string, /^dependency_cycle:/);
  // waves topológicas: A,B,C=0; D=1; E=2
  const waves = computeActionWaves(makePlan('p', [
    fakeAction('A'), fakeAction('B'), fakeAction('C'),
    fakeAction('D', { dependsOn: ['A', 'B', 'C'] }),
    fakeAction('E', { dependsOn: ['D'] }),
  ]));
  assert.equal(waves.get('A'), 0);
  assert.equal(waves.get('D'), 1);
  assert.equal(waves.get('E'), 2);
  // estado congelado: Advisor NUNCA muta o estado soberano
  const state = createInitialState(makeContract(), BASE_TIMESTAMP);
  const view = frozenStateView(state);
  assert.throws(() => (view.completedSteps as string[]).push('hacked'), TypeError);
  assert.throws(() => { (view as { missionId: string }).missionId = 'hacked'; }, TypeError);
  assert.equal(state.completedSteps.length, 0);
  assert.equal(state.missionId, 'GH-05');
});

test('GH-05/T1b — plano inválido vira fail evidence e GH-04A decide BLOCK (nunca executa)', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('bad', [
      fakeAction('A'), fakeAction('A'), // id duplicado
    ])]),
  });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: ['a_done'], maxCycles: 8 }),
    runtime,
  );
  const result = await harness.run();
  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reason as string, /^transient_retries_exhausted/);
  assert.equal(runtime.lastExecutionReport, undefined); // nenhum plano executado
  assert.ok(runtime.lastCycle?.evidence.some((e) => e.key === 'multi_agent:plan_invalid'));
  // mesmo caminho para Advisor que lança
  const throwingRuntime = new MultiAgentRuntime({ advisor: new ThrowingAdvisor() });
  const throwingHarness = new GuardianHarness(makeContract({ maxCycles: 8 }), throwingRuntime);
  const throwingResult = await throwingHarness.run();
  assert.equal(throwingResult.status, 'BLOCKED');
  assert.equal(throwingRuntime.lastExecutionReport, undefined);
  assert.ok(throwingRuntime.lastCycle?.evidence.some((e) => e.key === 'multi_agent:advisor_error'));
});

// ===== T2 — Supervisor é ADVISORY: COMPLETE nunca produz PASS =====

test('GH-05/T2 — supervisor "COMPLETE" sem evidência de critério NUNCA produz PASS', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [fakeAction('A', { okKey: 'a_done', delayMs: 10 })])]),
    supervisor: new AlwaysCompleteSupervisor(),
  });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: ['goal_done'], maxCycles: 1 }),
    runtime,
  );
  const result = await harness.run();
  assert.equal(runtime.lastCycle?.claimsComplete, undefined); // runtime nunca seta
  assert.notEqual(result.status, 'PASS');
  assert.ok(result.state.evidence.some((e) => e.key === 'supervisor:recommendation' && e.status === 'ok'));
  const missing = result.state.remainingSteps;
  assert.ok(missing.includes('goal_done')); // CompletionGuard continua soberano
});

// ===== T3 — overlap temporal REAL (timestamps), 3 workers, cap 3 =====

test('GH-05/T3 — 3 workers com sleep real 200ms: MAX_OBSERVED_CONCURRENCY=3 e overlap provado', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [
      fakeAction('A', { okKey: 'x1', delayMs: 200 }),
      fakeAction('B', { okKey: 'x2', delayMs: 200 }),
      fakeAction('C', { okKey: 'x3', delayMs: 200 }),
    ])]),
    maxParallelActions: 3,
  });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: ['x1', 'x2', 'x3'], maxCycles: 2 }),
    runtime,
  );
  const t0 = Date.now();
  const result = await harness.run();
  const wallMs = Date.now() - t0;
  assert.equal(result.status, 'PASS');
  const report = runtime.lastExecutionReport!;
  assert.equal(report.maxObservedConcurrency, 3);
  assert.equal(report.waveCount, 1);
  // prova de overlap temporal real por timestamps (não apenas parallel=true)
  const recs = recordsOf(report);
  const pairOverlaps = [['A', 'B'], ['A', 'C'], ['B', 'C']].filter(
    ([a, b]) => overlaps(recs.get(a) as Rec, recs.get(b) as Rec),
  ).length;
  assert.ok(pairOverlaps >= 2, `esperado >=2 pares sobrepostos, obtido ${pairOverlaps}`);
  // sequencial seria >=600ms; em paralelo tem que fechar bem abaixo
  assert.ok(wallMs < 480, `wall=${wallMs}ms (sequencial seria ~600ms)`);
});

// ===== T4 — dependsOn: B só inicia depois de A terminar =====

test('GH-05/T4 — dependsOn: B.startMs >= A.endMs (nunca simultâneos)', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [
      fakeAction('A', { okKey: 'a_done', delayMs: 150 }),
      fakeAction('B', { okKey: 'b_done', delayMs: 150, dependsOn: ['A'] }),
    ])]),
  });
  const harness = new GuardianHarness(makeContract({ completionCriteria: ['b_done'], maxCycles: 2 }), runtime);
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  const report = runtime.lastExecutionReport!;
  const recs = recordsOf(report);
  assert.ok(endOf(recs, 'A') <= startOf(recs, 'B'));
  assert.equal(report.maxObservedConcurrency, 1);
});

// ===== T5 — maxParallelActions=2 com 6 ações: nunca 3 simultâneos =====

test('GH-05/T5 — cap=2 com 6 ações: MAX_OBSERVED_CONCURRENCY==2 (nunca 3)', async () => {
  const ids = ['A', 'B', 'C', 'D', 'E', 'F'];
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', ids.map((id) => fakeAction(id, { okKey: `${id}_done`, delayMs: 150 })))]),
    maxParallelActions: 2,
  });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: ['A_done', 'B_done', 'C_done', 'D_done', 'E_done', 'F_done'], maxCycles: 2 }),
    runtime,
  );
  const t0 = Date.now();
  const result = await harness.run();
  const wallMs = Date.now() - t0;
  assert.equal(result.status, 'PASS');
  const report = runtime.lastExecutionReport!;
  assert.equal(report.maxObservedConcurrency, 2);
  // 3 ondas de 150ms ~ 450ms; serial total seria ~900ms
  assert.ok(wallMs < 700, `wall=${wallMs}ms`);
  for (const id of ids) assert.equal(report.results.get(id)?.status, 'ok');
});

// ===== T6 — READ+READ no mesmo recurso: paraleliza =====

test('GH-05/T6 — READ+READ mesmo resourceKey: sobrepõe no tempo', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [
      fakeAction('A', { delayMs: 150, resourceKeys: ['file:x'], mode: 'read' }),
      fakeAction('B', { delayMs: 150, resourceKeys: ['file:x'], mode: 'read' }),
    ])]),
  });
  const harness = new GuardianHarness(makeContract({ completionCriteria: [], maxCycles: 2 }), runtime);
  await harness.run();
  const recs = recordsOf(runtime.lastExecutionReport!);
  assert.ok(overlaps(recs.get('A') as Rec, recs.get('B') as Rec));
  assert.equal(runtime.lastExecutionReport!.maxObservedConcurrency, 2);
});

// ===== T7 — WRITE+WRITE no mesmo recurso: JAMAIS sobrepõe =====

test('GH-05/T7 — WRITE+WRITE mesmo resourceKey: endFirst <= startSecond (serial)', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [
      fakeAction('A', { delayMs: 150, resourceKeys: ['file:x'], mode: 'write' }),
      fakeAction('B', { delayMs: 150, resourceKeys: ['file:x'], mode: 'write' }),
    ])]),
  });
  const harness = new GuardianHarness(makeContract({ completionCriteria: [], maxCycles: 2 }), runtime);
  await harness.run();
  const recs = recordsOf(runtime.lastExecutionReport!);
  assert.ok(endOf(recs, 'A') <= startOf(recs, 'B'));
  assert.equal(runtime.lastExecutionReport!.maxObservedConcurrency, 1);
});

// ===== T8 — READ+WRITE mesmo recurso: serializa =====

test('GH-05/T8 — READ+WRITE mesmo resourceKey: writer espera o reader (end <= start)', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [
      fakeAction('A', { delayMs: 150, resourceKeys: ['file:x'], mode: 'read' }),
      fakeAction('B', { delayMs: 150, resourceKeys: ['file:x'], mode: 'write' }),
    ])]),
  });
  const harness = new GuardianHarness(makeContract({ completionCriteria: [], maxCycles: 2 }), runtime);
  await harness.run();
  const recs = recordsOf(runtime.lastExecutionReport!);
  assert.ok(endOf(recs, 'A') <= startOf(recs, 'B'));
  assert.equal(runtime.lastExecutionReport!.maxObservedConcurrency, 1);
});

// ===== T9 — recursos DIFERENTES: paraleliza mesmo em modo write =====

test('GH-05/T9 — WRITE k1 + WRITE k2 (recursos distintos): sobrepõe no tempo', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [
      fakeAction('A', { delayMs: 150, resourceKeys: ['file:x'], mode: 'write' }),
      fakeAction('B', { delayMs: 150, resourceKeys: ['file:y'], mode: 'write' }),
    ])]),
  });
  const harness = new GuardianHarness(makeContract({ completionCriteria: [], maxCycles: 2 }), runtime);
  await harness.run();
  const recs = recordsOf(runtime.lastExecutionReport!);
  assert.ok(overlaps(recs.get('A') as Rec, recs.get('B') as Rec));
  assert.equal(runtime.lastExecutionReport!.maxObservedConcurrency, 2);
});

// ===== T10 — waves A,B,C -> D -> E =====

test('GH-05/T10 — waves A,B,C -> D -> E: D espera as 3, E espera D, waveCount=3', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [
      fakeAction('A', { okKey: 'a_done', delayMs: 150 }),
      fakeAction('B', { okKey: 'b_done', delayMs: 150 }),
      fakeAction('C', { okKey: 'c_done', delayMs: 150 }),
      fakeAction('D', { okKey: 'd_done', delayMs: 150, dependsOn: ['A', 'B', 'C'] }),
      fakeAction('E', { okKey: 'e_done', delayMs: 150, dependsOn: ['D'] }),
    ])]),
    maxParallelActions: 3,
  });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: ['a_done', 'b_done', 'c_done', 'd_done', 'e_done'], maxCycles: 2 }),
    runtime,
  );
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  const report = runtime.lastExecutionReport!;
  assert.equal(report.waveCount, 3);
  const recs = recordsOf(report);
  const dStart = startOf(recs, 'D');
  assert.ok(dStart >= endOf(recs, 'A'));
  assert.ok(dStart >= endOf(recs, 'B'));
  assert.ok(dStart >= endOf(recs, 'C'));
  assert.ok(startOf(recs, 'E') >= endOf(recs, 'D'));
  assert.equal(report.maxObservedConcurrency, 3);
});

// ===== T11 — Evidence agregada sem perda e sem duplicação =====

test('GH-05/T11 — evidências de 3 workers: todas as distintas presentes, duplicata não duplica', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [
      fakeAction('A', { okKey: 'a_done', extraOkKeys: ['shared:done'], delayMs: 20 }),
      fakeAction('B', { okKey: 'b_done', extraOkKeys: ['shared:done'], delayMs: 20 }),
      fakeAction('C', { okKey: 'c_done', extraOkKeys: ['shared:done'], delayMs: 20 }),
    ])]),
  });
  const harness = new GuardianHarness(makeContract({ completionCriteria: ['shared:done'], maxCycles: 2 }), runtime);
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  const report = runtime.lastExecutionReport!;
  assert.equal(report.evidence.length, 6); // 3 owns + 3 shared (antes do merge)
  const merged = result.state.evidence;
  for (const key of ['a_done', 'b_done', 'c_done']) {
    assert.ok(merged.some((e) => e.key === key && e.status === 'ok'));
  }
  assert.equal(merged.filter((e) => e.key === 'shared:done' && e.status === 'ok').length, 1);
});

// ===== T12 — falha TRANSIENT do Worker passa pelo recovery GH-04A =====

test('GH-05/T12 — worker transient (timeout) -> Guardian RECOVER -> re-ciclo -> PASS', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([
      makePlan('p1', [fakeAction('A', { failKey: 'svc:timeout', failValue: 'request timed out', delayMs: 10 })]),
      makePlan('p2', [fakeAction('B', { okKey: 'goal_done', delayMs: 10 })]),
    ]),
  });
  const harness = new GuardianHarness(makeContract({ completionCriteria: ['goal_done'], maxCycles: 4 }), runtime);
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.equal(result.state.recoveryAttempts, 1);
  assert.equal(runtime.executionReports[0].results.get('A')?.status, 'transient');
  assert.ok(result.state.evidence.some((e) => e.key === 'goal_done' && e.status === 'ok'));
});

// ===== T13 — HARD_BLOCKER: sem novos workers, pendentes cancelados =====

test('GH-05/T13 — marcador hard: novos workers nunca iniciam, pendentes sem startMs, Guardian BLOCK', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [
      fakeAction('A', { failKey: 'unauthorized_tool:x', failValue: 'credential missing', delayMs: 200 }),
      fakeAction('B', { okKey: 'b_done', delayMs: 200 }),
      fakeAction('C', { okKey: 'c_done', delayMs: 200 }),
      fakeAction('D', { okKey: 'd_done', delayMs: 10, dependsOn: ['A'] }),
      fakeAction('E', { okKey: 'e_done', delayMs: 10, dependsOn: ['A'] }),
    ])]),
    maxParallelActions: 3,
  });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: ['b_done', 'c_done'], maxCycles: 2 }),
    runtime,
  );
  const result = await harness.run();
  const report = runtime.lastExecutionReport!;
  assert.equal(report.aborted, true);
  const recs = recordsOf(report);
  assert.equal(report.results.get('A')?.status, 'hard');
  assert.equal(report.results.get('B')?.status, 'ok'); // in-flight termina seguro
  assert.equal(report.results.get('C')?.status, 'ok');
  for (const id of ['D', 'E']) {
    const rec = recs.get(id) as Rec;
    assert.ok(rec.status === 'dependency_failed' || rec.status === 'cancelled');
    assert.equal(rec.startMs, undefined); // NUNCA iniciou
  }
  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reason as string, /^hard_blocker:unauthorized_tool:x/);
});

// ===== T14 — budget global da missão (reserva; sem auto-expansão) =====

test('GH-05/T14a — cap 0.10, 3x0.04: o 3º worker não inicia (budget_blocked, sem startMs)', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [
      fakeAction('A', { okKey: 'a_done', delayMs: 20, estimatedCostUsd: 0.04, costUsd: 0.04 }),
      fakeAction('B', { okKey: 'b_done', delayMs: 20, estimatedCostUsd: 0.04, costUsd: 0.04 }),
      fakeAction('C', { okKey: 'c_done', delayMs: 20, estimatedCostUsd: 0.04, costUsd: 0.04 }),
    ])]),
  });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: ['a_done', 'b_done', 'c_done'], maxCycles: 1, maxCostUsd: 0.1 }),
    runtime,
  );
  const result = await harness.run();
  const report = runtime.lastExecutionReport!;
  const recs = recordsOf(report);
  assert.equal(report.results.get('A')?.status, 'ok');
  assert.equal(report.results.get('B')?.status, 'ok');
  assert.equal(recs.get('C')?.status, 'budget_blocked');
  assert.equal(recs.get('C')?.startMs, undefined); // nunca iniciou
  assert.equal(report.totalCostUsd, 0.08);
  assert.ok(report.totalCostUsd <= 0.1);
  assert.equal(result.state.spentCostUsd, 0.08);
  assert.notEqual(result.status, 'PASS'); // orçamento esgotado não compra PASS
});

test('GH-05/T14b — custo real acima do cap: Guardian BLOCKED max_cost_exceeded (nunca PASS)', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [
      fakeAction('A', { okKey: 'a_done', delayMs: 10, estimatedCostUsd: 0.04, costUsd: 0.06 }),
    ])]),
  });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: ['a_done'], maxCycles: 2, maxCostUsd: 0.05 }),
    runtime,
  );
  const result = await harness.run();
  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reason as string, /max_cost_exceeded/);
  assert.equal(runtime.lastExecutionReport!.totalCostUsd, 0.06);
});

// ===== T15 — no-progress considera o progresso AGREGADO da wave =====

test('GH-05/T15a — wave mista (ok+fail): progresso agregado da wave conta (noProgress=0)', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [
      fakeAction('A', { failKey: 'svc:timeout', failValue: 'timed out', delayMs: 10 }),
      fakeAction('B', { okKey: 'goal_done', delayMs: 10 }),
    ])]),
  });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: ['goal_done'], maxCycles: 2 }),
    runtime,
  );
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.equal(result.state.noProgressCount, 0);
});

test('GH-05/T15b — wave só com falhas: sem progresso agregado (noProgress incrementa, nunca PASS)', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [
      fakeAction('A', { failKey: 'svc:timeout', failValue: 'timed out', delayMs: 10 }),
    ])]),
  });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: ['goal_done'], maxCycles: 3, maxNoProgressCycles: 5 }),
    runtime,
  );
  const result = await harness.run();
  assert.notEqual(result.status, 'PASS');
  assert.ok(result.state.noProgressCount >= 1);
  assert.equal(result.state.evidence.filter((e) => e.status === 'ok').length, 0);
});

// ===== T16 — proteção de conflito: 2 reads sobrepõem, write espera ambos =====

test('GH-05/T16 — R,W,R mesmo recurso: reads sobrepõem; write espera os dois readers', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [
      fakeAction('A', { delayMs: 150, resourceKeys: ['file:x'], mode: 'read' }),
      fakeAction('B', { delayMs: 150, resourceKeys: ['file:x'], mode: 'write' }),
      fakeAction('C', { delayMs: 150, resourceKeys: ['file:x'], mode: 'read' }),
    ])]),
    maxParallelActions: 3,
  });
  const harness = new GuardianHarness(makeContract({ completionCriteria: [], maxCycles: 2 }), runtime);
  await harness.run();
  const recs = recordsOf(runtime.lastExecutionReport!);
  assert.ok(overlaps(recs.get('A') as Rec, recs.get('C') as Rec)); // READ+READ paralelo
  const bStart = startOf(recs, 'B');
  assert.ok(bStart >= endOf(recs, 'A'));
  assert.ok(bStart >= endOf(recs, 'C'));
  assert.equal(runtime.lastExecutionReport!.maxObservedConcurrency, 2); // nunca 3 (write exclui)
});

// ===== T17 — completão legítima: Supervisor COMPLETE + Guardian PASS =====

test('GH-05/T17 — plano válido, workers ok, critérios satisfeitos -> PASS end-to-end', async () => {
  const runtime = new MultiAgentRuntime({
    advisor: new FakeAdvisor([makePlan('p', [
      fakeAction('A', { okKey: 'e1', delayMs: 20 }),
      fakeAction('B', { okKey: 'e2', delayMs: 20 }),
      fakeAction('C', { okKey: 'e3', delayMs: 20 }),
    ])]),
    maxParallelActions: 3,
  });
  const harness = new GuardianHarness(
    makeContract({ completionCriteria: ['e1', 'e2', 'e3'], maxCycles: 2 }),
    runtime,
  );
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.equal(result.state.recoveryAttempts, 0);
  assert.ok(result.state.evidence.some((e) => e.key === 'supervisor:recommendation' && e.status === 'ok'));
  const report = runtime.lastExecutionReport!;
  assert.equal(report.results.size, 3);
  for (const id of ['A', 'B', 'C']) assert.equal(report.results.get(id)?.status, 'ok');
  assert.ok(report.totalCostUsd === 0);
});

// ===== unidades de apoio (marcadores e budget) =====

test('GH-05/T0 — classifyWorkerStatus usa os marcadores certificados GH-04A', () => {
  assert.equal(classifyWorkerStatus([ev('command_result', 'done:x')]), 'ok');
  assert.equal(classifyWorkerStatus([ev('tool_result', 'unauthorized_tool:x', 'fail')]), 'hard');
  assert.equal(classifyWorkerStatus([ev('tool_result', 'svc:timeout', 'fail', 'timed out')]), 'transient');
  assert.equal(classifyWorkerStatus([ev('tool_result', 'unexpected:x', 'fail')]), 'fail');
  // HARD domina TRANSIENT
  assert.equal(
    classifyWorkerStatus([
      ev('tool_result', 'svc:timeout', 'fail', 'timed out'),
      ev('tool_result', 'unauthorized_tool:x', 'fail'),
    ]),
    'hard',
  );
});

test('GH-05/T0 — GlobalBudgetGuard: reserva nunca ultrapassa o cap; cap nunca expande', () => {
  const guard = new GlobalBudgetGuard({ capUsd: 0.1, initialSpentUsd: 0.04 });
  assert.equal(guard.tryReserve(0.04), true);
  assert.equal(guard.tryReserve(0.04), false); // 0.08 reservado + 0.04 > 0.1
  guard.settle(0.04, 0.03); // reserva liberada, custo real comprometido
  assert.equal(guard.committedUsd(), 0.07);
  assert.equal(guard.tryReserve(0.03), true);
  assert.equal(guard.capUsd(), 0.1);
  const unlimited = new GlobalBudgetGuard();
  assert.equal(unlimited.tryReserve(Number.MAX_VALUE), true);
  assert.equal(unlimited.capUsd(), undefined);
});

// ===== helpers ainda não usados explicitamente ficam referenciados abaixo =====
void okEvidence;
