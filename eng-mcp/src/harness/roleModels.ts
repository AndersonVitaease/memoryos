/**
 * PRÉ-GH-07 — Role model configuration. The Guardian/config is the SOLE
 * authority over model selection: a role never chooses, never swaps and never
 * requests a model — models travel one-way from configuration into the
 * runtime seam. NO generic model router: a fixed role -> identifier mapping,
 * configurable per role, with real integration-supported identifiers as
 * defaults.
 *
 * Default identifiers (REAL, integration-supported — never invented):
 * - advisor:    z-ai/glm-5.3-flash (OpenRouter; certified in GH-03A.3 as
 *               ANTHROPIC_DEFAULT_SONNET_MODEL; cheap/fast planning role).
 * - supervisor: z-ai/glm-5.3-flash (OpenRouter; certified in GH-03A.3 as
 *               ANTHROPIC_DEFAULT_OPUS_MODEL). SANDBOX-RESUME-01 2026-09-12:
 *               tried in the 5-case EVIDENCE-template audit — gaps detected
 *               correctly (FALSE_GAPS=0, MISSED_GAPS=0) with one known
 *               deviation (case C recommended CONTINUE instead of RECOVER;
 *               RECOMMENDATION_MATCHES=4/5). SUPERVISOR-FLASH-SWITCH-01
 *               2026-09-12: operator decision — switch ACCEPTED WITH THAT
 *               KNOWN DEVIATION (SUPERVISOR_FLASH_ACCEPTED_WITH_KNOWN_DEVIATION=YES),
 *               no prompt/governance tuning, no re-audit. Supervisor stays
 *               ADVISORY; CompletionGuard stays the final deterministic
 *               authority.
 * - worker:     nvidia/nemotron-3-super-120b-a12b (verified against the
 *               OpenRouter catalog on 2026-09-11; low-cost bounded execution
 *               role). No Nemotron id existed anywhere in the repository or
 *               operator config before this adjustment — this is the declared
 *               initial configuration, overridable per role.
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
  advisor: 'z-ai/glm-5.3-flash',
  supervisor: 'z-ai/glm-5.3-flash',
  worker: 'nvidia/nemotron-3-super-120b-a12b',
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
