import { resourceResolutionAuditStore } from "@/lib/resource-resolution-engine";

export interface ResolutionMetricsView {
  readonly totalResolutions: number;
  readonly successRate: number;
  readonly fallbackRate: number;
  readonly averageAttempts: number;
  readonly connectorBreakdown: Readonly<Record<string, {
    readonly total: number;
    readonly successes: number;
    readonly fallbacks: number;
    readonly averageAttempts: number;
    readonly averageDurationMs: number;
  }>>;
  readonly strategyDistribution: Readonly<Record<string, number>>;
}

export function getResolutionMetricsView(): ResolutionMetricsView {
  const metrics = resourceResolutionAuditStore.getMetrics();
  return Object.freeze({
    totalResolutions: metrics.totalResolutions,
    successRate: metrics.successRate,
    fallbackRate: metrics.fallbackRate,
    averageAttempts: metrics.averageAttempts,
    connectorBreakdown: metrics.connectorBreakdown,
    strategyDistribution: metrics.winnerStrategy,
  });
}
