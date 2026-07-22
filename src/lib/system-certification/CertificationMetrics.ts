/**
 * CertificationMetrics.ts — Sprint EF-55.1
 *
 * SRP: compute CertificationMetrics from all AuditResults including Golden Scenarios.
 */

import type { AuditResult, CertificationMetrics } from "./SCTypes";

// NC-03 remediation: threshold raised from 80 to 95 per prompt requirement (confidence >= 95%)
const CERTIFICATION_THRESHOLD = 95;

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
    // NC-05 remediation: typo deterministmScore → deterministicScore (field kept for backward compat, aliased below)
    const deterministicScore = byAuditor("DeterminismAuditor");
    const deterministmScore  = deterministicScore; // alias — both names present for transition period

    const scores = [
      goldenScore, architectureScore, pipelineHealth, contractHealth,
      performanceScore, dependencyScore, explainabilityScore,
      observabilityScore, isolationScore, deterministicScore,
    ];

    const overallCertificationScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const certified = overallCertificationScore >= CERTIFICATION_THRESHOLD && scores.every(s => s >= 50);

    return Object.freeze({
      architectureScore, pipelineHealth, contractHealth, performanceScore,
      dependencyScore, explainabilityScore, observabilityScore, isolationScore,
      regressionScore, stressScore,
      deterministmScore,       // backward compat alias
      deterministicScore,      // NC-05 corrected field name
      overallCertificationScore,
      certified,
    });
  }
}