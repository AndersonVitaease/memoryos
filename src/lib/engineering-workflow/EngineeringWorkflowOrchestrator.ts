/**
 * EngineeringWorkflowOrchestrator.ts
 * Sprint 6.2.3 — Engineering Workflow Integration
 *
 * Orquestrador determinístico do pipeline completo de engenharia.
 * ÚNICA responsabilidade: coordenar o fluxo entre os motores especializados.
 * Não contém regras de negócio — apenas orquestração.
 *
 * Pipeline:
 *   Engineering Request
 *     → WorkflowStateMachine (CREATED)
 *     → GovernanceMiddleware.evaluate()
 *     → [ApprovalFlow se requiresApproval]
 *     → GovernanceMiddleware.execute() [inclui RollbackEngine.capture() + Sandbox]
 *     → WorkflowMemoryIntegration (histórico completo)
 *     → GovernanceAuditEngine (via EngineeringGovernance interno)
 *     → WorkflowMetricsCollector
 *     → COMPLETED / ROLLING_BACK / FAILED
 */

import { WorkflowStateMachine } from './WorkflowStateMachine';
import { GovernanceMiddleware } from './GovernanceMiddleware';
import { ApprovalFlow } from './ApprovalFlow';
import { WorkflowMemoryIntegration } from './WorkflowMemoryIntegration';
import { WorkflowMetricsCollector } from './WorkflowMetricsCollector';
import { RollbackEngine } from '../engineering-governance/RollbackEngine';
import type {
  EngineeringRequest,
  WorkflowExecution,
  WorkflowMetrics,
} from './WorkflowTypes';

let _execSeq = 0;
function makeExecId(): string { return `wfx-${Date.now()}-${++_execSeq}`; }
function makeCorrelationId(): string { return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

export class EngineeringWorkflowOrchestrator {
  /** In-session execution registry. */
  private static readonly executions: WorkflowExecution[] = [];

  /**
   * Primary entry point.
   * Every engineering change MUST go through this method — no bypass.
   *
   * @param request - The engineering request describing who, what, and where.
   * @param task    - The actual work to execute (only runs after governance approval).
   * @param approvers - Optional list of principal IDs required to approve critical changes.
   */
  static async submit(
    request: EngineeringRequest,
    task: () => Promise<unknown> | unknown,
    approvers: string[] = []
  ): Promise<WorkflowExecution> {
    WorkflowMetricsCollector.recordRequest();

    // ── Build execution ──────────────────────────────────────────────────────
    const execution: WorkflowExecution = {
      id:            makeExecId(),
      correlationId: makeCorrelationId(),
      request,
      state:         'CREATED',
      events:        [],
      startedAt:     new Date().toISOString(),
      memoryEntryIds: [],
    };
    this.executions.push(execution);

    // ── CREATED → emit event ─────────────────────────────────────────────────
    WorkflowStateMachine.emitEvent(execution, 'REQUEST_CREATED', request.principalId, {
      objective: request.objective,
      operation: request.operation,
      targetPath: request.targetPath,
    });
    const memId1 = WorkflowMemoryIntegration.recordRequestCreated(execution);
    execution.memoryEntryIds.push(memId1);

    try {
      // ── VALIDATING ──────────────────────────────────────────────────────────
      WorkflowStateMachine.transition(execution, 'VALIDATING', 'VALIDATION_STARTED', 'system');

      const t0Validation = Date.now();
      const middlewareResult = GovernanceMiddleware.evaluate(request);
      const { decision } = middlewareResult;
      execution.governanceDecision = decision;

      WorkflowStateMachine.emitEvent(execution, 'VALIDATION_COMPLETED', 'system', {
        approved:   decision.approved,
        violations: decision.violations,
        severity:   decision.impactReport.severity,
        riskScore:  decision.impactReport.riskScore,
      });
      WorkflowStateMachine.emitEvent(execution, 'POLICY_VALIDATED', 'system', { policyViolations: decision.violations.filter(v => v.includes('Policy')) });
      WorkflowStateMachine.emitEvent(execution, 'SECURITY_VALIDATED', 'system', { securityViolations: decision.violations.filter(v => v.includes('blocked')) });
      WorkflowStateMachine.emitEvent(execution, 'IMPACT_ANALYZED', 'system', {
        severity:  decision.impactReport.severity,
        riskScore: decision.impactReport.riskScore,
        affected:  decision.impactReport.affectedComponents,
      });

      const validationMs = Date.now() - t0Validation;
      const memId2 = WorkflowMemoryIntegration.recordValidation(execution, decision, validationMs);
      execution.memoryEntryIds.push(memId2);

      // ── Hard rejection — governance denied ──────────────────────────────────
      if (!decision.approved && !decision.requiresSandbox) {
        WorkflowStateMachine.transition(execution, 'REJECTED', 'REJECTED', 'system', {
          reason: decision.reason,
          violations: decision.violations,
        });
        WorkflowMetricsCollector.recordRejected();
        const memId = WorkflowMemoryIntegration.recordCompleted(execution);
        execution.memoryEntryIds.push(memId);
        return execution;
      }

      // ── Approval gate — required for critical/high impact ───────────────────
      if (decision.requiresApproval && approvers.length > 0) {
        WorkflowStateMachine.transition(execution, 'WAITING_APPROVAL', 'APPROVAL_REQUIRED', 'system', {
          severity:  decision.impactReport.severity,
          approvers,
        });

        const approvalRecord = ApprovalFlow.create(request.id, approvers);
        execution.approvalRecord = approvalRecord;
        WorkflowStateMachine.emitEvent(execution, 'APPROVAL_REQUIRED', 'system', { approvalId: approvalRecord.id });

        // In a real async system, we would suspend here and resume on vote.
        // For deterministic pipeline: auto-pending state is returned for human action.
        WorkflowMetricsCollector.recordRejected(); // not approved yet — caller must resume
        return execution;
      }

      // ── APPROVED (no explicit approver required or already satisfied) ────────
      WorkflowStateMachine.transition(execution, 'APPROVED', 'APPROVED', 'system', {
        autoApproved: true,
        reason: decision.reason,
      });
      WorkflowMetricsCollector.recordApproval();
      const memId3 = WorkflowMemoryIntegration.recordApproval(execution, true, 'system', 'Auto-approved by governance pipeline');
      execution.memoryEntryIds.push(memId3);

      // ── EXECUTING — snapshot + sandbox via GovernanceMiddleware ─────────────
      WorkflowStateMachine.transition(execution, 'EXECUTING', 'EXECUTION_STARTED', request.principalId);
      WorkflowStateMachine.emitEvent(execution, 'SANDBOX_STARTED', 'system', { targetPath: request.targetPath });

      const t0Exec = Date.now();
      const execResult = await GovernanceMiddleware.execute(request, task);
      const execMs = Date.now() - t0Exec;

      // Record snapshot (P1 guarantee — always present when sandbox ran).
      if (execResult.snapshotId) {
        execution.snapshotId = execResult.snapshotId;
        WorkflowStateMachine.emitEvent(execution, 'SNAPSHOT_CREATED', 'system', { snapshotId: execResult.snapshotId });
        const memId4 = WorkflowMemoryIntegration.recordSnapshot(execution, execResult.snapshotId);
        execution.memoryEntryIds.push(memId4);
      }

      if (execResult.sandboxId) {
        execution.sandboxId = execResult.sandboxId;
      }

      WorkflowStateMachine.emitEvent(execution, 'EXECUTION_COMPLETED', request.principalId, {
        sandboxId:  execResult.sandboxId,
        snapshotId: execResult.snapshotId,
        durationMs: execMs,
      });

      const memId5 = WorkflowMemoryIntegration.recordExecution(execution, execResult.sandboxId, execMs);
      execution.memoryEntryIds.push(memId5);

      // ── COMPLETED ────────────────────────────────────────────────────────────
      WorkflowStateMachine.transition(execution, 'COMPLETED', 'AUDIT_RECORDED', 'system');
      WorkflowStateMachine.emitEvent(execution, 'WORKFLOW_COMPLETED', 'system', {
        totalEvents:   execution.events.length,
        memoryEntries: execution.memoryEntryIds.length,
        durationMs:    Date.now() - new Date(execution.startedAt).getTime(),
      });

      WorkflowMetricsCollector.recordCompleted();
      WorkflowMetricsCollector.recordTiming(validationMs, execMs, 0);

      const memId6 = WorkflowMemoryIntegration.recordCompleted(execution);
      execution.memoryEntryIds.push(memId6);

      return execution;

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      execution.error = errorMsg;

      // ── Automatic rollback ──────────────────────────────────────────────────
      if (WorkflowStateMachine.canTransition(execution.state, 'ROLLING_BACK')) {
        WorkflowStateMachine.transition(execution, 'ROLLING_BACK', 'ROLLBACK_STARTED', 'system', { error: errorMsg });
        WorkflowStateMachine.emitEvent(execution, 'ROLLBACK_STARTED', 'system', { snapshotId: execution.snapshotId, reason: errorMsg });

        const t0Rollback = Date.now();
        let rollbackResult;
        if (execution.snapshotId) {
          rollbackResult = RollbackEngine.rollback(execution.snapshotId);
        } else {
          rollbackResult = { success: false, snapshotId: 'none', restoredPaths: [], failedPaths: [], executedAt: new Date().toISOString() };
        }
        execution.rollbackResult = rollbackResult;
        const rollbackMs = Date.now() - t0Rollback;

        WorkflowStateMachine.emitEvent(execution, 'ROLLBACK_COMPLETED', 'system', {
          success:    rollbackResult.success,
          snapshotId: rollbackResult.snapshotId,
          restored:   rollbackResult.restoredPaths,
          durationMs: rollbackMs,
        });

        WorkflowStateMachine.transition(execution, 'ROLLED_BACK', 'ROLLBACK_COMPLETED', 'system', {
          success: rollbackResult.success,
        });

        WorkflowMetricsCollector.recordRolledBack();
        WorkflowMetricsCollector.recordTiming(0, 0, rollbackMs);

        const memId = WorkflowMemoryIntegration.recordRollback(execution, rollbackResult, errorMsg);
        execution.memoryEntryIds.push(memId);
      } else {
        // Cannot rollback from current state — mark as FAILED.
        if (WorkflowStateMachine.canTransition(execution.state, 'FAILED')) {
          WorkflowStateMachine.transition(execution, 'FAILED', 'WORKFLOW_COMPLETED', 'system', { error: errorMsg });
        }
        WorkflowMetricsCollector.recordFailed();
        const memId = WorkflowMemoryIntegration.recordFailure(execution, errorMsg);
        execution.memoryEntryIds.push(memId);
      }

      return execution;
    }
  }

  /**
   * Resume an execution that is WAITING_APPROVAL after an approver votes.
   * Only valid when execution is in WAITING_APPROVAL state.
   */
  static async resume(
    executionId: string,
    approverId: string,
    vote: 'APPROVE' | 'REJECT',
    task: () => Promise<unknown> | unknown,
    reason?: string
  ): Promise<WorkflowExecution> {
    const execution = this.executions.find((e) => e.id === executionId);
    if (!execution) throw new Error(`[EngineeringWorkflowOrchestrator] Execution not found: ${executionId}`);
    if (execution.state !== 'WAITING_APPROVAL') {
      throw new Error(`[EngineeringWorkflowOrchestrator] Cannot resume execution in state: ${execution.state}`);
    }
    if (!execution.approvalRecord) {
      throw new Error(`[EngineeringWorkflowOrchestrator] No approval record found for execution: ${executionId}`);
    }

    const updatedRecord = ApprovalFlow.vote(execution.approvalRecord.id, approverId, vote, reason);
    execution.approvalRecord = updatedRecord;

    if (updatedRecord.status === 'REJECTED') {
      WorkflowStateMachine.transition(execution, 'REJECTED', 'REJECTED', approverId, { reason });
      WorkflowMetricsCollector.recordRejected();
      WorkflowMemoryIntegration.recordApproval(execution, false, approverId, reason);
      const memId = WorkflowMemoryIntegration.recordCompleted(execution);
      execution.memoryEntryIds.push(memId);
      return execution;
    }

    if (updatedRecord.status === 'APPROVED') {
      WorkflowStateMachine.transition(execution, 'APPROVED', 'APPROVED', approverId, { reason });
      WorkflowStateMachine.emitEvent(execution, 'APPROVED', approverId, { approvalId: updatedRecord.id });
      WorkflowMetricsCollector.recordApproval();
      WorkflowMemoryIntegration.recordApproval(execution, true, approverId, reason);

      // Re-enter execution pipeline from APPROVED state.
      WorkflowStateMachine.transition(execution, 'EXECUTING', 'EXECUTION_STARTED', execution.request.principalId);

      const t0Exec = Date.now();
      try {
        const execResult = await GovernanceMiddleware.execute(execution.request, task);
        const execMs = Date.now() - t0Exec;

        if (execResult.snapshotId) {
          execution.snapshotId = execResult.snapshotId;
          WorkflowStateMachine.emitEvent(execution, 'SNAPSHOT_CREATED', 'system', { snapshotId: execResult.snapshotId });
          WorkflowMemoryIntegration.recordSnapshot(execution, execResult.snapshotId);
        }
        if (execResult.sandboxId) execution.sandboxId = execResult.sandboxId;

        WorkflowStateMachine.emitEvent(execution, 'EXECUTION_COMPLETED', execution.request.principalId, { sandboxId: execResult.sandboxId, durationMs: execMs });
        WorkflowStateMachine.transition(execution, 'COMPLETED', 'AUDIT_RECORDED', 'system');
        WorkflowStateMachine.emitEvent(execution, 'WORKFLOW_COMPLETED', 'system', { totalEvents: execution.events.length });
        WorkflowMetricsCollector.recordCompleted();
        WorkflowMemoryIntegration.recordExecution(execution, execResult.sandboxId, execMs);
        WorkflowMemoryIntegration.recordCompleted(execution);
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        execution.error = errorMsg;
        WorkflowStateMachine.transition(execution, 'ROLLING_BACK', 'ROLLBACK_STARTED', 'system', { error: errorMsg });
        const rollbackResult = execution.snapshotId
          ? RollbackEngine.rollback(execution.snapshotId)
          : { success: false, snapshotId: 'none', restoredPaths: [], failedPaths: [], executedAt: new Date().toISOString() };
        execution.rollbackResult = rollbackResult;
        WorkflowStateMachine.transition(execution, 'ROLLED_BACK', 'ROLLBACK_COMPLETED', 'system');
        WorkflowMetricsCollector.recordRolledBack();
        WorkflowMemoryIntegration.recordRollback(execution, rollbackResult, errorMsg);
      }
    }

    return execution;
  }

  /** Returns a read-only view of all executions. */
  static listExecutions(): WorkflowExecution[] {
    return this.executions.map((e) => ({ ...e, events: [...e.events] }));
  }

  /** Returns a single execution by id. */
  static getExecution(id: string): WorkflowExecution | null {
    const e = this.executions.find((x) => x.id === id);
    return e ? { ...e, events: [...e.events] } : null;
  }

  /** Returns aggregated metrics for all executions. */
  static metrics(): WorkflowMetrics {
    return WorkflowMetricsCollector.collect(this.executions);
  }

  /** Returns consolidated health from all sub-systems. */
  static health(): Record<string, unknown> {
    return {
      workflow:    { status: 'ok', totalExecutions: this.executions.length },
      governance:  GovernanceMiddleware.health(),
      approval:    ApprovalFlow.health(),
      memory:      WorkflowMemoryIntegration.memory().stats(),
      metrics:     this.metrics(),
    };
  }
}