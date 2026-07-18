/**
 * EngineeringKnowledgeContext.ts
 * Builds the knowledge context for an engineering task.
 *
 * SRP: Context construction only.
 * Sprint: INTEGRATION-05
 */

export type EngineeringTaskType =
  | "IMPLEMENT" | "REFACTOR" | "BUG_FIX" | "REVIEW"
  | "MIGRATION" | "DEPRECATE" | "TEST" | "DOCUMENT" | "DEPLOY";

export type EngineeringPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface EngineeringTaskRequest {
  readonly taskId:     string;
  readonly task:       EngineeringTaskType;
  readonly intent:     string;
  readonly module:     string;
  readonly component:  string;
  readonly files:      string[];
  readonly sprint:     string;
  readonly branch:     string;
  readonly priority:   EngineeringPriority;
  readonly tags:       string[];
}

export interface EngineeringKnowledgeContext {
  readonly taskId:    string;
  readonly task:      EngineeringTaskType;
  readonly intent:    string;
  readonly module:    string;
  readonly component: string;
  readonly files:     readonly string[];
  readonly sprint:    string;
  readonly branch:    string;
  readonly priority:  EngineeringPriority;
  readonly tags:      readonly string[];
  readonly builtAt:   string;
}

export const EngineeringKnowledgeContextBuilder = Object.freeze({
  build(req: EngineeringTaskRequest): EngineeringKnowledgeContext {
    return Object.freeze({
      taskId:    req.taskId,
      task:      req.task,
      intent:    req.intent.trim(),
      module:    req.module    ?? "",
      component: req.component ?? "",
      files:     Object.freeze([...(req.files ?? [])]),
      sprint:    req.sprint    ?? "",
      branch:    req.branch    ?? "",
      priority:  req.priority,
      tags:      Object.freeze([...(req.tags ?? [])]),
      builtAt:   new Date().toISOString(),
    });
  },
});