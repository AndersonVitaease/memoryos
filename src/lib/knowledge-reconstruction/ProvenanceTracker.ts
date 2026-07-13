/**
 * ProvenanceTracker.ts — Knowledge Provenance Registry
 * EF-36A · Project Independence · Foundation v1.0
 *
 * Every reconstructed knowledge item must register its provenance here.
 * Nothing may lose its origin.
 */

import type {
  KnowledgeProvenance, VerificationStatus, KnowledgeSourceType, KnowledgeSourceProvider,
} from "./KRETypes";

export class ProvenanceTracker {
  // itemId → provenance
  private readonly registry = new Map<string, KnowledgeProvenance>();
  // sourceId → set of itemIds
  private readonly bySource = new Map<string, Set<string>>();

  // ── Registration ───────────────────────────────────────────────────────────

  track(
    itemId: string,
    provenance: KnowledgeProvenance,
  ): void {
    this.registry.set(itemId, Object.freeze({ ...provenance }));
    const sourceSet = this.bySource.get(provenance.sourceId) ?? new Set<string>();
    sourceSet.add(itemId);
    this.bySource.set(provenance.sourceId, sourceSet);
  }

  update(itemId: string, updates: Partial<KnowledgeProvenance>): boolean {
    const existing = this.registry.get(itemId);
    if (!existing) return false;
    this.registry.set(itemId, Object.freeze({ ...existing, ...updates, lastUpdatedAt: Date.now() }));
    return true;
  }

  markVerified(itemId: string): boolean {
    return this.update(itemId, { verificationStatus: 'VERIFIED' });
  }

  markConflict(itemId: string): boolean {
    return this.update(itemId, { verificationStatus: 'CONFLICT' });
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  get(itemId: string): KnowledgeProvenance | undefined {
    return this.registry.get(itemId);
  }

  has(itemId: string): boolean {
    return this.registry.has(itemId);
  }

  getBySource(sourceId: string): KnowledgeProvenance[] {
    const ids = this.bySource.get(sourceId) ?? new Set<string>();
    return Array.from(ids)
      .map(id => this.registry.get(id))
      .filter(Boolean) as KnowledgeProvenance[];
  }

  getByVerificationStatus(status: VerificationStatus): KnowledgeProvenance[] {
    return Array.from(this.registry.values()).filter(p => p.verificationStatus === status);
  }

  getByConfidenceBelow(threshold: number): KnowledgeProvenance[] {
    return Array.from(this.registry.values()).filter(p => p.confidence < threshold);
  }

  getAllItemIds(): string[] {
    return Array.from(this.registry.keys());
  }

  // ── Statistics ─────────────────────────────────────────────────────────────

  stats(): {
    total: number;
    byStatus: Record<VerificationStatus, number>;
    bySource: Record<string, number>;
    avgConfidence: number;
  } {
    const byStatus: Record<VerificationStatus, number> = {
      VERIFIED: 0, INFERRED: 0, CONFLICT: 0, UNKNOWN: 0,
    };
    const bySource: Record<string, number> = {};
    let confidenceSum = 0;

    for (const p of this.registry.values()) {
      byStatus[p.verificationStatus] = (byStatus[p.verificationStatus] ?? 0) + 1;
      bySource[p.sourceName] = (bySource[p.sourceName] ?? 0) + 1;
      confidenceSum += p.confidence;
    }

    return {
      total: this.registry.size,
      byStatus,
      bySource,
      avgConfidence: this.registry.size > 0 ? confidenceSum / this.registry.size : 0,
    };
  }

  get count(): number { return this.registry.size; }

  clear(): void {
    this.registry.clear();
    this.bySource.clear();
  }
}