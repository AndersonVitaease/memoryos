/**
 * CertificationHistoryStore — EF-40.2
 * Persists certification reports to localStorage.
 * EF-40.0/40.1 rules are NEVER modified here.
 */

const STORAGE_KEY = "ef40_certification_history";
const MAX_ENTRIES = 50;

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function persist(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage full — drop oldest
    const trimmed = entries.slice(-Math.floor(MAX_ENTRIES / 2));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed)); } catch {}
  }
}

/** Slim summary record saved to history (full payload kept separately). */
function toHistoryRecord(payload) {
  return {
    executionId:         payload.executionId,
    timestamp:           payload.timestamp,
    totalRuntimeMs:      payload.totalRuntimeMs,
    coveragePct:         payload.coverage.coveragePct,
    executedCount:       payload.coverage.executed,
    notExecutedCount:    payload.coverage.notExecuted,
    executedPhases:      payload.coverage.executedPhases,
    notExecutedPhases:   payload.coverage.notExecutedPhases,
    score:               payload.certificationScore.score,
    grade:               payload.certificationScore.grade,
    passedCount:         payload.certificationScore.passedCount,
    failedCount:         payload.certificationScore.failedCount,
    certificationStatus: payload.certificationStatus,
    platformLimitations: payload.platformLimitations,
    // Store slim benchmark summary for regression
    benchmarks:          (payload.executionMatrix ?? [])
      .filter(r => r.phase === "PERFORMANCE")
      .flatMap(r => r.data?.benchmarks ?? [])
      .map(b => ({ operation: b.operation, avgMs: b.avgMs })),
  };
}

export const CertificationHistoryStore = {
  save(payload) {
    const entries = load();
    const record  = toHistoryRecord(payload);
    // deduplicate by executionId
    const filtered = entries.filter(e => e.executionId !== record.executionId);
    filtered.push(record);
    // keep max entries
    const trimmed = filtered.slice(-MAX_ENTRIES);
    persist(trimmed);
    return record;
  },

  getAll() {
    return load().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  },

  getByExecutionId(id) {
    return load().find(e => e.executionId === id) ?? null;
  },

  getLatest() {
    const all = load();
    if (all.length === 0) return null;
    return all.reduce((latest, e) =>
      new Date(e.timestamp) > new Date(latest.timestamp) ? e : latest
    );
  },

  getPrevious(currentId) {
    const all = load().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const idx  = all.findIndex(e => e.executionId === currentId);
    if (idx <= 0) return null;
    return all[idx - 1];
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },

  count() {
    return load().length;
  },
};