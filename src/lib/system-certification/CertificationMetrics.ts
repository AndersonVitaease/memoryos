/**
 * CertificationMetrics.ts — Sprint EF-55
 *
 * SRP: compute CertificationMetrics from all AuditResults.
 */

import type { AuditResult, CertificationMetrics } from "./SCTypes";

const CERTIFICATION_THRESHOLD = 80;

export class CertificationMetricsEngine {
  compute(results: readonly AuditResult[]): CertificationMetrics {
    const byAuditor = (name: string) => results.find(r => r.auditor === name)?.score ?? 0;

    const architectureScore   = byAuditor("ArchitecturalComplianceAuditor");
    const pipelineHealth      = byAuditor("PipelineAuditor");
    const contractHealth      = byAuditor("ContractAuditor");
    const performanceScore    = byAuditor("PerformanceAuditor");
    const dependencyScore     = byAuditor("DependencyAuditor");
    const explainabilityScore = byAuditor("ExplainabilityAuditor");
    const observabilityScore  = byAuditor("ObservabilityAuditor");
    const isolationScore      = byAuditor("IsolationAuditor");
    const regressionScore     = architectureScore;   // regression is part of arch audit
    const stressScore         = performanceScore;    // stress is part of perf audit
    const deterministmScore   = byAuditor("DeterminismAuditor");

    const scores = [architectureScore, pipelineHealth, contractHealth, performanceScore,
      dependencyScore, explainabilityScore, observabilityScore, isolationScore, deterministmScore];

    const overallCertificationScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const certified = overallCertificationScore >= CERTIFICATION_THRESHOLD &&
      scores.every(s => s >= 50);  // no auditor can score below 50

    return Object.freeze({
      architectureScore, pipelineHealth, contractHealth, performanceScore,
      dependencyScore, explainabilityScore, observabilityScore, isolationScore,
      regressionScore, stressScore, deterministmScore,
      overallCertificationScore,
      certified,
    });
  }
}