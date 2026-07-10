/**
 * MRI — MemoryOS Reference Implementation
 * IAuditTrail — Interface oficial de Auditoria (MCS Capítulo 6)
 */

export type AuditAction =
  | "execution.started"
  | "execution.completed"
  | "execution.failed"
  | "step.started"
  | "step.completed"
  | "step.failed"
  | "step.rolled_back"
  | "approval.requested"
  | "approval.granted"
  | "approval.rejected"
  | "memory.stored"
  | "memory.retrieved"
  | "journey.created"
  | "journey.paused"
  | "journey.resumed"
  | "journey.completed"
  | "security.blocked"
  | "learning.consolidated";

export interface AuditEntry {
  auditId:        string;
  action:         AuditAction;
  userId:         string;
  sessionId:      string;
  journeyId?:     string;
  executionId?:   string;
  stepId?:        string;
  resource?:      string;
  outcome:        "success" | "failure" | "blocked";
  details?:       unknown;
  timestamp:      string;
  immutable:      true;
}

export interface IAuditTrail {
  record(entry: Omit<AuditEntry, "auditId" | "timestamp" | "immutable">): Promise<AuditEntry>;
  query(filters: {
    userId?:      string;
    executionId?: string;
    journeyId?:   string;
    action?:      AuditAction;
    from?:        string;
    to?:          string;
    limit?:       number;
  }): Promise<AuditEntry[]>;
}