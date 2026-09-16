/**
 * W0-UCME-HOOK — cross-process read proof. Runs as its OWN process (separate
 * engineering_test_run invocation): a brand-new UcmeGuardianMemoryStore +
 * AgentMemoryClient reads the mission record captured by w0UcmeE2E.test.ts
 * from the REAL UCME backend — the only shared channel between the two
 * processes. Skips honestly when the writer has not run or no credential is
 * provisioned in this runner.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createUcmeGuardianMemoryStore,
  GuardianMissionMemoryRecord,
} from '../src/harness/ucmeMissionMemory.js';

const POINTER_FILE = path.join(os.tmpdir(), 'w0-ucme-e2e-last.json');

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

test('W0-E2E-READ — novo processo lê no UCME real o registro capturado pelo writer', async (t) => {
  if (!process.env.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE) {
    t.skip('Cross-process read requer UCME real: credential ausente no runner');
    return;
  }
  let pointer: { missionId: string; projectId: string };
  try {
    pointer = JSON.parse(fs.readFileSync(POINTER_FILE, 'utf8')) as {
      missionId: string;
      projectId: string;
    };
  } catch {
    t.skip('writer E2E ainda não executou (ponteiro ausente) — rode test/w0UcmeE2E.test.ts antes');
    return;
  }
  // Instância 100% nova: zero memória de processo do writer (processo distinto);
  // o único caminho até o registro é o backend UCME real.
  const store = createUcmeGuardianMemoryStore({ projectId: pointer.projectId });
  const record = await findMissionEventually(store, pointer.missionId);
  assert.ok(record, 'registro não legível cross-process'); // CROSS_PROCESS_READ=YES
  assert.equal(record?.missionId, pointer.missionId);
  assert.equal(record?.status, 'PASS');
  assert.ok(Array.isArray(record?.okEvidenceKeys));
});
