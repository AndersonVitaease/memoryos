/**
 * OfficialLibraryStatus.ts — Sprint EF-42.6
 *
 * SRP: expose runtime status of the Official Library EF-42.6 bootstrap.
 * Read-only — never modifies state.
 */

import { ChunkIndex } from "../content/ChunkIndex";

export type LibraryReadyState = "idle" | "loading" | "ready" | "error";

export interface LibraryStatusSnapshot {
  readonly state:        LibraryReadyState;
  readonly documents:    number;
  readonly chunks:       number;
  readonly tokens:       number;
  readonly lastIndexed:  string | null;
  readonly version:      string;
  readonly durationMs:   number | null;
  readonly errors:       readonly string[];
}

/** Internal mutable state — set only by OfficialLibraryAutoBootstrap */
export interface BootstrapState {
  state:       LibraryReadyState;
  documents:   number;
  lastIndexed: string | null;
  version:     string;
  durationMs:  number | null;
  errors:      string[];
}

class OfficialLibraryStatusImpl {
  private _s: BootstrapState = {
    state: "idle", documents: 0, lastIndexed: null,
    version: "EF-42.6", durationMs: null, errors: [],
  };

  /** Called by AutoBootstrap — not public API */
  _update(s: Partial<BootstrapState>): void {
    Object.assign(this._s, s);
  }

  isReady(): boolean    { return this._s.state === "ready"; }
  documents(): number   { return this._s.documents; }
  chunks(): number      { return ChunkIndex.count(); }
  tokens(): number      { return ChunkIndex.stats().totalTokens; }
  lastIndexed(): string | null { return this._s.lastIndexed; }
  version(): string     { return this._s.version; }
  duration(): number | null { return this._s.durationMs; }
  errors(): readonly string[] { return [...this._s.errors]; }
  state(): LibraryReadyState { return this._s.state; }

  snapshot(): LibraryStatusSnapshot {
    return Object.freeze({
      state:       this._s.state,
      documents:   this._s.documents,
      chunks:      this.chunks(),
      tokens:      this.tokens(),
      lastIndexed: this._s.lastIndexed,
      version:     this._s.version,
      durationMs:  this._s.durationMs,
      errors:      Object.freeze([...this._s.errors]),
    });
  }

  reset(): void {
    this._s = {
      state: "idle", documents: 0, lastIndexed: null,
      version: "EF-42.6", durationMs: null, errors: [],
    };
  }
}

const G = globalThis as typeof globalThis & { __EF426_STATUS__?: OfficialLibraryStatusImpl };
if (!G.__EF426_STATUS__) G.__EF426_STATUS__ = new OfficialLibraryStatusImpl();
export const OfficialLibraryStatus: OfficialLibraryStatusImpl = G.__EF426_STATUS__;