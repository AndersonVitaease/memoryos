/**
 * CertificationMetrics.ts — Sprint EF-55.1
 *
 * SRP: compute CertificationMetrics from all AuditResults including Golden Scenarios.
 */

import type { AuditResult, CertificationMetrics } from "./SCTypes";

const CERTIFICATION_THRESHOLD = 80;

export class CertificationMetricsEngine {
  compute(results: readonly AuditResult[]): CertificationMetrics {
    const byAuditor = (name: string) => results.find(r => r.auditor === name)?.score ?? 0;

    const goldenScore        = byAuditor("GoldenScenarioAuditor");
    const architectureScore  = Math.round((byAuditor("ArchitecturalComplianceAuditor") + goldenScore) / 2);
    const pipelineHealth     = byAuditor("PipelineAuditor");
    const contractHealth     = byAuditor("ContractAuditor");
    const performanceScore   = byAuditor("PerformanceAuditor");
    const dependencyScore    = byAuditor("DependencyAuditor");
    const explainabilityScore= byAuditor("ExplainabilityAuditor");
    const observabilityScore = byAuditor("ObservabilityAuditor");
    const isolationScore     = byAuditor("IsolationAuditor");
    const regressionScore    = byAuditor("ArchitecturalComplianceAuditor");
    const stressScore        = performanceScore;
    const deterministmScore  = byAuditor("DeterminismAuditor");

    const scores = [
      goldenScore, architectureScore, pipelineHealth, contractHealth,
      performanceScore, dependencyScore, explainabilityScore,
      observabilityScore, isolationScore, deterministmScore,
    ];

    const overallCertificationScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const certified = overallCertificationScore >= CERTIFICATION_THRESHOLD && scores.every(s => s >= 50);

    return Object.freeze({
      architectureScore, pipelineHealth, contractHealth, performanceScore,
      dependencyScore, explainabilityScore, observabilityScore, isolationScore,
      regressionScore, stressScore, deterministmScore,
      overallCertificationScore,
      certified,
    });
  }
}