/**
 * AcceptanceReporter.ts — Sprint 6.3.2
 * Generates AcceptanceReport from a run result
 */

import type { AcceptanceReport, AcceptanceRunResult } from "./EAFTypes";

let _seq = 0;
function makeReportId(): string { return `rpt_${Date.now()}_${++_seq}`; }

export class AcceptanceReporter {
  generate(run: AcceptanceRunResult): AcceptanceReport {
    const id = makeReportId();
    const evidenceCount = run.assertions.reduce((s, a) => s + a.evidence.length, 0);

    const summary = run.ready
      ? `Sprint ${run.sprintId} READY — ${run.passed}/${run.total} criteria passed · Score: ${run.score}% · Confidence: ${run.confidence}%`
      : `Sprint ${run.sprintId} NOT READY — ${run.failed} blocker(s) · Score: ${run.score}% · Confidence: ${run.confidence}%`;

    return {
      id,
      sprintId: run.sprintId,
      runId: run.id,
      generatedAt: Date.now(),
      summary,
      ready: run.ready,
      score: run.score,
      confidence: run.confidence,
      assertions: run.assertions,
      blockers: run.blockers,
      evidenceCount,
      totalDurationMs: run.durationMs,
    };
  }

  format(report: AcceptanceReport): string {
    const lines: string[] = [
      `=== ACCEPTANCE REPORT ===`,
      `Sprint:     ${report.sprintId}`,
      `Run ID:     ${report.runId}`,
      `Generated:  ${new Date(report.generatedAt).toISOString()}`,
      `Status:     ${report.ready ? "READY ✅" : "NOT READY ❌"}`,
      `Score:      ${report.score}%`,
      `Confidence: ${report.confidence}%`,
      `Duration:   ${report.totalDurationMs}ms`,
      `Evidence:   ${report.evidenceCount} items`,
      ``,
      `Summary: ${report.summary}`,
      ``,
      `--- CRITERIA ---`,
    ];
    for (const a of report.assertions) {
      lines.push(`[${a.status.padEnd(7)}] [${a.category.padEnd(20)}] ${a.description}`);
      if (a.rca) lines.push(`         RCA: ${a.rca}`);
    }
    if (report.blockers.length > 0) {
      lines.push(``, `--- BLOCKERS ---`);
      for (const b of report.blockers) lines.push(`  ❌ ${b}`);
    }
    return lines.join("\n");
  }
}