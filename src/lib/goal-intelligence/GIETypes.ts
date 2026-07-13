/**
 * GIETypes.ts — Goal Intelligence Engine Types
 * Phase 5 · MemoryOS · 2026-07-13
 *
 * Goals are living cognitive entities — not static records.
 * Immutable snapshots; transitions are append-only events.
 * Provider-agnostic, SOLID compliant.
 */

// ── IDs ───────────────────────────────────────────────────────────────────────

let _seq = 0;
export function makeGIEId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_seq).toString(36)}`;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export type GoalStatus =
  | "created"
  | "validated"
  | "planned"
  | "executing"
  | "waiting"
  | "blocked"
  | "completed"
  | "cancelled"
  | "archived";

export type TransitionTrigger =
  | "user_input"
  | "dependency_resolved"
  | "dependency_blocked"
  | "plan_generated"
  | "progress_detected"
  | "risk_detected"
  | "knowledge_update"
  | "learning_update"
  | "manual_override"
  | "completion_detected"
  | "cancellation";

export interface StatusTransition {
  readonly id: string;
  readonly goalId: string;
  readonly from: GoalStatus;
  readonly to: GoalStatus;
  readonly trigger: TransitionTrigger;
  readonly occurredAt: number;
  readonly reason: string;
  readonly evidence: string;
}

// ── Goal Provenance ───────────────────────────────────────────────────────────

export interface GoalProvenance {
  readonly createdAt: number;
  readonly createdBy: string;
  readonly sourceType: "user_input" | "knowledge_derived" | "learning_derived" | "system";
  readonly sourceRef: string | null;
  readonly engineVersion: string;
}

// ── Goal Decomposition ────────────────────────────────────────────────────────

export type DecompositionItemType = "objective" | "milestone" | "task" | "subgoal" | "dependency";

export interface DecompositionItem {
  readonly id: string;
  readonly type: DecompositionItemType;
  readonly title: string;
  readonly description: string;
  readonly estimatedEffort: "low" | "medium" | "high";
  readonly dependsOn: readonly string[];  // ids of other items
  readonly requiredConnectors: readonly string[];
  readonly order: number;
  readonly provenance: string;  // reference to goal id
}

export interface GoalDecomposition {
  readonly id: string;
  readonly goalId: string;
  readonly generatedAt: number;
  readonly objectives: readonly DecompositionItem[];
  readonly milestones: readonly DecompositionItem[];
  readonly tasks: readonly DecompositionItem[];
  readonly subgoals: readonly DecompositionItem[];
  readonly dependencies: readonly DecompositionItem[];
  readonly totalItems: number;
  readonly estimatedCompletionDays: number;
  readonly complexityScore: number;   // 0–100
}

// ── Goal Monitoring ────────────────────────────────────────────────────────────

export interface ProgressSample {
  readonly sampledAt: number;
  readonly progressPct: number;    // 0–100
  readonly completedItems: number;
  readonly totalItems: number;
  readonly confidence: number;     // 0–1
  readonly blockedCount: number;
}

export interface GoalMonitorSnapshot {
  readonly id: string;
  readonly goalId: string;
  readonly snapshotAt: number;
  readonly progressPct: number;
  readonly confidence: number;
  readonly riskLevel: "low" | "medium" | "high" | "critical";
  readonly blockedItems: string[];
  readonly completionPrediction: string | null;   // ISO date string
  readonly progressHistory: readonly ProgressSample[];
  readonly warnings: string[];
}

// ── Dynamic Replanning ─────────────────────────────────────────────────────────

export type ReplanTrigger =
  | "knowledge_update"
  | "learning_update"
  | "risk_change"
  | "dependency_change"
  | "priority_change"
  | "new_opportunity"
  | "progress_stall";

export interface ReplanEvent {
  readonly id: string;
  readonly goalId: string;
  readonly triggeredAt: number;
  readonly trigger: ReplanTrigger;
  readonly description: string;
  readonly priorityChanged: boolean;
  readonly newRisks: string[];
  readonly newOpportunities: string[];
  readonly dependencyChanges: string[];
  readonly updatedDecompositionId: string | null;
  readonly reasoning: string;
}

// ── Goal ─────────────────────────────────────────────────────────────────────

export interface Goal {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: "product" | "architecture" | "knowledge" | "performance" | "security" | "documentation" | "testing" | "other";
  readonly priority: "low" | "medium" | "high" | "critical";
  readonly status: GoalStatus;
  readonly provenance: GoalProvenance;
  // decomposition
  readonly decomposition: GoalDecomposition | null;
  // monitoring
  readonly latestMonitor: GoalMonitorSnapshot | null;
  // replanning
  readonly replanEvents: readonly ReplanEvent[];
  readonly transitions: readonly StatusTransition[];
  // knowledge links
  readonly linkedKnowledgeItems: readonly string[];
  readonly linkedLearningRecords: readonly string[];
}

// ── Recommendation ────────────────────────────────────────────────────────────

export interface GIERecommendation {
  readonly id: string;
  readonly generatedAt: number;
  readonly goalId: string;
  readonly type: "unblock" | "reprioritize" | "decompose_further" | "add_dependency" | "reduce_scope" | "leverage_learning";
  readonly title: string;
  readonly reasoning: string;
  readonly priority: "low" | "medium" | "high";
  readonly actionableSteps: readonly string[];
}

// ── Cognitive Integration Record ───────────────────────────────────────────────

export interface CognitiveIntegrationRecord {
  readonly id: string;
  readonly integratedAt: number;
  readonly goalId: string;
  readonly kreItemsLinked: number;
  readonly kfeRelationshipsLinked: number;
  readonly ireIdentitiesLinked: number;
  readonly preComponentsLinked: number;
  readonly cdlPhasesLinked: number;
  readonly cleRecordsLinked: number;
  readonly knowledgeGraphNodesAdded: number;
  readonly timelineEventsAdded: number;
  readonly provenanceRecords: Array<{ source: string; refId: string }>;
}

// ── GIE Report ─────────────────────────────────────────────────────────────────

export interface GIEReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly certified: boolean;
  readonly certificationLevel: "CERTIFIED" | "PARTIAL" | "FAILED";
  readonly totalGoals: number;
  readonly byStatus: Readonly<Record<GoalStatus, number>>;
  readonly byPriority: Readonly<Record<string, number>>;
  readonly avgProgressPct: number;
  readonly avgConfidence: number;
  readonly totalReplanEvents: number;
  readonly totalRecommendations: number;
  readonly cognitiveIntegrations: number;
  readonly goals: readonly Goal[];
  readonly topRecommendations: readonly GIERecommendation[];
  readonly summary: string;
}