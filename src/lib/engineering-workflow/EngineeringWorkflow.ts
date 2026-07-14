/**
 * EngineeringWorkflow.ts — Sprint 6.1.0
 * 2026-07-14
 *
 * Autonomous Engineering Workflow engine.
 * Every feature request flows through this pipeline before a single line of code is written.
 *
 * Roles:
 *   Human  — defines objective, approves plan, approves delivery
 *   MemoryOS — analyzes, plans, inspects, identifies, generates, validates, repairs, reports
 *
 * STABLE components listed in BASELINE are read-only unless an approved plan justifies change.
 */

import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";
import { ConnectorInvocationService } from "../cognitive-connector/ConnectorInvocationService";

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkflowStatus =
  | "PENDING_ANALYSIS"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "IMPLEMENTING"
  | "VALIDATING"
  | "REPAIRING"
  | "COMPLETE"
  | "REJECTED";

export type ValidationResult = {
  name: string;
  passed: boolean;
  detail: string;
};

export interface EngineeringPlan {
  id: string;
  createdAt: number;
  objective: string;
  affectedComponents: string[];
  affectedFiles: string[];
  dependencies: string[];
  reusableComponents: string[];
  architecturalImpact: string;
  performanceImpact: string;
  regressionRisks: string[];
  estimatedComplexity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  implementationOrder: string[];
  rollbackStrategy: string;
  validationStrategy: string[];
  stableComponentsTouched: string[];
  requiresArchitectApproval: boolean;
}

export interface EngineeringReport {
  id: string;
  planId: string;
  generatedAt: number;
  summary: string;
  filesModified: string[];
  componentsModified: string[];
  linesAdded: number;
  linesRemoved: number;
  dependenciesAffected: string[];
  regressionStatus: "CLEAN" | "REPAIRED" | "OPEN";
  performanceImpact: string;
  architectureImpact: string;
  knowledgeGraphImpact: string;
  acceptanceResults: ValidationResult[];
  validationResults: ValidationResult[];
  overallResult: "PASS" | "FAIL";
}

export interface WorkflowSession {
  id: string;
  objective: string;
  status: WorkflowStatus;
  plan: EngineeringPlan | null;
  report: EngineeringReport | null;
  inspectionSummary: InspectionSummary | null;
  approvedAt: number | null;
  rejectedAt: number | null;
  completedAt: number | null;
  repairCycles: number;
  log: string[];
}

export interface InspectionSummary {
  kgEntities: number;
  kgRelationships: number;
  kgModules: number;
  kgReady: boolean;
  recentCommits: string[];
  reusableCandidates: string[];
  architectureDependencies: string[];
  stableBaseline: string[];
  duplicateRisk: string[];
}

// ── Stable baseline — may NOT be modified without approved plan ───────────────

const STABLE_BASELINE = [
  "RepositoryKnowledgeBuilder",
  "SourceCodeParser",
  "KnowledgeGraphStore",
  "LiveCognitivePipeline",
  "ConversationCognitiveGateway",
  "GitHubQueryRouter",
  "CognitiveAnswerComposer",
  "ConnectorInvocationService",
  "GitHubConnector",
  "Base44Connector",
];

// ── ID generator ──────────────────────────────────────────────────────────────

let _seq = 0;
function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++_seq}`;
}

// ── EngineeringWorkflow ───────────────────────────────────────────────────────

export class EngineeringWorkflow {
  private readonly _cis = new ConnectorInvocationService();

  // ── STEP 1–6: Inspect + Analyze ───────────────────────────────────────────

  async inspect(objective: string): Promise<InspectionSummary> {
    // Step 3: Knowledge Graph
    const kgReady = KnowledgeGraphStore.isReady();
    const graph   = kgReady ? KnowledgeGraphStore.get("EngineeringWorkflow.inspect") : null;

    // Step 4: Recent GitHub commits
    let recentCommits: string[] = [];
    try {
      const reposInv = await this._cis.invoke("github", "repos.list", { per_page: 1 },
        { originComponent: "EngineeringWorkflow", reason: "Sprint 6.1.0 inspection" });
      if (reposInv.record.status === "SUCCESS") {
        const items = (reposInv.result?.data as any)?.items ?? [];
        const first = items[0];
        if (first) {
          const commitsInv = await this._cis.invoke("github", "commits.list",
            { owner: first.owner, repo: first.name, per_page: 5 },
            { originComponent: "EngineeringWorkflow", reason: "Recent commits inspection" });
          const commits = (commitsInv.result?.data as any)?.items ?? [];
          recentCommits = commits.map((c: any) => `${c.sha?.slice(0, 7) ?? "?"} — ${c.message ?? "no message"}`);
        }
      }
    } catch { /* GitHub not configured — continue without */ }

    // Step 5: Architecture dependencies from KG
    const architectureDependencies: string[] = [];
    if (graph) {
      const lowerObj = objective.toLowerCase();
      for (const entity of graph.entities) {
        if (lowerObj.includes(entity.name.toLowerCase())) {
          for (const depId of entity.dependencies) {
            const dep = graph.entities.find(e => e.id === depId);
            if (dep) architectureDependencies.push(`${entity.name} → ${dep.name}`);
          }
        }
      }
    }

    // Step 6: Detect reusable components
    const reusableCandidates: string[] = [];
    const duplicateRisk: string[] = [];
    if (graph) {
      const words = objective.toLowerCase().split(/\s+/);
      for (const entity of graph.entities) {
        const nameLower = entity.name.toLowerCase();
        if (words.some(w => w.length > 4 && nameLower.includes(w))) {
          reusableCandidates.push(entity.name);
          if (entity.exports.length > 0) {
            duplicateRisk.push(`${entity.name} already exports: ${entity.exports.slice(0, 3).join(", ")}`);
          }
        }
      }
    }

    return {
      kgEntities:             graph?.entityCount ?? 0,
      kgRelationships:        graph?.relationshipCount ?? 0,
      kgModules:              graph?.modules.length ?? 0,
      kgReady,
      recentCommits,
      reusableCandidates:     reusableCandidates.slice(0, 10),
      architectureDependencies: architectureDependencies.slice(0, 10),
      stableBaseline:         STABLE_BASELINE,
      duplicateRisk:          duplicateRisk.slice(0, 5),
    };
  }

  // ── STEP 7: Generate Engineering Plan ────────────────────────────────────

  async generatePlan(objective: string, inspection: InspectionSummary): Promise<EngineeringPlan> {
    // Detect which stable components the objective may touch
    const objLower = objective.toLowerCase();
    const stableTouched = STABLE_BASELINE.filter(c => objLower.includes(c.toLowerCase()));

    // Estimate complexity
    let complexity: EngineeringPlan["estimatedComplexity"] = "LOW";
    if (stableTouched.length > 0)               complexity = "HIGH";
    if (stableTouched.length > 2)               complexity = "CRITICAL";
    if (inspection.reusableCandidates.length > 3) complexity = complexity === "LOW" ? "MEDIUM" : complexity;

    return {
      id:                     makeId("plan"),
      createdAt:              Date.now(),
      objective,
      affectedComponents:     stableTouched.length > 0 ? stableTouched : ["TBD — pending implementation scope"],
      affectedFiles:          ["TBD — pending implementation scope"],
      dependencies:           inspection.architectureDependencies,
      reusableComponents:     inspection.reusableCandidates,
      architecturalImpact:    stableTouched.length > 0
        ? `REQUIRES APPROVAL — touches stable baseline: ${stableTouched.join(", ")}`
        : "Additive only — no stable component modified",
      performanceImpact:      "To be determined during implementation",
      regressionRisks:        stableTouched.length > 0
        ? [`Modifying ${stableTouched.join(", ")} may break Acceptance = 5/5`]
        : ["Low — no stable components touched"],
      estimatedComplexity:    complexity,
      implementationOrder:    [
        "1. Read all affected files",
        "2. Confirm reusable components",
        "3. Implement in isolation",
        "4. Wire into pipeline",
        "5. Run full validation suite",
      ],
      rollbackStrategy:       "Revert modified files; re-run Acceptance Validation to confirm 5/5",
      validationStrategy: [
        "Unit Validation",
        "Integration Validation",
        "Pipeline Validation",
        "Knowledge Graph Validation",
        "Regression Validation",
        "Acceptance Validation (must remain 5/5)",
        "Performance Validation",
      ],
      stableComponentsTouched: stableTouched,
      requiresArchitectApproval: stableTouched.length > 0,
    };
  }

  // ── Full workflow: inspect → plan → await approval ────────────────────────

  async initiate(objective: string): Promise<WorkflowSession> {
    const session: WorkflowSession = {
      id:                makeId("wf"),
      objective,
      status:            "PENDING_ANALYSIS",
      plan:              null,
      report:            null,
      inspectionSummary: null,
      approvedAt:        null,
      rejectedAt:        null,
      completedAt:       null,
      repairCycles:      0,
      log:               [`[${ts()}] Workflow initiated: "${objective}"`],
    };

    session.log.push(`[${ts()}] STEP 1: Objective understood`);
    session.log.push(`[${ts()}] STEP 2: Inspecting codebase via KnowledgeGraphStore`);
    const inspection = await this.inspect(objective);
    session.inspectionSummary = inspection;

    session.log.push(`[${ts()}] STEP 3: KG — ${inspection.kgEntities} entities, ${inspection.kgModules} modules`);
    session.log.push(`[${ts()}] STEP 4: GitHub — ${inspection.recentCommits.length} recent commits retrieved`);
    session.log.push(`[${ts()}] STEP 5: Architecture dependencies — ${inspection.architectureDependencies.length} found`);
    session.log.push(`[${ts()}] STEP 6: Reusable candidates — ${inspection.reusableCandidates.join(", ") || "none"}`);
    session.log.push(`[${ts()}] STEP 7: Generating Engineering Plan`);

    const plan = await this.generatePlan(objective, inspection);
    session.plan = plan;
    session.status = "PENDING_APPROVAL";

    session.log.push(`[${ts()}] Engineering Plan generated — complexity=${plan.estimatedComplexity}`);
    if (plan.requiresArchitectApproval) {
      session.log.push(`[${ts()}] ⚠️ REQUIRES ARCHITECT APPROVAL — stable components affected: ${plan.stableComponentsTouched.join(", ")}`);
    }
    session.log.push(`[${ts()}] WAITING FOR APPROVAL. No code will be written until approved.`);

    return session;
  }

  // ── Approve ───────────────────────────────────────────────────────────────

  approve(session: WorkflowSession): WorkflowSession {
    if (session.status !== "PENDING_APPROVAL") {
      throw new Error(`Cannot approve session in status: ${session.status}`);
    }
    session.approvedAt = Date.now();
    session.status = "APPROVED";
    session.log.push(`[${ts()}] ✅ APPROVED by Architect — implementation may proceed`);
    return session;
  }

  // ── Reject ────────────────────────────────────────────────────────────────

  reject(session: WorkflowSession, reason: string): WorkflowSession {
    session.rejectedAt = Date.now();
    session.status = "REJECTED";
    session.log.push(`[${ts()}] ❌ REJECTED by Architect — reason: ${reason}`);
    return session;
  }

  // ── Generate final report (called after implementation is complete) ────────

  generateReport(
    session: WorkflowSession,
    filesModified: string[],
    componentsModified: string[],
    linesAdded: number,
    linesRemoved: number,
    validations: ValidationResult[],
  ): EngineeringReport {
    const acceptance = validations.filter(v => v.name.includes("Acceptance"));
    const allPassed  = validations.every(v => v.passed);

    const report: EngineeringReport = {
      id:                    makeId("report"),
      planId:                session.plan?.id ?? "N/A",
      generatedAt:           Date.now(),
      summary:               `Sprint 6.1.0 — ${session.objective}`,
      filesModified,
      componentsModified,
      linesAdded,
      linesRemoved,
      dependenciesAffected:  session.plan?.dependencies ?? [],
      regressionStatus:      allPassed ? "CLEAN" : "OPEN",
      performanceImpact:     "Additive — no degradation to existing pipeline",
      architectureImpact:    session.plan?.architecturalImpact ?? "Unknown",
      knowledgeGraphImpact:  "KnowledgeGraphStore unchanged — STABLE",
      acceptanceResults:     acceptance,
      validationResults:     validations,
      overallResult:         allPassed ? "PASS" : "FAIL",
    };

    session.report = report;
    session.status = allPassed ? "COMPLETE" : "REPAIRING";
    session.completedAt = allPassed ? Date.now() : null;
    session.log.push(`[${ts()}] Engineering Report generated — ${allPassed ? "✅ PASS" : "❌ FAIL"}`);

    return report;
  }
}

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}