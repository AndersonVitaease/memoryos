/**
 * CognitiveTraceEngine.js — Cognitive Diagnosis Platform (CDP)
 * Sprint 7.1.2 — FASE 1
 *
 * Registra toda execução cognitiva como um Trace auditável.
 * Cada resposta gera exatamente um Trace contendo:
 *   context, goals, pipeline, specialists, connectors, memories,
 *   decisions, ranking, confidence, learning, outcome.
 *
 * Read-only: nunca modifica memórias, objetivos ou pipeline.
 * Consome: COP events, MLGIP observability, MIP ranked data.
 */

const MAX_TRACES = 100;
const _traces = []; // CognitiveTrace[]

// ─── Types (JSDoc) ────────────────────────────────────────────────────────────
/**
 * @typedef {Object} CognitiveTrace
 * @property {string}  traceId
 * @property {string}  executionId
 * @property {string}  sessionId
 * @property {string}  userInput
 * @property {number}  startedAt
 * @property {number}  [finishedAt]
 * @property {number}  [durationMs]
 * @property {string}  status  "recording"|"complete"|"error"
 * @property {Object}  context
 * @property {Object[]} goals
 * @property {Object[]} pipeline
 * @property {Object[]} specialists
 * @property {Object[]} connectors
 * @property {Object[]} memories
 * @property {Object[]} decisions
 * @property {Object}  ranking
 * @property {number}  confidence
 * @property {Object}  learning
 * @property {Object}  [outcome]
 */

function _makeId() {
  return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * Abre um novo trace para uma execução cognitiva.
 * @returns {string} traceId
 */
export function beginTrace(executionId, sessionId, userInput) {
  const trace = {
    traceId: _makeId(),
    executionId: executionId ?? `exec-${Date.now()}`,
    sessionId: sessionId ?? "unknown",
    userInput: userInput ?? "",
    startedAt: Date.now(),
    finishedAt: null,
    durationMs: null,
    status: "recording",
    context: {},
    goals: [],
    pipeline: [],
    specialists: [],
    connectors: [],
    memories: [],
    decisions: [],
    ranking: {},
    confidence: 0,
    learning: {},
    outcome: null,
  };

  _traces.unshift(trace);
  if (_traces.length > MAX_TRACES) _traces.pop();
  return trace.traceId;
}

/** Obtém um trace pelo ID. */
export function getTrace(traceId) {
  return _traces.find((t) => t.traceId === traceId) ?? null;
}

/** Fecha e finaliza um trace. */
export function finalizeTrace(traceId, outcome = null) {
  const trace = getTrace(traceId);
  if (!trace) return;
  trace.finishedAt = Date.now();
  trace.durationMs = trace.finishedAt - trace.startedAt;
  trace.status = "complete";
  if (outcome) trace.outcome = outcome;
}

/** Marca trace como erro. */
export function errorTrace(traceId, error) {
  const trace = getTrace(traceId);
  if (!trace) return;
  trace.status = "error";
  trace.finishedAt = Date.now();
  trace.durationMs = trace.finishedAt - trace.startedAt;
  trace.outcome = { error: String(error) };
}

// ─── Section recorders ────────────────────────────────────────────────────────

export function recordContext(traceId, contextData) {
  const t = getTrace(traceId); if (!t) return;
  t.context = {
    sessionSummary: contextData.sessionSummary ?? null,
    entitiesCount: contextData.entitiesCount ?? 0,
    topicsCount: contextData.topicsCount ?? 0,
    decisionsCount: contextData.decisionsCount ?? 0,
    tasksCount: contextData.tasksCount ?? 0,
    keywordsCount: contextData.keywordsCount ?? 0,
    builtAtMs: contextData.builtAtMs ?? 0,
    raw: contextData.raw ?? null,
  };
}

export function recordGoals(traceId, goals) {
  const t = getTrace(traceId); if (!t) return;
  t.goals = (goals ?? []).map((g) => ({
    goalId: g.goalId,
    goalTitle: g.goalTitle,
    sessions: g.sessions?.length ?? 0,
    decisions: g.decisions?.length ?? 0,
    lessons: g.lessons?.length ?? 0,
    weight: g.weight ?? 1,
  }));
}

export function recordPipelineStep(traceId, step) {
  const t = getTrace(traceId); if (!t) return;
  t.pipeline.push({
    name: step.name,
    label: step.label,
    status: step.status,
    durationMs: step.durationMs ?? null,
    startedAt: step.startedAt ?? null,
  });
}

export function recordSpecialists(traceId, activated, discarded) {
  const t = getTrace(traceId); if (!t) return;
  t.specialists = [
    ...(activated ?? []).map((s) => ({ ...s, activated: true })),
    ...(discarded ?? []).map((s) => ({ ...s, activated: false })),
  ];
}

export function recordConnectors(traceId, connectors) {
  const t = getTrace(traceId); if (!t) return;
  t.connectors = (connectors ?? []).map((c) => ({
    connectorId: c.connectorId ?? c.id,
    name: c.connectorName ?? c.name,
    capability: c.capability,
    status: c.status,
    durationMs: c.durationMs ?? null,
    retryCount: c.retryCount ?? 0,
  }));
}

export function recordMemories(traceId, memories) {
  const t = getTrace(traceId); if (!t) return;
  t.memories = (memories ?? []).map((m) => ({
    memoryId: m.memoryId ?? m.id,
    type: m.type,
    label: m.label ?? m.content?.slice(0, 80) ?? "",
    score: m.score ?? 0,
    priority: m.priority ?? "MEDIUM",
    confidence: m.confidence ?? "MEDIUM",
    reason: m.reason ?? "",
    used: m.used ?? true,
  }));
}

export function recordDecisions(traceId, decisions) {
  const t = getTrace(traceId); if (!t) return;
  t.decisions = (decisions ?? []).map((d) => ({
    category: d.category,
    decision: d.decision,
    reasoning: d.reasoning ?? "",
    confidence: d.confidence ?? 0,
    alternatives: d.alternatives ?? [],
  }));
}

export function recordRanking(traceId, ranked) {
  const t = getTrace(traceId); if (!t) return;
  const summary = {};
  for (const [type, items] of Object.entries(ranked ?? {})) {
    if (Array.isArray(items)) {
      summary[type] = {
        count: items.length,
        avgScore: items.length ? +(items.reduce((s, r) => s + (r.score ?? 0), 0) / items.length).toFixed(3) : 0,
        highCount: items.filter((r) => r.priority === "HIGH").length,
      };
    }
  }
  t.ranking = summary;
}

export function recordConfidence(traceId, confidence) {
  const t = getTrace(traceId); if (!t) return;
  t.confidence = Math.max(0, Math.min(1, confidence));
}

export function recordLearning(traceId, learning) {
  const t = getTrace(traceId); if (!t) return;
  t.learning = {
    memoriesReinforced: learning.memoriesReinforced ?? [],
    memoriesPenalized: learning.memoriesPenalized ?? [],
    edgesCreated: learning.edgesCreated ?? 0,
    edgesStrengthened: learning.edgesStrengthened ?? 0,
    goalId: learning.goalId ?? null,
  };
}

export function recordOutcome(traceId, outcome) {
  const t = getTrace(traceId); if (!t) return;
  t.outcome = {
    resolved: outcome.resolved ?? null,
    goalAdvanced: outcome.goalAdvanced ?? null,
    useful: outcome.useful ?? null,
    repeated: outcome.repeated ?? false,
    corrected: outcome.corrected ?? false,
    feedbackAt: Date.now(),
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function listTraces(limit = 20) {
  return _traces.slice(0, limit);
}

export function getLatestTrace() {
  return _traces[0] ?? null;
}

export function getStats() {
  const complete = _traces.filter((t) => t.status === "complete");
  const errors = _traces.filter((t) => t.status === "error");
  const avgDuration = complete.length
    ? Math.round(complete.reduce((s, t) => s + (t.durationMs ?? 0), 0) / complete.length)
    : 0;
  const avgConfidence = complete.length
    ? +(complete.reduce((s, t) => s + (t.confidence ?? 0), 0) / complete.length).toFixed(3)
    : 0;
  return {
    total: _traces.length,
    complete: complete.length,
    errors: errors.length,
    recording: _traces.filter((t) => t.status === "recording").length,
    avgDurationMs: avgDuration,
    avgConfidence,
  };
}

export function clearTraces() { _traces.length = 0; }