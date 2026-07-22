/**
 * ConsistencyChecker.ts — Sprint EF-54
 *
 * SRP: verificar decisões contraditórias, mudanças de estratégia sem justificativa,
 * authority inconsistente e reasoning conflitante.
 */

import type { ConsistencyIssue, ConsistencyIssueKind, CognitiveStage } from "./MCTypes";
import { makeMCId } from "./MCTypes";
import type { ThoughtSnapshot } from "./ThoughtAnalyzer";

function issue(
  kind: ConsistencyIssueKind,
  description: string,
  severity: ConsistencyIssue["severity"],
  evidence: string[],
  stageA: CognitiveStage,
  stageB: CognitiveStage,
): ConsistencyIssue {
  return Object.freeze({
    id: makeMCId("ci"), kind, description, severity,
    evidence: Object.freeze(evidence),
    stageA, stageB,
  });
}

export class ConsistencyChecker {
  check(snap: ThoughtSnapshot): readonly ConsistencyIssue[] {
    const issues: ConsistencyIssue[] = [];

    // Authority inconsistency: authority >> confidence at decision stage
    if (Math.abs(snap.authority - snap.decisionAuth) > 0.30) {
      issues.push(issue(
        "authority_inconsistency",
        `Episode authority (${(snap.authority * 100).toFixed(1)}%) diverges significantly from decision authority (${(snap.decisionAuth * 100).toFixed(1)}%).`,
        "medium",
        [`episode_authority=${(snap.authority * 100).toFixed(1)}%`, `decision_authority=${(snap.decisionAuth * 100).toFixed(1)}%`],
        "knowledge", "decision",
      ));
    }

    // Confidence at inference vs decision: large drift
    if (Math.abs(snap.inferenceConf - snap.decisionConf) > 0.25) {
      issues.push(issue(
        "reasoning_inconsistency",
        `Inference confidence (${(snap.inferenceConf * 100).toFixed(1)}%) and decision confidence (${(snap.decisionConf * 100).toFixed(1)}%) diverge by >${((Math.abs(snap.inferenceConf - snap.decisionConf)) * 100).toFixed(0)}pp.`,
        "high",
        [`inference_conf=${(snap.inferenceConf * 100).toFixed(1)}%`, `decision_conf=${(snap.decisionConf * 100).toFixed(1)}%`],
        "inference", "decision",
      ));
    }

    // Contradictory decision: high confidence but execution failure
    if (snap.decisionConf > 0.80 && !snap.success) {
      issues.push(issue(
        "contradictory_decision",
        `Decision made with ${(snap.decisionConf * 100).toFixed(1)}% confidence but execution failed — confidence did not reflect actual risk.`,
        "critical",
        [`decision_conf=${(snap.decisionConf * 100).toFixed(1)}%`, `success=false`],
        "decision", "execution",
      ));
    }

    // Unjustified strategy: unknown strategy used despite knowledge available
    if ((snap.strategy === "unknown" || !snap.strategy) && snap.knowledgeRules > 0) {
      issues.push(issue(
        "unjustified_strategy_change",
        "Strategy is unknown despite knowledge rules being available — planning may not have consulted the knowledge base.",
        "medium",
        [`strategy=${snap.strategy}`, `knowledge_rules=${snap.knowledgeRules}`],
        "planner", "strategy",
      ));
    }

    // Knowledge conflict: many conflicts with high confidence decision
    if (snap.conflictCount > 3 && snap.decisionConf > 0.75) {
      issues.push(issue(
        "knowledge_conflict",
        `${snap.conflictCount} knowledge conflicts present but decision was made with ${(snap.decisionConf * 100).toFixed(1)}% confidence — conflicts may have been under-weighted.`,
        "high",
        [`conflict_count=${snap.conflictCount}`, `decision_conf=${(snap.decisionConf * 100).toFixed(1)}%`],
        "knowledge", "decision",
      ));
    }

    // Reasoning: deep inference with no knowledge
    if (snap.inferenceDepth > 3 && snap.knowledgeRules === 0) {
      issues.push(issue(
        "reasoning_inconsistency",
        "Inference chain has depth > 3 but no knowledge rules were retrieved — reasoning lacks factual grounding.",
        "critical",
        [`inference_depth=${snap.inferenceDepth}`, `knowledge_rules=0`],
        "inference", "knowledge",
      ));
    }

    return Object.freeze(issues);
  }
}