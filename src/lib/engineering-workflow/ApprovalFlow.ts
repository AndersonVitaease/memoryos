/**
 * ApprovalFlow.ts
 * Sprint 6.2.3 — Engineering Workflow Integration
 *
 * Responsabilidade única: gerenciar o ciclo de vida de aprovações para
 * alterações críticas. Suporta múltiplos aprovadores e histórico completo.
 * Não conhece governança nem workflow — opera apenas sobre ApprovalRecord.
 */

import type { ApprovalRecord, ApprovalVote, ApprovalStatus } from './WorkflowTypes';

const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

let _approvalSeq = 0;
function makeApprovalId(): string {
  return `appr-${Date.now()}-${++_approvalSeq}`;
}

export class ApprovalFlow {
  private static readonly records: ApprovalRecord[] = [];

  /**
   * Creates a new approval record for a request.
   * At least one approver must be provided.
   */
  static create(
    requestId: string,
    requiredApprovers: string[],
    expiryMs = DEFAULT_EXPIRY_MS
  ): ApprovalRecord {
    if (requiredApprovers.length === 0) {
      throw new Error('[ApprovalFlow] At least one approver is required.');
    }

    const now = new Date();
    const record: ApprovalRecord = {
      id: makeApprovalId(),
      requestId,
      requiredApprovers: [...requiredApprovers],
      votes: [],
      status: 'PENDING',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + expiryMs).toISOString(),
    };

    this.records.push(record);
    return { ...record, votes: [] };
  }

  /**
   * Records an approver vote (APPROVE or REJECT).
   * A single REJECT immediately resolves the record as REJECTED.
   * All required approvers must vote APPROVE to reach APPROVED status.
   */
  static vote(approvalId: string, approverId: string, vote: 'APPROVE' | 'REJECT', reason?: string): ApprovalRecord {
    const record = this.records.find((r) => r.id === approvalId);
    if (!record) throw new Error(`[ApprovalFlow] Approval record not found: ${approvalId}`);
    if (record.status !== 'PENDING') throw new Error(`[ApprovalFlow] Cannot vote on ${record.status} approval.`);

    // Check expiry.
    if (new Date().toISOString() > record.expiresAt) {
      record.status = 'EXPIRED';
      record.resolvedAt = new Date().toISOString();
      throw new Error(`[ApprovalFlow] Approval ${approvalId} has expired.`);
    }

    // Only registered approvers may vote.
    if (!record.requiredApprovers.includes(approverId)) {
      throw new Error(`[ApprovalFlow] Principal "${approverId}" is not a registered approver.`);
    }

    // Prevent duplicate votes.
    const existingVote = record.votes.find((v) => v.approverId === approverId);
    if (existingVote) {
      throw new Error(`[ApprovalFlow] Approver "${approverId}" already voted.`);
    }

    const approvalVote: ApprovalVote = {
      approverId,
      vote,
      reason,
      votedAt: new Date().toISOString(),
    };
    record.votes.push(approvalVote);

    // Resolve immediately on rejection.
    if (vote === 'REJECT') {
      record.status = 'REJECTED';
      record.resolvedAt = new Date().toISOString();
      return { ...record, votes: [...record.votes] };
    }

    // Check if all required approvers have approved.
    const approvedBy = record.votes.filter((v) => v.vote === 'APPROVE').map((v) => v.approverId);
    const allApproved = record.requiredApprovers.every((a) => approvedBy.includes(a));
    if (allApproved) {
      record.status = 'APPROVED';
      record.resolvedAt = new Date().toISOString();
    }

    return { ...record, votes: [...record.votes] };
  }

  /** Cancels a pending approval (e.g., request was superseded). */
  static cancel(approvalId: string): ApprovalRecord {
    const record = this.records.find((r) => r.id === approvalId);
    if (!record) throw new Error(`[ApprovalFlow] Approval record not found: ${approvalId}`);
    if (record.status !== 'PENDING') throw new Error(`[ApprovalFlow] Cannot cancel a ${record.status} approval.`);

    record.status = 'CANCELLED';
    record.resolvedAt = new Date().toISOString();
    return { ...record, votes: [...record.votes] };
  }

  /** Checks all PENDING records and marks expired ones. */
  static sweepExpired(): number {
    const now = new Date().toISOString();
    let count = 0;
    for (const r of this.records) {
      if (r.status === 'PENDING' && r.expiresAt < now) {
        r.status = 'EXPIRED';
        r.resolvedAt = now;
        count++;
      }
    }
    return count;
  }

  /** Returns a copy of a record by id. */
  static get(approvalId: string): ApprovalRecord | null {
    const r = this.records.find((r) => r.id === approvalId);
    return r ? { ...r, votes: [...r.votes] } : null;
  }

  /** Returns all records for a request id. */
  static forRequest(requestId: string): ApprovalRecord[] {
    return this.records
      .filter((r) => r.requestId === requestId)
      .map((r) => ({ ...r, votes: [...r.votes] }));
  }

  /** Returns all records by status. */
  static listByStatus(status: ApprovalStatus): ApprovalRecord[] {
    return this.records
      .filter((r) => r.status === status)
      .map((r) => ({ ...r, votes: [...r.votes] }));
  }

  static health(): { status: 'ok'; total: number; pending: number; approved: number; rejected: number } {
    return {
      status: 'ok',
      total: this.records.length,
      pending: this.records.filter((r) => r.status === 'PENDING').length,
      approved: this.records.filter((r) => r.status === 'APPROVED').length,
      rejected: this.records.filter((r) => r.status === 'REJECTED').length,
    };
  }
}