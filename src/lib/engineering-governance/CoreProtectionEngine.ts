/**
 * CoreProtectionEngine.ts — Sprint 6.2.2
 * Enforces read-only status on all protected components.
 * Any attempt to modify a protected component is blocked unless human approval is on record.
 */

import { PROTECTED_COMPONENTS } from "./GovernanceTypes";

export interface ProtectionCheckResult {
  blocked:            boolean;
  protectedHit:       string[];
  requiresApproval:   boolean;
  whyNecessary:       string;
  architecturalImpact: string;
  regressionProbability: string;
  rollbackPlan:       string;
}

export class CoreProtectionEngine {
  private readonly _protected = new Set(PROTECTED_COMPONENTS);

  isProtected(componentName: string): boolean {
    return this._protected.has(componentName);
  }

  listProtected(): string[] {
    return [...this._protected];
  }

  check(
    targetComponents: string[],
    objective: string,
    approvedAt: number | null,
  ): ProtectionCheckResult {
    const protectedHit = targetComponents.filter(c => this._protected.has(c));
    const blocked      = protectedHit.length > 0 && !approvedAt;

    const riskMap: Record<string, string> = {
      ConversationCognitiveGateway: "Central conversation routing — breakage silences all AI responses",
      LiveCognitivePipeline:        "Core pipeline — any regression breaks all cognitive processing",
      KnowledgeGraphStore:          "Singleton — HMR data loss risk, all KG consumers affected",
      RepositoryKnowledgeBuilder:   "KG builder — regression breaks all repository analysis",
      SourceCodeParser:             "Parser — regression breaks entity extraction for all files",
      EngineeringWorkflow:          "Workflow engine — regression blocks all engineering lifecycle",
      EngineeringOrchestrator:      "Orchestrator — regression disables autonomous execution",
      EngineeringIntelligence:      "11-engine intelligence layer — regression disables sprint planning",
      RegressionShield:             "Safety gate — disabling it removes all regression protection",
      ApprovalGate:                 "Human approval gate — disabling it bypasses all governance",
      GitHubConnector:              "Repository connector — breakage disables all GitHub operations",
      Base44Connector:              "Platform connector — breakage disables all entity operations",
      ConnectorInvocationService:   "Central connector router — breakage breaks all connectors",
    };

    const whyNecessary = protectedHit.length > 0
      ? `Modification required for: ${objective}. Components affected: ${protectedHit.join(", ")}`
      : "No protected components in scope";

    const architecturalImpact = protectedHit.map(c => riskMap[c] ?? `${c} is a stable Core component`).join("; ");

    const regressionProbability = protectedHit.length > 2 ? "HIGH (>60%)"
      : protectedHit.length === 1 ? "MEDIUM (20–40%)"
      : protectedHit.length > 0  ? "MEDIUM-HIGH (40–60%)"
      : "LOW (<5%)";

    const rollbackPlan = protectedHit.length > 0
      ? `Revert files for: ${protectedHit.join(", ")}. Re-run Regression Shield to confirm 5/5 acceptance.`
      : "No rollback required — no protected components affected";

    return {
      blocked,
      protectedHit,
      requiresApproval: protectedHit.length > 0,
      whyNecessary,
      architecturalImpact,
      regressionProbability,
      rollbackPlan,
    };
  }
}