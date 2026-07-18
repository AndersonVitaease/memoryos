/**
 * OfficialLibraryIndexer.ts — Sprint EF-7.2.1 (refactored from EF-7.2.0)
 *
 * Responsibilities:
 *   - Maintain the in-memory chunk index
 *   - Provide search via injected SearchStrategy
 *   - Expose stats
 *
 * What was REMOVED (EF-7.2.1):
 *   - EMBEDDED_FALLBACK (never duplicate documentation in TS)
 *   - Hardcoded catalog (moved to OfficialLibraryCatalog.ts)
 *   - makeCatalog() function
 *   - Internal document loading logic (moved to DocumentLoader.ts)
 *
 * Bootstrap delegates to OfficialLibraryBootstrap which calls _injectFromBootstrap().
 * The Indexer itself only knows about chunks and metas — not how they were loaded.
 */

import type { OfficialChunk, OfficialDocumentMeta, OfficialLibraryStats } from "./OfficialLibraryTypes";
import { defaultSearchStrategy, type SearchStrategy } from "./SearchStrategy";

// ── Embedding interface (future — kept for API stability) ─────────────────────

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  similarity(a: number[], b: number[]): number;
}

// ── Indexer Implementation ────────────────────────────────────────────────────

class OfficialLibraryIndexerImpl {
  private _chunks:    OfficialChunk[]                      = [];
  private _metas:     Map<string, OfficialDocumentMeta>    = new Map();
  private _indexed:   boolean                              = false;
  private _indexedAt: string | null                        = null;
  private _strategy:  SearchStrategy                       = defaultSearchStrategy;

  /** Inject a SearchStrategy (DIP). Default = KeywordSearchStrategy. */
  setSearchStrategy(strategy: SearchStrategy): void {
    this._strategy = strategy;
  }

  get activeStrategyId(): string { return this._strategy.strategyId; }

  /**
   * Initialize via the Bootstrap pipeline.
   * Falls back to the bootstrap if not already injected.
   */
  async initialize(): Promise<void> {
    if (this._indexed) return;
    const { OfficialLibraryBootstrap } = await import("./OfficialLibraryBootstrap");
    await OfficialLibraryBootstrap.run();
    // _injectFromBootstrap will have been called by Bootstrap if successful.
    // Mark as initialized even if bootstrap produced 0 docs (diagnostic-only).
    if (!this._indexed) {
      this._indexed  = true;
      this._indexedAt = new Date().toISOString();
    }
  }

  /**
   * Called exclusively by OfficialLibraryBootstrap.
   * Injects pre-built chunks and metas — no loading or parsing here.
   */
  _injectFromBootstrap(chunks: OfficialChunk[], metas: OfficialDocumentMeta[]): void {
    this._chunks    = chunks;
    this._metas     = new Map(metas.map(m => [m.documentId, m]));
    this._indexed   = true;
    this._indexedAt = new Date().toISOString();
  }

  get isIndexed(): boolean        { return this._indexed; }
  get indexedAt(): string | null  { return this._indexedAt; }
  get chunkCount(): number        { return this._chunks.length; }
  get documentCount(): number     { return this._metas.size; }

  getChunks(): OfficialChunk[]            { return [...this._chunks]; }
  getMeta(id: string): OfficialDocumentMeta | null { return this._metas.get(id) ?? null; }
  getAllMeta(): OfficialDocumentMeta[]     { return [...this._metas.values()]; }

  /** Search via injected strategy (default: keyword). */
  search(queryText: string, maxResults = 10): OfficialChunk[] {
    if (!this._indexed || this._chunks.length === 0) return [];
    return this._strategy.search(queryText, this._chunks, maxResults);
  }

  /** Force reindex a single document via Bootstrap. */
  async reindex(documentId: string): Promise<boolean> {
    try {
      const { OfficialLibraryBootstrap } = await import("./OfficialLibraryBootstrap");
      await OfficialLibraryBootstrap.run(true);
      return true;
    } catch {
      return false;
    }
  }

  stats(): OfficialLibraryStats {
    const authorities: Record<string, number> = {};
    for (const meta of this._metas.values()) {
      authorities[meta.authority] = (authorities[meta.authority] ?? 0) + 1;
    }
    const versions = [...new Set(this._chunks.map(c => c.version))].sort();
    return {
      documentCount: this._metas.size,
      chunkCount:    this._chunks.length,
      totalTokens:   this._chunks.reduce((s, c) => s + Math.ceil(c.content.length / 4), 0),
      lastIndexedAt: this._indexedAt,
      versions,
      authorities,
    };
  }

  /** Reset for testing / Bootstrap. */
  _reset(): void {
    this._chunks    = [];
    this._metas     = new Map();
    this._indexed   = false;
    this._indexedAt = null;
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_INDEXER__?: OfficialLibraryIndexerImpl };
if (!G.__OL_INDEXER__) G.__OL_INDEXER__ = new OfficialLibraryIndexerImpl();
export const OfficialLibraryIndexer: OfficialLibraryIndexerImpl = G.__OL_INDEXER__;