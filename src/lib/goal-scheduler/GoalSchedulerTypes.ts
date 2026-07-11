// Goal Scheduler v1.0 — Types
// Foundation v1.0 · Engineering First · Sprint Goal Scheduler v1.0

import type { GoalPriority } from "@/lib/goal-runtime-v01/GoalTypes";

export type ScheduleStatus =
  | "PENDING"
  | "CANCELLED"
  | "RESCHEDULED"
  | "DISPATCHED";

export interface GoalSchedule {
  scheduleId:  string;
  goalId:      string;
  createdAt:   number;
  scheduledAt: number;
  status:      ScheduleStatus;
  attempts:    number;
  priority:    GoalPriority;
}

export interface SchedulerLog {
  executionId: string;
  scheduleId:  string;
  goalId:      string;
  operation:   string;
  status:      "SUCCESS" | "FAILED";
  timestamp:   number;
  duration:    number;
  error?:      string;
}

export interface SchedulerStatistics {
  scheduled:      number;
  cancelled:      number;
  rescheduled:    number;
  dispatched:     number;
  queueSize:      number;
  maxQueueSize:   number;
  minQueueSize:   number;
  avgWaitMs:      number;
}

export interface SchedulerMetrics {
  createdTotal:    number;
  cancelledTotal:  number;
  dispatchedTotal: number;
  avgDurationMs:   number;
  maxQueueSeen:    number;
  minQueueSeen:    number;
}

export interface SchedulerHealth {
  status: "SUCCESS" | "FAILED";
  checks: {
    queueIntegrity:    boolean;
    registryIntegrity: boolean;
    scheduleIntegrity: boolean;
    consistencyCheck:  boolean;
  };
  details: string;
}