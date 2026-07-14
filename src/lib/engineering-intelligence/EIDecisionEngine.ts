/**
 * EIDecisionEngine.ts — Sprint 6.2.1
 * Chooses exactly ONE implementation strategy. Never generates multiple conflicting plans.
 */

import type { StrategyDecision, ImplementationStrategy, RiskReport, ReuseResult, ConfidenceResult } from "./EITypes";

export class EIDecisionEngine {
  decide(
    reuse: ReuseResult,
    risk: RiskReport,
    confidence: ConfidenceResult,
    objective: string,
  ): StrategyDecision {
    const t0 = Date.now();
    const lower = objective.toLowerCase();

    // Collect candidate strategies with rationale
    const candidates: Array<{ strategy: ImplementationStrategy; score: number; reason: string }> = [];

    // REJECT — destructive + CRITICAL risk
    if (risk.overallRisk === "CRITICAL") {
      candidates.push({ strategy: "REJECT", score: 90,
        reason: "CRITICAL risk detected — requires explicit architectural decision before proceeding" });
    }

    // ASK_APPROVAL — touches stable baseline
    const touchesStable = risk.factors.some(f => f.category === "ARCHITECTURE" && f.level === "HIGH");
    if (touchesStable) {
      candidates.push({ strategy: "ASK_APPROVAL", score: 80,
        reason: "Stable baseline component affected — explicit architect approval required" });
    }

    // REUSE — found exact match
    if (reuse.decision === "REUSE" && reuse.found.length > 0) {
      candidates.push({ strategy: "REUSE", score: 95,
        reason: `Existing implementation found: ${reuse.found.slice(0, 2).join(", ")}` });
    }

    // EXTEND — partial match
    if (reuse.decision === "EXTEND" && reuse.partial.length > 0) {
      candidates.push({ strategy: "EXTEND", score: 75,
        reason: `Partial implementation found: ${reuse.partial.slice(0, 2).join(", ")}` });
    }

    // REFACTOR — explicitly requested
    if (/refactor|rewrite|migrate/i.test(lower)) {
      candidates.push({ strategy: "REFACTOR", score: 70, reason: "Objective explicitly requests refactoring" });
    }

    // CREATE — default
    if (reuse.decision === "CREATE_NEW") {
      candidates.push({ strategy: "CREATE", score: 60, reason: "No existing implementation found — safe to create new" });
    }

    // Pick the highest-scoring candidate
    candidates.sort((a, b) => b.score - a.score);
    const chosen = candidates[0] ?? { strategy: "CREATE" as ImplementationStrategy, score: 50, reason: "Default — create new" };

    const alternatives = candidates.slice(1).map(c => ({ strategy: c.strategy, reason: c.reason }));

    return {
      strategy:     chosen.strategy,
      rationale:    chosen.reason,
      alternatives,
      confidence:   confidence.score,
      durationMs:   Date.now() - t0,
    };
  }
}