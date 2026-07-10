// ─── Fusion Score Engine ───────────────────────────────────────────────────────
// Foundation v1.0 · 7 auditable dimensions

import type { SpecialistStrategy, StrategyConflict, FusionScores, ScoreExplanation } from "./SFETypes";

function clamp(v: number) { return Math.min(100, Math.max(0, Math.round(v))); }

export function calculateFusionScores(
  strategies: SpecialistStrategy[],
  conflicts:  StrategyConflict[],
  goalDomains: string[],
): { scores: FusionScores; explanations: ScoreExplanation[] } {
  const expl: ScoreExplanation[] = [];
  const n = strategies.length || 1;

  // Consensus Score — higher when fewer conflicts relative to strategy pairs
  const pairs    = n * (n - 1) / 2 || 1;
  const confRate = Math.min(1, conflicts.length / pairs);
  const consensusScore = clamp((1 - confRate) * 100);
  expl.push({ dimension: "consensusScore", value: consensusScore, rationale: `${conflicts.length} conflito(s) em ${pairs} par(es) de specialists` });

  // Conflict Score — severity-weighted
  const resolvedConflicts  = conflicts.filter(c => c.status === "Resolved").length;
  const pendingConflicts   = conflicts.filter(c => c.status === "RequiresHumanApproval").length;
  const conflictScore = clamp(100 - (pendingConflicts * 25) - ((conflicts.length - resolvedConflicts - pendingConflicts) * 15));
  expl.push({ dimension: "conflictScore", value: conflictScore, rationale: `${resolvedConflicts} resolvidos · ${pendingConflicts} aguardam aprovação humana` });

  // Coverage Score — how many goal domains are covered
  const coveredDomains = new Set(strategies.map(s => s.domain));
  const coverage = goalDomains.length > 0 ? coveredDomains.size / goalDomains.length : coveredDomains.size / Math.max(n, 1);
  const coverageScore = clamp(Math.min(1, coverage) * 100);
  expl.push({ dimension: "coverageScore", value: coverageScore, rationale: `${coveredDomains.size} domínios cobertos de ${goalDomains.length || n} necessários` });

  // Confidence Score — average specialist confidence
  const avgConf = strategies.reduce((acc, s) => acc + s.confidenceLevel, 0) / n;
  const confidenceScore = clamp(avgConf * 100);
  expl.push({ dimension: "confidenceScore", value: confidenceScore, rationale: `Confiança média dos specialists: ${(avgConf * 100).toFixed(1)}%` });

  // Knowledge Score — total recommendations across all strategies
  const totalRecs  = strategies.reduce((acc, s) => acc + s.recommendations.length, 0);
  const critRecs   = strategies.reduce((acc, s) => acc + s.recommendations.filter(r => r.priority === "Critical").length, 0);
  const knowledgeScore = clamp(40 + (totalRecs * 3) + (critRecs * 5));
  expl.push({ dimension: "knowledgeScore", value: knowledgeScore, rationale: `${totalRecs} recomendações (${critRecs} críticas) entre todos os specialists` });

  // Risk Score — inverse of total unique risks
  const totalRisks = strategies.reduce((acc, s) => acc + s.risks.length, 0);
  const riskScore  = clamp(100 - totalRisks * 4);
  expl.push({ dimension: "riskScore", value: riskScore, rationale: `${totalRisks} riscos identificados no total` });

  // Overall — weighted composite
  const overallScore = clamp(
    consensusScore  * 0.20 +
    conflictScore   * 0.20 +
    coverageScore   * 0.15 +
    confidenceScore * 0.20 +
    knowledgeScore  * 0.10 +
    riskScore       * 0.15
  );
  expl.push({ dimension: "overallScore", value: overallScore, rationale: "Score composto ponderado das 6 dimensões" });

  return {
    scores: { consensusScore, conflictScore, coverageScore, confidenceScore, knowledgeScore, riskScore, overallScore },
    explanations: expl,
  };
}