/**
 * OptimizationReport.ts — Sprint EF-53
 *
 * SRP: montar o OptimizationReport final.
 */

import type { OptimizationReport as IOptimizationReport, OptimizationFinding, OptimizationRecommendation, OptimizationMetrics } from "./SOTypes";
import { makeSOId } from "./SOTypes";

export class OptimizationReportBuilder {
  build(opts: {
    startedAt:       number;
    findings:        readonly OptimizationFinding[];
    recommendations: readonly OptimizationRecommendation[];
    metrics:         OptimizationMetrics;
  }): IOptimizationReport {
    const { startedAt, findings, recommendations, metrics } = opts;

    const top = [...recommendations]
      .sort((a, b) => b.expectedImpact * b.confidence - a.expectedImpact * a.confidence)
      .slice(0, 5);

    const criticalCount = findings.filter(f => f.severity === "critical").length;
    const highCount     = findings.filter(f => f.severity === "high").length;

    const summary = [
      `EF-53 Self Optimization — ${findings.length} findings, ${recommendations.length} recommendations`,
      criticalCount > 0 ? `${criticalCount} CRITICAL` : null,
      highCount > 0     ? `${highCount} HIGH` : null,
      `avg_impact=${(metrics.avgImprovementScore * 100).toFixed(0)}%`,
    ].filter(Boolean).join(" · ");

    return Object.freeze({
      id:              makeSOId("report"),
      generatedAt:     Date.now(),
      durationMs:      Date.now() - startedAt,
      findings,
      recommendations,
      metrics,
      summary,
      topImprovements: Object.freeze(top),
    });
  }
}