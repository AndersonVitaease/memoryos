/**
 * W0-UCME-HOOK — E2E against the REAL UCME backend (agentMemoryBridge).
 * A small deterministic Guardian mission (no LLM, no memory words anywhere in
 * the prompt) must be auto-captured by the GuardianHarness.finish() hook via
 * the deployment gate (ENG_MCP_GUARDIAN_MEMORY_AUTO='on'). No mock transport:
 * the store composes the REAL AgentMemoryClient (same endpoint/credential).
 * Skips honestly when the runner has no UCME credential provisioned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GuardianHarness } from '../src/harness/GuardianHarness.js';
import { MultiAgentRuntime } from '../src/harness/multiAgentRuntime.js';
import { AdvisorAgent, MissionStateView } from '../src/harness/advisor.js';
import { Evidence, MissionContract } from '../src/harness/missionTypes.js';
import { PlanAction, PlanProposal } from '../src/harness/multiAgentTypes.js';
import {
  createUcmeGuardianMemoryStore,
  GuardianMissionMemoryRecord,
} from '../src/harness/ucmeMissionMemory.js';

const PROJECT_ID = 'w0-ucme-hook-e2e';
const POINTER_FILE = path.join(os.tmpdir(), 'w0-ucme-e2e-last.json');

const GATE_ENV_KEYS = [
  'ENG_MCP_GUARDIAN_MEMORY_AUTO',
  'ENG_MCP_GUARDIAN_MEMORY_PROJECT_ID',
] as const;

function withGate(fn: () => Promise<void>): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const key of GATE_ENV_KEYS) saved.set(key, process.env[key]);
  process.env.ENG_MCP_GUARDIAN_MEMORY_AUTO = 'on';
  process.env.ENG_MCP_GUARDIAN_MEMORY_PROJECT_ID = PROJECT_ID;
  return fn().finally(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

/** The real bridge indexes captures asynchronously — retry bounded. */
async function findMissionEventually(
  store: ReturnType<typeof createUcmeGuardianMemoryStore>,
  missionId: string,
  attempts = 10,
): Promise<GuardianMissionMemoryRecord | null> {
  let record: GuardianMissionMemoryRecord | null = null;
  for (let i = 0; i < attempts; i += 1) {
    record = await store.findMission(missionId);
    if (record) return record;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return record;
}

const BASE = 1_700_000_000_000;

function ev(type: Evidence['type'], key: string, status: 'ok' | 'fail' = 'ok', value?: string): Evidence {
  const evidence: Evidence = { type, key, status, timestamp: BASE, source: 'fake-worker' };
  if (value !== undefined) evidence.value = value;
  return evidence;
}

function fakeAction(id: string, okKey: string): PlanAction {
  return {
    id,
    description: `fake action ${id}`,
    dependsOn: [],
    expectedEvidence: [okKey],
    run: async () => ({ evidence: [ev('command_result', okKey)], costUsd: 0 }),
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

test('W0-E2E — missão real Guardian auto-capturada no UCME REAL, sem prompt de memória', async (t) => {
  if (!process.env.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE) {
    t.skip('E2E requer UCME real: ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE ausente no runner');
    return;
  }
  // UCME_MISSION_EXISTS_BEFORE=NO por construção: id único por execução.
  const missionId = `w0-ucme-hook-e2e-${Date.now()}`;
  const objective = 'Calcular 2+2 e provar o resultado com evidência determinística.';
  // PROMPT_DEPENDENCY_REMOVED: o texto da missão não contém gatilho de memória.
  assert.ok(!/mem(ó|o)ria|memory|ucme|capture|engineering\.memory/i.test(objective));

  await withGate(async () => {
    // BEFORE — processo/client novos, backend real
    const before = createUcmeGuardianMemoryStore({ projectId: PROJECT_ID });
    assert.equal(await before.findMission(missionId), null); // UCME_MISSION_EXISTS_BEFORE=NO

    // A missão: GuardianHarness real + MultiAgentRuntime real. Nenhum LLM é
    // instanciado (advisor determinístico, sem supervisor): LLM_MEMORY_TOOL_
    // CALLS=0 por construção; a captura nasce do CICLO DE VIDA do harness
    // (CAPTURE_TRIGGER=GUARDIAN_LIFECYCLE), não de chamada de tool de memória.
    const runtime = new MultiAgentRuntime({
      advisor: new PlannedAdvisor(() => [fakeAction('sum', 'ev:goal')]),
    });
    const contract: MissionContract = {
      missionId,
      objective,
      completionCriteria: ['ev:goal'],
      maxCycles: 4,
      maxDurationMs: 60_000,
      maxNoProgressCycles: 3,
      maxCostUsd: 1.0,
    };
    // NENHUM options.memory: a captura usa o auto-wire por gate de deploy.
    const harness = new GuardianHarness(contract, runtime, {});
    const started = Date.now();
    const result = await harness.run();
    const elapsed = Date.now() - started;
    assert.equal(result.status, 'PASS');
    assert.ok(elapsed < 60_000, `missão demorou ${elapsed}ms`);

    // AFTER — instância totalmente nova (novo AgentMemoryClient), backend real
    const after = createUcmeGuardianMemoryStore({ projectId: PROJECT_ID });
    const record = await findMissionEventually(after, missionId);
    assert.ok(record, 'registro da missão não encontrado no UCME real'); // UCME_MISSION_EXISTS_AFTER=YES
    assert.equal(record?.missionId, missionId);
    assert.equal(record?.status, 'PASS');
    assert.deepEqual(record?.okEvidenceKeys, ['ev:goal']);

    // ponteiro para o teste de leitura cross-process (processo separado)
    fs.writeFileSync(POINTER_FILE, JSON.stringify({ missionId, projectId: PROJECT_ID }), 'utf8');
  });
});
