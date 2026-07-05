/**
 * Decision Engine (Fase 3 — Sprint 17)
 *
 * Responsabilidade única: DECIDIR. Seleciona a melhor decisão a partir
 * de um Reasoning Graph. Nunca executa componentes, nunca chama APIs,
 * nunca responde ao usuário, nunca modifica Memory Records ou o Reasoning Graph.
 *
 * O QUE FAZ:
 *   - Receber Reasoning Graph + Pipeline Execution + contexto
 *   - Avaliar alternativas (conclusões)
 *   - Selecionar melhor conclusão
 *   - Calcular nível de risco (determinístico)
 *   - Calcular confiança
 *   - Produzir justificativa
 *
 * O QUE NÃO FAZ:
 *   - Executar componentes
 *   - Chamar APIs
 *   - Responder ao usuário
 *   - Modificar Memory Records
 *   - Modificar o Reasoning Graph
 *   - Gerar novas hipóteses
 *   - Reflection / Self Evaluation / Auto Retry / Planning / Learning / LLM
 *
 * Arquitetura:
 *   Reasoning Engine → Decision Engine → Planner
 */

import {
  buildDecisionResult,
  validateDecisionResult,
  RISK_LEVELS,
  CONFIDENCE_LEVELS,
  DECISION_RESULT_FIELDS,
} from "./decisionResult";

// === Observability ===
const _stats = {
  decisionStarted: 0,
  decisionCompleted: 0,
  alternativesEvaluated: 0,
  decisionsSelected: 0,
  risksCalculated: 0,
  conflictsResolved: 0,
  totalProcessingTimeMs: 0,
  operations: 0,
  riskDistribution: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
  confidenceDistribution: { LOW: 0, MEDIUM: 0, HIGH: 0 },
};

const _eventLog = [];

function _log(event, data) {
  _eventLog.push({ event, ...data, timestamp: new Date().toISOString() });
}

// === Evaluate Alternatives ===

/**
 * Avalia todas as alternativas (conclusões) de um Reasoning Graph.
 * Cada alternativa recebe um score determinístico.
 */
export function evaluateAlternatives(graph) {
  const evaluated = [];

  if (!graph || !Array.isArray(graph.conclusions)) {
    return evaluated;
  }

  for (const conclusion of graph.conclusions) {
    const score = _scoreConclusion(conclusion, graph);
    evaluated.push({
      id: conclusion.id,
      statement: conclusion.statement,
      confidence: conclusion.confidence,
      score,
      basedOn: conclusion.basedOn || [],
    });
    _stats.alternativesEvaluated++;
  }

  // Ordena por score (maior primeiro)
  evaluated.sort((a, b) => b.score - a.score);

  _log("alternativesEvaluated", { count: evaluated.length });
  return evaluated;
}

function _scoreConclusion(conclusion, graph) {
  let score = 0;

  // Confiança da conclusão
  const confWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  score += confWeight[conclusion.confidence] || 0;

  // Bonus se baseada em hipóteses
  if (conclusion.basedOn && conclusion.basedOn.length > 0) {
    score += conclusion.basedOn.length;
  }

  // Penaliza conclusões de conflito
  if (conclusion.id && conclusion.id.includes("conflict")) {
    score -= 2;
  }

  // Bonus se reasoning tem alta confiança
  if (graph.confidence === "HIGH") score += 2;
  if (graph.confidence === "MEDIUM") score += 1;

  // Penaliza se há conflitos
  if (graph.conflicts && graph.conflicts.length > 0) {
    score -= graph.conflicts.length;
  }

  return Math.max(0, score);
}

// === Select Conclusion ===

/**
 * Seleciona a melhor conclusão das avaliadas.
 */
export function selectConclusion(evaluated) {
  if (!Array.isArray(evaluated) || evaluated.length === 0) {
    return null;
  }

  const selected = evaluated[0]; // já ordenado por score
  _stats.decisionsSelected++;
  _log("decisionSelected", { selectedId: selected.id });
  return selected;
}

// === Calculate Risk ===

/**
 * Calcula o nível de risco da decisão (determinístico).
 *
 * Regras:
 *   - CRITICAL: conflitos não resolvidos e confiança LOW
 *   - HIGH: conflitos presentes OU sem evidências
 *   - MEDIUM: sem conflitos, confiança MEDIUM
 *   - LOW: sem conflitos, confiança HIGH
 */
export function calculateRisk(graph, selectedConclusion, alternatives) {
  _stats.risksCalculated++;

  const hasConflicts = graph && graph.conflicts && graph.conflicts.length > 0;
  const hasEvidence = graph && graph.evidence && graph.evidence.length > 0;
  const confidence = selectedConclusion ? selectedConclusion.confidence : "LOW";

  let risk;

  if (hasConflicts && confidence === "LOW") {
    risk = "CRITICAL";
  } else if (hasConflicts || !hasEvidence) {
    risk = "HIGH";
  } else if (confidence === "MEDIUM") {
    risk = "MEDIUM";
  } else {
    risk = "LOW";
  }

  // Se há alternativas conflitantes (scores próximos), aumenta risco
  if (alternatives && alternatives.length >= 2) {
    const diff = alternatives[0].score - alternatives[1].score;
    if (diff === 0) {
      // Empate — aumenta risco
      if (risk === "LOW") risk = "MEDIUM";
      else if (risk === "MEDIUM") risk = "HIGH";
    }
  }

  _stats.riskDistribution[risk]++;
  _log("riskCalculated", { risk });
  return risk;
}

// === Calculate Confidence ===

/**
 * Calcula a confiança da decisão (determinístico).
 */
export function calculateConfidence(selectedConclusion, alternatives, riskLevel) {
  if (!selectedConclusion) {
    return "LOW";
  }

  const baseConf = selectedConclusion.confidence || "LOW";
  const confWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  let weight = confWeight[baseConf] || 1;

  // Bonus se há muitas alternativas convergentes
  if (alternatives && alternatives.length > 1) {
    const topScore = alternatives[0].score;
    const secondScore = alternatives[1].score;
    if (topScore > secondScore) weight += 1;
  }

  // Penaliza risco alto
  if (riskLevel === "HIGH") weight -= 1;
  if (riskLevel === "CRITICAL") weight -= 2;

  let confidence;
  if (weight >= 4) confidence = "HIGH";
  else if (weight >= 2) confidence = "MEDIUM";
  else confidence = "LOW";

  _stats.confidenceDistribution[confidence]++;
  return confidence;
}

// === Justify Decision ===

/**
 * Produz justificativa textual para a decisão.
 */
export function justifyDecision(selectedConclusion, alternatives, riskLevel, confidence, graph) {
  const parts = [];

  if (!selectedConclusion) {
    return "Nenhuma conclusão disponível para selecionar — decisão de baixa confiança.";
  }

  parts.push(`Conclusão selecionada: "${selectedConclusion.statement}"`);
  parts.push(`Score: ${selectedConclusion.score}`);
  parts.push(`Confiança: ${confidence}`);
  parts.push(`Risco: ${riskLevel}`);

  if (alternatives && alternatives.length > 1) {
    parts.push(`Alternativas avaliadas: ${alternatives.length}`);
    parts.push(`Diferença para 2ª alternativa: ${alternatives[0].score - alternatives[1].score}`);
  } else if (alternatives && alternatives.length === 1) {
    parts.push(`Única alternativa disponível`);
  }

  if (graph && graph.conflicts && graph.conflicts.length > 0) {
    parts.push(`Conflitos detectados: ${graph.conflicts.length}`);
  }

  return parts.join(". ") + ".";
}

// === Make Decision ===

/**
 * Constrói um Decision Result completo a partir de um Reasoning Graph.
 *
 * @param {Object} graph — Reasoning Graph
 * @param {Object} [execution] — Pipeline Execution (opcional)
 * @param {Object} [context] — contexto adicional (opcional)
 * @returns {Object} Decision Result
 */
export function makeDecision(graph, execution, context = {}) {
  _stats.operations++;
  const startTime = Date.now();
  _stats.decisionStarted++;
  _log("decisionStarted", { reasoningId: graph?.reasoningId });

  const alternatives = evaluateAlternatives(graph);
  const selectedConclusion = selectConclusion(alternatives);
  const riskLevel = calculateRisk(graph, selectedConclusion, alternatives);
  const confidence = calculateConfidence(selectedConclusion, alternatives, riskLevel);
  const justification = justifyDecision(selectedConclusion, alternatives, riskLevel, confidence, graph);

  // Marca conflitos resolvidos se a decisão selecionada não é de conflito
  if (graph && graph.conflicts && graph.conflicts.length > 0) {
    if (selectedConclusion && !selectedConclusion.id.includes("conflict")) {
      _stats.conflictsResolved += graph.conflicts.length;
    }
  }

  const result = buildDecisionResult({
    reasoningId: graph?.reasoningId || null,
    selectedConclusion,
    alternatives,
    confidence,
    justification,
    riskLevel,
  });

  _stats.decisionCompleted++;
  const elapsed = Date.now() - startTime;
  _stats.totalProcessingTimeMs += elapsed;
  _log("decisionCompleted", { decisionId: result.decisionId, elapsed });

  return result;
}

// === Describe ===

/**
 * Descreve uma decisão em texto legível.
 */
export function describeDecision(result) {
  if (!result) return null;

  const lines = [
    `Decisão ${result.decisionId}`,
    `  Reasoning: ${result.reasoningId || "—"}`,
    `  Confiança: ${result.confidence}`,
    `  Risco: ${result.riskLevel}`,
    `  Alternativas: ${result.alternatives.length}`,
    `  Justificativa: ${result.justification}`,
  ];

  if (result.selectedConclusion) {
    lines.push(`  Conclusão: ${result.selectedConclusion.statement}`);
  }

  return lines.join("\n");
}

// === Validate ===

export function validateDecision(result) {
  return validateDecisionResult(result);
}

// === Observability ===

export function getStats() {
  return {
    ..._stats,
    averageProcessingTimeMs:
      _stats.decisionCompleted > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.decisionCompleted)
        : 0,
    eventLog: [..._eventLog],
  };
}

export function getDecisionLog() {
  return [..._eventLog];
}

export function _resetForTests() {
  _stats.decisionStarted = 0;
  _stats.decisionCompleted = 0;
  _stats.alternativesEvaluated = 0;
  _stats.decisionsSelected = 0;
  _stats.risksCalculated = 0;
  _stats.conflictsResolved = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.operations = 0;
  _stats.riskDistribution = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  _stats.confidenceDistribution = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  _eventLog.length = 0;
}

export default {
  makeDecision,
  evaluateAlternatives,
  selectConclusion,
  calculateRisk,
  calculateConfidence,
  justifyDecision,
  describeDecision,
  validateDecision,
  getStats,
  getDecisionLog,
  _resetForTests,
};