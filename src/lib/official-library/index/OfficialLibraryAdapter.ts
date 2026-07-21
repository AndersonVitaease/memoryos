/**
 * OfficialLibraryAdapter.ts — Sprint EF-41A (Refinement 5) + EF-42
 *
 * Adapter layer between the Official Library internal storage structures
 * (OfficialDocumentMeta, OfficialChunk) and the Index Engine contracts
 * (RawDocumentInput, RawChunkInput).
 *
 * Responsibilities:
 *   - Convert OfficialDocumentMeta → RawDocumentInput
 *   - Convert OfficialChunk → RawChunkInput
 *   - Isolate the Index Engine from Official Library internal model changes
 *   - Synthesize representative OfficialChunks from indexed metadata (EF-42 Phase 1)
 *
 * The Retrieval Engine and future consumers MUST depend on this adapter,
 * never on OfficialDocumentMeta or OfficialChunk directly.
 *
 * SRP: adapt — never scan, build, index, or retrieve.
 */

import type { OfficialDocumentMeta, OfficialChunk } from "../OfficialLibraryTypes";
import type { OfficialDocumentMetadata }             from "./OfficialDocumentMetadata";

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

  /**
   * Synthesize representative OfficialChunk objects from an indexed document's
   * metadata (keywords, title, path, category).
   *
   * Used by EF-42 Phase 1 Retrieval Engine when actual chunk persistence
   * (EF-42 Phase 2) is not yet available.
   *
   * Each keyword group is collapsed into a synthetic chunk so ChunkSelector
   * can operate on real content without requiring full document parsing.
   */
  syntheticChunksFrom(doc: OfficialDocumentMetadata): OfficialChunk[] {
    const base: Omit<OfficialChunk, "id" | "content" | "tags" | "chapter" | "section" | "title" | "summary"> = {
      documentId:    doc.id,
      documentName:  doc.title,
      version:       doc.version,
      authority:     "OFFICIAL" as OfficialChunk["authority"],
      sourceType:    "OFFICIAL_LIBRARY" as OfficialChunk["sourceType"],
      createdAt:     doc.updatedAt,
      updatedAt:     doc.updatedAt,
      metadata:      {},
    };

    const chunks: OfficialChunk[] = [];

    // Chunk 0: title + category + type
    chunks.push({
      ...base,
      id:      `${doc.id}::title`,
      chapter: "title",
      section: "header",
      title:   doc.title,
      summary: doc.category,
      content: `${doc.title} ${doc.category} ${doc.type}`,
      tags:    [doc.category, doc.type, "title"],
    });

    // Chunk 1: keyword summary
    if (doc.keywords.length > 0) {
      chunks.push({
        ...base,
        id:      `${doc.id}::keywords`,
        chapter: "keywords",
        section: "metadata",
        title:   "Keywords",
        summary: doc.keywords.slice(0, 3).join(", "),
        content: doc.keywords.join(" "),
        tags:    [...doc.keywords.slice(0, 5), "keywords"],
      });
    }

    // Chunk 2: version + status + path
    chunks.push({
      ...base,
      id:      `${doc.id}::meta`,
      chapter: "metadata",
      section: "version",
      title:   "Metadata",
      summary: `v${doc.version} ${doc.status}`,
      content: `version ${doc.version} status ${doc.status} path ${doc.path}`,
      tags:    [doc.status, doc.version, "metadata"],
    });

    return chunks;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_ADAPTER__?: OfficialLibraryAdapterImpl };
if (!G.__OL_ADAPTER__) G.__OL_ADAPTER__ = new OfficialLibraryAdapterImpl();
export const OfficialLibraryAdapter: OfficialLibraryAdapterImpl = G.__OL_ADAPTER__;