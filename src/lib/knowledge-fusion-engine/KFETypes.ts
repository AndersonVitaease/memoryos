/**
 * KFETypes.ts — Sprint 8.12
 * All type contracts for the Knowledge Fusion Engine.
 * SRP: type definitions only — no logic, no side effects.
 * MDS v2.0 compliant. All exported objects are immutable.
 */

// ── Source identifiers ────────────────────────────────────────────────────────

export type KnowledgeSourceId =
  | "memory.entities"
  | "memory.topics"
  | "memory.decisions"
  | "memory.tasks"
  | "memory.keywords"
  | "memory.session_summary"
  | "working_memory"
  | "github_connector"
  | "gmail_connector"
  | "drive_connector"
  | "calendar_connector"
  | "base44_connector"
  | "official_library"
  | string;

// ── Raw knowledge unit (input to KFE) ────────────────────────────────────────

export interface RawKnowledgeUnit {
  readonly id:         string;           // unique within source
  readonly sourceId:   KnowledgeSourceId;
  readonly type:       KnowledgeUnitType;
  readonly value:      string;           // normalized lowercase label
  readonly rawValue:   string;           // original casing
  readonly confidence: number;           // [0, 1] from source
  readonly context?:   string;           // excerpt or description
  readonly metadata:   Readonly<Record<string, unknown>>;
}

export type KnowledgeUnitType =
  | "entity"
  | "topic"
  | "decision"
  | "task"
  | "keyword"
  | "relationship"
  | "fact";

// ── Fused entity ──────────────────────────────────────────────────────────────

export interface FusedEntity {
  readonly fusedId:         string;
  readonly canonicalValue:  string;      // winning display label
  readonly type:            KnowledgeUnitType;
  readonly confidence:      number;
  readonly sources:         readonly KnowledgeSourceId[];
  readonly evidence:        readonly EvidenceRecord[];
  readonly duplicatesOf:    readonly string[];  // original unit IDs merged
  readonly context?:        string;
}

// ── Conflict record ───────────────────────────────────────────────────────────

export interface ConflictRecord {
  readonly conflictId:  string;
  readonly value:       string;   // the disputed value/label
  readonly sourceA:     KnowledgeSourceId;
  readonly sourceB:     KnowledgeSourceId;
  readonly claimA:      string;
  readonly claimB:      string;
  readonly reason:      string;
  readonly confidence:  number;   // confidence that this is a real conflict
  readonly detectedAt:  number;
}

// ── Relationship ──────────────────────────────────────────────────────────────

export interface KnowledgeRelationship {
  readonly relationshipId: string;
  readonly fromEntityId:   string;   // fusedId
  readonly toEntityId:     string;   // fusedId
  readonly type:           RelationshipType;
  readonly confidence:     number;
  readonly sources:        readonly KnowledgeSourceId[];
}

export type RelationshipType =
  | "depends_on"
  | "produces"
  | "consumed_by"
  | "related_to"
  | "part_of"
  | "precedes"
  | "follows";

// ── Evidence ──────────────────────────────────────────────────────────────────

export interface EvidenceRecord {
  readonly sourceId:   KnowledgeSourceId;
  readonly excerpt:    string;
  readonly confidence: number;
  readonly capturedAt: number;
}

// ── Statistics ────────────────────────────────────────────────────────────────

export interface KFEStatistics {
  readonly totalRawUnits:       number;
  readonly totalEntities:       number;
  readonly totalRelationships:  number;
  readonly totalConflicts:      number;
  readonly duplicatesRemoved:   number;
  readonly averageConfidence:   number;
  readonly processingTimeMs:    number;
  readonly sourcesUsed:         readonly KnowledgeSourceId[];
  readonly confidenceBySource:  Readonly<Record<string, number>>;
}

// ── Unified Knowledge Model ───────────────────────────────────────────────────

export interface UnifiedKnowledgeModel {
  readonly modelId:       string;
  readonly buildId:       string;        // links back to UnifiedContextBuilder build
  readonly entities:      readonly FusedEntity[];
  readonly topics:        readonly FusedEntity[];
  readonly decisions:     readonly FusedEntity[];
  readonly tasks:         readonly FusedEntity[];
  readonly relationships: readonly KnowledgeRelationship[];
  readonly conflicts:     readonly ConflictRecord[];
  readonly confidence:    number;        // overall model confidence [0, 1]
  readonly evidence:      readonly EvidenceRecord[];
  readonly statistics:    KFEStatistics;
  readonly builtAt:       number;
}

// ── Engine input ──────────────────────────────────────────────────────────────

export interface KFEInput {
  readonly buildId:   string;
  readonly units:     readonly RawKnowledgeUnit[];
  readonly sessionId: string;
}

// ── Engine result ─────────────────────────────────────────────────────────────

export interface KFEResult {
  readonly success:  boolean;
  readonly model:    UnifiedKnowledgeModel;
  readonly durationMs: number;
  readonly error?:   string;
}