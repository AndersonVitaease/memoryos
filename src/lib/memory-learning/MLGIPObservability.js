/**
 * MLGIPObservability.js — Memory Learning & Goal Intelligence Platform (MLGIP)
 * Sprint 7.1.1B — FASE 10
 *
 * Integração com o Cognitive Observability Platform (COP).
 * Registra em cada decisão:
 *   - Goal utilizado
 *   - Memórias reforçadas / penalizadas
 *   - Confidence anterior / nova
 *   - Decay aplicado
 *   - Relacionamentos criados / fortalecidos
 *
 * Não depende do COP diretamente (evita circular deps).
 * Emite eventos para o event store interno que o COP pode consumir.
 */

const MAX_EVENTS = 200;

const _eventLog = [];

// ─── Event Recording ──────────────────────────────────────────────────────────

function _emit(type, payload) {
  _eventLog.push({ type, payload, ts: Date.now() });
  if (_eventLog.length > MAX_EVENTS) _eventLog.shift();
}

/**
 * Registra uma decisão de memória completa.
 *
 * @param {Object} opts
 *   @param {string}   opts.executionId      - ID do pipeline de conversa
 *   @param {string}   [opts.goalId]         - Objetivo utilizado
 *   @param {string}   [opts.goalTitle]
 *   @param {string[]} opts.memoriesUsed     - IDs de memórias utilizadas
 *   @param {string[]} opts.memoriesIgnored  - IDs de memórias ignoradas
 *   @param {string[]} opts.memoriesReinforced
 *   @param {string[]} opts.memoriesPenalized
 *   @param {Object}   opts.confidenceChanges - { memoryId: { before, after } }
 *   @param {Object}   opts.decayApplied     - { memoryId: { before, after, delta } }
 *   @param {number}   opts.edgesCreated
 *   @param {number}   opts.edgesStrengthened
 */
export function recordMemoryDecision(opts) {
  _emit("MEMORY_DECISION", {
    executionId: opts.executionId,
    goalId: opts.goalId ?? null,
    goalTitle: opts.goalTitle ?? null,
    memoriesUsed: opts.memoriesUsed ?? [],
    memoriesIgnored: opts.memoriesIgnored ?? [],
    memoriesReinforced: opts.memoriesReinforced ?? [],
    memoriesPenalized: opts.memoriesPenalized ?? [],
    confidenceChanges: opts.confidenceChanges ?? {},
    decayApplied: opts.decayApplied ?? {},
    edgesCreated: opts.edgesCreated ?? 0,
    edgesStrengthened: opts.edgesStrengthened ?? 0,
  });
}

/** Registra criação/fortalecimento de relacionamento. */
export function recordRelationship(from, to, relation, weight, op = "created") {
  _emit("RELATIONSHIP", { from, to, relation, weight, op });
}

/** Registra aprendizado aplicado. */
export function recordLearning(memoryId, event, before, after) {
  _emit("LEARNING", { memoryId, event, before, after, delta: after - before });
}

/** Registra decaimento. */
export function recordDecay(memoryId, before, after, delta) {
  _emit("DECAY", { memoryId, before, after, delta });
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function getEvents(type = null, limit = 50) {
  const filtered = type ? _eventLog.filter((e) => e.type === type) : _eventLog;
  return filtered.slice(-limit).reverse();
}

export function getLastDecision() {
  const events = _eventLog.filter((e) => e.type === "MEMORY_DECISION");
  return events[events.length - 1] ?? null;
}

export function getStats() {
  const decisions = _eventLog.filter((e) => e.type === "MEMORY_DECISION");
  const relationships = _eventLog.filter((e) => e.type === "RELATIONSHIP");
  const learnings = _eventLog.filter((e) => e.type === "LEARNING");
  const decays = _eventLog.filter((e) => e.type === "DECAY");

  return {
    totalEvents: _eventLog.length,
    decisions: decisions.length,
    relationships: relationships.length,
    learnings: learnings.length,
    decays: decays.length,
    totalMemoriesReinforced: decisions.reduce((s, e) => s + (e.payload.memoriesReinforced?.length ?? 0), 0),
    totalMemoriesPenalized: decisions.reduce((s, e) => s + (e.payload.memoriesPenalized?.length ?? 0), 0),
    totalEdgesCreated: decisions.reduce((s, e) => s + (e.payload.edgesCreated ?? 0), 0),
  };
}

export function clearEvents() { _eventLog.length = 0; }