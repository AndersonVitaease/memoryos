/**
 * OfficialLibraryBootstrap.ts — Sprint EF-7.2.1
 *
 * Single responsibility: orchestrate the full Official Library initialization pipeline.
 * No other component should know this sequence.
 *
 * Pipeline:
 *   Catalog → Loader → Parser → Chunker → Indexer → KnowledgeGraph → Provider Ready
 */

import { OfficialLibraryCatalog }  from "./OfficialLibraryCatalog";
import { DocumentLoader }           from "./DocumentLoader";
import { OfficialLibraryParser }    from "./OfficialLibraryParser";
import { OfficialLibraryChunker }   from "./OfficialLibraryChunker";
import { OfficialLibraryIndexer }   from "./OfficialLibraryIndexer";
import { GraphBuilder }             from "./GraphBuilder";
import { GraphStorage }             from "./GraphStorage";
import { GraphQuery }               from "./GraphQuery";
import type { OfficialChunk, OfficialDocumentMeta } from "./OfficialLibraryTypes";

export interface BootstrapResult {
  readonly success:       boolean;
  readonly documentCount: number;
  readonly chunkCount:    number;
  readonly graphNodes:    number;
  readonly graphEdges:    number;
  readonly loadErrors:    { id: string; name: string; error: string }[];
  readonly durationMs:    number;
  readonly bootstrappedAt: string;
}

// ── Graph singletons (separated per SRP) ─────────────────────────────────────

const _graphStorage = new GraphStorage();
export const graphStorage = _graphStorage;
export const graphQuery   = new GraphQuery(_graphStorage);

// ── Bootstrap Implementation ──────────────────────────────────────────────────

class OfficialLibraryBootstrapImpl {
  private _result: BootstrapResult | null = null;
  private _running = false;

  get lastResult(): BootstrapResult | null { return this._result; }
  get isReady(): boolean { return this._result?.success === true; }

  async run(force = false): Promise<BootstrapResult> {
    if (this._result && !force) return this._result;
    if (this._running) {
      // Wait for ongoing bootstrap
      await new Promise<void>(resolve => {
        const interval = setInterval(() => {
          if (!this._running) { clearInterval(interval); resolve(); }
        }, 50);
      });
      if (this._result) return this._result;
    }

    this._running = true;
    const t0 = Date.now();

    try {
      // Step 1: Catalog — discover all documents automatically
      const sources = OfficialLibraryCatalog.discover();

      // Step 2: Loader — load raw content (SRP: only loads, no parsing)
      const loaded = await DocumentLoader.loadAll(sources);
      const successful = DocumentLoader.successful(loaded);
      const loadErrors = DocumentLoader.errors(loaded);

      // Step 3: Parser — raw → ParsedDocument
      const parsed = successful.map(doc =>
        OfficialLibraryParser.parse(doc.raw, doc.path, doc.name)
      );

      // Step 4: Chunker — ParsedDocument → OfficialChunk[]
      const allChunks: OfficialChunk[] = OfficialLibraryChunker.chunkAll(parsed);

      // Step 5: Indexer — populate the search index
      // Bypass the indexer's internal catalog (it was built with hardcoded entries).
      // We inject chunks and metas directly via the internal API.
      await OfficialLibraryIndexer._reset();
      const metas: OfficialDocumentMeta[] = parsed.map(p => ({
        documentId:   p.documentId,
        documentName: p.documentName,
        version:      p.version,
        createdAt:    p.detectedAt,
        updatedAt:    p.detectedAt,
        deprecated:   false,
        supersedes:   null,
        supersededBy: null,
        authority:    p.authority,
        tags:         p.tags,
        path:         p.path,
      }));
      OfficialLibraryIndexer._injectFromBootstrap(allChunks, metas);

      // Step 6: KnowledgeGraph — build from chunks (GraphBuilder → GraphStorage)
      const graphData = GraphBuilder.build(allChunks);
      _graphStorage.store(graphData);

      // Also update the legacy singleton for backward compatibility with EF-7.2.0 code
      const { officialKnowledgeGraph } = await import("./OfficialKnowledgeGraph");
      officialKnowledgeGraph.build(allChunks);

      this._result = Object.freeze({
        success:       true,
        documentCount: metas.length,
        chunkCount:    allChunks.length,
        graphNodes:    _graphStorage.nodeCount,
        graphEdges:    _graphStorage.edgeCount,
        loadErrors,
        durationMs:    Date.now() - t0,
        bootstrappedAt: new Date().toISOString(),
      });
    } catch (e) {
      this._result = Object.freeze({
        success:       false,
        documentCount: 0,
        chunkCount:    0,
        graphNodes:    0,
        graphEdges:    0,
        loadErrors:    [{ id: "bootstrap", name: "Bootstrap", error: (e as Error).message }],
        durationMs:    Date.now() - t0,
        bootstrappedAt: new Date().toISOString(),
      });
    } finally {
      this._running = false;
    }

    return this._result!;
  }

  reset(): void {
    this._result  = null;
    this._running = false;
    OfficialLibraryCatalog.reset();
    _graphStorage.clear();
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_BOOTSTRAP__?: OfficialLibraryBootstrapImpl };
if (!G.__OL_BOOTSTRAP__) G.__OL_BOOTSTRAP__ = new OfficialLibraryBootstrapImpl();
export const OfficialLibraryBootstrap: OfficialLibraryBootstrapImpl = G.__OL_BOOTSTRAP__;