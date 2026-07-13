/**
 * CoverageCalculator.ts — Reconstruction coverage metrics
 * EF-36F · Project Independence · Foundation v1.0
 * 2026-07-13
 */

import type { CanonicalEntity } from "../identity-resolution/IRTypes";
import type { FusedTimelineEvent, FusedRelationship } from "../knowledge-fusion/FusionTypes";
import type { CoverageReport } from "./PRTypes";

export class CoverageCalculator {
  calculate(
    canonicals: CanonicalEntity[],
    timeline: FusedTimelineEvent[],
    relationships: FusedRelationship[],
    providerBreakdown: Record<string, number>,
  ): CoverageReport {
    // By provider — normalised count share
    const total = Object.values(providerBreakdown).reduce((s, v) => s + v, 0);
    const byProvider: Record<string, number> = {};
    for (const [k, v] of Object.entries(providerBreakdown)) {
      byProvider[k] = total > 0 ? parseFloat((v / total).toFixed(4)) : 0;
    }

    // By document type
    const byDocumentType: Record<string, number> = {};
    for (const e of canonicals) {
      byDocumentType[e.entityType] = (byDocumentType[e.entityType] ?? 0) + 1;
    }

    // By timeline: ratio of events that have 2+ source providers (confirmed)
    const byTimeline = timeline.length > 0
      ? parseFloat((timeline.filter(e => e.sourceProviders.length >= 2).length / timeline.length).toFixed(4))
      : 0;

    // By architecture: ratio of arch/adr/rfc entities with MULTI_SOURCE or VERIFIED
    const archEntities = canonicals.filter(e => ["adr", "rfc", "architecture", "document"].includes(e.entityType));
    const byArchitecture = archEntities.length > 0
      ? parseFloat((archEntities.filter(e => e.verificationStatus === "MULTI_SOURCE" || e.verificationStatus === "VERIFIED").length / archEntities.length).toFixed(4))
      : 0;

    // By implementation: ratio of implementation/artifact with evidence > 1
    const implEntities = canonicals.filter(e => ["implementation", "artifact", "commit"].includes(e.entityType));
    const byImplementation = implEntities.length > 0
      ? parseFloat((implEntities.filter(e => e.evidenceCount >= 1).length / implEntities.length).toFixed(4))
      : 1;

    // By decisions: ratio of decision entities with confidence >= 0.7
    const decEntities = canonicals.filter(e => e.entityType === "decision");
    const byDecisions = decEntities.length > 0
      ? parseFloat((decEntities.filter(e => e.confidence >= 0.7).length / decEntities.length).toFixed(4))
      : 1;

    // By relationships: ratio of canonical entities that appear in at least one relationship
    const inRelIds = new Set([...relationships.map(r => r.fromId), ...relationships.map(r => r.toId)]);
    const byRelationships = canonicals.length > 0
      ? parseFloat((canonicals.filter(e => inRelIds.has(e.id)).length / canonicals.length).toFixed(4))
      : 0;

    // Overall: average of key dimensions
    const dims = [byTimeline, byArchitecture, byImplementation, byDecisions, byRelationships];
    const overall = parseFloat((dims.reduce((s, v) => s + v, 0) / dims.length).toFixed(4));

    return Object.freeze({
      byProvider: Object.freeze(byProvider),
      byDocumentType: Object.freeze(byDocumentType),
      byTimeline,
      byArchitecture,
      byImplementation,
      byDecisions,
      byRelationships,
      overall,
    });
  }
}