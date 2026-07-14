/**
 * ExecutionTimeline.ts — Sprint 6.3.3
 * Append-only timeline — records every stage transition
 */

import type { AELTimelineEntry, AELStage, AELState } from "./AELTypes";

let _seq = 0;
function makeId(): string { return `atl_${Date.now()}_${++_seq}`; }

export class ExecutionTimeline {
  private _entries: AELTimelineEntry[] = [];

  record(
    executionId: string,
    stage: AELStage,
    state: AELState,
    summary: string,
    durationMs: number
  ): AELTimelineEntry {
    const e: AELTimelineEntry = {
      id: makeId(), executionId, stage, state, summary, durationMs,
      timestamp: Date.now(),
    };
    this._entries.push(e);
    return e;
  }

  forExecution(executionId: string): AELTimelineEntry[] {
    return this._entries.filter(e => e.executionId === executionId);
  }

  all(): AELTimelineEntry[] { return [...this._entries]; }
  count(): number { return this._entries.length; }
}