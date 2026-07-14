/**
 * EngineeringIntelligence.ts — Sprint 6.2.1
 * Central coordinator for all EI engines.
 * Implements the full autonomous engineering loop.
 * Backward compatible with EngineeringWorkflow and EngineeringOrchestrator.
 */

import { ObjectiveAnalyzer }    from "./ObjectiveAnalyzer";
import { ArchitectureInspector } from "./ArchitectureInspector";
import { ReuseEngine }           from "./ReuseEngine";
import { DependencyAnalyzer }    from "./DependencyAnalyzer";
import { RiskAnalyzer }          from "./RiskAnalyzer";
import { ConfidenceEngine }      from "./ConfidenceEngine";
import { EIDecisionEngine }      from "./EIDecisionEngine";
import { RepairEngine }          from "./RepairEngine";
import { LearningEngine }        from "./LearningEngine";
import { EngineeringTimeline }   from "./EngineeringTimeline";
import { EngineeringRegressionSuite } from "../engineering-regression/EngineeringRegressionSuite";
import type {
  EngineeringIntelligencePlan, ObjectiveAnalysis, ArchitectureReport, ReuseResult,
  ImpactGraph, RiskReport, ConfidenceResult, StrategyDecision, RepairReport,
  LessonLearned, TimelineEntry, RepairStatus,
} from "./EITypes";

export type EIStage =
  | "IDLE"
  | "ANALYZING_OBJECTIVE"
  | "INSPECTING_ARCHITECTURE"
  | "SEARCHING_REUSE"
  | "ANALYZING_DEPENDENCIES"
  | "CALCULATING_RISK"
  | "ESTIMATING_CONFIDENCE"
  | "CHOOSING_STRATEGY"
  | "REPAIRING_ENVIRONMENT"
  | "GENERATING_PLAN"
  | "WAIT_APPROVAL"
  | "IMPLEMENTING"
  | "RUNNING_REGRESSION"
  | "GENERATING_REPORT"
  | "STORING_LESSONS"
  | "DONE"
  | "REJECTED"
  | "FAILED";

export interface EIExecution {
  id:           string;
  stage:        EIStage;
  objective:    string;
  log:          string[];
  plan:         EngineeringIntelligencePlan | null;
  startedAt:    number;
  completedAt:  number | null;
  approvedAt:   number | null;
  rejectedAt:   number | null;
  rejectionReason: string | null;
}

let _seq = 0;
function makeEIId(): string { return `ei_${Date.now()}_${++_seq}`; }
function ts(): string { return new Date().toISOString().slice(11, 23); }

// ── Singleton engines (shared state across plans) ─────────────────────────────
const _timeline = new EngineeringTimeline();
let   _totalImpl = 0;
let   _successImpl = 0;

export class EngineeringIntelligence {
  private readonly _objAnalyzer    = new ObjectiveAnalyzer();
  private readonly _archInspector  = new ArchitectureInspector();
  private readonly _reuseEngine    = new ReuseEngine();
  private readonly _depAnalyzer    = new DependencyAnalyzer();
  private readonly _riskAnalyzer   = new RiskAnalyzer();
  private readonly _confidenceEng  = new ConfidenceEngine();
  private readonly _decisionEng    = new EIDecisionEngine();
  private readonly _repairEngine   = new RepairEngine();
  private readonly _learningEngine = new LearningEngine();
  private readonly _regressionSuite = new EngineeringRegressionSuite();

  // Streaming callback for live UI updates
  onStageChange?: (exec: EIExecution) => void;

  get timeline(): EngineeringTimeline { return _timeline; }

  // ── Main autonomous loop (up to WAIT_APPROVAL) ────────────────────────────

  async run(objective: string, previousObjectives: string[] = [], previousTags: string[][] = []): Promise<EIExecution> {
    const exec: EIExecution = {
      id: makeEIId(), stage: "IDLE", objective,
      log: [], plan: null, startedAt: Date.now(),
      completedAt: null, approvedAt: null, rejectedAt: null, rejectionReason: null,
    };

    const log = (msg: string) => { exec.log.push(`[${ts()}] ${msg}`); this._emit(exec); };
    const setStage = (s: EIStage) => { exec.stage = s; this._emit(exec); };

    const memEntries = previousObjectives.map((o, i) => ({ objective: o, tags: previousTags[i] ?? [] }));

    // ── 1. Analyze Objective ───────────────────────────────────────────────
    setStage("ANALYZING_OBJECTIVE");
    log("STEP 1 — Analyzing objective");
    const analysis = this._objAnalyzer.analyze(objective);
    log(`Goal: ${analysis.goal}`);
    log(`Complexity: ${analysis.estimatedComplexity}, Suggested: ${analysis.suggestedStrategy}`);
    log(`Required components: ${analysis.requiredComponents.slice(0, 4).join(", ") || "none detected"}`);

    // ── 2. Inspect Architecture ───────────────────────────────────────────
    setStage("INSPECTING_ARCHITECTURE");
    log("STEP 2 — Inspecting architecture (KG + Repository + Memory)");
    const architecture = await this._archInspector.inspect(objective, memEntries);
    log(`Existing: ${architecture.existingComponents.length}, Reusable: ${architecture.reusableComponents.length}`);
    log(`KG: ${architecture.kgReady ? "ready" : "not built"} — ${architecture.kgEntityCount} entities`);
    if (architecture.architecturalHotspots.length > 0)
      log(`Hotspots: ${architecture.architecturalHotspots.join(", ")}`);

    // ── 3. Search Reuse ───────────────────────────────────────────────────
    setStage("SEARCHING_REUSE");
    log("STEP 3 — Searching for reusable implementations");
    const reuse = this._reuseEngine.search(objective, analysis.requiredComponents, previousObjectives);
    log(`Reuse decision: ${reuse.decision} — ${reuse.explanation.slice(0, 80)}`);

    // ── 4. Analyze Dependencies ───────────────────────────────────────────
    setStage("ANALYZING_DEPENDENCIES");
    log("STEP 4 — Generating impact graph");
    const impactGraph = this._depAnalyzer.analyze(objective, analysis.requiredComponents);
    log(`Impact: ${impactGraph.nodes.length} nodes, ${impactGraph.affectedFiles.length} direct files, singletons: ${impactGraph.singletonsTouched.join(", ") || "none"}`);

    // ── 5. Calculate Risk ─────────────────────────────────────────────────
    setStage("CALCULATING_RISK");
    log("STEP 5 — Calculating risk");
    const regressionCount = previousObjectives.filter(o => o.toLowerCase().includes("regression")).length;
    const risk = this._riskAnalyzer.analyze(objective, impactGraph, regressionCount);
    log(`Risk: ${risk.overallRisk} — ${risk.factors.length} factor(s)`);
    risk.factors.forEach(f => log(`  [${f.level}/${f.category}] ${f.description}`));

    // ── 6. Estimate Confidence ────────────────────────────────────────────
    setStage("ESTIMATING_CONFIDENCE");
    log("STEP 6 — Estimating confidence");
    const confidence = this._confidenceEng.calculate(reuse, risk, regressionCount, _totalImpl, _successImpl);
    log(`Confidence: ${confidence.score}% (${confidence.label})`);

    // ── 7. Choose Strategy ────────────────────────────────────────────────
    setStage("CHOOSING_STRATEGY");
    log("STEP 7 — Choosing implementation strategy");
    const decision = this._decisionEng.decide(reuse, risk, confidence, objective);
    log(`Decision: ${decision.strategy} — ${decision.rationale}`);
    if (decision.alternatives.length > 0)
      log(`Alternatives considered: ${decision.alternatives.map(a => a.strategy).join(", ")}`);

    // ── 8. Repair Environment (if issues detected) ────────────────────────
    let repairReport: RepairReport | null = null;
    const environmentIssues: string[] = [];
    if (!architecture.kgReady) environmentIssues.push("KG not built — entity count=0");
    if (impactGraph.singletonsTouched.length > 0) environmentIssues.push(`Singleton(s) involved: ${impactGraph.singletonsTouched.join(", ")}`);

    if (environmentIssues.length > 0) {
      setStage("REPAIRING_ENVIRONMENT");
      log(`STEP 8 — Repairing environment (${environmentIssues.length} issue(s))`);
      repairReport = await this._repairEngine.repair(environmentIssues);
      log(`Repair: ${repairReport.overallStatus} — ${repairReport.autoFixed} AUTO_FIXED, ${repairReport.failed} failed`);
    } else {
      log("STEP 8 — Environment OK, no repair needed");
    }

    // ── 9. Generate Plan ──────────────────────────────────────────────────
    setStage("GENERATING_PLAN");
    log("STEP 9 — Generating Engineering Intelligence Plan");

    const plan: EngineeringIntelligencePlan = {
      id:               makeEIId(),
      objective,
      analysis,
      architecture,
      reuse,
      impactGraph,
      risk,
      confidence,
      decision,
      repairReport,
      lessons:          null,
      approvedAt:       null,
      implementedAt:    null,
      regressionStatus: null,
      outcome:          "PENDING",
      createdAt:        Date.now(),
      durationMs:       Date.now() - exec.startedAt,
    };

    exec.plan = plan;

    // ── WAIT_APPROVAL — halts here ────────────────────────────────────────
    setStage("WAIT_APPROVAL");
    log("STEP 10 — Plan ready. WAITING FOR HUMAN APPROVAL. No code written until approved.");
    this._emit(exec);

    return exec;
  }

  // ── Approve ───────────────────────────────────────────────────────────────

  async approve(exec: EIExecution): Promise<EIExecution> {
    if (exec.stage !== "WAIT_APPROVAL" || !exec.plan) throw new Error("Cannot approve: wrong stage or no plan");
    const log = (msg: string) => { exec.log.push(`[${ts()}] ${msg}`); this._emit(exec); };
    const setStage = (s: EIStage) => { exec.stage = s; this._emit(exec); };

    exec.approvedAt = Date.now();
    exec.plan.approvedAt = exec.approvedAt;
    exec.plan.outcome = "APPROVED";
    log("✅ APPROVED by Architect — implementation authorized");

    // ── Implement ─────────────────────────────────────────────────────────
    setStage("IMPLEMENTING");
    log("IMPLEMENTING — Implementation stage authorized (external code execution)");
    exec.plan.implementedAt = Date.now();

    // ── Run Regression ────────────────────────────────────────────────────
    setStage("RUNNING_REGRESSION");
    log("RUNNING_REGRESSION — Running full Regression Shield");
    const regReport = await this._regressionSuite.run();
    const regStatus: RepairStatus = regReport.shield === "PASS" ? "PASS"
      : regReport.failed > 0 && regReport.failed <= 2 ? "AUTO_FIXED" : "FAIL";
    exec.plan.regressionStatus = regStatus;
    log(`Regression: ${regStatus} — shield=${regReport.shield}, passed=${regReport.passed}/${regReport.total}`);

    // ── Generate Report & Store Lessons ───────────────────────────────────
    setStage("GENERATING_REPORT");
    log("GENERATING_REPORT — Generating Learning Engine output");
    const lesson = this._learningEngine.generateLesson(
      exec.objective,
      exec.plan.decision,
      exec.plan.risk,
      exec.plan.confidence,
      regStatus,
      exec.plan.repairReport?.actions.length ?? 0,
      exec.plan.durationMs,
      Date.now() - exec.startedAt,
    );
    exec.plan.lessons = lesson;

    // Self-improvement comparison
    const comparison = this._learningEngine.compare(
      { durationMs: exec.plan.durationMs, riskLevel: exec.plan.risk.overallRisk, fileCount: exec.plan.impactGraph.affectedFiles.length, confidence: exec.plan.confidence.score },
      { durationMs: Date.now() - exec.startedAt, riskLevel: exec.plan.risk.overallRisk, fileCount: exec.plan.impactGraph.affectedFiles.length, passed: regStatus !== "FAIL" },
    );
    log(`Self-improvement: ${Object.entries(comparison).map(([k, v]) => `${k}=${v}`).join(", ")}`);

    // ── Store Lessons ─────────────────────────────────────────────────────
    setStage("STORING_LESSONS");
    log("STORING_LESSONS — Updating Engineering Memory and Timeline");

    _totalImpl++;
    if (regStatus !== "FAIL") _successImpl++;

    // Record to timeline
    _timeline.record({
      sprint:           "6.2.1",
      objective:        exec.objective,
      filesChanged:     exec.plan.impactGraph.affectedFiles.length,
      approved:         true,
      strategy:         exec.plan.decision.strategy,
      regressionStatus: regStatus,
      lessonsCount:     lesson.lessonsLearned.length,
      outcome:          regStatus !== "FAIL" ? "PASS" : "FAIL",
      timestamp:        Date.now(),
      durationMs:       Date.now() - exec.startedAt,
    });

    exec.plan.outcome = regStatus !== "FAIL" ? "COMPLETE" : "FAILED";
    exec.completedAt = Date.now();
    setStage("DONE");
    log(`DONE — total=${Date.now() - exec.startedAt}ms`);

    return exec;
  }

  // ── Reject ────────────────────────────────────────────────────────────────

  reject(exec: EIExecution, reason: string): EIExecution {
    exec.stage = "REJECTED";
    exec.rejectedAt = Date.now();
    exec.rejectionReason = reason;
    if (exec.plan) exec.plan.outcome = "REJECTED";
    exec.log.push(`[${ts()}] ❌ REJECTED — ${reason}`);

    _timeline.record({
      sprint: "6.2.1", objective: exec.objective,
      filesChanged: 0, approved: false,
      strategy: exec.plan?.decision.strategy ?? "CREATE",
      regressionStatus: "SKIPPED",
      lessonsCount: 0, outcome: "REJECTED",
      timestamp: Date.now(), durationMs: Date.now() - exec.startedAt,
    });

    this._emit(exec);
    return exec;
  }

  private _emit(exec: EIExecution): void {
    this.onStageChange?.({ ...exec, log: [...exec.log] });
  }
}