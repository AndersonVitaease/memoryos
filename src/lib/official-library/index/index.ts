/**
 * index.ts — Official Library Index Engine barrel
 * Sprint EF-41 / EF-41A
 *
 * Public API for the Index Engine.
 * Import from this file — never from individual modules directly.
 *
 * EF-41A additions:
 *   - OfficialLibraryAdapter   (Refinement 5)
 *   - ClassificationStrategies (Refinement 4)
 *   - OfficialMetadataBuilder  (Refinement 3)
 *   - OfficialLibraryIndexOrchestrator (Refinement 1 — renamed from Indexer)
 *   - OfficialLibraryIndexerEF41 alias preserved for test backward-compatibility
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  OfficialDocumentMetadata,
  DocumentRelationship,
  OfficialDocumentCategory,
  OfficialDocumentStatus,
  OfficialDocumentType,
} from "./OfficialDocumentMetadata";
export { computeChecksum, deriveCategory, deriveDocumentType, extractKeywords } from "./OfficialDocumentMetadata";

export type { IndexIntegrityReport, IndexQuery, OfficialIndexStats } from "./OfficialLibraryIndex";
export { OfficialLibraryIndex } from "./OfficialLibraryIndex";

export type { VersionEntry, CategoryEntry, RegistrySnapshot } from "./OfficialLibraryRegistry";
export { OfficialLibraryRegistry } from "./OfficialLibraryRegistry";

export type { ScanResult, ScanReport } from "./OfficialDocumentScanner";
export { OfficialDocumentScanner } from "./OfficialDocumentScanner";

export type { IndexBuildResult, IndexUpdateResult } from "./OfficialLibraryIndexOrchestrator";
export { OfficialLibraryIndexOrchestrator, OfficialLibraryIndexerEF41 } from "./OfficialLibraryIndexOrchestrator";

// ── EF-41A additions ──────────────────────────────────────────────────────────
export type { RawDocumentInput, RawChunkInput } from "./OfficialLibraryAdapter";
export { OfficialLibraryAdapter } from "./OfficialLibraryAdapter";

export { CategoryStrategy, DocumentTypeStrategy } from "./ClassificationStrategies";

export type { MetadataBuildInput } from "./OfficialMetadataBuilder";
export { OfficialMetadataBuilder } from "./OfficialMetadataBuilder";