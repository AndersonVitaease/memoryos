/**
 * MissingKnowledgeDetector.ts — Missing knowledge detection
 * EF-36F · Project Independence · Foundation v1.0
 * 2026-07-13
 */

import type { CanonicalEntity } from "../identity-resolution/IRTypes";
import type { FusedRelationship } from "../knowledge-fusion/FusionTypes";
import type { MissingKnowledgeItem, MissingKnowledgeReport, MissingKind } from "./PRTypes";
import { makePRId } from "./PRTypes";

export class MissingKnowledgeDetector {
  detect(
    canonicals: CanonicalEntity[],
    relationships: FusedRelationship[],
  ): MissingKnowledgeReport {
    const items: MissingKnowledgeItem[] = [];
    const entityIds = new Set(canonicals.map(e => e.id));

    // 1. Decisions with no ADR backing
    const decisions = canonicals.filter(e => e.entityType === "decision");
    const adrs = canonicals.filter(e => e.entityType === "adr");
    if (decisions.length > 0 && adrs.length === 0) {
      items.push({ kind: "missing_adr", description: `${decisions.length} decision(s) found but no ADR documents`, relatedEntityId: null, severity: "high" });
    }

    // 2. Architecture items with no RFC
    const archItems = canonicals.filter(e => e.entityType === "architecture");
    const rfcs = canonicals.filter(e => e.entityType === "rfc");
    if (archItems.length > 0 && rfcs.length === 0) {
      items.push({ kind: "missing_rfc", description: `${archItems.length} architecture item(s) found but no RFC documents`, relatedEntityId: null, severity: "medium" });
    }

    // 3. Broken references (relationship endpoints not in canonical set)
    const brokenFromRel = relationships.filter(r => !entityIds.has(r.fromId) || !entityIds.has(r.toId));
    for (const rel of brokenFromRel.slice(0, 5)) { // cap at 5 for readability
      items.push({ kind: "broken_reference", description: `Relationship "${rel.relationshipType}" references unknown entity`, relatedEntityId: rel.fromId, severity: "low" });
    }

    // 4. Broken references from canonical.relationships
    for (const e of canonicals) {
      for (const relId of e.relationships) {
        if (!entityIds.has(relId)) {
          items.push({ kind: "broken_reference", description: `"${e.canonicalName}" references unresolved entity "${relId.slice(0, 24)}"`, relatedEntityId: e.id, severity: "low" });
        }
      }
    }

    // 5. Missing implementations: goals/sprints with no linked implementation
    const goalsAndSprints = canonicals.filter(e => e.entityType === "goal" || e.entityType === "sprint");
    const implIds = new Set(canonicals.filter(e => e.entityType === "implementation" || e.entityType === "artifact").map(e => e.id));
    for (const gs of goalsAndSprints) {
      const hasImpl = gs.relationships.some(r => implIds.has(r));
      if (!hasImpl) {
        items.push({ kind: "missing_implementation", description: `"${gs.canonicalName}" (${gs.entityType}) has no linked implementation`, relatedEntityId: gs.id, severity: "medium" });
      }
    }

    // 6. Unknown entities (UNKNOWN verification status)
    const unknown = canonicals.filter(e => e.verificationStatus === "UNKNOWN");
    for (const e of unknown.slice(0, 10)) {
      items.push({ kind: "unknown_entity", description: `"${e.canonicalName}" could not be verified from any provider`, relatedEntityId: e.id, severity: "low" });
    }

    // 7. Missing relationships: isolated canonical nodes (no relationships at all)
    const inRel = new Set([...relationships.map(r => r.fromId), ...relationships.map(r => r.toId)]);
    const isolated = canonicals.filter(e => !inRel.has(e.id) && e.relationships.length === 0);
    if (isolated.length > 3) {
      items.push({ kind: "missing_relationship", description: `${isolated.length} entities have no relationships — possible orphaned knowledge`, relatedEntityId: null, severity: "low" });
    }

    // Aggregates
    const bySeverity = { low: 0, medium: 0, high: 0 };
    const byKind: Record<MissingKind, number> = { missing_adr: 0, missing_rfc: 0, broken_reference: 0, missing_implementation: 0, missing_relationship: 0, unknown_entity: 0 };
    for (const item of items) {
      bySeverity[item.severity]++;
      byKind[item.kind]++;
    }

    return Object.freeze({
      id: makePRId("mkr"),
      generatedAt: Date.now(),
      items: Object.freeze(items),
      totalMissing: items.length,
      bySeverity: Object.freeze(bySeverity),
      byKind: Object.freeze(byKind),
    });
  }
}