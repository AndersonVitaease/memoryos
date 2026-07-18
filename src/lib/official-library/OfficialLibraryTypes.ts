/**
 * OfficialLibraryTypes.ts — Sprint EF-7.2.0
 *
 * All types for the Official Library integration.
 * Zero external dependencies — only primitive types and MemoryEvidence extension.
 */

// ── Authority Enum ────────────────────────────────────────────────────────────

export enum MemoryAuthority {
  OFFICIAL  = "OFFICIAL",   // MemoryOS Official Library (highest)
  VERIFIED  = "VERIFIED",   // Verified by engineering review
  LEARNED   = "LEARNED",    // Learned from usage patterns
  USER      = "USER",       // Provided by user
  EXTERNAL  = "EXTERNAL",   // From external connectors (lowest)
}

/** Authority precedence (higher = more authoritative) */
export const AUTHORITY_RANK: Record<MemoryAuthority, number> = {
  [MemoryAuthority.OFFICIAL]:  100,
  [MemoryAuthority.VERIFIED]:   80,
  [MemoryAuthority.LEARNED]:    60,
  [MemoryAuthority.USER]:       40,
  [MemoryAuthority.EXTERNAL]:   20,
};

// ── Source Type Enum ──────────────────────────────────────────────────────────

export enum MemorySourceType {
  OFFICIAL_LIBRARY = "OFFICIAL_LIBRARY",
  CONVERSATION     = "CONVERSATION",
  KNOWLEDGE_GRAPH  = "KNOWLEDGE_GRAPH",
  GOOGLE_DRIVE     = "GOOGLE_DRIVE",
  GMAIL            = "GMAIL",
  EXTERNAL         = "EXTERNAL",
}

// ── Document Metadata ─────────────────────────────────────────────────────────

export interface OfficialDocumentMeta {
  readonly documentId:   string;
  readonly documentName: string;
  readonly version:      string;
  readonly createdAt:    string;
  readonly updatedAt:    string;
  readonly deprecated:   boolean;
  readonly supersedes:   string | null;   // documentId this supersedes
  readonly supersededBy: string | null;   // documentId that supersedes this
  readonly authority:    MemoryAuthority;
  readonly tags:         string[];
  readonly path:         string;          // e.g. "src/docs/00-official-library/MAS-..."
}

// ── Chunk ─────────────────────────────────────────────────────────────────────

export interface OfficialChunk {
  readonly id:          string;
  readonly documentId:  string;
  readonly documentName: string;
  readonly version:     string;
  readonly chapter:     string;
  readonly section:     string;
  readonly title:       string;
  readonly content:     string;
  readonly summary:     string;
  readonly authority:   MemoryAuthority;
  readonly sourceType:  MemorySourceType;
  readonly createdAt:   string;
  readonly updatedAt:   string;
  readonly tags:        string[];
  readonly metadata:    Record<string, unknown>;
}

// ── Citation ──────────────────────────────────────────────────────────────────

export interface OfficialCitation {
  readonly sourceType:     MemorySourceType;
  readonly documentId:     string;
  readonly documentName:   string;
  readonly chapter:        string;
  readonly section:        string;
  readonly version:        string;
  readonly authority:      MemoryAuthority;
}

// ── Knowledge Graph Node ──────────────────────────────────────────────────────

export interface KnowledgeGraphNode {
  readonly id:         string;
  readonly label:      string;
  readonly type:       KnowledgeNodeType;
  readonly documentId: string;
  readonly version:    string;
  readonly tags:       string[];
}

export type KnowledgeNodeType =
  | "document"
  | "component"
  | "concept"
  | "constraint"
  | "decision"
  | "principle";

export interface KnowledgeGraphEdge {
  readonly from:        string;  // node id
  readonly to:          string;  // node id
  readonly relationship: KnowledgeEdgeType;
  readonly strength:    number;  // 0-1
}

export type KnowledgeEdgeType =
  | "references"
  | "implements"
  | "extends"
  | "constrains"
  | "supersedes"
  | "documents"
  | "governs";

// ── Guard Conflict ────────────────────────────────────────────────────────────

export interface OfficialGuardConflict {
  readonly id:              string;
  readonly detectedAt:      string;
  readonly challengerSource: string;
  readonly officialDocumentId: string;
  readonly officialSection:  string;
  readonly description:      string;
  readonly resolution:       "official_preserved" | "pending";
  readonly explanation:      string;
}

// ── Extended MemoryEvidence for Official Library ──────────────────────────────
// Backward compatible — authority/citation are optional fields in metadata
// so existing MemoryEvidence consumers are not affected.

export interface OfficialMemoryEvidence {
  readonly authority:   MemoryAuthority;
  readonly sourceType:  MemorySourceType;
  readonly citation:    OfficialCitation;
}

// ── Index Stats ───────────────────────────────────────────────────────────────

export interface OfficialLibraryStats {
  readonly documentCount: number;
  readonly chunkCount:    number;
  readonly totalTokens:   number;
  readonly lastIndexedAt: string | null;
  readonly versions:      string[];
  readonly authorities:   Record<string, number>;
}

// ── Watch Event ───────────────────────────────────────────────────────────────

export interface WatchEvent {
  readonly type:       "reindex" | "invalidate" | "update" | "version";
  readonly documentId: string;
  readonly triggeredAt: string;
  readonly reason:     string;
}