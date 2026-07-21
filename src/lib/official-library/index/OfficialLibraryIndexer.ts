/**
 * OfficialLibraryIndexer.ts — Sprint EF-41
 *
 * Orchestrates the full indexing lifecycle for the Official Library Index Engine.
 *
 * This is a NEW indexer at src/lib/official-library/index/ — distinct from the
 * existing src/lib/official-library/OfficialLibraryIndexer.ts (chunk indexer).
 *
 * Responsibilities:
 *   - Full index rebuild: scan all metas + chunks → OfficialLibraryIndex
 *   - Incremental update: detect changed documents → upsert only modified
 *   - Remove obsolete documents from the index
 *   - Delegate scanning to OfficialDocumentScanner
 *   - Rebuild OfficialLibraryRegistry after every index change
 *
 * What this does NOT do:
 *   - Load or parse documents (delegated to OfficialLibraryBootstrap)
 *   - Alter the Planner, UCME, or any runtime component
 *   - Perform retrieval queries
 */

import type { OfficialDocumentMeta, OfficialChunk } from "../OfficialLibraryTypes";
import type { OfficialDocumentMetadata } from "./OfficialDocumentMetadata";
import { OfficialDocumentScanner }  from "./OfficialDocumentScanner";
import { OfficialLibraryIndex }     from "./OfficialLibraryIndex";
import { OfficialLibraryRegistry }  from "./OfficialLibraryRegistry";

// ── Operation results ─────────────────────────────────────────────────────────

export interface IndexBuildResult {
  readonly success:        boolean;
  readonly totalDocuments: number;
  readonly addedCount:     number;
  readonly updatedCount:   number;
  readonly removedCount:   number;
  readonly scanWarnings:   number;
  readonly invalidDocs:    number;
  readonly durationMs:     number;
  readonly indexedAt:      string;
  readonly error?:         string;
}

export interface IndexUpdateResult {
  readonly updatedIds:   readonly string[];
  readonly removedIds:   readonly string[];
  readonly durationMs:   number;
  readonly updatedAt:    string;
}

// ── Indexer implementation ────────────────────────────────────────────────────

class OfficialLibraryIndexerEF41Impl {
  private _lastChecksums: Map<string, string> = new Map(); // docId → checksum
  private _lastResult: IndexBuildResult | null = null;

  get lastResult(): IndexBuildResult | null { return this._lastResult; }
  get isBuilt(): boolean { return OfficialLibraryIndex.isBuilt; }

  /**
   * Full rebuild of the Official Library Index from scratch.
   * Replaces all existing index entries.
   */
  async rebuildFull(
    metas: OfficialDocumentMeta[],
    chunks: OfficialChunk[],
  ): Promise<IndexBuildResult> {
    const t0 = Date.now();
    try {
      const scanReport = OfficialDocumentScanner.scanAll(metas, chunks);
      const validDocs  = scanReport.results.filter(r => r.isValid).map(r => r.metadata);
      const invalidDocs = scanReport.results.filter(r => !r.isValid).length;

      OfficialLibraryIndex.replaceAll(validDocs);

      // Update checksum cache
      this._lastChecksums.clear();
      for (const doc of validDocs) {
        this._lastChecksums.set(doc.id, doc.checksum);
      }

      // Rebuild Registry
      OfficialLibraryRegistry.rebuild();

      this._lastResult = Object.freeze({
        success:        true,
        totalDocuments: validDocs.length,
        addedCount:     validDocs.length,
        updatedCount:   0,
        removedCount:   0,
        scanWarnings:   scanReport.warnings,
        invalidDocs,
        durationMs:     Date.now() - t0,
        indexedAt:      new Date().toISOString(),
      });
    } catch (e) {
      this._lastResult = Object.freeze({
        success:        false,
        totalDocuments: 0,
        addedCount:     0,
        updatedCount:   0,
        removedCount:   0,
        scanWarnings:   0,
        invalidDocs:    0,
        durationMs:     Date.now() - t0,
        indexedAt:      new Date().toISOString(),
        error:          (e as Error).message,
      });
    }
    return this._lastResult!;
  }

  /**
   * Incremental update: re-scan only and upsert documents whose checksum has changed.
   * Documents present in the index but absent from metas are removed.
   */
  async updateIncremental(
    metas: OfficialDocumentMeta[],
    chunks: OfficialChunk[],
  ): Promise<IndexUpdateResult> {
    const t0 = Date.now();
    const updatedIds: string[] = [];
    const removedIds: string[]  = [];

    // Detect new / changed documents
    for (const meta of metas) {
      const scanResult = OfficialDocumentScanner.scanOne(meta, chunks, metas);
      if (!scanResult.isValid) continue;

      const newDoc = scanResult.metadata;
      const prevChecksum = this._lastChecksums.get(newDoc.id);

      if (prevChecksum !== newDoc.checksum) {
        OfficialLibraryIndex.upsert(newDoc);
        this._lastChecksums.set(newDoc.id, newDoc.checksum);
        updatedIds.push(newDoc.id);
      }
    }

    // Detect removed documents (present in index but absent from incoming metas)
    const incomingIds = new Set(metas.map(m => m.documentId));
    for (const [id] of this._lastChecksums.entries()) {
      if (!incomingIds.has(id)) {
        OfficialLibraryIndex.remove(id);
        this._lastChecksums.delete(id);
        removedIds.push(id);
      }
    }

    if (updatedIds.length > 0 || removedIds.length > 0) {
      OfficialLibraryRegistry.rebuild();
    }

    return Object.freeze({
      updatedIds:  Object.freeze(updatedIds),
      removedIds:  Object.freeze(removedIds),
      durationMs:  Date.now() - t0,
      updatedAt:   new Date().toISOString(),
    });
  }

  /**
   * Remove a single document from the index and registry.
   */
  removeDocument(docId: string): boolean {
    const removed = OfficialLibraryIndex.remove(docId);
    if (removed) {
      this._lastChecksums.delete(docId);
      OfficialLibraryRegistry.rebuild();
    }
    return removed;
  }

  /**
   * Check if a document needs re-indexing based on checksum comparison.
   */
  needsReindex(metadata: OfficialDocumentMetadata): boolean {
    const prev = this._lastChecksums.get(metadata.id);
    return prev !== metadata.checksum;
  }

  /** Reset all state (for testing). */
  reset(): void {
    this._lastChecksums.clear();
    this._lastResult = null;
    OfficialLibraryIndex.clear();
    OfficialLibraryRegistry.clear();
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_INDEXER_EF41__?: OfficialLibraryIndexerEF41Impl };
if (!G.__OL_INDEXER_EF41__) G.__OL_INDEXER_EF41__ = new OfficialLibraryIndexerEF41Impl();
export const OfficialLibraryIndexerEF41: OfficialLibraryIndexerEF41Impl = G.__OL_INDEXER_EF41__;