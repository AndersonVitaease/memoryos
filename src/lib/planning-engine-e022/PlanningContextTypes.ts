import type { ConversationGoal } from "@/lib/goals/GoalTypes";
import type { CanonicalResourceRequestV1 } from "@/lib/resource-intent-canonicalization";

export type PlanningFieldSource = "crr" | "goal";

export interface PlanningContextMetadata {
  readonly source: string;
  readonly traceId: string | null;
  readonly featureFlagEnabled: boolean;
  readonly receivedAtMs: number;
}

export interface PlanningContext {
  readonly goal: ConversationGoal;
  readonly canonicalResourceRequest: CanonicalResourceRequestV1 | null;
  readonly runtimeContext: Readonly<Record<string, unknown>>;
  readonly metadata: PlanningContextMetadata;
}

export interface PlanningContextComparison {
  readonly hasCanonicalResourceRequest: boolean;
  readonly contractVersion: number | null;
  readonly rawTextPreserved: boolean;
  readonly parametersPreserved: boolean;
  readonly actionCompatible: boolean;
  readonly informationLossDetected: boolean;
  readonly divergences: readonly string[];
  readonly comparisonDurationMs: number;
  readonly valid: boolean;
}

export interface PlanningDualReadResolution {
  readonly enabled: boolean;
  readonly goalType: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly rawText: string;
  readonly action: string;
  readonly selectors: Readonly<Record<string, unknown>>;
  readonly resourceHints: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly fieldSources: {
    readonly goalType: PlanningFieldSource;
    readonly parameters: PlanningFieldSource;
    readonly rawText: PlanningFieldSource;
    readonly action: PlanningFieldSource;
    readonly selectors: PlanningFieldSource;
    readonly resourceHints: PlanningFieldSource;
    readonly metadata: PlanningFieldSource;
  };
  readonly fallbackCount: number;
  readonly missingFields: readonly string[];
  readonly divergences: readonly string[];
  readonly resolutionDurationMs: number;
  readonly crrCoverage: number;
}

export interface PlanningContextAuditRecord {
  readonly timestamp: string;
  readonly goalType: string;
  readonly goalId: string;
  readonly featureFlagEnabled: boolean;
  readonly goal: ConversationGoal;
  readonly canonicalResourceRequest: CanonicalResourceRequestV1 | null;
  readonly comparison: PlanningContextComparison;
  readonly dualRead: PlanningDualReadResolution;
}

export interface PlanningContextMetrics {
  readonly total: number;
  readonly withCanonicalResourceRequest: number;
  readonly divergences: number;
  readonly validComparisons: number;
  readonly crrReads: number;
  readonly goalReads: number;
  readonly fallbackCount: number;
  readonly dualReadDivergences: number;
  readonly averageCrrCoverage: number;
}
