/**
 * OfficialLibraryWatcher.ts — Sprint EF-7.2.0
 *
 * Monitors changes to official documents.
 * When a document changes:
 *   → Reindex
 *   → Update in-memory chunks
 *   → Invalidate cache
 *   → Register new version
 *   → Emit WatchEvent (without restarting the app)
 *
 * In the browser environment, watches via polling at configurable intervals.
 */

import type { WatchEvent } from "./OfficialLibraryTypes";
import { OfficialLibraryIndexer } from "./OfficialLibraryIndexer";
import { officialKnowledgeGraph } from "./OfficialKnowledgeGraph";

type WatchListener = (event: WatchEvent) => void;

// ── Watcher implementation ────────────────────────────────────────────────────

class OfficialLibraryWatcherImpl {
  private _listeners:  WatchListener[]   = [];
  private _history:    WatchEvent[]      = [];
  private _active:     boolean           = false;
  private _intervalId: ReturnType<typeof setInterval> | null = null;
  private _pollMs:     number            = 60_000;   // 1 minute default
  private _lastHash:   string            = "";

  /** Start watching. Safe to call multiple times. */
  start(pollMs = 60_000): void {
    if (this._active) return;
    this._active  = true;
    this._pollMs  = pollMs;
    this._intervalId = setInterval(() => this._poll(), this._pollMs);
  }

  /** Stop watching. */
  stop(): void {
    this._active = false;
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  get isActive(): boolean    { return this._active; }
  get eventCount(): number   { return this._history.length; }
  get history(): WatchEvent[] { return [...this._history]; }

  /** Subscribe to watch events. Returns unsubscribe fn. */
  subscribe(listener: WatchListener): () => void {
    this._listeners.push(listener);
    return () => { this._listeners = this._listeners.filter(l => l !== listener); };
  }

  /** Manually trigger reindex for a document id. */
  async triggerReindex(documentId: string, reason = "manual"): Promise<boolean> {
    const ok = await OfficialLibraryIndexer.reindex(documentId);
    if (ok) {
      const chunks = OfficialLibraryIndexer.getChunks();
      officialKnowledgeGraph.build(chunks);
      const event: WatchEvent = {
        type:        "reindex",
        documentId,
        triggeredAt: new Date().toISOString(),
        reason,
      };
      this._emit(event);
    }
    return ok;
  }

  /** Trigger a full reindex. */
  async triggerFullReindex(reason = "full-reindex"): Promise<void> {
    // Reset and re-initialize the indexer
    OfficialLibraryIndexer._reset();
    await OfficialLibraryIndexer.initialize();
    const chunks = OfficialLibraryIndexer.getChunks();
    officialKnowledgeGraph.build(chunks);

    const event: WatchEvent = {
      type:        "reindex",
      documentId:  "*",
      triggeredAt: new Date().toISOString(),
      reason,
    };
    this._emit(event);
  }

  private async _poll(): Promise<void> {
    if (!this._active) return;
    try {
      const stats    = OfficialLibraryIndexer.stats();
      const newHash  = `${stats.documentCount}-${stats.chunkCount}-${stats.lastIndexedAt}`;
      if (newHash !== this._lastHash && this._lastHash !== "") {
        const event: WatchEvent = {
          type:        "update",
          documentId:  "*",
          triggeredAt: new Date().toISOString(),
          reason:      "poll-detected-change",
        };
        this._emit(event);
      }
      this._lastHash = newHash;
    } catch {
      // Silent — poll failures don't propagate
    }
  }

  private _emit(event: WatchEvent): void {
    this._history.push(event);
    if (this._history.length > 100) this._history.shift();  // circular buffer
    for (const listener of this._listeners) {
      try { listener(event); } catch { /* isolate listener errors */ }
    }
  }

  /** Reset for tests. */
  _reset(): void {
    this.stop();
    this._history  = [];
    this._lastHash = "";
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_WATCHER__?: OfficialLibraryWatcherImpl };
if (!G.__OL_WATCHER__) G.__OL_WATCHER__ = new OfficialLibraryWatcherImpl();
export const OfficialLibraryWatcher: OfficialLibraryWatcherImpl = G.__OL_WATCHER__;