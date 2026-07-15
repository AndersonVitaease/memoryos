/**
 * OutcomeFeedbackEngine.js — Cognitive Diagnosis Platform (CDP)
 * Sprint 7.1.2 — FASE 4
 *
 * Coleta feedback de resultado após cada resposta.
 * Alimenta automaticamente a MLGIP (Memory Learning Engine).
 *
 * Read-only sobre os dados — apenas escreve via APIs do MLGIP.
 */

import { applyFeedback } from "@/lib/memory-learning/MemoryLearningEngine";
import { addResult, addLesson } from "@/lib/memory-learning/GoalMemoryIndex";
import { recordOutcome } from "./CognitiveTraceEngine";
import { recordMemoryDecision } from "@/lib/memory-learning/MLGIPObservability";

// In-memory feedback store (lightweight)
const _feedbacks = [];
const MAX_FEEDBACKS = 200;

/**
 * @typedef {Object} OutcomeFeedback
 * @property {string}  traceId
 * @property {string}  sessionId
 * @property {string}  [goalId]
 * @property {boolean} [resolved]       - O usuário resolveu o problema?
 * @property {boolean} [goalAdvanced]   - O objetivo avançou?
 * @property {boolean} [useful]         - A resposta foi útil?
 * @property {boolean} [repeated]       - O usuário perguntou de novo?
 * @property {boolean} [corrected]      - Houve correção?
 * @property {string}  [userNote]       - Texto de feedback do usuário (opcional)
 */

/**
 * Registra feedback de resultado e propaga para MLGIP.
 * @param {Object} trace - CognitiveTrace
 * @param {OutcomeFeedback} feedback
 */
export function submitFeedback(trace, feedback) {
  if (!trace) return;

  const entry = {
    traceId: trace.traceId,
    sessionId: trace.sessionId,
    goalId: feedback.goalId ?? trace.goals?.[0]?.goalId ?? null,
    resolved: feedback.resolved ?? null,
    goalAdvanced: feedback.goalAdvanced ?? null,
    useful: feedback.useful ?? null,
    repeated: feedback.repeated ?? false,
    corrected: feedback.corrected ?? false,
    userNote: feedback.userNote ?? null,
    ts: Date.now(),
  };

  _feedbacks.unshift(entry);
  if (_feedbacks.length > MAX_FEEDBACKS) _feedbacks.pop();

  // ── Record on trace ──────────────────────────────────────────────────────────
  recordOutcome(trace.traceId, entry);

  // ── Determine outcome for MLGIP ──────────────────────────────────────────────
  const memoryIds = (trace.memories ?? []).map((m) => m.memoryId).filter(Boolean);
  const outcome = _resolveOutcome(feedback);

  if (memoryIds.length > 0) {
    applyFeedback(memoryIds, outcome);
  }

  // ── MLGIP Observability ───────────────────────────────────────────────────────
  recordMemoryDecision({
    executionId: trace.executionId,
    goalId: entry.goalId,
    goalTitle: trace.goals?.[0]?.goalTitle ?? null,
    memoriesUsed: memoryIds,
    memoriesIgnored: [],
    memoriesReinforced: outcome === "good" ? memoryIds : [],
    memoriesPenalized: outcome === "bad" ? memoryIds : [],
    confidenceChanges: {},
    decayApplied: {},
    edgesCreated: 0,
    edgesStrengthened: outcome === "good" ? memoryIds.length : 0,
  });

  // ── Goal Index ────────────────────────────────────────────────────────────────
  if (entry.goalId) {
    if (feedback.resolved) {
      addResult(entry.goalId, `Problema resolvido em sessão ${trace.sessionId}`);
    }
    if (feedback.userNote) {
      addLesson(entry.goalId, feedback.userNote);
    }
    if (feedback.corrected) {
      addLesson(entry.goalId, `Resposta precisou de correção: sessão ${trace.sessionId}`);
    }
  }

  return entry;
}

function _resolveOutcome(feedback) {
  if (feedback.resolved === true && feedback.useful !== false) return "good";
  if (feedback.resolved === false || feedback.corrected === true) return "bad";
  return "neutral";
}

// ─── Implicit feedback (from conversation patterns) ───────────────────────────

/**
 * Feedback implícito: se o usuário enviou outra mensagem logo depois,
 * provavelmente a resposta foi útil.
 */
export function recordImplicitContinuation(trace) {
  submitFeedback(trace, { useful: true, resolved: null, repeated: false });
}

/**
 * Feedback implícito: mensagem repetida ou reformulada.
 */
export function recordImplicitRepetition(trace) {
  submitFeedback(trace, { useful: false, repeated: true, resolved: false });
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function getFeedbacks(limit = 20) {
  return _feedbacks.slice(0, limit);
}

export function getFeedbackStats() {
  const total = _feedbacks.length;
  const resolved = _feedbacks.filter((f) => f.resolved === true).length;
  const useful = _feedbacks.filter((f) => f.useful === true).length;
  const corrected = _feedbacks.filter((f) => f.corrected === true).length;
  const repeated = _feedbacks.filter((f) => f.repeated === true).length;

  return {
    total,
    resolvedRate: total ? (resolved / total * 100).toFixed(1) + "%" : "n/a",
    usefulRate: total ? (useful / total * 100).toFixed(1) + "%" : "n/a",
    correctedRate: total ? (corrected / total * 100).toFixed(1) + "%" : "n/a",
    repeatedRate: total ? (repeated / total * 100).toFixed(1) + "%" : "n/a",
  };
}

export function clearFeedbacks() { _feedbacks.length = 0; }