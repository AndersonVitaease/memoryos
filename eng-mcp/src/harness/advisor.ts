/**
 * GH-05 — Advisor: receives objective/state and proposes a bounded plan.
 * The Advisor reasons and proposes; it NEVER governs: it cannot execute
 * mutations by its own authority, expand permissions/channels/budget, alter
 * the MissionContract or declare PASS. The Guardian Harness alone decides.
 * The view given to the Advisor is a frozen shallow copy of the mission state
 * so a proposal can never mutate the sovereign state.
 *
 * PRÉ-GH-07 (role context budget): the Advisor receives a STRATEGIC view —
 * objective (arg 1), summarized mission state and, when the contract is
 * provided, the contract's own constraints verbatim (completion criteria,
 * allowed files/actions, forbidden actions, cost cap). Known relevant errors
 * travel as lastError/lastClassification. Never a full transcript.
 */
import { MissionContract, MissionState } from './missionTypes.js';
import { PlanAction, PlanProposal, PlanValidation } from './multiAgentTypes.js';

/** Read-only view of the mission state handed to the Advisor/Supervisor. */
export type MissionStateView = Readonly<{
  missionId: string;
  cycle: number;
  completedSteps: readonly string[];
  remainingSteps: readonly string[];
  spentCostUsd?: number;
  lastError?: string;
  lastClassification?: MissionState['lastClassification'];
  /** PRÉ-GH-07 — strategic contract context, VERBATIM (never expanded). */
  completionCriteria?: readonly string[];
  allowedFiles?: readonly string[];
  allowedActions?: readonly string[];
  forbiddenActions?: readonly string[];
  maxCostUsd?: number;
}>;

export function frozenStateView(state: MissionState, contract?: MissionContract): MissionStateView {
  const base = {
    missionId: state.missionId,
    cycle: state.cycle,
    completedSteps: Object.freeze([...state.completedSteps]),
    remainingSteps: Object.freeze([...state.remainingSteps]),
    spentCostUsd: state.spentCostUsd,
    lastError: state.lastError,
    lastClassification: state.lastClassification,
  };
  if (!contract) return Object.freeze(base);
  return Object.freeze({
    ...base,
    completionCriteria: Object.freeze([...contract.completionCriteria]),
    allowedFiles: contract.allowedFiles ? Object.freeze([...contract.allowedFiles]) : undefined,
    allowedActions: contract.allowedActions ? Object.freeze([...contract.allowedActions]) : undefined,
    forbiddenActions: contract.forbiddenActions ? Object.freeze([...contract.forbiddenActions]) : undefined,
    maxCostUsd: contract.maxCostUsd,
  });
}

/**
 * PRÉ-GH-07 — wide waves: planning guidance the Guardian hands to LLM
 * advisors. GUARDIAN-WORKER-GPTOSS-STRUCTURAL-01 2026-09-13 (ETAPA 2):
 * independence is decided by REAL dependency only, never by action type —
 * sequential ONLY when (a) an action needs another action's RESULT to decide
 * what to do, or (b) both actions touch the SAME resource. Writes, tests and
 * other stateful operations are a SEPARATE action of their own (one action
 * per independent item) so the c20 executor can run them simultaneously.
 * Independent READS are the exception (BATCH-30, inverted from
 * GUARDIAN-WORKER-PARALLEL-READS-01/02 after AUDIT-ORCHESTRATE proved a
 * single read costs 12-35s wall, ~82% LLM inference): they are AGGREGATED
 * into one worker action calling engineering_orchestrate_batch (up to 30
 * operations, concurrent server-side) instead of one action per read.
 * Independent WRITES to different files are the second exception (SBW-02,
 * 2026-09-14): several independent file writes are ONE worker action running
 * the engineering_sandbox_batchWrite governed cycle (materialize, write up
 * to 10 operations, validate, sync — one approval, mandatory in-sandbox tsc
 * validation, per-file drift check) instead of one file.patch action per
 * file; writes that depend on another write's result, or touch the SAME
 * file, remain one action per item.
 * Dependencies are for REAL result/resource/transactional/budget/safety
 * reasons only — NEVER artificial staging. The Guardian/config owns this
 * guidance; an advisor can never opt out of DAG safety, and no code path
 * requires artificial dependencies.
 */
export const WIDE_WAVE_GUIDANCE =
  'Plan dependencies only for REAL dependencies: an action stays sequential ' +
  'ONLY when another action needs its RESULT to decide what to do, or both ' +
  'actions touch the SAME resource. Writes, tests and stateful operations ' +
  'become a SEPARATE action of their own: one action per independent item. ' +
  'Independent READS are different — aggregate them: a single worker action ' +
  // SBW-02 elicitation fix: the CALL spelling is the FULL SDK-registered name
  // mcp__eng-mcp__engineering_orchestrate_batch (server key 'eng-mcp' + dots
  // to underscores — same derivation as ORCHESTRATE_BATCH_TOOL_FULL in
  // ClaudeAgentRuntime; hardcoded here because advisor cannot import back).
  `calling mcp__eng-mcp__engineering_orchestrate_batch replaces up to 30 per-read actions ` +
  '(it accepts up to 30 operations of engineering.repo.structure, ' +
  'engineering.file.read, engineering.code.search, ' +
  'engineering.code.references, engineering.git.status and ' +
  'engineering.git.diff, executed concurrently server-side), so propose ONE ' +
  'batch action covering the independent reads instead of one action per ' +
  'read. Independent WRITES to DIFFERENT files aggregate the same way: a ' +
  'single worker action running the mcp__eng-mcp__engineering_sandbox_batchWrite governed ' +
  'cycle (materialize, write up to 10 {path, content} operations, validate, ' +
  'sync — one approval, mandatory in-sandbox tsc validation, per-file drift ' +
  'check) replaces one file.patch action per file; a write that depends on ' +
  'the result of another write, or a second write to the SAME file, remains ' +
  'one action per item. Prefer the widest wave: genuinely independent ' +
  'actions are proposed ' +
  'together as READY in a single wave (bounded by maxParallelActions), not ' +
  'chopped into serial waves of a few actions without a real reason — and ' +
  'never artificial staging.';

export interface AdvisorAgent {
  proposePlan(objective: string, state: MissionStateView): Promise<PlanProposal> | PlanProposal;
}

/**
 * HARDENING-02 — structured action input must survive verbatim transport
 * (JSON-shaped: plain objects/arrays/primitives only). A closure, a Date, a
 * Map or any class instance is rejected at plan validation — the input the
 * worker receives is exactly the input the advisor declared.
 */
function isJsonSerializable(value: unknown, depth = 0): boolean {
  if (depth > 16) return false;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (
    typeof value === 'bigint' ||
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'undefined'
  ) {
    return false;
  }
  if (Array.isArray(value)) return value.every((item) => isJsonSerializable(item, depth + 1));
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value) as unknown;
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.values(value as Record<string, unknown>).every((item) =>
      isJsonSerializable(item, depth + 1),
    );
  }
  return false;
}

/**
 * Deterministic structural validation of a proposal: unique non-empty ids,
 * resolvable dependencies, callable bodies, non-negative costs and cycle
 * freeness (Kahn). An invalid plan is never executed — it becomes fail
 * evidence for the Guardian to classify.
 */
export function validatePlan(proposal: PlanProposal): PlanValidation {
  if (!proposal || !Array.isArray(proposal.actions)) {
    return { valid: false, detail: 'proposal_missing_actions' };
  }
  const ids = new Set<string>();
  for (const action of proposal.actions) {
    if (typeof action.id !== 'string' || action.id.length === 0) {
      return { valid: false, detail: 'action_id_invalid' };
    }
    if (ids.has(action.id)) {
      return { valid: false, detail: `action_id_duplicated:${action.id}` };
    }
    if (typeof action.run !== 'function') {
      return { valid: false, detail: `action_run_missing:${action.id}` };
    }
    if (
      action.estimatedCostUsd !== undefined &&
      (typeof action.estimatedCostUsd !== 'number' || action.estimatedCostUsd < 0)
    ) {
      return { valid: false, detail: `action_cost_invalid:${action.id}` };
    }
    if (action.input !== undefined && !isJsonSerializable(action.input)) {
      return { valid: false, detail: `action_input_not_json_serializable:${action.id}` };
    }
    ids.add(action.id);
  }
  for (const action of proposal.actions) {
    for (const dep of action.dependsOn ?? []) {
      if (dep === action.id) {
        return { valid: false, detail: `dependency_self:${action.id}` };
      }
      if (!ids.has(dep)) {
        return { valid: false, detail: `dependency_unknown:${action.id}:${dep}` };
      }
    }
  }
  // Kahn's algorithm: a dependency cycle makes the plan unexecutable.
  const indegree = new Map<string, number>();
  for (const action of proposal.actions) indegree.set(action.id, action.dependsOn.length);
  const dependentsOf = new Map<string, string[]>();
  for (const action of proposal.actions) {
    for (const dep of action.dependsOn) {
      const list = dependentsOf.get(dep) ?? [];
      list.push(action.id);
      dependentsOf.set(dep, list);
    }
  }
  const queue = proposal.actions.filter((a) => a.dependsOn.length === 0).map((a) => a.id);
  let processed = 0;
  while (queue.length > 0) {
    const id = queue.shift() as string;
    processed += 1;
    for (const dependent of dependentsOf.get(id) ?? []) {
      const next = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }
  if (processed < proposal.actions.length) {
    const cyclic = proposal.actions
      .filter((a) => (indegree.get(a.id) ?? 0) > 0)
      .map((a) => a.id)
      .join(',');
    return { valid: false, detail: `dependency_cycle:${cyclic}` };
  }
  return { valid: true };
}

/**
 * HARDENING-03 — plan coverage: every completion criterion NOT yet satisfied
 * by current ok evidence must be reachable — i.e. appear in the
 * expectedEvidence of at least one proposed action — or the plan can never
 * produce the missing evidence (CERT-01 finding: 8 actions for 10 criteria).
 * Coverage is set-wise: one action legitimately covering several criteria is
 * fine; the check is what could ever satisfy the criteria, not 1:1 pairing.
 */
export function validatePlanCoverage(
  proposal: PlanProposal,
  contract: MissionContract,
  state: MissionState,
): PlanValidation {
  const okEvidenceKeys = new Set(
    state.evidence.filter((item) => item.status === 'ok').map((item) => item.key),
  );
  const uncovered = contract.completionCriteria.filter(
    (criterion) => !okEvidenceKeys.has(criterion),
  );
  if (uncovered.length === 0) return { valid: true };
  const expected = new Set<string>();
  for (const action of proposal.actions) {
    for (const key of action.expectedEvidence ?? []) expected.add(key);
  }
  const missing = uncovered.filter((criterion) => !expected.has(criterion));
  if (missing.length > 0) {
    return {
      valid: false,
      detail: `plan_incomplete_uncovered_criteria:${missing.join(',')}`,
    };
  }
  return { valid: true };
}

/**
 * Topological wave level of each action (memoized). Only meaningful on a
 * validated plan — a cycle throws PLAN_CYCLIC instead of looping forever.
 */
export function computeActionWaves(proposal: PlanProposal): Map<string, number> {
  const byId = new Map(proposal.actions.map((a) => [a.id, a] as const));
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const levelOf = (id: string): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) throw new Error(`PLAN_CYCLIC:${id}`);
    visiting.add(id);
    const action = byId.get(id) as PlanAction;
    const level = action.dependsOn.length === 0
      ? 0
      : 1 + Math.max(...action.dependsOn.map(levelOf));
    visiting.delete(id);
    memo.set(id, level);
    return level;
  };
  const waves = new Map<string, number>();
  for (const action of proposal.actions) waves.set(action.id, levelOf(action.id));
  return waves;
}
