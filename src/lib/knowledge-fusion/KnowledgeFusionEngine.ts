/**
 * KnowledgeFusionEngine.ts — Multi-provider Knowledge Fusion
 * EF-36D · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * RESPONSIBILITIES:
 *   - Accept KnowledgeItems from multiple KRE sources
 *   - Resolve entity duplicates across providers
 *   - Fuse relationships into a unified graph
 *   - Merge timeline events chronologically
 *   - Compute confidence and verification status per entity
 *   - Detect conflicts
 *   - Generate cognitive snapshots
 *   - Generate fusion reports
 *
 * ARCHITECTURE RULES:
 *   - Zero provider-specific logic
 *   - Providers remain isolated; fusion is purely data-driven
 *   - Reuses KRE KnowledgeItem / KnowledgeRelationship / KnowledgeTimelineEvent types
 */

import type {
  KnowledgeItem,
  KnowledgeRelationship,
  KnowledgeTimelineEvent,
} from "../knowledge-reconstruction/KRETypes";
import type {
  FusedEntity,
  FusedRelationship,
  FusedTimelineEvent,
  FusionConflict,
  FusedCognitiveSnapshot,
  FusionReport,
  FusionVerificationStatus,
} from "./FusionTypes";
import { makeFusionId } from "./FusionTypes";
import { EntityResolver } from "./EntityResolver";
import { RelationshipFusion } from "./RelationshipFusion";
import { TimelineFusion } from "./TimelineFusion";
import { FusionConflictDetector } from "./FusionConflictDetector";

// ── Provider input bundle ─────────────────────────────────────────────────────

export interface ProviderKnowledge {
  sourceId: string;
  sourceName: string;
  items: KnowledgeItem[];
  relationships: KnowledgeRelationship[];
  timelineEvents: KnowledgeTimelineEvent[];
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class KnowledgeFusionEngine {
  private readonly resolver = new EntityResolver();
  private readonly relFusion = new RelationshipFusion();
  private readonly timelineFusion = new TimelineFusion();
  private readonly conflictDetector = new FusionConflictDetector();

  // ── State ──────────────────────────────────────────────────────────────────
  private entities: FusedEntity[] = [];
  private relationships: FusedRelationship[] = [];
  private timelineEvents: FusedTimelineEvent[] = [];
  private conflicts: FusionConflict[] = [];
  private snapshots: FusedCognitiveSnapshot[] = [];
  private lastReport: FusionReport | null = null;
  private mergeMap = new Map<string, string>();

  // ── Main Fusion ────────────────────────────────────────────────────────────

  fuse(providers: ProviderKnowledge[]): FusionReport {
    const startMs = Date.now();
    const errors: string[] = [];

    // Reset state
    this.entities = [];
    this.relationships = [];
    this.timelineEvents = [];
    this.conflicts = [];
    this.mergeMap = new Map();

    // Collect all items
    const allItems: KnowledgeItem[] = [];
    const allRelationships: KnowledgeRelationship[] = [];
    const allEvents: KnowledgeTimelineEvent[] = [];
    const providerBreakdown: Record<string, number> = {};

    for (const p of providers) {
      allItems.push(...p.items);
      allRelationships.push(...p.relationships);
      allEvents.push(...p.timelineEvents);
      providerBreakdown[p.sourceId] = p.items.length;
    }

    // Phase 1: Entity resolution
    try {
      const { entities, mergeMap, mergeCount } = this.resolver.resolve(allItems);
      this.entities = entities;
      this.mergeMap = mergeMap;
    } catch (e) {
      errors.push(`Entity resolution failed: ${(e as Error).message}`);
      // Fallback: treat every item as its own entity
      for (const item of allItems) {
        this.mergeMap.set(item.id, item.id);
      }
    }

    // Phase 2: Relationship fusion
    try {
      const { fused, duplicatesRemoved } = this.relFusion.fuse(allRelationships, this.mergeMap);
      this.relationships = fused;
    } catch (e) {
      errors.push(`Relationship fusion failed: ${(e as Error).message}`);
    }

    // Phase 3: Timeline fusion
    try {
      const { fused, conflicts: timelineConflicts, duplicatesFound } = this.timelineFusion.fuse(allEvents, this.mergeMap);
      this.timelineEvents = fused;
      this.conflicts.push(...timelineConflicts);
    } catch (e) {
      errors.push(`Timeline fusion failed: ${(e as Error).message}`);
    }

    // Phase 4: Conflict detection on entities
    try {
      const entityConflicts = this.conflictDetector.detect(this.entities);
      this.conflicts.push(...entityConflicts);
    } catch (e) {
      errors.push(`Conflict detection failed: ${(e as Error).message}`);
    }

    // Phase 5: Cognitive snapshot
    const snapshot = this._captureSnapshot(providers);
    this.snapshots.push(snapshot);

    // Phase 6: Report
    const mergeCount = allItems.length - this.entities.length;
    const dupTimeline = allEvents.length - this.timelineEvents.filter(e => !e.isDuplicate).length;
    const dupRel = allRelationships.length - this.relationships.length;

    const verBreakdown = this._verificationBreakdown();
    const avgConf = this.entities.length > 0
      ? this.entities.reduce((s, e) => s + e.confidence, 0) / this.entities.length
      : 0;
    const coverage = providers.length > 0
      ? providers.filter(p => p.items.length > 0).length / providers.length
      : 0;

    const missing: string[] = this.conflicts
      .filter(c => c.type === "missing_evidence")
      .map(c => c.description);

    const report: FusionReport = Object.freeze({
      id: makeFusionId("frep"),
      generatedAt: Date.now(),
      durationMs: Date.now() - startMs,
      providersProcessed: providers.length,
      totalItemsReceived: allItems.length,
      entitiesMerged: Math.max(0, mergeCount),
      entitiesUnique: this.entities.length,
      relationshipsCreated: this.relationships.length,
      timelineEventsFused: this.timelineEvents.length,
      duplicatesRemoved: Math.max(0, dupTimeline + Math.max(0, dupRel)),
      conflictsDetected: this.conflicts.length,
      overallConfidence: parseFloat(avgConf.toFixed(4)),
      coverage: parseFloat(coverage.toFixed(4)),
      verificationBreakdown: Object.freeze(verBreakdown),
      providerBreakdown: Object.freeze(providerBreakdown),
      missingEvidence: Object.freeze(missing),
      errors: Object.freeze(errors),
    });

    this.lastReport = report;
    return report;
  }

  // ── Snapshot ───────────────────────────────────────────────────────────────

  private _captureSnapshot(providers: ProviderKnowledge[]): FusedCognitiveSnapshot {
    const decisions = this.entities.filter(e => e.type === "decision").map(e => e.canonicalTitle);
    const arch = this.entities
      .filter(e => e.type === "adr" || e.type === "rfc" || e.type === "architecture")
      .map(e => e.canonicalTitle);
    const impls = this.entities.filter(e => e.type === "implementation" || e.type === "artifact").map(e => e.id);
    const openConflicts = this.conflicts.filter(c => !c.resolved).map(c => c.description);

    const coverageByProvider: Record<string, number> = {};
    for (const p of providers) {
      coverageByProvider[p.sourceId] = p.items.length;
    }

    const avgConf = this.entities.length > 0
      ? this.entities.reduce((s, e) => s + e.confidence, 0) / this.entities.length
      : 0;

    return Object.freeze({
      id: makeFusionId("fsnap"),
      capturedAt: Date.now(),
      providersContributing: Object.freeze(providers.map(p => p.sourceId)),
      totalEntities: this.entities.length,
      totalRelationships: this.relationships.length,
      totalTimelineEvents: this.timelineEvents.length,
      decisions: Object.freeze(decisions),
      architecture: Object.freeze(arch),
      implementations: Object.freeze(impls),
      openConflicts: Object.freeze(openConflicts),
      coverageByProvider: Object.freeze(coverageByProvider),
      overallConfidence: parseFloat(avgConf.toFixed(4)),
      verificationBreakdown: Object.freeze(this._verificationBreakdown()),
    });
  }

  private _verificationBreakdown(): Record<FusionVerificationStatus, number> {
    const counts: Record<FusionVerificationStatus, number> = {
      VERIFIED: 0, MULTI_SOURCE: 0, SINGLE_SOURCE: 0, INFERRED: 0, CONFLICT: 0,
    };
    for (const e of this.entities) counts[e.verificationStatus]++;
    return counts;
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getEntities(): FusedEntity[] { return [...this.entities]; }
  getRelationships(): FusedRelationship[] { return [...this.relationships]; }
  getTimeline(): FusedTimelineEvent[] { return [...this.timelineEvents]; }
  getConflicts(): FusionConflict[] { return [...this.conflicts]; }
  getSnapshots(): FusedCognitiveSnapshot[] { return [...this.snapshots]; }
  getLatestSnapshot(): FusedCognitiveSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }
  getLastReport(): FusionReport | null { return this.lastReport; }

  getEntitiesByType(type: string): FusedEntity[] {
    return this.entities.filter(e => e.type === type);
  }

  getEntitiesByStatus(status: FusionVerificationStatus): FusedEntity[] {
    return this.entities.filter(e => e.verificationStatus === status);
  }

  getMergeMap(): Map<string, string> { return new Map(this.mergeMap); }
}