// IngestionAuditEngine.ts — Sprint EF-37
// Immutable audit log for every ingestion run

import type { SourceType } from "./KipTypes";

export interface IngestionAuditEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly sourceType: SourceType;
  readonly conversationId: string;
  readonly messageCount: number;
  readonly entitiesExtracted: number;
  readonly decisionsExtracted: number;
  readonly conflictsDetected: number;
  readonly duplicatesSkipped: number;
  readonly memoriesGenerated: number;
  readonly graphNodes: number;
  readonly graphEdges: number;
  readonly durationMs: number;
  readonly status: "success" | "error";
  readonly error?: string;
}

const _log: IngestionAuditEntry[] = [];
let _seq = 0;

export const IngestionAuditEngine = {
  record(params: Omit<IngestionAuditEntry, "id" | "timestamp">): IngestionAuditEntry {
    const entry = Object.freeze({
      id:        `KIP-AUD-${Date.now()}-${++_seq}`,
      timestamp: Date.now(),
      ...params,
    });
    _log.unshift(entry);
    if (_log.length > 500) _log.splice(500);
    return entry;
  },

  getAll():         IngestionAuditEntry[] { return [..._log]; },
  getRecent(n = 20): IngestionAuditEntry[] { return _log.slice(0, n); },
  getBySource(s: SourceType): IngestionAuditEntry[] { return _log.filter(e => e.sourceType === s); },

  stats() {
    const total           = _log.length;
    const totalMessages   = _log.reduce((s, e) => s + e.messageCount, 0);
    const totalMemories   = _log.reduce((s, e) => s + e.memoriesGenerated, 0);
    const totalEntities   = _log.reduce((s, e) => s + e.entitiesExtracted, 0);
    const totalDecisions  = _log.reduce((s, e) => s + e.decisionsExtracted, 0);
    const totalConflicts  = _log.reduce((s, e) => s + e.conflictsDetected, 0);
    const totalDuplicates = _log.reduce((s, e) => s + e.duplicatesSkipped, 0);
    const avgDuration     = total > 0 ? Math.round(_log.reduce((s, e) => s + e.durationMs, 0) / total) : 0;
    return { total, totalMessages, totalMemories, totalEntities, totalDecisions, totalConflicts, totalDuplicates, avgDuration };
  },

  clear() { _log.length = 0; },
};