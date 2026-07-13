/**
 * FusionConflictDetector.ts — Cross-provider conflict detection
 * EF-36D · Project Independence · Foundation v1.0
 * 2026-07-13
 */

import type { FusedEntity, FusionConflict } from "./FusionTypes";
import { makeFusionId } from "./FusionTypes";

export class FusionConflictDetector {
  detect(entities: FusedEntity[]): FusionConflict[] {
    const conflicts: FusionConflict[] = [];

    // 1. Conflicting decisions: same type=decision, different content, multi-source
    const decisions = entities.filter(e => e.type === "decision" && e.supportingProviders.length > 1);
    for (let i = 0; i < decisions.length; i++) {
      for (let j = i + 1; j < decisions.length; j++) {
        const a = decisions[i];
        const b = decisions[j];
        // Both multi-source with overlapping providers = potential conflict
        const sharedProviders = a.supportingProviders.filter(p => b.supportingProviders.includes(p));
        if (sharedProviders.length > 0 && a.confidence < 0.7 && b.confidence < 0.7) {
          conflicts.push(Object.freeze({
            id: makeFusionId("fcon"),
            type: "conflicting_decision" as const,
            description: `Conflicting decisions from shared providers: "${a.canonicalTitle.slice(0, 60)}" vs "${b.canonicalTitle.slice(0, 60)}"`,
            entityAId: a.id,
            entityBId: b.id,
            providerA: a.supportingProviders[0],
            providerB: b.supportingProviders[0],
            severity: "high" as const,
            detectedAt: Date.now(),
            resolved: false,
          }));
        }
      }
    }

    // 2. Duplicate artifacts: same type, very high title match, different providers, NOT merged
    const artifacts = entities.filter(e => e.type === "artifact");
    for (let i = 0; i < artifacts.length; i++) {
      for (let j = i + 1; j < artifacts.length; j++) {
        const a = artifacts[i];
        const b = artifacts[j];
        if (a.supportingProviders[0] === b.supportingProviders[0]) continue;
        // Same title exactly → should have been merged
        if (a.canonicalTitle.toLowerCase() === b.canonicalTitle.toLowerCase() && a.id !== b.id) {
          conflicts.push(Object.freeze({
            id: makeFusionId("fcon"),
            type: "duplicate_entity" as const,
            description: `Unmerged duplicate artifact: "${a.canonicalTitle.slice(0, 60)}"`,
            entityAId: a.id,
            entityBId: b.id,
            providerA: a.supportingProviders[0],
            providerB: b.supportingProviders[0],
            severity: "low" as const,
            detectedAt: Date.now(),
            resolved: false,
          }));
        }
      }
    }

    // 3. Missing evidence: SINGLE_SOURCE items that are decisions or requirements
    const highStakeSingle = entities.filter(
      e => e.verificationStatus === "SINGLE_SOURCE" && (e.type === "decision" || e.type === "requirement"),
    );
    for (const e of highStakeSingle) {
      conflicts.push(Object.freeze({
        id: makeFusionId("fcon"),
        type: "missing_evidence" as const,
        description: `"${e.canonicalTitle.slice(0, 60)}" — ${e.type} seen in only one provider`,
        entityAId: e.id,
        entityBId: e.id,
        providerA: e.supportingProviders[0],
        providerB: "none",
        severity: "medium" as const,
        detectedAt: Date.now(),
        resolved: false,
      }));
    }

    return conflicts;
  }
}