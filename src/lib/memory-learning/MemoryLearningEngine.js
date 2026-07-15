/**
 * MemoryLearningEngine.js — Memory Learning & Goal Intelligence Platform (MLGIP)
 * Sprint 7.1.1B — FASES 2, 3 e 7
 *
 * Motor de aprendizado da memória.
 * Registra utilização e calcula Learning Score, Confidence Evolution e Reinforcement.
 *
 * Toda alteração é auditável. Nenhuma memória é apagada.
 */

const STORAGE_KEY = "mlgip_learning_v1";

// ─── Store ────────────────────────────────────────────────────────────────────

// memoryId → { learningScore, confidenceLevel, useCount, ignoreCount,
//               goodResponseCount, badResponseCount, lastUsedAt,
//               auditTrail: [{ event, delta, before, after, ts }] }
let _store = {};

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _store = raw ? JSON.parse(raw) : {};
  } catch { _store = {}; }
}

function _save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_store)); } catch { /* */ }
}

_load();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _ensure(memoryId, kind = "generic") {
  if (!_store[memoryId]) {
    _store[memoryId] = {
      memoryId,
      kind,
      learningScore: 0.5,      // [0..1] — começa neutro
      confidenceLevel: 0.5,    // [0..1] — começa neutro
      useCount: 0,
      ignoreCount: 0,
      goodResponseCount: 0,
      badResponseCount: 0,
      lastUsedAt: null,
      createdAt: Date.now(),
      auditTrail: [],
    };
  }
  return _store[memoryId];
}

function _audit(rec, event, delta, before, after) {
  rec.auditTrail.push({ event, delta: Math.round(delta * 1000) / 1000, before: Math.round(before * 1000) / 1000, after: Math.round(after * 1000) / 1000, ts: Date.now() });
  // Keep last 50 entries
  if (rec.auditTrail.length > 50) rec.auditTrail.shift();
}

function _clamp(v) { return Math.max(0, Math.min(1, v)); }

// ─── FASE 2 — Learning Score ──────────────────────────────────────────────────

/** Memória foi utilizada numa resposta. */
export function recordUsed(memoryId, kind = "generic") {
  const rec = _ensure(memoryId, kind);
  rec.useCount++;
  rec.lastUsedAt = Date.now();
  const delta = 0.05;
  const before = rec.learningScore;
  rec.learningScore = _clamp(rec.learningScore + delta);
  _audit(rec, "used", delta, before, rec.learningScore);
  _save();
}

/** Memória foi ignorada (disponível mas não selecionada). */
export function recordIgnored(memoryId, kind = "generic") {
  const rec = _ensure(memoryId, kind);
  rec.ignoreCount++;
  const delta = -0.02;
  const before = rec.learningScore;
  rec.learningScore = _clamp(rec.learningScore + delta);
  _audit(rec, "ignored", delta, before, rec.learningScore);
  _save();
}

// ─── FASE 3 — Confidence Evolution ───────────────────────────────────────────

/** Memória contribuiu para uma boa resposta → confiança aumenta. */
export function reinforce(memoryId, kind = "generic", delta = 0.08) {
  const rec = _ensure(memoryId, kind);
  rec.goodResponseCount++;
  const before = rec.confidenceLevel;
  rec.confidenceLevel = _clamp(rec.confidenceLevel + delta);
  _audit(rec, "reinforced", delta, before, rec.confidenceLevel);
  // Learning score also benefits
  rec.learningScore = _clamp(rec.learningScore + delta * 0.5);
  _save();
}

/** Memória contribuiu para resposta ruim → confiança cai. */
export function penalize(memoryId, kind = "generic", delta = 0.06) {
  const rec = _ensure(memoryId, kind);
  rec.badResponseCount++;
  const before = rec.confidenceLevel;
  rec.confidenceLevel = _clamp(rec.confidenceLevel - delta);
  _audit(rec, "penalized", -delta, before, rec.confidenceLevel);
  _save();
}

// ─── FASE 7 — Memory Reinforcement ───────────────────────────────────────────

/** Registra feedback de uma lista de memórias usadas. */
export function applyFeedback(memoryIds, outcome, kinds = {}) {
  // outcome: "good" | "bad" | "neutral"
  for (const id of memoryIds) {
    const kind = kinds[id] || "generic";
    if (outcome === "good") reinforce(id, kind);
    else if (outcome === "bad") penalize(id, kind);
    else recordUsed(id, kind);
  }
}

// ─── Getters ──────────────────────────────────────────────────────────────────

export function getLearningRecord(memoryId) {
  return _store[memoryId] ?? null;
}

export function getAllRecords() {
  return Object.values(_store);
}

/** Aplica o learning score ao score base de uma memória. */
export function applyLearningBoost(baseScore, memoryId) {
  const rec = _store[memoryId];
  if (!rec) return baseScore;
  // Learning score desvia em ±20% do score base
  const boost = (rec.learningScore - 0.5) * 0.4;
  return Math.max(0, Math.min(1, baseScore + boost));
}

/** Retorna confidence como string categórica. */
export function getConfidenceLabel(memoryId) {
  const rec = _store[memoryId];
  if (!rec) return "UNKNOWN";
  const c = rec.confidenceLevel;
  if (c >= 0.75) return "HIGH";
  if (c >= 0.45) return "MEDIUM";
  return "LOW";
}

export function getStats() {
  const all = getAllRecords();
  return {
    total: all.length,
    avgLearningScore: all.length ? (all.reduce((s, r) => s + r.learningScore, 0) / all.length).toFixed(3) : 0,
    avgConfidence: all.length ? (all.reduce((s, r) => s + r.confidenceLevel, 0) / all.length).toFixed(3) : 0,
    totalUsed: all.reduce((s, r) => s + r.useCount, 0),
    totalIgnored: all.reduce((s, r) => s + r.ignoreCount, 0),
    totalReinforced: all.reduce((s, r) => s + r.goodResponseCount, 0),
    totalPenalized: all.reduce((s, r) => s + r.badResponseCount, 0),
  };
}

export function _resetForTests() {
  _store = {};
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
}