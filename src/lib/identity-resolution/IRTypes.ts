/**
 * IRTypes.ts — Identity Resolution Engine Types
 * EF-36E · Project Independence · Foundation v1.0
 * 2026-07-13
 */

// ── Verification status (superset of FusionVerificationStatus) ───────────────

export type IRVerificationStatus =
  | "VERIFIED"      // confirmed by authoritative source
  | "MULTI_SOURCE"  // corroborated by 2+ providers
  | "SINGLE_SOURCE" // seen in only one provider
  | "INFERRED"      // derived / pattern-detected
  | "CONFLICT"      // contradicted by another entity
  | "UNKNOWN";      // not enough information

// ── Alias ─────────────────────────────────────────────────────────────────────

export interface EntityAlias {
  readonly alias: string;
  readonly sourceProvider: string;
  readonly detectedBy: "exact" | "token_overlap" | "acronym" | "version_strip" | "manual";
  readonly confidence: number;
}

// ── Version entry ─────────────────────────────────────────────────────────────

export interface VersionEntry {
  readonly versionLabel: string;          // e.g. "v1.0", "v2.3"
  readonly entityId: string;              // original fused entity ID
  readonly previousVersion: string | null;
  readonly nextVersion: string | null;
  readonly detectedAt: number;
}

// ── Canonical Entity ──────────────────────────────────────────────────────────

export interface CanonicalEntity {
  readonly id: string;
  readonly canonicalName: string;
  readonly aliases: readonly EntityAlias[];
  readonly entityType: string;
  readonly confidence: number;
  readonly verificationStatus: IRVerificationStatus;
  /** Source IDs (provider) that have referenced this entity */
  readonly sources: readonly string[];
  /** Ordered list of related timeline event IDs */
  readonly timeline: readonly string[];
  /** IDs of other canonical entities this one relates to */
  readonly relationships: readonly string[];
  readonly versionHistory: readonly VersionEntry[];
  readonly evidenceCount: number;
  readonly resolvedAt: number;
}

// ── Identity Graph types ──────────────────────────────────────────────────────

export type IdentityEdgeType =
  | "sameAs"
  | "versionOf"
  | "implementedBy"
  | "discussedIn"
  | "documentedBy"
  | "decidedBy"
  | "referencedBy"
  | "aliasOf";

export interface IdentityNode {
  readonly id: string;
  readonly kind: "canonical" | "alias" | "version" | "provider_ref";
  readonly label: string;
  readonly canonicalId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
}

export interface IdentityEdge {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly edgeType: IdentityEdgeType;
  readonly weight: number;
  readonly createdAt: number;
}

// ── Conflict ──────────────────────────────────────────────────────────────────

export type IRConflictType =
  | "same_name_different_entity"
  | "same_entity_different_name"
  | "version_conflict"
  | "broken_reference"
  | "ambiguous_alias";

export interface IRConflict {
  readonly id: string;
  readonly type: IRConflictType;
  readonly description: string;
  readonly entityAId: string;
  readonly entityBId: string;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly detectedAt: number;
  readonly resolved: boolean;
}

// ── Resolution Report ─────────────────────────────────────────────────────────

export interface IdentityReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  readonly totalInputEntities: number;
  readonly canonicalEntitiesCreated: number;
  readonly aliasesDetected: number;
  readonly versionsDetected: number;
  readonly resolvedIdentities: number;
  readonly ambiguousEntities: number;
  readonly conflictsDetected: number;
  readonly overallConfidence: number;
  readonly coverage: number;
  readonly verificationBreakdown: Readonly<Record<IRVerificationStatus, number>>;
  readonly typeBreakdown: Readonly<Record<string, number>>;
  readonly errors: readonly string[];
}

// ── ID generator ──────────────────────────────────────────────────────────────

let _irSeq = 0;
export function makeIRId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_irSeq).toString(36)}`;
}