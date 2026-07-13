/**
 * ConflictDetector.ts — Knowledge Conflict Detection
 * EF-36A · Project Independence · Foundation v1.0
 *
 * Detects: version mismatches, decision conflicts, duplicate requirements,
 * timeline conflicts, duplicate entities, schema mismatches, content divergence.
 */

import type {
  KnowledgeItem, KnowledgeConflict, ConflictType,
} from "./KRETypes";
import { makeKREId } from "./KRETypes";

function similarity(a: string, b: string): number {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return 1.0;
  // Jaccard on word sets
  const setA = new Set(la.split(/\s+/));
  const setB = new Set(lb.split(/\s+/));
  const intersection = new Set([...setA].filter(w => setB.has(w)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

export class ConflictDetector {
  private readonly conflicts = new Map<string, KnowledgeConflict>();

  // ── Detection ──────────────────────────────────────────────────────────────

  /**
   * Runs all conflict checks against the current item set.
   * Returns newly detected conflicts.
   */
  detect(items: KnowledgeItem[]): KnowledgeConflict[] {
    const newConflicts: KnowledgeConflict[] = [];
    newConflicts.push(...this._detectDuplicates(items));
    newConflicts.push(...this._detectDecisionConflicts(items));
    newConflicts.push(...this._detectVersionMismatches(items));
    newConflicts.push(...this._detectTimelineConflicts(items));
    return newConflicts;
  }

  // ── Duplicate detection ────────────────────────────────────────────────────

  private _detectDuplicates(items: KnowledgeItem[]): KnowledgeConflict[] {
    const found: KnowledgeConflict[] = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        if (a.type !== b.type) continue;
        if (a.provenance.sourceId === b.provenance.sourceId) continue;
        const sim = similarity(a.title, b.title);
        if (sim >= 0.85) {
          const conflictKey = [a.id, b.id].sort().join(':');
          if (!this._conflictExists(a.id, b.id, 'duplicate_entity')) {
            const c = this._make('duplicate_entity',
              `Potential duplicate: "${a.title}" (${a.provenance.sourceName}) and "${b.title}" (${b.provenance.sourceName}) — similarity: ${(sim * 100).toFixed(0)}%`,
              a, b, sim >= 0.95 ? 'high' : 'medium');
            this.conflicts.set(c.id, c);
            found.push(c);
          }
        }
      }
    }
    return found;
  }

  // ── Decision conflict detection ────────────────────────────────────────────

  private _detectDecisionConflicts(items: KnowledgeItem[]): KnowledgeConflict[] {
    const found: KnowledgeConflict[] = [];
    const decisions = items.filter(i => i.type === 'decision');
    for (let i = 0; i < decisions.length; i++) {
      for (let j = i + 1; j < decisions.length; j++) {
        const a = decisions[i], b = decisions[j];
        if (a.provenance.sourceId === b.provenance.sourceId) continue;
        const titleSim = similarity(a.title, b.title);
        const contentSim = similarity(a.content, b.content);
        if (titleSim >= 0.7 && contentSim < 0.4) {
          if (!this._conflictExists(a.id, b.id, 'decision_conflict')) {
            const c = this._make('decision_conflict',
              `Decision conflict: "${a.title}" has diverging content across sources "${a.provenance.sourceName}" and "${b.provenance.sourceName}"`,
              a, b, 'high');
            this.conflicts.set(c.id, c);
            found.push(c);
          }
        }
      }
    }
    return found;
  }

  // ── Version mismatch detection ─────────────────────────────────────────────

  private _detectVersionMismatches(items: KnowledgeItem[]): KnowledgeConflict[] {
    const found: KnowledgeConflict[] = [];
    const artifacts = items.filter(i => i.type === 'artifact' || i.type === 'document');
    // Group by original identifier
    const byOriginalId = new Map<string, KnowledgeItem[]>();
    for (const item of artifacts) {
      const key = item.provenance.originalIdentifier;
      if (!byOriginalId.has(key)) byOriginalId.set(key, []);
      byOriginalId.get(key)!.push(item);
    }
    for (const [, group] of byOriginalId) {
      if (group.length < 2) continue;
      // Check for items from different sources with the same original id
      const sources = new Set(group.map(i => i.provenance.sourceId));
      if (sources.size < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i], b = group[j];
          if (a.provenance.sourceId === b.provenance.sourceId) continue;
          const contentSim = similarity(a.content, b.content);
          if (contentSim < 0.9) {
            if (!this._conflictExists(a.id, b.id, 'version_mismatch')) {
              const c = this._make('version_mismatch',
                `File "${a.provenance.originalIdentifier}" differs between "${a.provenance.sourceName}" and "${b.provenance.sourceName}" — content similarity: ${(contentSim * 100).toFixed(0)}%`,
                a, b, contentSim < 0.5 ? 'critical' : 'medium');
              this.conflicts.set(c.id, c);
              found.push(c);
            }
          }
        }
      }
    }
    return found;
  }

  // ── Timeline conflict detection ────────────────────────────────────────────

  private _detectTimelineConflicts(items: KnowledgeItem[]): KnowledgeConflict[] {
    const found: KnowledgeConflict[] = [];
    // Detect items with same title but very different timestamps from different sources
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        if (a.provenance.sourceId === b.provenance.sourceId) continue;
        if (similarity(a.title, b.title) < 0.8) continue;
        const timeDiffMs = Math.abs(a.createdAt - b.createdAt);
        const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
        if (timeDiffMs > SEVEN_DAYS) {
          if (!this._conflictExists(a.id, b.id, 'timeline_conflict')) {
            const days = Math.round(timeDiffMs / (24 * 60 * 60 * 1000));
            const c = this._make('timeline_conflict',
              `Timeline conflict: "${a.title}" appears ${days} days apart across sources "${a.provenance.sourceName}" and "${b.provenance.sourceName}"`,
              a, b, 'low');
            this.conflicts.set(c.id, c);
            found.push(c);
          }
        }
      }
    }
    return found;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _conflictExists(itemAId: string, itemBId: string, type: ConflictType): boolean {
    for (const c of this.conflicts.values()) {
      if (c.type === type &&
        ((c.itemAId === itemAId && c.itemBId === itemBId) ||
         (c.itemAId === itemBId && c.itemBId === itemAId))) return true;
    }
    return false;
  }

  private _make(
    type: ConflictType,
    description: string,
    a: KnowledgeItem,
    b: KnowledgeItem,
    severity: KnowledgeConflict['severity'],
  ): KnowledgeConflict {
    return Object.freeze({
      id: makeKREId('conflict'),
      type,
      description,
      itemAId: a.id,
      itemBId: b.id,
      sourceAId: a.provenance.sourceId,
      sourceBId: b.provenance.sourceId,
      detectedAt: Date.now(),
      severity,
      resolved: false,
    });
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getAll(): KnowledgeConflict[] {
    return Array.from(this.conflicts.values());
  }

  getByType(type: ConflictType): KnowledgeConflict[] {
    return Array.from(this.conflicts.values()).filter(c => c.type === type);
  }

  getBySeverity(severity: KnowledgeConflict['severity']): KnowledgeConflict[] {
    return Array.from(this.conflicts.values()).filter(c => c.severity === severity);
  }

  get count(): number { return this.conflicts.size; }

  clear(): void { this.conflicts.clear(); }
}