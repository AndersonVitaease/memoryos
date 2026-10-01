import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getRoster } from '../src/sessionRoster';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ROSTER-01: testes isolados em tmpdir com MISSION_STATE_DIR_OVERRIDE —
// NUNCA escrevem/lêem no ledger de produção (/root/.hermes/mission-state).
const mockMissions = [
  { missionId: 'mission-01', status: 'completed', lastEventAt: Date.now() - 300000 },
  { missionId: 'mission-02', status: 'dispatched', lastEventAt: Date.now() - 20000000 },
  { missionId: 'mission-03', status: 'working', lastEventAt: Date.now() - 10000000 }
];

let tmpDir = '';
const originalOverride = process.env.MISSION_STATE_DIR_OVERRIDE;

describe('getRoster', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-test-'));
    mockMissions.forEach(mission => {
      fs.writeFileSync(
        path.join(tmpDir, `${mission.missionId}.json`),
        JSON.stringify(mission)
      );
    });
    process.env.MISSION_STATE_DIR_OVERRIDE = tmpDir;
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalOverride === undefined) {
      delete process.env.MISSION_STATE_DIR_OVERRIDE;
    } else {
      process.env.MISSION_STATE_DIR_OVERRIDE = originalOverride;
    }
  });

  it('should return valid roster structure', () => {
    const roster = getRoster();
    assert.ok(roster.missions);
    assert.ok(roster.panes);
    assert.ok(roster.sessions);
    assert.ok(roster.summary);
  });

  it('should include our mock missions by status', () => {
    const roster = getRoster();
    assert.ok(roster.missions['completed'], 'should have completed bucket');
    assert.ok(roster.missions['dispatched'], 'should have dispatched bucket');
    assert.ok(roster.missions['working'], 'should have working bucket');
  });

  it('should compute age in minutes for missions', () => {
    const roster = getRoster();
    const dispatched = roster.missions['dispatched']?.find(m => m.missionId === 'mission-02');
    assert.ok(dispatched, 'dispatched mission should exist');
    assert.ok(dispatched.ageMinutes !== undefined, 'ageMinutes should be set');
    assert.ok(dispatched.ageMinutes > 30, `dispatched should be >30min old, got ${dispatched.ageMinutes}`);
  });

  it('should not expose conversation content', () => {
    const roster = getRoster();
    const jsonStr = JSON.stringify(roster);
    assert.ok(!jsonStr.match(/transcript|message|content|text/i), 'should not contain conversation content');
  });

  it('should flag stale dispatched/working missions (>15min)', () => {
    const roster = getRoster();
    // mission-02 (dispatched, ~333min) and mission-03 (working, ~166min) should trigger staleness
    assert.ok(roster.summary.staleness_flags >= 2, `should have >=2 staleness flags, got ${roster.summary.staleness_flags}`);
  });

  it('should count total missions including mock ones', () => {
    const roster = getRoster();
    assert.ok(roster.summary.total_missions >= 3, `should have >=3 missions, got ${roster.summary.total_missions}`);
    assert.ok(roster.summary.by_status.completed >= 1, 'should have at least 1 completed');
    assert.ok(roster.summary.by_status.dispatched >= 1, 'should have at least 1 dispatched');
    assert.ok(roster.summary.by_status.working >= 1, 'should have at least 1 working');
  });

  it('should be isolated: no production ledger file is touched', () => {
    // Guarda LGPD/produção: os mocks nunca podem existir no diretório real.
    assert.ok(process.env.MISSION_STATE_DIR_OVERRIDE, 'override deve estar ativo');
    assert.ok(!fs.existsSync(path.join('/root/.hermes/mission-state', 'mission-01.json')),
      'mock NÃO pode vazar para o ledger de produção');
  });
});

describe('performance', () => {
  it('latency should be under 100ms p95', () => {
    const runs = 20;
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      getRoster();
      const end = performance.now();
      times.push(end - start);
    }
    times.sort((a, b) => a - b);
    const p95Index = Math.floor(times.length * 0.95);
    const p95 = times[p95Index];
    console.log(`p95 latency: ${p95}ms`);
    assert.ok(p95 < 100, `p95 latency ${p95}ms exceeds 100ms`);
  });
});