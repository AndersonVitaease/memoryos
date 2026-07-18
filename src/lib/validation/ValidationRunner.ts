/**
 * ValidationRunner.ts — Sprint P-02.0
 *
 * Loads a scenario, executes the full ExecutionChain,
 * produces ExecutionReport + ExecutionSnapshot, validates against expectations,
 * and returns a ValidationResult.
 */

import { ExecutionChain }              from "../execution-chain/ExecutionChain";
import { ExecutionSnapshotAssembler }  from "../execution-chain/ExecutionSnapshot";
import type { ValidationScenario, ValidationResult, ValidationMetrics, StageTiming } from "./ValidationTypes";
import type { ExecutionChainReport }   from "../execution-chain/ExecutionChainTypes";

export class ValidationRunner {
  private readonly _chain:    ExecutionChain;
  private readonly _snapAsm:  ExecutionSnapshotAssembler;

  constructor() {
    this._chain   = new ExecutionChain();
    this._snapAsm = new ExecutionSnapshotAssembler();
  }

  async run(scenario: ValidationScenario): Promise<ValidationResult> {
    const startedAt = Date.now();

    const report = await this._chain.execute({
      text:      scenario.input.text,
      sessionId: scenario.input.sessionId,
      userId:    scenario.input.userId,
      timestamp: startedAt,
    });

    const snapshot   = this._snapAsm.fromReport(report as ExecutionChainReport);
    const durationMs = Date.now() - startedAt;
    const failures   = this._validate(scenario, report as ExecutionChainReport, snapshot);
    const passed     = failures.length === 0;

    const metrics = this._collectMetrics(report as ExecutionChainReport, snapshot);

    return Object.freeze({
      scenarioId:   scenario.id,
      scenarioName: scenario.name,
      category:     scenario.category,
      status:       passed ? "PASSED" : (report.status === "COMPLETED" ? "FAILED" : "PARTIAL"),
      passed,
      failures:     Object.freeze(failures),
      metrics,
      executedAt:   startedAt,
      durationMs,
      report,
      snapshot,
    });
  }

  private _validate(
    scenario: ValidationScenario,
    report:   ExecutionChainReport,
    snapshot: ReturnType<ExecutionSnapshotAssembler["fromReport"]>,
  ): string[] {
    const { expect } = scenario;
    const failures: string[] = [];

    // Status check
    if (expect.status === "COMPLETED" && report.status === "FAILED") {
      failures.push(`Expected COMPLETED but got FAILED`);
    }

    // Stages passed
    if (report.stagesPassed < expect.minStagesPassed) {
      failures.push(`Expected >= ${expect.minStagesPassed} stages passed, got ${report.stagesPassed}`);
    }

    // Memory
    if (expect.requiresMemory && !report.memoryResult?.memorized) {
      failures.push(`Expected memory to be used (memorized=true)`);
    }

    // Connector
    if (expect.requiresConnector) {
      const orchStage = report.stages.find(s => s.stage === "RUNTIME_ORCHESTRATOR");
      const orch = orchStage?.output as { selectedConnector?: string } | undefined;
      if (orch?.selectedConnector !== expect.requiresConnector) {
        failures.push(`Expected connector "${expect.requiresConnector}", got "${orch?.selectedConnector ?? "none"}"`);
      }
    }

    // Confidence
    if (expect.minConfidence !== undefined) {
      const conf = report.finalOutput?.confidence ?? 0;
      if (conf < expect.minConfidence) {
        failures.push(`Expected confidence >= ${expect.minConfidence}, got ${conf}`);
      }
    }

    // Compliance
    if (expect.requiresCompliance) {
      if (report.auditResult?.complianceStatus !== expect.requiresCompliance) {
        failures.push(`Expected compliance "${expect.requiresCompliance}", got "${report.auditResult?.complianceStatus}"`);
      }
    }

    // Explainability
    if (expect.explainabilityRequired) {
      const expl = report.explainabilityResult;
      if (!expl || expl.stagesExecuted.length === 0) {
        failures.push(`Explainability result required but missing or empty`);
      }
    }

    return failures;
  }

  private _collectMetrics(
    report:   ExecutionChainReport,
    snapshot: ReturnType<ExecutionSnapshotAssembler["fromReport"]>,
  ): ValidationMetrics {
    const stageTimings: StageTiming[] = report.stages.map(s => ({
      stage:      s.stage as string,
      durationMs: s.durationMs ?? 0,
      status:     s.status,
    }));

    const orchStage  = report.stages.find(s => s.stage === "RUNTIME_ORCHESTRATOR");
    const connector  = (orchStage?.output as { selectedConnector?: string })?.selectedConnector;
    const connectors = connector ? [connector] : [];

    return Object.freeze({
      totalDurationMs:   snapshot.totalDurationMs,
      stageTimings:      Object.freeze(stageTimings),
      memoryUsed:        report.memoryResult?.memorized ?? false,
      connectorsUsed:    Object.freeze(connectors),
      confidence:        report.finalOutput?.confidence ?? report.explainabilityResult?.confidenceScore ?? 0,
      stagesPassed:      report.stagesPassed,
      stagesTotal:       report.stagesTotal,
      hasExplainability: (report.explainabilityResult?.stagesExecuted?.length ?? 0) > 0,
      complianceStatus:  report.auditResult?.complianceStatus ?? null,
      errorCount:        report.stages.filter(s => s.status === "FAILED").length,
    });
  }
}