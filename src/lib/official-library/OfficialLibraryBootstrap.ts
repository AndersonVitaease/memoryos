/**
 * OfficialLibraryBootstrap.ts — Sprint EF-7.2.4
 *
 * Orchestrates full Official Library initialization.
 * Depends ONLY on OfficialLibraryRuntimeProvider — no concrete imports.
 *
 * Pipeline:
 *   OfficialLibraryRuntimeProvider.runtime()
 *   → runtime.discovery() → Catalog.discover()
 *   → runtime.loader().loadAll()
 *   → Parser → Chunker → Indexer
 *   → GraphBuilder → GraphStorage
 *   → Provider Ready
 *
 * EF-7.2.4: DocumentDiscoveryRegistry and DocumentLoaderFactory removed from this file.
 * EF-7.2.3: catalog.discover() is purely async.
 */

import { OfficialLibraryRuntimeProvider } from "./OfficialLibraryRuntimeProvider";
import { OfficialLibraryCatalog }         from "./OfficialLibraryCatalog";
import { OfficialLibraryParser }          from "./OfficialLibraryParser";
import { OfficialLibraryChunker }         from "./OfficialLibraryChunker";
import { OfficialLibraryIndexer }         from "./OfficialLibraryIndexer";
import { GraphBuilder }                   from "./GraphBuilder";
import { GraphStorage }                   from "./GraphStorage";
import { GraphQuery }                     from "./GraphQuery";
import type { OfficialChunk, OfficialDocumentMeta } from "./OfficialLibraryTypes";

export interface BootstrapResult {
  readonly success:        boolean;
  readonly documentCount:  number;
  readonly chunkCount:     number;
  readonly graphNodes:     number;
  readonly graphEdges:     number;
  readonly loadErrors:     { id: string; name: string; error: string }[];
  readonly durationMs:     number;
  readonly bootstrappedAt: string;
  readonly runtimeId:      string;
  readonly loaderId:       string;
}

const _graphStorage = new GraphStorage();
export const graphStorage = _graphStorage;
export const graphQuery   = new GraphQuery(_graphStorage);

class OfficialLibraryBootstrapImpl {
  private _result:  BootstrapResult | null = null;
  private _running: boolean                = false;

  get lastResult(): BootstrapResult | null { return this._result; }
  get isReady(): boolean { return this._result?.success === true; }

  async run(force = false): Promise<BootstrapResult> {
    if (this._result && !force) return this._result;
    if (this._running) {
      await new Promise<void>(resolve => {
        const iv = setInterval(() => { if (!this._running) { clearInterval(iv); resolve(); } }, 50);
      });
      if (this._result) return this._result;
    }

    this._running = true;
    const t0 = Date.now();

    // ── Single dependency: OfficialLibraryRuntimeProvider ─────────────────────
    const runtime   = OfficialLibraryRuntimeProvider.runtime();
    const discovery = runtime.discovery();
    const loader    = runtime.loader();

    try {
      // Step 1: Discovery via Catalog (delegates to runtime.discovery() via Registry)
      OfficialLibraryCatalog.reset();
      const sources = await OfficialLibraryCatalog.discover();

      // Step 2: Load
      const loaded     = await loader.loadAll(sources);
      const successful = loader.successful(loaded);
      const loadErrors = loader.errors(loaded);

      // Step 3: Parse
      const parsed = successful.map(doc =>
        OfficialLibraryParser.parse(doc.raw, doc.path, doc.name)
      );

      // Step 4: Chunk
      const allChunks: OfficialChunk[] = OfficialLibraryChunker.chunkAll(parsed);

      // Step 5: Index
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

      // Step 6: Knowledge Graph
      const graphData = GraphBuilder.build(allChunks);
      _graphStorage.store(graphData);

      // Backward compat: update legacy singleton
      const { officialKnowledgeGraph } = await import("./OfficialKnowledgeGraph");
      officialKnowledgeGraph.build(allChunks);

      this._result = Object.freeze({
        success: true, documentCount: metas.length, chunkCount: allChunks.length,
        graphNodes: _graphStorage.nodeCount, graphEdges: _graphStorage.edgeCount,
        loadErrors, durationMs: Date.now() - t0,
        bootstrappedAt: new Date().toISOString(),
        runtimeId: discovery.runtimeId, loaderId: loader.loaderId,
      });
    } catch (e) {
      this._result = Object.freeze({
        success: false, documentCount: 0, chunkCount: 0, graphNodes: 0, graphEdges: 0,
        loadErrors: [{ id: "bootstrap", name: "Bootstrap", error: (e as Error).message }],
        durationMs: Date.now() - t0, bootstrappedAt: new Date().toISOString(),
        runtimeId: discovery.runtimeId, loaderId: loader.loaderId,
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

const G = globalThis as typeof globalThis & { __OL_BOOTSTRAP__?: OfficialLibraryBootstrapImpl };
if (!G.__OL_BOOTSTRAP__) G.__OL_BOOTSTRAP__ = new OfficialLibraryBootstrapImpl();
export const OfficialLibraryBootstrap: OfficialLibraryBootstrapImpl = G.__OL_BOOTSTRAP__;