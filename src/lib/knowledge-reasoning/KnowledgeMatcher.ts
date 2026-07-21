/**
 * KnowledgeMatcher.ts — Sprint EF-52
 *
 * SRP: encontrar relações entre RetrievedRules.
 * Produz RuleMatch[] descrevendo conexões semânticas.
 *
 * NÃO modifica regras.
 * NÃO persiste resultados.
 */

import type { RetrievedRule, RuleMatch, MatchRelation } from "./KRTypes";
import { makeKRId } from "./KRTypes";

function sharedTokens(a: string, b: string): string[] {
  const ta = new Set(a.toLowerCase().split(/[\s_|:]/));
  const tb = new Set(b.toLowerCase().split(/[\s_|:]/));
  return [...ta].filter(t => t.length > 2 && tb.has(t));
}

function detectRelation(
  a: RetrievedRule,
  b: RetrievedRule,
  shared: string[],
): { relation: MatchRelation; strength: number; explanation: string } | null {
  const scoreA = a.confidence * a.authority * a.successRate;
  const scoreB = b.confidence * b.authority * b.successRate;

  if (shared.length === 0) return null;

  const strength = Math.min(shared.length / 5, 1) *
    ((a.relevanceScore + b.relevanceScore) / 2);

  if (strength < 0.05) return null;

  // Contradiction: one prioritizes, other deprioritizes same target
  const aActions = a.consequences.map(c => c.action);
  const bActions = b.consequences.map(c => c.action);
  if (aActions.includes("prioritize") && bActions.includes("deprioritize")) {
    return { relation: "contradicts", strength, explanation: `Rule "${a.title}" prioritizes while "${b.title}" deprioritizes shared targets.` };
  }
  if (aActions.includes("deprioritize") && bActions.includes("prioritize")) {
    return { relation: "contradicts", strength, explanation: `Rule "${b.title}" prioritizes while "${a.title}" deprioritizes shared targets.` };
  }

  // Derived: high overlap + A has higher authority
  if (shared.length >= 3 && scoreA > scoreB * 1.2) {
    return { relation: "derived_from", strength, explanation: `"${b.title}" may be derived from "${a.title}" (${shared.length} shared tokens, higher authority).` };
  }

  // Reinforces: both are success patterns
  if (a.successRate > 0.7 && b.successRate > 0.7) {
    return { relation: "reinforces", strength, explanation: `Both rules reinforce similar goals with high success rates (${(a.successRate * 100).toFixed(0)}% / ${(b.successRate * 100).toFixed(0)}%).` };
  }

  // Weakens: one has poor successRate compared to other
  if (a.successRate > 0.7 && b.successRate < 0.4) {
    return { relation: "weakens", strength, explanation: `"${b.title}" weakens "${a.title}" by demonstrating failure in shared context.` };
  }

  // Requires: one capability leads to another
  if (shared.length >= 2) {
    return { relation: "related_to", strength, explanation: `"${a.title}" and "${b.title}" share context: ${shared.slice(0, 3).join(", ")}.` };
  }

  return null;
}

export class KnowledgeMatcher {
  /**
   * Find all relationships between retrieved rules.
   * Compares every pair — O(n²) but n is small (≤20 from retriever).
   */
  match(rules: readonly RetrievedRule[]): readonly RuleMatch[] {
    const matches: RuleMatch[] = [];

    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const a = rules[i];
        const b = rules[j];

        const shared = [
          ...sharedTokens(a.title, b.title),
          ...sharedTokens(a.evidence.join(" "), b.evidence.join(" ")),
        ];
        const unique = [...new Set(shared)];

        const rel = detectRelation(a, b, unique);
        if (!rel) continue;

        matches.push(Object.freeze({
          id:             makeKRId("match"),
          ruleAId:        a.ruleId,
          ruleBId:        b.ruleId,
          relation:       rel.relation,
          strength:       rel.strength,
          explanation:    rel.explanation,
          sharedEvidence: Object.freeze(unique.slice(0, 5)),
        }));
      }
    }

    return matches.sort((a, b) => b.strength - a.strength);
  }
}