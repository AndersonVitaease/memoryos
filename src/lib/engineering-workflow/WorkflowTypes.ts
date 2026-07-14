/**
 * WorkflowTypes.ts
 * Sprint 6.2.3 — Engineering Workflow Integration
 *
 * Tipos centrais compartilhados por todo o pipeline de integração.
 * Única fonte da verdade para estados, eventos e contratos do workflow.
 */

// ─── State Machine States ─────────────────────────────────────────────────────

export type WorkflowState =
  | 'CREATED'
  | 'VALIDATING'
  | 'WAITING_APPROVAL'
  | 'APPROVED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'ROLLING_BACK'
  | 'ROLLED_BACK'
  | 'REJECTED';

/** Valid state transitions — machine rejects any unlisted transition. */
export const VALID_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  CREATED:          ['VALIDATING', 'REJECTED'],
  VALIDATING:       ['WAITING_APPROVAL', 'APPROVED', 'REJECTED', 'FAILED'],
  WAITING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED:         ['EXECUTING', 'FAILED'],
  EXECUTING:        ['COMPLETED', 'FAILED', 'ROLLING_BACK'],
  COMPLETED:        [],
  FAILED:           ['ROLLING_BACK'],
  ROLLING_BACK:     ['ROLLED_BACK', 'FAILED'],
  ROLLED_BACK:      [],
  REJECTED:         [],
};

// ─── Workflow Event Types ─────────────────────────────────────────────────────

export type WorkflowEventType =
  | 'REQUEST_CREATED'
  | 'VALIDATION_STARTED'
  | 'VALIDATION_COMPLETED'
  | 'POLICY_VALIDATED'
  | 'SECURITY_VALIDATED'
  | 'IMPACT_ANALYZED'
  | 'APPROVAL_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SNAPSHOT_CREATED'
  | 'SANDBOX_STARTED'
  | 'EXECUTION_STARTED'
  | 'EXECUTION_COMPLETED'
  | 'ROLLBACK_STARTED'
  | 'ROLLBACK_COMPLETED'
  | 'AUDIT_RECORDED'
  | 'WORKFLOW_COMPLETED';

/** Standardized workflow event — every stage emits one. */
export interface WorkflowEvent {
  id: string;
  timestamp: string;
  correlationId: string;
  requestId: string;
  actor: string;
  eventType: WorkflowEventType;
  payload: Record<string, unknown>;
  status: 'SUCCESS' | 'FAILURE' | 'PENDING';
}

// ─── Engineering Request ──────────────────────────────────────────────────────

export interface EngineeringRequest {
  id: string;
  principalId: string;
  principalRole: string;
  targetPath: string;
  operation: import('../engineering-governance/GovernanceTypes').OperationType;
  objective: string;
  createdAt: string;
}

// ─── Approval Flow ────────────────────────────────────────────────────────────

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface ApprovalVote {
  approverId: string;
  vote: 'APPROVE' | 'REJECT';
  reason?: string;
  votedAt: string;
}

export interface ApprovalRecord {
  id: string;
  requestId: string;
  requiredApprovers: string[];
  votes: ApprovalVote[];
  status: ApprovalStatus;
  createdAt: string;
  resolvedAt?: string;
  expiresAt: string;
}

// ─── Workflow Execution ───────────────────────────────────────────────────────

export interface WorkflowExecution {
  id: string;
  correlationId: string;
  request: EngineeringRequest;
  state: WorkflowState;
  events: WorkflowEvent[];
  governanceDecision?: import('../engineering-governance/EngineeringGovernance').GovernanceDecision;
  approvalRecord?: ApprovalRecord;
  snapshotId?: string;
  sandboxId?: string;
  rollbackResult?: import('../engineering-governance/GovernanceTypes').RollbackResult;
  startedAt: string;
  completedAt?: string;
  error?: string;
  memoryEntryIds: string[];
}

// ─── Workflow Metrics ─────────────────────────────────────────────────────────

export interface WorkflowMetrics {
  totalRequests: number;
  completed: number;
  failed: number;
  rolledBack: number;
  rejected: number;
  avgValidationMs: number;
  avgExecutionMs: number;
  avgRollbackMs: number;
  totalApprovals: number;
  totalRejections: number;
  successRate: number;
}