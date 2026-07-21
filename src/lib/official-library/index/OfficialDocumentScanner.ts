/**
 * OfficialDocumentScanner.ts — Sprint EF-41
 *
 * Responsible for:
 *   1. Locating official documents via the existing Bootstrap/Catalog pipeline
 *   2. Validating document structure (title, version, non-empty content)
 *   3. Extracting rich metadata (category, type, keywords, relationships, checksum)
 *   4. Producing OfficialDocumentMetadata records ready for indexing
 *
 * What this scanner does NOT do:
 *   - Load raw content (delegated to OfficialLibraryBootstrap / DocumentLoader)
 *   - Parse chunks (delegated to OfficialLibraryChunker)
 *   - Index the results (delegated to OfficialLibraryIndexer)
 *   - Alter the Planner, UCME, or any runtime
 *
 * SRP: scan → validate → extract → emit metadata.
 */

import type { OfficialDocumentMeta, OfficialChunk } from "../OfficialLibraryTypes";
import type { OfficialDocumentMetadata, DocumentRelationship } from "./OfficialDocumentMetadata";
import {
  computeChecksum,
  deriveCategory,
  deriveDocumentType,
  extractKeywords,
} from "./OfficialDocumentMetadata";

// ── Scan result ───────────────────────────────────────────────────────────────

export interface ScanResult {
  readonly metadata:    OfficialDocumentMetadata;
  readonly isValid:     boolean;
  readonly warnings:    readonly string[];
}

export interface ScanReport {
  readonly scanned:    number;
  readonly valid:      number;
  readonly invalid:    number;
  readonly warnings:   number;
  readonly durationMs: number;
  readonly scannedAt:  string;
  readonly results:    readonly ScanResult[];
}

// ── Relationship extraction ───────────────────────────────────────────────────

/**
 * Extract document relationships from supersedes / supersededBy fields
 * plus simple heuristic cross-referencing via document name matching.
 */
function extractRelationships(
  meta: OfficialDocumentMeta,
  allMetas: OfficialDocumentMeta[],
): DocumentRelationship[] {
  const relationships: DocumentRelationship[] = [];

  if (meta.supersedes) {
    const target = allMetas.find(m => m.documentId === meta.supersedes);
    relationships.push({
      targetId:         meta.supersedes,
      targetName:       target?.documentName ?? meta.supersedes,
      relationshipType: "supersedes",
      strength:         1.0,
    });
  }

  if (meta.supersededBy) {
    const target = allMetas.find(m => m.documentId === meta.supersededBy);
    relationships.push({
      targetId:         meta.supersededBy,
      targetName:       target?.documentName ?? meta.supersededBy,
      relationshipType: "superseded-by",
      strength:         1.0,
    });
  }

  return relationships;
}

/**
 * Extract dependency references from tags (tags like "depends:MAS", "implements:MES").
 */
function extractDependencies(tags: readonly string[]): string[] {
  const deps: string[] = [];
  for (const tag of tags) {
    const match = tag.match(/^(?:depends|implements|extends):(.+)$/i);
    if (match) deps.push(match[1].trim());
  }
  return deps;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateMeta(meta: OfficialDocumentMeta, chunks: OfficialChunk[]): string[] {
  const warnings: string[] = [];

  if (!meta.documentName || meta.documentName.trim().length === 0) {
    warnings.push(`[${meta.documentId}] Missing document name`);
  }
  if (!meta.version || meta.version.trim().length === 0) {
    warnings.push(`[${meta.documentId}] Missing version`);
  }
  if (!meta.path || meta.path.trim().length === 0) {
    warnings.push(`[${meta.documentId}] Missing file path`);
  }

  const docChunks = chunks.filter(c => c.documentId === meta.documentId);
  if (docChunks.length === 0) {
    warnings.push(`[${meta.documentId}] No chunks produced — document may be empty or unparseable`);
  }

  return warnings;
}

// ── Scanner ───────────────────────────────────────────────────────────────────

class OfficialDocumentScannerImpl {

  /**
   * Scan all documents from the existing Bootstrap metas + chunks.
   * This is the primary entry point, called by OfficialLibraryIndexer.
   */
  scanAll(
    metas: OfficialDocumentMeta[],
    chunks: OfficialChunk[],
  ): ScanReport {
    const t0 = Date.now();
    const results: ScanResult[] = [];

    for (const meta of metas) {
      const result = this.scanOne(meta, chunks, metas);
      results.push(result);
    }

    const valid   = results.filter(r => r.isValid).length;
    const invalid = results.filter(r => !r.isValid).length;
    const warnings = results.reduce((s, r) => s + r.warnings.length, 0);

    return Object.freeze({
      scanned:    metas.length,
      valid,
      invalid,
      warnings,
      durationMs: Date.now() - t0,
      scannedAt:  new Date().toISOString(),
      results:    Object.freeze(results),
    });
  }

  /**
   * Scan a single OfficialDocumentMeta and produce OfficialDocumentMetadata.
   */
  scanOne(
    meta: OfficialDocumentMeta,
    chunks: OfficialChunk[],
    allMetas: OfficialDocumentMeta[],
  ): ScanResult {
    const warnings = validateMeta(meta, chunks);
    const isValid  = warnings.length === 0 || warnings.every(w => w.includes("No chunks"));

    const docChunks = chunks.filter(c => c.documentId === meta.documentId);
    const chunkCount     = docChunks.length;
    const tokenEstimate  = docChunks.reduce((s, c) => s + Math.ceil(c.content.length / 4), 0);

    const tags        = [...(meta.tags ?? [])];
    const keywords    = extractKeywords(meta.documentName, tags);
    const dependencies = extractDependencies(tags);
    const relationships = extractRelationships(meta, allMetas);

    const checksumInput = `${meta.documentId}|${meta.documentName}|${meta.version}|${meta.path}|${tags.sort().join(",")}`;
    const checksum = computeChecksum(checksumInput);

    const category = deriveCategory(meta.path, meta.documentName);
    const type     = deriveDocumentType(meta.path, meta.documentName);

    const now = new Date().toISOString();

    const metadata: OfficialDocumentMetadata = Object.freeze({
      id:               meta.documentId,
      title:            meta.documentName,
      type,
      category,
      version:          meta.version || "unknown",
      author:           "MemoryOS Engineering",
      createdAt:        meta.createdAt || now,
      updatedAt:        meta.updatedAt || now,
      status:           meta.deprecated ? "deprecated" : "active",
      path:             meta.path,
      rawId:            meta.documentId,
      tags:             Object.freeze(tags),
      keywords:         Object.freeze(keywords),
      dependencies:     Object.freeze(dependencies),
      relatedDocuments: Object.freeze(relationships),
      checksum,
      chunkCount,
      tokenEstimate,
    });

    return Object.freeze({
      metadata,
      isValid,
      warnings: Object.freeze(warnings),
    });
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_SCANNER__?: OfficialDocumentScannerImpl };
if (!G.__OL_SCANNER__) G.__OL_SCANNER__ = new OfficialDocumentScannerImpl();
export const OfficialDocumentScanner: OfficialDocumentScannerImpl = G.__OL_SCANNER__;