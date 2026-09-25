/**
 * AUTO-RUN-01B — B1/B2/B3 tests for src/harness/promotionSignatures.ts.
 *
 * Proofs (red-then-green discipline):
 *   - proof 3: a signature with only 2 repetitions is NEVER listed as a
 *     promotion candidate (only >= 3 reps across >= 2 distinct missions).
 *   - B3 structural contract: judgeGate.ts (the gate that owns the allowlist)
 *     contains NO filesystem write primitives — promotion is a CODE-ONLY
 *     deploy step; there is no runtime write path into the allowlist by
 *     construction.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPromotionSignatureLine,
  fileScopeOf,
  normalizeCommandForSignature,
  promotionSignatureKey,
  promotionCandidates,
  PROMOTION_MIN_DISTINCT_SOURCES,
  PROMOTION_MIN_REPEATS,
  PROMOTION_SIGNATURES_VERSION,
  type PromotionSignatureLine,
} from '../src/harness/promotionSignatures.js';

const NOW = Date.parse('2026-09-25T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const cmd = 'npm run generate-types --prefix /tmp/app';
const cat = 'BAND2_GRAY_AUTO' as const;

function line(over: Partial<Parameters<typeof buildPromotionSignatureLine>[0]> = {}): PromotionSignatureLine {
  return buildPromotionSignatureLine({ command: cmd, category: cat, mission: 'm1', session: 'sess-aaaa', at: new Date(NOW).toISOString(), ...over });
}

describe('AUTO-RUN-01B B1: promotion signature derivation', () => {
  it('key is deterministic over (normalized command, fileScope, category) and separates inputs', () => {
    assert.equal(promotionSignatureKey(cmd, cat), promotionSignatureKey(cmd, cat));
    assert.notEqual(promotionSignatureKey(cmd, cat), promotionSignatureKey(cmd, 'BAND2_GRAY_MEDIUM'));
    assert.notEqual(promotionSignatureKey(cmd, cat), promotionSignatureKey(cmd + ' --flag', cat));
    assert.match(promotionSignatureKey(cmd, cat), /^[0-9a-f]{16}$/);
  });

  it('normalization collapses whitespace so whitespace-only drift does NOT fork the signature', () => {
    assert.equal(normalizeCommandForSignature('  npm   run   generate-types  '), 'npm run generate-types');
    assert.equal(promotionSignatureKey('  npm    run  x ', cat), promotionSignatureKey('npm run x', cat));
  });

  it('fileScope extracts sorted deduped path tokens; "(none)" when scope-free', () => {
    assert.equal(fileScopeOf('tar -cf /tmp/a.tar /tmp/b /tmp/a.tar'), '/tmp/a.tar /tmp/b');
    assert.equal(fileScopeOf('run-migrations --now'), '(none)');
    assert.equal(fileScopeOf(cmd), '/tmp/app');
  });

  it('buildPromotionSignatureLine emits versioned metadata-only fields', () => {
    const l = line();
    assert.equal(l.version, PROMOTION_SIGNATURES_VERSION);
    assert.equal(l.key, promotionSignatureKey(cmd, cat));
    assert.equal(l.category, cat);
    assert.equal(l.mission, 'm1');
    assert.equal(l.session, 'sess-aaaa'.slice(0, 12));
    assert.equal(l.fileScope, '/tmp/app');
    assert.ok(l.commandSha16.length === 16);
    assert.ok(!l.commandPreview.includes('\n'), 'normalized (no raw whitespace runs)');
  });

  it('buildPromotionSignatureLine: same command in a different session/mission keeps the SAME key', () => {
    assert.equal(line().key, line({ mission: 'm2', session: 'sess-bbbb' }).key, 'repetition detection depends on a stable key across sources');
  });
});

describe('AUTO-RUN-01B B2: promotion candidate listing (proof 3)', () => {
  it('2 repetitions → NOT listed (only >= 3)', () => {
    const c = promotionCandidates([line(), line()], NOW);
    assert.equal(c.length, 0, 'proof 3: 2 reps < PROMOTION_MIN_REPEATS → no candidate');
  });

  it('3 repetitions from ONE mission → NOT listed (needs >= 2 distinct sources)', () => {
    const c = promotionCandidates([line(), line(), line()], NOW);
    assert.equal(c.length, 0, 'proof 3: single-source repetition is not a candidate');
  });

  it('3 repetitions across 2 distinct missions → LISTED with count/sources/window', () => {
    const c = promotionCandidates([
      line({ mission: 'm1', at: new Date(NOW - DAY).toISOString() }),
      line({ mission: 'm1', at: new Date(NOW).toISOString() }),
      line({ mission: 'm2', at: new Date(NOW - 2 * DAY).toISOString() }),
    ], NOW);
    assert.equal(c.length, 1);
    assert.equal(c[0].count, 3);
    assert.deepEqual(c[0].sources, ['m1', 'm2']);
    assert.equal(c[0].key, promotionSignatureKey(cmd, cat));
    assert.equal(c[0].firstAt, new Date(NOW - 2 * DAY).toISOString());
    assert.equal(c[0].lastAt, new Date(NOW).toISOString());
  });

  it('session is a valid fallback source when mission is null', () => {
    const c = promotionCandidates([
      line({ mission: null, session: 'sess-aaaa' }),
      line({ mission: null, session: 'sess-aaaa' }),
      line({ mission: null, session: 'sess-bbbb' }),
    ], NOW);
    assert.equal(c.length, 1);
    assert.deepEqual(c[0].sources, ['sess-aaaa', 'sess-bbbb']);
  });

  it('repetitions older than the 30-day window are ignored', () => {
    const old = new Date(NOW - 31 * DAY).toISOString();
    const c = promotionCandidates([line({ at: old }), line({ at: old }), line({ mission: 'm2', at: old })], NOW);
    assert.equal(c.length, 0, '30-day window keeps candidates recent');
  });

  it('a MEDIUM-routed signature is a candidate by category too (operator route also enters B1)', () => {
    const c = promotionCandidates([
      line({ category: 'BAND2_GRAY_MEDIUM', mission: 'm1' }),
      line({ category: 'BAND2_GRAY_MEDIUM', mission: 'm1' }),
      line({ category: 'BAND2_GRAY_MEDIUM', mission: 'm2' }),
    ], NOW);
    assert.equal(c.length, 1);
    assert.equal(c[0].category, 'BAND2_GRAY_MEDIUM');
  });

  it('corrupt/garbage lines are skipped, never thrown', () => {
    const c = promotionCandidates([
      null as unknown as PromotionSignatureLine,
      { key: 'x' } as unknown as PromotionSignatureLine,
      { ...line(), at: 'not-a-date' },
      line(), line(), line({ mission: 'm2' }),
    ], NOW);
    assert.equal(c.length, 1, 'valid repetitions still aggregate around garbage');
  });

  it('constants pin the thresholds the mission defines', () => {
    assert.equal(PROMOTION_MIN_REPEATS, 3);
    assert.equal(PROMOTION_MIN_DISTINCT_SOURCES, 2);
  });
});

describe('AUTO-RUN-01B B3: promotion is code-only (structural contract)', () => {
  const gatePath = fileURLToPath(new URL('../src/harness/judgeGate.ts', import.meta.url));
  const gateSource = readFileSync(gatePath, 'utf8');

  it('judgeGate.ts contains NO filesystem write primitive (no runtime write path into the allowlist)', () => {
    const writePrimitives = [
      'appendFileSync', 'writeFileSync', 'writeFile(', 'mkdirSync', 'mkdtempSync',
      'appendFile(', 'fs.rename', 'fs.rm', 'rmSync', 'unlinkSync', 'openSync',
    ];
    const hits = writePrimitives.filter === undefined ? [] : writePrimitives.filter((p) => gateSource.includes(p));
    assert.deepEqual(hits, [], `gate must never mutate the allowlist at runtime; found: ${hits.join(', ')}`);
  });

  it('judgeGate.ts does not import the promotion module or any trail writer (promotion lives outside the gate)', () => {
    assert.ok(!gateSource.includes('promotionSignatures'), 'gate must not write promotion trails itself');
    assert.ok(!gateSource.includes('ALLOWLIST_VERSION = \'band1-allowlist-v2\''), 'allowlist version bump only happens at a real promotion (B3 deploy step)');
  });
});
