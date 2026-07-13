/**
 * CognitivePlanner.ts — Cognitive Development Loop
 * Beta-03.1 · 2026-07-13
 *
 * Generates an ExecutionPlan from RepositoryAnalysis + ApplicationAnalysis.
 * Uses knowledge from both analyses to recommend improvements.
 * Every recommendation includes reasoning — no opaque suggestions.
 * Does NOT modify anything — plan only.
 */

import type { RepositoryAnalysis, ApplicationAnalysis, ExecutionPlan, PlanStep, ImprovementOpportunity, RiskAnalysis, DependencyAnalysis } from "./CDLTypes";
import { makeCDLId } from "./CDLTypes";

export class CognitivePlanner {

  plan(repo: RepositoryAnalysis | null, app: ApplicationAnalysis | null): ExecutionPlan {
    const steps: PlanStep[] = [];
    const opportunities: ImprovementOpportunity[] = [];
    let order = 1;

    // ── Steps derived from repository state ──────────────────────────────────

    if (repo) {
      if (repo.errors.length > 0) {
        opportunities.push({
          id: makeCDLId("opp"), title: "Fix repository connectivity",
          description: `GitHub connector reported ${repo.errors.length} error(s) during analysis.`,
          category: "architecture", riskLevel: "medium", effort: "low",
          reasoning: `Errors: ${repo.errors.slice(0, 2).join("; ")}. Connectivity issues prevent reliable code intelligence.`,
        });
      }

      if (repo.recentCommits.length > 0) {
        steps.push({
          id: makeCDLId("step"), order: order++,
          title: "Sync latest commits to knowledge graph",
          description: `Ingest ${repo.recentCommits.length} recent commits from ${repo.owner}/${repo.repo}.`,
          connector: "github", operation: "commits.list",
          riskLevel: "low", estimatedDurationMs: 800,
          requiresApproval: false, affectedFiles: [],
          expectedImpact: "Knowledge graph updated with latest development activity.",
        });
      }

      if (repo.totalFiles > 0) {
        steps.push({
          id: makeCDLId("step"), order: order++,
          title: "Index repository file tree",
          description: `Analyze ${repo.totalFiles} files in ${repo.owner}/${repo.repo}.`,
          connector: "github", operation: "files.list",
          riskLevel: "low", estimatedDurationMs: 600,
          requiresApproval: false, affectedFiles: [],
          expectedImpact: "Complete file structure indexed for knowledge reconstruction.",
        });
      }

      if (repo.branches.filter(b => b.protected).length === 0 && repo.branchCount > 0) {
        opportunities.push({
          id: makeCDLId("opp"), title: "Enable branch protection",
          description: "No protected branches detected. Adding branch protection prevents accidental force-pushes.",
          category: "security", riskLevel: "medium", effort: "low",
          reasoning: `Repository has ${repo.branchCount} branch(es) but none are protected. Branch protection rules enforce code review and CI checks.`,
        });
      }

      if (repo.primaryLanguage === "JavaScript" || repo.primaryLanguage === "TypeScript") {
        opportunities.push({
          id: makeCDLId("opp"), title: "Run TypeScript strict mode audit",
          description: "TypeScript project detected. Enabling strict mode catches more type errors at compile time.",
          category: "architecture", riskLevel: "low", effort: "medium",
          reasoning: "TypeScript with strict mode reduces runtime errors by approximately 15-20% per industry benchmarks.",
        });
      }
    }

    // ── Steps derived from application state ─────────────────────────────────

    if (app) {
      steps.push({
        id: makeCDLId("step"), order: order++,
        title: "Snapshot current application knowledge",
        description: `Capture knowledge snapshot for ${app.projectCount} project(s) and ${app.sessionCount} session(s).`,
        connector: "base44", operation: "entities.list",
        riskLevel: "low", estimatedDurationMs: 400,
        requiresApproval: false, affectedFiles: [],
        expectedImpact: "Pre-execution knowledge baseline established for provenance tracking.",
      });

      const lowEntityTypes = app.entityCounts.filter(e => e.count === 0);
      if (lowEntityTypes.length > 0) {
        opportunities.push({
          id: makeCDLId("opp"), title: "Populate missing entity types",
          description: `${lowEntityTypes.length} entity type(s) have no records: ${lowEntityTypes.map(e => e.entity).join(", ")}.`,
          category: "knowledge", riskLevel: "low", effort: "low",
          reasoning: "Empty entity types indicate incomplete memory coverage. Populate these to improve cognitive context for future analyses.",
        });
      }

      if (app.sessionCount > 20) {
        opportunities.push({
          id: makeCDLId("opp"), title: "Archive old chat sessions",
          description: `${app.sessionCount} sessions detected. Sessions older than 30 days should be archived to improve retrieval performance.`,
          category: "performance", riskLevel: "low", effort: "low",
          reasoning: "Archiving reduces the active context window and improves LLM retrieval relevance by reducing noise.",
        });
      }

      if (app.errors.length > 0) {
        opportunities.push({
          id: makeCDLId("opp"), title: "Resolve Base44 connector errors",
          description: `Base44 connector reported ${app.errors.length} error(s).`,
          category: "architecture", riskLevel: "high", effort: "medium",
          reasoning: `Errors: ${app.errors.slice(0, 2).join("; ")}. These prevent reliable application state analysis.`,
        });
      }
    }

    // ── Always: knowledge reconstruction step ────────────────────────────────

    steps.push({
      id: makeCDLId("step"), order: order++,
      title: "Run Knowledge Reconstruction Engine",
      description: "Fuse knowledge from GitHub + Base44, resolve identities, rebuild knowledge graph and timeline.",
      connector: "knowledge", operation: "full_reconstruction",
      riskLevel: "low", estimatedDurationMs: 1200,
      requiresApproval: false, affectedFiles: [],
      expectedImpact: "Knowledge graph refreshed with latest data from all sources.",
    });

    // ── Risk analysis ─────────────────────────────────────────────────────────

    const highRiskOps = steps.filter(s => s.riskLevel === "high" || s.riskLevel === "critical");
    const risk: RiskAnalysis = {
      overall: highRiskOps.length > 0 ? "high" : opportunities.some(o => o.riskLevel === "medium") ? "medium" : "low",
      items: [
        { description: "No write operations in this plan", level: "low", mitigation: "All steps are read-only or knowledge operations" },
        ...(repo?.errors.length ? [{ description: "GitHub connector errors reduce analysis completeness", level: "medium" as const, mitigation: "Verify GitHub token has repo scope" }] : []),
        ...(app?.errors.length ? [{ description: "Base44 connector errors reduce application visibility", level: "medium" as const, mitigation: "Verify session is valid" }] : []),
      ],
    };

    const deps: DependencyAnalysis = {
      directDependencies:    ["GitHubConnector v2.0.0", "Base44Connector v2.0.0"],
      knowledgeDependencies: ["KnowledgeReconstructionEngine", "KnowledgeFusionEngine", "IdentityResolutionEngine"],
      connectorDependencies: ["ConnectorRuntime v1.0", "PCS v1.0"],
    };

    const totalMs = steps.reduce((s, x) => s + x.estimatedDurationMs, 0);

    const repoLabel = repo ? `${repo.owner}/${repo.repo}` : "unknown repo";
    const appLabel  = app  ? `${app.projectCount}p / ${app.sessionCount}s / ${app.entityCounts.reduce((s, e) => s + e.count, 0)} records` : "app unknown";

    return {
      id:                 makeCDLId("plan"),
      generatedAt:        Date.now(),
      title:              `Cognitive Development Loop — ${repoLabel}`,
      summary:            `${steps.length} steps · ${opportunities.length} opportunities · App: ${appLabel} · Risk: ${risk.overall}`,
      steps,
      opportunities,
      risk,
      dependencies:       deps,
      requiresConnectors: ["github", "base44"],
      estimatedTotalMs:   totalMs,
      approved:           false,
      approvedAt:         null,
    };
  }
}