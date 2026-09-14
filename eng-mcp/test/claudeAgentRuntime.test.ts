/**
 * GH-02 - ClaudeAgentRuntime tests (T1-T14). Deterministic: every SDK call is a
 * fake query factory injected into the runtime - no real Claude Agent SDK call,
 * no network, no paid API usage in this suite. T14 re-proves the certified
 * GH-01 Guardian invariants (resume, completion verdict, budgets) through the
 * official SDK runtime seam; the full GH-01 suite keeps running untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ClaudeAgentRuntime,
  ClaudeAgentRuntimeError,
  DEFAULT_AUTHORIZED_EXECUTION_CHANNELS,
  DEFAULT_ENG_MCP_SERVER_URL,
  DEFAULT_ENG_MCP_TOKEN_ENV_VAR,
  type ClaudeQueryOptions,
  type QueryFn,
} from '../src/harness/ClaudeAgentRuntime.js';
import { GuardianHarness } from '../src/harness/GuardianHarness.js';
import {
  createInitialState,
  type AgentRuntime,
  type MissionContract,
} from '../src/harness/missionTypes.js';

type SdkMessageFixture = Record<string, unknown>;

interface CapturedCall {
  prompt: string;
  options?: ClaudeQueryOptions;
}

function systemInit(sessionId: string): SdkMessageFixture {
  return { type: 'system', subtype: 'init', session_id: sessionId };
}

function assistantToolUse(sessionId: string, id: string, name: string, input: unknown): SdkMessageFixture {
  return { type: 'assistant', session_id: sessionId, message: { content: [{ type: 'tool_use', id, name, input }] } };
}

function userToolResult(sessionId: string, toolUseId: string, isError: boolean): SdkMessageFixture {
  return { type: 'user', session_id: sessionId, message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: isError }] } };
}

function resultMessage(sessionId: string, subtype: string, costUsd: number, isError: boolean): SdkMessageFixture {
  return { type: 'result', subtype, session_id: sessionId, is_error: isError, total_cost_usd: costUsd };
}

function fakeQueryFromScripts(scripts: SdkMessageFixture[][]): { query: QueryFn; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const query: QueryFn = (params) => {
    calls.push({ prompt: params.prompt, options: params.options });
    const messages = scripts[Math.min(calls.length - 1, scripts.length - 1)];
    const iterator = (async function* generate(): AsyncGenerator<SdkMessageFixture, void, unknown> {
      for (const message of messages) yield message;
    })();
    return Object.assign(iterator, { interrupt: async () => undefined });
  };
  return { query, calls };
}

function minimalContract(missionId: string): MissionContract {
  return {
    missionId,
    objective: `execute ${missionId}`,
    allowedActions: ['channel:eng-mcp'],
    completionCriteria: ['claude-agent-sdk:result:success'],
    maxCycles: 3,
    maxDurationMs: 60_000,
  };
}

test('T1: ClaudeAgentRuntime implements the AgentRuntime seam structurally', async () => {
  const { query } = fakeQueryFromScripts([[resultMessage('sess-1', 'success', 0, false)]]);
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const target: AgentRuntime = runtime;
  assert.ok(runtime instanceof ClaudeAgentRuntime);
  for (const method of ['runMission', 'continueMission', 'cancelMission', 'getEvidence'] as const) {
    assert.strictEqual(typeof target[method], 'function');
  }
});

test('T2: runMission transforms the MissionContract into an official SDK session call', async () => {
  const { query, calls } = fakeQueryFromScripts([[
    systemInit('sess-2'),
    assistantToolUse('sess-2', 'tu-2', 'engineering.file.read', { path: 'a.ts' }),
    userToolResult('sess-2', 'tu-2', false),
    resultMessage('sess-2', 'success', 0.02, false),
  ]]);
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract: MissionContract = {
    missionId: 'gh02-t2',
    objective: 'read a.ts with evidence',
    allowedFiles: ['a.ts'],
    allowedActions: ['channel:eng-mcp'],
    forbiddenActions: ['deploy'],
    completionCriteria: ['file_read:a.ts'],
    maxCycles: 3,
    maxDurationMs: 60_000,
  };
  const state = createInitialState(contract, 1000);
  const result = await runtime.runMission(contract, state);
  assert.strictEqual(calls.length, 1);
  const call = calls[0];
  assert.ok(call.prompt.includes('MISSION gh02-t2'));
  assert.ok(call.prompt.includes('OBJECTIVE: read a.ts with evidence'));
  assert.ok(call.prompt.includes('file_read:a.ts'));
  assert.ok(call.prompt.includes('- a.ts'));
  assert.ok(call.prompt.includes('- deploy'));
  assert.strictEqual(call.options?.mcpServers?.['eng-mcp']?.type, 'http');
  assert.strictEqual(call.options?.mcpServers?.['eng-mcp']?.url, DEFAULT_ENG_MCP_SERVER_URL);
  assert.ok(call.options?.systemPrompt?.includes('GUARDIAN VERIFIES'));
  assert.strictEqual(result.strategy, 'claude-agent-sdk');
  assert.ok(result.steps.includes('tool_use:engineering.file.read'));
  assert.ok(result.evidence.some((e) => e.type === 'tool_result' && e.key.startsWith('tool:engineering.file.read:') && e.status === 'ok'));
  assert.strictEqual(result.costUsd, 0.02);
  assert.strictEqual(result.claimsComplete, undefined);
});

test('T3: continueMission reuses the recorded SDK session via official resume option', async () => {
  const { query, calls } = fakeQueryFromScripts([
    [systemInit('sess-A'), resultMessage('sess-A', 'success', 0.01, false)],
    [systemInit('sess-A'), resultMessage('sess-A', 'success', 0.01, false)],
  ]);
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract = minimalContract('gh02-t3');
  const state = createInitialState(contract, 1000);
  await runtime.runMission(contract, state);
  const resumed = await runtime.continueMission(contract, state);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].options?.resume, undefined);
  assert.strictEqual(calls[1].options?.resume, 'sess-A');
  assert.ok(calls[1].prompt.includes('MODE: resume'));
  assert.strictEqual(resumed.costUsd, 0.01);
});

test('T4: cancelMission interrupts the active official query mechanism', async () => {
  const calls: CapturedCall[] = [];
  let interruptCalls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const query: QueryFn = (params) => {
    calls.push({ prompt: params.prompt, options: params.options });
    const iterator = (async function* generate(): AsyncGenerator<SdkMessageFixture, void, unknown> {
      yield systemInit('sess-4');
      await gate;
    })();
    return Object.assign(iterator, {
      interrupt: async () => { interruptCalls += 1; release(); return undefined; },
    });
  };
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract = minimalContract('gh02-t4');
  const state = createInitialState(contract, 1000);
  const running = runtime.runMission(contract, state);
  await new Promise<void>((resolve) => setImmediate(resolve));
  await runtime.cancelMission(contract, state);
  const result = await running;
  assert.strictEqual(interruptCalls, 1);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(result.strategy, 'claude-agent-sdk');
  assert.strictEqual(result.claimsComplete, undefined);
});

test('T5: getEvidence returns Guardian-format Evidence[] including the SDK session', async () => {
  const { query } = fakeQueryFromScripts([[systemInit('sess-5'), resultMessage('sess-5', 'success', 0, false)]]);
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract = minimalContract('gh02-t5');
  const state = createInitialState(contract, 1000);
  const result = await runtime.runMission(contract, state);
  const evidence = await runtime.getEvidence(contract, { ...state, evidence: result.evidence });
  assert.ok(evidence.length >= 2);
  for (const item of evidence) {
    assert.strictEqual(typeof item.type, 'string');
    assert.strictEqual(typeof item.key, 'string');
    assert.ok(item.status === 'ok' || item.status === 'fail' || item.status === 'unknown');
    assert.strictEqual(typeof item.timestamp, 'number');
    assert.strictEqual(typeof item.source, 'string');
  }
  const sessionEvidence = evidence.find((e) => e.type === 'command_result' && e.key === 'claude-agent-sdk:session');
  assert.ok(sessionEvidence);
  assert.strictEqual(sessionEvidence.status, 'ok');
  assert.strictEqual(sessionEvidence.value, 'sess-5');
});

test('T6: the runtime never sets claimsComplete even on a success result', async () => {
  const { query } = fakeQueryFromScripts([[
    systemInit('sess-6'),
    assistantToolUse('sess-6', 'tu-6', 'eng.file.read', { path: 'a.ts' }),
    userToolResult('sess-6', 'tu-6', false),
    resultMessage('sess-6', 'success', 0.01, false),
  ]]);
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract = minimalContract('gh02-t6');
  const state = createInitialState(contract, 1000);
  const result = await runtime.runMission(contract, state);
  assert.strictEqual(result.claimsComplete, undefined);
  assert.strictEqual(result.strategy, 'claude-agent-sdk');
});

test('T7: NoProgressGuard stays authoritative over a repeating SDK agent', async () => {
  const repeating = [
    systemInit('sess-7'),
    assistantToolUse('sess-7', 'tu-7', 'eng.file.read', { path: 'same.ts' }),
    userToolResult('sess-7', 'tu-7', false),
    resultMessage('sess-7', 'error_max_turns', 0.01, true),
  ];
  const { query, calls } = fakeQueryFromScripts([repeating]);
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract: MissionContract = {
    missionId: 'gh02-t7',
    objective: 'no-progress probe',
    completionCriteria: ['never:satisfied'],
    maxCycles: 5,
    maxDurationMs: 600_000,
    maxNoProgressCycles: 2,
  };
  const harness = new GuardianHarness(contract, runtime);
  const outcome = await harness.run();
  assert.strictEqual(outcome.status, 'BLOCKED');
  assert.ok(outcome.reason?.startsWith('no_progress_limit_reached(2/2)'));
  assert.strictEqual(calls.length, 3);
});

test('T8: maxCycles budget is Guardian-owned (the runtime cannot bypass it)', async () => {
  let cycle = 0;
  const query: QueryFn = () => {
    cycle += 1;
    const sessionId = `sess-8-${cycle}`;
    const iterator = (async function* generate(): AsyncGenerator<SdkMessageFixture, void, unknown> {
      yield systemInit(sessionId);
      yield assistantToolUse(sessionId, `tu-8-${cycle}`, 'eng.file.read', { path: `step-${cycle}.ts` });
      yield userToolResult(sessionId, `tu-8-${cycle}`, false);
      yield resultMessage(sessionId, 'success', 0.01, false);
    })();
    return Object.assign(iterator, { interrupt: async () => undefined });
  };
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract: MissionContract = {
    missionId: 'gh02-t8',
    objective: 'cycle budget probe',
    completionCriteria: ['never:satisfied'],
    maxCycles: 2,
    maxDurationMs: 600_000,
  };
  const harness = new GuardianHarness(contract, runtime);
  const outcome = await harness.run();
  assert.strictEqual(outcome.status, 'BLOCKED');
  assert.strictEqual(outcome.reason, 'max_cycles_exhausted(2/2)');
});

test('T9: maxDurationMs budget is Guardian-owned (injected deterministic clock)', async () => {
  let clock = 1000;
  const query: QueryFn = () => {
    clock += 2000; // each SDK cycle advances the injected clock
    const iterator = (async function* generate(): AsyncGenerator<SdkMessageFixture, void, unknown> {
      yield systemInit('sess-9');
      yield resultMessage('sess-9', 'success', 0, false);
    })();
    return Object.assign(iterator, { interrupt: async () => undefined });
  };
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract: MissionContract = {
    missionId: 'gh02-t9',
    objective: 'duration budget probe',
    completionCriteria: ['never:satisfied'],
    maxCycles: 10,
    maxDurationMs: 1500,
  };
  const harness = new GuardianHarness(contract, runtime, { now: () => clock });
  const outcome = await harness.run();
  assert.strictEqual(outcome.status, 'BLOCKED');
  assert.strictEqual(outcome.reason, 'max_duration_exceeded(2000ms>1500ms)');
});

test('T10: maxCostUsd budget is Guardian-owned (SDK total_cost_usd flows through)', async () => {
  let cycle = 0;
  const query: QueryFn = () => {
    cycle += 1;
    const sessionId = `sess-10-${cycle}`;
    const iterator = (async function* generate(): AsyncGenerator<SdkMessageFixture, void, unknown> {
      yield systemInit(sessionId);
      yield assistantToolUse(sessionId, `tu-10-${cycle}`, 'eng.file.read', { path: `step-${cycle}.ts` });
      yield userToolResult(sessionId, `tu-10-${cycle}`, false);
      yield resultMessage(sessionId, 'success', 5, false);
    })();
    return Object.assign(iterator, { interrupt: async () => undefined });
  };
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract: MissionContract = {
    missionId: 'gh02-t10',
    objective: 'cost budget probe',
    completionCriteria: ['never:satisfied'],
    maxCycles: 10,
    maxDurationMs: 600_000,
    maxCostUsd: 5,
  };
  const harness = new GuardianHarness(contract, runtime);
  const outcome = await harness.run();
  assert.strictEqual(outcome.status, 'BLOCKED');
  assert.strictEqual(outcome.reason, 'max_cost_exceeded(10>5)');
});

test('T11: unauthorized execution channel fails closed before any SDK call', async () => {
  const { query, calls } = fakeQueryFromScripts([[resultMessage('sess-11', 'success', 0, false)]]);
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract: MissionContract = {
    missionId: 'gh02-t11',
    objective: 'channel enforcement probe',
    allowedActions: ['channel:openai-mcp'],
    completionCriteria: [],
    maxCycles: 1,
    maxDurationMs: 60_000,
  };
  const state = createInitialState(contract, 1000);
  await assert.rejects(
    runtime.runMission(contract, state),
    (error: unknown) => error instanceof ClaudeAgentRuntimeError && error.code === 'UNAUTHORIZED_EXECUTION_CHANNEL',
  );
  await assert.rejects(
    runtime.getEvidence(contract, state),
    (error: unknown) => error instanceof ClaudeAgentRuntimeError && error.code === 'UNAUTHORIZED_EXECUTION_CHANNEL',
  );
  assert.strictEqual(calls.length, 0);
});

test('T12: ENG-MCP channel is configurable (endpoint, channels list, defaults)', async () => {
  const { query, calls } = fakeQueryFromScripts([[resultMessage('sess-12', 'success', 0, false)]]);
  const runtime = new ClaudeAgentRuntime({
    queryFactory: query,
    env: {},
    engMcpServerUrl: 'https://eng-mcp-staging.example.test/mcp',
    authorizedExecutionChannels: ['eng-mcp', 'eng-mcp-staging'],
  });
  const contract = minimalContract('gh02-t12');
  await runtime.runMission(contract, createInitialState(contract, 1000));
  assert.strictEqual(calls[0].options?.mcpServers?.['eng-mcp']?.url, 'https://eng-mcp-staging.example.test/mcp');
  const { query: defaultQuery, calls: defaultCalls } = fakeQueryFromScripts([[resultMessage('sess-12b', 'success', 0, false)]]);
  const defaultRuntime = new ClaudeAgentRuntime({ queryFactory: defaultQuery, env: {} });
  const defaultContract = minimalContract('gh02-t12b');
  await defaultRuntime.runMission(defaultContract, createInitialState(defaultContract, 1000));
  assert.strictEqual(defaultCalls[0].options?.mcpServers?.['eng-mcp']?.url, DEFAULT_ENG_MCP_SERVER_URL);
  assert.deepStrictEqual([...DEFAULT_AUTHORIZED_EXECUTION_CHANNELS], ['eng-mcp']);
});

test('T13: no secret is ever persisted by the runtime (env-only, in-memory headers)', async () => {
  const { query, calls } = fakeQueryFromScripts([[systemInit('sess-13'), resultMessage('sess-13', 'success', 0.01, false)]]);
  const fakeToken = 'gh02-fake-bearer-SECRET-123';
  process.env[DEFAULT_ENG_MCP_TOKEN_ENV_VAR] = fakeToken;
  try {
    const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: process.env });
    const contract = minimalContract('gh02-t13');
    const state = createInitialState(contract, 1000);
    const result = await runtime.runMission(contract, state);
    const evidence = await runtime.getEvidence(contract, { ...state, evidence: result.evidence });
    const authorization = calls[0].options?.mcpServers?.['eng-mcp']?.headers?.Authorization ?? '';
    assert.ok(authorization.startsWith('Bearer '));
    assert.ok(authorization.includes(fakeToken)); // mounted in memory for the call only
    const persistedArtifacts = [
      JSON.stringify(result),
      JSON.stringify(evidence),
      JSON.stringify({ ...state, evidence: result.evidence }),
    ];
    for (const artifact of persistedArtifacts) {
      assert.ok(!artifact.includes(fakeToken));
    }
  } finally {
    delete process.env[DEFAULT_ENG_MCP_TOKEN_ENV_VAR];
  }
});

test('T14: GH-01 invariants hold through the SDK runtime seam (resume + Guardian verdict)', async () => {
  const { query, calls } = fakeQueryFromScripts([
    [systemInit('sess-14'), resultMessage('sess-14', 'error_max_turns', 0.01, true)],
    [
      systemInit('sess-14'),
      assistantToolUse('sess-14', 'tu-14', 'eng.file.read', { path: 'b.ts' }),
      userToolResult('sess-14', 'tu-14', false),
      resultMessage('sess-14', 'success', 0.01, false),
    ],
  ]);
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract: MissionContract = {
    missionId: 'gh02-t14',
    objective: 'gh01 invariants through the official SDK seam',
    completionCriteria: ['claude-agent-sdk:result:success'],
    maxCycles: 4,
    maxDurationMs: 600_000,
  };
  const harness = new GuardianHarness(contract, runtime);
  const outcome = await harness.run();
  assert.strictEqual(outcome.status, 'PASS'); // the Guardian decides, from evidence
  assert.strictEqual(harness.getState().cycle, 2);
  assert.strictEqual(harness.getState().spentCostUsd, 0.02);
  assert.strictEqual(calls[1].options?.resume, 'sess-14'); // official resume path used
  assert.strictEqual(calls[1].prompt.includes('gh02-t14'), true);
});

// ===== GH-03A.4 — closure: allowedTools on the normal query() path =====

test('GH-03A.4/T15: contract allowedTools reach the query() boundary (no runner injection; BATCH-30 appended once)', async () => {
  const { query, calls } = fakeQueryFromScripts([[systemInit('sess-15'), resultMessage('sess-15', 'success', 0, false)]]);
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract: MissionContract = {
    ...minimalContract('gh03a4-t15'),
    allowedTools: ['mcp__eng-mcp__engineering_vps_doctor', 'mcp__eng-mcp__engineering_file_read'],
  };
  await runtime.runMission(contract, createInitialState(contract, 1000));
  assert.strictEqual(calls.length, 1);
  // BATCH-30 + SBW-02 — as únicas exceções verbatim: orchestrate.batch e
  // sandbox.batchWrite anexados 1× (a lista do contrato passa verbatim;
  // nada além dos batches é acrescentado).
  assert.deepStrictEqual(
    calls[0].options?.allowedTools,
    ['mcp__eng-mcp__engineering_vps_doctor', 'mcp__eng-mcp__engineering_file_read', 'engineering_orchestrate_batch', 'engineering_sandbox_batchWrite'],
  );
  assert.ok(calls[0].prompt.includes('ALLOWED TOOLS:'));
  assert.ok(calls[0].prompt.includes('- mcp__eng-mcp__engineering_vps_doctor'));
  // SBW-02 elicitation fix — surfacing ensina a GRAFIA COMPLETA do SDK
  // (mcp__eng-mcp__<tool>); allowedTools continua no nome curto (duality).
  assert.ok(calls[0].prompt.includes('- mcp__eng-mcp__engineering_orchestrate_batch (runtime-authorized'));
  assert.ok(calls[0].prompt.includes('- mcp__eng-mcp__engineering_sandbox_batchWrite (runtime-authorized'));
  // authorizedExecutionChannels preserved untouched:
  assert.strictEqual(calls[0].options?.mcpServers?.['eng-mcp']?.type, 'http');
});

test('GH-03A.4/T16: unauthorized tool stays denied (absent from allowedTools; Bash/Edit never freed)', async () => {
  const { query, calls } = fakeQueryFromScripts([[systemInit('sess-16'), resultMessage('sess-16', 'success', 0, false)]]);
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract: MissionContract = {
    ...minimalContract('gh03a4-t16'),
    allowedTools: ['mcp__eng-mcp__engineering_vps_doctor'],
  };
  await runtime.runMission(contract, createInitialState(contract, 1000));
  const allowed = calls[0].options?.allowedTools ?? [];
  assert.ok(allowed.includes('mcp__eng-mcp__engineering_vps_doctor'));
  for (const denied of ['Bash', 'Edit', 'mcp__eng-mcp__engineering_vps_change_safe']) {
    assert.ok(!allowed.includes(denied), `unauthorized tool must stay denied: ${denied}`);
  }
  // No contract tools -> the runtime unlocks nothing on its own:
  const { query: plainQuery, calls: plainCalls } = fakeQueryFromScripts([[systemInit('sess-16b'), resultMessage('sess-16b', 'success', 0, false)]]);
  const plainRuntime = new ClaudeAgentRuntime({ queryFactory: plainQuery, env: {} });
  const plainContract = minimalContract('gh03a4-t16b');
  await plainRuntime.runMission(plainContract, createInitialState(plainContract, 1000));
  assert.strictEqual(plainCalls[0].options?.allowedTools, undefined);
});
