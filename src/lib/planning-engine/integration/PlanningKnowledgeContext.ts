/**
 * PlanningKnowledgeContext.ts
 * Builds the knowledge context consumed by the Planning Knowledge Pipeline.
 *
 * SRP: Context construction only.
 * Sprint: INTEGRATION-01
 */

export type KnowledgeDomain =
  | "ARCHITECTURE" | "CONNECTOR" | "RUNTIME" | "SECURITY"
  | "GOVERNANCE"   | "TESTING"   | "DEVOPS"  | "GENERAL";

export type KnowledgePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface PlanningGoalInput {
  readonly goalId:     string;
  readonly intent:     string;
  readonly priority:   KnowledgePriority;
  readonly domain:     KnowledgeDomain;
  readonly components: string[];
  readonly project:    string;
  readonly sprint:     string;
  readonly tags:       string[];
}

export interface PlanningKnowledgeContext {
  readonly goalId:      string;
  readonly intent:      string;
  readonly priority:    KnowledgePriority;
  readonly domain:      KnowledgeDomain;
  readonly components:  readonly string[];
  readonly project:     string;
  readonly sprint:      string;
  readonly tags:        readonly string[];
  readonly builtAt:     string;
}

export const PlanningKnowledgeContextBuilder = Object.freeze({
  build(input: PlanningGoalInput): PlanningKnowledgeContext {
    return {
      goalId:     input.goalId,
      intent:     input.intent.trim(),
      priority:   input.priority,
      domain:     input.domain,
      components: [...(input.components ?? [])],
      project:    input.project   ?? "",
      sprint:     input.sprint    ?? "",
      tags:       [...(input.tags ?? [])],
      builtAt:    new Date().toISOString(),
    };
  },
});