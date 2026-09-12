/**
 * GUARDIAN-UCME-INTEGRATION-01 — UCME adapter proofs (deterministic, no LLM,
 * no live backend). The fake transport replicates the REAL agentMemoryBridge
 * protocol observed live on 2026-09-12: messages formatted as "[AGENT MEMORY]"
 * with a Summary line, projectId-namespaced storage, search by text match
 * returning { results: [{type:'message', text, createdAt}] }.
 * FASES 6/7/8/10/11/13/14 (advisory isolation, fail-open, telemetry).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GuardianHarness } from '../src/harness/GuardianHarness.js';
import { MultiAgentRuntime } from '../src/harness/multiAgentRuntime.js';
import { AdvisorAgent, MissionStateView } from '../src/harness/advisor.js';
import {
  consultMissionMemory,
  createCheckpoint,
  errorSignatureOf,
  ErrorRecord,
  MemoryCheckpointStore,
} from '../src/harness/missionMemory.js';
import { createInitialState, Evidence, MissionContract } from '../src/harness/missionTypes.js';
import { PlanAction, PlanProposal } from '../src/harness/multiAgentTypes.js';
import {
  UcmeAgentMemoryOperation,
  UcmeAgentMemoryPayload,
  UcmeGuardianMemoryStore,
  UcmeMemoryTelemetryCounter,
  UcmeTransport,
} from '../src/harness/ucmeMissionMemory.js';

const BASE = 1_700_000_000_000;

function ev(type: Evidence['type'], key: string, status: 'ok' | 'fail' = 'ok', value?: string): Evidence {
  const evidence: Evidence = { type, key, status, timestamp: BASE, source: 'fake-worker' };
  if (value !== undefined) evidence.value = value; // key omitida: roundtrip JSON fiel
  return evidence;
}

function makeContract(overrides: Partial<MissionContract> = {}): MissionContract {
  return {
    missionId: 'UCME-01',
    objective: 'Integração Guardian↔UCME sem tocar governança.',
    completionCriteria: ['ev:goal'],
    maxCycles: 4,
    maxDurationMs: 60_000,
    maxNoProgressCycles: 3,
    maxCostUsd: 1.0,
    ...overrides,
  };
}

interface FakeActionOptions {
  okKey?: string;
  failKey?: string;
  failValue?: string;
}

function fakeAction(id: string, opts: FakeActionOptions = {}): PlanAction {
  return {
    id,
    description: `fake action ${id}`,
    dependsOn: [],
    expectedEvidence: opts.okKey ? [opts.okKey] : undefined,
    run: async () => {
      if (opts.failKey) {
        return { evidence: [ev('tool_result', opts.failKey, 'fail', opts.failValue)], costUsd: 0 };
      }
      return { evidence: [ev('command_result', opts.okKey ?? `done:${id}`)], costUsd: 0 };
    },
  };
}

class PlannedAdvisor implements AdvisorAgent {
  calls = 0;
  constructor(private readonly build: (view: MissionStateView) => PlanAction[]) {}
  proposePlan(_objective: string, view: MissionStateView): PlanProposal {
    this.calls += 1;
    return { planId: `p${this.calls}`, advisorId: 'planned', actions: this.build(view) };
  }
}

// ===== fake bridge: replica o protocolo REAL observado ao vivo =====

interface BridgeMessage {
  id: string;
  text: string;
  createdAt: string;
}

/** Formato REAL do backend (observado ao vivo em engineering.memory.context). */
function formatAgentMemoryText(payload: UcmeAgentMemoryPayload): string {
  let text = `[AGENT MEMORY]\nAgent: ${payload.agent ?? 'unknown'}\nSummary: ${payload.summary ?? ''}`;
  if (payload.decisions?.length) text += `\nDecisions:\n${payload.decisions.map((d) => `- ${d}`).join('\n')}`;
  if (payload.tests?.length) text += `\nTests:\n${payload.tests.map((t) => `- ${t}`).join('\n')}`;
  return text;
}

class UcmeBridgeFake implements UcmeTransport {
  private seq = 0;
  private readonly projects = new Map<string, BridgeMessage[]>();
  readonly seen: Array<{ operation: UcmeAgentMemoryOperation; payload: UcmeAgentMemoryPayload }> = [];
  failWrites = false;
  failReads = false;

  async call(operation: UcmeAgentMemoryOperation, payload: UcmeAgentMemoryPayload = {}): Promise<unknown> {
    this.seen.push({ operation, payload });
    const projectId = payload.projectId ?? '';
    if (operation === 'capture') {
      if (this.failWrites) throw new Error('AGENT_MEMORY_FAILED:backend_down');
      const list = this.projects.get(projectId) ?? [];
      list.push({
        id: `mid-${this.projects.size}-${list.length}-${this.seq++}`,
        text: formatAgentMemoryText(payload),
        createdAt: new Date(BASE + list.length).toISOString(),
      });
      this.projects.set(projectId, list);
      return { stored: true, memoryId: `mid-${this.seq}`, sessionId: 's-ucme', memoryBatch: 'async-triggered' };
    }
    if (operation === 'search') {
      if (this.failReads) throw new Error('AGENT_MEMORY_FAILED:backend_down');
      const query = (payload.query ?? '').toLowerCase();
      const list = this.projects.get(projectId) ?? [];
      const results = list
        .map((m) => ({ type: 'message', id: m.id, text: m.text, createdAt: m.createdAt, score: 1 }))
        .filter((r) => r.text.toLowerCase().includes(query));
      return { projectId, query: payload.query, count: results.length, results };
    }
    const list = this.projects.get(projectId) ?? [];
    return {
      projectId,
      memories: list.map((m) => ({ id: m.id, content: m.text, createdAt: m.createdAt })),
      decisions: [],
      pendingTasks: [],
      activeTopics: [],
      counts: { memories: list.length, decisions: 0, tasks: 0, topics: 0, entities: 0 },
    };
  }
}

const ERROR_RECORD = {
  errorSignature: 'svc:timeout:request timed out',
  classification: 'TRANSIENT',
  knownCause: 'upstream briefly unavailable',
  safeRecovery: 'retry_with_backoff',
  lastOutcome: 'RECOVER',
  createdAt: BASE,
  updatedAt: BASE,
};

const EXPERIENCE_RECORD = {
  signature: 'deploy:locked:database is locked',
  situation: 'deploy:locked:database is locked',
  classification: 'RESOLVABLE',
  actionTaken: 'safe_adaptation_within_permissions',
  outcome: 'success' as const,
  evidenceRefs: ['command_result:ev:fix'],
  createdAt: BASE,
};

// ===== T1 — write/read roundtrip (error + experience) =====

test('UCME-01/T1 — recordError/recordExperience gravados no UCME e recuperados com os mesmos campos', async () => {
  const bridge = new UcmeBridgeFake();
  const store = new UcmeGuardianMemoryStore(bridge, { projectId: 'proj-a' });
  await store.recordError(ERROR_RECORD);
  await store.recordExperience(EXPERIENCE_RECORD);
  const err = await store.findError('SVC:TIMEOUT:REQUEST TIMED OUT'); // equivalência real por normalização (case)
  assert.ok(err);
  assert.equal(err.errorSignature, 'svc:timeout:request timed out');
  assert.equal(err.classification, 'TRANSIENT');
  assert.equal(err.safeRecovery, 'retry_with_backoff');
  assert.equal(err.updatedAt, BASE);
  const exp = await store.findExperience('deploy:locked:DATABASE   IS locked');
  assert.ok(exp);
  assert.equal(exp.outcome, 'success');
  assert.deepEqual(exp.evidenceRefs, ['command_result:ev:fix']);
  // protocolo: capture com summary + projectId, search com query + projectId
  const captures = bridge.seen.filter((s) => s.operation === 'capture');
  assert.equal(captures.length, 2);
  assert.ok(captures.every((c) => c.payload.projectId === 'proj-a' && typeof c.payload.summary === 'string'));
});

// ===== T2 — cross-process: nova instância recupera =====

test('UCME-01/T2 — nova instância (zero RAM anterior) recupera memória via UCME', async () => {
  const bridge = new UcmeBridgeFake();
  const writer = new UcmeGuardianMemoryStore(bridge, { projectId: 'proj-a' });
  await writer.recordError(ERROR_RECORD);
  await writer.recordExperience(EXPERIENCE_RECORD);
  const reader = new UcmeGuardianMemoryStore(bridge, { projectId: 'proj-a' }); // instância nova
  const err = await reader.findError('svc:timeout:request timed out');
  assert.ok(err);
  assert.equal(err.classification, 'TRANSIENT');
  const exp = await reader.findExperience('deploy:locked:database is locked');
  assert.ok(exp);
  assert.equal(exp.actionTaken, 'safe_adaptation_within_permissions');
});

// ===== T3 — namespace isolation (FASE 10) =====

test('UCME-01/T3 — isolamento por namespace: missão B NÃO vê memória da missão A', async () => {
  const bridge = new UcmeBridgeFake();
  const storeA = new UcmeGuardianMemoryStore(bridge, { projectId: 'guardian-mission-a' });
  await storeA.recordError(ERROR_RECORD);
  await storeA.recordExperience(EXPERIENCE_RECORD);
  const storeB = new UcmeGuardianMemoryStore(bridge, { projectId: 'guardian-mission-b' });
  assert.equal(await storeB.findError('svc:timeout:request timed out'), null);
  assert.equal(await storeB.findExperience('deploy:locked:database is locked'), null);
  // e o store B pode gravar/lê o próprio namespace sem vazamento
  await storeB.recordError({ ...ERROR_RECORD, errorSignature: 'b:only', updatedAt: BASE });
  const onlyB = await storeB.findError('b:only');
  assert.ok(onlyB);
  assert.equal(await storeA.findError('b:only'), null);
  // todo payload trafegou com um namespace explícito dos dois stores
  assert.ok(
    bridge.seen.every(
      (s) => s.payload.projectId === 'guardian-mission-a' || s.payload.projectId === 'guardian-mission-b',
    ),
  );
  // namespace vazio é fail-closed na configuração
  assert.throws(() => new UcmeGuardianMemoryStore(bridge, { projectId: '  ' }), /UCME_MEMORY_PROJECT_ID_REQUIRED/);
});

// ===== T4 — falha do UCME é advisory (fail-open), FASE 14 =====

test('UCME-01/T4 — UCME down: writes engolidos com contador, reads degradam a null; nada lança', async () => {
  const bridge = new UcmeBridgeFake();
  bridge.failWrites = true;
  const store = new UcmeGuardianMemoryStore(bridge, { projectId: 'proj-a' });
  await store.recordError(ERROR_RECORD); // NÃO lança
  await store.recordExperience(EXPERIENCE_RECORD); // NÃO lança
  assert.equal(store.telemetry.writes, 2);
  assert.equal(store.telemetry.writeFailures, 2);
  bridge.failReads = true;
  assert.equal(await store.findError('svc:timeout:request timed out'), null);
  assert.equal(store.telemetry.readFailures, 1);
  assert.equal(store.telemetry.readMisses, 1);
  // resposta malformada também degrada (nunca vira erro de missão)
  bridge.failReads = false;
  const broken = new UcmeGuardianMemoryStore(
    { call: async () => ({ unexpected: true }) },
    { projectId: 'proj-a' },
  );
  assert.equal(await broken.findError('svc:timeout'), null);
});

// ===== T5 — telemetria exata (FASE 13) =====

test('UCME-01/T5 — telemetria mínima: reads/writes/hits/misses/failures contados, conteúdo nunca logado', async () => {
  const bridge = new UcmeBridgeFake();
  const telemetry = new UcmeMemoryTelemetryCounter();
  const store = new UcmeGuardianMemoryStore(bridge, { projectId: 'proj-a', telemetry });
  await store.recordError(ERROR_RECORD);
  assert.ok(await store.findError('svc:timeout:request timed out'));
  assert.equal(await store.findError('inexistente:chave'), null);
  assert.equal(telemetry.reads, 2);
  assert.equal(telemetry.writes, 1);
  assert.equal(telemetry.readHits, 1);
  assert.equal(telemetry.readMisses, 1);
  assert.equal(telemetry.writeFailures, 0);
  assert.equal(telemetry.readFailures, 0);
  assert.equal(telemetry.backend, 'ucme-agent-memory');
});

// ===== T6 — sanitização por whitelist (FASE 5) =====

test('UCME-01/T6 — serialização whitelist: campo extra sensível nunca chega ao UCME', async () => {
  const bridge = new UcmeBridgeFake();
  const store = new UcmeGuardianMemoryStore(bridge, { projectId: 'proj-a' });
  const dirty = { ...ERROR_RECORD, apiKey: 'sk-secret-xyz', bearerToken: 'Bearer abc.def' } as unknown as ErrorRecord;
  await store.recordError(dirty);
  const capture = bridge.seen.find((s) => s.operation === 'capture');
  assert.ok(capture);
  const summary = capture.payload.summary ?? '';
  assert.ok(!summary.includes('sk-secret-xyz'));
  assert.ok(!summary.includes('Bearer abc.def'));
  const json = JSON.parse(summary.match(/record=(\{[^\n]*\})/)?.[1] ?? '{}') as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(json).sort(),
    ['classification', 'createdAt', 'errorSignature', 'knownCause', 'lastOutcome', 'projectId', 'recordType', 'safeRecovery', 'schemaVersion', 'updatedAt'],
  );
  // campo sensível extra não impediu a memória útil de persistir
  assert.ok(await store.findError('svc:timeout:request timed out'));
});

// ===== T7 — last-write-wins =====

test('UCME-01/T7 — dois records da mesma signature: o mais recente vence', async () => {
  const bridge = new UcmeBridgeFake();
  const store = new UcmeGuardianMemoryStore(bridge, { projectId: 'proj-a' });
  await store.recordError({ ...ERROR_RECORD, safeRecovery: 'retry_with_backoff', updatedAt: BASE });
  await store.recordError({ ...ERROR_RECORD, safeRecovery: 'authorized_executor_fallback', updatedAt: BASE + 10 });
  const err = await store.findError('svc:timeout:request timed out');
  assert.ok(err);
  assert.equal(err.updatedAt, BASE + 10);
  assert.equal(err.safeRecovery, 'authorized_executor_fallback');
});

// ===== T8 — mission memory roundtrip + isolamento (FASE 6) =====

test('UCME-01/T8 — mission memory: recordMission gravado e recuperado por nova instância; namespaces isolados', async () => {
  const bridge = new UcmeBridgeFake();
  const writer = new UcmeGuardianMemoryStore(bridge, { projectId: 'guardian-mission-a' });
  await writer.recordMission({
    missionId: 'ucme-fase16-01',
    status: 'RUNNING',
    cycle: 2,
    completedSteps: ['a1'],
    remainingSteps: ['a2'],
    okEvidenceKeys: ['command_result:done:a1'],
    failedEvidenceKeys: ['tool_result:svc:timeout'],
    createdAt: BASE,
    updatedAt: BASE,
  });
  const reader = new UcmeGuardianMemoryStore(bridge, { projectId: 'guardian-mission-a' });
  const mission = await reader.findMission('ucme-fase16-01');
  assert.ok(mission);
  assert.equal(mission.status, 'RUNNING');
  assert.deepEqual(mission.completedSteps, ['a1']);
  const other = new UcmeGuardianMemoryStore(bridge, { projectId: 'guardian-mission-b' });
  assert.equal(await other.findMission('ucme-fase16-01'), null);
});

// ===== T9 — memória ADVISORY: nunca satisfaz critério nem expande governança (FASE 11) =====

test('UCME-01/T9a — memória UCME "otimista" mas evidência ausente -> NUNCA PASS; governança intocada', async () => {
  const bridge = new UcmeBridgeFake();
  const memory = new UcmeGuardianMemoryStore(bridge, { projectId: 'proj-a' });
  await memory.recordExperience({
    signature: 'goal',
    situation: 'criterion X already satisfied',
    actionTaken: 'everything',
    outcome: 'success',
    evidenceRefs: [],
    createdAt: BASE,
  });
  await memory.recordError({
    errorSignature: 'goal',
    classification: 'RESOLVABLE',
    safeRecovery: 'expand_permissions', // FORA do allowlist
    createdAt: BASE,
    updatedAt: BASE,
  });
  const contract = makeContract({ missionId: 'ucme-9a', completionCriteria: ['ev:goal'] });
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
  // memória não tem canal para permissions/channels/budget/model/contract:
  assert.equal(contract.maxCostUsd, 1.0);
  assert.deepEqual(contract.completionCriteria, ['ev:goal']);
  // ação fora do allowlist NUNCA é adotada
  const advice = await consultMissionMemory(memory, 'goal', 'RECOVER');
  assert.equal(advice.adoptedAction, undefined);
  // e em PASS memória nunca adota nada
  const advicePass = await consultMissionMemory(memory, 'goal', 'PASS');
  assert.equal(advicePass.adoptedAction, undefined);
});

test('UCME-01/T9b — recovery conhecida (allowlist) é adotada como guidance; decisão/segurança inalteradas', async () => {
  const bridge = new UcmeBridgeFake();
  const memory = new UcmeGuardianMemoryStore(bridge, { projectId: 'proj-a' });
  await memory.recordError({
    errorSignature: errorSignatureOf('svc:timeout:request timed out'),
    classification: 'TRANSIENT',
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
    makeContract({ missionId: 'ucme-9b', completionCriteria: ['ev:goal'] }),
    runtime,
    { memory, now: () => BASE },
  );
  const contractBefore = harness.contract;
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  assert.ok(harness.lastMemoryAdvice?.consulted);
  // recovery conhecida reutilizada (mesma prova do GH-06/T10): 2 ciclos e o
  // advice allowlisted adotado na decisão RECOVER (consult direto)
  assert.equal(runtime.executeCycleCalls, 2);
  const advice = await consultMissionMemory(memory, 'svc:timeout:request timed out', 'RECOVER');
  assert.equal(advice.adoptedAction, 'transient_non_llm_retry');
  assert.equal(advice.knownError?.classification, 'TRANSIENT');
  // governança intocada pelo caminho da memória
  assert.equal(contractBefore.maxCostUsd, 1.0);
  assert.equal(result.state.spentCostUsd ?? 0, 0); // budget respeitado
  // experiência de sucesso registrada via UCME e recuperável por nova instância
  const nextInstance = new UcmeGuardianMemoryStore(bridge, { projectId: 'proj-a' });
  const experience = await nextInstance.findExperience('svc:timeout:request timed out');
  assert.ok(experience);
  assert.equal(experience.outcome, 'success');
});
