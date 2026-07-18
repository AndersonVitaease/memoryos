// CertificationReportBuilder.ts — Sprint EF-39.6
// Receives raw auditor results, produces a single deeply-immutable report.
// The dashboard only renders — it never computes.

import { ArchitectureScoreEngine, type ArchitectureScore } from "./ArchitectureScoreEngine";
import { evaluateRules, type CertificationEvidence } from "./CertificationRules";
import type { FullAuditReport } from "../auditor/ArchitecturalAuditor";
import type { SourceAuditReport } from "../auditor/SourceAudit";
import type { ASTAuditReport } from "../auditor/ASTAuditor";
import type { StructuralAuditReport } from "../auditor/SourceAuditStructural";
import type { TestReport } from "../memory/MemoryStoreTests";

export interface CertificationReport {
  // Raw auditor outputs (for tab rendering)
  readonly testResult:       TestReport;
  readonly auditReport:      FullAuditReport;
  readonly structuralReport: StructuralAuditReport;
  readonly sourceReport:     SourceAuditReport;
  readonly astReport:        ASTAuditReport;

  // Computed once, here
  readonly archScore:        ArchitectureScore;
  readonly certified:        boolean;
  readonly failedGates:      readonly string[];

  // Derived display helpers
  readonly suiteMap:         Readonly<Record<string, readonly TestResult[]>>;
  readonly failures:         readonly TestResult[];
  readonly avgMs:            number;
  readonly maxMs:            number;
  readonly minMs:            number;
  readonly maxTest:          TestResult | undefined;
  readonly minTest:          TestResult | undefined;
  readonly totalMs:          number;
  readonly executedAt:       string;
}

export interface TestResult {
  readonly id:         string;
  readonly suite:      string;
  readonly name:       string;
  readonly passed:     boolean;
  readonly durationMs: number;
  readonly error?:     string;
}

export const CertificationReportBuilder = Object.freeze({
  build(params: {
    testResult:       TestReport;
    auditReport:      FullAuditReport;
    structuralReport: StructuralAuditReport;
    sourceReport:     SourceAuditReport;
    astReport:        ASTAuditReport;
    totalMs:          number;
  }): CertificationReport {
    const { testResult, auditReport, structuralReport, sourceReport, astReport, totalMs } = params;

    const { solid, immutability, integrity, performance } = auditReport;

    const avgBenchmarkMs = performance.benchmarks.length > 0
      ? performance.benchmarks.reduce((a, b) => a + b.avgMs, 0) / performance.benchmarks.length
      : 0;

    const evidence: CertificationEvidence = Object.freeze({
      testsPassed:        testResult.passed,
      testsTotal:         testResult.total,
      integrityPassed:    integrity.passed,
      integrityTotal:     integrity.passed + integrity.failed,
      immutabilityPassed: immutability.passed,
      immutabilityTotal:  immutability.passed + immutability.failed,
      solidPassed:        solid.checks.filter(c => c.verdict === "PASS").length,
      solidTotal:         solid.checks.length,
      structuralPassed:   structuralReport.passed,
      structuralTotal:    structuralReport.passed + structuralReport.failed,
      sourceCritical:     sourceReport.critical,
      sourceErrors:       sourceReport.errors,
      hasCircularDeps:    astReport.dependencies.hasCircular,
      architectureScore:  0, // computed below, placeholder
      codeSmellCount:     astReport.codeSmells.length,
      avgBenchmarkMs,
    });

    const archScore = ArchitectureScoreEngine.compute({
      testsPassed:        evidence.testsPassed,
      testsTotal:         evidence.testsTotal,
      solidPassed:        evidence.solidPassed,
      solidTotal:         evidence.solidTotal,
      immutabilityPassed: evidence.immutabilityPassed,
      immutabilityTotal:  evidence.immutabilityTotal,
      integrityPassed:    evidence.integrityPassed,
      integrityTotal:     evidence.integrityTotal,
      codeSmellCount:     evidence.codeSmellCount,
      sourceFindings:     evidence.sourceCritical + evidence.sourceErrors,
      avgBenchmarkMs:     evidence.avgBenchmarkMs,
      hasCircularDeps:    evidence.hasCircularDeps,
    });

    const { certified, failedGates } = evaluateRules({
      ...evidence,
      architectureScore: archScore.score,
    });

    // Suite map
    const suiteMap: Record<string, TestResult[]> = {};
    const allResults: TestResult[] = (testResult.results ?? []).map(r => Object.freeze({
      id: r.id ?? r.name,
      suite: r.suite,
      name: r.name,
      passed: r.passed,
      durationMs: r.durationMs,
      error: r.error,
    }));
    for (const r of allResults) {
      if (!suiteMap[r.suite]) suiteMap[r.suite] = [];
      suiteMap[r.suite].push(r);
    }

    const durations = allResults.map(r => r.durationMs);
    const avgMs = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const maxMs = durations.length > 0 ? Math.max(...durations) : 0;
    const minMs = durations.length > 0 ? Math.min(...durations) : 0;

    return Object.freeze({
      testResult,
      auditReport,
      structuralReport,
      sourceReport,
      astReport,
      archScore,
      certified,
      failedGates,
      suiteMap: Object.freeze(
        Object.fromEntries(
          Object.entries(suiteMap).map(([k, v]) => [k, Object.freeze(v)])
        )
      ),
      failures:    Object.freeze(allResults.filter(r => !r.passed)),
      avgMs,
      maxMs,
      minMs,
      maxTest:     allResults.find(r => r.durationMs === maxMs),
      minTest:     allResults.find(r => r.durationMs === minMs),
      totalMs,
      executedAt:  new Date().toISOString(),
    });
  },
});