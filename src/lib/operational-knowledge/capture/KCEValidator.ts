/**
 * KCEValidator.ts
 * Validates raw capture inputs before they enter the pipeline.
 *
 * Authority: ENGINEERING
 * SRP: Input validation only — no classification, no storage.
 * Sprint: KB-03
 */

import type { KCERawCapture } from "./KCETypes";

export interface KCEInputValidation {
  readonly valid:    boolean;
  readonly errors:   string[];
  readonly warnings: string[];
}

export const KCEValidator = Object.freeze({
  validate(raw: KCERawCapture): KCEInputValidation {
    const errors:   string[] = [];
    const warnings: string[] = [];

    if (!raw.title?.trim())    errors.push("title is required");
    if (!raw.what?.trim())     errors.push("what (description) is required");
    if (!raw.why?.trim())      errors.push("why (root cause) is required");
    if (!raw.how?.trim())      errors.push("how (solution) is required");
    if (!raw.outcome?.trim())  errors.push("outcome is required");
    if (!raw.capturedBy?.trim()) errors.push("capturedBy is required");
    if (!raw.capturedAt?.trim()) errors.push("capturedAt is required");

    if (raw.title?.length > 200)  errors.push("title exceeds 200 characters");
    if (raw.what?.length  > 5000) errors.push("what exceeds 5000 characters");

    if (!raw.sprint)    warnings.push("sprint not specified — journal entry will not be created");
    if (!raw.components?.length) warnings.push("no components specified — component index will be limited");
    if (!raw.tags?.length) warnings.push("no tags specified — discoverability may be reduced");

    return { valid: errors.length === 0, errors, warnings };
  },
});