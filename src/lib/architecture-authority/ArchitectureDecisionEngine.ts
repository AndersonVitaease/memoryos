/**
 * ArchitectureDecisionEngine.ts — Sprint 6.2.3
 * Decides whether a proposal may proceed, must await approval, or is blocked.
 */

import type { ArchitectureProposal, AAApprovalStatus } from "./AATypes";
import { CORE_IMMUTABLE } from "./AATypes";

const CORE_SET = new Set(CORE_IMMUTABLE);

export interface ArchitectureDecision {
  status:            AAApprovalStatus;
  stage:             "AUTO_APPROVED" | "WAIT_ARCHITECTURE_APPROVAL" | "BLOCKED";
  reason:            string;
  requiresApproval:  boolean;
}

export class ArchitectureDecisionEngine {
  decide(proposal: ArchitectureProposal): ArchitectureDecision {
    const hasCore    = proposal.coreComponentsHit.length > 0;
    const hasBlocked = proposal.breakingChanges.some(c => c.autoBlocked);
    const isCritical = proposal.estimatedComplexity === "CRITICAL";

    // AUTO_BLOCKED — policy violation level
    if (isCritical && hasCore) {
      return {
        status:           "BLOCKED",
        stage:            "BLOCKED",
        reason:           `CRITICAL complexity + Core components affected: ${proposal.coreComponentsHit.join(", ")}. Proposal BLOCKED — requires re-scoping.`,
        requiresApproval: true,
      };
    }

    // WAIT_ARCHITECTURE_APPROVAL — any core, singleton, KG, connector, pipeline, governance
    const approvalTriggers = [
      hasCore                             && "Core component(s) affected",
      proposal.coreComponentsHit.includes("KnowledgeGraphStore") && "KnowledgeGraph affected",
      proposal.coreComponentsHit.some(c  => ["GitHubConnector","Base44Connector","ConnectorInvocationService"].includes(c)) && "Connector Runtime affected",
      proposal.coreComponentsHit.includes("ConversationCognitiveGateway") && "Conversation Router affected",
      proposal.coreComponentsHit.includes("EngineeringGovernance") && "Governance affected",
      proposal.coreComponentsHit.includes("LiveCognitivePipeline") && "Pipeline affected",
      hasBlocked                          && "Breaking change auto-blocked",
      proposal.estimatedComplexity === "HIGH" && "HIGH complexity",
    ].filter(Boolean) as string[];

    if (approvalTriggers.length > 0) {
      return {
        status:           "PENDING",
        stage:            "WAIT_ARCHITECTURE_APPROVAL",
        reason:           `Human approval required: ${approvalTriggers.join("; ")}`,
        requiresApproval: true,
      };
    }

    // AUTO_APPROVED — safe changes with no core components
    return {
      status:           "AUTO_APPROVED",
      stage:            "AUTO_APPROVED",
      reason:           "No core components affected, no breaking changes — auto-approved",
      requiresApproval: false,
    };
  }
}