/**
 * ExecutionAudit.ts — Sprint 6.3.3
 * Append-only audit trail for execution loop operations
 */

import type { AELAuditEntry, AELStage, StageStatus } from "./AELTypes";

let _seq = 0;
function makeId(): string { return `aaud_${Date.now()}_${++_seq}`; }

export class ExecutionAudit {
  private _entries: AELAuditEntry[] = [];

  record(
    executionId: string,
    actor: string,
    action: string,
    stage: AELStage | "SYSTEM",
    result: StageStatus,
    reason: string
  ): AELAuditEntry {
    const e: AELAuditEntry = {
      id: makeId(), executionId, actor, action, stage, result, reason,
      timestamp: Date.now(),
    };
    this._entries.push(e);
    return e;
  }

  forExecution(executionId: string): AELAuditEntry[] {
    return this._entries.filter(e => e.executionId === executionId);
  }

  all(): AELAuditEntry[] { return [...this._entries]; }
  count(): number { return this._entries.length; }
}