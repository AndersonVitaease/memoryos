// CertificationRules.ts — Sprint EF-39.6
// All certification gates defined in one place.
// Nothing is hardcoded in the dashboard or auditors.

import { CertificationConfig } from "./CertificationConfig";

export interface CertificationRule {
  readonly id:          string;
  readonly description: string;
  readonly evaluate:    (evidence: CertificationEvidence) => boolean;
  readonly failMessage: (evidence: CertificationEvidence) => string;
}

export interface CertificationEvidence {
  readonly testsPassed:          number;
  readonly testsTotal:           number;
  readonly integrityPassed:      number;
  readonly integrityTotal:       number;
  readonly immutabilityPassed:   number;
  readonly immutabilityTotal:    number;
  readonly solidPassed:          number;
  readonly solidTotal:           number;
  readonly structuralPassed:     number;
  readonly structuralTotal:      number;
  readonly sourceCritical:       number;
  readonly sourceErrors:         number;
  readonly hasCircularDeps:      boolean;
  readonly architectureScore:    number;
  readonly codeSmellCount:       number;
  readonly avgBenchmarkMs:       number;
}

// ── Rules ─────────────────────────────────────────────────────────────────────
const RequireAllTests: CertificationRule = Object.freeze({
  id:          "RequireAllTests",
  description: "All tests must pass",
  evaluate:    (e) => e.testsPassed === e.testsTotal,
  failMessage: (e) => `Tests: ${e.testsPassed}/${e.testsTotal}`,
});

const RequireIntegrity: CertificationRule = Object.freeze({
  id:          "RequireIntegrity",
  description: "All integrity checks must pass",
  evaluate:    (e) => e.integrityPassed === e.integrityTotal,
  failMessage: (e) => `Integrity: ${e.integrityPassed}/${e.integrityTotal}`,
});

const RequireImmutability: CertificationRule = Object.freeze({
  id:          "RequireImmutability",
  description: "All immutability checks must pass",
  evaluate:    (e) => e.immutabilityPassed === e.immutabilityTotal,
  failMessage: (e) => `Immutability: ${e.immutabilityPassed}/${e.immutabilityTotal}`,
});

const RequireSOLID: CertificationRule = Object.freeze({
  id:          "RequireSOLID",
  description: "All SOLID checks must pass",
  evaluate:    (e) => e.solidPassed === e.solidTotal,
  failMessage: (e) => `SOLID: ${e.solidPassed}/${e.solidTotal}`,
});

const RequireStructural: CertificationRule = Object.freeze({
  id:          "RequireStructural",
  description: "All structural checks must pass",
  evaluate:    (e) => e.structuralPassed === e.structuralTotal,
  failMessage: (e) => `Structural: ${e.structuralPassed}/${e.structuralTotal}`,
});

const MaximumCriticalFindings: CertificationRule = Object.freeze({
  id:          "MaximumCriticalFindings",
  description: "Zero critical source findings allowed",
  evaluate:    (e) => e.sourceCritical === 0,
  failMessage: (e) => `Source critical findings: ${e.sourceCritical}`,
});

const MaximumErrors: CertificationRule = Object.freeze({
  id:          "MaximumErrors",
  description: "Zero source errors allowed",
  evaluate:    (e) => e.sourceErrors === 0,
  failMessage: (e) => `Source errors: ${e.sourceErrors}`,
});

const RequireNoCircularDependencies: CertificationRule = Object.freeze({
  id:          "RequireNoCircularDependencies",
  description: "No circular dependencies allowed",
  evaluate:    (e) => !e.hasCircularDeps,
  failMessage: (_e) => "Circular dependencies detected",
});

const MinimumArchitectureScore: CertificationRule = Object.freeze({
  id:          "MinimumArchitectureScore",
  description: `Architecture score must be >= ${CertificationConfig.minimumScore}`,
  evaluate:    (e) => e.architectureScore >= CertificationConfig.minimumScore,
  failMessage: (e) => `Score ${e.architectureScore} < ${CertificationConfig.minimumScore} required`,
});

// ── Registry ──────────────────────────────────────────────────────────────────
export const CERTIFICATION_RULES: readonly CertificationRule[] = Object.freeze([
  RequireAllTests,
  RequireIntegrity,
  RequireImmutability,
  RequireSOLID,
  RequireStructural,
  MaximumCriticalFindings,
  MaximumErrors,
  RequireNoCircularDependencies,
  MinimumArchitectureScore,
]);

export function evaluateRules(evidence: CertificationEvidence): {
  certified: boolean;
  failedGates: readonly string[];
} {
  const failedGates: string[] = [];
  for (const rule of CERTIFICATION_RULES) {
    if (!rule.evaluate(evidence)) {
      failedGates.push(rule.failMessage(evidence));
    }
  }
  return Object.freeze({ certified: failedGates.length === 0, failedGates: Object.freeze(failedGates) });
}