/**
 * EngineeringTimeline.ts — Sprint 6.2.1
 * Permanent, searchable engineering history. One entry per sprint/execution.
 */

import type { TimelineEntry, ImplementationStrategy, RepairStatus } from "./EITypes";

let _seq = 0;
function makeTlId(): string { return `tl_${Date.now()}_${++_seq}`; }

export class EngineeringTimeline {
  private readonly _entries: TimelineEntry[] = [];

  record(entry: Omit<TimelineEntry, "id">): TimelineEntry {
    const full: TimelineEntry = { id: makeTlId(), ...entry };
    this._entries.unshift(full); // newest first
    return full;
  }

  search(keyword: string): TimelineEntry[] {
    const kw = keyword.toLowerCase();
    return this._entries.filter(e =>
      e.objective.toLowerCase().includes(kw) ||
      e.sprint.toLowerCase().includes(kw) ||
      e.strategy.toLowerCase().includes(kw) ||
      e.outcome.toLowerCase().includes(kw)
    );
  }

  all(): TimelineEntry[] { return [...this._entries]; }

  stats() {
    const total   = this._entries.length;
    const passed  = this._entries.filter(e => e.outcome === "PASS").length;
    const failed  = this._entries.filter(e => e.outcome === "FAIL").length;
    const pending = this._entries.filter(e => e.outcome === "PENDING").length;
    return { total, passed, failed, pending, successRate: total > 0 ? Math.round((passed / total) * 100) : 0 };
  }
}