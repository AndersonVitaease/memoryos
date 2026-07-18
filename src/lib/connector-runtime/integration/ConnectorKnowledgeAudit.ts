/**
 * ConnectorKnowledgeAudit.ts
 * Append-only audit log for connector knowledge pipeline runs.
 *
 * SRP: Audit only.
 * Sprint: INTEGRATION-04
 */

import type { ExecutionResult } from "./ConnectorExecutionReport";

export interface ConnectorKnowledgeAuditEntry {
  readonly id:               string;   // CKA-NNN
  readonly requestId:        string;
  readonly connector:        string;
  readonly operation:        string;
  readonly timestamp:        string;
  readonly knowledgeUsed:    string[];
  readonly knowledgeDiscarded: number;
  readonly governanceUsed:   string[];
  readonly risksFound:       number;
  readonly blockers:         number;
  readonly constraintsTotal: number;
  readonly confidence:       number;
  readonly retryStrategy:    string;
  readonly fallbackStrategy: string;
  readonly result:           ExecutionResult;
  readonly durationMs:       number;
}

let _counter = 0;
const _entries: ConnectorKnowledgeAuditEntry[] = [];

export const ConnectorKnowledgeAudit = Object.freeze({

  log(e: Omit<ConnectorKnowledgeAuditEntry, "id">): ConnectorKnowledgeAuditEntry {
    _counter++;
    const full = Object.freeze({ ...e, id: `CKA-${String(_counter).padStart(3, "0")}` });
    _entries.push(full);
    return full;
  },

  getAll(): ConnectorKnowledgeAuditEntry[] {
    return [..._entries].reverse();
  },

  getTimeline() {
    return [..._entries].reverse().map(e => ({
      id:         e.id,
      requestId:  e.requestId,
      connector:  e.connector,
      operation:  e.operation,
      result:     e.result,
      confidence: e.confidence,
      risks:      e.risksFound,
      durationMs: e.durationMs,
      timestamp:  e.timestamp,
    }));
  },

  reset(): void { _entries.length = 0; _counter = 0; },
});