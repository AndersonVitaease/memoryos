// Execution Dispatcher v1.0 — Types
// Foundation v1.0 · Engineering First · Sprint Execution Dispatcher v1.0

export type DispatchStatus = "PENDING" | "DISPATCHED" | "CANCELLED" | "FAILED";

export interface DispatchEntry {
  dispatchId:   string;
  goalId:       string;
  queueId:      string | null;
  scheduledAt:  number;
  dispatchTime: number;
  status:       DispatchStatus;
  attempts:     number;
}

export interface DispatchLog {
  executionId: string;
  dispatchId:  string;
  goalId:      string;
  queueId:     string | null;
  operation:   string;
  status:      "SUCCESS" | "FAILED";
  timestamp:   number;
  duration:    number;
  error?:      string;
}

export interface DispatchStatistics {
  dispatchTotal:    number;
  cancelledTotal:   number;
  failedTotal:      number;
  queueDispatches:  number;
  avgDispatchTime:  number;
  dispatchRate:     number;
  maxDispatchRate:  number;
  minDispatchRate:  number;
}

export interface DispatchMetrics {
  dispatchTotal:   number;
  cancelledTotal:  number;
  failedTotal:     number;
  avgDurationMs:   number;
  maxDispatchRate: number;
  minDispatchRate: number;
}

export interface DispatchHealth {
  status: "SUCCESS" | "FAILED";
  checks: {
    schedulerIntegrity: boolean;
    queueIntegrity:     boolean;
    dispatchIntegrity:  boolean;
    consistencyCheck:   boolean;
  };
  details: string;
}