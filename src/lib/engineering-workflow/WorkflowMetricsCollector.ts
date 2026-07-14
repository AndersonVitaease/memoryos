/**
 * WorkflowMetricsCollector.ts
 * Sprint 6.2.3 — Engineering Workflow Integration
 *
 * Responsabilidade única: coletar e expor métricas operacionais do workflow.
 * SRP: não toma decisões — apenas agrega números de execuções encerradas.
 */

import type { WorkflowExecution, WorkflowMetrics } from './WorkflowTypes';

interface TimingRecord {
  validationMs: number;
  executionMs: number;
  rollbackMs: number;
}

export class WorkflowMetricsCollector {
  private static readonly timings: TimingRecord[] = [];
  private static totalRequests = 0;
  private static completed = 0;
  private static failed = 0;
  private static rolledBack = 0;
  private static rejected = 0;
  private static approvals = 0;
  private static rejections = 0;

  static recordRequest(): void { this.totalRequests++; }
  static recordCompleted(): void { this.completed++; }
  static recordFailed(): void { this.failed++; }
  static recordRolledBack(): void { this.rolledBack++; }
  static recordRejected(): void { this.rejected++; }
  static recordApproval(): void { this.approvals++; }
  static recordRejection(): void { this.rejections++; }

  static recordTiming(validationMs: number, executionMs: number, rollbackMs: number): void {
    this.timings.push({ validationMs, executionMs, rollbackMs });
  }

  static collect(executions: WorkflowExecution[]): WorkflowMetrics {
    const avg = (arr: number[]): number =>
      arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

    // Derive per-execution timings from event timestamps.
    const validationTimes: number[] = [];
    const executionTimes: number[] = [];
    const rollbackTimes: number[] = [];

    for (const exec of executions) {
      const start = exec.events.find((e) => e.eventType === 'VALIDATION_STARTED');
      const vEnd = exec.events.find((e) => e.eventType === 'VALIDATION_COMPLETED');
      const exStart = exec.events.find((e) => e.eventType === 'EXECUTION_STARTED');
      const exEnd = exec.events.find((e) => e.eventType === 'EXECUTION_COMPLETED');
      const rbStart = exec.events.find((e) => e.eventType === 'ROLLBACK_STARTED');
      const rbEnd = exec.events.find((e) => e.eventType === 'ROLLBACK_COMPLETED');

      if (start && vEnd) {
        validationTimes.push(new Date(vEnd.timestamp).getTime() - new Date(start.timestamp).getTime());
      }
      if (exStart && exEnd) {
        executionTimes.push(new Date(exEnd.timestamp).getTime() - new Date(exStart.timestamp).getTime());
      }
      if (rbStart && rbEnd) {
        rollbackTimes.push(new Date(rbEnd.timestamp).getTime() - new Date(rbStart.timestamp).getTime());
      }
    }

    const total = this.totalRequests || executions.length;
    const successRate = total === 0 ? 0 : Math.round((this.completed / total) * 100);

    return {
      totalRequests:    total,
      completed:        this.completed,
      failed:           this.failed,
      rolledBack:       this.rolledBack,
      rejected:         this.rejected,
      avgValidationMs:  avg(validationTimes),
      avgExecutionMs:   avg(executionTimes),
      avgRollbackMs:    avg(rollbackTimes),
      totalApprovals:   this.approvals,
      totalRejections:  this.rejections,
      successRate,
    };
  }

  static reset(): void {
    this.timings.length = 0;
    this.totalRequests = 0;
    this.completed = 0;
    this.failed = 0;
    this.rolledBack = 0;
    this.rejected = 0;
    this.approvals = 0;
    this.rejections = 0;
  }
}