/**
 * AcceptanceValidator.ts — Sprint 6.3.2
 * Determines if a sprint is READY based on assertion results
 */

import type { AcceptanceAssertionResult, AcceptanceCriterion } from "./EAFTypes";

export interface ValidationResult {
  ready: boolean;
  score: number;      // 0-100, mandatory-only
  confidence: number; // 0-100, all criteria
  blockers: string[];
  mandatoryPassed: number;
  mandatoryTotal: number;
  optionalPassed: number;
  optionalTotal: number;
}

export class AcceptanceValidator {
  validate(
    assertions: AcceptanceAssertionResult[],
    criteria: AcceptanceCriterion[]
  ): ValidationResult {
    const mandatory = criteria.filter(c => c.mandatory);
    const optional  = criteria.filter(c => !c.mandatory);

    const mandatoryPassed = mandatory.filter(c => {
      const a = assertions.find(r => r.criterionId === c.id);
      return a?.status === "PASS";
    }).length;

    const optionalPassed = optional.filter(c => {
      const a = assertions.find(r => r.criterionId === c.id);
      return a?.status === "PASS";
    }).length;

    const blockers = assertions
      .filter(a => a.status === "FAIL" || a.status === "BLOCKED")
      .map(a => `[${a.category}] ${a.description}: ${a.detail}`);

    const score = mandatory.length > 0
      ? Math.round((mandatoryPassed / mandatory.length) * 100)
      : 100;

    const total = criteria.length;
    const totalPassed = mandatoryPassed + optionalPassed;
    const confidence = total > 0 ? Math.round((totalPassed / total) * 100) : 100;

    const ready = blockers.length === 0 && score === 100;

    return {
      ready,
      score,
      confidence,
      blockers,
      mandatoryPassed,
      mandatoryTotal: mandatory.length,
      optionalPassed,
      optionalTotal: optional.length,
    };
  }
}