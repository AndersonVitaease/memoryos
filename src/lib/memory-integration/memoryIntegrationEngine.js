/**
 * Memory Integration Engine (Fase 3 — Sprint 21)
 *
 * Responsabilidade única: TRANSFORMAR aprendizado em proposta.
 * Recebe um Learning Result e produz uma Memory Update Proposal.
 *
 * O QUE FAZ:
 *   - Receber Learning Result
 *   - Extrair conhecimento estruturado
 *   - Classificar conhecimento em categorias
 *   - Priorizar itens por importância
 *   - Detectar conflitos internos (sem consultar memória)
 *   - Calcular confiança geral da proposta
 *   - Produzir descrição legível
 *   - Validar o contrato
 *
 * O QUE NÃO FAZ:
 *   - Gravar memória
 *   - Consultar o Memory Engine
 *   - Alterar Learning Result, Execution Result, Plan Result ou Decision Result
 *   - Chamar LLM
 *   - Reflexão / Retry
 *   - Chamadas HTTP
 *
 * Arquitetura:
 *   Learning → Memory Integration → Memory Engine (futuro)
 */

import {
  buildMemoryUpdateProposal,
  buildKnowledgeItem,
  buildSuggestedMemory,
  buildConflict,
  validateMemoryUpdateProposal,
  PROPOSAL_CONFIDENCE_LEVELS,
} from "./memoryUpdateProposal";

// === Observability ===
const _stats = {
  proposalsCreated: 0,
  knowledgeItemsGenerated: 0,
  conflictsDetected: 0,
  reviewRequired: 0,
  totalConfidenceScore: 0,
  totalProcessingTimeMs: 0,
  proposalTypeDistribution: { create: 0, update: 0, merge: 0, ignore: 0 },
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

function _scoreToConfidence(score) {
  if (score >= 2.5) return "HIGH";
  if (score >= 1.5) return "MEDIUM";
  return "LOW";
}

// === Classify Knowledge ===

/**
 * Classifica conhecimento em categorias baseado no conteúdo da lição/observação.
 */
export function classifyKnowledge(text) {
  if (!text || typeof text !== "string") return "general";

  const lower = text.toLowerCase();

  if (/sucess|100%|conclu|complet|total/i.test(lower)) return "success";
  if (/fail|falh|erro|problem/i.test(lower)) return "failure";
  if (/otimiz|remov|opcional|ignor/i.test(lower)) return "optimization";
  if (/custo|cost|gasto/i.test(lower)) return "cost";
  if (/tempo|time|duracao|ms/i.test(lower)) return "performance";
  if (/plano|plan|etapa|step/i.test(lower)) return "planning";

  return "general";
}

// === Extract Knowledge ===

/**
 * Extrai conhecimento estruturado a partir de um Learning Result.
 * Transforma observações, lições, pontos fortes e fraquezas em Knowledge Items.
 */
export function extractKnowledge(learningResult) {
  const items = [];

  if (!learningResult) return items;

  // Extrair de lições
  for (const lesson of learningResult.lessons || []) {
    const category = lesson.category || classifyKnowledge(lesson.statement);
    const conf = _confidenceFromLearning(learningResult);
    items.push(
      buildKnowledgeItem({
        category,
        content: lesson.statement,
        evidence: lesson.evidence,
        confidence: conf,
      })
    );
  }

  // Extrair de pontos fortes
  for (const strength of learningResult.strengths || []) {
    const category = classifyKnowledge(strength.description);
    items.push(
      buildKnowledgeItem({
        category: category === "general" ? "success" : category,
        content: strength.description,
        evidence: strength.source,
        confidence: _confidenceFromLearning(learningResult),
      })
    );
  }

  // Extrair de fraquezas
  for (const weakness of learningResult.weaknesses || []) {
    const category = classifyKnowledge(weakness.description);
    items.push(
      buildKnowledgeItem({
        category: category === "general" ? "failure" : category,
        content: weakness.description,
        evidence: weakness.source,
        confidence: _confidenceFromLearning(learningResult),
      })
    );
  }

  _stats.knowledgeItemsGenerated += items.length;
  _log("knowledgeExtracted", { count: items.length });
  return items;
}

function _confidenceFromLearning(learningResult) {
  if (!learningResult) return "LOW";
  return learningResult.confidence || "LOW";
}

// === Prioritize Knowledge ===

/**
 * Ordena itens por prioridade (confiança HIGH primeiro, depois MEDIUM, depois LOW).
 */
export function prioritizeKnowledge(items) {
  if (!Array.isArray(items)) return [];

  const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  return [...items].sort((a, b) => {
    const diff = (priorityOrder[b.confidence] || 0) - (priorityOrder[a.confidence] || 0);
    if (diff !== 0) return diff;
    return a.category.localeCompare(b.category);
  });
}

// === Detect Conflicts ===

/**
 * Identifica possíveis conflitos internos entre os próprios dados recebidos.
 * Não consulta memória — apenas detecta conflitos entre os itens de conhecimento.
 */
export function detectConflicts(knowledgeItems) {
  const conflicts = [];

  if (!Array.isArray(knowledgeItems) || knowledgeItems.length < 2) return conflicts;

  // Detectar conflito: sucesso vs falha na mesma categoria
  const byCategory = {};
  for (const item of knowledgeItems) {
    const key = item.category;
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(item);
  }

  for (const [category, groupItems] of Object.entries(byCategory)) {
    if (groupItems.length < 2) continue;

    // Conflito de confiança: itens na mesma categoria com confianças opostas
    const highs = groupItems.filter((i) => i.confidence === "HIGH");
    const lows = groupItems.filter((i) => i.confidence === "LOW");
    if (highs.length > 0 && lows.length > 0) {
      conflicts.push(
        buildConflict({
          type: "confidence_mismatch",
          description: `Categoria "${category}" contém itens com confiança HIGH e LOW simultaneamente`,
          items: groupItems.map((i) => i.id),
        })
      );
    }

    // Conflito de conteúdo: itens com conteúdo oposto (sucesso vs falha)
    const successItems = groupItems.filter((i) =>
      /sucess|100%|conclu|complet/i.test(i.content)
    );
    const failureItems = groupItems.filter((i) =>
      /fail|falh|erro/i.test(i.content)
    );
    if (successItems.length > 0 && failureItems.length > 0) {
      conflicts.push(
        buildConflict({
          type: "content_contradiction",
          description: `Categoria "${category}" contém indicadores de sucesso E falha simultâneos`,
          items: [...successItems, ...failureItems].map((i) => i.id),
        })
      );
    }
  }

  _stats.conflictsDetected += conflicts.length;
  _log("conflictsDetected", { count: conflicts.length });
  return conflicts;
}

// === Calculate Proposal Confidence ===

/**
 * Calcula confiança geral da proposta baseado na média dos itens.
 */
export function calculateProposalConfidence(knowledgeItems, learningResult) {
  if (!Array.isArray(knowledgeItems) || knowledgeItems.length === 0) {
    return learningResult?.confidence || "LOW";
  }

  const totalScore = knowledgeItems.reduce(
    (sum, item) => sum + _confidenceToScore(item.confidence),
    0
  );
  const avgScore = totalScore / knowledgeItems.length;
  return _scoreToConfidence(avgScore);
}

// === Generate Suggested Memories ===

function _generateSuggestedMemories(knowledgeItems, learningResult) {
  const memories = [];

  for (const item of knowledgeItems) {
    memories.push(
      buildSuggestedMemory({
        memoryType: _categoryToMemoryType(item.category),
        intent: _categoryToIntent(item.category),
        content: item.content,
        tags: [item.category],
        confidence: item.confidence,
      })
    );
  }

  return memories;
}

function _categoryToMemoryType(category) {
  const map = {
    success: "fact",
    failure: "incident",
    optimization: "insight",
    cost: "metric",
    performance: "metric",
    planning: "procedure",
    general: "fact",
  };
  return map[category] || "fact";
}

function _categoryToIntent(category) {
  const map = {
    success: "reference",
    failure: "warning",
    optimization: "improvement",
    cost: "reference",
    performance: "reference",
    planning: "procedure",
    general: "reference",
  };
  return map[category] || "reference";
}

// === Determine Proposal Type ===

function _determineProposalType(knowledgeItems, conflicts) {
  if (knowledgeItems.length === 0) return "ignore";
  if (conflicts.length > 0) return "update";
  if (knowledgeItems.length >= 5) return "merge";
  return "create";
}

function _determinePriority(confidence, conflicts) {
  if (conflicts.length >= 2) return "critical";
  if (confidence === "HIGH" && conflicts.length === 0) return "high";
  if (confidence === "LOW") return "low";
  return "normal";
}

// === Create Proposal ===

/**
 * Recebe um Learning Result e produz uma Memory Update Proposal.
 *
 * @param {Object} learningResult — Learning Result
 * @returns {Object} Memory Update Proposal
 */
export function createProposal(learningResult) {
  _stats.proposalsCreated++;
  const startTime = Date.now();
  _log("proposalStarted", { learningId: learningResult?.learningId });

  if (!learningResult || !learningResult.learningId) {
    const proposal = buildMemoryUpdateProposal({
      learningId: null,
      proposalType: "ignore",
      priority: "low",
      confidence: "LOW",
      knowledgeItems: [],
      suggestedMemories: [],
      conflicts: [],
      requiresReview: false,
    });
    _stats.totalConfidenceScore += 1;
    _stats.totalProcessingTimeMs += Date.now() - startTime;
    _stats.proposalTypeDistribution.ignore++;
    _stats.confidenceDistribution.LOW++;
    return proposal;
  }

  // 1. Extrair conhecimento
  const knowledgeItems = extractKnowledge(learningResult);

  // 2. Priorizar conhecimento
  const prioritized = prioritizeKnowledge(knowledgeItems);

  // 3. Detectar conflitos
  const conflicts = detectConflicts(prioritized);

  // 4. Calcular confiança
  const confidence = calculateProposalConfidence(prioritized, learningResult);

  // 5. Gerar memórias sugeridas
  const suggestedMemories = _generateSuggestedMemories(prioritized, learningResult);

  // 6. Determinar tipo e prioridade
  const proposalType = _determineProposalType(prioritized, conflicts);
  const priority = _determinePriority(confidence, conflicts);

  // 7. Requer revisão se houver conflitos ou confiança baixa
  const requiresReview = conflicts.length > 0 || confidence === "LOW";

  if (requiresReview) _stats.reviewRequired++;

  const proposal = buildMemoryUpdateProposal({
    learningId: learningResult.learningId,
    proposalType,
    priority,
    confidence,
    knowledgeItems: prioritized,
    suggestedMemories,
    conflicts,
    requiresReview,
  });

  _stats.totalConfidenceScore += _confidenceToScore(confidence);
  _stats.totalProcessingTimeMs += Date.now() - startTime;
  _stats.proposalTypeDistribution[proposalType]++;
  _stats.confidenceDistribution[confidence]++;
  _log("proposalCompleted", { proposalType, priority, confidence, conflicts: conflicts.length });

  return proposal;
}

// === Describe Proposal ===

/**
 * Produz descrição legível da proposta.
 */
export function describeProposal(proposal) {
  if (!proposal) return null;

  const lines = [
    `Proposta ${proposal.proposalId}`,
    `  Learning: ${proposal.learningId || "—"}`,
    `  Tipo: ${proposal.proposalType}`,
    `  Prioridade: ${proposal.priority}`,
    `  Confiança: ${proposal.confidence}`,
    `  Itens de conhecimento: ${proposal.knowledgeItems.length}`,
    `  Memórias sugeridas: ${proposal.suggestedMemories.length}`,
    `  Conflitos: ${proposal.conflicts.length}`,
    `  Requer revisão: ${proposal.requiresReview ? "Sim" : "Não"}`,
  ];

  if (proposal.knowledgeItems.length > 0) {
    lines.push("  Conhecimento:");
    for (const ki of proposal.knowledgeItems) {
      lines.push(`    • [${ki.category}|${ki.confidence}] ${ki.content}`);
    }
  }

  if (proposal.conflicts.length > 0) {
    lines.push("  Conflitos:");
    for (const c of proposal.conflicts) {
      lines.push(`    ⚠ [${c.type}] ${c.description}`);
    }
  }

  if (proposal.suggestedMemories.length > 0) {
    lines.push("  Memórias sugeridas:");
    for (const sm of proposal.suggestedMemories) {
      lines.push(`    → [${sm.memoryType}|${sm.intent}] ${sm.content}`);
    }
  }

  return lines.join("\n");
}

// === Validate Proposal ===

export function validateProposal(proposal) {
  return validateMemoryUpdateProposal(proposal);
}

// === Observability ===

export function getStats() {
  return {
    proposalsCreated: _stats.proposalsCreated,
    knowledgeItemsGenerated: _stats.knowledgeItemsGenerated,
    conflictsDetected: _stats.conflictsDetected,
    reviewRequired: _stats.reviewRequired,
    averageConfidence:
      _stats.proposalsCreated > 0
        ? _scoreToConfidence(_stats.totalConfidenceScore / _stats.proposalsCreated)
        : "LOW",
    averageProcessingTime:
      _stats.proposalsCreated > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.proposalsCreated)
        : 0,
    proposalTypeDistribution: { ..._stats.proposalTypeDistribution },
    confidenceDistribution: { ..._stats.confidenceDistribution },
    eventLog: [..._stats.eventLog],
  };
}

export function getDecisionLog() {
  return [..._stats.eventLog];
}

export function _resetForTests() {
  _stats.proposalsCreated = 0;
  _stats.knowledgeItemsGenerated = 0;
  _stats.conflictsDetected = 0;
  _stats.reviewRequired = 0;
  _stats.totalConfidenceScore = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.proposalTypeDistribution = { create: 0, update: 0, merge: 0, ignore: 0 };
  _stats.confidenceDistribution = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  _stats.eventLog.length = 0;
}

export default {
  createProposal,
  extractKnowledge,
  classifyKnowledge,
  prioritizeKnowledge,
  detectConflicts,
  calculateProposalConfidence,
  describeProposal,
  validateProposal,
  getStats,
  getDecisionLog,
  _resetForTests,
};