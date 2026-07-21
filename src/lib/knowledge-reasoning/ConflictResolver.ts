/**
 * ConflictResolver.ts — Sprint EF-52
 *
 * SRP: detectar conflitos entre RetrievedRules e resolvê-los deterministicamente.
 *
 * Resolução usa: Authority → Confidence → Success Rate → Recency → Evidence.
 * Determinístico: mesmas entradas → mesma saída sempre.
 */

import type { RetrievedRule, RuleMatch, Conflict, ConflictResolution } from "./KRTypes";
import { makeKRId } from "./KRTypes";

function detectSeverity(a: RetrievedRule, b: RetrievedRule): Conflict["severity"] {
  const authDiff = Math.abs(a.authority - b.authority);
  const confDiff = Math.abs(a.confidence - b.confidence);
  if (authDiff > 0.5 || confDiff > 0.5) return "high";
  if (authDiff > 0.3 || confDiff > 0.3) return "medium";
  return "low";
}

function conflictType(match: RuleMatch): Conflict["conflictType"] {
  if (match.sharedEvidence.some(e => e.includes("strateg")))  return "strategy_conflict";
  if (match.sharedEvidence.some(e => e.includes("cap")))      return "capability_conflict";
  if (match.sharedEvidence.some(e => e.includes("author")))   return "authority_conflict";
  return "goal_conflict";
}

function resolveMethod(
  a: RetrievedRule,
  b: RetrievedRule,
): { method: ConflictResolution["method"]; winnerId: string; loserId: string; winnerScore: number; loserScore: number; rationale: string } {
  // 1. Authority
  if (Math.abs(a.authority - b.authority) > 0.05) {
    const [win, lose] = a.authority >= b.authority ? [a, b] : [b, a];
    return { method: "authority", winnerId: win.ruleId, loserId: lose.ruleId,
      winnerScore: win.authority, loserScore: lose.authority,
      rationale: `"${win.title}" wins by higher authority (${(win.authority * 100).toFixed(1)}% vs ${(lose.authority * 100).toFixed(1)}%).` };
  }
  // 2. Confidence
  if (Math.abs(a.confidence - b.confidence) > 0.05) {
    const [win, lose] = a.confidence >= b.confidence ? [a, b] : [b, a];
    return { method: "confidence", winnerId: win.ruleId, loserId: lose.ruleId,
      winnerScore: win.confidence, loserScore: lose.confidence,
      rationale: `"${win.title}" wins by higher confidence (${(win.confidence * 100).toFixed(1)}% vs ${(lose.confidence * 100).toFixed(1)}%).` };
  }
  // 3. Success Rate
  if (Math.abs(a.successRate - b.successRate) > 0.05) {
    const [win, lose] = a.successRate >= b.successRate ? [a, b] : [b, a];
    return { method: "success_rate", winnerId: win.ruleId, loserId: lose.ruleId,
      winnerScore: win.successRate, loserScore: lose.successRate,
      rationale: `"${win.title}" wins by higher success rate (${(win.successRate * 100).toFixed(1)}%).` };
  }
  // 4. Recency
  const [win, lose] = a.recencyScore >= b.recencyScore ? [a, b] : [b, a];
  return { method: "recency", winnerId: win.ruleId, loserId: lose.ruleId,
    winnerScore: win.recencyScore, loserScore: lose.recencyScore,
    rationale: `"${win.title}" wins by recency (more recently updated).` };
}

export class ConflictResolver {
  /**
   * Detect conflicts from contradiction/weakens matches, then resolve each one
   * using a deterministic priority chain.
   */
  resolve(
    rules:   readonly RetrievedRule[],
    matches: readonly RuleMatch[],
  ): { conflicts: readonly Conflict[]; resolutions: readonly ConflictResolution[] } {
    const ruleMap = new Map(rules.map(r => [r.ruleId, r]));
    const conflicts: Conflict[] = [];
    const resolutions: ConflictResolution[] = [];

    const conflictMatches = matches.filter(m => m.relation === "contradicts" || m.relation === "weakens");

    for (const match of conflictMatches) {
      const rA = ruleMap.get(match.ruleAId);
      const rB = ruleMap.get(match.ruleBId);
      if (!rA || !rB) continue;

      const conflict: Conflict = Object.freeze({
        id:            makeKRId("conflict"),
        detectedAt:    Date.now(),
        ruleAId:       rA.ruleId,
        ruleBId:       rB.ruleId,
        ruleATitle:    rA.title,
        ruleBTitle:    rB.title,
        conflictType:  conflictType(match),
        description:   match.explanation,
        severity:      detectSeverity(rA, rB),
      });
      conflicts.push(conflict);

      const t0   = Date.now();
      const res  = resolveMethod(rA, rB);
      const resolution: ConflictResolution = Object.freeze({
        conflictId:         conflict.id,
        resolvedAt:         Date.now(),
        winnerId:           res.winnerId,
        loserId:            res.loserId,
        method:             res.method,
        rationale:          res.rationale,
        winnerScore:        res.winnerScore,
        loserScore:         res.loserScore,
        durationMs:         Date.now() - t0,
      });
      resolutions.push(resolution);
    }

    return {
      conflicts:   Object.freeze(conflicts),
      resolutions: Object.freeze(resolutions),
    };
  }

  /** Return the set of ruleIds that lost all their conflicts (to exclude from decision). */
  losers(resolutions: readonly ConflictResolution[]): Set<string> {
    return new Set(resolutions.map(r => r.loserId));
  }
}