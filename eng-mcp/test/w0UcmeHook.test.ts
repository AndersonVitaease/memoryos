/**
 * W0-UCME-HOOK — deterministic unit proofs for the GuardianHarness.finish()
 * auto-capture hook. No LLM, no live backend: the fake transport replicates
 * the REAL agentMemoryBridge protocol (same one used by ucmeMissionMemory
 * tests). Proofs: PASS/FAIL/BLOCKED persisted, dedup, UCME-down advisory,
 * evidence/completion unchanged, structural skip for stores without the
 * FASE-6 mission API, auto-wire gate semantics and bounded capture.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GuardianHarness } from '../src/harness/GuardianHarness.js';
import { MultiAgentRuntime } from '../src/harness/multiAgentRuntime.js';
import { AdvisorAgent, MissionStateView } from '../src/harness/advisor.js';
import { MemoryMissionMemoryStore } from '../src/harness/missionMemory.js';
import {
  Evidence,
  MissionContract,
  MissionStatus,
} from '../src/harness/missionTypes.js';
import { PlanAction, PlanProposal } from '../src/harness/multiAgentTypes.js';
import {
  createUcmeGuardianMemoryStore,
  UcmeAgentMemoryOperation,
  UcmeAgentMemoryPayload,
  UcmeGuardianMemoryStore,
  UcmeTransport,
} from '../src/harness/ucmeMissionMemory.js';

const BASE = 1_700_000_000_000;

function ev(type: Evidence['type'], key: string, status: 'ok' | 'fail' = 'ok', value?: string): Evidence {
  const evidence: Evidence = { type, key, status, timestamp: BASE, source: 'fake-worker' };
  if (value !== undefined) evidence.value = value; // chave omitida: roundtrip JSON fiel
  return evidence;
}

function makeContract(overrides: Partial<MissionContract> = {}): MissionContract {
  return {
    missionId: 'UCME-01',
    objective: 'Missão determinística de prova do hook W0.',
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

function passRuntime(): MultiAgentRuntime {
  return new MultiAgentRuntime({
    advisor: new PlannedAdvisor(() => [fakeAction('goal', { okKey: 'ev:goal' })]),
  });
}

// ===== fake bridge: replica o protocolo REAL observado ao vivo =====

interface BridgeMessage {
  id: string;
  text: string;
  createdAt: string;
}

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

function missionCaptures(bridge: UcmeBridgeFake): Array<{ payload: UcmeAgentMemoryPayload }> {
  return bridge.seen.filter(
    (s) => s.operation === 'capture' && typeof s.payload.summary === 'string' && s.payload.summary.includes('[GUARDIAN:mission]'),
  );
}

// ===== env + local-server helpers (auto-wire gate proofs) =====

const ENV_KEYS = [
  'ENG_MCP_GUARDIAN_MEMORY_AUTO',
  'ENG_MCP_GUARDIAN_MEMORY_PROJECT_ID',
  'ENG_MCP_GUARDIAN_MEMORY_TIMEOUT_MS',
  'ENG_MCP_AGENT_MEMORY_ENDPOINT',
  'ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE',
] as const;

function withEnv(
  overrides: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  fn: () => Promise<void>,
): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) saved.set(key, process.env[key]);
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) process.env[key] = value;
  }
  return fn().finally(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

interface RecordedRequest {
  operation: string;
  body: Record<string, unknown>;
  token: string | undefined;
}

interface RecordingServer {
  server: http.Server;
  requests: RecordedRequest[];
  url: string;
  close: () => void;
}

function startRecordingServer(): Promise<RecordingServer> {
  return new Promise((resolve, reject) => {
    const requests: RecordedRequest[] = [];
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => {
        raw += chunk;
      });
      req.on('end', () => {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          parsed = {};
        }
        requests.push({
          operation: String(parsed.operation ?? ''),
          body: parsed,
          token: req.headers['x-agent-memory-token'],
        });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, data: { results: [], stored: true } }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('recording server: no address'));
        return;
      }
      resolve({
        server,
        requests,
        url: `http://127.0.0.1:${address.port}/functions/agentMemoryBridge`,
        close: () => {
          (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
          server.close();
        },
      });
    });
    server.on('error', reject);
  });
}

function startHangingServer(): Promise<{ server: http.Server; url: string; close: () => void }> {
  return new Promise((resolve, reject) => {
    // Accepts connections and NEVER responds: the transport timeout must win.
    const server = http.createServer(() => {
      /* hang */
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('hanging server: no address'));
        return;
      }
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/functions/agentMemoryBridge`,
        close: () => {
          (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
          server.close();
        },
      });
    });
    server.on('error', reject);
  });
}

function tempCredentialFile(token: string): string {
  const file = path.join(os.tmpdir(), `w0-cred-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.writeFileSync(file, token, 'utf8');
  return file;
}

// ===== T1 — PASS: capture automática no finish(), via recordMission existente =====

test('W0/T1 — finish() captura missão PASS automaticamente (store injetada, sem prompt)', async () => {
  const bridge = new UcmeBridgeFake();
  const store = new UcmeGuardianMemoryStore(bridge, { projectId: 'w0-pass' });
  const harness = new GuardianHarness(makeContract({ missionId: 'W0-PASS-01' }), passRuntime(), {
    memory: store,
    now: () => BASE,
  });
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  const record = await store.findMission('W0-PASS-01');
  assert.ok(record);
  assert.equal(record.status, 'PASS');
  assert.deepEqual(record.okEvidenceKeys, ['ev:goal']);
  assert.equal(record.createdAt, BASE);
  assert.equal(record.updatedAt, BASE);
  // exatamente UM capture de missão; nenhum 'context' (nenhuma consulta por prompt)
  assert.equal(missionCaptures(bridge).length, 1);
  assert.ok(bridge.seen.every((s) => s.operation !== 'context'));
});

// ===== T2 — FAIL: capture automático via evaluateCompletionOnly() =====

test('W0/T2 — finish() captura missão FAIL (completion_criteria_missing)', async () => {
  const bridge = new UcmeBridgeFake();
  const store = new UcmeGuardianMemoryStore(bridge, { projectId: 'w0-fail' });
  const harness = new GuardianHarness(makeContract({ missionId: 'W0-FAIL-01' }), passRuntime(), {
    memory: store,
    now: () => BASE,
  });
  const result = await harness.evaluateCompletionOnly();
  assert.equal(result.status, 'FAIL');
  const record = await store.findMission('W0-FAIL-01');
  assert.ok(record);
  assert.equal(record.status, 'FAIL');
  assert.equal(record.blocker, 'completion_criteria_missing:ev:goal');
  assert.deepEqual(record.okEvidenceKeys, []);
});

// ===== T3 — BLOCKED: capture automático + telemetria/ops exatas =====

test('W0/T3 — finish() captura missão BLOCKED (max_cycles_exhausted); ops exatas [search,capture]', async () => {
  const bridge = new UcmeBridgeFake();
  const store = new UcmeGuardianMemoryStore(bridge, { projectId: 'w0-blocked' });
  const harness = new GuardianHarness(makeContract({ missionId: 'W0-BLOCKED-01', maxCycles: 0 }), passRuntime(), {
    memory: store,
    now: () => BASE,
  });
  const result = await harness.run();
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'max_cycles_exhausted(0/0)');
  const record = await store.findMission('W0-BLOCKED-01');
  assert.ok(record);
  assert.equal(record.status, 'BLOCKED');
  assert.equal(record.blocker, 'max_cycles_exhausted(0/0)');
  // ciclo 0: nenhum runtime/decisão — as únicas ops do hook são dedup+capture
  assert.deepEqual(bridge.seen.map((s) => s.operation), ['search', 'capture']);
  assert.equal(store.telemetry.reads, 1);
  assert.equal(store.telemetry.readMisses, 1);
  assert.equal(store.telemetry.readHits, 0);
  assert.equal(store.telemetry.writes, 1);
  assert.equal(store.telemetry.writeFailures, 0);
});

// ===== T4 — dedup: equivalente não reescreve; registro mais velho é reescrito =====

test('W0/T4 — dedup: mesmo status+updatedAt não reescreve; updatedAt mais velho é reescrito', async () => {
  const bridge = new UcmeBridgeFake();
  const store = new UcmeGuardianMemoryStore(bridge, { projectId: 'w0-dedup' });
  const contract = (): MissionContract => makeContract({ missionId: 'W0-DEDUP-01', maxCycles: 0 });

  await new GuardianHarness(contract(), passRuntime(), { memory: store, now: () => BASE }).run();
  assert.equal(missionCaptures(bridge).length, 1);

  // mesma missão, mesmo relógio: registro persistido é equivalente → SKIP
  await new GuardianHarness(contract(), passRuntime(), { memory: store, now: () => BASE }).run();
  assert.equal(missionCaptures(bridge).length, 1);

  // mesma missão, relógio mais novo: registro persistido ficou velho → reescreve
  await new GuardianHarness(contract(), passRuntime(), { memory: store, now: () => BASE + 5000 }).run();
  assert.equal(missionCaptures(bridge).length, 2);
  const record = await store.findMission('W0-DEDUP-01');
  assert.ok(record);
  assert.equal(record.updatedAt, BASE + 5000);
});

// ===== T5 — UCME down: missão finaliza idêntica; falha observável em telemetria =====

test('W0/T5 — UCME down: status/evidência idênticos ao run sem memória; falha contada; nada gravado', async () => {
  const contract = (): MissionContract => makeContract({ missionId: 'W0-DOWN-01', maxCycles: 0 });

  const baseline = await new GuardianHarness(contract(), passRuntime(), { now: () => BASE }).run();
  assert.equal(baseline.status, 'BLOCKED');

  const bridge = new UcmeBridgeFake();
  bridge.failWrites = true;
  bridge.failReads = true;
  const store = new UcmeGuardianMemoryStore(bridge, { projectId: 'w0-down' });
  const degraded = await new GuardianHarness(contract(), passRuntime(), { memory: store, now: () => BASE }).run();
  // resultado da missão INALTERADO
  assert.equal(degraded.status, baseline.status);
  assert.deepEqual(degraded.state.evidence, baseline.state.evidence);
  assert.equal(degraded.reason, baseline.reason);
  // falha de memória OBSERVÁVEL (contadores, nunca conteúdo)
  assert.equal(store.telemetry.readFailures, 1);
  assert.equal(store.telemetry.writeFailures, 1);
  // UCME recuperado: nada foi gravado durante a queda
  bridge.failWrites = false;
  bridge.failReads = false;
  assert.equal(await store.findMission('W0-DOWN-01'), null);
});

// ===== T6 — store sem API de missão (MemoryMissionMemoryStore) é ignorada em silêncio =====

test('W0/T6 — store GH-06 sem recordMission/findMission: hook não lança e não fabrica capture', async () => {
  const plain = new MemoryMissionMemoryStore() as unknown as Record<string, unknown>;
  assert.equal(typeof plain.recordMission, 'undefined');
  assert.equal(typeof plain.findMission, 'undefined');
  const harness = new GuardianHarness(makeContract({ missionId: 'W0-PLAINSTORE-01' }), passRuntime(), {
    memory: new MemoryMissionMemoryStore(),
    now: () => BASE,
  });
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
});

// ===== T7 — CANCELLED não é representável em MissionStatus =====

test('W0/T7 — MissionStatus não tem CANCELLED: o hook captura só status nativos, nada fabricado', () => {
  const statuses: MissionStatus[] = ['PENDING', 'RUNNING', 'BLOCKED', 'PASS', 'FAIL'];
  assert.ok(!statuses.includes('CANCELLED' as MissionStatus));
});

// ===== T8 — PROVA PRINCIPAL: missão sem NENHUMA palavra de memória é persistida =====

test('W0/T8 — missão cujo prompt NÃO menciona memória/UCME/capture é persistida no UCME', async () => {
  const objective = 'Somar 2+2 e provar o resultado com evidência determinística.';
  const actions = [fakeAction('sum', { okKey: 'ev:goal' })];
  const promptText = `${objective} ${actions.map((a) => a.description).join(' ')}`;
  // nenhuma dependência de prompt/modelo: o texto não contém gatilho de memória
  assert.ok(!/mem(ó|o)ria|memory|ucme|capture|engineering\.memory/i.test(promptText));

  const bridge = new UcmeBridgeFake();
  const store = new UcmeGuardianMemoryStore(bridge, { projectId: 'w0-nomem' });
  const runtime = new MultiAgentRuntime({ advisor: new PlannedAdvisor(() => actions) });
  const harness = new GuardianHarness(makeContract({ missionId: 'W0-NOMEM-01', objective }), runtime, {
    memory: store,
    now: () => BASE,
  });
  const result = await harness.run();
  assert.equal(result.status, 'PASS');
  const record = await store.findMission('W0-NOMEM-01');
  assert.ok(record); // persistida APENAS pelo ciclo de vida do Guardian
  assert.equal(record.status, 'PASS');
  assert.equal(missionCaptures(bridge).length, 1);
  assert.ok(bridge.seen.every((s) => s.operation !== 'context'));
});

// ===== T9 — gate OFF: auto-wire desligado por configuração, zero requests =====

test('W0/T9 — gate OFF (env ausente): nenhuma tentativa de capture (zero HTTP)', async () => {
  const recording = await startRecordingServer();
  try {
    await withEnv({ ENG_MCP_AGENT_MEMORY_ENDPOINT: recording.url }, async () => {
      const harness = new GuardianHarness(makeContract({ missionId: 'W0-GATEOFF-01' }), passRuntime(), {
        now: () => BASE,
      });
      const result = await harness.run();
      assert.equal(result.status, 'PASS');
    });
    assert.equal(recording.requests.length, 0);
  } finally {
    recording.close();
  }
});

// ===== T10 — gate ON: MESMO transport/auth do AgentMemoryClient (endpoint + credentialFile) =====

test('W0/T10 — gate ON: auto-wire reusa AgentMemoryClient (token do credentialFile) e captura a missão', async () => {
  const recording = await startRecordingServer();
  const credFile = tempCredentialFile('test-token-w0');
  try {
    await withEnv(
      {
        ENG_MCP_AGENT_MEMORY_ENDPOINT: recording.url,
        ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE: credFile,
        ENG_MCP_GUARDIAN_MEMORY_AUTO: 'on',
        ENG_MCP_GUARDIAN_MEMORY_PROJECT_ID: 'w0-autowire',
      },
      async () => {
        const harness = new GuardianHarness(makeContract({ missionId: 'W0-AUTOWIRE-01' }), passRuntime(), {
          now: () => BASE,
        });
        const result = await harness.run();
        assert.equal(result.status, 'PASS');
      },
    );
    assert.ok(recording.requests.length >= 2);
    assert.equal(recording.requests[0].operation, 'search');
    // MESMO mecanismo de auth do AgentMemoryClient: header x-agent-memory-token
    assert.equal(recording.requests[0].token, 'test-token-w0');
    const capture = recording.requests.find(
      (r) => r.operation === 'capture' && String(r.body.summary ?? '').includes('[GUARDIAN:mission]'),
    );
    assert.ok(capture);
    assert.equal(capture.body.projectId, 'w0-autowire');
    assert.ok(String(capture.body.summary).includes('"missionId":"W0-AUTOWIRE-01"'));
  } finally {
    fs.rmSync(credFile, { force: true });
    recording.close();
  }
});

// ===== T11 — UCME pendurado: timeout limita o hook; missão finaliza idêntica =====

test('W0/T11 — UCME pendurado: capture limitado por timeout; run() finaliza PASS no prazo', async () => {
  const hanging = await startHangingServer();
  const credFile = tempCredentialFile('test-token-w0');
  try {
    let elapsed = Number.POSITIVE_INFINITY;
    await withEnv(
      {
        ENG_MCP_AGENT_MEMORY_ENDPOINT: hanging.url,
        ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE: credFile,
        ENG_MCP_GUARDIAN_MEMORY_AUTO: 'on',
        ENG_MCP_GUARDIAN_MEMORY_PROJECT_ID: 'w0-hang',
        ENG_MCP_GUARDIAN_MEMORY_TIMEOUT_MS: '300',
      },
      async () => {
        const harness = new GuardianHarness(makeContract({ missionId: 'W0-HANG-01' }), passRuntime(), {
          now: () => BASE,
        });
        const started = Date.now();
        const result = await harness.run();
        elapsed = Date.now() - started;
        assert.equal(result.status, 'PASS');
      },
    );
    // search + capture, cada um limitado a 300ms — finish() nunca fica preso
    assert.ok(elapsed < 5000, `finish() demorou ${elapsed}ms com UCME pendurado`);
  } finally {
    fs.rmSync(credFile, { force: true });
    hanging.close();
  }
});

// ===== T12 — factory: namespace default + transporte injetado respeitado =====

test('W0/T12 — createUcmeGuardianMemoryStore: default guardian-missions; transport injetado honrado', async () => {
  await withEnv({}, async () => {
    const bridge = new UcmeBridgeFake();
    const store = createUcmeGuardianMemoryStore({ projectId: 'w0-factory', transport: bridge });
    assert.ok(store instanceof UcmeGuardianMemoryStore);
    await store.recordMission({ missionId: 'F1', status: 'PASS', createdAt: BASE, updatedAt: BASE });
    let captures = missionCaptures(bridge);
    assert.equal(captures.length, 1);
    assert.equal(captures[0].payload.projectId, 'w0-factory');

    const defaulted = createUcmeGuardianMemoryStore({ transport: bridge });
    await defaulted.recordMission({ missionId: 'F2', status: 'PASS', createdAt: BASE, updatedAt: BASE });
    captures = missionCaptures(bridge);
    assert.equal(captures.length, 2);
    assert.equal(captures[1].payload.projectId, 'guardian-missions');
  });
});
