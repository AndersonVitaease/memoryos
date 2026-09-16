/**
 * SP-01 — Worker specialization taxonomy: the ONE canonical representation of
 * a worker/supervisor specialization domain. It describes COMPETENCE/DOMAIN
 * only — it never knows a model, a provider, a prompt or a tool: binding a
 * specialization to an LLM is structurally impossible here (no import, no
 * string of any model id exists in this file).
 *
 * SPECIALIZATION != MODEL (architectural principle): model selection stays in
 * roleModels.ts, resolved per ROLE, never per specialization.
 *
 * SP-01 scope: taxonomy + optional transport metadata ONLY. This sprint does
 * NOT classify actions automatically, does NOT route workers, does NOT change
 * prompts/tools/permissions/scheduling. A specialization value travels as
 * provenance (action -> execution -> Evidence); it is never proof of
 * completion (SPECIALIZATION IS METADATA — CompletionGuard semantics keep
 * using status 'ok' + criterion key only).
 *
 * Transport rule (deterministic, no inference): a value that is not exactly
 * one of the five frozen members is treated as ABSENT — it never propagates
 * and never throws. The taxonomy is FROZEN at these five for SP-01; future
 * capabilities (SECURITY, FRONTEND, GIT, ...) may map onto these basic
 * classes later, never by growing this list ad hoc.
 */
export type WorkerSpecialization = 'CODE' | 'TEST' | 'INFRA' | 'DATA' | 'RESEARCH';

/** The complete frozen taxonomy (no other specialization exists in SP-01). */
export const WORKER_SPECIALIZATIONS: readonly WorkerSpecialization[] = Object.freeze([
  'CODE',
  'TEST',
  'INFRA',
  'DATA',
  'RESEARCH',
]);

/** Deterministic membership guard: the only gate for specialization transport. */
export function isWorkerSpecialization(value: unknown): value is WorkerSpecialization {
  return typeof value === 'string' && (WORKER_SPECIALIZATIONS as readonly string[]).includes(value);
}
