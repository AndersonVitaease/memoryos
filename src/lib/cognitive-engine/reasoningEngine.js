/**
 * Reasoning Engine (Fase 3 — Sprint 16)
 *
 * Responsabilidade única: RACIOCINAR. Transforma resultados do Pipeline
 * em raciocínio estruturado — premissas, evidências, conflitos,
 * hipóteses, conclusões e confiança.
 *
 * O QUE FAZ:
 *   - Receber Pipeline Execution + contexto
 *   - Extrair premissas dos resultados
 *   - Agrupar evidências por step
 *   - Detectar conflitos entre evidências
 *   - Gerar hipóteses
 *   - Produzir conclusões estruturadas
 *   - Calcular nível de confiança (determinístico)
 *
 * O QUE NÃO FAZ:
 *   - Executar componentes
 *   - Chamar APIs
 *   - Responder ao usuário
 *   - Modificar Memory Records
 *   - Alterar o Pipeline
 *   - Tomar decisões
 *   - Reflection / Self Evaluation / Planning / Learning / LLM
 *
 * Arquitetura:
 *   Cognitive Pipeline → Reasoning Engine → Decision Engine (futura)
 */

import {
  buildReasoningGraph,
  validateReasoningGraph,
  CONFIDENCE_LEVELS,
  REASONING_GRAPH_FIELDS,
} from "./reasoningGraph";

// === Observability ===
const _stats = {
  reasoningStarted: 0,
  reasoningCompleted: 0,
  premisesExtracted: 0,
  evidenceCollected: 0,
  conflictsDetected: 0,
  hypothesesGenerated: 0,
  conclusionsGenerated: 0,
  totalProcessingTimeMs: 0,
  operations: 0,
  confidenceDistribution: { LOW: 0, MEDIUM: 0, HIGH: 0 },
};

const _eventLog = [];

function _log(event, data) {
  _eventLog.push({ event, ...data, timestamp: new Date().toISOString() });
}

// === Premise Extraction ===

/**
 * Extrai premissas dos resultados dos steps de uma execução.
 * Uma premissa é uma afirmação derivada do resultado de um step.
 */
export function extractPremises(execution, context = {}) {
  const premises = [];

  if (!execution || !Array.isArray(execution.steps)) {
    return premises;
  }

  for (const step of execution.steps) {
    if (step.status !== "COMPLETED" || !step.result) {
      continue;
    }

    const premise = {
      id: `premise-${step.order}`,
      source: "pipeline_step",
      stepOrder: step.order,
      participant: step.participant,
      action: step.action,
      statement: _premiseStatement(step),
      confidence: _stepConfidence(step),
    };
    premises.push(premise);
  }

  // Premissas do contexto
  if (context.goal) {
    premises.push({
      id: "premise-goal",
      source: "context",
      statement: `Objetivo: ${context.goal}`,
      confidence: "HIGH",
    });
  }

  _stats.premisesExtracted += premises.length;
  _log("premisesExtracted", { count: premises.length });
  return premises;
}

function _premiseStatement(step) {
  const result = step.result || {};
  if (result.statement) return result.statement;
  return `${step.participant} executou ${step.action} com sucesso`;
}

function _stepConfidence(step) {
  if (step.duration !== null && step.duration > 100) return "LOW";
  if (step.result && step.result.confidence) return step.result.confidence;
  return "MEDIUM";
}

// === Evidence Collection ===

/**
 * Agrupa evidências dos resultados dos steps.
 * Cada evidência contém o step de origem, o valor e o peso.
 */
export function collectEvidence(execution, context = {}) {
  const evidence = [];

  if (!execution || !Array.isArray(execution.steps)) {
    return evidence;
  }

  for (const step of execution.steps) {
    if (step.status !== "COMPLETED" || !step.result) {
      continue;
    }

    const ev = {
      id: `evidence-${step.order}`,
      stepOrder: step.order,
      participant: step.participant,
      value: step.result.value || step.result,
      weight: _evidenceWeight(step),
      tags: step.result.tags || [],
    };
    evidence.push(ev);
  }

  // Evidências de contexto (ex: memórias recuperadas)
  if (context.memories && Array.isArray(context.memories)) {
    for (const mem of context.memories) {
      evidence.push({
        id: `evidence-mem-${mem.id || evidence.length}`,
        stepOrder: 0,
        participant: "MemoryEngine",
        value: mem.value || mem.content || JSON.stringify(mem),
        weight: mem.importance === "high" ? 3 : mem.importance === "medium" ? 2 : 1,
        tags: mem.tags || [],
      });
    }
  }

  _stats.evidenceCollected += evidence.length;
  _log("evidenceCollected", { count: evidence.length });
  return evidence;
}

function _evidenceWeight(step) {
  const conf = _stepConfidence(step);
  if (conf === "HIGH") return 3;
  if (conf === "MEDIUM") return 2;
  return 1;
}

// === Conflict Detection ===

/**
 * Detecta conflitos entre evidências.
 * Um conflito ocorre quando duas evidências do mesmo participante
 * possuem valores divergentes (ou contradição explícita).
 */
export function detectConflicts(evidence) {
  const conflicts = [];

  if (!Array.isArray(evidence) || evidence.length < 2) {
    _log("conflictsDetected", { count: 0 });
    return conflicts;
  }

  // Agrupa por participante
  const byParticipant = new Map();
  for (const ev of evidence) {
    if (!byParticipant.has(ev.participant)) {
      byParticipant.set(ev.participant, []);
    }
    byParticipant.get(ev.participant).push(ev);
  }

  // Procura conflitos dentro de cada grupo
  for (const [participant, evs] of byParticipant.entries()) {
    for (let i = 0; i < evs.length; i++) {
      for (let j = i + 1; j < evs.length; j++) {
        if (_isConflict(evs[i], evs[j])) {
          conflicts.push({
            id: `conflict-${i}-${j}`,
            participant,
            evidenceA: evs[i].id,
            evidenceB: evs[j].id,
            valueA: evs[i].value,
            valueB: evs[j].value,
            reason: "contradictory_values",
          });
        }
      }
    }
  }

  // Conflitos explícitos marcados nos resultados
  for (const ev of evidence) {
    if (ev.value && typeof ev.value === "object" && ev.value.contradicts) {
      conflicts.push({
        id: `conflict-${ev.id}`,
        participant: ev.participant,
        evidenceA: ev.id,
        evidenceB: ev.value.contradicts,
        reason: "explicit_contradiction",
      });
    }
  }

  _stats.conflictsDetected += conflicts.length;
  _log("conflictsDetected", { count: conflicts.length });
  return conflicts;
}

function _isConflict(a, b) {
  if (!a || !b) return false;
  const va = typeof a.value === "string" ? a.value : JSON.stringify(a.value);
  const vb = typeof b.value === "string" ? b.value : JSON.stringify(b.value);
  // Conflito se valores são diferentes e ambos não vazios
  return va !== vb && va && vb && va !== "null" && vb !== "null";
}

// === Hypothesis Generation ===

/**
 * Gera hipóteses a partir de premissas e evidências.
 * Uma hipótese é uma inferência baseada nas premissas disponíveis.
 */
export function generateHypotheses(premises, evidence, conflicts = []) {
  const hypotheses = [];

  if (premises.length === 0 && evidence.length === 0) {
    return hypotheses;
  }

  // Hipótese 1: baseada em consenso (sem conflitos)
  if (conflicts.length === 0 && premises.length > 0) {
    hypotheses.push({
      id: "hypothesis-consensus",
      type: "consensus",
      statement: `Consenso: ${premises.length} premissas convergem sem conflitos`,
      basedOn: premises.map((p) => p.id),
      confidence: _confidenceFromPremises(premises),
    });
  }

  // Hipótese 2: baseada em evidência mais forte
  if (evidence.length > 0) {
    const strongest = evidence.reduce((max, ev) => (ev.weight > max.weight ? ev : max), evidence[0]);
    hypotheses.push({
      id: "hypothesis-strongest",
      type: "strongest_evidence",
      statement: `Evidência dominante de ${strongest.participant} (peso ${strongest.weight})`,
      basedOn: [strongest.id],
      confidence: strongest.weight >= 3 ? "HIGH" : strongest.weight >= 2 ? "MEDIUM" : "LOW",
    });
  }

  // Hipótese 3: baseada em conflitos (se houver)
  if (conflicts.length > 0) {
    hypotheses.push({
      id: "hypothesis-conflict",
      type: "conflict_resolution",
      statement: `${conflicts.length} conflito(s) detectado(s) — evidência insuficiente para conclusão definitiva`,
      basedOn: conflicts.map((c) => c.id),
      confidence: "LOW",
    });
  }

  _stats.hypothesesGenerated += hypotheses.length;
  _log("hypothesesGenerated", { count: hypotheses.length });
  return hypotheses;
}

function _confidenceFromPremises(premises) {
  const high = premises.filter((p) => p.confidence === "HIGH").length;
  const medium = premises.filter((p) => p.confidence === "MEDIUM").length;
  if (high >= premises.length / 2) return "HIGH";
  if (high + medium >= premises.length / 2) return "MEDIUM";
  return "LOW";
}

// === Conclusion Generation ===

/**
 * Produz conclusões estruturadas a partir de hipóteses.
 */
export function generateConclusions(hypotheses, conflicts = []) {
  const conclusions = [];

  if (hypotheses.length === 0) {
    conclusions.push({
      id: "conclusion-none",
      statement: "Evidência insuficiente para gerar conclusões",
      confidence: "LOW",
    });
    return conclusions;
  }

  // Se há conflitos, a conclusão é de baixa confiança
  if (conflicts.length > 0) {
    conclusions.push({
      id: "conclusion-conflict",
      statement: `Não é possível concluir — ${conflicts.length} conflito(s) não resolvido(s)`,
      confidence: "LOW",
      basedOn: hypotheses.filter((h) => h.type === "conflict_resolution").map((h) => h.id),
    });
  }

  // Conclusão de consenso
  const consensus = hypotheses.find((h) => h.type === "consensus");
  if (consensus) {
    conclusions.push({
      id: "conclusion-consensus",
      statement: consensus.statement,
      confidence: consensus.confidence,
      basedOn: [consensus.id],
    });
  }

  // Conclusão de evidência dominante
  const strongest = hypotheses.find((h) => h.type === "strongest_evidence");
  if (strongest) {
    conclusions.push({
      id: "conclusion-strongest",
      statement: strongest.statement,
      confidence: strongest.confidence,
      basedOn: [strongest.id],
    });
  }

  _stats.conclusionsGenerated += conclusions.length;
  _log("conclusionsGenerated", { count: conclusions.length });
  return conclusions;
}

// === Confidence Calculation ===

/**
 * Calcula o nível de confiança geral do raciocínio (determinístico).
 *
 * Regras:
 *   - HIGH: sem conflitos, maioria de premissas/evidências com peso alto
 *   - MEDIUM: sem conflitos, evidências moderadas
 *   - LOW: conflitos presentes ou poucas evidências
 */
export function calculateConfidence(premises, evidence, conflicts, conclusions) {
  // Sempre LOW se há conflitos
  if (conflicts && conflicts.length > 0) {
    return "LOW";
  }

  // Sempre LOW se não há evidências
  if (!evidence || evidence.length === 0) {
    return "LOW";
  }

  // Conta evidências de alto peso
  const highWeight = evidence.filter((e) => e.weight >= 3).length;
  const mediumWeight = evidence.filter((e) => e.weight >= 2).length;
  const total = evidence.length;

  // HIGH se maioria das evidências tem peso alto
  if (highWeight >= Math.ceil(total / 2)) {
    return "HIGH";
  }

  // MEDIUM se maioria tem pelo menos peso médio
  if (highWeight + mediumWeight >= Math.ceil(total / 2)) {
    return "MEDIUM";
  }

  return "LOW";
}

// === Build Reasoning ===

/**
 * Constrói um Reasoning Graph completo a partir de uma execução.
 *
 * @param {Object} execution — Pipeline Execution
 * @param {Object} [context] — contexto adicional (goal, memories, etc.)
 * @returns {Object} Reasoning Graph
 */
export function buildReasoning(execution, context = {}) {
  _stats.operations++;
  const startTime = Date.now();
  _stats.reasoningStarted++;
  _log("reasoningStarted", { planId: execution?.planId });

  const premises = extractPremises(execution, context);
  const evidence = collectEvidence(execution, context);
  const conflicts = detectConflicts(evidence);
  const hypotheses = generateHypotheses(premises, evidence, conflicts);
  const conclusions = generateConclusions(hypotheses, conflicts);
  const confidence = calculateConfidence(premises, evidence, conflicts, conclusions);

  const graph = buildReasoningGraph({
    premises,
    evidence,
    conflicts,
    hypotheses,
    conclusions,
    confidence,
  });

  _stats.reasoningCompleted++;
  _stats.confidenceDistribution[confidence]++;
  const elapsed = Date.now() - startTime;
  _stats.totalProcessingTimeMs += elapsed;
  _log("reasoningCompleted", { reasoningId: graph.reasoningId, confidence, elapsed });

  return graph;
}

// === Describe ===

/**
 * Descreve um raciocínio em texto legível.
 */
export function describeReasoning(graph) {
  if (!graph) return null;

  const lines = [
    `Raciocínio ${graph.reasoningId}`,
    `  Confiança: ${graph.confidence}`,
    `  Premissas: ${graph.premises.length}`,
    `  Evidências: ${graph.evidence.length}`,
    `  Conflitos: ${graph.conflicts.length}`,
    `  Hipóteses: ${graph.hypotheses.length}`,
    `  Conclusões: ${graph.conclusions.length}`,
  ];

  if (graph.premises.length > 0) {
    lines.push(`  Premissas:`);
    for (const p of graph.premises) {
      lines.push(`    [${p.confidence}] ${p.statement}`);
    }
  }

  if (graph.conclusions.length > 0) {
    lines.push(`  Conclusões:`);
    for (const c of graph.conclusions) {
      lines.push(`    [${c.confidence}] ${c.statement}`);
    }
  }

  return lines.join("\n");
}

// === Validate ===

export function validateReasoning(graph) {
  return validateReasoningGraph(graph);
}

// === Observability ===

export function getStats() {
  return {
    ..._stats,
    averageProcessingTimeMs:
      _stats.reasoningCompleted > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.reasoningCompleted)
        : 0,
    eventLog: [..._eventLog],
  };
}

export function getDecisionLog() {
  return [..._eventLog];
}

export function _resetForTests() {
  _stats.reasoningStarted = 0;
  _stats.reasoningCompleted = 0;
  _stats.premisesExtracted = 0;
  _stats.evidenceCollected = 0;
  _stats.conflictsDetected = 0;
  _stats.hypothesesGenerated = 0;
  _stats.conclusionsGenerated = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.operations = 0;
  _stats.confidenceDistribution = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  _eventLog.length = 0;
}

export default {
  buildReasoning,
  extractPremises,
  collectEvidence,
  detectConflicts,
  generateHypotheses,
  generateConclusions,
  calculateConfidence,
  describeReasoning,
  validateReasoning,
  getStats,
  getDecisionLog,
  _resetForTests,
};