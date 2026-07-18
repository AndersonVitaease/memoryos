/**
 * DocumentChangeSource.ts — Sprint EF-7.2.1
 *
 * Interface for all document change monitoring implementations.
 * OfficialLibraryWatcher depends ONLY on this interface — never on polling directly.
 *
 * Current implementations:
 *   PollingChangeSource — browser-safe, interval-based
 *
 * Future implementations (interface-ready):
 *   GitHubWebhookSource
 *   Base44Source
 *   GoogleDriveSource
 */

// ── Interface ─────────────────────────────────────────────────────────────────

export interface ChangeEvent {
  readonly documentId:  string;    // "*" means all documents
  readonly triggeredAt: string;
  readonly reason:      string;
}

export interface DocumentChangeSource {
  readonly sourceId:   string;
  readonly sourceName: string;

  /** Start monitoring. */
  start(onEvent: (event: ChangeEvent) => void): void;

  /** Stop monitoring. */
  stop(): void;

  /** Is currently active? */
  readonly isActive: boolean;
}

// ── Polling Change Source ─────────────────────────────────────────────────────

export class PollingChangeSource implements DocumentChangeSource {
  readonly sourceId   = "polling-v1";
  readonly sourceName = "Polling Change Source";

  private _active    = false;
  private _intervalId: ReturnType<typeof setInterval> | null = null;
  private _lastHash  = "";
  private _hashFn:   () => string;

  constructor(
    private readonly _pollMs: number,
    hashFn: () => string,
  ) {
    this._hashFn = hashFn;
  }

  get isActive(): boolean { return this._active; }

  start(onEvent: (event: ChangeEvent) => void): void {
    if (this._active) return;
    this._active    = true;
    this._intervalId = setInterval(() => {
      try {
        const newHash = this._hashFn();
        if (newHash !== this._lastHash && this._lastHash !== "") {
          onEvent({ documentId: "*", triggeredAt: new Date().toISOString(), reason: "polling-hash-change" });
        }
        this._lastHash = newHash;
      } catch { /* isolate poll errors */ }
    }, this._pollMs);
  }

  stop(): void {
    this._active = false;
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }
}

// ── Stub sources for future implementations ───────────────────────────────────

export class GitHubWebhookSource implements DocumentChangeSource {
  readonly sourceId   = "github-webhook-v1";
  readonly sourceName = "GitHub Webhook Source";
  private _active = false;
  get isActive(): boolean { return this._active; }
  start(_onEvent: (event: ChangeEvent) => void): void { this._active = true; /* awaits webhook registration */ }
  stop(): void { this._active = false; }
}

export class Base44Source implements DocumentChangeSource {
  readonly sourceId   = "base44-v1";
  readonly sourceName = "Base44 Source";
  private _active = false;
  get isActive(): boolean { return this._active; }
  start(_onEvent: (event: ChangeEvent) => void): void { this._active = true; }
  stop(): void { this._active = false; }
}