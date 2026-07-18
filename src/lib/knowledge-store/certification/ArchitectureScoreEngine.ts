// ArchitectureScoreEngine.ts — Sprint EF-39.6
// Isolated score computation. Receives only evidence, never raw audit objects.
// Dashboard never computes scores — it only renders what this engine returns.

import { CertificationConfig } from "./CertificationConfig";

export interface ScoreEvidence {
  readonly testsPassed:          number;
  readonly testsTotal:           number;
  readonly solidPassed:          number;
  readonly solidTotal:           number;
  readonly immutabilityPassed:   number;
  readonly immutabilityTotal:    number;
  readonly integrityPassed:      number;
  readonly integrityTotal:       number;
  readonly codeSmellCount:       number;
  readonly sourceFindings:       number;   // critical + errors
  readonly avgBenchmarkMs:       number;
  readonly hasCircularDeps:      boolean;
}

export interface ArchitectureScore {
  readonly score:       number;  // 0–100
  readonly grade:       "A+" | "A" | "B" | "C" | "D" | "F";
  readonly breakdown:   Readonly<{
    tests:             number;
    solid:             number;
    immutability:      number;
    integrity:         number;
    codeSmells:        number;
    sourceCleanliness: number;
    performance:       number;
    dependencies:      number;
  }>;
  readonly verdict:     "CERTIFIED" | "CERTIFICATION FAILED";
  readonly failedGates: readonly string[];
}

export const ArchitectureScoreEngine = Object.freeze({
  compute(evidence: ScoreEvidence): ArchitectureScore {
    const { weights, grades, perfScore } = CertificationConfig;

    const pct = (n: number, d: number) => d === 0 ? 100 : Math.round((n / d) * 100);

    const tests             = pct(evidence.testsPassed,        evidence.testsTotal);
    const solid             = pct(evidence.solidPassed,        evidence.solidTotal);
    const immutability      = pct(evidence.immutabilityPassed, evidence.immutabilityTotal);
    const integrity         = pct(evidence.integrityPassed,    evidence.integrityTotal);
    const codeSmells        = Math.max(0, 100 - evidence.codeSmellCount * 5);
    const sourceCleanliness = Math.max(0, 100 - evidence.sourceFindings * 15);
    const performance       =
      evidence.avgBenchmarkMs < perfScore.excellent ? 100 :
      evidence.avgBenchmarkMs < perfScore.good       ?  90 :
      evidence.avgBenchmarkMs < perfScore.acceptable ?  75 : 50;
    const dependencies      = evidence.hasCircularDeps ? 0 : 100;

    const score = Math.round(
      tests             * weights.tests             +
      solid             * weights.solid             +
      immutability      * weights.immutability      +
      integrity         * weights.integrity         +
      codeSmells        * weights.codeSmells        +
      sourceCleanliness * weights.sourceCleanliness +
      performance       * weights.performance       +
      dependencies      * weights.dependencies
    );

    const grade: ArchitectureScore["grade"] =
      score >= grades.aPlus ? "A+" :
      score >= grades.a     ? "A"  :
      score >= grades.b     ? "B"  :
      score >= grades.c     ? "C"  :
      score >= grades.d     ? "D"  : "F";

    // Gates are evaluated separately by CertificationRules — failedGates here is for display
    const failedGates: string[] = [];
    if (evidence.testsPassed        < evidence.testsTotal)       failedGates.push(`Tests: ${evidence.testsPassed}/${evidence.testsTotal}`);
    if (evidence.immutabilityPassed < evidence.immutabilityTotal) failedGates.push(`Immutability: ${evidence.immutabilityPassed}/${evidence.immutabilityTotal}`);
    if (evidence.integrityPassed    < evidence.integrityTotal)    failedGates.push(`Integrity: ${evidence.integrityPassed}/${evidence.integrityTotal}`);
    if (evidence.sourceFindings     > 0)                          failedGates.push(`Source findings: ${evidence.sourceFindings}`);
    if (evidence.hasCircularDeps)                                 failedGates.push("Circular dependencies detected");
    if (score < CertificationConfig.minimumScore)                 failedGates.push(`Score ${score} < ${CertificationConfig.minimumScore} required`);

    return Object.freeze({
      score,
      grade,
      breakdown: Object.freeze({ tests, solid, immutability, integrity, codeSmells, sourceCleanliness, performance, dependencies }),
      verdict:   failedGates.length === 0 ? "CERTIFIED" : "CERTIFICATION FAILED",
      failedGates: Object.freeze(failedGates),
    });
  },
});