/**
 * MRETypes.ts — Memory Reasoning Engine v1.1 (Sprint EF-7.1.1)
 *
 * Additions:
 *   - EvidenceCorroboration: explicit sourceCount, providerAgreement, corroborationCount
 *     (replaces tags.length proxy in ConflictResolver)
 *   - StructuredContext: machine-readable reasoning output alongside plain context string
 */

import type { MemoryEvidence } from "@/lib/ucme/UCMETypes";

// ── Reasoning Session ─────────────────────────────────────────────────────────

export interface ReasoningSession {
  readonly id:          string;
  readonly query:       string;
  readonly startedAt:   string;
  readonly evidence:    MemoryEvidence[];
  readonly durationMs:  number;
}

// ── Reasoning Evidence ────────────────────────────────────────────────────────

export type EvidenceRole = "primary" | "supporting" | "conflicting" | "discarded" | "hypothetical";

export interface ReasoningEvidence {
  readonly original:      MemoryEvidence;
  readonly role:          EvidenceRole;
  readonly adjustedConf:  number;
  readonly discardReason: string | null;
  readonly relationships: EvidenceRelationship[];
  /** Sprint 7.1.1: explicit corroboration metadata (no more tags.length proxy) */
  readonly corroboration: EvidenceCorroboration;
}

/** Explicit source agreement — never inferred from tags. */
export interface EvidenceCorroboration {
  readonly sourceCount:        number;  // unique providers that agree
  readonly corroborationCount: number;  // total evidence items that agree
  readonly providerAgreement:  number;  // 0–1 fraction of providers agreeing
}

export interface EvidenceRelationship {
  readonly type:        "complements" | "conflicts" | "duplicates" | "precedes" | "causes" | "implies";
  readonly targetId:    string;
  readonly strength:    number;
  readonly explanation: string;
}

// ── Duplicate Merge Record ─────────────────────────────────────────────────────
/** Sprint 7.1.1: duplicates are merged, not silently discarded. */
export interface MergedEvidence {
  readonly primaryId:    string;       // kept evidence
  readonly mergedIds:    string[];     // absorbed evidence (auditable)
  readonly supportCount: number;       // total items merged
  readonly explanation:  string;
}

// ── Conflict ──────────────────────────────────────────────────────────────────

export interface ReasoningConflict {
  readonly id:          string;
  readonly evidenceIds: string[];
  readonly description: string;
  readonly resolution:  "higher_confidence" | "more_recent" | "more_sources" | "unresolved";
  readonly winner:      string | null;
  readonly explanation: string;
}

// ── Hypothesis ────────────────────────────────────────────────────────────────

export interface ReasoningHypothesis {
  readonly id:           string;
  readonly statement:    string;
  readonly probability:  number;
  readonly evidenceIds:  string[];
  readonly limitations:  string;
  readonly isHypothesis: true;
}

// ── Reasoning Rule ────────────────────────────────────────────────────────────

export interface ReasoningRule {
  readonly id:          string;
  readonly description: string;
  apply(evidence: MemoryEvidence[], session: ReasoningSession): RuleApplicationResult;
}

export interface RuleApplicationResult {
  readonly ruleId:        string;
  readonly conflicts:     ReasoningConflict[];
  readonly hypotheses:    ReasoningHypothesis[];
  readonly adjustments:   Map<string, number>;
  readonly discards:      Map<string, string>;
  readonly relationships: EvidenceRelationship[];
  readonly notes:         string[];
}

// ── Structured Context ────────────────────────────────────────────────────────
/** Sprint 7.1.1: machine-readable reasoning output. */
export interface StructuredContext {
  readonly facts:        KnowledgeFact[];
  readonly conflicts:    ReasoningConflict[];
  readonly hypotheses:   ReasoningHypothesis[];
  readonly gaps:         string[];
  readonly timeline:     TimelineEntry[];
  readonly evidenceUsed: string[];   // memoryIds
  readonly merges:       MergedEvidence[];
}

export interface TimelineEntry {
  readonly memoryId:    string;
  readonly providerName: string;
  readonly timestamp:   string;
  readonly summary:     string;
}

// ── Consolidated Knowledge ────────────────────────────────────────────────────

export interface ConsolidatedKnowledge {
  readonly summary:    string;
  readonly facts:      KnowledgeFact[];
  readonly gaps:       string[];
  readonly sources:    string[];
  readonly confidence: number;
}

export interface KnowledgeFact {
  readonly statement:    string;
  readonly confidence:   number;
  readonly sources:      string[];
  readonly isHypothesis: boolean;
}

// ── Explanation ───────────────────────────────────────────────────────────────

export interface ReasoningExplanation {
  readonly conclusion:         string;
  readonly evidenceUsed:       string[];
  readonly evidenceDiscarded:  string[];
  readonly conflictsFound:     boolean;
  readonly hypothesisUsed:     boolean;
  readonly rulesApplied:       string[];
  readonly steps:              string[];
}

// ── Reasoning Result ──────────────────────────────────────────────────────────

export interface ReasoningResult {
  readonly session:           ReasoningSession;
  readonly consolidated:      ConsolidatedKnowledge;
  readonly reasoning:         ReasoningEvidence[];
  readonly conflicts:         ReasoningConflict[];
  readonly hypotheses:        ReasoningHypothesis[];
  readonly explanation:       ReasoningExplanation;
  readonly confidence:        number;
  /** Plain text — preserved for backward compatibility with the Planner. */
  readonly context:           string;
  /** Sprint 7.1.1: structured, machine-readable output. */
  readonly structuredContext: StructuredContext;
  /** Sprint 7.1.1: duplicate merge audit trail. */
  readonly merges:            MergedEvidence[];
}