/**
 * AcceptanceDashboard.ts — Sprint 6.3.2
 * Provides a unified view of all EAF state for the dashboard UI
 */

import type { AcceptanceRunResult, AcceptanceReport, AcceptanceMetricSnapshot } from "./EAFTypes";
import type { SprintRegistration } from "./EAFTypes";
import type { AcceptanceHistory } from "./AcceptanceHistory";
import type { AcceptanceMetrics } from "./AcceptanceMetrics";
import type { AcceptanceAudit } from "./AcceptanceAudit";

export interface DashboardState {
  registeredSprints: SprintRegistration[];
  queue: string[];         // sprint IDs pending run
  running: string | null;  // sprint ID currently running
  lastRuns: AcceptanceRunResult[];
  reports: AcceptanceReport[];
  metrics: AcceptanceMetricSnapshot;
  auditCount: number;
  evidenceCount: number;
}

export class AcceptanceDashboard {
  buildState(
    sprints: SprintRegistration[],
    queue: string[],
    running: string | null,
    history: AcceptanceHistory,
    metrics: AcceptanceMetrics,
    audit: AcceptanceAudit,
    evidenceCount: number
  ): DashboardState {
    return {
      registeredSprints: sprints,
      queue,
      running,
      lastRuns: sprints.map(s => history.latestRun(s.sprintId)).filter(Boolean) as AcceptanceRunResult[],
      reports: history.allReports(),
      metrics: metrics.snapshot(),
      auditCount: audit.count(),
      evidenceCount,
    };
  }
}