/**
 * UnifiedContextTypes.ts — Sprint 8.11
 * Central type contracts for the Unified Context Builder.
 * No duplicates with existing types — only UCB-specific contracts.
 * MDS v2.0 compliant.
 */

// ── Source Identifiers ────────────────────────────────────────────────────────

export type ContextSourceId =
  | "memory.entities"
  | "memory.keywords"
  | "memory.topics"
  | "memory.decisions"
  | "memory.tasks"
  | "memory.session_summary"
  | "working_memory"
  | "official_library"
  | "github_connector"
  | "base44_connector"
  | "gmail_connector"
  | "drive_connector"
  | "calendar_connector";

// ── Intent Classification (deterministic, no LLM) ────────────────────────────

export type ContextIntent =
  | "code"
  | "email"
  | "drive"
  | "calendar"
  | "base44"
  | "memory"
  | "general";

// ── Per-source result ─────────────────────────────────────────────────────────

export interface ContextSourceResult {
  readonly sourceId:   ContextSourceId;
  readonly available:  boolean;
  readonly data:       unknown;
  readonly durationMs: number;
  readonly error:      string | null;
  readonly tokenCount: number; // estimated
}

// ── Connector availability snapshot ──────────────────────────────────────────

export interface ConnectorAvailabilityMap {
  readonly gmail:    boolean;
  readonly drive:    boolean;
  readonly calendar: boolean;
  readonly github:   boolean;
  readonly base44:   boolean;
}

// ── Main unified context object ───────────────────────────────────────────────

export interface UnifiedContext {
  /** Core identity */
  readonly buildId:       string;
  readonly builtAt:       number;
  readonly durationMs:    number;
  readonly intent:        ContextIntent;

  /** User + session signals */
  readonly userContext: {
    readonly userMessage:      string;
    readonly sessionId:        string;
    readonly projectId:        string | null;
    readonly messageCount:     number;
    readonly sessionSummary:   string | null;
  };

  /** Last N conversation turns */
  readonly conversationContext: {
    readonly recentMessages:   ReadonlyArray<{ role: string; content: string }>;
    readonly historyLength:    number;
  };

  /** Persistent memory (entities, keywords, topics, decisions, tasks) */
  readonly memoryContext: {
    readonly entities:    string | null;
    readonly keywords:    string | null;
    readonly topics:      string | null;
    readonly decisions:   string | null;
    readonly tasks:       string | null;
    readonly rawCounts:   { entities: number; keywords: number; topics: number; decisions: number; tasks: number };
  };

  /** Official Library knowledge */
  readonly officialKnowledge: {
    readonly available:  boolean;
    readonly summary:    string | null;
    readonly tokens:     number;
  };

  /** Project / GitHub knowledge */
  readonly projectKnowledge: {
    readonly available:  boolean;
    readonly summary:    string | null;
    readonly tokens:     number;
  };

  /** Connector-sourced knowledge (pre-fetched snippets, not execution) */
  readonly connectorKnowledge: {
    readonly gmail:    string | null;
    readonly drive:    string | null;
    readonly calendar: string | null;
    readonly github:   string | null;
    readonly base44:   string | null;
  };

  /** Working memory (active reasoning state, goals in flight) */
  readonly workingMemory: {
    readonly available:  boolean;
    readonly entries:    ReadonlyArray<string>;
    readonly tokens:     number;
  };

  /** Active goals currently tracked */
  readonly activeGoals: ReadonlyArray<string>;

  /** Which connectors are configured/authenticated */
  readonly connectorAvailability: ConnectorAvailabilityMap;

  /** Aggregate confidence [0–1] */
  readonly confidence: number;

  /** Which sources were consulted and their results */
  readonly sources: ReadonlyArray<ContextSourceResult>;
}

// ── Policy types ──────────────────────────────────────────────────────────────

export interface SourceSelectionPolicy {
  readonly intent:          ContextIntent;
  readonly selectedSources: ReadonlyArray<ContextSourceId>;
  readonly timeoutMs:       number;
  readonly reason:          string;
}

export interface PolicyEvaluation {
  readonly policy:      SourceSelectionPolicy;
  readonly durationMs:  number;
}

// ── Certification types ───────────────────────────────────────────────────────

export interface UCBCertCase {
  readonly id:          string;
  readonly description: string;
  passed:               boolean;
  durationMs:           number;
  error:                string | null;
  evidence:             string | null;
}

export interface UCBCertReport {
  readonly runAt:       number;
  readonly total:       number;
  readonly passed:      number;
  readonly failed:      number;
  readonly passRate:    number;
  readonly durationMs:  number;
  readonly certified:   boolean;
  readonly cases:       UCBCertCase[];
}