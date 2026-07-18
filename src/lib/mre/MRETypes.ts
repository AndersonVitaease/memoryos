/**
 * MRETypes.ts — Memory Reasoning Engine v1.0
 * Sprint 7.1.0
 *
 * All types for the MRE system.
 * Input:  MemoryEvidence[] (from UCME)
 * Output: ReasoningResult  (consolidated knowledge for the Planner)
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
// A view of an original MemoryEvidence after reasoning analysis.

export type EvidenceRole = "primary" | "supporting" | "conflicting" | "discarded" | "hypothetical";

export interface ReasoningEvidence {
  readonly original:      MemoryEvidence;
  readonly role:          EvidenceRole;
  readonly adjustedConf:  number;       // confidence after reasoning adjustments
  readonly discardReason: string | null;
  readonly relationships: EvidenceRelationship[];
}

export interface EvidenceRelationship {
  readonly type:       "complements" | "conflicts" | "duplicates" | "precedes" | "causes" | "implies";
  readonly targetId:   string;           // memoryId of related evidence
  readonly strength:   number;           // 0–1
  readonly explanation: string;
}

// ── Conflict ──────────────────────────────────────────────────────────────────

export interface ReasoningConflict {
  readonly id:          string;
  readonly evidenceIds: string[];        // the conflicting memoryIds
  readonly description: string;
  readonly resolution:  "higher_confidence" | "more_recent" | "more_sources" | "unresolved";
  readonly winner:      string | null;   // memoryId of chosen evidence, null if unresolved
  readonly explanation: string;
}

// ── Hypothesis ────────────────────────────────────────────────────────────────

export interface ReasoningHypothesis {
  readonly id:              string;
  readonly statement:       string;
  readonly probability:     number;      // 0–1
  readonly evidenceIds:     string[];    // supporting memoryIds
  readonly limitations:     string;
  readonly isHypothesis:    true;        // always true — never present as fact
}

// ── Reasoning Rule ────────────────────────────────────────────────────────────
// Rules are pure functions: no hardcoded module names.

export interface ReasoningRule {
  readonly id:          string;
  readonly description: string;
  apply(
    evidence: MemoryEvidence[],
    session: ReasoningSession,
  ): RuleApplicationResult;
}

export interface RuleApplicationResult {
  readonly ruleId:          string;
  readonly conflicts:       ReasoningConflict[];
  readonly hypotheses:      ReasoningHypothesis[];
  readonly adjustments:     Map<string, number>;  // memoryId → new confidence
  readonly discards:        Map<string, string>;  // memoryId → reason
  readonly relationships:   EvidenceRelationship[];
  readonly notes:           string[];
}

// ── Reasoning Result ──────────────────────────────────────────────────────────
// This is what the Planner receives instead of raw MemoryEvidence[].

export interface ReasoningResult {
  readonly session:       ReasoningSession;
  readonly consolidated:  ConsolidatedKnowledge;
  readonly reasoning:     ReasoningEvidence[];
  readonly conflicts:     ReasoningConflict[];
  readonly hypotheses:    ReasoningHypothesis[];
  readonly explanation:   ReasoningExplanation;
  readonly confidence:    number;          // overall confidence 0–1
  readonly context:       string;          // ready-to-use LLM context (replaces raw evidence)
}

// ── Consolidated Knowledge ────────────────────────────────────────────────────

export interface ConsolidatedKnowledge {
  readonly summary:       string;
  readonly facts:         KnowledgeFact[];
  readonly gaps:          string[];        // what is unknown
  readonly sources:       string[];        // providerNames used
  readonly confidence:    number;
}

export interface KnowledgeFact {
  readonly statement:     string;
  readonly confidence:    number;
  readonly sources:       string[];        // providerIds
  readonly isHypothesis:  boolean;
}

// ── Explanation ───────────────────────────────────────────────────────────────

export interface ReasoningExplanation {
  readonly conclusion:       string;
  readonly evidenceUsed:     string[];     // memoryIds
  readonly evidenceDiscarded: string[];    // memoryIds
  readonly conflictsFound:   boolean;
  readonly hypothesisUsed:   boolean;
  readonly rulesApplied:     string[];     // rule ids
  readonly steps:            string[];     // human-readable reasoning steps
}