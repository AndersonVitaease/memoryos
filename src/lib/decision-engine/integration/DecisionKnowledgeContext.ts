/**
 * DecisionKnowledgeContext.ts
 * Builds the knowledge context for a decision request.
 *
 * SRP: Context construction only.
 * Sprint: INTEGRATION-03
 */

export type DecisionDomain =
  | "ARCHITECTURE" | "CONNECTOR" | "RUNTIME"  | "SECURITY"
  | "GOVERNANCE"   | "TESTING"   | "PLANNING" | "GENERAL";

export type DecisionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type DecisionType =
  | "APPROVE" | "REJECT" | "DELEGATE" | "DEFER"
  | "ESCALATE" | "MERGE" | "ARCHIVE";

export interface DecisionRequest {
  readonly decisionId:  string;
  readonly goalId:      string;
  readonly intent:      string;
  readonly decisionType:DecisionType;
  readonly priority:    DecisionPriority;
  readonly domain:      DecisionDomain;
  readonly components:  string[];
  readonly project:     string;
  readonly sprint:      string;
  readonly tags:        string[];
}

export interface DecisionKnowledgeContext {
  readonly decisionId:  string;
  readonly goalId:      string;
  readonly intent:      string;
  readonly decisionType:DecisionType;
  readonly priority:    DecisionPriority;
  readonly domain:      DecisionDomain;
  readonly components:  readonly string[];
  readonly project:     string;
  readonly sprint:      string;
  readonly tags:        readonly string[];
  readonly builtAt:     string;
}

export const DecisionKnowledgeContextBuilder = Object.freeze({
  build(req: DecisionRequest): DecisionKnowledgeContext {
    return {
      decisionId:   req.decisionId,
      goalId:       req.goalId,
      intent:       req.intent.trim(),
      decisionType: req.decisionType,
      priority:     req.priority,
      domain:       req.domain,
      components:   [...(req.components ?? [])],
      project:      req.project  ?? "",
      sprint:       req.sprint   ?? "",
      tags:         [...(req.tags ?? [])],
      builtAt:      new Date().toISOString(),
    };
  },
});