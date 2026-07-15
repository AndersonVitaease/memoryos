/**
 * SelfAssessmentEngine.js — Cognitive Diagnosis Platform (CDP)
 * Sprint 7.1.2 — FASE 9
 *
 * Auto-avaliação após cada resposta.
 * Gera: Strengths, Weaknesses, Confidence, Missing Information,
 *       Alternative Strategies, Improvement Opportunities.
 *
 * Read-only. Nunca altera comportamento. Apenas diagnostica.
 */

/**
 * Gera avaliação de pontos fortes de um trace.
 */
function assessStrengths(trace, diagnosis) {
  const strengths = [];

  if (trace.confidence >= 0.7) strengths.push("Alta confiança na resposta gerada");
  if ((trace.memories ?? []).filter((m) => m.priority === "HIGH").length > 0) {
    strengths.push("Memórias de alta prioridade disponíveis e utilizadas");
  }
  if ((trace.specialists ?? []).filter((s) => s.activated && !s.error).length > 0) {
    strengths.push("Especialistas ativados com sucesso");
  }
  if ((trace.durationMs ?? 0) < 3000) strengths.push("Resposta gerada com baixa latência");
  if ((trace.goals ?? []).length > 0) strengths.push("Objetivo ativo identificado");
  if ((trace.learning?.memoriesReinforced ?? []).length > 0) {
    strengths.push(`${trace.learning.memoriesReinforced.length} memória(s) reforçada(s)`);
  }
  if ((trace.connectors ?? []).filter((c) => c.status === "success").length > 0) {
    strengths.push("Conectores responderam com sucesso");
  }
  if (diagnosis?.overallHealth === "HEALTHY") strengths.push("Nenhuma anomalia detectada no diagnóstico");

  return strengths.length > 0 ? strengths : ["Execução completada sem erros críticos"];
}

/**
 * Gera avaliação de pontos fracos de um trace.
 */
function assessWeaknesses(trace, diagnosis) {
  const weaknesses = [];

  if (trace.confidence < 0.4) weaknesses.push("Confiança insuficiente na resposta");
  if ((trace.memories ?? []).length === 0) weaknesses.push("Nenhuma memória relevante recuperada");
  if ((trace.specialists ?? []).filter((s) => s.activated).length === 0) {
    weaknesses.push("Nenhum especialista de domínio ativado");
  }
  if ((trace.goals ?? []).length === 0) weaknesses.push("Sem objetivo indexado para esta sessão");
  if ((trace.connectors ?? []).filter((c) => c.status === "error").length > 0) {
    weaknesses.push("Falhas em conectores externos");
  }
  if ((trace.durationMs ?? 0) > 8000) weaknesses.push("Latência elevada afetou a experiência");
  if (diagnosis?.findings?.some((f) => f.severity === "CRITICAL")) {
    weaknesses.push("Problema crítico detectado no diagnóstico");
  }

  return weaknesses;
}

/**
 * Detecta informações ausentes que teriam melhorado a resposta.
 */
function assessMissingInfo(trace) {
  const missing = [];

  const ctx = trace.context ?? {};
  if (!ctx.sessionSummary) missing.push("Resumo da sessão não disponível");
  if ((ctx.entitiesCount ?? 0) === 0) missing.push("Entidades de conhecimento não indexadas");
  if ((ctx.decisionsCount ?? 0) === 0) missing.push("Decisões anteriores não recuperadas");
  if ((trace.goals ?? []).length === 0) missing.push("Objetivo explícito não definido");
  if ((trace.connectors ?? []).length === 0) missing.push("Nenhum conector externo consultado");

  return missing;
}

/**
 * Sugere estratégias alternativas.
 */
function assessAlternativeStrategies(trace, diagnosis) {
  const strategies = [];

  if (trace.confidence < 0.5) {
    strategies.push("Consultar mais especialistas de domínio");
    strategies.push("Expandir busca de memória com keywords adicionais");
  }

  if ((trace.memories ?? []).length < 3) {
    strategies.push("Acionar busca de contexto histórico mais ampla");
  }

  if ((trace.goals ?? []).length === 0) {
    strategies.push("Criar Goal explícito para organizar o conhecimento desta conversa");
  }

  if (diagnosis?.findings?.some((f) => f.category === "CONNECTOR")) {
    strategies.push("Tentar abordagem sem dependência de conectores externos");
  }

  if ((trace.durationMs ?? 0) > 6000) {
    strategies.push("Reduzir número de steps paralelos para diminuir latência");
  }

  return strategies;
}

/**
 * Gera oportunidades de melhoria.
 */
function assessImprovements(trace, diagnosis) {
  const improvements = [];
  const findings = diagnosis?.findings ?? [];

  // Agrega por categoria
  const categories = [...new Set(findings.map((f) => f.category))];
  for (const cat of categories) {
    const catFindings = findings.filter((f) => f.category === cat && ["CRITICAL", "HIGH"].includes(f.severity));
    if (catFindings.length > 0) {
      improvements.push(...catFindings.map((f) => f.recommendation));
    }
  }

  if (improvements.length === 0) {
    improvements.push("Continuar enriquecendo o Knowledge Graph com mais conversas");
    improvements.push("Manter o Goal Index atualizado com objetivos explícitos");
  }

  return [...new Set(improvements)]; // dedup
}

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * Gera auto-avaliação completa de um trace.
 * @param {Object} trace     - CognitiveTrace
 * @param {Object} diagnosis - DiagnosisReport (do DecisionDiagnosisEngine)
 * @returns {Object} SelfAssessment
 */
export function assess(trace, diagnosis = null) {
  if (!trace) return null;

  const strengths = assessStrengths(trace, diagnosis);
  const weaknesses = assessWeaknesses(trace, diagnosis);
  const missingInformation = assessMissingInfo(trace);
  const alternativeStrategies = assessAlternativeStrategies(trace, diagnosis);
  const improvementOpportunities = assessImprovements(trace, diagnosis);

  const confidenceLabel =
    trace.confidence >= 0.75 ? "HIGH" :
    trace.confidence >= 0.5 ? "MEDIUM" :
    trace.confidence >= 0.3 ? "LOW" : "VERY_LOW";

  const overallScore = Math.round(
    (strengths.length / Math.max(strengths.length + weaknesses.length, 1)) * 100
  );

  return {
    traceId: trace.traceId,
    assessedAt: Date.now(),
    overallScore,
    confidenceLevel: confidenceLabel,
    confidenceValue: trace.confidence ?? 0,
    strengths,
    weaknesses,
    missingInformation,
    alternativeStrategies,
    improvementOpportunities,
    summary: weaknesses.length === 0
      ? "Execução cognitiva saudável — nenhuma fraqueza identificada."
      : `${weaknesses.length} fraqueza(s) identificada(s). ${improvementOpportunities.length} oportunidade(s) de melhoria.`,
  };
}

/**
 * Gera avaliação simplificada (sem trace completo).
 */
export function quickAssess({ confidence, memoryCount, specialistCount, goalCount }) {
  return {
    confidenceLabel: confidence >= 0.7 ? "HIGH" : confidence >= 0.4 ? "MEDIUM" : "LOW",
    memoryAdequate: memoryCount >= 3,
    specialistActive: specialistCount > 0,
    goalDefined: goalCount > 0,
    overallOk: confidence >= 0.5 && memoryCount > 0,
  };
}