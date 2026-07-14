/**
 * ArchitectureAudit.ts — Sprint 6.2.3
 * Immutable audit trail. Nothing can be deleted.
 */

import type { ArchitectureAuditEntry, ArchitectureProposal, AAApprovalStatus, BreakingChangeLevel } from "./AATypes";

let _seq = 0;
function makeId(): string { return `aa_audit_${Date.now()}_${++_seq}`; }

export class ArchitectureAudit {
  private readonly _entries: ArchitectureAuditEntry[] = [];

  record(
    proposal: ArchitectureProposal,
    approval: AAApprovalStatus,
    approver: string,
    rollbackAvailable: boolean,
    migrationAvailable: boolean,
  ): ArchitectureAuditEntry {
    const entry = Object.freeze({
      id:                  makeId(),
      timestamp:           Date.now(),
      proposalId:          proposal.id,
      objective:           proposal.objective,
      decision:            `${proposal.estimatedComplexity} — ${proposal.breakingChanges.length} breaking changes`,
      approval,
      breakingLevel:       proposal.estimatedComplexity as BreakingChangeLevel,
      rollbackAvailable,
      migrationAvailable,
      affectedComponents:  [...proposal.affectedComponents],
      riskSummary:         `Core: ${proposal.coreComponentsHit.length}, Breaking: ${proposal.breakingChanges.filter(c => c.autoBlocked).length} blocked`,
      engineer:            "MemoryOS" as const,
      approver,
    });
    this._entries.push(entry);
    return entry;
  }

  all(): readonly ArchitectureAuditEntry[]   { return this._entries; }
  latest(): ArchitectureAuditEntry | null    { return this._entries[this._entries.length - 1] ?? null; }
  find(id: string): ArchitectureAuditEntry | undefined { return this._entries.find(e => e.id === id); }

  stats() {
    const total    = this._entries.length;
    const approved = this._entries.filter(e => e.approval === "APPROVED" || e.approval === "AUTO_APPROVED").length;
    const blocked  = this._entries.filter(e => e.approval === "BLOCKED").length;
    const pending  = this._entries.filter(e => e.approval === "PENDING").length;
    return { total, approved, blocked, pending };
  }
}