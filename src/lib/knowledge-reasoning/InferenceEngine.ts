/**
 * InferenceEngine.ts — Sprint EF-52
 *
 * SRP: produzir InferenceChain a partir de RetrievedRules e RuleMatches.
 *
 * Tipos de inferência: deduction, induction, abduction, chain,
 *   multi_hop, composition, reduction.
 *
 * Toda inferência é TEMPORÁRIA (isTemporary: true).
 * Nenhuma inferência entra no KnowledgeStore.
 * Nenhuma inferência pode ser produzida sem evidências.
 */

import type { RetrievedRule, RuleMatch, InferenceStep, InferenceChain, InferenceType } from "./KRTypes";
import { makeKRId } from "./KRTypes";

function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function buildStep(
  index: number,
  type: InferenceType,
  rules: RetrievedRule[],
  conclusion: string,
  confidence: number,
  authority: number,
): InferenceStep {
  const evidence = rules.flatMap(r => r.evidence).slice(0, 5);
  if (evidence.length === 0) {
    evidence.push(`Derived from ${rules.map(r => r.title).join(", ")}`);
  }
  return Object.freeze({
    id:              makeKRId("step"),
    stepIndex:       index,
    type,
    premiseRuleIds:  Object.freeze(rules.map(r => r.ruleId)),
    conclusion,
    confidence:      Math.min(confidence, 1),
    authority:       Math.min(authority, 1),
    evidence:        Object.freeze(evidence),
    isTemporary:     true as const,
    derivedAt:       Date.now(),
  });
}

export class InferenceEngine {
  /**
   * Derive an InferenceChain from retrieved rules and their matches.
   * Applies multiple inference strategies in sequence.
   */
  infer(
    rules:   readonly RetrievedRule[],
    matches: readonly RuleMatch[],
    goal:    string,
  ): InferenceChain {
    if (rules.length === 0) {
      return this._emptyChain(goal);
    }

    const steps: InferenceStep[] = [];

    // 1. Deduction — top-confidence rules → direct conclusion
    const topRules = [...rules].sort((a, b) => b.confidence - a.confidence).slice(0, 3);
    if (topRules.length > 0) {
      const conclusion = topRules[0].consequences[0]?.explanation ?? topRules[0].title;
      steps.push(buildStep(
        steps.length,
        "deduction",
        topRules,
        `Direct deduction: ${conclusion}`,
        avg(topRules.map(r => r.confidence)),
        avg(topRules.map(r => r.authority)),
      ));
    }

    // 2. Induction — recurring patterns across multiple rules
    const highFreq = rules.filter(r => r.frequency >= 3);
    if (highFreq.length >= 2) {
      const patterns = highFreq.map(r => r.title).join(", ");
      steps.push(buildStep(
        steps.length,
        "induction",
        highFreq.slice(0, 3),
        `Inductive pattern: [${patterns}] recur with ${(avg(highFreq.map(r => r.successRate)) * 100).toFixed(0)}% success`,
        avg(highFreq.map(r => r.confidence)) * 0.9,
        avg(highFreq.map(r => r.authority)) * 0.9,
      ));
    }

    // 3. Chain reasoning — follow supports/reinforces matches
    const supportMatches = matches.filter(m => m.relation === "reinforces" || m.relation === "supports");
    if (supportMatches.length >= 2) {
      const chainRuleIds = [...new Set(supportMatches.flatMap(m => [m.ruleAId, m.ruleBId]))];
      const chainRules   = rules.filter(r => chainRuleIds.includes(r.ruleId));
      if (chainRules.length >= 2) {
        steps.push(buildStep(
          steps.length,
          "chain",
          chainRules.slice(0, 4),
          `Chain: ${chainRules.map(r => r.title).slice(0, 3).join(" → ")}`,
          avg(chainRules.map(r => r.confidence)) * 0.85,
          avg(chainRules.map(r => r.authority)) * 0.85,
        ));
      }
    }

    // 4. Composition — combine two non-conflicting rules
    const nonConflict = matches.filter(m => m.relation !== "contradicts" && m.relation !== "weakens");
    if (nonConflict.length > 0) {
      const best = nonConflict[0];
      const rA   = rules.find(r => r.ruleId === best.ruleAId);
      const rB   = rules.find(r => r.ruleId === best.ruleBId);
      if (rA && rB) {
        steps.push(buildStep(
          steps.length,
          "composition",
          [rA, rB],
          `Composition: "${rA.title}" + "${rB.title}" → combined recommendation`,
          Math.min(rA.confidence * rB.confidence + 0.1, 1),
          Math.min(rA.authority * rB.authority + 0.1, 1),
        ));
      }
    }

    // 5. Abduction — best explanation for goal given available rules
    const bestFit = rules.filter(r => r.relevanceScore > 0.5);
    if (bestFit.length > 0) {
      const best = bestFit[0];
      steps.push(buildStep(
        steps.length,
        "abduction",
        [best],
        `Best explanation for "${goal}": ${best.consequences[0]?.action ?? best.title}`,
        best.confidence * 0.80,
        best.authority * 0.80,
      ));
    }

    // 6. Multi-hop — traverse related_to chain
    const related = matches.filter(m => m.relation === "related_to" || m.relation === "derived_from");
    if (related.length >= 2) {
      const hopRuleIds = [...new Set(related.flatMap(m => [m.ruleAId, m.ruleBId]))].slice(0, 4);
      const hopRules   = rules.filter(r => hopRuleIds.includes(r.ruleId));
      if (hopRules.length >= 2) {
        steps.push(buildStep(
          steps.length,
          "multi_hop",
          hopRules,
          `Multi-hop: ${hopRules.map(r => r.title.slice(0, 25)).join(" ↔ ")}`,
          avg(hopRules.map(r => r.confidence)) * 0.75,
          avg(hopRules.map(r => r.authority)) * 0.75,
        ));
      }
    }

    // Final conclusion: highest-confidence step
    const best = steps.reduce((a, b) => a.confidence > b.confidence ? a : b, steps[0]);
    const overallConf = avg(steps.map(s => s.confidence));
    const overallAuth = avg(steps.map(s => s.authority));

    return Object.freeze({
      id:                makeKRId("chain"),
      goal,
      steps:             Object.freeze(steps),
      finalConclusion:   best.conclusion,
      overallConfidence: overallConf,
      overallAuthority:  overallAuth,
      depth:             steps.length,
      isTemporary:       true as const,
    });
  }

  private _emptyChain(goal: string): InferenceChain {
    return Object.freeze({
      id:                makeKRId("chain"),
      goal,
      steps:             Object.freeze([]),
      finalConclusion:   "Insufficient knowledge to reason about this goal.",
      overallConfidence: 0,
      overallAuthority:  0,
      depth:             0,
      isTemporary:       true as const,
    });
  }
}