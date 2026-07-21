/**
 * OfficialLibraryAutoBootstrap.ts — Sprint EF-42.6
 *
 * SRP: orchestrate the full EF-42.x pipeline automatically, once.
 *
 * Pipeline:
 *   OfficialDocumentDiscovery
 *     → OfficialDocumentLoader
 *       → ContentIndexer.indexAll()
 *         → ChunkIndex (populated)
 *         → OfficialLibraryIndex (metadata)
 *         → OfficialLibraryStatus (ready)
 *
 * - Runs only once per HMR lifecycle (singleton + _initialized flag).
 * - Concurrent calls wait for the first run to complete.
 * - force=true triggers full re-index.
 * - Never talks to Planner, never responds to queries.
 */

import { OfficialDocumentDiscovery } from "./OfficialDocumentDiscovery";
import { OfficialDocumentLoader }    from "./OfficialDocumentLoader";
import { OfficialLibraryStatus }     from "./OfficialLibraryStatus";
import { ContentIndexer }            from "../content/ContentIndexer";
import { ChunkIndex }                from "../content/ChunkIndex";
import { OfficialLibraryIndex }      from "../index/OfficialLibraryIndex";

export interface AutoBootstrapResult {
  readonly success:        boolean;
  readonly documentsFound: number;
  readonly documentsLoaded: number;
  readonly chunksCreated:  number;
  readonly totalTokens:    number;
  readonly durationMs:     number;
  readonly bootstrappedAt: string;
  readonly errors:         readonly string[];
  readonly runtimeId:      string;
}

class OfficialLibraryAutoBootstrapImpl {
  private _initialized = false;
  private _running     = false;
  private _result: AutoBootstrapResult | null = null;

  get isReady(): boolean { return this._initialized && (this._result?.success === true); }
  get lastResult(): AutoBootstrapResult | null { return this._result; }

  async initialize(force = false): Promise<AutoBootstrapResult> {
    // Return cached if already done
    if (this._initialized && !force && this._result) return this._result;

    // Wait if already running
    if (this._running) {
      await new Promise<void>(resolve => {
        const iv = setInterval(() => {
          if (!this._running) { clearInterval(iv); resolve(); }
        }, 50);
      });
      if (this._result && !force) return this._result;
    }

    this._running = true;
    OfficialLibraryStatus._update({ state: "loading", errors: [] });
    const t0 = Date.now();
    const errors: string[] = [];

    try {
      // ── Step 1: Discovery ─────────────────────────────────────────────────
      const outcome = await OfficialDocumentDiscovery.discover();
      errors.push(...outcome.diagnostics);

      // ── Step 2: Load ──────────────────────────────────────────────────────
      const loadResults = await OfficialDocumentLoader.loadAll(outcome.entries);
      const rawDocs     = OfficialDocumentLoader.successful(loadResults);
      const loadErrors  = OfficialDocumentLoader.errors(loadResults);
      for (const le of loadErrors) errors.push(`Load error [${le.id}]: ${le.error}`);

      // ── Step 3: Index via ContentIndexer ──────────────────────────────────
      if (force) ChunkIndex.clear();
      const bulkResult = ContentIndexer.indexAll(rawDocs);
      for (const r of bulkResult.results) {
        if (!r.success && r.error) errors.push(`Index error [${r.documentId}]: ${r.error}`);
      }

      // ── Step 4: Populate OfficialLibraryIndex (metadata) ─────────────────
      const now = new Date().toISOString();
      const metaDocs = rawDocs.map(d => ({
        id:               d.documentId,
        title:            d.title,
        version:          "1.0",
        category:         "specification" as const,
        type:             "specification",
        status:           "active" as const,
        path:             outcome.entries.find(e => e.id === d.documentId)?.path ?? "",
        checksum:         d.documentId,
        chunkCount:       ChunkIndex.getChunks(d.documentId).length,
        tokenEstimate:    ChunkIndex.getChunks(d.documentId).reduce((s, c) => s + c.tokenEstimate, 0),
        keywords:         _extractKeywords(d.title),
        tags:             [],
        relatedDocuments: [],
        createdAt:        now,
        updatedAt:        now,
      }));
      if (metaDocs.length > 0) OfficialLibraryIndex.replaceAll(metaDocs);

      const durationMs = Date.now() - t0;

      this._result = Object.freeze({
        success:          errors.filter(e => e.startsWith("Load error") || e.startsWith("Index error")).length === 0,
        documentsFound:   outcome.entries.length,
        documentsLoaded:  rawDocs.length,
        chunksCreated:    bulkResult.totalChunks,
        totalTokens:      bulkResult.totalTokens,
        durationMs,
        bootstrappedAt:   new Date().toISOString(),
        errors:           Object.freeze(errors),
        runtimeId:        outcome.runtimeId,
      });

      OfficialLibraryStatus._update({
        state:       this._result.success ? "ready" : "error",
        documents:   rawDocs.length,
        lastIndexed: new Date().toISOString(),
        durationMs,
        errors,
      });

    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`Bootstrap failed: ${msg}`);
      const durationMs = Date.now() - t0;
      this._result = Object.freeze({
        success:          false,
        documentsFound:   0,
        documentsLoaded:  0,
        chunksCreated:    0,
        totalTokens:      0,
        durationMs,
        bootstrappedAt:   new Date().toISOString(),
        errors:           Object.freeze(errors),
        runtimeId:        "error",
      });
      OfficialLibraryStatus._update({ state: "error", durationMs, errors });
    } finally {
      this._initialized = true;
      this._running     = false;
    }

    return this._result!;
  }

  reset(): void {
    this._initialized = false;
    this._running     = false;
    this._result      = null;
    OfficialLibraryStatus.reset();
  }
}

function _extractKeywords(title: string): string[] {
  return title.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 6);
}

const G = globalThis as typeof globalThis & { __EF426_AUTOBOOTSTRAP__?: OfficialLibraryAutoBootstrapImpl };
if (!G.__EF426_AUTOBOOTSTRAP__) G.__EF426_AUTOBOOTSTRAP__ = new OfficialLibraryAutoBootstrapImpl();
export const OfficialLibraryAutoBootstrap: OfficialLibraryAutoBootstrapImpl = G.__EF426_AUTOBOOTSTRAP__;