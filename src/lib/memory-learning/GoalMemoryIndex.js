/**
 * GoalMemoryIndex.js — Memory Learning & Goal Intelligence Platform (MLGIP)
 * Sprint 7.1.1B — FASE 1
 *
 * Índice permanente que mapeia Objetivo → toda a memória relacionada.
 * Persistido via localStorage para sobreviver entre sessões.
 *
 * Estrutura de um GoalIndex:
 *   goalId → { sessions, memories, decisions, specialists, connectors,
 *               documents, results, lessons, createdAt, updatedAt }
 */

const STORAGE_KEY = "mlgip_goal_index_v1";

// ─── In-memory store (carregado do localStorage) ──────────────────────────────

let _index = {};

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _index = raw ? JSON.parse(raw) : {};
  } catch {
    _index = {};
  }
}

function _save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_index));
  } catch { /* quota exceeded — ignore */ }
}

_load();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _ensureGoal(goalId, goalTitle = "") {
  if (!_index[goalId]) {
    _index[goalId] = {
      goalId,
      goalTitle,
      sessions: [],
      memories: [],      // { memoryId, type, content, addedAt }
      decisions: [],     // { decisionId, title, addedAt }
      specialists: [],   // string[]
      connectors: [],    // string[]
      documents: [],     // { docId, name, addedAt }
      results: [],       // { summary, achievedAt }
      lessons: [],       // { text, learnedAt }
      weight: 1.0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
  return _index[goalId];
}

function _touch(goalId) {
  if (_index[goalId]) _index[goalId].updatedAt = Date.now();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Registra uma sessão de conversa sob um objetivo. */
export function indexSession(goalId, goalTitle, sessionId) {
  const g = _ensureGoal(goalId, goalTitle);
  if (!g.sessions.includes(sessionId)) g.sessions.push(sessionId);
  _touch(goalId);
  _save();
}

/** Registra uma memória sob um objetivo. */
export function indexMemory(goalId, goalTitle, memory) {
  const g = _ensureGoal(goalId, goalTitle);
  const exists = g.memories.some((m) => m.memoryId === memory.memoryId);
  if (!exists) g.memories.push({ ...memory, addedAt: Date.now() });
  _touch(goalId);
  _save();
}

/** Registra uma decisão sob um objetivo. */
export function indexDecision(goalId, goalTitle, decisionId, title) {
  const g = _ensureGoal(goalId, goalTitle);
  const exists = g.decisions.some((d) => d.decisionId === decisionId);
  if (!exists) g.decisions.push({ decisionId, title, addedAt: Date.now() });
  _touch(goalId);
  _save();
}

/** Registra um especialista consultado sob um objetivo. */
export function indexSpecialist(goalId, goalTitle, specialistName) {
  const g = _ensureGoal(goalId, goalTitle);
  if (!g.specialists.includes(specialistName)) g.specialists.push(specialistName);
  _touch(goalId);
  _save();
}

/** Registra um documento sob um objetivo. */
export function indexDocument(goalId, goalTitle, docId, name) {
  const g = _ensureGoal(goalId, goalTitle);
  const exists = g.documents.some((d) => d.docId === docId);
  if (!exists) g.documents.push({ docId, name, addedAt: Date.now() });
  _touch(goalId);
  _save();
}

/** Registra um resultado atingido. */
export function addResult(goalId, summary) {
  const g = _ensureGoal(goalId);
  g.results.push({ summary, achievedAt: Date.now() });
  _touch(goalId);
  _save();
}

/** Registra uma lição aprendida. */
export function addLesson(goalId, text) {
  const g = _ensureGoal(goalId);
  g.lessons.push({ text, learnedAt: Date.now() });
  _touch(goalId);
  _save();
}

/** Atualiza o peso do objetivo (para relacionamentos ponderados). */
export function setGoalWeight(goalId, weight) {
  const g = _ensureGoal(goalId);
  g.weight = Math.max(0, Math.min(2, weight));
  _touch(goalId);
  _save();
}

/** Retorna o índice completo de um objetivo. */
export function getGoalIndex(goalId) {
  return _index[goalId] ?? null;
}

/** Retorna todos os objetivos indexados. */
export function listGoals() {
  return Object.values(_index).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Busca objetivos por texto. */
export function searchGoals(query) {
  const q = query.toLowerCase();
  return listGoals().filter(
    (g) => g.goalTitle.toLowerCase().includes(q) ||
           g.lessons.some((l) => l.text.toLowerCase().includes(q)) ||
           g.decisions.some((d) => d.title.toLowerCase().includes(q))
  );
}

/** Recupera toda memória relacionada a um objetivo. */
export function recoverByGoal(goalId) {
  return _index[goalId] ?? null;
}

/** Limpa o índice (apenas para testes). */
export function _resetForTests() {
  _index = {};
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
}

export function getStats() {
  const goals = listGoals();
  return {
    totalGoals: goals.length,
    totalMemories: goals.reduce((s, g) => s + g.memories.length, 0),
    totalDecisions: goals.reduce((s, g) => s + g.decisions.length, 0),
    totalLessons: goals.reduce((s, g) => s + g.lessons.length, 0),
    totalSessions: goals.reduce((s, g) => s + g.sessions.length, 0),
  };
}