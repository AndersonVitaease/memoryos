/**
 * GH-05 — Worker: executes ONE bounded action and returns result + evidence.
 * The Worker never decides the mission outcome, never expands permissions,
 * budget or channels; it only runs the action body the accepted plan carries.
 * Status derivation reuses the certified GH-04A error markers so the Guardian
 * classifies worker failures exactly as it classifies runtime failures.
 */
import { Evidence } from './missionTypes.js';
import { HARD_ERROR_PATTERNS, TRANSIENT_ERROR_PATTERNS } from './guards.js';
import { isWorkerSpecialization, WorkerSpecialization } from './workerSpecialization.js';
import { ActionExecutionContext, PlanAction, WorkerOutput, WorkerResult } from './multiAgentTypes.js';

export type WorkerActionStatus = 'ok' | 'fail' | 'transient' | 'hard';

/**
 * SP-01 — deterministic transport gate for specialization provenance: a valid
 * taxonomy member travels; anything else is treated as ABSENT (never throws,
 * never infers, never routes). Metadata only — no model, no prompt, no tool,
 * no scheduling input.
 */
function specializationOf(action: PlanAction): WorkerSpecialization | undefined {
  const raw = action.specialization;
  return isWorkerSpecialization(raw) ? raw : undefined;
}

/**
 * SP-01 — provenance annotation: every Evidence produced by this action
 * carries the action's specialization (shallow copies — the worker's own
 * output objects are never mutated). Evidence of actions without a valid
 * specialization passes through UNCHANGED (legacy-identical).
 */
function annotateSpecialization(evidence: Evidence[], action: PlanAction): Evidence[] {
  const specialization = specializationOf(action);
  if (!specialization) return evidence;
  return evidence.map((item) => ({ ...item, specialization }));
}

/** Deterministic status from the action's own evidence (GH-04A markers). */
export function classifyWorkerStatus(evidence: Evidence[]): WorkerActionStatus {
  const textOf = (item: Evidence): string => `${item.key} ${item.value ?? ''}`.toLowerCase();
  const failItems = evidence.filter((e) => e.status === 'fail');
  if (failItems.some((e) => HARD_ERROR_PATTERNS.some((p) => textOf(e).includes(p)))) return 'hard';
  if (failItems.some((e) => TRANSIENT_ERROR_PATTERNS.some((p) => textOf(e).includes(p)))) return 'transient';
  if (failItems.length > 0) return 'fail';
  return 'ok';
}

export class WorkerAgent {
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  /**
   * Perform exactly one bounded action. Never rejects: an exception from the
   * action body becomes fail evidence (classified like any other failure).
   * Cost is what the action reports (default 0) — never invented here.
   *
   * PRÉ-GH-07 (role context budget): the worker context carries ONLY this
   * action's minimum sufficient context (description, dependencies, resources,
   * mode, expected evidence) plus the contract authorization verbatim.
   * Never the mission transcript, never other workers' results.
   */
  async perform(
    action: PlanAction,
    now: () => number = this.now,
    missionContext?: { allowedActions?: readonly string[]; forbiddenActions?: readonly string[] },
  ): Promise<WorkerResult> {
    const startMs = now();
    const ctx: ActionExecutionContext = {
      actionId: action.id,
      now,
      dependsOn: Object.freeze([...(action.dependsOn ?? [])]),
      expectedEvidence: Object.freeze([...(action.expectedEvidence ?? [])]),
      ...(action.description !== undefined ? { actionDescription: action.description } : {}),
      // HARDENING-02 — structured input verbatim (objects frozen): the action
      // runs the advisor's exact command, it never guesses one.
      ...(action.input !== undefined
        ? {
            actionInput:
              typeof action.input === 'object' && action.input !== null
                ? Object.freeze(action.input)
                : action.input,
          }
        : {}),
      ...(action.resourceKeys ? { resourceKeys: Object.freeze([...action.resourceKeys]) } : {}),
      ...(action.mode ? { mode: action.mode } : {}),
      ...(missionContext?.allowedActions ? { allowedActions: Object.freeze([...missionContext.allowedActions]) } : {}),
      ...(missionContext?.forbiddenActions ? { forbiddenActions: Object.freeze([...missionContext.forbiddenActions]) } : {}),
      // SP-01 — provenance metadata transport (valid member only; absent otherwise).
      ...(specializationOf(action) ? { specialization: specializationOf(action) } : {}),
    };
    try {
      const output: WorkerOutput = await action.run(ctx);
      const rawEvidence = output.evidence ?? [];
      const endMs = now();
      return {
        actionId: action.id,
        status: classifyWorkerStatus(rawEvidence),
        started: true,
        startMs,
        endMs,
        evidence: annotateSpecialization(rawEvidence, action),
        costUsd: output.costUsd ?? 0,
      };
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 160);
      const endMs = now();
      const syntheticEvidence: Evidence[] = [
        {
          type: 'command_result',
          key: `worker:error:${action.id}`,
          status: 'fail',
          value: message,
          timestamp: endMs,
          source: 'worker',
        },
      ];
      return {
        actionId: action.id,
        status: classifyWorkerStatus(syntheticEvidence),
        started: true,
        startMs,
        endMs,
        evidence: annotateSpecialization(syntheticEvidence, action),
        costUsd: 0,
        error: message,
      };
    }
  }
}
