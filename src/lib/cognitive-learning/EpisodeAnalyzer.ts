/**
 * EpisodeAnalyzer.ts — Sprint EF-51
 *
 * SRP: ler episódios produzidos pela EF-50 (read-only) e
 *      transformá-los em AnalyzedEpisodes enriquecidos.
 *
 * NÃO modifica episódios.
 * NÃO armazena estado persistente.
 * NÃO acessa conectores.
 */

import type { Episode, AnalyzedEpisode } from "./CLTypes";
import { makeCLId } from "./CLTypes";

function outcomeLabel(ep: Episode): "success" | "partial" | "failure" {
  if (ep.success && !ep.failure) return "success";
  if (ep.failure && !ep.success) return "failure";
  return "partial";
}

function buildCapabilitySignature(caps: readonly string[]): string {
  return [...caps].sort().join("|");
}

function buildConnectorSignature(chain: readonly string[]): string {
  return [...chain].sort().join("|");
}

function buildTags(ep: Episode): string[] {
  const tags: string[] = [ep.intent, ep.strategy];
  if (ep.success)  tags.push("success");
  if (ep.failure)  tags.push("failure");
  if (ep.cost > 7) tags.push("high_cost");
  if (ep.durationMs > 5000) tags.push("slow");
  if (ep.confidence > 0.8) tags.push("high_confidence");
  if (ep.authority > 0.8)  tags.push("high_authority");
  return tags.filter(Boolean);
}

export class EpisodeAnalyzer {
  /**
   * Analyze a batch of episodes.
   * Returns one AnalyzedEpisode per input episode.
   */
  analyze(episodes: readonly Episode[]): readonly AnalyzedEpisode[] {
    return episodes.map(ep => {
      const analyzed: AnalyzedEpisode = Object.freeze({
        id:                  makeCLId("ae"),
        episodeId:           ep.id,
        analyzedAt:          Date.now(),
        goal:                ep.goal,
        intent:              ep.intent,
        strategy:            ep.strategy,
        capabilitySignature: buildCapabilitySignature(ep.capabilities),
        connectorSignature:  buildConnectorSignature(ep.connectorChain),
        outcomeLabel:        outcomeLabel(ep),
        confidence:          ep.confidence,
        authority:           ep.authority,
        cost:                ep.cost,
        durationMs:          ep.durationMs,
        tags:                Object.freeze(buildTags(ep)),
      });
      return analyzed;
    });
  }

  /** Analyze a single episode. */
  analyzeOne(episode: Episode): AnalyzedEpisode {
    return this.analyze([episode])[0];
  }
}