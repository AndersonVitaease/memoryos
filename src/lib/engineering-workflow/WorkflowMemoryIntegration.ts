/**
 * WorkflowMemoryIntegration.ts
 * Sprint 6.2.3 — Engineering Workflow Integration
 *
 * Responsabilidade única: registrar automaticamente cada etapa do workflow
 * no EngineeringMemory. Toda decisão permanece auditável e recuperável.
 * SRP: não conhece governança nem estado — apenas grava artefatos no memory.
 */

import { EngineeringMemory } from './EngineeringMemory';
import type { WorkflowExecution } from './WorkflowTypes';
import type { GovernanceDecision } from '../engineering-governance/EngineeringGovernance';
import type { RollbackResult } from '../engineering-governance/GovernanceTypes';

/** Singleton memory store compartilhado pelo workflow. */
const _memory = new EngineeringMemory();

export class WorkflowMemoryIntegration {
  static recordRequestCreated(execution: WorkflowExecution): string {
    const entry = _memory.record(
      'approved_plan',
      execution.request.objective,
      `REQUEST_CREATED — principal: ${execution.request.principalId}, op: ${execution.request.operation} on ${execution.request.targetPath}`,
      [execution.request.targetPath, execution.request.principalRole],
      { requestId: execution.request.id, correlationId: execution.correlationId }
    );
    return entry.id;
  }

  static recordValidation(execution: WorkflowExecution, decision: GovernanceDecision, durationMs: number): string {
    const entry = _memory.record(
      'validation_record',
      execution.request.objective,
      `VALIDATION_COMPLETED — approved: ${decision.approved}, violations: ${decision.violations.length}, durationMs: ${durationMs}`,
      [execution.request.targetPath],
      {
        requestId:  execution.request.id,
        approved:   decision.approved,
        violations: decision.violations,
        severity:   decision.impactReport.severity,
        riskScore:  decision.impactReport.riskScore,
        durationMs,
      }
    );
    return entry.id;
  }

  static recordApproval(execution: WorkflowExecution, approved: boolean, approver: string, reason?: string): string {
    const type = approved ? 'approved_plan' : 'rejected_plan';
    const entry = _memory.record(
      type,
      execution.request.objective,
      `${approved ? 'APPROVED' : 'REJECTED'} by ${approver}${reason ? ` — ${reason}` : ''}`,
      [execution.request.targetPath],
      { requestId: execution.request.id, approver, reason, approved }
    );
    return entry.id;
  }

  static recordSnapshot(execution: WorkflowExecution, snapshotId: string): string {
    const entry = _memory.record(
      'validation_record',
      execution.request.objective,
      `SNAPSHOT_CREATED — snapshotId: ${snapshotId}`,
      [execution.request.targetPath],
      { requestId: execution.request.id, snapshotId }
    );
    return entry.id;
  }

  static recordExecution(execution: WorkflowExecution, sandboxId: string | undefined, durationMs: number): string {
    const entry = _memory.record(
      'completed_work',
      execution.request.objective,
      `EXECUTION_COMPLETED — sandboxId: ${sandboxId ?? 'N/A'}, durationMs: ${durationMs}`,
      [execution.request.targetPath],
      { requestId: execution.request.id, sandboxId, durationMs }
    );
    return entry.id;
  }

  static recordRollback(execution: WorkflowExecution, result: RollbackResult, reason: string): string {
    const entry = _memory.record(
      'regression',
      execution.request.objective,
      `ROLLBACK_${result.success ? 'COMPLETED' : 'FAILED'} — snapshotId: ${result.snapshotId}, reason: ${reason}`,
      [execution.request.targetPath],
      { requestId: execution.request.id, rollbackResult: result as unknown as Record<string, unknown>, reason }
    );
    return entry.id;
  }

  static recordFailure(execution: WorkflowExecution, error: string): string {
    const entry = _memory.record(
      'regression',
      execution.request.objective,
      `WORKFLOW_FAILED — error: ${error}`,
      [execution.request.targetPath],
      { requestId: execution.request.id, error, state: execution.state }
    );
    return entry.id;
  }

  static recordCompleted(execution: WorkflowExecution): string {
    const entry = _memory.record(
      'engineering_report',
      execution.request.objective,
      `WORKFLOW_COMPLETED — events: ${execution.events.length}, state: ${execution.state}`,
      [execution.request.targetPath, execution.request.principalId],
      {
        requestId:    execution.request.id,
        correlationId: execution.correlationId,
        state:        execution.state,
        eventCount:   execution.events.length,
        snapshotId:   execution.snapshotId,
        sandboxId:    execution.sandboxId,
      }
    );
    return entry.id;
  }

  /** Direct access to the underlying memory store for health/stats. */
  static memory(): EngineeringMemory {
    return _memory;
  }
}