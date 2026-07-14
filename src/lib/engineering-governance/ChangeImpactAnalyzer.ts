/**
 * ChangeImpactAnalyzer.ts — Sprint 6.2.2
 * Calculates the full change impact before any implementation.
 */

import { PROTECTED_COMPONENTS } from "./GovernanceTypes";
import { KnowledgeGraphStore }  from "../project-knowledge/KnowledgeGraphStore";
import type { ChangeImpact, RiskLevel } from "./GovernanceTypes";

const SINGLETON_NAMES = ["KnowledgeGraphStore", "ConnectorInvocationService", "LiveCognitivePipeline", "EngineeringMemory"];
const PIPELINE_NAMES  = ["LiveCognitivePipeline", "ConversationCognitiveGateway", "CognitivePipelineAdapter", "PrimaryConversationRouter"];
const CONNECTOR_NAMES = ["GitHubConnector", "Base44Connector", "ConnectorInvocationService", "ConnectorRuntime"];
const PROTECTED_SET   = new Set(PROTECTED_COMPONENTS);

function scoreToLevel(score: number): RiskLevel {
  if (score >= 80) return "CRITICAL";
  if (score >= 55) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

export class ChangeImpactAnalyzer {
  analyze(objective: string, targetComponents: string[]): ChangeImpact {
    const lower = objective.toLowerCase();
    const all   = [...targetComponents, ...this._inferFromObjective(lower)];
    const unique = [...new Set(all)];

    const protectedFilesHit   = unique.filter(c => PROTECTED_SET.has(c));
    const singletonsTouched   = unique.filter(c => SINGLETON_NAMES.includes(c));
    const pipelinesTouched    = unique.filter(c => PIPELINE_NAMES.includes(c));
    const connectorsModified  = unique.filter(c => CONNECTOR_NAMES.includes(c));

    // KG-backed module detection
    const modulesModified: string[] = [];
    if (KnowledgeGraphStore.isReady()) {
      for (const comp of unique) {
        const r = KnowledgeGraphStore.query(comp, "ChangeImpactAnalyzer");
        if (r.found && r.entity) {
          const mod = r.entity.filePath.split("/").slice(0, 3).join("/");
          if (!modulesModified.includes(mod)) modulesModified.push(mod);
        }
      }
    }

    // Risk score
    let score = 0;
    score += protectedFilesHit.length  * 20;
    score += singletonsTouched.length  * 15;
    score += pipelinesTouched.length   * 10;
    score += connectorsModified.length * 8;
    if (/rewrite|replace|delete|remove/i.test(objective)) score += 25;
    if (/connector|oauth|authentication/i.test(objective)) score += 10;
    score = Math.min(100, score);

    const kgImpact = KnowledgeGraphStore.isReady()
      ? `${protectedFilesHit.length} protected KG entities in scope`
      : "KG not built — impact cannot be fully measured";

    const engineeringMemoryImpact = unique.length > 3
      ? "Multiple components modified — engineering memory will be updated"
      : "Minimal memory footprint expected";

    return {
      filesModified:          unique,
      protectedFilesHit,
      modulesModified,
      connectorsModified,
      singletonsTouched,
      pipelinesTouched,
      kgImpact,
      engineeringMemoryImpact,
      riskScore:              score,
      riskLevel:              scoreToLevel(score),
    };
  }

  private _inferFromObjective(lower: string): string[] {
    const inferred: string[] = [];
    if (lower.includes("pipeline"))    inferred.push("LiveCognitivePipeline");
    if (lower.includes("gateway"))     inferred.push("ConversationCognitiveGateway");
    if (lower.includes("knowledge"))   inferred.push("KnowledgeGraphStore");
    if (lower.includes("github"))      inferred.push("GitHubConnector");
    if (lower.includes("base44"))      inferred.push("Base44Connector");
    if (lower.includes("connector"))   inferred.push("ConnectorInvocationService");
    if (lower.includes("regression"))  inferred.push("RegressionShield");
    if (lower.includes("workflow"))    inferred.push("EngineeringWorkflow");
    if (lower.includes("orchestrator")) inferred.push("EngineeringOrchestrator");
    return inferred;
  }
}