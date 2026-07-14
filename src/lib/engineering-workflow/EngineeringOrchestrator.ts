/**
 * EngineeringOrchestrator.ts — Sprint 6.2.0
 * 2026-07-14
 *
 * Single entry point for all software engineering activity in MemoryOS.
 * Coordinates the full lifecycle: inspect → plan → approve → implement → validate → repair → report → archive.
 *
 * Architecture rules:
 *   - No code is written before human approval
 *   - Stable baseline components are read-only unless the plan explicitly justifies changes
 *   - Every execution is archived in EngineeringMemory
 *   - Self-improvement evaluation runs after every execution
 */

import { EngineeringMemory } from "./EngineeringMemory";
import { EngineeringWorkflow } from "./EngineeringWorkflow";
import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";
import { ConnectorInvocationService } from "../cognitive-connector/ConnectorInvocationService";
import type { WorkflowSession, EngineeringPlan, InspectionSummary, ValidationResult } from "./EngineeringWorkflow";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrchestratorStatus =
  | "IDLE"
  | "INSPECTING"
  | "PLANNING"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "IMPLEMENTING"
  | "VALIDATING"
  | "REPAIRING"
  | "UPDATING_KG"
  | "REPORTING"
  | "ARCHIVING"
  | "COMPLETE"
  | "REJECTED"
  | "FAILED";

export interface OptimizationReport {
  executionId:          string;
  fewerFilessPossible:  boolean;
  reuseMissed:          string[];
  duplicateLogic:       string[];
  oversizedImpl:        boolean;
  regressionsIntroduced: boolean;
  recommendations:      string[];
}

export interface OrchestratorExecution {
  id:               string;
  objective:        string;
  status:           OrchestratorStatus;
  startedAt:        number;
  completedAt:      number | null;
  approvedAt:       number | null;
  rejectedAt:       number | null;
  session:          WorkflowSession | null;
  optimizationReport: OptimizationReport | null;
  kgUpdateSummary:  string | null;
  log:              string[];
  repairCycles:     number;
  validations:      ValidationResult[];
  filesInspected:   string[];
  filesModified:    string[];
  componentsModified: string[];
  previousReports:  string[];   // IDs from EngineeringMemory
}

// ── Stable baseline ────────────────────────────────────────────────────────────

const STABLE_BASELINE = [
  "RepositoryKnowledgeBuilder", "SourceCodeParser", "KnowledgeGraphStore",
  "LiveCognitivePipeline", "ConversationCognitiveGateway", "GitHubQueryRouter",
  "CognitiveAnswerComposer", "ConnectorInvocationService", "GitHubConnector", "Base44Connector",
];

// ── ID helper ─────────────────────────────────────────────────────────────────

let _seq = 0;
function makeOrcId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++_seq}`;
}

function ts(): string { return new Date().toISOString().slice(11, 23); }

// ── EngineeringOrchestrator ────────────────────────────────────────────────────

export class EngineeringOrchestrator {
  readonly memory   = new EngineeringMemory();
  private readonly _wf  = new EngineeringWorkflow();
  private readonly _cis = new ConnectorInvocationService();

  private _active: OrchestratorExecution | null = null;

  // ── Primary entry point ───────────────────────────────────────────────────

  async request(objective: string): Promise<OrchestratorExecution> {
    const exec: OrchestratorExecution = {
      id:                 makeOrcId("exec"),
      objective,
      status:             "INSPECTING",
      startedAt:          Date.now(),
      completedAt:        null,
      approvedAt:         null,
      rejectedAt:         null,
      session:            null,
      optimizationReport: null,
      kgUpdateSummary:    null,
      log:                [],
      repairCycles:       0,
      validations:        [],
      filesInspected:     [],
      filesModified:      [],
      componentsModified: [],
      previousReports:    [],
    };

    this._active = exec;
    const log = (msg: string) => exec.log.push(`[${ts()}] ${msg}`);

    log(`Orchestrator started: "${objective}"`);

    // ── Phase 1: Full inspection pipeline ─────────────────────────────────
    log("PHASE 1 — Inspecting current architecture");
    exec.status = "INSPECTING";

    // Step: Inspect previous engineering reports
    const prevReports = this.memory.getReports().slice(0, 5);
    exec.previousReports = prevReports.map(r => r.id);
    log(`Previous reports found: ${prevReports.length}`);

    // Step: Inspect reusable components + KG
    const inspection = await this._wf.inspect(objective);
    log(`KG: ${inspection.kgEntities} entities, ${inspection.kgModules} modules, ready=${inspection.kgReady}`);
    log(`GitHub commits: ${inspection.recentCommits.length} recent`);
    log(`Reusable candidates: ${inspection.reusableCandidates.join(", ") || "none"}`);
    log(`Duplicate risk: ${inspection.duplicateRisk.length} items`);

    // Step: Inspect existing diagnostics from KGStore
    const kgDiag = inspection.kgReady
      ? `${KnowledgeGraphStore.snapshotFields().kgHealth}`
      : "KG not ready";
    log(`KG health: ${kgDiag}`);

    // ── Phase 2: Planning ─────────────────────────────────────────────────
    log("PHASE 2 — Generating Engineering Plan");
    exec.status = "PLANNING";

    const session = await this._wf.initiate(objective);
    exec.session  = session;
    exec.status   = "PENDING_APPROVAL";

    log(`Plan generated — complexity=${session.plan?.estimatedComplexity}`);
    if (session.plan?.requiresArchitectApproval) {
      log(`⚠ STABLE components affected: ${session.plan.stableComponentsTouched.join(", ")}`);
    }
    log("PHASE 2 COMPLETE — WAITING FOR ARCHITECT APPROVAL");

    // Archive the plan in memory
    this.memory.record(
      "approved_plan",
      objective,
      `Plan generated — complexity=${session.plan?.estimatedComplexity}`,
      session.plan?.affectedComponents ?? [],
      { plan: session.plan as unknown as Record<string, unknown>, inspection },
    );

    return exec;
  }

  // ── Approve ───────────────────────────────────────────────────────────────

  approve(exec: OrchestratorExecution): OrchestratorExecution {
    if (exec.status !== "PENDING_APPROVAL") throw new Error(`Cannot approve: status=${exec.status}`);
    if (!exec.session) throw new Error("No session to approve");

    exec.approvedAt = Date.now();
    exec.status = "APPROVED";
    this._wf.approve(exec.session);
    exec.log.push(`[${ts()}] ✅ APPROVED by Architect`);

    this.memory.record(
      "approved_plan",
      exec.objective,
      "Plan approved — implementation authorized",
      exec.session.plan?.affectedComponents ?? [],
      { execId: exec.id },
    );

    return exec;
  }

  // ── Reject ────────────────────────────────────────────────────────────────

  reject(exec: OrchestratorExecution, reason: string): OrchestratorExecution {
    exec.rejectedAt = Date.now();
    exec.status     = "REJECTED";
    if (exec.session) this._wf.reject(exec.session, reason);
    exec.log.push(`[${ts()}] ❌ REJECTED — ${reason}`);

    this.memory.record(
      "rejected_plan",
      exec.objective,
      `Rejected: ${reason}`,
      [],
      { execId: exec.id, reason },
    );

    return exec;
  }

  // ── Complete (called after external implementation is done) ──────────────

  complete(
    exec: OrchestratorExecution,
    opts: {
      filesModified:      string[];
      componentsModified: string[];
      linesAdded:         number;
      linesRemoved:       number;
      validations:        ValidationResult[];
    },
  ): OrchestratorExecution {
    const log = (msg: string) => exec.log.push(`[${ts()}] ${msg}`);

    exec.filesModified      = opts.filesModified;
    exec.componentsModified = opts.componentsModified;
    exec.validations        = opts.validations;

    // ── Validation phase ──────────────────────────────────────────────────
    exec.status = "VALIDATING";
    log(`PHASE 3 — Validation: ${opts.validations.length} checks`);
    const allPassed = opts.validations.every(v => v.passed);
    log(`Validation result: ${allPassed ? "✅ ALL PASSED" : "❌ FAILURES DETECTED"}`);

    if (!allPassed) {
      exec.repairCycles++;
      exec.status = "REPAIRING";
      log(`PHASE 4 — Self-repair cycle ${exec.repairCycles}`);
      // Record regression
      const failed = opts.validations.filter(v => !v.passed);
      this.memory.record("regression", exec.objective, `${failed.length} validation(s) failed`, [], { failed });
    }

    // ── KG Update phase ───────────────────────────────────────────────────
    exec.status = "UPDATING_KG";
    log("PHASE 5 — Updating Engineering Knowledge Graph");
    const kgUpdate = this._buildKGUpdateSummary(exec);
    exec.kgUpdateSummary = kgUpdate;
    log(`KG update: ${kgUpdate}`);

    // ── Self-improvement evaluation ───────────────────────────────────────
    exec.status = "REPORTING";
    log("PHASE 6 — Self-improvement evaluation");
    const optReport = this._evaluateOptimization(exec, opts);
    exec.optimizationReport = optReport;

    this.memory.record(
      "optimization_report",
      exec.objective,
      `Optimization: ${optReport.recommendations.join("; ") || "none"}`,
      opts.componentsModified,
      { report: optReport as unknown as Record<string, unknown> },
    );

    // ── Final report ──────────────────────────────────────────────────────
    exec.status = "ARCHIVING";
    log("PHASE 7 — Archiving execution");

    const report = this._wf.generateReport(
      exec.session!,
      opts.filesModified,
      opts.componentsModified,
      opts.linesAdded,
      opts.linesRemoved,
      opts.validations,
    );

    this.memory.record(
      "engineering_report",
      exec.objective,
      report.summary,
      opts.componentsModified,
      { report: report as unknown as Record<string, unknown>, execId: exec.id },
    );

    if (allPassed) {
      this.memory.record(
        "completed_work",
        exec.objective,
        `Completed: ${opts.filesModified.length} files modified`,
        opts.componentsModified,
        { execId: exec.id },
      );
    }

    exec.completedAt = Date.now();
    exec.status      = allPassed ? "COMPLETE" : "FAILED";
    log(`ORCHESTRATOR ${exec.status} — ${Date.now() - exec.startedAt}ms total`);

    return exec;
  }

  // ── KG update summary builder ─────────────────────────────────────────────

  private _buildKGUpdateSummary(exec: OrchestratorExecution): string {
    const parts: string[] = [];
    if (exec.filesModified.length > 0)
      parts.push(`${exec.filesModified.length} file(s) tracked`);
    if (exec.componentsModified.length > 0)
      parts.push(`components: ${exec.componentsModified.join(", ")}`);
    const stableHit = exec.componentsModified.filter(c => STABLE_BASELINE.includes(c));
    if (stableHit.length > 0)
      parts.push(`⚠ STABLE modified: ${stableHit.join(", ")}`);
    else
      parts.push("no stable components modified ✅");
    return parts.join(" · ") || "no changes";
  }

  // ── Self-improvement evaluation ───────────────────────────────────────────

  private _evaluateOptimization(
    exec: OrchestratorExecution,
    opts: { filesModified: string[]; componentsModified: string[]; validations: ValidationResult[] },
  ): OptimizationReport {
    const session = exec.session;
    const reusable = session?.inspectionSummary?.reusableCandidates ?? [];
    const reuseMissed = reusable.filter(r => !opts.componentsModified.includes(r));
    const regressions = opts.validations.filter(v => !v.passed);
    const recommendations: string[] = [];

    if (opts.filesModified.length > 10)
      recommendations.push("Consider splitting into smaller focused tasks");
    if (reuseMissed.length > 0)
      recommendations.push(`Reuse opportunity missed: ${reuseMissed.join(", ")}`);
    if (regressions.length > 0)
      recommendations.push(`Fix regressions before next sprint: ${regressions.map(r => r.name).join(", ")}`);
    if (exec.repairCycles > 1)
      recommendations.push("Multiple repair cycles — add upfront unit tests");
    if (recommendations.length === 0)
      recommendations.push("Execution optimal — no improvements identified");

    return {
      executionId:           exec.id,
      fewerFilessPossible:   opts.filesModified.length > 10,
      reuseMissed,
      duplicateLogic:        session?.inspectionSummary?.duplicateRisk ?? [],
      oversizedImpl:         opts.filesModified.length > 15,
      regressionsIntroduced: regressions.length > 0,
      recommendations,
    };
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getActive(): OrchestratorExecution | null { return this._active; }

  stats() {
    return {
      memoryStats:    this.memory.stats(),
      stableBaseline: STABLE_BASELINE,
      totalExecutions: this.memory.getCompletedWork().length,
    };
  }
}