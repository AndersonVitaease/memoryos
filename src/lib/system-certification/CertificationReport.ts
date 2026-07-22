/**
 * CertificationReport.ts — Sprint EF-55
 *
 * SRP: assemble the final CertificationReport.
 */

import type { CertificationReport as ICertificationReport, AuditResult, PipelineTrace, CertificationMetrics } from "./SCTypes";
import { makeSCId } from "./SCTypes";

export class CertificationReportBuilder {
  build(opts: {
    startedAt:     number;
    auditResults:  readonly AuditResult[];
    pipelineTrace: PipelineTrace;
    metrics:       CertificationMetrics;
  }): ICertificationReport {
    const { startedAt, auditResults, pipelineTrace, metrics } = opts;

    const failures  = auditResults.filter(r => r.status === "fail").map(r => `${r.auditor}: ${r.summary}`);
    const warnings  = auditResults.filter(r => r.status === "warn").map(r => `${r.auditor}: ${r.summary}`);

    const summary = [
      `EF-55 Certification — score=${metrics.overallCertificationScore.toFixed(1)}/100`,
      metrics.certified ? "CERTIFIED" : "NOT CERTIFIED",
      `${auditResults.length} auditors · ${failures.length} failed · ${warnings.length} warned`,
    ].join(" · ");

    return Object.freeze({
      id:            makeSCId("cert"),
      generatedAt:   Date.now(),
      durationMs:    Date.now() - startedAt,
      auditResults,
      pipelineTrace,
      metrics,
      summary,
      certified:     metrics.certified,
      failures:      Object.freeze(failures),
      warnings:      Object.freeze(warnings),
    });
  }
}