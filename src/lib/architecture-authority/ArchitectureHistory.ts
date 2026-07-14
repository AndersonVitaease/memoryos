/**
 * ArchitectureHistory.ts — Sprint 6.2.3
 * Permanent, append-only record of all architecture proposals and decisions.
 */

import type { ArchitectureProposal } from "./AATypes";

export interface HistoryEntry {
  readonly id:         string;
  readonly timestamp:  number;
  readonly proposalId: string;
  readonly objective:  string;
  readonly decision:   string;
  readonly outcome:    "APPROVED" | "REJECTED" | "BLOCKED" | "AUTO_APPROVED" | "PENDING";
  readonly coreHit:    readonly string[];
  readonly breakingCount: number;
}

let _seq = 0;
function makeId(): string { return `history_${Date.now()}_${++_seq}`; }

export class ArchitectureHistory {
  private readonly _entries: HistoryEntry[] = [];

  record(proposal: ArchitectureProposal, decision: string): HistoryEntry {
    const entry = Object.freeze({
      id:            makeId(),
      timestamp:     Date.now(),
      proposalId:    proposal.id,
      objective:     proposal.objective,
      decision,
      outcome:       (proposal.status === "APPROVED" ? "APPROVED"
                    : proposal.status === "REJECTED" ? "REJECTED"
                    : proposal.status === "BLOCKED"  ? "BLOCKED"
                    : proposal.status === "AUTO_APPROVED" ? "AUTO_APPROVED"
                    : "PENDING") as HistoryEntry["outcome"],
      coreHit:       [...proposal.coreComponentsHit],
      breakingCount: proposal.breakingChanges.length,
    });
    this._entries.push(entry);
    return entry;
  }

  all(): readonly HistoryEntry[]   { return this._entries; }
  latest(): HistoryEntry | null    { return this._entries[this._entries.length - 1] ?? null; }

  stats() {
    const total       = this._entries.length;
    const approved    = this._entries.filter(e => e.outcome === "APPROVED" || e.outcome === "AUTO_APPROVED").length;
    const blocked     = this._entries.filter(e => e.outcome === "BLOCKED").length;
    const rejected    = this._entries.filter(e => e.outcome === "REJECTED").length;
    const pending     = this._entries.filter(e => e.outcome === "PENDING").length;
    return { total, approved, blocked, rejected, pending };
  }
}