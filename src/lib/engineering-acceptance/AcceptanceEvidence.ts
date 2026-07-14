/**
 * AcceptanceEvidence.ts — Sprint 6.3.2
 * Evidence store — append-only, never deleted
 */

import type { AcceptanceEvidence, EvidenceKind } from "./EAFTypes";

let _seq = 0;
function makeId(): string { return `ev_${Date.now()}_${++_seq}`; }

export class AcceptanceEvidenceStore {
  private _entries: AcceptanceEvidence[] = [];

  capture(
    criterionId: string,
    kind: EvidenceKind,
    label: string,
    value: unknown
  ): AcceptanceEvidence {
    const e: AcceptanceEvidence = {
      id: makeId(),
      criterionId,
      kind,
      label,
      value,
      capturedAt: Date.now(),
    };
    this._entries.push(e);
    return e;
  }

  forCriterion(criterionId: string): AcceptanceEvidence[] {
    return this._entries.filter(e => e.criterionId === criterionId);
  }

  forRun(runId: string): AcceptanceEvidence[] {
    // runId stored as value when kind=SNAPSHOT
    return this._entries.filter(e => e.value === runId || (typeof e.value === "object" && (e.value as any)?.runId === runId));
  }

  all(): AcceptanceEvidence[] { return [...this._entries]; }
  count(): number { return this._entries.length; }
}