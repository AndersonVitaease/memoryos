/**
 * BiasDetector.ts — Sprint EF-54
 *
 * SRP: detectar vieses cognitivos na execução do pipeline.
 * Nunca modifica comportamento — apenas observa e reporta.
 */

import type { DetectedBias, BiasType, CognitiveStage } from "./MCTypes";
import { makeMCId } from "./MCTypes";
import type { ThoughtSnapshot } from "./ThoughtAnalyzer";

function bias(
  type: BiasType,
  title: string,
  description: string,
  severity: DetectedBias["severity"],
  evidence: string[],
  stages: CognitiveStage[],
  magnitude: number,
): DetectedBias {
  return Object.freeze({
    id: makeMCId("bias"), detectedAt: Date.now(),
    type, title, description, severity,
    evidence: Object.freeze(evidence),
    affectedStages: Object.freeze(stages),
    magnitude: Math.min(magnitude, 1),
  });
}

export class BiasDetector {
  detect(snap: ThoughtSnapshot): readonly DetectedBias[] {
    const biases: DetectedBias[] = [];

    // Overconfidence: confidence >> success
    const confSuccessGap = snap.confidence - (snap.success ? 1 : 0);
    if (confSuccessGap > 0.30) {
      biases.push(bias(
        "overconfidence",
        "Overconfidence Bias",
        `System predicted ${(snap.confidence * 100).toFixed(1)}% confidence but execution ${snap.success ? "succeeded" : "failed"}.`,
        confSuccessGap > 0.50 ? "critical" : "high",
        [`confidence=${(snap.confidence * 100).toFixed(1)}%`, `success=${snap.success}`],
        ["decision", "execution"],
        confSuccessGap,
      ));
    }

    // Underconfidence: confidence << success
    if (!snap.success && snap.confidence < 0.40) {
      biases.push(bias(
        "overconfidence",
        "Underconfidence (Negative Overconfidence)",
        `Very low confidence (${(snap.confidence * 100).toFixed(1)}%) with system still attempting execution.`,
        "medium",
        [`confidence=${(snap.confidence * 100).toFixed(1)}%`],
        ["decision"],
        0.4 - snap.confidence,
      ));
    }

    // Authority bias: authority >> confidence
    const authConfGap = snap.authority - snap.confidence;
    if (authConfGap > 0.30) {
      biases.push(bias(
        "authority_bias",
        "Authority Bias",
        `Authority (${(snap.authority * 100).toFixed(1)}%) significantly exceeds confidence (${(snap.confidence * 100).toFixed(1)}%) — decisions may over-weight authority.`,
        "medium",
        [`authority=${(snap.authority * 100).toFixed(1)}%`, `confidence=${(snap.confidence * 100).toFixed(1)}%`],
        ["knowledge", "decision"],
        authConfGap,
      ));
    }

    // Recency bias: very few knowledge rules (relies on recent, sparse data)
    if (snap.knowledgeRules <= 2 && snap.inferenceDepth > 0) {
      biases.push(bias(
        "recency_bias",
        "Recency Bias",
        `Only ${snap.knowledgeRules} knowledge rule(s) used — system may rely too heavily on recent, unvalidated patterns.`,
        "high",
        [`knowledge_rules=${snap.knowledgeRules}`, `inference_depth=${snap.inferenceDepth}`],
        ["knowledge", "inference"],
        Math.min(1 - snap.knowledgeRules / 5, 1),
      ));
    }

    // Connector bias: single connector dominance
    if (snap.connectors.length === 1) {
      biases.push(bias(
        "connector_bias",
        "Connector Monoculture",
        `Only one connector used ("${snap.connectors[0]}") — may miss better alternatives.`,
        "low",
        [`connector=${snap.connectors[0]}`],
        ["capability", "execution"],
        0.25,
      ));
    }

    // Strategy bias: unknown strategy
    if (!snap.strategy || snap.strategy === "unknown") {
      biases.push(bias(
        "strategy_bias",
        "Strategy Selection Gap",
        "No clear strategy identified — execution proceeded without explicit strategic alignment.",
        "medium",
        [`strategy=${snap.strategy}`],
        ["strategy", "planner"],
        0.50,
      ));
    }

    // Capability bias: no capabilities (all knowledge-based, no connectors)
    if (snap.capabilities.length === 0 && snap.connectors.length > 0) {
      biases.push(bias(
        "capability_bias",
        "Capability Coverage Gap",
        "Connectors used without corresponding capability declarations.",
        "low",
        [`capabilities=0`, `connectors=${snap.connectors.length}`],
        ["capability"],
        0.20,
      ));
    }

    // Knowledge bias: very deep inference with few rules (over-inferring)
    if (snap.knowledgeRules < 3 && snap.inferenceDepth > 3) {
      biases.push(bias(
        "knowledge_bias",
        "Inference Overreach",
        `${snap.inferenceDepth} inference steps derived from only ${snap.knowledgeRules} rules — high risk of unsupported conclusions.`,
        "high",
        [`inference_depth=${snap.inferenceDepth}`, `knowledge_rules=${snap.knowledgeRules}`],
        ["knowledge", "inference", "decision"],
        Math.min(snap.inferenceDepth / (snap.knowledgeRules + 1) * 0.2, 1),
      ));
    }

    // Confirmation bias: no conflicts despite multiple rules
    if (snap.knowledgeRules >= 4 && snap.conflictCount === 0 && snap.inferenceDepth > 2) {
      biases.push(bias(
        "confirmation_bias",
        "Potential Confirmation Bias",
        "Multiple knowledge rules used with zero conflicts — system may be selecting only confirming evidence.",
        "medium",
        [`rules=${snap.knowledgeRules}`, `conflicts=0`, `inference_depth=${snap.inferenceDepth}`],
        ["knowledge", "inference"],
        0.30,
      ));
    }

    return Object.freeze(biases);
  }
}