/**
 * ExecutionDashboard.ts — Sprint 6.3.3
 * Aggregated view for the dashboard UI
 */

import type { AELMetricSnapshot, AELReport } from "./AELTypes";
import type { ExecutionContextData } from "./ExecutionContext";

export interface AELDashboardState {
  activeExecution: ExecutionContextData | null;
  recentContexts:  ExecutionContextData[];
  recentReports:   AELReport[];
  metrics:         AELMetricSnapshot;
  timelineCount:   number;
  evidenceCount:   number;
  auditCount:      number;
}

export class ExecutionDashboard {
  build(
    active: ExecutionContextData | null,
    contexts: ExecutionContextData[],
    reports: AELReport[],
    metrics: AELMetricSnapshot,
    timelineCount: number,
    evidenceCount: number,
    auditCount: number
  ): AELDashboardState {
    return {
      activeExecution: active,
      recentContexts: [...contexts].reverse().slice(0, 10),
      recentReports:  [...reports].reverse().slice(0, 10),
      metrics,
      timelineCount,
      evidenceCount,
      auditCount,
    };
  }
}