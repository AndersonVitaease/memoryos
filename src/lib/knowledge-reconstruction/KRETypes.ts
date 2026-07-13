/**
 * KRETypes.ts — Knowledge Reconstruction Engine Types
 * EF-36A · Project Independence · Foundation v1.0
 * 2026-07-13
 */

// ── IDs ───────────────────────────────────────────────────────────────────────

let _kreSeq = 0;
export function makeKREId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_kreSeq).toString(36)}`;
}

// ── Enumerations ──────────────────────────────────────────────────────────────

export type VerificationStatus = "VERIFIED" | "INFERRED" | "CONFLICT" | "UNKNOWN";

export type KnowledgeItemType =
  | "document" | "decision" | "artifact" | "relationship"
  | "timeline_event" | "snapshot" | "requirement" | "architecture"
  | "commit" | "conversation" | "sprint" | "goal" | "rfc" | "adr"
  | "connector" | "specialist" | "implementation";

export type KnowledgeSourceType =
  | "github" | "base44" | "chatgpt" | "official_library"
  | "google_drive" | "local_file" | "memory" | "manual" | "unknown";

export type KnowledgeSourceProvider =
  | "GitHub" | "Base44" | "ChatGPT" | "OfficialLibrary"
  | "GoogleDrive" | "LocalFile" | "Memory" | "Manual";

export type KnowledgeSourceHealth = "available" | "degraded" | "unavailable" | "unchecked";

export type ConflictType =
  | "version_mismatch" | "decision_conflict" | "duplicate_requirement"
  | "timeline_conflict" | "duplicate_entity" | "schema_mismatch" | "content_divergence";

export type GraphNodeType =
  | "project" | "sprint" | "rfc" | "adr" | "connector" | "document"
  | "conversation" | "commit" | "decision" | "implementation"
  | "requirement" | "specialist" | "goal" | "artifact";

export type TimelineEventType =
  | "creation" | "modification" | "decision" | "implementation"
  | "migration" | "connector" | "commit" | "conversation" | "architecture";

export type ReconstructionStatus =
  | "idle" | "scanning" | "loading" | "merging" | "detecting_conflicts"
  | "building_graph" | "building_timeline" | "snapshotting" | "complete" | "error";

// ── Provenance ────────────────────────────────────────────────────────────────

export interface KnowledgeProvenance {
  sourceId: string;
  sourceName: string;
  sourceType: KnowledgeSourceType;
  provider: KnowledgeSourceProvider;
  originalIdentifier: string;
  importedAt: number;
  lastUpdatedAt: number;
  confidence: number;         // 0.0 – 1.0
  verificationStatus: VerificationStatus;
}

// ── Knowledge Items ───────────────────────────────────────────────────────────

export interface KnowledgeItem {
  readonly id: string;
  readonly type: KnowledgeItemType;
  readonly title: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly provenance: KnowledgeProvenance;
  readonly createdAt: number;
}

export interface KnowledgeDocument extends KnowledgeItem {
  readonly type: "document";
  readonly format: string;
  readonly sizeBytes: number;
  readonly checksum: string;
}

export interface KnowledgeDecision extends KnowledgeItem {
  readonly type: "decision";
  readonly rationale: string;
  readonly decidedAt: number;
  readonly decisionId: string;
  readonly alternatives: readonly string[];
  readonly consequences: readonly string[];
}

export interface KnowledgeArtifact extends KnowledgeItem {
  readonly type: "artifact";
  readonly artifactKind: string;
  readonly version: string;
  readonly filePath: string;
  readonly language: string;
}

export interface KnowledgeRelationship {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly relationshipType: string;
  readonly weight: number;
  readonly provenance: KnowledgeProvenance;
  readonly createdAt: number;
}

export interface KnowledgeTimelineEvent {
  readonly id: string;
  readonly eventType: TimelineEventType;
  readonly title: string;
  readonly description: string;
  readonly occurredAt: number;
  readonly relatedItemIds: readonly string[];
  readonly provenance: KnowledgeProvenance;
}

export interface KnowledgeSnapshot {
  readonly id: string;
  readonly capturedAt: number;
  readonly activeSprint: string | null;
  readonly architecture: readonly string[];
  readonly implementedArtifacts: readonly string[];
  readonly pendingWork: readonly string[];
  readonly openRisks: readonly string[];
  readonly dependencies: readonly string[];
  readonly relatedDecisions: readonly string[];
  readonly confidence: number;
  readonly itemCount: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
}

// ── Knowledge Graph ───────────────────────────────────────────────────────────

export interface GraphNode {
  readonly id: string;
  readonly type: GraphNodeType;
  readonly label: string;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly sourceId: string;
  readonly createdAt: number;
}

export interface GraphEdge {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly label: string;
  readonly weight: number;
  readonly createdAt: number;
}

// ── Knowledge Source Interface ────────────────────────────────────────────────

export interface KnowledgeSourceMetadata {
  id: string;
  name: string;
  provider: KnowledgeSourceProvider;
  type: KnowledgeSourceType;
  version: string;
  description: string;
}

export interface KnowledgeScanResult {
  sourceId: string;
  scannedAt: number;
  itemsFound: number;
  itemIds: string[];
  errors: string[];
  durationMs: number;
}

export interface KnowledgeLoadResult {
  sourceId: string;
  loadedAt: number;
  items: KnowledgeItem[];
  relationships: KnowledgeRelationship[];
  timelineEvents: KnowledgeTimelineEvent[];
  errors: string[];
  durationMs: number;
}

// ── Conflict ──────────────────────────────────────────────────────────────────

export interface KnowledgeConflict {
  readonly id: string;
  readonly type: ConflictType;
  readonly description: string;
  readonly itemAId: string;
  readonly itemBId: string;
  readonly sourceAId: string;
  readonly sourceBId: string;
  readonly detectedAt: number;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly resolved: boolean;
}

// ── Reconstruction Report ─────────────────────────────────────────────────────

export interface ReconstructionReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  readonly status: ReconstructionStatus;
  readonly sourcesScanned: number;
  readonly knowledgeExtracted: number;
  readonly conflictsDetected: number;
  readonly relationshipsCreated: number;
  readonly timelineEvents: number;
  readonly snapshotsGenerated: number;
  readonly graphNodes: number;
  readonly graphEdges: number;
  readonly confidenceScore: number;
  readonly coverage: number;
  readonly missingInformation: readonly string[];
  readonly errors: readonly string[];
  readonly sourcesSummary: readonly { sourceId: string; name: string; itemsLoaded: number; errors: number }[];
}

// ── Engine Health ─────────────────────────────────────────────────────────────

export interface KREHealthReport {
  status: KnowledgeSourceHealth;
  checkedAt: number;
  registeredSources: number;
  availableSources: number;
  totalItems: number;
  totalNodes: number;
  totalEdges: number;
  totalConflicts: number;
  lastReconstructionAt: number | null;
  details: string;
}