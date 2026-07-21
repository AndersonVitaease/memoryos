/**
 * index.ts — Official Library Index Engine barrel
 * Sprint EF-41
 *
 * Public API for the EF-41 Index Engine.
 * Import from this file — never from individual modules directly.
 */

export type { OfficialDocumentMetadata, DocumentRelationship, OfficialDocumentCategory, OfficialDocumentStatus, OfficialDocumentType } from "./OfficialDocumentMetadata";
export { computeChecksum, deriveCategory, deriveDocumentType, extractKeywords } from "./OfficialDocumentMetadata";

export type { IndexIntegrityReport, IndexQuery, OfficialIndexStats } from "./OfficialLibraryIndex";
export { OfficialLibraryIndex } from "./OfficialLibraryIndex";

export type { VersionEntry, CategoryEntry, RegistrySnapshot } from "./OfficialLibraryRegistry";
export { OfficialLibraryRegistry } from "./OfficialLibraryRegistry";

export type { ScanResult, ScanReport } from "./OfficialDocumentScanner";
export { OfficialDocumentScanner } from "./OfficialDocumentScanner";

export type { IndexBuildResult, IndexUpdateResult } from "./OfficialLibraryIndexer";
export { OfficialLibraryIndexerEF41 } from "./OfficialLibraryIndexer";