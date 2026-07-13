/**
 * EntityResolver.ts — Cross-provider entity deduplication
 * EF-36D · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * Detects identical or semantically equivalent entities across providers.
 * Merges them into FusedEntity objects.
 * Never discards provenance.
 */

import type { KnowledgeItem } from "../knowledge-reconstruction/KRETypes";
import type { FusedEntity, FusionVerificationStatus } from "./FusionTypes";
import { makeFusionId } from "./FusionTypes";

// ── Similarity helpers ────────────────────────────────────────────────────────

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(repository:|commit:|branch:|decision:|architecture:)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return 1.0;
  // Token overlap ratio
  const tokA = new Set(na.split(/\s+/));
  const tokB = new Set(nb.split(/\s+/));
  const intersection = [...tokA].filter(t => tokB.has(t)).length;
  const union = new Set([...tokA, ...tokB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Min similarity threshold to consider two items the same entity */
const MERGE_THRESHOLD = 0.85;

/** Types that are safe to merge across providers */
const MERGEABLE_TYPES = new Set([
  "document", "decision", "rfc", "adr", "sprint",
  "goal", "connector", "requirement", "architecture", "implementation",
]);

// ── EntityResolver ────────────────────────────────────────────────────────────

export class EntityResolver {
  private readonly mergedGroups: Map<string, string[]> = new Map(); // canonicalId → [mergedIds]

  /**
   * Resolve items from multiple providers into FusedEntity list.
   * Items from the same provider are never merged with each other.
   * Merging only happens across different provider sourceIds.
   */
  resolve(items: KnowledgeItem[]): {
    entities: FusedEntity[];
    mergeMap: Map<string, string>; // originalId → fusedEntityId
    mergeCount: number;
  } {
    const entities: FusedEntity[] = [];
    const mergeMap = new Map<string, string>();
    let mergeCount = 0;

    // Group items by type for targeted comparison
    const byType = new Map<string, KnowledgeItem[]>();
    for (const item of items) {
      const bucket = byType.get(item.type) ?? [];
      bucket.push(item);
      byType.set(item.type, bucket);
    }

    for (const [type, typeItems] of byType) {
      const canMerge = MERGEABLE_TYPES.has(type);
      if (!canMerge || typeItems.length < 2) {
        // No merging — each item becomes its own entity
        for (const item of typeItems) {
          const entity = this._singleEntity(item);
          entities.push(entity);
          mergeMap.set(item.id, entity.id);
        }
        continue;
      }

      // Union-find style grouping
      const groups: KnowledgeItem[][] = [];
      const grouped = new Set<string>();

      for (let i = 0; i < typeItems.length; i++) {
        if (grouped.has(typeItems[i].id)) continue;
        const group: KnowledgeItem[] = [typeItems[i]];
        grouped.add(typeItems[i].id);

        for (let j = i + 1; j < typeItems.length; j++) {
          if (grouped.has(typeItems[j].id)) continue;
          // Only merge across different providers
          if (typeItems[i].provenance.sourceId === typeItems[j].provenance.sourceId) continue;
          const sim = titleSimilarity(typeItems[i].title, typeItems[j].title);
          if (sim >= MERGE_THRESHOLD) {
            group.push(typeItems[j]);
            grouped.add(typeItems[j].id);
          }
        }
        groups.push(group);
      }

      for (const group of groups) {
        if (group.length === 1) {
          const entity = this._singleEntity(group[0]);
          entities.push(entity);
          mergeMap.set(group[0].id, entity.id);
        } else {
          const entity = this._mergeGroup(group);
          entities.push(entity);
          mergeCount += group.length - 1;
          for (const item of group) {
            mergeMap.set(item.id, entity.id);
          }
        }
      }
    }

    return { entities, mergeMap, mergeCount };
  }

  private _singleEntity(item: KnowledgeItem): FusedEntity {
    const status = this._calcStatus(1, item.provenance.verificationStatus);
    return Object.freeze({
      id: item.id,
      canonicalTitle: item.title,
      type: item.type,
      content: item.content,
      tags: Object.freeze([...item.tags]),
      mergedIds: Object.freeze([item.id]),
      supportingProviders: Object.freeze([item.provenance.sourceId]),
      evidenceCount: 1,
      confidence: item.provenance.confidence,
      verificationStatus: status,
      createdAt: item.createdAt,
      fusedAt: Date.now(),
    });
  }

  private _mergeGroup(items: KnowledgeItem[]): FusedEntity {
    // Canonical = highest confidence item
    const canonical = [...items].sort((a, b) => b.provenance.confidence - a.provenance.confidence)[0];
    const providers = [...new Set(items.map(i => i.provenance.sourceId))];
    const avgConfidence = items.reduce((s, i) => s + i.provenance.confidence, 0) / items.length;
    // Boost for multi-source
    const boostedConf = Math.min(1.0, avgConfidence * (1 + 0.05 * (providers.length - 1)));
    const allTags = [...new Set(items.flatMap(i => [...i.tags]))];
    const status = this._calcStatus(providers.length, canonical.provenance.verificationStatus);

    return Object.freeze({
      id: canonical.id,
      canonicalTitle: canonical.title,
      type: canonical.type,
      content: canonical.content,
      tags: Object.freeze(allTags),
      mergedIds: Object.freeze(items.map(i => i.id)),
      supportingProviders: Object.freeze(providers),
      evidenceCount: items.length,
      confidence: parseFloat(boostedConf.toFixed(4)),
      verificationStatus: status,
      createdAt: Math.min(...items.map(i => i.createdAt)),
      fusedAt: Date.now(),
    });
  }

  private _calcStatus(providerCount: number, baseStatus: string): FusionVerificationStatus {
    if (baseStatus === "CONFLICT") return "CONFLICT";
    if (providerCount >= 2) return "MULTI_SOURCE";
    if (baseStatus === "VERIFIED") return "VERIFIED";
    if (baseStatus === "INFERRED") return "INFERRED";
    return "SINGLE_SOURCE";
  }
}