/**
 * RetrievalDiagnostics.ts — Sprint EF-42
 *
 * Records and exposes retrieval execution traces.
 *
 * Responsibilities:
 *   - Record per-query diagnostic events: query, docs analyzed, docs selected,
 *     chunks selected, time, scores, selection reasons.
 *   - Provide a history of recent retrievals for the dashboard.
 *   - Never affect retrieval logic (read-only observer pattern).
 *
 * SRP: diagnostics only. No retrieval, no scoring, no storage of documents.
 */

// ── Event types ───────────────────────────────────────────────────────────────

export interface DocAnalysisEvent {
  readonly documentId:    string;
  readonly title:         string;
  readonly score:         number;
  readonly chunksScanned: number;
  readonly chunksSelected: number;
  readonly selected:      boolean;
  readonly rejectionReason?: string;
}

export interface RetrievalTrace {
  readonly traceId:        string;
  readonly query:          string;
  readonly normalizedQuery: string;
  readonly docsAnalyzed:   number;
  readonly docsSelected:   number;
  readonly chunksSelected: number;
  readonly topScore:       number;
  readonly durationMs:     number;
  readonly timestamp:      string;
  readonly docEvents:      readonly DocAnalysisEvent[];
}

// ── Store ─────────────────────────────────────────────────────────────────────

const MAX_HISTORY = 50;

class RetrievalDiagnosticsImpl {
  private _traces: RetrievalTrace[] = [];

  record(trace: Omit<RetrievalTrace, "traceId" | "timestamp">): RetrievalTrace {
    const full: RetrievalTrace = Object.freeze({
      ...trace,
      traceId:   crypto.randomUUID ? crypto.randomUUID() : `trace-${Date.now()}`,
      timestamp: new Date().toISOString(),
      docEvents: Object.freeze([...trace.docEvents]),
    });
    this._traces.unshift(full);
    if (this._traces.length > MAX_HISTORY) this._traces.length = MAX_HISTORY;
    return full;
  }

  getHistory(limit = 10): readonly RetrievalTrace[] {
    return Object.freeze(this._traces.slice(0, limit));
  }

  getLatest(): RetrievalTrace | null {
    return this._traces[0] ?? null;
  }

  clear(): void {
    this._traces = [];
  }

  get totalTraces(): number {
    return this._traces.length;
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_DIAGNOSTICS__?: RetrievalDiagnosticsImpl };
if (!G.__OL_DIAGNOSTICS__) G.__OL_DIAGNOSTICS__ = new RetrievalDiagnosticsImpl();
export const RetrievalDiagnostics: RetrievalDiagnosticsImpl = G.__OL_DIAGNOSTICS__;