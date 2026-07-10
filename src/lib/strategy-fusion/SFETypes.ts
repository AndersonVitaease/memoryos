// ─── Strategy Fusion Engine — Types ────────────────────────────────────────────
// Foundation v1.0 · Contracts · Scores · Fusion Session

import type { SpecialistContract } from "@/lib/specialist-router/SpecialistTypes";

// ── Status types ──────────────────────────────────────────────────────────────

export type FusionStatus    = "Pending" | "Running" | "Completed" | "Failed";
export type ConflictStatus  = "Detected" | "Resolved" | "RequiresHumanApproval";
export type ResolutionRule  = "HigherConfidence" | "LowerRisk" | "LowerCost" | "GoalAdherence" | "KnowledgeAdherence" | "HumanRequired";
export type RecommendationStatus = "Accepted" | "Rejected" | "Merged";

// ── Specialist Strategy (Cap. 2) ──────────────────────────────────────────────

export interface StrategyRecommendation {
  id:          string;
  title:       string;
  description: string;
  priority:    "Critical" | "High" | "Medium" | "Low";
  status:      RecommendationStatus;
  rejectionReason?: string;
}

export interface SpecialistStrategy {
  id:              string;
  specialistId:    string;
  specialistName:  string;
  domain:          string;
  objective:       string;
  recommendations: StrategyRecommendation[];
  justifications:  string[];
  risks:           string[];
  dependencies:    string[];   // ids of other specialistIds this depends on
  limitations:     string[];
  confidenceLevel: number;     // 0–1
  createdAt:       number;
}

// ── Conflict (Cap. 4) ─────────────────────────────────────────────────────────

export type ConflictType = "IncompatibleRecommendation" | "ConflictingPriority" | "ContradictoryConstraint" | "ImpossibleDependency" | "IncompatibleRisk";

export interface StrategyConflict {
  id:              string;
  type:            ConflictType;
  description:     string;
  specialistA:     string;    // specialistId
  specialistB:     string;
  recommendationA: string;    // description
  recommendationB: string;
  status:          ConflictStatus;
  resolution?:     ConflictResolution;
  detectedAt:      number;
}

export interface ConflictResolution {
  rule:           ResolutionRule;
  winner:         string;   // specialistId that "won"
  loser:          string;
  justification:  string;
  resolvedAt:     number;
}

// ── Fusion Scores (Cap. 8) ────────────────────────────────────────────────────

export interface FusionScores {
  consensusScore:  number;  // 0–100: how much specialists agreed
  conflictScore:   number;  // 0–100: severity of conflicts found
  coverageScore:   number;  // 0–100: how well goal is covered
  confidenceScore: number;  // 0–100: avg confidence across strategies
  knowledgeScore:  number;  // 0–100: domain coverage breadth
  riskScore:       number;  // 0–100: inverse of total risk exposure
  overallScore:    number;  // weighted composite
}

export interface ScoreExplanation {
  dimension: keyof FusionScores;
  value:     number;
  rationale: string;
}

// ── Unified Strategy (Cap. 6) ─────────────────────────────────────────────────

export interface UnifiedStrategyStep {
  order:         number;
  specialistId:  string;
  specialistName: string;
  action:        string;
  rationale:     string;
  dependencies:  string[];  // specialistIds
  parallel:      boolean;
}

export interface UnifiedStrategy {
  id:               string;
  goalId:           string;
  goalTitle:        string;
  sequence:         UnifiedStrategyStep[];
  priorities:       string[];
  justifications:   string[];
  risks:            string[];
  dependencies:     string[];
  decisions:        DecisionRecord[];
  conflictsHandled: number;
  specialists:      string[];
  scores:           FusionScores;
  createdAt:        number;
}

export interface DecisionRecord {
  id:           string;
  description:  string;
  specialistSuggested: string;
  accepted:     boolean;
  reason:       string;
  alternatives: string[];
  rule:         ResolutionRule | "AlwaysAccepted";
  timestamp:    number;
}

// ── Fusion Session ────────────────────────────────────────────────────────────

export interface FusionAuditEntry {
  id:        string;
  timestamp: number;
  operation: string;
  detail?:   string;
  success:   boolean;
  error?:    string;
}

export interface FusionSession {
  id:              string;
  goalId:          string;
  goalTitle:       string;
  routingSessionId: string;
  strategies:      SpecialistStrategy[];
  conflicts:       StrategyConflict[];
  unifiedStrategy: UnifiedStrategy | null;
  scores:          FusionScores | null;
  scoreExplanations: ScoreExplanation[];
  auditLog:        FusionAuditEntry[];
  status:          FusionStatus;
  createdAt:       number;
  updatedAt:       number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _c = 0;
export function makeSFEId(prefix = "sfe"): string {
  return `${prefix}_${Date.now()}_${(++_c).toString(36)}`;
}

export function makeFusionAudit(op: string, opts: { detail?: string; success?: boolean; error?: string } = {}): FusionAuditEntry {
  return { id: makeSFEId("sfeaud"), timestamp: Date.now(), operation: op, success: opts.success ?? true, detail: opts.detail, error: opts.error };
}