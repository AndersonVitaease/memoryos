/**
 * ContentIndexer.ts — Sprint EF-42.5
 *
 * SRP: orchestrate Parser → ChunkBuilder → ChunkMetadataBuilder → ChunkIndex.
 * Never responds to queries, never talks to Planner, never scores.
 *
 * Fluxo:
 *   RawDocumentInput
 *     → OfficialDocumentParser  (clean + extract)
 *     → ChunkBuilder            (split into 300–800 token chunks)
 *     → ChunkIndex.store()      (persist)
 */

import { OfficialDocumentParser } from "./OfficialDocumentParser";
import type { RawDocumentInput }  from "./OfficialDocumentParser";
import { ChunkBuilder }           from "./ChunkBuilder";
import { ChunkIndex }             from "./ChunkIndex";
import type { OfficialContentChunk } from "./ChunkBuilder";

export interface IndexResult {
  readonly documentId: string;
  readonly chunksCreated: number;
  readonly totalTokens:   number;
  readonly durationMs:    number;
  readonly success:       boolean;
  readonly error?:        string;
}

export interface BulkIndexResult {
  readonly results:      readonly IndexResult[];
  readonly totalDocs:    number;
  readonly totalChunks:  number;
  readonly totalTokens:  number;
  readonly durationMs:   number;
  readonly failedDocs:   number;
}

class ContentIndexerImpl {

  /** Index a single document. */
  index(raw: RawDocumentInput): IndexResult {
    const t0 = Date.now();
    try {
      const parsed = OfficialDocumentParser.parse(raw);
      const chunks = ChunkBuilder.build(parsed);
      ChunkIndex.store(chunks);
      const totalTokens = chunks.reduce((s, c) => s + c.tokenEstimate, 0);
      return Object.freeze({
        documentId:   raw.documentId,
        chunksCreated: chunks.length,
        totalTokens,
        durationMs:   Date.now() - t0,
        success:      true,
      });
    } catch (e) {
      return Object.freeze({
        documentId:    raw.documentId,
        chunksCreated: 0,
        totalTokens:   0,
        durationMs:    Date.now() - t0,
        success:       false,
        error:         (e as Error).message,
      });
    }
  }

  /** Index multiple documents in sequence. */
  indexAll(docs: RawDocumentInput[]): BulkIndexResult {
    const t0 = Date.now();
    const results: IndexResult[] = docs.map(d => this.index(d));
    const totalChunks = results.reduce((s, r) => s + r.chunksCreated, 0);
    const totalTokens = results.reduce((s, r) => s + r.totalTokens, 0);
    const failedDocs  = results.filter(r => !r.success).length;
    return Object.freeze({
      results:     Object.freeze(results),
      totalDocs:   docs.length,
      totalChunks,
      totalTokens,
      durationMs:  Date.now() - t0,
      failedDocs,
    });
  }

  /** Remove all chunks for a document and re-index. */
  reindex(raw: RawDocumentInput): IndexResult {
    ChunkIndex.clearDocument(raw.documentId);
    return this.index(raw);
  }
}

const G = globalThis as typeof globalThis & { __OL_CONTENT_INDEXER__?: ContentIndexerImpl };
if (!G.__OL_CONTENT_INDEXER__) G.__OL_CONTENT_INDEXER__ = new ContentIndexerImpl();
export const ContentIndexer: ContentIndexerImpl = G.__OL_CONTENT_INDEXER__;