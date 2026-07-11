// Goal Execution Queue v1.0 — Types
// Foundation v1.0 · Engineering First · Sprint Goal Execution Queue v1.0

import type { GoalPriority } from "@/lib/goal-runtime-v01/GoalTypes";

export type QueueEntryStatus =
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "REMOVED";

export interface ExecutionQueueEntry {
  queueId:      string;
  goalId:       string;
  priority:     GoalPriority;
  enqueueTime:  number;
  status:       QueueEntryStatus;
  attempts:     number;
}

export interface QueueLog {
  executionId: string;
  queueId:     string;
  goalId:      string;
  operation:   string;
  status:      "SUCCESS" | "FAILED";
  timestamp:   number;
  duration:    number;
  error?:      string;
}

export interface QueueStatistics {
  enqueued:    number;
  removed:     number;
  processed:   number;
  failed:      number;
  queueSize:   number;
  maxQueue:    number;
  minQueue:    number;
  avgWaitMs:   number;
}

export interface QueueMetrics {
  enqueueTotal:  number;
  dequeueTotal:  number;
  removeTotal:   number;
  peekTotal:     number;
  avgDurationMs: number;
  maxQueueSeen:  number;
  minQueueSeen:  number;
}

export interface QueueHealth {
  status: "SUCCESS" | "FAILED";
  checks: {
    queueIntegrity:    boolean;
    priorityIntegrity: boolean;
    fifoIntegrity:     boolean;
    consistencyCheck:  boolean;
  };
  details: string;
}