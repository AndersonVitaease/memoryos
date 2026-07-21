/**
 * PatternMiner.ts — Sprint EF-51
 *
 * SRP: detectar CandidatePatterns recorrentes a partir de AnalyzedEpisodes.
 *
 * NÃO valida padrões.
 * NÃO armazena no KnowledgeStore.
 * Somente minera e produz candidatos.
 */

import type { AnalyzedEpisode, CandidatePattern, PatternKind } from "./CLTypes";
import { makeCLId } from "./CLTypes";

interface PatternBucket {
  kind: PatternKind;
  signature: string;
  description: string;
  episodes: AnalyzedEpisode[];
}

function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function generalization(episodes: AnalyzedEpisode[]): number {
  // Diversity of intents and strategies → higher generalization
  const intents    = new Set(episodes.map(e => e.intent)).size;
  const strategies = new Set(episodes.map(e => e.strategy)).size;
  const goals      = new Set(episodes.map(e => e.goal)).size;
  const maxDiversity = Math.max(intents + strategies + goals, 1);
  return Math.min(maxDiversity / (episodes.length + 1), 1);
}

function buildCandidate(bucket: PatternBucket): CandidatePattern {
  const eps          = bucket.episodes;
  const successCount = eps.filter(e => e.outcomeLabel === "success").length;
  const failureCount = eps.filter(e => e.outcomeLabel === "failure").length;

  return Object.freeze({
    id:                   makeCLId("pat"),
    discoveredAt:         Date.now(),
    kind:                 bucket.kind,
    signature:            bucket.signature,
    description:          bucket.description,
    frequency:            eps.length,
    successCount,
    failureCount,
    successRate:          eps.length > 0 ? successCount / eps.length : 0,
    avgConfidence:        avg(eps.map(e => e.confidence)),
    avgAuthority:         avg(eps.map(e => e.authority)),
    avgCost:              avg(eps.map(e => e.cost)),
    avgDurationMs:        avg(eps.map(e => e.durationMs)),
    supportingEpisodeIds: Object.freeze(eps.map(e => e.episodeId)),
    generalizationScore:  generalization(eps),
  });
}

export class PatternMiner {
  /**
   * Mine all candidate patterns from analyzed episodes.
   * Returns patterns sorted by frequency (descending).
   */
  mine(episodes: readonly AnalyzedEpisode[]): readonly CandidatePattern[] {
    if (episodes.length === 0) return [];

    const buckets = new Map<string, PatternBucket>();

    const bucket = (key: string, kind: PatternKind, description: string, ep: AnalyzedEpisode) => {
      if (!buckets.has(key)) {
        buckets.set(key, { kind, signature: key, description, episodes: [] });
      }
      buckets.get(key)!.episodes.push(ep);
    };

    for (const ep of episodes) {
      // Pattern 1: capability_sequence
      if (ep.capabilitySignature) {
        bucket(
          `cap:${ep.capabilitySignature}`,
          "capability_sequence",
          `Capability sequence: ${ep.capabilitySignature}`,
          ep,
        );
      }

      // Pattern 2: goal_type
      bucket(
        `goal:${ep.goal}`,
        "goal_type",
        `Recurring goal type: ${ep.goal}`,
        ep,
      );

      // Pattern 3: execution_flow (strategy + capability)
      const flowKey = `flow:${ep.strategy}::${ep.capabilitySignature}`;
      bucket(
        flowKey,
        "execution_flow",
        `Execution flow: strategy=${ep.strategy} capabilities=${ep.capabilitySignature}`,
        ep,
      );

      // Pattern 4: success_pattern
      if (ep.outcomeLabel === "success") {
        bucket(
          `success:${ep.strategy}::${ep.intent}`,
          "success_pattern",
          `Success pattern: strategy=${ep.strategy} intent=${ep.intent}`,
          ep,
        );
      }

      // Pattern 5: failure_pattern
      if (ep.outcomeLabel === "failure") {
        bucket(
          `failure:${ep.strategy}::${ep.intent}`,
          "failure_pattern",
          `Failure pattern: strategy=${ep.strategy} intent=${ep.intent}`,
          ep,
        );
      }

      // Pattern 6: connector_chain
      if (ep.connectorSignature) {
        bucket(
          `conn:${ep.connectorSignature}`,
          "connector_chain",
          `Connector chain: ${ep.connectorSignature}`,
          ep,
        );
      }
    }

    return [...buckets.values()]
      .map(buildCandidate)
      .sort((a, b) => b.frequency - a.frequency);
  }
}