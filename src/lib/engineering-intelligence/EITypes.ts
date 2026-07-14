/**
 * EITypes.ts — Sprint 6.2.1
 * Shared types for all Engineering Intelligence engines.
 */

// ── Shared enums ──────────────────────────────────────────────────────────────

export type RiskLevel        = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ImplementationStrategy = "REUSE" | "EXTEND" | "CREATE" | "REFACTOR" | "REJECT" | "ASK_APPROVAL";
export type RootCauseCategory =
  | "ENVIRONMENT" | "ARCHITECTURE" | "REGRESSION" | "KNOWLEDGE_GRAPH"
  | "CONNECTOR" | "WORKFLOW" | "CONFIGURATION" | "SECURITY" | "PERFORMANCE" | "UNKNOWN";
export type RepairStatus = "PASS" | "FAIL" | "SKIPPED" | "AUTO_FIXED";

// ── ObjectiveAnalyzer ─────────────────────────────────────────────────────────

export interface ObjectiveAnalysis {
  goal:               string;
  scope:              string;
  requiredComponents: string[];
  dependencies:       string[];
  estimatedImpact:    string;
  estimatedComplexity: RiskLevel;
  suggestedStrategy:  ImplementationStrategy;
  keywords:           string[];
  durationMs:         number;
}

// ── ArchitectureInspector ─────────────────────────────────────────────────────

export interface ArchitectureReport {
  existingComponents:   string[];
  candidateComponents:  string[];
  reusableComponents:   string[];
  missingComponents:    string[];
  conflictingComponents: string[];
  architecturalHotspots: string[];
  kgEntityCount:        number;
  kgModuleCount:        number;
  kgReady:              boolean;
  durationMs:           number;
}

// ── ReuseEngine ───────────────────────────────────────────────────────────────

export type ReuseDecision = "REUSE" | "EXTEND" | "CREATE_NEW";

export interface ReuseResult {
  decision:     ReuseDecision;
  found:        string[];        // matching component names
  partial:      string[];        // partial matches
  sources:      string[];        // KG / GitHub / Memory
  explanation:  string;
  durationMs:   number;
}

// ── DependencyAnalyzer ────────────────────────────────────────────────────────

export interface ImpactNode {
  name:     string;
  type:     "file" | "module" | "connector" | "pipeline" | "singleton" | "service";
  impact:   "DIRECT" | "INDIRECT" | "NONE";
  reason:   string;
}

export interface ImpactGraph {
  nodes:             ImpactNode[];
  affectedFiles:     string[];
  affectedModules:   string[];
  affectedConnectors: string[];
  affectedPipelines: string[];
  singletonsTouched: string[];
  kgImpact:          string;
  regressionImpact:  string;
  durationMs:        number;
}

// ── RiskAnalyzer ──────────────────────────────────────────────────────────────

export interface RiskFactor {
  description: string;
  level:       RiskLevel;
  category:    RootCauseCategory;
}

export interface RiskReport {
  overallRisk:  RiskLevel;
  factors:      RiskFactor[];
  explanation:  string;
  durationMs:   number;
}

// ── ConfidenceEngine ──────────────────────────────────────────────────────────

export interface ConfidenceBreakdown {
  architectureFamiliarity: number;  // 0–1
  reusePercentage:         number;
  regressionHistory:       number;
  dependencyComplexity:    number;
  componentStability:      number;
  previousSuccessRate:     number;
}

export interface ConfidenceResult {
  score:      number;   // 0–100
  breakdown:  ConfidenceBreakdown;
  label:      "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW" | "UNCERTAIN";
  durationMs: number;
}

// ── DecisionEngine ────────────────────────────────────────────────────────────

export interface StrategyDecision {
  strategy:       ImplementationStrategy;
  rationale:      string;
  alternatives:   Array<{ strategy: ImplementationStrategy; reason: string }>;
  confidence:     number;
  durationMs:     number;
}

// ── RepairEngine ──────────────────────────────────────────────────────────────

export interface RepairAction {
  id:          string;
  problem:     string;
  category:    RootCauseCategory;
  strategy:    string;
  executed:    boolean;
  result:      RepairStatus;
  detail:      string;
  durationMs:  number;
}

export interface RepairReport {
  actions:     RepairAction[];
  overallStatus: RepairStatus;
  autoFixed:   number;
  failed:      number;
  durationMs:  number;
}

// ── LearningEngine ────────────────────────────────────────────────────────────

export interface LessonLearned {
  id:               string;
  objective:        string;
  problem:          string;
  solution:         string;
  lessonsLearned:   string[];
  regressionOutcome: string;
  recommendation:   string;
  timestamp:        number;
}

// ── EngineeringTimeline ───────────────────────────────────────────────────────

export interface TimelineEntry {
  id:           string;
  sprint:       string;
  objective:    string;
  filesChanged: number;
  approved:     boolean;
  strategy:     ImplementationStrategy;
  regressionStatus: RepairStatus;
  lessonsCount: number;
  outcome:      "PASS" | "FAIL" | "REJECTED" | "PENDING";
  timestamp:    number;
  durationMs:   number;
}

// ── Full Engineering Intelligence Plan ───────────────────────────────────────

export interface EngineeringIntelligencePlan {
  id:               string;
  objective:        string;
  analysis:         ObjectiveAnalysis;
  architecture:     ArchitectureReport;
  reuse:            ReuseResult;
  impactGraph:      ImpactGraph;
  risk:             RiskReport;
  confidence:       ConfidenceResult;
  decision:         StrategyDecision;
  repairReport:     RepairReport | null;
  lessons:          LessonLearned | null;
  approvedAt:       number | null;
  implementedAt:    number | null;
  regressionStatus: RepairStatus | null;
  outcome:          "PENDING" | "APPROVED" | "REJECTED" | "COMPLETE" | "FAILED";
  createdAt:        number;
  durationMs:       number;
}