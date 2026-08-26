/**
 * UCMETypes.ts — Unified Cognitive Memory Engine v1.0
 * Sprint 7.0.0
 *
 * All types for the UCME system.
 * No provider knows about other providers.
 * No planner knows about any provider.
 */

// ── Memory Query ──────────────────────────────────────────────────────────────

export interface MemoryQuery {
  /** Natural language question */
  readonly text:        string;
  /** Optional intent hint (from upstream planner) */
  readonly intent?:     string;
  /** Restrict search to these provider ids. Empty = all providers. */
  readonly providers?:  string[];
  /** Max results per provider */
  readonly maxPerProvider?: number;
  /** Timeout per provider in ms */
  readonly timeoutMs?:  number;
  /** Caller trace id */
  readonly traceId?:    string;
  /** Optional project scope. Providers that support project scoping must honor it. */
  readonly projectId?:  string | null;
  /** Optional session scope. Used when a narrower conversation scope is required. */
  readonly sessionId?:  string | null;
}

// ── Memory Evidence ───────────────────────────────────────────────────────────

export interface MemoryEvidence {
  readonly memoryId:     string;       // unique id of the memory item
  readonly providerId:   string;       // which provider returned it
  readonly providerName: string;
  readonly content:      string;       // the actual remembered content
  readonly summary:      string;       // short human-readable summary
  readonly confidence:   number;       // 0–1
  readonly relevance:    number;       // 0–1 (computed at query time)
  readonly recency:      number;       // 0–1 (more recent = higher)
  readonly weight:       number;       // final merged score
  readonly lastUpdated:  string;       // ISO timestamp
  readonly justification: string;      // why this memory was included
  readonly tags:         string[];
  readonly metadata:     Record<string, unknown>;
}

// ── Memory Result ─────────────────────────────────────────────────────────────

export interface MemoryResult {
  readonly query:        MemoryQuery;
  readonly evidence:     MemoryEvidence[];   // merged, deduplicated, ranked
  readonly context:      string;             // assembled context string for LLM
  readonly timeline:     MemoryTimeline;
  readonly durationMs:   number;
  readonly providerStats: MemoryProviderStat[];
}

export interface MemoryProviderStat {
  readonly providerId:   string;
  readonly providerName: string;
  readonly hits:         number;
  readonly durationMs:   number;
  readonly healthy:      boolean;
  readonly error:        string | null;
}

// ── Memory Timeline ───────────────────────────────────────────────────────────

export interface MemoryTimeline {
  readonly items: MemoryTimelineItem[];
}

export interface MemoryTimelineItem {
  readonly date:      string;
  readonly summary:   string;
  readonly source:    string;
  readonly memoryId:  string;
}

// ── Memory Context ────────────────────────────────────────────────────────────

export interface MemoryContext {
  readonly query:    MemoryQuery;
  readonly result:   MemoryResult;
  readonly prompt:   string;           // ready-to-use LLM context block
  readonly builtAt:  string;
}

// ── Memory Provider contract ──────────────────────────────────────────────────
// Every memory source implements exactly this interface.
// No provider knows about other providers.

export interface MemoryProvider {
  /** Unique provider id (e.g. "conversation", "google-drive", "gmail", "knowledge-graph") */
  readonly id:   string;
  readonly name: string;

  /** Search this memory for content relevant to the query */
  search(query: MemoryQuery): Promise<MemoryEvidence[]>;

  /** Store a new memory item */
  remember(content: string, metadata?: Record<string, unknown>): Promise<string>;

  /** Remove a memory item by id */
  forget(memoryId: string): Promise<void>;

  /** Update a memory item */
  update(memoryId: string, content: string, metadata?: Record<string, unknown>): Promise<void>;

  /** Explain what this provider stores and how it decides relevance */
  explain(): string;

  /** Health check */
  health(): Promise<{ healthy: boolean; detail: string }>;

  /** What capabilities does this provider offer */
  capabilities(): string[];
}