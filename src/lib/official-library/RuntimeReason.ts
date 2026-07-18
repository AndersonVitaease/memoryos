/**
 * RuntimeReason.ts — Sprint EF-7.2.5
 *
 * Single responsibility: explain why a provider was or was not selected.
 * Consumes IRuntimeProvider + RuntimeScoreResult + RuntimeEnvironmentType.
 *
 * EF-7.2.5 hardening:
 * - Never detects environment (consumed as parameter)
 * - Never calculates scores (consumed as parameter)
 * - Never accesses RuntimeRegistry
 * - Pure function module — zero imports with side effects
 *
 * SRP: explanation only.
 */

import type { IRuntimeProvider }       from "./IRuntimeProvider";
import type { RuntimeScoreResult }     from "./RuntimeScore";
import type { RuntimeEnvironmentType } from "./RuntimeEnvironment";

export interface RuntimeReasonResult {
  readonly runtimeId:    string;
  readonly runtimeName:  string;
  readonly selected:     boolean;
  readonly environment:  string;
  readonly reasons:      readonly string[];
  readonly warnings:     readonly string[];
  readonly confidence:   number;
  readonly summary:      string;
}

export const RuntimeReason = {

  explain(
    provider:    IRuntimeProvider,
    score:       RuntimeScoreResult,
    isSelected:  boolean,
    environment: RuntimeEnvironmentType = "Unknown"
  ): RuntimeReasonResult {
    const reasons: string[]  = [];
    const warnings: string[] = [];

    reasons.push(`Priority: ${provider.priority}`);
    reasons.push(`Environment: ${environment}`);
    reasons.push(`Available: ${provider.isAvailable}`);
    reasons.push(`Score: ${score.totalScore.toFixed(3)}`);

    if (isSelected)            reasons.push("Selected: highest score among registered providers");
    if (!provider.isAvailable) warnings.push(`Not available: ${provider.reason}`);
    if (provider.priority < 20) warnings.push("Low priority — stub or fallback provider");

    const summary = isSelected
      ? `Selected "${provider.runtimeName}" [${environment}] — priority=${provider.priority}, available=${provider.isAvailable}, score=${(score.confidence * 100).toFixed(0)}%`
      : `Not selected: "${provider.runtimeName}" — score=${(score.confidence * 100).toFixed(0)}%, available=${provider.isAvailable}`;

    return Object.freeze({
      runtimeId:   provider.runtimeId,
      runtimeName: provider.runtimeName,
      selected:    isSelected,
      environment,
      reasons:     Object.freeze([...reasons]),
      warnings:    Object.freeze([...warnings]),
      confidence:  score.confidence,
      summary,
    });
  },

  /** Explain all providers, marking which one is selected. */
  explainAll(
    providers:   IRuntimeProvider[],
    scores:      RuntimeScoreResult[],
    selectedId:  string,
    environment: RuntimeEnvironmentType = "Unknown"
  ): RuntimeReasonResult[] {
    return providers.map(p => {
      const s = scores.find(s => s.runtimeId === p.runtimeId) ?? {
        runtimeId: p.runtimeId, priority: p.priority, isAvailable: p.isAvailable,
        priorityScore: 0, availabilityScore: 0, environmentScore: 0, totalScore: 0, confidence: 0,
      };
      return RuntimeReason.explain(p, s, p.runtimeId === selectedId, environment);
    });
  },
};