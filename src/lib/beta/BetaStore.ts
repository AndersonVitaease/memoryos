/**
 * BetaStore.ts — Sprint Beta-01
 *
 * Module-level in-memory store for Beta production sessions and metrics.
 * Architecture is frozen — this layer only records execution output from
 * the official ExecutionChain / ValidationFramework.
 */

export type ConnectorId = "gmail" | "google_calendar" | "google_drive" | "whatsapp_business";

export interface BetaConnectorRecord {
  connectorId:   ConnectorId;
  capability:    string;
  startedAt:     number;
  durationMs:    number;
  success:       boolean;
  retries:       number;
  error:         string | null;
}

export interface BetaSession {
  readonly sessionId:     string;
  readonly startedAt:     number;
  readonly completedAt:   number;
  readonly durationMs:    number;
  readonly success:       boolean;
  readonly stagesPassed:  number;
  readonly stagesTotal:   number;
  readonly confidence:    number;
  readonly connectors:    readonly BetaConnectorRecord[];
  readonly hasReport:     boolean;
  readonly hasSnapshot:   boolean;
  readonly hasAudit:      boolean;
  readonly hasExplain:    boolean;
  readonly error:         string | null;
  readonly scenarioId:    string;
  readonly scenarioName:  string;
  readonly category:      string;
}

interface _Mutable {
  sessionId:    string;
  startedAt:    number;
  completedAt:  number;
  durationMs:   number;
  success:      boolean;
  stagesPassed: number;
  stagesTotal:  number;
  confidence:   number;
  connectors:   BetaConnectorRecord[];
  hasReport:    boolean;
  hasSnapshot:  boolean;
  hasAudit:     boolean;
  hasExplain:   boolean;
  error:        string | null;
  scenarioId:   string;
  scenarioName: string;
  category:     string;
}

const _sessions: BetaSession[] = [];

export const BetaStore = {
  record(s: _Mutable): void {
    _sessions.push(Object.freeze({ ...s, connectors: Object.freeze([...s.connectors]) }) as BetaSession);
  },

  all(): readonly BetaSession[] {
    return Object.freeze([..._sessions]);
  },

  clear(): void {
    _sessions.length = 0;
  },

  size(): number {
    return _sessions.length;
  },

  metrics() {
    if (_sessions.length === 0) return null;
    const total       = _sessions.length;
    const passed      = _sessions.filter(s => s.success).length;
    const failed      = total - passed;
    const avgDuration = _sessions.reduce((a, s) => a + s.durationMs, 0) / total;
    const avgConf     = _sessions.reduce((a, s) => a + s.confidence, 0) / total;
    const successRate = passed / total;

    // Per-connector aggregation
    const connMap = new Map<string, { calls: number; ok: number; ms: number; retries: number }>();
    for (const s of _sessions) {
      for (const c of s.connectors) {
        const e = connMap.get(c.connectorId) ?? { calls: 0, ok: 0, ms: 0, retries: 0 };
        connMap.set(c.connectorId, {
          calls:   e.calls + 1,
          ok:      e.ok + (c.success ? 1 : 0),
          ms:      e.ms + c.durationMs,
          retries: e.retries + c.retries,
        });
      }
    }
    const connectorUsage = [...connMap.entries()].map(([id, v]) => ({
      connectorId:  id,
      calls:        v.calls,
      successRate:  v.calls > 0 ? v.ok / v.calls : 0,
      avgMs:        v.calls > 0 ? +(v.ms / v.calls).toFixed(1) : 0,
      totalRetries: v.retries,
    }));

    // Coverage flags
    const reportCoverage   = _sessions.filter(s => s.hasReport).length   / total;
    const snapshotCoverage = _sessions.filter(s => s.hasSnapshot).length / total;
    const auditCoverage    = _sessions.filter(s => s.hasAudit).length    / total;
    const explainCoverage  = _sessions.filter(s => s.hasExplain).length  / total;

    return {
      total, passed, failed, successRate,
      avgDurationMs:     +avgDuration.toFixed(1),
      avgConfidence:     +avgConf.toFixed(4),
      reportCoverage:    +reportCoverage.toFixed(4),
      snapshotCoverage:  +snapshotCoverage.toFixed(4),
      auditCoverage:     +auditCoverage.toFixed(4),
      explainCoverage:   +explainCoverage.toFixed(4),
      connectorUsage,
    };
  },
};