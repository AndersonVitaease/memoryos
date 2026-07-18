/**
 * EvidenceTypes.ts
 * Type definitions for the MemoryOS Evidence-Based Knowledge System.
 *
 * Authority: ENGINEERING
 * SRP: Types only — no logic, no instantiation.
 * Sprint: KB-02
 */

// ── Enumerations ──────────────────────────────────────────────────────────────

export type EvidenceCategory =
  | "BOOT_ERROR"
  | "RUNTIME_ERROR"
  | "ARCHITECTURE_VIOLATION"
  | "SECURITY_ISSUE"
  | "PERFORMANCE_REGRESSION"
  | "STATE_MUTATION"
  | "INTEGRATION_FAILURE"
  | "AUTH_FAILURE"
  | "BUILD_FAILURE"
  | "PIPELINE_FAILURE"
  | "CONNECTOR_FAILURE"
  | "MEMORY_LEAK"
  | "DEPENDENCY_ISSUE"
  | "SRP_VIOLATION"
  | "BREAKING_CHANGE"
  | "CONFIGURATION_ERROR"
  | "UNKNOWN";

export type EvidenceSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type EvidenceStatus =
  | "OPEN"
  | "INVESTIGATING"
  | "RESOLVED"
  | "ACCEPTED"
  | "WONT_FIX"
  | "DUPLICATE";

export type EvidenceType =
  | "INCIDENT"
  | "REGRESSION"
  | "OBSERVATION"
  | "ROOT_CAUSE_ANALYSIS"
  | "POST_MORTEM"
  | "FINDING";

// ── Core Evidence ─────────────────────────────────────────────────────────────

export interface Evidence {
  readonly id:               string;       // EVD-NNN
  readonly type:             EvidenceType;
  readonly category:         EvidenceCategory;
  readonly severity:         EvidenceSeverity;
  readonly status:           EvidenceStatus;
  readonly sprint:           string;
  readonly date:             string;       // ISO date
  readonly author:           string;
  readonly title:            string;
  readonly description:      string;
  readonly problem:          string;
  readonly initialHypothesis:string;
  readonly rootCause:        string;
  readonly solution:         string;
  readonly result:           string;

  // Optional technical details
  readonly stackTrace?:      string;
  readonly logs?:            string;
  readonly filesChanged?:    readonly string[];
  readonly components?:      readonly string[];
  readonly commit?:          string;
  readonly pullRequest?:     string;
  readonly tests?:           readonly string[];
  readonly screenshots?:     readonly string[];
  readonly metrics?:         EvidenceMetrics;

  // Time tracking
  readonly timeToInvestigateMs?: number;
  readonly timeToFixMs?:         number;
  readonly timeToValidateMs?:    number;

  // Version tracking
  readonly versionAffected?: string;
  readonly versionFixed?:    string;

  // Cross-references (read-only links — never modifies target)
  readonly links:            EvidenceLinks;

  // Metadata
  readonly tags:             readonly string[];
  readonly keywords:         readonly string[];
}

export interface EvidenceMetrics {
  readonly errorRate?:       number;
  readonly latencyP99Ms?:    number;
  readonly failureCount?:    number;
  readonly affectedUsers?:   number;
}

export interface EvidenceLinks {
  readonly lessonsLearned?:   readonly string[];  // LL-NNN
  readonly antiPatterns?:     readonly string[];  // AP-NNN
  readonly bestPractices?:    readonly string[];  // BP-NNN
  readonly knownIssues?:      readonly string[];  // KI-NNN
  readonly troubleshooting?:  readonly string[];  // TG-NNN
  readonly journalEntries?:   readonly string[];  // EJ-NNN
  readonly officialDocs?:     readonly string[];  // MCF-001, MRS-001, etc.
  readonly adrs?:             readonly string[];  // ADR-NNN
  readonly rfcs?:             readonly string[];  // RFC-NNN
  readonly sprints?:          readonly string[];
  readonly components?:       readonly string[];
  readonly relatedEvidence?:  readonly string[];  // EVD-NNN
}

// ── Registry & Search ─────────────────────────────────────────────────────────

export interface EvidenceIndexEntry {
  readonly id:       string;
  readonly type:     EvidenceType;
  readonly category: EvidenceCategory;
  readonly severity: EvidenceSeverity;
  readonly status:   EvidenceStatus;
  readonly sprint:   string;
  readonly title:    string;
  readonly keywords: readonly string[];
  readonly tags:     readonly string[];
}

export interface EvidenceSearchQuery {
  readonly field: EvidenceSearchField;
  readonly value: string;
}

export type EvidenceSearchField =
  | "id" | "file" | "component" | "sprint" | "error"
  | "problem" | "keyword" | "adr" | "rfc" | "document"
  | "category" | "severity" | "status";

export interface EvidenceSearchResult {
  readonly evidenceId:   string;
  readonly title:        string;
  readonly category:     EvidenceCategory;
  readonly severity:     EvidenceSeverity;
  readonly matchField:   EvidenceSearchField;
  readonly score:        number;
}

export interface EvidenceValidationResult {
  readonly evidenceId: string;
  readonly valid:      boolean;
  readonly errors:     readonly string[];
  readonly warnings:   readonly string[];
}

export interface EvidenceStats {
  readonly total:               number;
  readonly byCategory:          Partial<Record<EvidenceCategory, number>>;
  readonly bySeverity:          Partial<Record<EvidenceSeverity, number>>;
  readonly byStatus:            Partial<Record<EvidenceStatus, number>>;
  readonly bySprint:            Record<string, number>;
  readonly topComponents:       Array<{ component: string; count: number }>;
  readonly avgTimeToFixMs:      number;
  readonly avgTimeToInvestigateMs: number;
  readonly topAntiPatterns:     readonly string[];
  readonly topBestPractices:    readonly string[];
}