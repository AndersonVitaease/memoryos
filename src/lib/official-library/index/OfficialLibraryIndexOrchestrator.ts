/**
 * OfficialLibraryIndexOrchestrator.ts — Sprint EF-41A (Refinement 1)
 *
 * Renamed from OfficialLibraryIndexer.ts to eliminate the naming ambiguity
 * with the existing src/lib/official-library/OfficialLibraryIndexer.ts
 * (which is the chunk-level indexer used by the Bootstrap pipeline).
 *
 * Naming intent:
 *   OfficialLibraryIndexer.ts (existing, untouched)
 *     → Sprint EF-7.x — Chunk indexer: stores OfficialChunk[], OfficialDocumentMeta[]
 *
 *   OfficialLibraryIndexOrchestrator.ts (this file, EF-41A)
 *     → Sprint EF-41  — Metadata indexing lifecycle: scan → index → registry
 *
 * What changed in EF-41A (Refinement 2):
 *   - Registry.rebuild() now receives the document list explicitly.
 *   - The Orchestrator is the only component that reads from OfficialLibraryIndex
 *     and passes the result to OfficialLibraryRegistry.
 *   - Registry no longer has a direct dependency on OfficialLibraryIndex.
 *
 * Responsibilities:
 *   - Full index rebuild: scan all → OfficialLibraryIndex → OfficialLibraryRegistry
 *   - Incremental update: checksum-diff → upsert changed → refresh Registry
 *   - Remove obsolete documents from Index + Registry
 *
 * What this does NOT do:
 *   - Load or parse raw documents (Bootstrap's job)
 *   - Validate individual documents (Scanner's job)
 *   - Build metadata (MetadataBuilder's job)
 *   - Perform retrieval queries
 */

import type { OfficialDocumentMeta, OfficialChunk } from "../OfficialLibraryTypes";
import type { OfficialDocumentMetadata }             from "./OfficialDocumentMetadata";
import { OfficialDocumentScanner }                   from "./OfficialDocumentScanner";
import { OfficialLibraryIndex }                      from "./OfficialLibraryIndex";
import { OfficialLibraryRegistry }                   from "./OfficialLibraryRegistry";

// ── Operation result contracts ────────────────────────────────────────────────

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
  readonly updatedIds:  readonly string[];
  readonly removedIds:  readonly string[];
  readonly durationMs:  number;
  readonly updatedAt:   string;
}

// ── Orchestrator implementation ───────────────────────────────────────────────

class OfficialLibraryIndexOrchestratorImpl {
  private _lastChecksums: Map<string, string> = new Map();
  private _lastResult:    IndexBuildResult | null = null;

  get lastResult(): IndexBuildResult | null { return this._lastResult; }
  get isBuilt(): boolean { return OfficialLibraryIndex.isBuilt; }

  /**
   * Full rebuild of the Official Library Index from scratch.
   * Replaces all existing index entries and refreshes the Registry.
   */
  async rebuildFull(
    metas: OfficialDocumentMeta[],
    chunks: OfficialChunk[],
  ): Promise<IndexBuildResult> {
    const t0 = Date.now();
    try {
      const scanReport  = OfficialDocumentScanner.scanAll(metas, chunks);
      const validDocs   = scanReport.results.filter(r => r.isValid).map(r => r.metadata);
      const invalidDocs = scanReport.results.filter(r => !r.isValid).length;

      // Write to Index
      OfficialLibraryIndex.replaceAll(validDocs);

      // Update checksum cache
      this._lastChecksums.clear();
      for (const doc of validDocs) this._lastChecksums.set(doc.id, doc.checksum);

      // Refresh Registry — pass docs explicitly (Refinement 2: no Index coupling)
      OfficialLibraryRegistry.rebuild(validDocs);

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
        success: false, totalDocuments: 0, addedCount: 0,
        updatedCount: 0, removedCount: 0, scanWarnings: 0, invalidDocs: 0,
        durationMs: Date.now() - t0, indexedAt: new Date().toISOString(),
        error: (e as Error).message,
      });
    }
    return this._lastResult!;
  }

  /**
   * Incremental update: re-scan only documents whose checksum changed.
   * Documents absent from incoming metas are removed.
   */
  async updateIncremental(
    metas: OfficialDocumentMeta[],
    chunks: OfficialChunk[],
  ): Promise<IndexUpdateResult> {
    const t0 = Date.now();
    const updatedIds: string[] = [];
    const removedIds: string[] = [];

    for (const meta of metas) {
      const scanResult = OfficialDocumentScanner.scanOne(meta, chunks, metas);
      if (!scanResult.isValid) continue;

      const newDoc       = scanResult.metadata;
      const prevChecksum = this._lastChecksums.get(newDoc.id);

      if (prevChecksum !== newDoc.checksum) {
        OfficialLibraryIndex.upsert(newDoc);
        this._lastChecksums.set(newDoc.id, newDoc.checksum);
        updatedIds.push(newDoc.id);
      }
    }

    const incomingIds = new Set(metas.map(m => m.documentId));
    for (const [id] of this._lastChecksums.entries()) {
      if (!incomingIds.has(id)) {
        OfficialLibraryIndex.remove(id);
        this._lastChecksums.delete(id);
        removedIds.push(id);
      }
    }

    if (updatedIds.length > 0 || removedIds.length > 0) {
      // Pass current index state explicitly to Registry (Refinement 2)
      OfficialLibraryRegistry.rebuild(OfficialLibraryIndex.getAll());
    }

    return Object.freeze({
      updatedIds: Object.freeze(updatedIds),
      removedIds: Object.freeze(removedIds),
      durationMs: Date.now() - t0,
      updatedAt:  new Date().toISOString(),
    });
  }

  /** Remove a single document from the Index and refresh the Registry. */
  removeDocument(docId: string): boolean {
    const removed = OfficialLibraryIndex.remove(docId);
    if (removed) {
      this._lastChecksums.delete(docId);
      OfficialLibraryRegistry.rebuild(OfficialLibraryIndex.getAll());
    }
    return removed;
  }

  /** Check if a document needs re-indexing based on checksum comparison. */
  needsReindex(metadata: OfficialDocumentMetadata): boolean {
    return this._lastChecksums.get(metadata.id) !== metadata.checksum;
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

const G = globalThis as typeof globalThis & { __OL_ORCHESTRATOR__?: OfficialLibraryIndexOrchestratorImpl };
if (!G.__OL_ORCHESTRATOR__) G.__OL_ORCHESTRATOR__ = new OfficialLibraryIndexOrchestratorImpl();
export const OfficialLibraryIndexOrchestrator: OfficialLibraryIndexOrchestratorImpl = G.__OL_ORCHESTRATOR__;

/**
 * Backward-compatible alias for EF-41 tests.
 * Tests import OfficialLibraryIndexerEF41 — this alias ensures they continue
 * to pass without modification (per EF-41A contract: zero test changes).
 */
export const OfficialLibraryIndexerEF41 = OfficialLibraryIndexOrchestrator;