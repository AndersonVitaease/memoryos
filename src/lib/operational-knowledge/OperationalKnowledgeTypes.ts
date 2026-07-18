/**
 * OperationalKnowledgeTypes.ts
 * Type definitions for the MemoryOS Operational Knowledge Base.
 *
 * Authority: ENGINEERING (not OFFICIAL — complements but does not alter Official Library)
 * Status: ACTIVE
 * SRP: Types only — no logic.
 */

export type OKDocumentCategory =
  | "LESSONS_LEARNED"
  | "TROUBLESHOOTING"
  | "ANTI_PATTERNS"
  | "BEST_PRACTICES"
  | "ENGINEERING_JOURNAL"
  | "DEBUG_PLAYBOOK"
  | "KNOWN_ISSUES";

export type OKDocumentStatus = "ACTIVE" | "DEPRECATED" | "ARCHIVED";

export type OKIssuePriority = "P0" | "P1" | "P2" | "P3";

export type OKIssueStatus = "OPEN" | "PARTIALLY_MITIGATED" | "RESOLVED" | "ACCEPTED" | "CLOSED";

export type OKSearchField =
  | "problem"
  | "error"
  | "file"
  | "component"
  | "sprint"
  | "category"
  | "keyword";

export interface OKDocument {
  readonly id:           string;
  readonly name:         string;
  readonly category:     OKDocumentCategory;
  readonly version:      string;
  readonly status:       OKDocumentStatus;
  readonly authority:    "ENGINEERING";
  readonly path:         string;
  readonly registeredAt: number;
  readonly updatedAt:    number;
  readonly tags:         readonly string[];
  readonly keywords:     readonly string[];
  readonly sprints:      readonly string[];
  readonly components:   readonly string[];
  readonly relatedAdrs:  readonly string[];
  readonly relatedRfcs:  readonly string[];
  readonly crossRefs:    readonly string[];
  readonly entryCount:   number;
}

export interface OKLessonLearned {
  readonly id:               string;
  readonly sprint:           string;
  readonly date:             string;
  readonly problem:          string;
  readonly context:          string;
  readonly initialHypothesis:string;
  readonly rootCause:        string;
  readonly solutionApplied:  string;
  readonly result:           string;
  readonly howToAvoid:       string;
  readonly references:       readonly string[];
}

export interface OKAntiPattern {
  readonly id:          string;
  readonly name:        string;
  readonly description: string;
  readonly reason:      string;
  readonly consequence: string;
  readonly alternative: string;
  readonly references:  readonly string[];
}

export interface OKBestPractice {
  readonly id:          string;
  readonly name:        string;
  readonly description: string;
  readonly benefits:    readonly string[];
  readonly whenToUse:   string;
  readonly whenToAvoid: string;
  readonly references:  readonly string[];
}

export interface OKKnownIssue {
  readonly id:          string;
  readonly description: string;
  readonly impact:      string;
  readonly workaround:  string;
  readonly priority:    OKIssuePriority;
  readonly status:      OKIssueStatus;
}

export interface OKJournalEntry {
  readonly id:               string;
  readonly date:             string;
  readonly sprint:           string;
  readonly summary:          string;
  readonly problem:          string;
  readonly solution:         string;
  readonly result:           string;
  readonly lessonsLearned:   readonly string[];
}

export interface OKSearchQuery {
  readonly field:    OKSearchField;
  readonly value:    string;
  readonly category?: OKDocumentCategory;
}

export interface OKSearchResult {
  readonly documentId:  string;
  readonly documentName:string;
  readonly category:    OKDocumentCategory;
  readonly matchField:  OKSearchField;
  readonly matchValue:  string;
  readonly score:       number;
}

export interface OKIndexEntry {
  readonly id:       string;
  readonly category: OKDocumentCategory;
  readonly keywords: readonly string[];
  readonly tags:     readonly string[];
  readonly path:     string;
}

export interface OKRegistryStats {
  readonly totalDocuments:  number;
  readonly totalEntries:    number;
  readonly byCategory:      Record<OKDocumentCategory, number>;
  readonly lastUpdated:     number;
}