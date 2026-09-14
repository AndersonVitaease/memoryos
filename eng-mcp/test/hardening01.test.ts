/**
 * POST-CERT OPERATIONAL HARDENING — derived from REAL mission findings
 * (GLGPD-CERT-01/02), NOT a new certification wave (Guardian V1 stays frozen;
 * no GH-08). Deterministic: every SDK call is an injected fake query factory
 * — no real SDK call, no network, no paid API usage in this suite.
 *
 * Proofs:
 * - HARDENING-01 tool enforcement: the deterministic built-in complement
 *   (disallowedTools) removes unauthorized built-in DEFINITIONS; the official
 *   canUseTool hook denies anything else and turns every denial into audit
 *   evidence. WORKER_UNAUTHORIZED_TOOL_EXECUTED=0 by construction.
 * - HARDENING-02 structured action input: the advisor's exact input travels
 *   verbatim to ctx.actionInput (frozen), never merged into the objective.
 * - HARDENING-03 plan coverage (opt-in): a plan that cannot ever produce the
 *   remaining criteria's evidence is rejected BEFORE any worker starts.
 * - HARDENING-05 heartbeat: deterministic periodic MISSION ALIVE line — no
 *   LLM, no authority change; stops exactly when the mission finishes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ClaudeAgentRuntime,
  KNOWN_BUILTIN_TOOLS,
  disallowedBuiltinComplement,
  type ClaudeQueryOptions,
  type QueryFn,
} from '../src/harness/ClaudeAgentRuntime.js';
import { GuardianHarness } from '../src/harness/GuardianHarness.js';
import { MultiAgentRuntime } from '../src/harness/multiAgentRuntime.js';
import { ParallelWaveExecutor } from '../src/harness/parallelWaveExecutor.js';
import { classifyWorkerStatus, WorkerAgent } from '../src/harness/worker.js';
import { validatePlan, validatePlanCoverage } from '../src/harness/advisor.js';
import {
  createInitialState,
  type Evidence,
  type MissionContract,
} from '../src/harness/missionTypes.js';
import type { PlanAction } from '../src/harness/multiAgentTypes.js';

type SdkMessageFixture = Record<string, unknown>;

function systemInit(sessionId: string): SdkMessageFixture {
  return { type: 'system', subtype: 'init', session_id: sessionId };
}

function assistantToolUse(sessionId: string, id: string, name: string, input: unknown): SdkMessageFixture {
  return { type: 'assistant', session_id: sessionId, message: { content: [{ type: 'tool_use', id, name, input }] } };
}

function userToolResult(sessionId: string, toolUseId: string, isError: boolean, text?: string): SdkMessageFixture {
  const content: Record<string, unknown>[] = [{ type: 'tool_result', tool_use_id: toolUseId, is_error: isError }];
  if (text !== undefined) content[0].content = [{ type: 'text', text }];
  return { type: 'user', session_id: sessionId, message: { content } };
}

function resultMessage(sessionId: string, subtype: string, costUsd: number, isError: boolean): SdkMessageFixture {
  return { type: 'result', subtype, session_id: sessionId, is_error: isError, total_cost_usd: costUsd };
}

interface CapturedCall {
  prompt: string;
  options?: ClaudeQueryOptions;
}

/**
 * Fake SDK that HONORS the runtime enforcement like the official SDK does:
 * before "executing" any tool it consults options.canUseTool (awaited); a
 * deny never produces an ok tool_result — the tool provably never executed.
 */
function enforcingFakeQuery(
  scripts: Array<(hook: NonNullable<ClaudeQueryOptions['canUseTool']> | undefined) => Promise<SdkMessageFixture[]> | SdkMessageFixture[]>,
): { query: QueryFn; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const query: QueryFn = (params) => {
    calls.push({ prompt: params.prompt, options: params.options });
    const iterator = (async function* generate(): AsyncGenerator<SdkMessageFixture, void, unknown> {
      const messages = await scripts[Math.min(calls.length - 1, scripts.length - 1)](params.options?.canUseTool);
      for (const message of messages) yield message;
    })();
    return Object.assign(iterator, { interrupt: async () => undefined });
  };
  return { query, calls };
}

function mcpContract(missionId: string, allowedTools: string[] | undefined, criteria: string[]): MissionContract {
  return {
    missionId,
    objective: `hardening probe ${missionId}`,
    allowedActions: ['channel:eng-mcp'],
    ...(allowedTools !== undefined ? { allowedTools } : {}),
    completionCriteria: criteria,
    maxCycles: 3,
    maxDurationMs: 600_000,
  };
}

function okEv(key: string, value?: string): Evidence {
  return { type: 'command_result', key, status: 'ok', value, timestamp: 1, source: 'test' };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('waitUntil timeout');
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// ===== HARDENING-01 — tool enforcement =====

test('H1: MCP-only contract unlocks nothing natively — full built-in complement + verbatim allowedTools (+BATCH-30)', async () => {
  const { query, calls } = enforcingFakeQuery([() => [systemInit('sess-h1'), resultMessage('sess-h1', 'success', 0, false)]]);
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract = mcpContract('hard-h1', ['engineering_file_read'], ['claude-agent-sdk:result:success']);
  const result = await runtime.runMission(contract, createInitialState(contract, 1000));
  assert.strictEqual(calls.length, 1);
  const options = calls[0].options;
  // BATCH-30 + SBW-02 — as únicas adições runtime-layer; todo o resto verbatim
  assert.deepStrictEqual(options?.allowedTools, ['engineering_file_read', 'engineering_orchestrate_batch', 'engineering_sandbox_batchWrite']);
  assert.ok(options?.disallowedTools); // complement present
  assert.deepStrictEqual(
    [...(options?.disallowedTools ?? [])],
    [...disallowedBuiltinComplement(['engineering_file_read', 'engineering_orchestrate_batch', 'engineering_sandbox_batchWrite'])],
  );
  for (const forbiddenBuiltin of ['Bash', 'Glob', 'Grep']) {
    assert.ok(options?.disallowedTools?.includes(forbiddenBuiltin), `CERT-01 finding: ${forbiddenBuiltin} must be definition-removed`);
  }
  assert.strictEqual(options?.disallowedTools?.length, KNOWN_BUILTIN_TOOLS.length);
  assert.strictEqual(typeof options?.canUseTool, 'function');
  assert.strictEqual(result.strategy, 'claude-agent-sdk');
});

test('H2: canUseTool authorizes the contract tool in short AND full MCP spelling (CERT-02 duality)', async () => {
  const { query, calls } = enforcingFakeQuery([() => [systemInit('sess-h2'), resultMessage('sess-h2', 'success', 0, false)]]);
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract = mcpContract('hard-h2', ['engineering_file_read'], ['claude-agent-sdk:result:success']);
  await runtime.runMission(contract, createInitialState(contract, 1000));
  const hook = calls[0].options?.canUseTool;
  assert.ok(hook);
  const full = await hook('mcp__eng-mcp__engineering_file_read', { path: 'src/lib/app-params.js' });
  assert.strictEqual(full.behavior, 'allow');
  const short = await hook('engineering_file_read', {});
  assert.strictEqual(short.behavior, 'allow');
  const patch = await hook('mcp__eng-mcp__engineering_file_patch', { path: 'x' });
  assert.strictEqual(patch.behavior, 'deny'); // suffix guard: file_read != file_patch
});

test('H3: unauthorized tool attempt is denied BEFORE execution and recorded as audit evidence', async () => {
  const { query, calls } = enforcingFakeQuery([async (hook) => {
    // Official SDK semantics: consult canUseTool BEFORE executing the tool.
    const decision = hook ? await hook('Bash', { command: 'echo pwned' }) : { behavior: 'allow' as const };
    const messages: SdkMessageFixture[] = [
      systemInit('sess-h3'),
      assistantToolUse('sess-h3', 'tu-bash', 'Bash', { command: 'echo pwned' }),
    ];
    if (decision.behavior === 'deny') {
      messages.push(userToolResult('sess-h3', 'tu-bash', true, decision.message));
    } else {
      messages.push(userToolResult('sess-h3', 'tu-bash', false)); // would mean execution — never here
    }
    messages.push(resultMessage('sess-h3', 'success', 0.01, false));
    return messages;
  }]);
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract = mcpContract('hard-h3', ['engineering_file_read'], ['claude-agent-sdk:result:success']);
  const result = await runtime.runMission(contract, createInitialState(contract, 1000));
  assert.strictEqual(calls.length, 1);
  const audit = result.evidence.filter(
    (e) => e.source === 'tool-enforcement' && e.key.startsWith('tool_enforcement:Bash:') && e.status === 'ok',
  );
  assert.strictEqual(audit.length, 1, 'the denial must leave exactly one audit event');
  const parsed = JSON.parse(String(audit[0].value)) as {
    decision: string; toolRequested: string; toolAllowed: boolean; toolExecuted: boolean;
    reason: string; timestamp: number; missionId: string;
  };
  assert.strictEqual(parsed.decision, 'deny');
  assert.strictEqual(parsed.toolRequested, 'Bash');
  assert.strictEqual(parsed.toolAllowed, false);
  assert.strictEqual(parsed.toolExecuted, false); // WORKER_UNAUTHORIZED_TOOL_EXECUTED=0
  assert.strictEqual(parsed.reason, 'tool_not_in_contract_allowedTools');
  assert.strictEqual(typeof parsed.timestamp, 'number');
  assert.strictEqual(parsed.missionId, 'hard-h3');
  // The fake honored the deny: no successful Bash execution anywhere.
  assert.ok(!result.evidence.some((e) => e.type === 'tool_result' && e.key.startsWith('tool:Bash:') && e.status === 'ok'));
});

test('H4: the denial text is HARD-classified — fail evidence carrying it blocks (fail-closed chain)', () => {
  const message = 'UNAUTHORIZED_TOOL_DENIED_BY_CONTRACT: tool Bash is not in mission allowedTools';
  const failEvidence: Evidence[] = [{
    type: 'command_result', key: 'probe', status: 'fail', value: message, timestamp: 1, source: 'test',
  }];
  assert.strictEqual(classifyWorkerStatus(failEvidence), 'hard');
});

test('H5: contract WITHOUT allowedTools keeps certified behavior byte-identical (T16b)', async () => {
  const { query, calls } = enforcingFakeQuery([() => [systemInit('sess-h5'), resultMessage('sess-h5', 'success', 0, false)]]);
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract = mcpContract('hard-h5', undefined, ['claude-agent-sdk:result:success']);
  await runtime.runMission(contract, createInitialState(contract, 1000));
  assert.strictEqual(calls[0].options?.allowedTools, undefined);
  assert.strictEqual(calls[0].options?.disallowedTools, undefined);
  assert.strictEqual(calls[0].options?.canUseTool, undefined);
});

test('H12: end-to-end — a model-side unauthorized attempt NEVER executes and the Guardian BLOCKs', async () => {
  // Simulated stream: the model tries Bash; the SDK consults canUseTool; the
  // denial becomes the tool_result error text (like the official SDK does);
  // the stream then ends "successfully" — the tool provably never ran.
  const { query, calls } = enforcingFakeQuery([async (hook) => {
    const decision = hook ? await hook('Bash', { command: 'echo pwned' }) : { behavior: 'allow' as const };
    const messages: SdkMessageFixture[] = [systemInit('sess-h12')];
    if (decision.behavior === 'deny') {
      messages.push(assistantToolUse('sess-h12', 'tu-bash', 'Bash', { command: 'echo pwned' }));
      messages.push(userToolResult('sess-h12', 'tu-bash', true, decision.message));
      messages.push(resultMessage('sess-h12', 'success', 0.01, false));
    }
    return messages;
  }]);
  const runtime = new ClaudeAgentRuntime({ queryFactory: query, env: {} });
  const contract = mcpContract('hard-h12', ['engineering_file_read'], ['never:satisfied']);
  const harness = new GuardianHarness(contract, runtime);
  const outcome = await harness.run();
  assert.strictEqual(calls.length, 1); // BLOCKED in the first cycle — no retries
  assert.strictEqual(outcome.status, 'BLOCKED'); // fail-closed: hard classification
  const stateEvidence = outcome.state.evidence;
  assert.ok(stateEvidence.some((e) => e.source === 'tool-enforcement' && e.key.startsWith('tool_enforcement:Bash:')));
  assert.ok(!stateEvidence.some((e) => e.type === 'tool_result' && e.key.startsWith('tool:Bash:') && e.status === 'ok'));
});

// ===== HARDENING-02 — structured action input =====

test('H6: the worker receives the advisor input verbatim in ctx.actionInput (objects frozen)', async () => {
  const worker = new WorkerAgent(() => 1000);
  const captured: unknown[] = [];
  const input = { path: 'src/lib/app-params.js', repository: 'memoryos', maxLines: 250 };
  const action: PlanAction = {
    id: 'w1',
    dependsOn: [],
    input,
    expectedEvidence: ['w:w1:done'],
    run: async (ctx) => {
      captured.push(ctx.actionInput);
      return { evidence: [okEv('w:w1:done', 'read')] };
    },
  };
  const result = await worker.perform(action);
  assert.strictEqual(result.status, 'ok');
  assert.deepStrictEqual(captured[0], input); // VERBATIM
  assert.ok(Object.isFrozen(captured[0])); // immutable inside the worker
  let sawUndefined = false;
  const bare: PlanAction = {
    id: 'w2', dependsOn: [],
    run: async (ctx) => { sawUndefined = ctx.actionInput === undefined; return { evidence: [okEv('w:w2:done')] }; },
  };
  await worker.perform(bare);
  assert.ok(sawUndefined);
});

test('H7: validatePlan rejects non-JSON-serializable structured input at the plan gate', () => {
  const base = { planId: 'p', advisorId: 'a' };
  const fnAction = { id: 'w1', dependsOn: [], input: () => 'closure', run: async () => ({}) } as unknown as PlanAction;
  const dateAction = { id: 'w2', dependsOn: [], input: new Date('2026-01-01T00:00:00Z'), run: async () => ({}) } as PlanAction;
  assert.strictEqual(validatePlan({ ...base, actions: [fnAction] }).valid, false);
  assert.match(validatePlan({ ...base, actions: [fnAction] }).detail ?? '', /action_input_not_json_serializable:w1/);
  assert.strictEqual(validatePlan({ ...base, actions: [dateAction] }).valid, false);
  const good = { id: 'w3', dependsOn: [], input: { path: 'a', nested: { list: [1, 'x', null, true] } }, run: async () => ({}) } as PlanAction;
  assert.strictEqual(validatePlan({ ...base, actions: [good] }).valid, true);
});

// ===== HARDENING-03 — advisor plan coverage =====

test('H8: validatePlanCoverage — uncovered criteria reject the plan; satisfied criteria do not', () => {
  const contract = mcpContract('hard-h8', undefined, ['w:w1:done', 'w:w2:done']);
  const state = createInitialState(contract, 1000);
  const plan = (expected: string[][]) => ({
    planId: 'p', advisorId: 'a',
    actions: expected.map((keys, i) => ({ id: `a${i + 1}`, dependsOn: [], expectedEvidence: keys, run: async () => ({}) }) as PlanAction),
  });
  const complete = validatePlanCoverage(plan([['w:w1:done'], ['w:w2:done']]), contract, state);
  assert.strictEqual(complete.valid, true);
  const oneActionBoth = validatePlanCoverage(plan([['w:w1:done', 'w:w2:done']]), contract, state);
  assert.strictEqual(oneActionBoth.valid, true); // set-wise coverage: 1 action may cover 2 criteria
  const incomplete = validatePlanCoverage(plan([['w:w1:done']]), contract, state);
  assert.strictEqual(incomplete.valid, false);
  assert.match(incomplete.detail ?? '', /plan_incomplete_uncovered_criteria:w:w2:done/);
  // A criterion already satisfied by ok evidence is not required anymore:
  const satisfied = { ...state, evidence: [okEv('w:w2:done')] };
  assert.strictEqual(validatePlanCoverage(plan([['w:w1:done']]), contract, satisfied).valid, true);
});

test('H9: requirePlanCoverage=true — an 8/10-style plan is rejected BEFORE any worker starts', async () => {
  const contract = mcpContract('hard-h9', undefined, ['w:w1:done', 'w:w2:done']);
  const executed: string[] = [];
  const advisor = {
    proposePlan: () => ({
      planId: 'p1', advisorId: 'llm:test',
      actions: [{ id: 'w1', dependsOn: [], expectedEvidence: ['w:w1:done'], run: async () => { executed.push('w1'); return { evidence: [okEv('w:w1:done')] }; } }],
    }),
  };
  const runtime = new MultiAgentRuntime({ advisor, requirePlanCoverage: true });
  const result = await runtime.runMission(contract, createInitialState(contract, 1000));
  const gate = result.evidence.find((e) => e.key === 'multi_agent:plan_incomplete');
  assert.ok(gate);
  assert.strictEqual(gate.status, 'fail'); // PLAN_ACCEPTED=NO
  assert.match(String(gate.value), /plan_incomplete_uncovered_criteria:w:w2:done/);
  assert.strictEqual(executed.length, 0); // INCOMPLETE_PLAN_EXECUTED=NO
  assert.strictEqual(runtime.executionReports.length, 0); // no worker ever started
  // Default (opt-in flag absent) keeps the certified behavior: the plan runs.
  const legacy = new MultiAgentRuntime({ advisor });
  const legacyResult = await legacy.runMission(contract, createInitialState(contract, 1000));
  assert.strictEqual(executed.length, 1);
  assert.ok(legacyResult.evidence.some((e) => e.status === 'ok'));
});

// ===== HARDENING-05 — heartbeat =====

test('H10: executor emits deterministic progress snapshots (counters, never percentages)', async () => {
  const snapshots: Array<{
    phase: string; actionsTotal: number; actionsStarted: number; actionsCompleted: number;
    workersActive: number; workersCompleted: number; lastEvent: string; lastEventAgeMs: number;
  }> = [];
  const gates = [deferred(), deferred()];
  const executor = new ParallelWaveExecutor({
    maxParallelActions: 5,
    onProgress: (snapshot) => snapshots.push(snapshot),
  });
  const planPromise = executor.executePlan({
    planId: 'p', advisorId: 'a',
    actions: [1, 2].map((i) => ({
      id: `w${i}`, dependsOn: [], expectedEvidence: [`w:w${i}:done`],
      run: async () => { await gates[i - 1].promise; return { evidence: [okEv(`w:w${i}:done`)] }; },
    }) as PlanAction),
  });
  await waitUntil(() => snapshots.some((s) => s.workersActive === 2), 5000);
  gates.forEach((gate) => gate.resolve());
  const report = await planPromise;
  assert.strictEqual(report.maxObservedConcurrency, 2);
  assert.ok(snapshots.every((s) => s.phase === 'WORKERS'));
  assert.ok(snapshots.every((s) => s.actionsTotal === 2));
  assert.ok(snapshots.every((s) => typeof s.lastEventAgeMs === 'number' && s.lastEventAgeMs >= 0));
  assert.ok(snapshots.some((s) => s.lastEvent.startsWith('start:')));
  const final = snapshots[snapshots.length - 1];
  assert.strictEqual(final.actionsCompleted, 2);
  assert.strictEqual(final.workersCompleted, 2);
  assert.strictEqual(final.workersActive, 0);
  assert.match(final.lastEvent, /^end:w[12]:ok$/);
  assert.ok(!snapshots.some((s) => 'progressPercent' in s), 'honest counters only — no inferred percentages');
});

test('H11: harness heartbeat — MISSION ALIVE with no LLM, correct phase/workers, stops at finish', async () => {
  const lines: string[] = [];
  const gate = deferred();
  const contract = mcpContract('hard-h11', undefined, ['w:w1:done']);
  const advisor = {
    proposePlan: () => ({
      planId: 'p', advisorId: 'llm:test',
      actions: [{ id: 'w1', dependsOn: [], expectedEvidence: ['w:w1:done'], run: async () => {
        await gate.promise; // long mission: the heartbeat must prove liveness
        return { evidence: [okEv('w:w1:done', 'worker done')] };
      } }],
    }),
  };
  const runtime = new MultiAgentRuntime({ advisor });
  const harness = new GuardianHarness(contract, runtime, {
    heartbeat: { intervalMs: 1000, emit: (line) => lines.push(line) }, // first tick at 1s
  });
  const running = harness.run();
  await waitUntil(() => lines.length > 0, 5000); // first deterministic tick
  const alive = lines[0];
  assert.ok(alive.includes('MISSION ALIVE missionId=hard-h11'));
  assert.ok(alive.includes('phase=WORKERS'));
  assert.ok(alive.includes('elapsed='));
  assert.ok(alive.includes('workers_active=1'));
  assert.ok(alive.includes('workers_completed=0/1'));
  assert.ok(alive.includes('last_event=start:w1'));
  assert.ok(alive.includes('last_event_age='));
  assert.ok(alive.includes('next_expected='));
  gate.resolve(); // finish the mission
  const outcome = await running;
  const countAfterFinish = lines.length;
  await new Promise((resolve) => setTimeout(resolve, 1_200)); // > 1 interval
  assert.strictEqual(lines.length, countAfterFinish); // stops exactly at finish()
  assert.strictEqual(outcome.status, 'PASS'); // Guardian authority unchanged
  assert.strictEqual(outcome.state.blocker, undefined);
});
