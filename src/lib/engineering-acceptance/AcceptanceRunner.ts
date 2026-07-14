/**
 * AcceptanceRunner.ts — Sprint 6.3.2
 * Executes the full acceptance pipeline for a sprint
 */

import type { AcceptanceRunResult, AcceptanceAssertionResult } from "./EAFTypes";
import { executeScenario } from "./AcceptanceScenario";
import { AcceptanceValidator } from "./AcceptanceValidator";
import { AcceptanceReporter } from "./AcceptanceReporter";
import { AcceptanceHistory } from "./AcceptanceHistory";
import { AcceptanceMetrics } from "./AcceptanceMetrics";
import { AcceptanceAudit } from "./AcceptanceAudit";
import type { AcceptanceRegistry } from "./AcceptanceRegistry";

let _seq = 0;
function makeRunId(): string { return `run_${Date.now()}_${++_seq}`; }
function makeReportId(): string { return `rpt_${Date.now()}_${++_seq}`; }

// ── Pipeline stage order ──────────────────────────────────────────────────────
const PIPELINE_ORDER = [
  "REGRESSION_SHIELD", "SMOKE", "ACCEPTANCE",
  "GOVERNANCE", "ARCHITECTURE", "MEMORY", "RUNTIME", "CONNECTOR",
] as const;

export class AcceptanceRunner {
  private _validator = new AcceptanceValidator();
  private _reporter  = new AcceptanceReporter();
  public  history    = new AcceptanceHistory();
  public  metrics    = new AcceptanceMetrics();
  public  audit      = new AcceptanceAudit();

  onProgress?: (stage: string, done: number, total: number) => void;

  async run(sprintId: string, registry: AcceptanceRegistry): Promise<AcceptanceRunResult> {
    const runId = makeRunId();
    const startedAt = Date.now();

    const reg = registry.get(sprintId);
    if (!reg) {
      throw new Error(`Sprint "${sprintId}" not registered in AcceptanceRegistry.`);
    }

    this.audit.record(sprintId, runId, "AcceptanceRunner", "RUN_STARTED", "RUNNING", "Pipeline started");

    const scenarios = registry.scenarios(sprintId);
    const assertions: AcceptanceAssertionResult[] = [];
    const ctx = { sprintId, runId };

    // Execute scenarios in pipeline-stage order
    let done = 0;
    const total = scenarios.length;

    for (const stage of PIPELINE_ORDER) {
      const stageScenarios = scenarios.filter(s => s.criterion.category === stage);
      for (const scenario of stageScenarios) {
        this.onProgress?.(stage, done, total);
        const result = await executeScenario(scenario, ctx);
        assertions.push(result);
        done++;
        this.onProgress?.(stage, done, total);
      }
    }

    // Remaining scenarios not matched by pipeline order
    const handled = new Set(assertions.map(a => a.criterionId));
    for (const scenario of scenarios) {
      if (!handled.has(scenario.criterion.id)) {
        const result = await executeScenario(scenario, ctx);
        assertions.push(result);
        done++;
        this.onProgress?.(scenario.criterion.category, done, total);
      }
    }

    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;

    const validation = this._validator.validate(assertions, reg.criteria);

    const passed  = assertions.filter(a => a.status === "PASS").length;
    const failed  = assertions.filter(a => a.status === "FAIL").length;
    const skipped = assertions.filter(a => a.status === "SKIP").length;
    const blocked = assertions.filter(a => a.status === "BLOCKED").length;
    const totalA  = assertions.length;

    const runResult: AcceptanceRunResult = {
      id: runId,
      sprintId,
      startedAt,
      completedAt,
      durationMs,
      status: validation.ready ? "PASS" : "FAIL",
      assertions,
      passed,
      failed,
      skipped,
      blocked,
      total: totalA,
      score: validation.score,
      ready: validation.ready,
      confidence: validation.confidence,
      blockers: validation.blockers,
      reportId: makeReportId(),
    };

    const report = this._reporter.generate(runResult);

    this.history.addRun(runResult);
    this.history.addReport(report);
    this.metrics.recordRun(durationMs, validation.score, validation.confidence, validation.ready);

    const finalStatus = validation.ready ? "PASS" : "FAIL";
    this.audit.record(sprintId, runId, "AcceptanceRunner", "RUN_COMPLETED", finalStatus,
      validation.ready ? "All mandatory criteria passed" : `${failed} failure(s) detected`);

    return runResult;
  }
}