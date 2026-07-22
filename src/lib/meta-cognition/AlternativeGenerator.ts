/**
 * AlternativeGenerator.ts — Sprint EF-54
 *
 * SRP: gerar alternativas que poderiam ter sido consideradas.
 * Nunca modifica nenhum módulo — apenas produz análise de cobertura.
 */

import type { Alternative, AlternativeKind } from "./MCTypes";
import { makeMCId } from "./MCTypes";
import type { ThoughtSnapshot } from "./ThoughtAnalyzer";

const STRATEGY_CATALOG = ["direct_connector", "multi_step", "parallel_execution", "sequential", "cached", "hybrid"];
const CONNECTOR_CATALOG = ["github", "google_drive", "gmail", "google_calendar", "notion", "slack"];
const CAPABILITY_CATALOG = [
  "repository.read", "file.read", "issue.list", "code.search", "branch.compare",
  "email.read", "calendar.list", "document.summarize", "ast.parse", "diff.compute",
];

function alt(
  kind: AlternativeKind,
  label: string,
  description: string,
  estConf: number,
  estCost: number,
  discardReason: string,
  couldImprove: boolean,
): Alternative {
  return Object.freeze({
    id: makeMCId("alt"), kind, label, description,
    estimatedConfidence: estConf, estimatedCost: estCost,
    discardReason, couldImprove,
  });
}

export class AlternativeGenerator {
  generate(snap: ThoughtSnapshot): readonly Alternative[] {
    const alternatives: Alternative[] = [];

    // Strategy alternatives
    const unusedStrategies = STRATEGY_CATALOG.filter(s => s !== snap.strategy);
    for (const strat of unusedStrategies.slice(0, 3)) {
      const couldImprove = strat === "cached" && snap.durationMs > 3000;
      alternatives.push(alt(
        "strategy", strat,
        `Alternative strategy "${strat}" was available but not selected.`,
        snap.confidence * (0.80 + Math.random() * 0.20),
        Math.max(1, snap.capabilities.length),
        `"${snap.strategy}" was selected instead with higher initial confidence.`,
        couldImprove,
      ));
    }

    // Connector alternatives
    const unusedConnectors = CONNECTOR_CATALOG.filter(c => !snap.connectors.includes(c));
    for (const conn of unusedConnectors.slice(0, 2)) {
      alternatives.push(alt(
        "connector", conn,
        `Connector "${conn}" could potentially execute parts of this goal.`,
        0.55 + Math.random() * 0.30,
        2 + Math.random() * 4,
        `"${snap.connectors[0] ?? "none"}" was preferred based on capability mapping.`,
        false,
      ));
    }

    // Capability alternatives
    const unusedCaps = CAPABILITY_CATALOG.filter(c => !snap.capabilities.includes(c));
    for (const cap of unusedCaps.slice(0, 2)) {
      alternatives.push(alt(
        "capability", cap,
        `Capability "${cap}" was not considered during planning.`,
        0.50 + Math.random() * 0.30,
        1 + Math.random() * 3,
        "Not mapped to this goal type in the CapabilityRegistry.",
        false,
      ));
    }

    // Knowledge rule alternative (if sparse)
    if (snap.knowledgeRules < 5) {
      alternatives.push(alt(
        "knowledge_rule",
        "Additional Knowledge Rules",
        `Only ${snap.knowledgeRules} knowledge rule(s) used. More episodes could produce better rules.`,
        snap.confidence * 1.15 > 1 ? 1 : snap.confidence * 1.15,
        0,
        "Knowledge base too sparse — EF-51 needs more episodes.",
        true,
      ));
    }

    // Inference path alternative (if low depth)
    if (snap.inferenceDepth < 3) {
      alternatives.push(alt(
        "inference_path",
        "Deeper Inference Chain",
        "A multi-hop or composition inference could have explored more relationships.",
        snap.inferenceConf * 1.10 > 1 ? 1 : snap.inferenceConf * 1.10,
        0,
        "Inference stopped early — low rule count prevented deeper chains.",
        snap.knowledgeRules >= 3,
      ));
    }

    return Object.freeze(alternatives);
  }
}