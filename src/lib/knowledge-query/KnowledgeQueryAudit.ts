/**
 * KnowledgeQueryAudit.ts
 * Append-only audit log for all knowledge query executions.
 *
 * SRP: Audit only.
 * Sprint: INTEGRATION-02
 */

import type { KnowledgeAuditEntry } from "./KnowledgeQueryTypes";

let _counter = 0;
const _entries: KnowledgeAuditEntry[] = [];

export const KnowledgeQueryAudit = Object.freeze({

  log(entry: Omit<KnowledgeAuditEntry, "id">): KnowledgeAuditEntry {
    _counter++;
    const full = { ...entry, id: `KQA-${String(_counter).padStart(3, "0")}` };
    _entries.push(full);
    return full;
  },

  getAll(): KnowledgeAuditEntry[] {
    return [..._entries].reverse();
  },

  getTimeline(): Array<{ id: string; queryId: string; intent: string; kept: number; discarded: number; cacheHit: boolean; durationMs: number; timestamp: string }> {
    return [..._entries].reverse().map(e => ({
      id:         e.id,
      queryId:    e.queryId,
      intent:     e.intent,
      kept:       e.kept,
      discarded:  e.discarded,
      cacheHit:   e.cacheHit,
      durationMs: e.durationMs,
      timestamp:  e.timestamp,
    }));
  },

  reset(): void { _entries.length = 0; _counter = 0; },
});