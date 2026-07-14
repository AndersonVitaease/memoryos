/**
 * MEMTypes.ts — Sprint 6.2.4
 * Shared types for the Engineering Memory layer.
 */

export type MemoryStatus  = "ACTIVE" | "ARCHIVED" | "SUPERSEDED";
export type MemoryKind    = "IMPLEMENTATION" | "BUG" | "REGRESSION" | "DECISION" | "ARCHITECTURE" | "CONNECTOR" | "PATTERN" | "REPAIR" | "APPROVAL";
export type OutcomeType   = "PASS" | "FAIL" | "ROLLBACK" | "REJECTED" | "PENDING";
export type RiskLevel     = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

let _seq = 0;
export function makeMemId(kind: string): string { return `mem_${kind}_${Date.now()}_${++_seq}`; }

// ── Base memory entry ─────────────────────────────────────────────────────────
export interface BaseMemory {
  id:          string;
  kind:        MemoryKind;
  status:      MemoryStatus;
  tags:        string[];
  kgEntityIds: string[];   // linked KG entities
  createdAt:   number;
  rank:        number;     // 0–100, updated by MemoryRanking
  useCount:    number;
  confidence:  number;     // 0–1
}

// ── Implementation ────────────────────────────────────────────────────────────
export interface ImplementationMemoryEntry extends BaseMemory {
  kind:             "IMPLEMENTATION";
  objective:        string;
  planId:           string;
  components:       string[];
  strategy:         string;
  filesChanged:     string[];
  durationMs:       number;
  regressionsPassed: boolean;
  approved:         boolean;
  rollbackExecuted: boolean;
  outcome:          OutcomeType;
}

// ── Bug ───────────────────────────────────────────────────────────────────────
export interface BugMemoryEntry extends BaseMemory {
  kind:          "BUG";
  description:   string;
  rootCause:     string;
  module:        string;
  impact:        RiskLevel;
  fix:           string;
  relatedRegression: string;
  confidence:    number;
  version:       string;
}

// ── Regression ────────────────────────────────────────────────────────────────
export interface RegressionMemoryEntry extends BaseMemory {
  kind:          "REGRESSION";
  testsRun:      number;
  testsFailed:   number;
  testsPassed:   number;
  fixes:         string[];
  shieldScore:   number;   // 0–5
  rcaSummary:    string[];
  recovery:      string;
  durationMs:    number;
}

// ── Decision ──────────────────────────────────────────────────────────────────
export interface DecisionMemoryEntry extends BaseMemory {
  kind:               "DECISION";
  objective:          string;
  whyReused:          string;
  whyCreated:         string;
  whyRefactored:      string;
  alternativesRejected: string[];
  finalDecision:      string;
}

// ── Architecture ──────────────────────────────────────────────────────────────
export interface ArchitectureMemoryEntry extends BaseMemory {
  kind:            "ARCHITECTURE";
  proposalId:      string;
  proposalSummary: string;
  decision:        string;
  migrationPlan:   string;
  featureFlags:    string[];
  contracts:       string[];
  breakingChanges: string[];
}

// ── Connector ─────────────────────────────────────────────────────────────────
export interface ConnectorMemoryEntry extends BaseMemory {
  kind:          "CONNECTOR";
  connectorName: string;
  problems:      string[];
  authNotes:     string;
  encodingNotes: string;
  pagination:    string;
  rateLimitNotes: string;
  retryStrategy: string;
  strategies:    string[];
}

// ── Pattern ───────────────────────────────────────────────────────────────────
export interface PatternMemoryEntry extends BaseMemory {
  kind:               "PATTERN";
  patternType:        "RECURRING_BUG" | "CO_CHANGE" | "REUSED_COMPONENT" | "DUPLICATION" | "CRITICAL_DEP" | "HOTSPOT";
  description:        string;
  involvedComponents: string[];
  frequency:          number;
  lastSeen:           number;
}

// ── Repair ────────────────────────────────────────────────────────────────────
export interface RepairMemoryEntry extends BaseMemory {
  kind:       "REPAIR";
  problem:    string;
  strategy:   string;
  autoFixed:  boolean;
  success:    boolean;
  durationMs: number;
}

// ── Approval ──────────────────────────────────────────────────────────────────
export interface ApprovalMemoryEntry extends BaseMemory {
  kind:        "APPROVAL";
  proposalId:  string;
  objective:   string;
  approved:    boolean;
  reason:      string;
  approver:    string;
}

export type AnyMemoryEntry =
  | ImplementationMemoryEntry | BugMemoryEntry | RegressionMemoryEntry
  | DecisionMemoryEntry | ArchitectureMemoryEntry | ConnectorMemoryEntry
  | PatternMemoryEntry | RepairMemoryEntry | ApprovalMemoryEntry;

// ── Experience snapshot ───────────────────────────────────────────────────────
export interface EngineeringExperienceSnapshot {
  totalImplementations:  number;
  successRate:           number;   // 0–100
  rollbackRate:          number;
  reuseRate:             number;
  bugsAvoided:           number;
  estimatedTimeSavedMs:  number;
  averageConfidence:     number;
  totalMemories:         number;
  memoriesByKind:        Record<MemoryKind, number>;
}

// ── Search result ─────────────────────────────────────────────────────────────
export interface MemorySearchResult {
  entry:      AnyMemoryEntry;
  score:      number;   // relevance 0–100
  matchedOn:  string;
}