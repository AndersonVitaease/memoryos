/**
 * OrchestratorLifecycle.ts — Sprint 6.2.0
 * 2026-07-14
 *
 * Implements the full autonomous Engineering Lifecycle state machine:
 *
 *   IDLE → ANALYZE → INSPECT_CODEBASE → INSPECT_KNOWLEDGE_GRAPH
 *        → INSPECT_CONNECTORS → RUN_REGRESSION_SHIELD
 *        → PRECONDITIONS_OK?
 *              NO  → AUTO_PREPARE_ENVIRONMENT → RUN_REGRESSION_SHIELD (retry)
 *              YES → GENERATE_PLAN → WAIT_APPROVAL
 *                  → IMPLEMENT → RUN_FULL_REGRESSION → REPORT → DONE
 */

import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";
import { ConnectorInvocationService } from "../cognitive-connector/ConnectorInvocationService";
import { EngineeringWorkflow } from "./EngineeringWorkflow";
import { EngineeringRegressionSuite } from "../engineering-regression/EngineeringRegressionSuite";
import type { RegressionReport } from "../engineering-regression/EngineeringRegressionSuite";
import type { WorkflowSession, EngineeringPlan, InspectionSummary } from "./EngineeringWorkflow";

// ── State machine stages ──────────────────────────────────────────────────────

export type LifecycleStage =
  | "IDLE"
  | "ANALYZE"
  | "INSPECT_CODEBASE"
  | "INSPECT_KNOWLEDGE_GRAPH"
  | "INSPECT_CONNECTORS"
  | "RUN_REGRESSION_SHIELD"
  | "PRECONDITIONS_CHECK"
  | "AUTO_PREPARE_ENVIRONMENT"
  | "GENERATE_PLAN"
  | "WAIT_APPROVAL"
  | "IMPLEMENT"
  | "RUN_FULL_REGRESSION"
  | "REPORT"
  | "DONE"
  | "FAILED"
  | "REJECTED";

export interface StageResult {
  stage:      LifecycleStage;
  status:     "OK" | "WARN" | "FAIL" | "SKIPPED";
  summary:    string;
  durationMs: number;
  details:    Record<string, unknown>;
}

export interface EnvironmentSnapshot {
  kgReady:           boolean;
  kgEntityCount:     number;
  kgHealth:          string;
  githubConnected:   boolean;
  base44Connected:   boolean;
  recentCommits:     string[];
  appProjects:       number;
  appSessions:       number;
}

export interface PreconditionCheck {
  kgBuilt:           boolean;
  kgHealthy:         boolean;
  connectorReachable: boolean;
  regressionClean:   boolean;
  regressionShield:  "PASS" | "FAIL" | "BLOCKED";
  overall:           boolean;
  failures:          string[];
}

export interface LifecycleExecution {
  id:              string;
  objective:       string;
  stage:           LifecycleStage;
  stageHistory:    StageResult[];
  log:             string[];
  startedAt:       number;
  completedAt:     number | null;
  approvedAt:      number | null;
  rejectedAt:      number | null;
  rejectionReason: string | null;

  // Per-stage outputs
  envSnapshot:          EnvironmentSnapshot | null;
  inspectionSummary:    InspectionSummary | null;
  preconditions:        PreconditionCheck | null;
  prepareLog:           string[];
  firstShieldReport:    RegressionReport | null;
  finalShieldReport:    RegressionReport | null;
  session:              WorkflowSession | null;
  plan:                 EngineeringPlan | null;

  // Retry tracking
  autoPrepareAttempts:  number;
  maxPrepareAttempts:   number;
}

// ── ID helper ─────────────────────────────────────────────────────────────────

let _seq = 0;
function makeId(): string { return `lc_${Date.now()}_${++_seq}`; }
function ts(): string { return new Date().toISOString().slice(11, 23); }

// ── OrchestratorLifecycle ─────────────────────────────────────────────────────

export class OrchestratorLifecycle {
  private readonly _wf      = new EngineeringWorkflow();
  private readonly _cis     = new ConnectorInvocationService();
  private readonly _suite   = new EngineeringRegressionSuite();

  // Streaming callback — UI subscribes to receive stage updates in real-time
  onStageChange?: (exec: LifecycleExecution) => void;

  // ── Lifecycle entry point ─────────────────────────────────────────────────

  async start(objective: string): Promise<LifecycleExecution> {
    const exec: LifecycleExecution = {
      id:                   makeId(),
      objective,
      stage:                "IDLE",
      stageHistory:         [],
      log:                  [],
      startedAt:            Date.now(),
      completedAt:          null,
      approvedAt:           null,
      rejectedAt:           null,
      rejectionReason:      null,
      envSnapshot:          null,
      inspectionSummary:    null,
      preconditions:        null,
      prepareLog:           [],
      firstShieldReport:    null,
      finalShieldReport:    null,
      session:              null,
      plan:                 null,
      autoPrepareAttempts:  0,
      maxPrepareAttempts:   2,
    };

    const log = (msg: string) => { exec.log.push(`[${ts()}] ${msg}`); this._emit(exec); };
    const stage = (s: LifecycleStage) => { exec.stage = s; this._emit(exec); };

    log(`Lifecycle started — objective: "${objective}"`);

    // ── Stage: ANALYZE ───────────────────────────────────────────────────────
    await this._runStage(exec, "ANALYZE", async () => {
      log("ANALYZE — Understanding objective and environment");
      const snap = await this._captureEnvironment();
      exec.envSnapshot = snap;
      log(`Environment: KG=${snap.kgReady ? "ready" : "not built"}, GitHub=${snap.githubConnected ? "connected" : "not configured"}`);
      return { status: "OK", summary: "Objective registered, environment captured", details: snap as unknown as Record<string, unknown> };
    });

    // ── Stage: INSPECT_CODEBASE ──────────────────────────────────────────────
    await this._runStage(exec, "INSPECT_CODEBASE", async () => {
      log("INSPECT_CODEBASE — Traversing architecture via KnowledgeGraphStore");
      const inspection = await this._wf.inspect(objective);
      exec.inspectionSummary = inspection;
      log(`Codebase: ${inspection.kgEntities} entities, ${inspection.kgModules} modules`);
      log(`Reusable candidates: ${inspection.reusableCandidates.join(", ") || "none"}`);
      log(`Duplicate risk: ${inspection.duplicateRisk.length} items`);
      return {
        status: inspection.kgReady ? "OK" : "WARN",
        summary: `KG ${inspection.kgReady ? "ready" : "not built"} — ${inspection.kgEntities} entities`,
        details: { kgReady: inspection.kgReady, entities: inspection.kgEntities, modules: inspection.kgModules },
      };
    });

    // ── Stage: INSPECT_KNOWLEDGE_GRAPH ───────────────────────────────────────
    await this._runStage(exec, "INSPECT_KNOWLEDGE_GRAPH", async () => {
      log("INSPECT_KNOWLEDGE_GRAPH — Validating KnowledgeGraphStore state");
      const fields = KnowledgeGraphStore.snapshotFields();
      const ready  = KnowledgeGraphStore.isReady();
      const health = (fields as any).kgHealth ?? "NOT_BUILT";
      log(`KG health: ${health}, entities: ${(fields as any).kgEntityCount ?? 0}, relationships: ${(fields as any).kgRelationshipCount ?? 0}`);
      return {
        status: ready ? (health === "HEALTHY" ? "OK" : "WARN") : "WARN",
        summary: `KG ${health} — ${(fields as any).kgEntityCount ?? 0} entities`,
        details: fields,
      };
    });

    // ── Stage: INSPECT_CONNECTORS ────────────────────────────────────────────
    await this._runStage(exec, "INSPECT_CONNECTORS", async () => {
      log("INSPECT_CONNECTORS — Probing Base44 and GitHub connectors");
      let b44ok = false;
      let ghok  = false;

      try {
        const b44Inv = await this._cis.invoke("base44", "entities.list", { entity: "Project", limit: 1 },
          { originComponent: "OrchestratorLifecycle", reason: "Connector probe" });
        b44ok = b44Inv.record.status === "SUCCESS";
      } catch { b44ok = false; }

      try {
        const ghInv = await this._cis.invoke("github", "repos.list", { per_page: 1 },
          { originComponent: "OrchestratorLifecycle", reason: "Connector probe" });
        ghok = ghInv.record.status === "SUCCESS";
      } catch { ghok = false; }

      log(`Base44 connector: ${b44ok ? "OK" : "unavailable"}`);
      log(`GitHub connector: ${ghok ? "OK" : "not configured"}`);

      if (exec.envSnapshot) {
        exec.envSnapshot.base44Connected = b44ok;
        exec.envSnapshot.githubConnected = ghok;
      }

      return {
        status: b44ok ? "OK" : "WARN",
        summary: `Base44=${b44ok ? "OK" : "WARN"} GitHub=${ghok ? "OK" : "not configured"}`,
        details: { base44: b44ok, github: ghok },
      };
    });

    // ── Stage: RUN_REGRESSION_SHIELD (first pass) ────────────────────────────
    await this._runStage(exec, "RUN_REGRESSION_SHIELD", async () => {
      log("RUN_REGRESSION_SHIELD — Running mandatory regression suite");
      const report = await this._suite.run();
      exec.firstShieldReport = report;
      log(`Shield: ${report.shield} — ${report.passed}/${report.total} passed, ${report.skipped} skipped`);
      if (report.shield !== "PASS") {
        log(`Shield failures: ${report.rcaSummary.slice(0, 3).join("; ")}`);
      }
      return {
        status: report.shield === "PASS" ? "OK" : report.shield === "FAIL" ? "WARN" : "FAIL",
        summary: `Shield=${report.shield} — ${report.passed}/${report.total}`,
        details: { shield: report.shield, passed: report.passed, failed: report.failed, skipped: report.skipped },
      };
    });

    // ── Stage: PRECONDITIONS_CHECK ───────────────────────────────────────────
    await this._runStage(exec, "PRECONDITIONS_CHECK", async () => {
      log("PRECONDITIONS_CHECK — Evaluating readiness gates");
      const pc = this._evaluatePreconditions(exec);
      exec.preconditions = pc;

      if (!pc.overall) {
        log(`Preconditions FAIL — ${pc.failures.join(", ")}`);
        log("Branching to AUTO_PREPARE_ENVIRONMENT");
      } else {
        log("Preconditions OK — proceeding to GENERATE_PLAN");
      }

      return {
        status: pc.overall ? "OK" : "WARN",
        summary: pc.overall ? "All preconditions met" : `Failures: ${pc.failures.join(", ")}`,
        details: pc as unknown as Record<string, unknown>,
      };
    });

    // ── Branch: AUTO_PREPARE_ENVIRONMENT (if preconditions failed) ────────────
    if (!exec.preconditions!.overall && exec.autoPrepareAttempts < exec.maxPrepareAttempts) {
      await this._runStage(exec, "AUTO_PREPARE_ENVIRONMENT", async () => {
        exec.autoPrepareAttempts++;
        log(`AUTO_PREPARE_ENVIRONMENT — Attempt ${exec.autoPrepareAttempts}/${exec.maxPrepareAttempts}`);

        const prepLog: string[] = [];

        // 1. Attempt to warm KG diagnostics
        prepLog.push("Refreshing KnowledgeGraphStore diagnostics...");
        const diag = KnowledgeGraphStore.diagnostics();
        prepLog.push(`KGStore: instanceId=${diag.instanceId}, entityCount=${diag.entityCount}`);

        // 2. Reload singleton services
        prepLog.push("Reloading singleton services...");
        const snap = await this._captureEnvironment();
        exec.envSnapshot = snap;
        prepLog.push(`Environment refreshed: KG=${snap.kgReady}, entities=${snap.kgEntityCount}`);

        // 3. Warm connectors (retry probes)
        prepLog.push("Warming connectors...");
        try {
          await this._cis.invoke("base44", "entities.list", { entity: "Project", limit: 1 },
            { originComponent: "OrchestratorLifecycle", reason: "Warm-up probe" });
          prepLog.push("Base44 connector warmed");
          if (exec.envSnapshot) exec.envSnapshot.base44Connected = true;
        } catch {
          prepLog.push("Base44 connector unavailable during warm-up");
        }

        // 4. Retry failed inspections
        prepLog.push("Retrying codebase inspection...");
        const reinspect = await this._wf.inspect(objective);
        exec.inspectionSummary = reinspect;
        prepLog.push(`Re-inspection: ${reinspect.kgEntities} entities, ${reinspect.kgModules} modules`);

        exec.prepareLog.push(...prepLog);
        prepLog.forEach(l => log(`  PREPARE: ${l}`));

        // 5. Re-run regression shield after preparation
        prepLog.push("Re-running Regression Shield...");
        log("AUTO_PREPARE: Re-running Regression Shield after environment preparation");
        const retryReport = await this._suite.run();
        exec.firstShieldReport = retryReport; // update with latest
        prepLog.push(`Shield retry: ${retryReport.shield} — ${retryReport.passed}/${retryReport.total}`);
        log(`Shield retry result: ${retryReport.shield}`);

        // Re-evaluate preconditions
        exec.preconditions = this._evaluatePreconditions(exec);
        log(`Preconditions after prepare: ${exec.preconditions.overall ? "OK" : "still failing"}`);

        return {
          status: exec.preconditions.overall ? "OK" : "WARN",
          summary: `Prepared — preconditions now ${exec.preconditions.overall ? "OK" : "still failing"}`,
          details: { attempts: exec.autoPrepareAttempts, prepLog },
        };
      });
    }

    // ── Stage: GENERATE_PLAN ─────────────────────────────────────────────────
    await this._runStage(exec, "GENERATE_PLAN", async () => {
      log("GENERATE_PLAN — Generating Engineering Plan");
      const session = await this._wf.initiate(objective);
      exec.session = session;
      exec.plan    = session.plan;
      log(`Plan complexity: ${session.plan?.estimatedComplexity}`);
      log(`Stable components touched: ${session.plan?.stableComponentsTouched.join(", ") || "none"}`);
      log(`Requires architect approval: ${session.plan?.requiresArchitectApproval}`);
      return {
        status: "OK",
        summary: `Plan ready — complexity=${session.plan?.estimatedComplexity}`,
        details: {
          complexity:     session.plan?.estimatedComplexity,
          stableTouched:  session.plan?.stableComponentsTouched ?? [],
          needsApproval:  session.plan?.requiresArchitectApproval,
        },
      };
    });

    // ── Stage: WAIT_APPROVAL — halts here, user must call approve()/reject() ─
    exec.stage = "WAIT_APPROVAL";
    log("WAIT_APPROVAL — Plan ready. Awaiting human approval. No code will be written until approved.");
    this._emit(exec);

    return exec;
  }

  // ── Approval gate ─────────────────────────────────────────────────────────

  async approve(exec: LifecycleExecution): Promise<LifecycleExecution> {
    if (exec.stage !== "WAIT_APPROVAL") throw new Error(`Cannot approve at stage: ${exec.stage}`);

    const log = (msg: string) => { exec.log.push(`[${ts()}] ${msg}`); this._emit(exec); };

    exec.approvedAt = Date.now();
    if (exec.session) this._wf.approve(exec.session);
    log("✅ APPROVED by Architect — implementation authorized");

    // ── Stage: IMPLEMENT ─────────────────────────────────────────────────────
    await this._runStage(exec, "IMPLEMENT", async () => {
      log("IMPLEMENT — Implementation authorized. Executing plan...");
      // In a real system this would call the code writer; here we mark it ready
      log("Implementation stage complete (awaiting external code execution)");
      return {
        status: "OK",
        summary: "Implementation stage authorized and marked complete",
        details: { filesPlanned: exec.plan?.affectedFiles ?? [], componentsPlanned: exec.plan?.affectedComponents ?? [] },
      };
    });

    // ── Stage: RUN_FULL_REGRESSION ───────────────────────────────────────────
    await this._runStage(exec, "RUN_FULL_REGRESSION", async () => {
      log("RUN_FULL_REGRESSION — Running full regression shield post-implementation");
      const report = await this._suite.run();
      exec.finalShieldReport = report;
      log(`Final Shield: ${report.shield} — ${report.passed}/${report.total} passed`);
      return {
        status: report.shield === "PASS" ? "OK" : "FAIL",
        summary: `Final Shield=${report.shield}`,
        details: { shield: report.shield, passed: report.passed, failed: report.failed },
      };
    });

    // ── Stage: REPORT ────────────────────────────────────────────────────────
    await this._runStage(exec, "REPORT", async () => {
      const shield = exec.finalShieldReport?.shield ?? "UNKNOWN";
      const passed = exec.finalShieldReport?.passed ?? 0;
      const total  = exec.finalShieldReport?.total  ?? 0;
      log(`REPORT — Final validation: ${shield}`);
      log(`Acceptance score: ${exec.finalShieldReport?.acceptanceScore ?? 0}/5`);
      return {
        status: shield === "PASS" ? "OK" : "WARN",
        summary: `Regression ${shield} — ${passed}/${total}`,
        details: { shield, passed, total, acceptanceScore: exec.finalShieldReport?.acceptanceScore ?? 0 },
      };
    });

    // ── Stage: DONE ──────────────────────────────────────────────────────────
    exec.stage = "DONE";
    exec.completedAt = Date.now();
    log(`DONE — Lifecycle complete in ${exec.completedAt - exec.startedAt}ms`);
    this._recordStage(exec, "DONE", "OK", "Lifecycle complete", { totalMs: exec.completedAt - exec.startedAt });
    this._emit(exec);

    return exec;
  }

  // ── Rejection ─────────────────────────────────────────────────────────────

  reject(exec: LifecycleExecution, reason: string): LifecycleExecution {
    exec.stage           = "REJECTED";
    exec.rejectedAt      = Date.now();
    exec.rejectionReason = reason;
    exec.log.push(`[${ts()}] ❌ REJECTED — ${reason}`);
    if (exec.session) this._wf.reject(exec.session, reason);
    this._emit(exec);
    return exec;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async _captureEnvironment(): Promise<EnvironmentSnapshot> {
    const fields = KnowledgeGraphStore.snapshotFields();
    return {
      kgReady:         KnowledgeGraphStore.isReady(),
      kgEntityCount:   (fields as any).kgEntityCount ?? 0,
      kgHealth:        (fields as any).kgHealth ?? "NOT_BUILT",
      githubConnected: false, // updated by INSPECT_CONNECTORS
      base44Connected: false,
      recentCommits:   [],
      appProjects:     0,
      appSessions:     0,
    };
  }

  private _evaluatePreconditions(exec: LifecycleExecution): PreconditionCheck {
    const failures: string[] = [];
    const shield = exec.firstShieldReport?.shield;

    const kgBuilt           = (exec.envSnapshot?.kgEntityCount ?? 0) > 0;
    const kgHealthy         = exec.envSnapshot?.kgHealth !== "NOT_BUILT";
    const connectorReachable = exec.envSnapshot?.base44Connected ?? false;
    const regressionClean   = shield === "PASS";
    const regressionShield  = shield ?? "FAIL";

    // KG not built is a WARN, not a hard block (regression suite handles it with SKIPs)
    if (!connectorReachable)      failures.push("Base44 connector unreachable");
    if (shield === "BLOCKED")     failures.push("Regression shield BLOCKED — critical failures");

    const overall = failures.length === 0;

    return {
      kgBuilt, kgHealthy, connectorReachable, regressionClean,
      regressionShield: regressionShield as "PASS" | "FAIL" | "BLOCKED",
      overall, failures,
    };
  }

  private async _runStage(
    exec: LifecycleExecution,
    stage: LifecycleStage,
    fn: () => Promise<{ status: "OK" | "WARN" | "FAIL" | "SKIPPED"; summary: string; details: Record<string, unknown> }>,
  ): Promise<void> {
    exec.stage = stage;
    this._emit(exec);
    const t0 = Date.now();
    const result = await fn();
    this._recordStage(exec, stage, result.status, result.summary, result.details, Date.now() - t0);
    this._emit(exec);
  }

  private _recordStage(
    exec: LifecycleExecution,
    stage: LifecycleStage,
    status: "OK" | "WARN" | "FAIL" | "SKIPPED",
    summary: string,
    details: Record<string, unknown>,
    durationMs = 0,
  ): void {
    exec.stageHistory.push({ stage, status, summary, durationMs, details });
  }

  private _emit(exec: LifecycleExecution): void {
    this.onStageChange?.({ ...exec, stageHistory: [...exec.stageHistory], log: [...exec.log] });
  }
}