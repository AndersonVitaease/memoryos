/**
 * OfficialLibraryAdapter.ts — Sprint EF-41A (Refinement 5)
 *
 * Adapter layer between the Official Library internal storage structures
 * (OfficialDocumentMeta, OfficialChunk) and the Index Engine contracts
 * (RawDocumentInput, RawChunkInput).
 *
 * Responsibilities:
 *   - Convert OfficialDocumentMeta → RawDocumentInput
 *   - Convert OfficialChunk → RawChunkInput
 *   - Isolate the Index Engine from Official Library internal model changes
 *
 * The Retrieval Engine and future consumers MUST depend on this adapter,
 * never on OfficialDocumentMeta or OfficialChunk directly.
 *
 * SRP: adapt — never scan, build, index, or retrieve.
 */

import type { OfficialDocumentMeta, OfficialChunk } from "../OfficialLibraryTypes";

// ── Scanner-facing contracts (adapter output) ─────────────────────────────────

/** Normalized document descriptor consumed by OfficialDocumentScanner. */
export interface RawDocumentInput {
  readonly id:           string;
  readonly name:         string;
  readonly version:      string;
  readonly path:         string;
  readonly tags:         readonly string[];
  readonly deprecated:   boolean;
  readonly supersedes:   string | null;
  readonly supersededBy: string | null;
  readonly createdAt:    string;
  readonly updatedAt:    string;
}

/** Normalized chunk descriptor consumed by OfficialMetadataBuilder. */
export interface RawChunkInput {
  readonly id:       string;
  readonly docId:    string;
  readonly content:  string;
}

// ── Adapter implementation ────────────────────────────────────────────────────

class OfficialLibraryAdapterImpl {

  /** Convert a single OfficialDocumentMeta to RawDocumentInput. */
  adaptMeta(meta: OfficialDocumentMeta): RawDocumentInput {
    return Object.freeze({
      id:           meta.documentId,
      name:         meta.documentName,
      version:      meta.version,
      path:         meta.path,
      tags:         Object.freeze([...(meta.tags ?? [])]),
      deprecated:   meta.deprecated,
      supersedes:   meta.supersedes ?? null,
      supersededBy: meta.supersededBy ?? null,
      createdAt:    meta.createdAt,
      updatedAt:    meta.updatedAt,
    });
  }

  /** Convert an array of OfficialDocumentMeta to RawDocumentInput[]. */
  adaptMetas(metas: OfficialDocumentMeta[]): RawDocumentInput[] {
    return metas.map(m => this.adaptMeta(m));
  }

  /** Convert a single OfficialChunk to RawChunkInput. */
  adaptChunk(chunk: OfficialChunk): RawChunkInput {
    return Object.freeze({
      id:      chunk.id,
      docId:   chunk.documentId,
      content: chunk.content,
    });
  }

  /** Convert an array of OfficialChunk to RawChunkInput[]. */
  adaptChunks(chunks: OfficialChunk[]): RawChunkInput[] {
    return chunks.map(c => this.adaptChunk(c));
  }

  /**
   * Filter chunks belonging to a specific document.
   * Convenience method used by MetadataBuilder and Scanner.
   */
  chunksFor(docId: string, chunks: RawChunkInput[]): RawChunkInput[] {
    return chunks.filter(c => c.docId === docId);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_ADAPTER__?: OfficialLibraryAdapterImpl };
if (!G.__OL_ADAPTER__) G.__OL_ADAPTER__ = new OfficialLibraryAdapterImpl();
export const OfficialLibraryAdapter: OfficialLibraryAdapterImpl = G.__OL_ADAPTER__;