/**
 * KnowledgeValidator.ts — Sprint EF-51
 *
 * SRP: validar KnowledgeRules candidate contra a LearningPolicy.
 *
 * Nenhum conhecimento pode ser promovido sem passar por aqui.
 * NÃO promove automaticamente (a menos que policy.automaticPromotion=true).
 * NÃO acessa conectores.
 */

import type { KnowledgeRule, ValidationResult, CandidatePattern, LearningPolicy } from "./CLTypes";
import { DEFAULT_LEARNING_POLICY } from "./CLTypes";

function score(actual: number, minimum: number): number {
  if (minimum <= 0) return 100;
  return Math.min(100, (actual / minimum) * 100);
}

export class KnowledgeValidator {
  private readonly _policy: LearningPolicy;

  constructor(policy: LearningPolicy = DEFAULT_LEARNING_POLICY) {
    this._policy = policy;
  }

  /**
   * Validate a KnowledgeRule against the policy.
   * Returns a ValidationResult with approved=true if all gates pass.
   */
  validate(rule: KnowledgeRule, pattern: CandidatePattern): ValidationResult {
    const p = this._policy;
    const rejectionReasons: string[] = [];

    const frequencyScore      = score(rule.frequency, p.minimumPatternFrequency);
    const confidenceScore     = score(rule.confidence, p.minimumConfidence);
    const successRateScore    = score(rule.successRate, p.minimumSuccessRate);
    const authorityScore      = score(rule.authority, p.minimumAuthority);
    const generalizationScore = score(rule.generalizationScore, p.minimumGeneralizationScore);

    if (rule.frequency < p.minimumPatternFrequency)
      rejectionReasons.push(`Frequency ${rule.frequency} < ${p.minimumPatternFrequency}`);
    if (rule.confidence < p.minimumConfidence)
      rejectionReasons.push(`Confidence ${(rule.confidence * 100).toFixed(1)}% < ${(p.minimumConfidence * 100).toFixed(1)}%`);

    // success rate gate only applies to non-failure patterns
    const isNegative = pattern.kind === "failure_pattern" || pattern.kind === "error_pattern";
    if (!isNegative && rule.successRate < p.minimumSuccessRate)
      rejectionReasons.push(`SuccessRate ${(rule.successRate * 100).toFixed(1)}% < ${(p.minimumSuccessRate * 100).toFixed(1)}%`);
    if (rule.authority < p.minimumAuthority)
      rejectionReasons.push(`Authority ${(rule.authority * 100).toFixed(1)}% < ${(p.minimumAuthority * 100).toFixed(1)}%`);
    if (rule.originEpisodeIds.length < p.minimumEpisodes)
      rejectionReasons.push(`Episodes ${rule.originEpisodeIds.length} < ${p.minimumEpisodes}`);
    if (rule.generalizationScore < p.minimumGeneralizationScore)
      rejectionReasons.push(`Generalization ${(rule.generalizationScore * 100).toFixed(1)}% < ${(p.minimumGeneralizationScore * 100).toFixed(1)}%`);

    const overallScore = Math.round(
      (frequencyScore + confidenceScore + successRateScore + authorityScore + generalizationScore) / 5,
    );

    return Object.freeze({
      patternId:            rule.patternId,
      approved:             rejectionReasons.length === 0,
      rejectionReasons:     Object.freeze(rejectionReasons),
      episodesChecked:      rule.originEpisodeIds.length,
      confidenceScore:      Math.round(confidenceScore),
      successRateScore:     Math.round(successRateScore),
      frequencyScore:       Math.round(frequencyScore),
      authorityScore:       Math.round(authorityScore),
      generalizationScore:  Math.round(generalizationScore),
      overallScore,
    });
  }

  /** Validate a batch. Returns only approved rules. */
  validateBatch(
    pairs: Array<{ rule: KnowledgeRule; pattern: CandidatePattern }>,
  ): Array<{ rule: KnowledgeRule; result: ValidationResult }> {
    return pairs
      .map(({ rule, pattern }) => ({ rule, result: this.validate(rule, pattern) }))
      .filter(({ result }) => result.approved);
  }
}