/**
 * SP-02 — Specialized worker profiles: HOW a specialized Worker executes, never
 * WHAT it may do. A profile is execution guidance bounded by the mission's
 * existing authority — it can prioritize capabilities, restrict behavior and
 * demand better evidence, but it can NEVER expand permission, channel, budget,
 * toolset, sandbox boundary or contract semantics
 * (SPECIALIZATION MAY RESTRICT OR GUIDE; SPECIALIZATION MUST NEVER EXPAND AUTHORITY).
 *
 * SPECIALIZATION != MODEL (SP-01 principle carried through): a profile binds
 * to NO model — the worker model is resolved externally by roleModels and is
 * identical for every specialization. No model slug appears anywhere here.
 *
 * Minimal canonical surface (anti-overengineering): 5 frozen profiles + 1
 * deterministic resolver + 1 prompt-block builder. No registry, no factory
 * hierarchy, no plugin system, no new agent — the base worker prompt stays
 * common and the profile is a delimited complement appended to it.
 */
import { isWorkerSpecialization, WorkerSpecialization } from './workerSpecialization.js';

export interface WorkerSpecializationProfile {
  readonly specialization: WorkerSpecialization;
  /** Execution instructions for this domain (guidance, never authority). */
  readonly instructions: readonly string[];
  /** What REAL proof this domain should produce (guidance only — the
   * CompletionGuard keeps deciding from status 'ok' + criterion key). */
  readonly evidenceGuidance: readonly string[];
}

export const WORKER_SPECIALIZATION_PROFILES: Readonly<
  Record<WorkerSpecialization, WorkerSpecializationProfile>
> = Object.freeze({
  CODE: Object.freeze({
    specialization: 'CODE',
    instructions: Object.freeze([
      'Understand the existing implementation before changing it; locate the relevant references first.',
      'Analyze impact across files; preserve existing contracts and behavior that must not change.',
      'Make the minimal change; no unrequested refactoring.',
      'Distinguish reading, modifying and validating; validate the change only where the mission authorizes it.',
    ]),
    evidenceGuidance: Object.freeze([
      'Relevant files/snippets read; the change performed (when any); the validation result; the observed impact; the real error when one exists.',
    ]),
  }),
  TEST: Object.freeze({
    specialization: 'TEST',
    instructions: Object.freeze([
      'Be adversarial: reproduce behavior, validate criteria and hunt for false PASS.',
      'Test regression, not only the happy path; distinguish expected vs observed.',
      'Never change the implementation just to make a test pass; record reproducible failures.',
      'A correct implementation does not imply a correct test — question the test itself.',
    ]),
    evidenceGuidance: Object.freeze([
      'The command/test executed; expected vs observed; pass/fail; how to reproduce; regression notes when applicable.',
    ]),
  }),
  INFRA: Object.freeze({
    specialization: 'INFRA',
    instructions: Object.freeze([
      'Observe the real state before acting; identify the correct host/container/process.',
      'Distinguish configuration from runtime; verify logs/health/status.',
      'Never infer a deploy succeeded from the command being sent; post-validate when execution was authorized.',
    ]),
    evidenceGuidance: Object.freeze([
      'The real target; the state before; the observed action; the state after; relevant health/status/log output.',
    ]),
  }),
  DATA: Object.freeze({
    specialization: 'DATA',
    instructions: Object.freeze([
      'Work from the real schema, migrations, queries, constraints and relations; never infer structure that does not exist.',
      'Guard integrity and persistence semantics; distinguish reading from mutating.',
    ]),
    evidenceGuidance: Object.freeze([
      'The schema/query/migration observed; the relevant object/table/field; the observed result; integrity/constraint notes when applicable.',
    ]),
  }),
  RESEARCH: Object.freeze({
    specialization: 'RESEARCH',
    instructions: Object.freeze([
      'Locate the relevant information; distinguish primary sources from inference.',
      'Compare evidence; never conclude beyond support; record uncertainty explicitly.',
      'Answer the mission criterion — do not research indefinitely; stay read-only unless authority explicitly says otherwise.',
    ]),
    evidenceGuidance: Object.freeze([
      'The source/reference; the finding; its relation to the criterion; limitations/uncertainty.',
    ]),
  }),
});

/** Deterministic profile resolution: invalid/absent -> undefined (legacy). */
export function resolveWorkerSpecializationProfile(
  specialization: unknown,
): WorkerSpecializationProfile | undefined {
  return isWorkerSpecialization(specialization)
    ? WORKER_SPECIALIZATION_PROFILES[specialization]
    : undefined;
}

/** Header line of the delimited prompt complement (test anchor). */
export const SPECIALIZATION_PROMPT_HEADER = 'SPECIALIZATION PROFILE';

/**
 * The delimited prompt complement: BASE worker prompt + this block. Empty
 * string when absent so a legacy worker prompt stays byte-identical. The block
 * states its own non-authority in the first line.
 */
export function workerSpecializationPromptBlock(
  profile: WorkerSpecializationProfile | undefined,
): string {
  if (!profile) return '';
  return [
    `${SPECIALIZATION_PROMPT_HEADER}: ${profile.specialization} (execution guidance only — it grants no permission, channel, budget or tool)`,
    'CAPABILITY GUIDANCE: use only the tools and channels the mission contract already authorizes; prioritize this profile focus within that authority. AUTHORIZATION remains the source of truth.',
    'INSTRUCTIONS:',
    ...profile.instructions.map((line) => `- ${line}`),
    'EVIDENCE GUIDANCE (guidance only; proof still comes from real evidence):',
    ...profile.evidenceGuidance.map((line) => `- ${line}`),
    'END SPECIALIZATION PROFILE',
  ].join('\n');
}
