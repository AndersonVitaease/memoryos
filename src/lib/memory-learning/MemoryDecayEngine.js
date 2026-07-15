/**
 * MemoryDecayEngine.js — Memory Learning & Goal Intelligence Platform (MLGIP)
 * Sprint 7.1.1B — FASE 4
 *
 * Decaimento natural de memórias.
 * Nenhuma memória é apagada — apenas perde prioridade de forma auditável.
 *
 * Critérios de decaimento (configuráveis):
 *   - Tempo desde último uso
 *   - Taxa de utilização
 *   - Objetivo ativo (protege memória de decair)
 *   - Confiança atual
 *   - Importância histórica do tipo
 */

const DEFAULT_CONFIG = {
  halfLifeDays: 30,        // tempo para score cair à metade
  usageProtection: 0.02,   // bonus por uso recente (por uso)
  activeGoalProtection: 0.15, // proteção se memória está num goal ativo
  minScore: 0.05,          // piso — nunca cai abaixo disso
  maxDecayPerCycle: 0.10,  // máximo de queda por ciclo
};

const STORAGE_KEY = "mlgip_decay_v1";

let _state = {}; // memoryId → { decayScore, lastCycleAt, protected, history }
let _config = { ...DEFAULT_CONFIG };

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    _state = parsed.state ?? {};
    _config = { ...DEFAULT_CONFIG, ...(parsed.config ?? {}) };
  } catch { _state = {}; }
}

function _save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: _state, config: _config }));
  } catch { /* */ }
}

_load();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _ensure(memoryId) {
  if (!_state[memoryId]) {
    _state[memoryId] = {
      memoryId,
      decayScore: 1.0,   // começa em 100%
      lastUsedAt: Date.now(),
      lastCycleAt: Date.now(),
      protected: false,
      history: [],
    };
  }
  return _state[memoryId];
}

// ─── Core decay function ──────────────────────────────────────────────────────

/**
 * Calcula o fator de decaimento para uma memória.
 * @param {string} memoryId
 * @param {Object} opts
 *   @param {number} opts.useCount          - Quantas vezes foi usada
 *   @param {number} opts.lastUsedAt        - Timestamp do último uso
 *   @param {boolean} opts.isGoalActive     - Se pertence a um goal ativo
 *   @param {number} opts.baseImportance    - Importância base [0..1]
 * @returns {{ newScore, delta, reason }}
 */
export function computeDecay(memoryId, opts = {}) {
  const rec = _ensure(memoryId);
  const {
    useCount = 0,
    lastUsedAt = rec.lastUsedAt,
    isGoalActive = false,
    baseImportance = 0.5,
  } = opts;

  const now = Date.now();
  const ageDays = (now - lastUsedAt) / (1000 * 60 * 60 * 24);

  // Base decay: exponential
  const baseDecay = Math.exp(-ageDays / _config.halfLifeDays);

  // Usage protection: cada uso adiciona proteção
  const usageBonus = Math.min(useCount * _config.usageProtection, 0.3);

  // Active goal protection
  const goalBonus = isGoalActive ? _config.activeGoalProtection : 0;

  // Importance slows decay
  const importanceMultiplier = 0.5 + baseImportance * 0.5;

  const rawNew = (baseDecay + usageBonus + goalBonus) * importanceMultiplier;
  const delta = rawNew - rec.decayScore;
  const cappedDelta = Math.max(-_config.maxDecayPerCycle, delta);
  const newScore = Math.max(_config.minScore, Math.min(1, rec.decayScore + cappedDelta));

  return {
    newScore: Math.round(newScore * 1000) / 1000,
    delta: Math.round(cappedDelta * 1000) / 1000,
    reason: [
      `base_decay=${baseDecay.toFixed(3)}`,
      `usage_bonus=${usageBonus.toFixed(3)}`,
      `goal_bonus=${goalBonus.toFixed(3)}`,
      `importance=${importanceMultiplier.toFixed(3)}`,
    ].join(" | "),
  };
}

/** Aplica o decaimento a uma memória e persiste. */
export function applyDecay(memoryId, opts = {}) {
  const rec = _ensure(memoryId);
  const { newScore, delta, reason } = computeDecay(memoryId, opts);
  const before = rec.decayScore;
  rec.decayScore = newScore;
  rec.lastCycleAt = Date.now();
  rec.history.push({ before: Math.round(before * 1000) / 1000, after: newScore, delta, reason, ts: Date.now() });
  if (rec.history.length > 30) rec.history.shift();
  _save();
  return { before, after: newScore, delta };
}

/** Registra uso de uma memória (reseta o timer de decaimento). */
export function recordAccess(memoryId) {
  const rec = _ensure(memoryId);
  rec.lastUsedAt = Date.now();
  _save();
}

/** Protege uma memória de decair (ex: pertence a objetivo crítico). */
export function protect(memoryId) {
  const rec = _ensure(memoryId);
  rec.protected = true;
  _save();
}

/** Retorna o decay score atual de uma memória [0..1]. */
export function getDecayScore(memoryId) {
  return _state[memoryId]?.decayScore ?? 1.0;
}

/** Aplica decay score ao score composto de uma memória. */
export function applyDecayToScore(baseScore, memoryId) {
  const decay = getDecayScore(memoryId);
  // decay penaliza o score em até 30%
  return Math.max(0, baseScore * (0.7 + decay * 0.3));
}

/** Configura parâmetros do decay engine. */
export function configure(opts) {
  _config = { ..._config, ...opts };
  _save();
}

export function getConfig() { return { ..._config }; }

export function getDecayRecord(memoryId) { return _state[memoryId] ?? null; }

export function getAllDecayRecords() { return Object.values(_state); }

export function getStats() {
  const all = getAllDecayRecords();
  return {
    total: all.length,
    avgDecayScore: all.length ? (all.reduce((s, r) => s + r.decayScore, 0) / all.length).toFixed(3) : 0,
    protected: all.filter((r) => r.protected).length,
    fullyDecayed: all.filter((r) => r.decayScore <= _config.minScore + 0.01).length,
    fresh: all.filter((r) => r.decayScore >= 0.8).length,
  };
}

export function _resetForTests() {
  _state = {};
  _config = { ...DEFAULT_CONFIG };
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
}