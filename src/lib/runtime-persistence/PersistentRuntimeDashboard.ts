/**
 * PersistentRuntimeDashboard.ts — Sprint 6.3.4
 * Dashboard state aggregator — read-only snapshot for UI rendering.
 */

import { RuntimePersistence } from "./RuntimePersistence";
import { RuntimeBootstrap }   from "./RuntimeBootstrap";

export interface DashboardSnapshot {
  phase:           string;
  booted:          boolean;
  booting:         boolean;
  sessionCount:    number;
  connectedCount:  number;
  expiredCount:    number;
  errorCount:      number;
  auditCount:      number;
  bootstrapCount:  number;
  successRate:     number;
  lastBootMs:      number | null;
  sessions:        ReturnType<typeof RuntimePersistence.sessions.all>;
  recentAudit:     ReturnType<typeof RuntimePersistence.audit.recent>;
  lastReport:      ReturnType<typeof RuntimePersistence.history.last>;
  reconnectHistory: ReturnType<typeof RuntimePersistence.sessions.reconnect.history>;
}

export function getDashboardSnapshot(): DashboardSnapshot {
  const sessions   = RuntimePersistence.sessions.all();
  const lastReport = RuntimePersistence.history.last();

  return {
    phase:           RuntimeBootstrap.phase,
    booted:          RuntimeBootstrap.booted,
    booting:         RuntimeBootstrap.booting,
    sessionCount:    sessions.length,
    connectedCount:  sessions.filter(s => s.status === "CONNECTED").length,
    expiredCount:    sessions.filter(s => s.status === "SESSION_EXPIRED").length,
    errorCount:      sessions.filter(s => s.status === "ERROR").length,
    auditCount:      RuntimePersistence.audit.count(),
    bootstrapCount:  RuntimePersistence.history.count(),
    successRate:     RuntimePersistence.history.successRate(),
    lastBootMs:      lastReport?.durationMs ?? null,
    sessions,
    recentAudit:     RuntimePersistence.audit.recent(20),
    lastReport,
    reconnectHistory: RuntimePersistence.sessions.reconnect.history(),
  };
}