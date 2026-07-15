/**
 * MemoryHealth2.js — Memory Learning & Goal Intelligence Platform (MLGIP)
 * Sprint 7.1.1B — FASE 9
 *
 * Métricas de saúde da memória v2.0.
 * Agrega dados do MIP + Learning Engine + Decay Engine + Persistent Graph.
 */

import { getAllRecords as getLearningRecords, getStats as getLearningStats } from "./MemoryLearningEngine";
import { getAllDecayRecords, getStats as getDecayStats } from "./MemoryDecayEngine";
import { getStats as getGraphStats } from "./PersistentKnowledgeGraph";
import { getStats as getGoalStats } from "./GoalMemoryIndex";

/**
 * Computa todas as métricas v2.0.
 * @param {Object} [mipHealth] - Health básico do MIP (do Sprint 7.1.1A)
 * @returns {Object} MemoryHealth2 completo
 */
export function computeHealth2(mipHealth = {}) {
  const learnStats = getLearningStats();
  const decayStats = getDecayStats();
  const graphStats = getGraphStats();
  const goalStats = getGoalStats();

  // Goal Coverage: % de memórias indexadas em algum objetivo
  const totalLearning = learnStats.total;
  const goalCoverage = totalLearning > 0 && goalStats.totalMemories > 0
    ? Math.min(1, goalStats.totalMemories / totalLearning)
    : 0;

  // Learning Rate: razão de memórias que melhoraram vs pioraram
  const totalFeedback = learnStats.totalReinforced + learnStats.totalPenalized;
  const learningRate = totalFeedback > 0
    ? learnStats.totalReinforced / totalFeedback
    : 0.5;

  // Decay Rate: % de memórias em decaimento (score < 0.5)
  const decayAll = getAllDecayRecords();
  const decayingCount = decayAll.filter((r) => r.decayScore < 0.5).length;
  const decayRate = decayAll.length > 0 ? decayingCount / decayAll.length : 0;

  // Confidence Evolution: avg confidence
  const confidenceEvolution = parseFloat(learnStats.avgConfidence) || 0.5;

  // Relationship Density: edges / nodes ratio
  const relationshipDensity = graphStats.nodeCount > 0
    ? (graphStats.edgeCount / graphStats.nodeCount).toFixed(2)
    : 0;

  // Knowledge Growth: total nodes no grafo
  const knowledgeGrowth = graphStats.nodeCount;

  // Memory Quality Score: composite
  const memoryQualityScore = (
    parseFloat(learnStats.avgLearningScore || 0.5) * 0.4 +
    confidenceEvolution * 0.3 +
    (1 - decayRate) * 0.2 +
    Math.min(1, goalCoverage) * 0.1
  ).toFixed(3);

  // Learning Accuracy: % de memórias usadas que geraram boas respostas
  const learningAccuracy = learnStats.totalUsed > 0
    ? (learnStats.totalReinforced / Math.max(learnStats.totalUsed, 1)).toFixed(3)
    : "0.000";

  return {
    // MIP v1 passthrough
    ...mipHealth,

    // v2.0 metrics
    goalCoverage: (goalCoverage * 100).toFixed(1) + "%",
    learningRate: (learningRate * 100).toFixed(1) + "%",
    decayRate: (decayRate * 100).toFixed(1) + "%",
    confidenceEvolution: confidenceEvolution.toFixed(3),
    relationshipDensity,
    knowledgeGrowth,
    graphSize: graphStats.nodeCount + " nós / " + graphStats.edgeCount + " arestas",
    graphHealth: graphStats.version > 0 ? "OK" : "EMPTY",
    memoryQualityScore,
    learningAccuracy,

    // Raw sub-metrics
    _learning: learnStats,
    _decay: decayStats,
    _graph: graphStats,
    _goals: goalStats,
  };
}

/**
 * Gera um relatório de saúde em texto para logging/COP.
 */
export function healthReport(mipHealth = {}) {
  const h = computeHealth2(mipHealth);
  return [
    `MEMORY HEALTH v2.0`,
    `Goal Coverage: ${h.goalCoverage}`,
    `Learning Rate: ${h.learningRate}`,
    `Decay Rate: ${h.decayRate}`,
    `Confidence Evolution: ${h.confidenceEvolution}`,
    `Relationship Density: ${h.relationshipDensity}`,
    `Knowledge Growth: ${h.knowledgeGrowth} nodes`,
    `Graph: ${h.graphSize} (v${h._graph.version})`,
    `Memory Quality Score: ${h.memoryQualityScore}`,
    `Learning Accuracy: ${h.learningAccuracy}`,
  ].join("\n");
}