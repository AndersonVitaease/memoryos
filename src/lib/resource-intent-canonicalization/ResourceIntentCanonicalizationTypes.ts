import type { ConversationGoal } from "@/lib/goals/GoalTypes";
import type { CanonicalResourceRequestV1 } from "./CanonicalResourceRequestTypes";

export interface ResourceIntentCanonicalizationInput {
  readonly userMessage: string;
  readonly goal: ConversationGoal;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly traceId?: string | null;
  readonly timestampMs?: number;
}

export interface ResourceIntentCanonicalizationAuditRecord {
  readonly timestamp: string;
  readonly contractVersion: number;
  readonly durationMs: number;
  readonly candidateGeneration: {
    readonly enabled: boolean;
    readonly candidateCount: number;
    readonly generationDurationMs: number;
    readonly strategies: readonly string[];
  };
  readonly input: {
    readonly userMessage: string;
    readonly goalType: string;
    readonly goalId: string;
    readonly parameters: Readonly<Record<string, unknown>>;
  };
  readonly produced: CanonicalResourceRequestV1;
}

export interface ResourceIntentCanonicalizationResult {
  readonly request: CanonicalResourceRequestV1;
  readonly durationMs: number;
  readonly audit: ResourceIntentCanonicalizationAuditRecord;
}

export interface IResourceIntentCanonicalizer {
  readonly id: string;
  canonicalize(input: ResourceIntentCanonicalizationInput): ResourceIntentCanonicalizationResult;
}
