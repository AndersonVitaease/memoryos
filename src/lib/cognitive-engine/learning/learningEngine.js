/**
 * Learning Engine (Fase 3 — Sprint 20)
 *
 * Responsabilidade única: APRENDER. Analisa um Execution Result e
 * produz um Learning Result contendo observações, métricas e
 * conhecimento derivado. Apenas dados — não modifica nenhuma camada.
 *
 * O QUE FAZ:
 *   - Receber Execution Result
 *   - Extrair lições aprendidas
 *   - Identificar pontos fortes e fraquezas
 *   - Calcular confiança do aprendizado
 *   - Gerar recomendações estruturadas
 *   - Produzir descrição legível
 *
 * O QUE NÃO FAZ:
 *   - Alterar decisões, planos ou execuções
 *   - Consultar ou gravar memória
 *   - Chamar LLM
 *   - Modificar outras camadas
 *   - Reflexão / Retry automático
 *
 * Arquitetura:
 *   Decision → Planning → Execution → Learning
 */

import {
  buildLearningResult,
  buildObservation,
  buildLesson,
  buildRecommendation,
  validateLearningResult,
  LEARNING_CONFIDENCE_LEVELS,
} from "./learningResult";

// === Observability ===
const _stats = {
  analysesCreated: 0,
  lessonsGenerated: 0,
  strengthsDetected: 0,
  weaknessesDetected: 0,
  recommendationsGenerated: 0,
  totalConfidenceScore: 0,
  totalProcessingTimeMs: 0,
  statusDistribution: { completed: 0, partial: 0, failed: 0 },
  confidenceDistribution: { LOW: 0, MEDIUM: 0, HIGH: 0 },
  eventLog: [],
};

function _log(event, data) {
  _stats.eventLog.push({ event, ...data, timestamp: new Date().toISOString() });
}

function _confidenceToScore(conf) {
  if (conf === "HIGH") return 3;
  if (conf === "MEDIUM") return 2;
  return 1;
}

// === Identify Strengths ===

/**
 * Identifica pontos fortes a partir do Execution Result.
 */
export function identifyStrengths(execution) {
  const strengths = [];

  if (!execution) return strengths;

  const completed = execution.completedSteps || [];
  const total = execution.totalSteps || 0;
  const successRate = execution.successRate || 0;

  if (successRate === 100 && completed.length > 0) {
    strengths.push(
      buildObservation({
        type: "strength",
        description: `100% das etapas executáveis foram concluídas com sucesso`,
        source: "successRate",
      })
    );
  }

  if (successRate >= 75 && successRate < 100) {
    strengths.push(
      buildObservation({
        type: "strength",
        description: `Taxa de sucesso elevada (${successRate}%) indica execução consistente`,
        source: "successRate",
      })
    );
  }

  if (completed.length > 0) {
    const avgDuration = completed.reduce((t, s) => t + (s.duration || 0), 0) / completed.length;
    if (avgDuration > 0 && avgDuration <= 15) {
      strengths.push(
        buildObservation({
          type: "strength",
          description: `Tempo médio por etapa (${avgDuration.toFixed(1)}ms) é eficiente`,
          source: "avgDuration",
        })
      );
    }
  }

  if ((execution.skippedSteps || []).length === 0 && total > 0) {
    strengths.push(
      buildObservation({
        type: "strength",
        description: `Nenhuma etapa foi ignorada — plano totalmente executado`,
        source: "skippedSteps",
      })
    );
  }

  _stats.strengthsDetected += strengths.length;
  _log("strengthsIdentified", { count: strengths.length });
  return strengths;
}

// === Identify Weaknesses ===

/**
 * Identifica limitações observadas a partir do Execution Result.
 */
export function identifyWeaknesses(execution) {
  const weaknesses = [];

  if (!execution) return weaknesses;

  const failed = execution.failedSteps || [];
  const skipped = execution.skippedSteps || [];
  const completed = execution.completedSteps || [];
  const successRate = execution.successRate || 0;

  if (failed.length > 0) {
    weaknesses.push(
      buildObservation({
        type: "weakness",
        description: `${failed.length} etapa(s) falharam durante a execução`,
        source: "failedSteps",
      })
    );
  }

  if (successRate < 50 && (failed.length + completed.length) > 0) {
    weaknesses.push(
      buildObservation({
        type: "weakness",
        description: `Taxa de sucesso baixa (${successRate}%) indica falhas significativas`,
        source: "successRate",
      })
    );
  }

  if (skipped.length > 0) {
    weaknesses.push(
      buildObservation({
        type: "weakness",
        description: `${skipped.length} etapa(s) opcional(is) foram ignoradas`,
        source: "skippedSteps",
      })
    );
  }

  if (completed.length > 0) {
    const avgDuration = completed.reduce((t, s) => t + (s.duration || 0), 0) / completed.length;
    if (avgDuration > 30) {
      weaknesses.push(
        buildObservation({
          type: "weakness",
          description: `Tempo médio por etapa (${avgDuration.toFixed(1)}ms) é elevado`,
          source: "avgDuration",
        })
      );
    }
  }

  _stats.weaknessesDetected += weaknesses.length;
  _log("weaknessesIdentified", { count: weaknesses.length });
  return weaknesses;
}

// === Extract Lessons ===

/**
 * Extrai lições aprendidas a partir do Execution Result.
 */
export function extractLessons(execution) {
  const lessons = [];

  if (!execution) return lessons;

  const completed = execution.completedSteps || [];
  const failed = execution.failedSteps || [];
  const skipped = execution.skippedSteps || [];
  const total = execution.totalSteps || 0;
  const successRate = execution.successRate || 0;
  const cost = execution.executionCost || 0;
  const time = execution.executionTime || 0;

  if (successRate === 100 && completed.length > 0) {
    lessons.push(
      buildLesson({
        category: "success",
        statement: `Planos com ${completed.length} etapa(s) obrigatória(s) tendem a ser executados com sucesso total`,
        evidence: `successRate=${successRate}%, completed=${completed.length}`,
      })
    );
  }

  if (failed.length > 0) {
    lessons.push(
      buildLesson({
        category: "failure",
        statement: `${failed.length} etapa(s) falharam — revisar pré-condições antes da execução`,
        evidence: `failed=${failed.length}`,
      })
    );
  }

  if (skipped.length > 0) {
    lessons.push(
      buildLesson({
        category: "optimization",
        statement: `${skipped.length} etapa(s) opcional(is) foram ignoradas — considerar removê-las do plano`,
        evidence: `skipped=${skipped.length}`,
      })
    );
  }

  if (completed.length > 0) {
    const avgCost = cost / completed.length;
    lessons.push(
      buildLesson({
        category: "cost",
        statement: `Custo médio por etapa concluída: ${avgCost.toFixed(1)}`,
        evidence: `totalCost=${cost}, completed=${completed.length}`,
      })
    );

    const avgTime = time / completed.length;
    lessons.push(
      buildLesson({
        category: "performance",
        statement: `Tempo médio por etapa concluída: ${avgTime.toFixed(1)}ms`,
        evidence: `totalTime=${time}, completed=${completed.length}`,
      })
    );
  }

  if (total > 0 && completed.length === total) {
    lessons.push(
      buildLesson({
        category: "completeness",
        statement: `Plano executado em sua totalidade sem perdas`,
        evidence: `completed=${completed.length}/${total}`,
      })
    );
  }

  _stats.lessonsGenerated += lessons.length;
  _log("lessonsExtracted", { count: lessons.length });
  return lessons;
}

// === Generate Recommendations ===

/**
 * Produz recomendações estruturadas para futuras execuções.
 * Apenas dados — não modificam nenhuma camada.
 */
export function generateRecommendations(execution, strengths, weaknesses, lessons) {
  const recs = [];

  if (!execution) return recs;

  const failed = execution.failedSteps || [];
  const skipped = execution.skippedSteps || [];
  const completed = execution.completedSteps || [];
  const successRate = execution.successRate || 0;

  if (failed.length > 0) {
    recs.push(
      buildRecommendation({
        priority: "high",
        action: `Revisar e fortalecer pré-condições das ${failed.length} etapa(s) que falharam`,
        rationale: "Falhas indicam gaps no planejamento ou dependências não satisfeitas",
      })
    );
  }

  if (skipped.length > 0) {
    recs.push(
      buildRecommendation({
        priority: "normal",
        action: `Avaliar se ${skipped.length} etapa(s) opcional(is) devem ser removidas do plano padrão`,
        rationale: "Etapas opcionais ignoradas consistentemente não agregam valor",
      })
    );
  }

  if (successRate === 100 && completed.length > 0) {
    recs.push(
      buildRecommendation({
        priority: "low",
        action: "Manter a estrutura atual do plano como referência para execuções similares",
        rationale: "Taxa de sucesso de 100% indica um plano bem estruturado",
      })
    );
  }

  if (successRate < 75 && (failed.length + completed.length) > 0) {
    recs.push(
      buildRecommendation({
        priority: "high",
        action: "Reestruturar o plano para reduzir complexidade e dependências",
        rationale: `Taxa de sucesso de ${successRate}% está abaixo do aceitável`,
      })
    );
  }

  if (completed.length > 0) {
    const avgTime = (execution.executionTime || 0) / completed.length;
    if (avgTime > 25) {
      recs.push(
        buildRecommendation({
          priority: "normal",
          action: "Otimizar etapas com maior tempo de execução",
          rationale: `Tempo médio de ${avgTime.toFixed(1)}ms pode ser reduzido`,
        })
      );
    }
  }

  if (recs.length === 0) {
    recs.push(
      buildRecommendation({
        priority: "low",
        action: "Continuar monitorando execuções para identificar padrões",
        rationale: "Nenhuma recomendação crítica identificada",
      })
    );
  }

  _stats.recommendationsGenerated += recs.length;
  _log("recommendationsGenerated", { count: recs.length });
  return recs;
}

// === Calculate Learning Confidence ===

/**
 * Calcula o nível de confiança do aprendizado (determinístico).
 * Baseado na quantidade de dados disponíveis e consistência da execução.
 */
export function calculateLearningConfidence(execution) {
  if (!execution) return "LOW";

  const completed = (execution.completedSteps || []).length;
  const failed = (execution.failedSteps || []).length;
  const total = execution.totalSteps || 0;
  const executed = completed + failed;

  let score = 0;

  // Mais dados = mais confiança
  if (executed >= 5) score += 2;
  else if (executed >= 2) score += 1;

  // Execução consistente = mais confiança
  if (execution.status === "completed") score += 2;
  else if (execution.status === "partial") score += 1;

  // Taxa de sucesso extrema (0% ou 100%) = padrão claro
  if (execution.successRate === 100 || execution.successRate === 0) score += 1;

  if (score >= 4) return "HIGH";
  if (score >= 2) return "MEDIUM";
  return "LOW";
}

// === Analyze Execution ===

/**
 * Analisa um Execution Result e produz um Learning Result completo.
 *
 * @param {Object} execution — Execution Result
 * @returns {Object} Learning Result
 */
export function analyzeExecution(execution) {
  _stats.analysesCreated++;
  const startTime = Date.now();
  _log("analysisStarted", { executionId: execution?.executionId });

  if (!execution || !execution.executionId) {
    const result = buildLearningResult({
      executionId: null,
      status: "failed",
      observations: [],
      strengths: [],
      weaknesses: [],
      lessons: [],
      metrics: {},
      recommendations: [],
      confidence: "LOW",
    });
    _stats.statusDistribution.failed++;
    _stats.confidenceDistribution.LOW++;
    return result;
  }

  // 1. Observações factuais
  const observations = [];
  observations.push(
    buildObservation({
      type: "fact",
      description: `Execução ${execution.executionId} com status "${execution.status}"`,
      source: "execution.status",
    })
  );
  observations.push(
    buildObservation({
      type: "fact",
      description: `${execution.totalSteps} etapa(s) no total, ${(execution.completedSteps || []).length} concluída(s), ${(execution.failedSteps || []).length} falharam`,
      source: "execution.steps",
    })
  );
  observations.push(
    buildObservation({
      type: "fact",
      description: `Taxa de sucesso: ${execution.successRate}%, tempo: ${execution.executionTime}ms, custo: ${execution.executionCost}`,
      source: "execution.metrics",
    })
  );

  // 2. Pontos fortes
  const strengths = identifyStrengths(execution);

  // 3. Fraquezas
  const weaknesses = identifyWeaknesses(execution);

  // 4. Lições
  const lessons = extractLessons(execution);

  // 5. Métricas derivadas
  const completed = execution.completedSteps || [];
  const metrics = {
    totalSteps: execution.totalSteps || 0,
    completedSteps: completed.length,
    failedSteps: (execution.failedSteps || []).length,
    skippedSteps: (execution.skippedSteps || []).length,
    successRate: execution.successRate || 0,
    executionTime: execution.executionTime || 0,
    executionCost: execution.executionCost || 0,
    avgTimePerStep: completed.length > 0 ? Math.round((execution.executionTime || 0) / completed.length) : 0,
    avgCostPerStep: completed.length > 0 ? Math.round(((execution.executionCost || 0) / completed.length) * 10) / 10 : 0,
  };

  // 6. Recomendações
  const recommendations = generateRecommendations(execution, strengths, weaknesses, lessons);

  // 7. Confiança
  const confidence = calculateLearningConfidence(execution);

  // 8. Status do aprendizado
  const status = execution.status === "completed" ? "completed" : execution.status === "partial" ? "partial" : "failed";

  _stats.totalConfidenceScore += _confidenceToScore(confidence);
  _stats.totalProcessingTimeMs += Date.now() - startTime;
  _stats.statusDistribution[status]++;
  _stats.confidenceDistribution[confidence]++;
  _log("analysisCompleted", { status, confidence, lessons: lessons.length });

  return buildLearningResult({
    executionId: execution.executionId,
    status,
    observations,
    strengths,
    weaknesses,
    lessons,
    metrics,
    recommendations,
    confidence,
  });
}

// === Describe Learning ===

/**
 * Produz descrição legível do aprendizado.
 */
export function describeLearning(result) {
  if (!result) return null;

  const lines = [
    `Aprendizado ${result.learningId}`,
    `  Execução: ${result.executionId || "—"}`,
    `  Status: ${result.status}`,
    `  Confiança: ${result.confidence}`,
    `  Observações: ${result.observations.length}`,
    `  Pontos fortes: ${result.strengths.length}`,
    `  Fraquezas: ${result.weaknesses.length}`,
    `  Lições: ${result.lessons.length}`,
    `  Recomendações: ${result.recommendations.length}`,
  ];

  if (result.observations.length > 0) {
    lines.push("  Observações:");
    for (const o of result.observations) {
      lines.push(`    • [${o.type}] ${o.description}`);
    }
  }

  if (result.strengths.length > 0) {
    lines.push("  Pontos fortes:");
    for (const s of result.strengths) {
      lines.push(`    ✓ ${s.description}`);
    }
  }

  if (result.weaknesses.length > 0) {
    lines.push("  Fraquezas:");
    for (const w of result.weaknesses) {
      lines.push(`    ✗ ${w.description}`);
    }
  }

  if (result.lessons.length > 0) {
    lines.push("  Lições:");
    for (const l of result.lessons) {
      lines.push(`    → [${l.category}] ${l.statement}`);
    }
  }

  if (result.recommendations.length > 0) {
    lines.push("  Recomendações:");
    for (const r of result.recommendations) {
      lines.push(`    ⚑ [${r.priority}] ${r.action}`);
    }
  }

  if (result.metrics && Object.keys(result.metrics).length > 0) {
    lines.push("  Métricas:");
    for (const [key, value] of Object.entries(result.metrics)) {
      lines.push(`    ${key}: ${value}`);
    }
  }

  return lines.join("\n");
}

// === Validate Learning ===

export function validateLearning(result) {
  return validateLearningResult(result);
}

// === Observability ===

export function getStats() {
  return {
    analysesCreated: _stats.analysesCreated,
    lessonsGenerated: _stats.lessonsGenerated,
    strengthsDetected: _stats.strengthsDetected,
    weaknessesDetected: _stats.weaknessesDetected,
    recommendationsGenerated: _stats.recommendationsGenerated,
    averageConfidence:
      _stats.analysesCreated > 0
        ? LEARNING_CONFIDENCE_LEVELS[
            Math.min(2, Math.floor(_stats.totalConfidenceScore / _stats.analysesCreated) - 1)
          ] || "LOW"
        : "LOW",
    averageProcessingTime:
      _stats.analysesCreated > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.analysesCreated)
        : 0,
    statusDistribution: { ..._stats.statusDistribution },
    confidenceDistribution: { ..._stats.confidenceDistribution },
    eventLog: [..._stats.eventLog],
  };
}

export function getDecisionLog() {
  return [..._stats.eventLog];
}

export function _resetForTests() {
  _stats.analysesCreated = 0;
  _stats.lessonsGenerated = 0;
  _stats.strengthsDetected = 0;
  _stats.weaknessesDetected = 0;
  _stats.recommendationsGenerated = 0;
  _stats.totalConfidenceScore = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.statusDistribution = { completed: 0, partial: 0, failed: 0 };
  _stats.confidenceDistribution = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  _stats.eventLog.length = 0;
}

export default {
  analyzeExecution,
  extractLessons,
  identifyStrengths,
  identifyWeaknesses,
  calculateLearningConfidence,
  generateRecommendations,
  describeLearning,
  validateLearning,
  getStats,
  getDecisionLog,
  _resetForTests,
};