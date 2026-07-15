/**
 * ReasoningExplainer.js — Cognitive Diagnosis Platform (CDP)
 * Sprint 7.1.2 — FASE 2
 *
 * Explica cada decisão tomada pelo sistema.
 * Produz explicações com evidências para:
 *   - Por que uma memória foi utilizada
 *   - Por que uma memória foi ignorada
 *   - Por que um especialista foi escolhido
 *   - Por que uma hipótese foi descartada
 *
 * Read-only. Nunca modifica nada.
 */

// ─── Memory explanations ──────────────────────────────────────────────────────

/**
 * Explica por que uma memória foi selecionada.
 * @param {Object} memory - Ranked memory item
 * @param {string[]} keywords - Query keywords
 * @returns {{ explanation: string, evidence: string[], score: number }}
 */
export function explainMemoryUsed(memory, keywords = []) {
  const evidence = [];
  const reasons = [];

  if (memory.breakdown) {
    const { semantic, recency, richness, importance } = memory.breakdown;

    if (semantic > 0.6) {
      evidence.push(`Alta relevância semântica (${(semantic * 100).toFixed(0)}%)`);
      reasons.push("corresponde diretamente às palavras-chave da query");
    }
    if (recency > 0.7) {
      evidence.push(`Memória recente (recência: ${(recency * 100).toFixed(0)}%)`);
      reasons.push("foi criada ou atualizada recentemente");
    }
    if (importance > 0.8) {
      evidence.push(`Tipo de alta importância histórica (${(importance * 100).toFixed(0)}%)`);
      reasons.push(`tipo ${memory.record?.type ?? "desconhecido"} tem prioridade histórica elevada`);
    }
    if (richness > 0.5) {
      evidence.push(`Conteúdo rico (${(richness * 100).toFixed(0)}%)`);
      reasons.push("possui descrição detalhada");
    }
  }

  if (memory.priority === "HIGH") {
    evidence.push(`Prioridade HIGH (score: ${memory.score})`);
  }

  if (keywords.length > 0 && memory.record) {
    const content = Object.values(memory.record).join(" ").toLowerCase();
    const matched = keywords.filter((k) => content.includes(k.toLowerCase()));
    if (matched.length > 0) {
      evidence.push(`Contém keywords: "${matched.join('", "')}"`);
    }
  }

  const explanation = reasons.length > 0
    ? `Selecionada porque ${reasons.join(" e ")}.`
    : `Selecionada com base no score composto (${memory.score}).`;

  return { explanation, evidence, score: memory.score ?? 0 };
}

/**
 * Explica por que uma memória foi ignorada.
 */
export function explainMemoryIgnored(memory, keywords = []) {
  const evidence = [];
  const reasons = [];

  if (memory.score < 0.30) {
    reasons.push("score composto abaixo do threshold mínimo (0.30)");
    evidence.push(`Score: ${memory.score} < 0.30 (DISCARD)`);
  }

  if (memory.breakdown) {
    const { semantic } = memory.breakdown;
    if (semantic < 0.2 && keywords.length > 0) {
      reasons.push("baixa relevância semântica para a query atual");
      evidence.push(`Relevância semântica: ${(semantic * 100).toFixed(0)}%`);
    }
  }

  if (memory.priority === "LOW" || memory.priority === "DISCARD") {
    reasons.push(`prioridade ${memory.priority}`);
  }

  const explanation = reasons.length > 0
    ? `Ignorada porque ${reasons.join(" e ")}.`
    : "Ignorada: outras memórias apresentaram maior relevância.";

  return { explanation, evidence, score: memory.score ?? 0 };
}

// ─── Specialist explanations ──────────────────────────────────────────────────

/**
 * Explica por que um especialista foi ativado.
 */
export function explainSpecialistActivated(specialist) {
  const evidence = [];
  const reasons = [];

  if (specialist.activationReason) {
    reasons.push(specialist.activationReason);
    evidence.push(`Motivo de ativação: "${specialist.activationReason}"`);
  }

  if (specialist.score > 0.7) {
    reasons.push("alto score de matching com a intent");
    evidence.push(`Score: ${specialist.score}`);
  }

  const explanation = reasons.length > 0
    ? `Ativado porque ${reasons.join(" e ")}.`
    : `Ativado com base no roteamento automático de intenção.`;

  return { explanation, evidence };
}

/**
 * Explica por que um especialista foi descartado.
 */
export function explainSpecialistDiscarded(specialist) {
  const evidence = [];
  const reasons = [];

  if (specialist.discardedReason) {
    reasons.push(specialist.discardedReason);
    evidence.push(`Motivo: "${specialist.discardedReason}"`);
  } else {
    reasons.push("não correspondeu ao domínio da intent detectada");
    evidence.push("Domínio incompatível com a query atual");
  }

  return {
    explanation: `Descartado porque ${reasons.join(" e ")}.`,
    evidence,
  };
}

// ─── Hypothesis explanations ──────────────────────────────────────────────────

/**
 * Explica por que uma hipótese/alternativa foi descartada.
 */
export function explainHypothesisDiscarded(alternative) {
  const evidence = [];
  const reasons = [];

  if (alternative.score < 0.4) {
    reasons.push(`score insuficiente (${alternative.score})`);
    evidence.push(`Score: ${alternative.score}`);
  }

  if (alternative.reason) {
    reasons.push(alternative.reason);
    evidence.push(`Avaliação: "${alternative.reason}"`);
  }

  return {
    explanation: `Hipótese descartada: ${reasons.join("; ")}.`,
    evidence,
  };
}

// ─── Decision explanation ─────────────────────────────────────────────────────

/**
 * Explica uma decisão completa.
 * @param {Object} decision - DecisionRecord
 * @returns {{ explanation: string, evidence: string[], alternatives: Object[] }}
 */
export function explainDecision(decision) {
  const evidence = [];

  if (decision.rule) evidence.push(`Regra aplicada: "${decision.rule}"`);
  if (decision.confidence) evidence.push(`Confiança: ${(decision.confidence * 100).toFixed(0)}%`);
  if (decision.engines?.length > 0) evidence.push(`Engines: ${decision.engines.join(", ")}`);

  const discarded = (decision.alternatives ?? [])
    .filter((a) => a.outcome === "rejected")
    .map((a) => explainHypothesisDiscarded(a));

  return {
    explanation: decision.reasoning || `Decisão tomada com base em ${decision.category}.`,
    evidence,
    alternatives: discarded,
  };
}

// ─── Trace explanation summary ────────────────────────────────────────────────

/**
 * Gera um resumo completo de explicações para um trace.
 */
export function explainTrace(trace, keywords = []) {
  if (!trace) return null;

  const memoriesUsed = (trace.memories ?? []).filter((m) => m.used);
  const memoriesIgnored = (trace.memories ?? []).filter((m) => !m.used);
  const specialistsActivated = (trace.specialists ?? []).filter((s) => s.activated);
  const specialistsDiscarded = (trace.specialists ?? []).filter((s) => !s.activated);

  return {
    traceId: trace.traceId,
    userInput: trace.userInput,
    memoriesUsed: memoriesUsed.map((m) => ({
      label: m.label,
      ...explainMemoryUsed(m, keywords),
    })),
    memoriesIgnored: memoriesIgnored.map((m) => ({
      label: m.label,
      ...explainMemoryIgnored(m, keywords),
    })),
    specialistsActivated: specialistsActivated.map((s) => ({
      name: s.name,
      ...explainSpecialistActivated(s),
    })),
    specialistsDiscarded: specialistsDiscarded.map((s) => ({
      name: s.name,
      ...explainSpecialistDiscarded(s),
    })),
    decisions: (trace.decisions ?? []).map((d) => ({
      category: d.category,
      ...explainDecision(d),
    })),
  };
}