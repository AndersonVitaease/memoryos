/**
 * ReasoningReviewer.ts — Sprint EF-54
 *
 * SRP: avaliar consistência, profundidade, completude, saltos lógicos
 * e circularidades do processo de raciocínio.
 */

import type { ReasoningReview } from "./MCTypes";
import type { ThoughtSnapshot } from "./ThoughtAnalyzer";

export class ReasoningReviewer {
  review(snap: ThoughtSnapshot): ReasoningReview {
    const issues: string[] = [];

    // Logical leaps: inference steps not backed by enough rules
    const logicalLeaps = snap.inferenceDepth > 0 && snap.knowledgeRules < snap.inferenceDepth
      ? snap.inferenceDepth - snap.knowledgeRules
      : 0;
    if (logicalLeaps > 0) issues.push(`${logicalLeaps} inference step(s) may lack direct rule support`);

    // Circularities: proxy — many conflicts with low rule count
    const circularities = snap.conflictCount > 0 && snap.knowledgeRules <= 2 ? 1 : 0;
    if (circularities > 0) issues.push("Possible circular reasoning — conflicts with very few supporting rules");

    // Repetitions: high depth with few rules → same rules reused
    const repetitions = snap.inferenceDepth > 3 && snap.knowledgeRules <= 2 ? snap.inferenceDepth - snap.knowledgeRules : 0;
    if (repetitions > 0) issues.push(`${repetitions} inference step(s) may repeat the same knowledge`);

    // Completeness: did we use all available context?
    const completeness = Math.min(
      (snap.knowledgeRules / 5) * 0.4 +
      (snap.capabilities.length > 0 ? 0.3 : 0) +
      (snap.connectors.length > 0 ? 0.3 : 0),
      1,
    );
    if (completeness < 0.5) issues.push("Incomplete reasoning — not all available context was used");

    // Consistency: confidence is internally consistent
    const consistency = Math.max(0, 1 - Math.abs(snap.inferenceConf - snap.confidence));
    if (consistency < 0.7) issues.push(`Confidence inconsistency between episode (${(snap.confidence * 100).toFixed(0)}%) and inference (${(snap.inferenceConf * 100).toFixed(0)}%)`);

    // Overall quality
    const overallQuality = Math.max(0,
      (completeness * 0.30) +
      (consistency * 0.25) +
      (snap.inferenceDepth > 0 ? 0.20 : 0) +
      (snap.knowledgeRules > 2 ? 0.15 : 0) +
      (snap.conflictCount === 0 ? 0.10 : Math.max(0, 0.10 - snap.conflictCount * 0.02))
    );

    return Object.freeze({
      depth: snap.inferenceDepth,
      completeness,
      consistency,
      logicalLeaps,
      circularities,
      repetitions,
      overallQuality,
      issues: Object.freeze(issues),
    });
  }
}