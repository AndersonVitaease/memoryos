/**
 * LearningPolicy.ts — Sprint EF-51
 *
 * SRP: fornecer e validar a política de aprendizado.
 * Imutável. Sem efeitos colaterais.
 */

import type { LearningPolicy, CandidatePattern } from "./CLTypes";
import { DEFAULT_LEARNING_POLICY } from "./CLTypes";

export class LearningPolicyEngine {
  private _policy: LearningPolicy;

  constructor(policy: Partial<LearningPolicy> = {}) {
    this._policy = Object.freeze({ ...DEFAULT_LEARNING_POLICY, ...policy });
  }

  get policy(): LearningPolicy {
    return this._policy;
  }

  /** Returns true if learning is globally enabled. */
  isEnabled(): boolean {
    return this._policy.learningEnabled;
  }

  /** Evaluate whether a CandidatePattern passes the policy gates. */
  evaluate(pattern: CandidatePattern): { approved: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const p = this._policy;

    if (pattern.frequency < p.minimumPatternFrequency) {
      reasons.push(`frequency ${pattern.frequency} < minimum ${p.minimumPatternFrequency}`);
    }
    if (pattern.successRate < p.minimumSuccessRate && pattern.kind !== "failure_pattern" && pattern.kind !== "error_pattern" && pattern.kind !== "anti_pattern") {
      reasons.push(`successRate ${(pattern.successRate * 100).toFixed(1)}% < minimum ${(p.minimumSuccessRate * 100).toFixed(1)}%`);
    }
    if (pattern.avgConfidence < p.minimumConfidence) {
      reasons.push(`avgConfidence ${(pattern.avgConfidence * 100).toFixed(1)}% < minimum ${(p.minimumConfidence * 100).toFixed(1)}%`);
    }
    if (pattern.avgAuthority < p.minimumAuthority) {
      reasons.push(`avgAuthority ${(pattern.avgAuthority * 100).toFixed(1)}% < minimum ${(p.minimumAuthority * 100).toFixed(1)}%`);
    }
    if (pattern.supportingEpisodeIds.length < p.minimumEpisodes) {
      reasons.push(`episodes ${pattern.supportingEpisodeIds.length} < minimum ${p.minimumEpisodes}`);
    }
    if (pattern.generalizationScore < p.minimumGeneralizationScore) {
      reasons.push(`generalizationScore ${(pattern.generalizationScore * 100).toFixed(1)}% < minimum ${(p.minimumGeneralizationScore * 100).toFixed(1)}%`);
    }

    return { approved: reasons.length === 0, reasons };
  }

  /** Merge overrides and return a new engine (immutable). */
  withOverrides(overrides: Partial<LearningPolicy>): LearningPolicyEngine {
    return new LearningPolicyEngine({ ...this._policy, ...overrides });
  }
}