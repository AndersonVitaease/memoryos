/**
 * AntiPatternDetector.ts — Sprint EF-51
 *
 * SRP: detectar AntiPatterns a partir de CandidatePatterns com alto índice de falhas.
 */

import type { CandidatePattern, AntiPattern } from "./CLTypes";
import { makeCLId } from "./CLTypes";

const FAILURE_THRESHOLD = 0.6;  // 60%+ failures → anti-pattern candidate
const MIN_OCCURRENCES   = 2;

function severity(failureRate: number, frequency: number): AntiPattern["severity"] {
  if (failureRate >= 0.9 && frequency >= 5) return "critical";
  if (failureRate >= 0.8 && frequency >= 3) return "high";
  if (failureRate >= 0.7 && frequency >= 2) return "medium";
  return "low";
}

export class AntiPatternDetector {
  /**
   * Scan CandidatePatterns for anti-patterns.
   * Returns only patterns that qualify as anti-patterns.
   */
  detect(patterns: readonly CandidatePattern[]): readonly AntiPattern[] {
    return patterns
      .filter(p =>
        p.frequency >= MIN_OCCURRENCES &&
        (1 - p.successRate) >= FAILURE_THRESHOLD,
      )
      .map(p => {
        const failureRate = 1 - p.successRate;
        const caps = p.signature.includes("cap:")
          ? p.signature.replace("cap:", "").split("|")
          : [];
        const strategy = p.signature.includes("flow:")
          ? p.signature.replace("flow:", "").split("::")[0]
          : p.description;

        const ap: AntiPattern = Object.freeze({
          id:                   makeCLId("ap"),
          detectedAt:           Date.now(),
          patternId:            p.id,
          title:                `Anti-Pattern: ${p.description}`,
          description:          `Pattern fails ${(failureRate * 100).toFixed(1)}% of the time across ${p.frequency} executions.`,
          consecutiveFailures:  p.failureCount,
          totalFailures:        p.failureCount,
          strategy,
          capabilities:         Object.freeze(caps),
          recommendation:       `Avoid this pattern. Consider alternative strategies for: ${p.description}`,
          severity:             severity(failureRate, p.frequency),
        });
        return ap;
      });
  }
}