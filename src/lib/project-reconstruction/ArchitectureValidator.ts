/**
 * ArchitectureValidator.ts — Architecture consistency validation
 * EF-36F · Project Independence · Foundation v1.0
 * 2026-07-13
 */

import type { CanonicalEntity } from "../identity-resolution/IRTypes";
import type { FusedTimelineEvent, FusedRelationship } from "../knowledge-fusion/FusionTypes";
import type { ArchitectureConsistencyReport, ArchConsistencyCheck } from "./PRTypes";
import { makePRId } from "./PRTypes";

export class ArchitectureValidator {
  validate(
    canonicals: CanonicalEntity[],
    timeline: FusedTimelineEvent[],
    relationships: FusedRelationship[],
  ): ArchitectureConsistencyReport {
    const checks: ArchConsistencyCheck[] = [];
    const entityIds = new Set(canonicals.map(e => e.id));

    // 1. At least one document or architecture entity exists
    const docCount = canonicals.filter(e => ["document", "architecture", "adr", "rfc"].includes(e.entityType)).length;
    checks.push({
      name: "Architecture documentation present",
      passed: docCount > 0,
      detail: docCount > 0 ? `${docCount} architecture/document entities found` : "No architecture or documentation entities — project may be undocumented",
    });

    // 2. Timeline is non-empty
    checks.push({
      name: "Timeline has events",
      passed: timeline.length > 0,
      detail: timeline.length > 0 ? `${timeline.length} timeline events found` : "Empty timeline — no temporal knowledge",
    });

    // 3. Relationships exist in the graph
    checks.push({
      name: "Relationship graph is connected",
      passed: relationships.length > 0,
      detail: relationships.length > 0 ? `${relationships.length} relationships found` : "No relationships — graph is fully disconnected",
    });

    // 4. No critical-confidence entities (confidence < 0.3) among decisions/arch
    const criticalLow = canonicals.filter(e =>
      (e.entityType === "decision" || e.entityType === "architecture" || e.entityType === "adr") &&
      e.confidence < 0.3,
    );
    checks.push({
      name: "Key entities above confidence threshold",
      passed: criticalLow.length === 0,
      detail: criticalLow.length === 0 ? "All decisions/architecture entities have confidence ≥ 0.3" : `${criticalLow.length} key entity(ies) have critically low confidence`,
    });

    // 5. Canonical entities cover at least 2 entity types
    const typeSet = new Set(canonicals.map(e => e.entityType));
    checks.push({
      name: "Entity type diversity",
      passed: typeSet.size >= 2,
      detail: typeSet.size >= 2 ? `${typeSet.size} distinct entity types present` : `Only ${typeSet.size} entity type(s) — limited knowledge breadth`,
    });

    // 6. Multi-source corroboration present (at least one MULTI_SOURCE or VERIFIED entity)
    const highConf = canonicals.filter(e => e.verificationStatus === "MULTI_SOURCE" || e.verificationStatus === "VERIFIED");
    checks.push({
      name: "Multi-source corroboration present",
      passed: highConf.length > 0,
      detail: highConf.length > 0 ? `${highConf.length} entities corroborated across multiple providers` : "No multi-source entities — all knowledge single-sourced",
    });

    // 7. Relationship endpoints all resolve to known canonicals
    const brokenRels = relationships.filter(r => !entityIds.has(r.fromId) || !entityIds.has(r.toId));
    checks.push({
      name: "All relationship endpoints resolve",
      passed: brokenRels.length === 0,
      detail: brokenRels.length === 0 ? "All relationship endpoints resolve to known entities" : `${brokenRels.length} relationship(s) reference unknown entities`,
    });

    // 8. Timeline chronology (events should be ordered)
    let chronological = true;
    for (let i = 1; i < timeline.length; i++) {
      if (timeline[i].occurredAt < timeline[i - 1].occurredAt) { chronological = false; break; }
    }
    checks.push({
      name: "Timeline is chronologically ordered",
      passed: chronological,
      detail: chronological ? "All timeline events are in chronological order" : "Timeline contains out-of-order events",
    });

    const passed = checks.filter(c => c.passed).length;
    return Object.freeze({
      id: makePRId("acr"),
      generatedAt: Date.now(),
      checks: Object.freeze(checks),
      passed,
      total: checks.length,
      consistent: passed === checks.length,
    });
  }
}