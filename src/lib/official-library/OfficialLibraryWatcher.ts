/**
 * OfficialLibraryWatcher.ts — Sprint EF-7.2.1 (refactored from EF-7.2.0)
 *
 * Changes from EF-7.2.0:
 *   - Depends on DocumentChangeSource interface (DIP)
 *   - Never depends on PollingChangeSource directly
 *   - PollingChangeSource is the default but can be swapped at runtime
 *   - Knowledge graph rebuild uses graphStorage/graphQuery from Bootstrap
 */

import type { WatchEvent } from "./OfficialLibraryTypes";
import type { DocumentChangeSource } from "./DocumentChangeSource";
import { PollingChangeSource } from "./DocumentChangeSource";
import { OfficialLibraryIndexer } from "./OfficialLibraryIndexer";

type WatchListener = (event: WatchEvent) => void;

// ── Default change source ─────────────────────────────────────────────────────

function makeDefaultChangeSource(): DocumentChangeSource {
  return new PollingChangeSource(60_000, () => {
    const stats = OfficialLibraryIndexer.stats();
    return `${stats.documentCount}-${stats.chunkCount}-${stats.lastIndexedAt}`;
  });
}

// ── Watcher implementation ────────────────────────────────────────────────────

class OfficialLibraryWatcherImpl {
  private _listeners:    WatchListener[]        = [];
  private _history:      WatchEvent[]           = [];
  private _changeSource: DocumentChangeSource   = makeDefaultChangeSource();

  get isActive(): boolean     { return this._changeSource.isActive; }
  get eventCount(): number    { return this._history.length; }
  get history(): WatchEvent[] { return [...this._history]; }
  get sourceId(): string      { return this._changeSource.sourceId; }
  get sourceName(): string    { return this._changeSource.sourceName; }

  /** Swap the change source (DIP — e.g. switch to GitHubWebhookSource). */
  setChangeSource(source: DocumentChangeSource): void {
    this._changeSource.stop();
    this._changeSource = source;
  }

  /** Start watching with the current change source. */
  start(): void {
    this._changeSource.start(event => {
      this._emit({
        type:        "update",
        documentId:  event.documentId,
        triggeredAt: event.triggeredAt,
        reason:      event.reason,
      });
    });
  }

  /** Stop watching. */
  stop(): void {
    this._changeSource.stop();
  }

  /** Subscribe to watch events. Returns unsubscribe fn. */
  subscribe(listener: WatchListener): () => void {
    this._listeners.push(listener);
    return () => { this._listeners = this._listeners.filter(l => l !== listener); };
  }

  /** Manually trigger reindex for a document id. */
  async triggerReindex(documentId: string, reason = "manual"): Promise<boolean> {
    const ok = await OfficialLibraryIndexer.reindex(documentId);
    if (ok) {
      await this._rebuildGraph();
      this._emit({ type: "reindex", documentId, triggeredAt: new Date().toISOString(), reason });
    }
    return ok;
  }

  /** Trigger a full reindex via Bootstrap. */
  async triggerFullReindex(reason = "full-reindex"): Promise<void> {
    try {
      const { OfficialLibraryBootstrap } = await import("./OfficialLibraryBootstrap");
      await OfficialLibraryBootstrap.run(true);
    } catch { /* bootstrap errors are diagnostic-only */ }
    this._emit({ type: "reindex", documentId: "*", triggeredAt: new Date().toISOString(), reason });
  }

  private async _rebuildGraph(): Promise<void> {
    try {
      const { OfficialLibraryBootstrap, graphStorage } = await import("./OfficialLibraryBootstrap");
      const { GraphBuilder } = await import("./GraphBuilder");
      const chunks = OfficialLibraryIndexer.getChunks();
      graphStorage.store(GraphBuilder.build(chunks));
      // Also update legacy singleton
      const { officialKnowledgeGraph } = await import("./OfficialKnowledgeGraph");
      officialKnowledgeGraph.build(chunks);
    } catch { /* no-op */ }
  }

  private _emit(event: WatchEvent): void {
    this._history.push(event);
    if (this._history.length > 100) this._history.shift();
    for (const listener of this._listeners) {
      try { listener(event); } catch { /* isolate */ }
    }
  }

  _reset(): void {
    this.stop();
    this._history      = [];
    this._changeSource = makeDefaultChangeSource();
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_WATCHER__?: OfficialLibraryWatcherImpl };
if (!G.__OL_WATCHER__) G.__OL_WATCHER__ = new OfficialLibraryWatcherImpl();
export const OfficialLibraryWatcher: OfficialLibraryWatcherImpl = G.__OL_WATCHER__;