/**
 * ChunkIndex.ts — Sprint EF-42.5
 *
 * SRP: persist and expose official chunks.
 * Never parses, never builds, never retrieves (scoring/ranking).
 *
 * API:
 *   store(chunks)      — persist one document's chunks (replaces existing)
 *   getChunk(id)       — single chunk by id
 *   getChunks(docId)   — all chunks for a document
 *   getAll()           — all chunks across all documents
 *   count()            — total chunk count
 *   clear()            — remove all chunks
 *   clearDocument(id)  — remove chunks for one document
 *   exists(id)         — check chunk existence
 *   stats()            — aggregate statistics
 *
 * HMR-safe singleton.
 */

import type { OfficialContentChunk } from "./ChunkBuilder";

export interface ChunkIndexStats {
  readonly totalChunks:    number;
  readonly totalDocuments: number;
  readonly totalTokens:    number;
  readonly documentIds:    readonly string[];
  readonly avgChunksPerDoc: number;
}

class ChunkIndexImpl {
  /** chunkId → chunk */
  private _byId  = new Map<string, OfficialContentChunk>();
  /** documentId → chunkId[] */
  private _byDoc = new Map<string, string[]>();

  store(chunks: OfficialContentChunk[]): void {
    if (chunks.length === 0) return;
    const docId = chunks[0].documentId;
    // Remove previous chunks for this document
    this.clearDocument(docId);
    const ids: string[] = [];
    for (const chunk of chunks) {
      this._byId.set(chunk.id, chunk);
      ids.push(chunk.id);
    }
    this._byDoc.set(docId, ids);
  }

  getChunk(id: string): OfficialContentChunk | null {
    return this._byId.get(id) ?? null;
  }

  getChunks(documentId: string): OfficialContentChunk[] {
    const ids = this._byDoc.get(documentId) ?? [];
    return ids.map(id => this._byId.get(id)!).filter(Boolean);
  }

  getAll(): OfficialContentChunk[] {
    return [...this._byId.values()];
  }

  count(): number {
    return this._byId.size;
  }

  exists(id: string): boolean {
    return this._byId.has(id);
  }

  clear(): void {
    this._byId.clear();
    this._byDoc.clear();
  }

  clearDocument(documentId: string): void {
    const ids = this._byDoc.get(documentId) ?? [];
    for (const id of ids) this._byId.delete(id);
    this._byDoc.delete(documentId);
  }

  stats(): ChunkIndexStats {
    const docIds = [...this._byDoc.keys()];
    const totalChunks = this._byId.size;
    const totalTokens = [...this._byId.values()].reduce((s, c) => s + c.tokenEstimate, 0);
    return Object.freeze({
      totalChunks,
      totalDocuments: docIds.length,
      totalTokens,
      documentIds:    Object.freeze(docIds),
      avgChunksPerDoc: docIds.length > 0 ? Math.round(totalChunks / docIds.length) : 0,
    });
  }
}

const G = globalThis as typeof globalThis & { __OL_CHUNK_INDEX__?: ChunkIndexImpl };
if (!G.__OL_CHUNK_INDEX__) G.__OL_CHUNK_INDEX__ = new ChunkIndexImpl();
export const ChunkIndex: ChunkIndexImpl = G.__OL_CHUNK_INDEX__;