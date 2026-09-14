/**
 * PRÉ-GH-07 — Role model configuration. The Guardian/config is the SOLE
 * authority over model selection: a role never chooses, never swaps and never
 * requests a model — models travel one-way from configuration into the
 * runtime seam. NO generic model router: a fixed role -> identifier mapping,
 * configurable per role, with real integration-supported identifiers as
 * defaults.
 *
 * Default identifiers (REAL, integration-supported — never invented):
 * - advisor:    openai/gpt-oss-120b (OpenRouter; certified in
 *               GUARDIAN-ADVISOR-LOW-COST-CANDIDATE-DISCOVERY-01 2026-09-12 —
 *               audit 5/5, all counters 0, DIRECT_JSON; promoted by
 *               GUARDIAN-ADVISOR-GPT-OSS-120B-PROMOTION-01 2026-09-12 from
 *               z-ai/glm-5.3-flash, the previous cheap/fast planning role
 *               certified in GH-03A.3).
 * - supervisor: nex-agi/nex-n2.5-pro:free (OpenRouter free route; certified in
 *               GUARDIAN-SUPERVISOR-FREE-SHOOTOUT-01 2026-09-12 — 5-case
 *               EVIDENCE-template audit: RECOMMENDATION_MATCH=5/5,
 *               FALSE_GAPS=0, MISSED_GAPS=0, FALSE_COMPLETE=0, CALL_ERRORS=0,
 *               TIMEOUTS=0; contract-compatible, PAID_FALLBACK_USED=NO).
 *               Promoted by GUARDIAN-SUPERVISOR-NEX-PROMOTION-01 2026-09-12
 *               from z-ai/glm-5.3-flash (flash history: 4/5 with case C
 *               deviation, SUPERVISOR_FLASH_ACCEPTED_WITH_KNOWN_DEVIATION=YES).
 *               Supervisor stays ADVISORY; CompletionGuard stays the final
 *               deterministic authority.
 * - worker:     openai/gpt-oss-120b (OpenRouter paid route; catalog pricing
 *               $0.037/M input, $0.17/M output). Promoted by
 *               GUARDIAN-WORKER-GPTOSS-STRUCTURAL-01 2026-09-13 (ETAPA 1)
 *               from nvidia/nemotron-3-super-120b-a12b:free, based on the
 *               GUARDIAN-WORKER-PARALLEL-READS-01/02 measurements: the :free
 *               route failed 10/15 runs on upstream errors (67%) while
 *               gpt-oss-120b completed 6/6 with 0 upstream failures, 18%
 *               fewer turns and ~$0.006 real provider cost per mission.
 *               Overridable per role; NO COSTLY FALLBACK unchanged — if the
 *               route rejects the workload (rate limit, error, timeout) the
 *               exact error surfaces as evidence; the runtime never silently
 *               moves to another model.
 *
 * NO COSTLY FALLBACK: a missing/blank override keeps the declared default for
 * that role; a role's override never borrows another role's model; nothing
 * ever upgrades a role to a more expensive model automatically.
 */
export interface RoleModels {
  advisor: string;
  supervisor: string;
  worker: string;
}

export type AgentRole = keyof RoleModels;

export const DEFAULT_ROLE_MODELS: RoleModels = {
  advisor: 'openai/gpt-oss-120b',
  supervisor: 'nex-agi/nex-n2.5-pro:free',
  worker: 'openai/gpt-oss-120b',
};

/** Environment variables the operator/Guardian config uses per role. */
export const ROLE_MODEL_ENV_VARS: Readonly<Record<AgentRole, string>> = {
  advisor: 'GUARDIAN_ADVISOR_MODEL',
  supervisor: 'GUARDIAN_SUPERVISOR_MODEL',
  worker: 'GUARDIAN_WORKER_MODEL',
};

/**
 * Resolve role models from the Guardian's configuration (env): per-role
 * override, default otherwise. Never a cross-role fallback, never an
 * automatic move to a more expensive model.
 */
export function resolveRoleModels(env?: NodeJS.ProcessEnv | undefined): RoleModels {
  const source = env ?? process.env;
  const models: RoleModels = { ...DEFAULT_ROLE_MODELS };
  for (const role of Object.keys(models) as AgentRole[]) {
    const raw = source[ROLE_MODEL_ENV_VARS[role]];
    if (typeof raw === 'string' && raw.trim().length > 0) {
      models[role] = raw.trim();
    }
  }
  return models;
}
