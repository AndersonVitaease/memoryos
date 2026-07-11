// Goal Runtime v0.1 — Goal Types
// Foundation v1.0 · Engineering First · Sprint Goal Runtime v0.1
// Responsabilidade: definir tipos do ciclo de vida de Goals

export type GoalStatus =
  | "CREATED"
  | "VALIDATED"
  | "ACTIVE"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type GoalPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type GoalOrigin = "USER" | "SYSTEM" | "AGENT" | "PLANNER";

export interface GoalContext {
  executionId: string;
  goalId: string;
  userId: string;
  projectId: string;
  sessionId: string;
  identityContext: Record<string, string>;
  createdAt: number;
  updatedAt: number;
  status: GoalStatus;
  priority: GoalPriority;
  origin: GoalOrigin;
}

export interface GoalMetadata {
  goalId: string;
  title: string;
  description: string;
  priority: GoalPriority;
  origin: GoalOrigin;
  userId: string;
  projectId: string;
  sessionId: string;
  tags: string[];
}

export interface GoalLog {
  executionId: string;
  goalId: string;
  status: GoalStatus;
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  error?: string;
}

export interface GoalResult {
  success: boolean;
  goalId: string;
  status: GoalStatus;
  duration: number;
  error?: string;
  logs: GoalLog[];
}

export interface GoalMetrics {
  created: number;
  active: number;
  completed: number;
  cancelled: number;
  failed: number;
  invalid: number;
  avgDurationMs: number;
  totalDurationMs: number;
  executionCount: number;
}