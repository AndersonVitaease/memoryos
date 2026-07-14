/**
 * ExecutionEvidence.ts — Sprint 6.3.3
 * Append-only evidence store for the execution loop
 */

import type { AELEvidence, AELStage } from "./AELTypes";

let _seq = 0;
function makeId(): string { return `aev_${Date.now()}_${++_seq}`; }

export class ExecutionEvidence {
  private _entries: AELEvidence[] = [];

  capture(
    executionId: string,
    stage: AELStage,
    kind: AELEvidence["kind"],
    label: string,
    value: unknown
  ): AELEvidence {
    const e: AELEvidence = {
      id: makeId(), executionId, stage, kind, label, value, capturedAt: Date.now(),
    };
    this._entries.push(e);
    return e;
  }

  forExecution(executionId: string): AELEvidence[] {
    return this._entries.filter(e => e.executionId === executionId);
  }

  forStage(executionId: string, stage: AELStage): AELEvidence[] {
    return this._entries.filter(e => e.executionId === executionId && e.stage === stage);
  }

  all(): AELEvidence[] { return [...this._entries]; }
  count(): number { return this._entries.length; }
}