// ComplexityAnalyzer.ts — Sprint EF-39.6 — SRP: ranks by complexity only
import type { ComplexityMetric } from "../../auditor/ASTAuditor";

export const ComplexityAnalyzer = Object.freeze({
  topN(metrics: readonly ComplexityMetric[], n = 10): readonly ComplexityMetric[] {
    return Object.freeze(
      [...metrics].sort((a, b) => b.cyclomaticScore - a.cyclomaticScore).slice(0, n)
    );
  },
});