/**
 * IRConflictDetector.ts — Identity conflict detection
 * EF-36E · Project Independence · Foundation v1.0
 * 2026-07-13
 */

import type { CanonicalEntity, IRConflict } from "./IRTypes";
import { makeIRId } from "./IRTypes";

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export class IRConflictDetector {
  detect(entities: CanonicalEntity[]): IRConflict[] {
    const conflicts: IRConflict[] = [];

    // 1. Same canonical name → different entities (same_name_different_entity)
    const byName = new Map<string, CanonicalEntity[]>();
    for (const e of entities) {
      const key = norm(e.canonicalName);
      const bucket = byName.get(key) ?? [];
      bucket.push(e);
      byName.set(key, bucket);
    }
    for (const [name, bucket] of byName) {
      if (bucket.length < 2) continue;
      for (let i = 1; i < bucket.length; i++) {
        conflicts.push(Object.freeze({
          id: makeIRId("ircon"),
          type: "same_name_different_entity" as const,
          description: `"${name}" resolves to ${bucket.length} different canonical entities`,
          entityAId: bucket[0].id,
          entityBId: bucket[i].id,
          severity: "high" as const,
          detectedAt: Date.now(),
          resolved: false,
        }));
      }
    }

    // 2. Same entity, alias = another entity's canonical name (ambiguous_alias)
    const canonicalNames = new Set(entities.map(e => norm(e.canonicalName)));
    for (const e of entities) {
      for (const alias of e.aliases) {
        const an = norm(alias.alias);
        if (canonicalNames.has(an) && an !== norm(e.canonicalName)) {
          const other = entities.find(x => norm(x.canonicalName) === an);
          if (other) {
            conflicts.push(Object.freeze({
              id: makeIRId("ircon"),
              type: "ambiguous_alias" as const,
              description: `Alias "${alias.alias}" of "${e.canonicalName}" conflicts with canonical name of another entity`,
              entityAId: e.id,
              entityBId: other.id,
              severity: "medium" as const,
              detectedAt: Date.now(),
              resolved: false,
            }));
          }
        }
      }
    }

    // 3. Broken references: entity in relationships list but not in canonical set
    const entityIds = new Set(entities.map(e => e.id));
    for (const e of entities) {
      for (const relId of e.relationships) {
        if (!entityIds.has(relId)) {
          conflicts.push(Object.freeze({
            id: makeIRId("ircon"),
            type: "broken_reference" as const,
            description: `"${e.canonicalName}" references unknown entity id "${relId.slice(0, 30)}"`,
            entityAId: e.id,
            entityBId: relId,
            severity: "low" as const,
            detectedAt: Date.now(),
            resolved: false,
          }));
        }
      }
    }

    return conflicts;
  }
}