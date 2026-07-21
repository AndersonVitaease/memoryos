/**
 * OfficialDocumentScanner.ts — Sprint EF-41A (Refinement 3)
 *
 * Single responsibility: validate and collect raw information from documents.
 *
 * What changed in EF-41A:
 *   - Metadata construction delegated to OfficialMetadataBuilder
 *   - Internal structures (OfficialDocumentMeta, OfficialChunk) accessed
 *     exclusively through OfficialLibraryAdapter
 *   - Scanner no longer calls deriveCategory, deriveDocumentType, computeChecksum,
 *     or extractKeywords directly
 *
 * Responsibilities:
 *   1. Receive raw inputs via OfficialLibraryAdapter
 *   2. Validate structure (name, version, path, chunks present)
 *   3. Emit ScanResult per document — validation flags + metadata from Builder
 *
 * What this does NOT do:
 *   - Build metadata (OfficialMetadataBuilder's job)
 *   - Classify categories or types (ClassificationStrategies' job)
 *   - Compute checksums or keywords (OfficialMetadataBuilder's job)
 *   - Index or store (OfficialLibraryIndexOrchestrator's job)
 *
 * SRP: scan → validate → delegate to builder → emit ScanResult.
 */

import type { OfficialDocumentMeta, OfficialChunk } from "../OfficialLibraryTypes";
import type { OfficialDocumentMetadata }             from "./OfficialDocumentMetadata";
import { OfficialLibraryAdapter }                    from "./OfficialLibraryAdapter";
import { OfficialMetadataBuilder }                   from "./OfficialMetadataBuilder";
import type { RawDocumentInput, RawChunkInput }      from "./OfficialLibraryAdapter";

// ── Scan result contracts ─────────────────────────────────────────────────────

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

// ── Validation (Scanner's sole remaining logic) ───────────────────────────────

function validateRaw(doc: RawDocumentInput, chunks: readonly RawChunkInput[]): string[] {
  const warnings: string[] = [];

  if (!doc.name || doc.name.trim().length === 0) {
    warnings.push(`[${doc.id}] Missing document name`);
  }
  if (!doc.version || doc.version.trim().length === 0) {
    warnings.push(`[${doc.id}] Missing version`);
  }
  if (!doc.path || doc.path.trim().length === 0) {
    warnings.push(`[${doc.id}] Missing file path`);
  }
  if (chunks.length === 0) {
    warnings.push(`[${doc.id}] No chunks produced — document may be empty or unparseable`);
  }

  return warnings;
}

// ── Scanner ───────────────────────────────────────────────────────────────────

class OfficialDocumentScannerImpl {

  /**
   * Scan all documents. Entry point called by OfficialLibraryIndexOrchestrator.
   * Adapts internal types via OfficialLibraryAdapter before processing.
   */
  scanAll(
    metas: OfficialDocumentMeta[],
    chunks: OfficialChunk[],
  ): ScanReport {
    const t0 = Date.now();

    const rawDocs   = OfficialLibraryAdapter.adaptMetas(metas);
    const rawChunks = OfficialLibraryAdapter.adaptChunks(chunks);

    const results: ScanResult[] = rawDocs.map(doc =>
      this._scanOne(doc, rawChunks, rawDocs)
    );

    const valid    = results.filter(r => r.isValid).length;
    const invalid  = results.filter(r => !r.isValid).length;
    const warnings = results.reduce((s, r) => s + r.warnings.length, 0);

    return Object.freeze({
      scanned: metas.length,
      valid, invalid, warnings,
      durationMs: Date.now() - t0,
      scannedAt:  new Date().toISOString(),
      results:    Object.freeze(results),
    });
  }

  /**
   * Scan a single document. Used by OfficialLibraryIndexOrchestrator
   * for incremental updates.
   */
  scanOne(
    meta: OfficialDocumentMeta,
    chunks: OfficialChunk[],
    allMetas: OfficialDocumentMeta[],
  ): ScanResult {
    const rawDoc    = OfficialLibraryAdapter.adaptMeta(meta);
    const rawChunks = OfficialLibraryAdapter.adaptChunks(chunks);
    const allRaw    = OfficialLibraryAdapter.adaptMetas(allMetas);
    return this._scanOne(rawDoc, rawChunks, allRaw);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _scanOne(
    doc: RawDocumentInput,
    allChunks: readonly RawChunkInput[],
    allDocs: readonly RawDocumentInput[],
  ): ScanResult {
    const docChunks = OfficialLibraryAdapter.chunksFor(doc.id, allChunks);
    const warnings  = validateRaw(doc, docChunks);
    const isValid   = warnings.length === 0 || warnings.every(w => w.includes("No chunks"));

    const metadata = OfficialMetadataBuilder.build({ doc, chunks: docChunks, allDocs });

    return Object.freeze({ metadata, isValid, warnings: Object.freeze(warnings) });
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_SCANNER__?: OfficialDocumentScannerImpl };
if (!G.__OL_SCANNER__) G.__OL_SCANNER__ = new OfficialDocumentScannerImpl();
export const OfficialDocumentScanner: OfficialDocumentScannerImpl = G.__OL_SCANNER__;