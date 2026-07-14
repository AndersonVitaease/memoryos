/**
 * ApprovalMemory.ts — Sprint 6.2.4
 */
import type { ApprovalMemoryEntry } from "./MEMTypes";
import { makeMemId } from "./MEMTypes";

export class ApprovalMemory {
  private readonly _entries: ApprovalMemoryEntry[] = [];

  record(input: {
    proposalId: string; objective: string;
    approved: boolean; reason: string; approver: string;
    kgEntityIds?: string[];
  }): ApprovalMemoryEntry {
    const entry: ApprovalMemoryEntry = {
      id: makeMemId("appr"), kind: "APPROVAL", status: "ACTIVE",
      tags: [input.approved ? "APPROVED" : "REJECTED", input.approver],
      kgEntityIds: input.kgEntityIds ?? [],
      createdAt: Date.now(), rank: 70, useCount: 0, confidence: 0.9,
      ...input,
    };
    this._entries.push(entry);
    return entry;
  }

  all(): ApprovalMemoryEntry[] { return [...this._entries]; }
  approved(): ApprovalMemoryEntry[] { return this._entries.filter(e => e.approved); }
  rejected(): ApprovalMemoryEntry[] { return this._entries.filter(e => !e.approved); }
}