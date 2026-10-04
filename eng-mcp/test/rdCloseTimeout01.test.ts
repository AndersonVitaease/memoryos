/**
 * RD-CLOSE-TIMEOUT-01 — timeout tipado do wrapper de engineering.mission.close.
 *
 * R1: o teto do wrapper do close (real e dryRun) é >= 300s (o close real leva
 *     68-139s quando o deliver-verify re-executa provas de ~99s; o teto de 90s
 *     estourava com erro genérico).
 * R2: estouro do wrapper vira o código tipado GATE_TIMEOUT no envelope ERROR-01,
 *     com categoria dependency e retryable=true — nunca o genérico
 *     ENGINEERING_TOOL_ERROR.
 * R3: apenas falhas de TIMEOUT (SIGTERM/SIGKILL, err.killed) mapeiam para
 *     GATE_TIMEOUT; outras falhas do spawn (ENOENT etc.) passam intocadas.
 *
 * Determinístico: zero rede, zero spawn de missão real. O estouro REAL do wrapper
 * (callHandler com orçamento curto contra handler bloqueante) é prova E2E no
 * script e2e-rd-close-timeout-01.ts — não aqui.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyErrorCode, buildErrorEnvelope } from '../src/errorEnvelope.ts';
import {
  MISSION_CLOSE_HANDLER_TIMEOUT_MS,
  isWrapperTimeoutError,
  gateTimeoutError,
} from '../src/missionOps.ts';

test('R1: wrapper budget do mission.close é >= 300s', () => {
  assert.ok(MISSION_CLOSE_HANDLER_TIMEOUT_MS >= 300_000,
    `budget=${MISSION_CLOSE_HANDLER_TIMEOUT_MS} deve ser >= 300000ms`);
});

test('R2: GATE_TIMEOUT é tipado no ERROR-01 (dependency, retryable)', () => {
  const taxonomy = classifyErrorCode('GATE_TIMEOUT');
  assert.equal(taxonomy.category, 'dependency');
  assert.equal(taxonomy.retryable, true);
  assert.ok(taxonomy.remediation.length > 10, 'remediation must be a legible next step');
});

test('R2: envelope derivado da mensagem do estouro carrega GATE_TIMEOUT (não genérico)', () => {
  const err = gateTimeoutError('handle_mission_close', 300_000, new Error('killed'));
  assert.match(err.message, /^GATE_TIMEOUT:/);
  const envelope = buildErrorEnvelope({ message: err.message, tool: 'engineering.mission.close' });
  assert.equal(envelope.code, 'GATE_TIMEOUT');
  assert.notEqual(envelope.code, 'ENGINEERING_TOOL_ERROR');
  assert.equal(envelope.retryable, true);
});

test('R3: isWrapperTimeoutError distingue estouro (killed/SIGTERM) de outras falhas', () => {
  assert.equal(isWrapperTimeoutError({ killed: true, signal: 'SIGTERM' }), true);
  assert.equal(isWrapperTimeoutError({ killed: false, signal: null, code: 'ENOENT' }), false);
  assert.equal(isWrapperTimeoutError(new Error('spawn python3 ENOENT')), false);
  assert.equal(isWrapperTimeoutError(null), false);
  assert.equal(isWrapperTimeoutError(undefined), false);
});

test('R3: gateTimeoutError preserva handler, budget e causa na mensagem', () => {
  const err = gateTimeoutError('handle_mission_close', 300_000, new Error('Command was killed with SIGTERM'));
  assert.ok(err.message.includes('handle_mission_close'));
  assert.ok(err.message.includes('300000'));
  assert.ok(err.message.includes('Command was killed with SIGTERM'));
});