/**
 * FusionTypes.ts — Knowledge Fusion Engine Types
 * EF-36D · Project Independence · Foundation v1.0
 * 2026-07-13
 */

// ── Fusion verification status ────────────────────────────────────────────────

export type FusionVerificationStatus =
  | "VERIFIED"       // confirmed by authoritative source
  | "MULTI_SOURCE"   // corroborated by 2+ providers
  | "SINGLE_SOURCE"  // seen in only one provider
  | "INFERRED"       // derived / pattern-detected
  | "CONFLICT";      // contradicted by another provider

// ── Fused entity ──────────────────────────────────────────────────────────────

export interface FusedEntity {
  /** Canonical ID — lowest-sort original ID of merged items */
  readonly id: string;
  readonly canonicalTitle: string;
  readonly type: string;
  readonly content: string;
  readonly tags: readonly string[];
  /** All original item IDs that were merged into this entity */
  readonly mergedIds: readonly string[];
  /** Provider source IDs that contributed */
  readonly supportingProviders: readonly string[];
  readonly evidenceCount: number;
  readonly confidence: number;
  readonly verificationStatus: FusionVerificationStatus;
  readonly createdAt: number;
  readonly fusedAt: number;
}

// ── Fused relationship ────────────────────────────────────────────────────────

export interface FusedRelationship {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly relationshipType: string;
  readonly weight: number;
  readonly supportingProviders: readonly string[];
  readonly evidenceCount: number;
  readonly fusedAt: number;
}

// ── Timeline fusion ───────────────────────────────────────────────────────────

export interface FusedTimelineEvent {
  readonly id: string;
  readonly eventType: string;
  readonly title: string;
  readonly description: string;
  readonly occurredAt: number;
  readonly relatedItemIds: readonly string[];
  readonly sourceProviders: readonly string[];
  readonly isDuplicate: boolean;
  readonly duplicateOf: string | null;
  readonly hasConflict: boolean;
}

// ── Conflict report ───────────────────────────────────────────────────────────

export type FusionConflictType =
  | "duplicate_entity"
  | "conflicting_decision"
  | "version_mismatch"
  | "timeline_inconsistency"
  | "missing_evidence"
  | "contradicting_signals";

export interface FusionConflict {
  readonly id: string;
  readonly type: FusionConflictType;
  readonly description: string;
  readonly entityAId: string;
  readonly entityBId: string;
  readonly providerA: string;
  readonly providerB: string;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly detectedAt: number;
  readonly resolved: boolean;
}

// ── Cognitive snapshot ────────────────────────────────────────────────────────

export interface FusedCognitiveSnapshot {
  readonly id: string;
  readonly capturedAt: number;
  readonly providersContributing: readonly string[];
  readonly totalEntities: number;
  readonly totalRelationships: number;
  readonly totalTimelineEvents: number;
  readonly decisions: readonly string[];
  readonly architecture: readonly string[];
  readonly implementations: readonly string[];
  readonly openConflicts: readonly string[];
  readonly coverageByProvider: Readonly<Record<string, number>>;
  readonly overallConfidence: number;
  readonly verificationBreakdown: Readonly<Record<FusionVerificationStatus, number>>;
}

// ── Fusion report ─────────────────────────────────────────────────────────────

export interface FusionReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  readonly providersProcessed: number;
  readonly totalItemsReceived: number;
  readonly entitiesMerged: number;
  readonly entitiesUnique: number;
  readonly relationshipsCreated: number;
  readonly timelineEventsFused: number;
  readonly duplicatesRemoved: number;
  readonly conflictsDetected: number;
  readonly overallConfidence: number;
  readonly coverage: number;
  readonly verificationBreakdown: Readonly<Record<FusionVerificationStatus, number>>;
  readonly providerBreakdown: Readonly<Record<string, number>>;
  readonly missingEvidence: readonly string[];
  readonly errors: readonly string[];
}

// ── ID generator ──────────────────────────────────────────────────────────────

let _fusionSeq = 0;
export function makeFusionId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_fusionSeq).toString(36)}`;
}