/**
 * ExecutionStage.ts — Sprint EF-7.2.8
 *
 * Official enum of all pipeline stage identifiers.
 * SRP: stage identity only — no state, no logic, no pipeline knowledge.
 * DIP: ExecutionState and ExecutionPipeline both depend on this abstraction.
 */

export enum ExecutionStage {
  USER_INPUT           = "USER_INPUT",
  INTENT_RUNTIME       = "INTENT_RUNTIME",
  GOAL_RUNTIME         = "GOAL_RUNTIME",
  PLANNING_RUNTIME     = "PLANNING_RUNTIME",
  KERNEL               = "KERNEL",
  RUNTIME_ORCHESTRATOR = "RUNTIME_ORCHESTRATOR",
  CAPABILITY_RUNTIME   = "CAPABILITY_RUNTIME",
  CONNECTOR_RUNTIME    = "CONNECTOR_RUNTIME",
  CONNECTOR            = "CONNECTOR",
  RESULT               = "RESULT",
  MEMORY               = "MEMORY",
  EXPLAINABILITY       = "EXPLAINABILITY",
  AUDIT                = "AUDIT",
}