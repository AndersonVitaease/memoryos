/**
 * Hybrid Retrieval Manager (Sprint 12)
 *
 * Responsabilidade única: COMBINAR múltiplas estratégias de recuperação de memória.
 *
 * O QUE FAZ:
 *   - Recebe resultados de Memory Retrieval, Semantic Retrieval e Vector Index
 *   - Elimina duplicidades
 *   - Unifica resultados
 *   - Calcula score híbrido (ponderado por fonte)
 *   - Ordena por score
 *   - Envia ao Context Builder
 *
 * O QUE NÃO FAZ:
 *   - Modificar Memory Records
 *   - Gerar embeddings
 *   - Indexar vetores
 *   - Responder ao usuário
 *   - Alterar Version History ou Lifecycle
 *   - LLM Ranking / Reranking IA / Aprendizado / Feedback
 *
 * Arquitetura:
 *   Retrieval + Semantic + Vector Index → Hybrid Retrieval → Context Builder → Core
 */

// === Pesos configuráveis ===
export const DEFAULT_WEIGHTS = {
  retrieval: 0.50, // Determinístico
  semantic: 0.30,  // Semântico
  vector: 0.20,    // Vetorial
};

let _weights = { ...DEFAULT_WEIGHTS };

export function setWeights(weights) {
  if (!weights || typeof weights !== "object") return;
  if (typeof weights.retrieval === "number") _weights.retrieval = weights.retrieval;
  if (typeof weights.semantic === "number") _weights.semantic = weights.semantic;
  if (typeof weights.vector === "number") _weights.vector = weights.vector;
}

export function getWeights() {
  return { ..._weights };
}

export function resetWeights() {
  _weights = { ...DEFAULT_WEIGHTS };
}

// === Observabilidade ===
const _stats = {
  hybridStarted: 0,
  resultsMerged: 0,
  duplicatesRemoved: 0,
  hybridRanked: 0,
  hybridCompleted: 0,
  totalSourcesUsed: 0,
  totalProcessingTimeMs: 0,
  totalRankingScore: 0,
  rankedCount: 0,
  expiredDiscarded: 0,
  oldRevisionsDiscarded: 0,
  operations: 0,
};

const _decisionLog = [];

function _log(event, data) {
  // eslint-disable-next-line no-console
  console.debug(`[HybridRetrieval:${event}]`, data);
}

// === Helpers ===

function _isExpired(record) {
  if (!record.expires) return false;
  try {
    return new Date(record.expires).getTime() < Date.now();
  } catch {
    return false;
  }
}

function _isLatestRevision(record, allRecords) {
  const memId = record.memoryId || record.id;
  const rev = record.revision || 1;
  for (const r of allRecords) {
    const rMemId = r.memoryId || r.id;
    const rRev = r.revision || 1;
    if (rMemId === memId && rRev > rev) return false;
  }
  return true;
}

/**
 * Normaliza um resultado de qualquer fonte para um formato comum.
 * Aceita { record, score } ou um Memory Record direto.
 */
function _normalizeResult(input, source) {
  if (!input) return null;
  let record, score;
  if (input.record && typeof input.record === "object") {
    record = input.record;
    score = typeof input.score === "number" ? input.score : 0;
  } else if (typeof input === "object") {
    record = input;
    score = 0;
  } else {
    return null;
  }
  if (!record || (!record.id && !record.memoryId)) return null;
  return {
    record,
    score,
    source,
    memoryId: record.memoryId || record.id,
    revision: record.revision || 1,
  };
}

// === API pública ===

/**
 * Funde múltiplas listas de resultados, eliminando duplicatas,
 * descartando expiradas e mantendo apenas a última revisão.
 *
 * @param {Object} params
 * @param {Array} [params.retrievalResults] - Resultados do Memory Retrieval
 * @param {Array} [params.semanticResults] - Resultados do Semantic Retrieval
 * @param {Array} [params.vectorResults] - Resultados do Vector Index
 * @returns {Object} { merged, duplicatesRemoved, expiredDiscarded, oldRevisionsDiscarded }
 */
export function mergeResults({ retrievalResults, semanticResults, vectorResults } = {}) {
  _stats.operations++;

  const sources = [];
  if (Array.isArray(retrievalResults) && retrievalResults.length > 0)
    sources.push({ name: "retrieval", results: retrievalResults });
  if (Array.isArray(semanticResults) && semanticResults.length > 0)
    sources.push({ name: "semantic", results: semanticResults });
  if (Array.isArray(vectorResults) && vectorResults.length > 0)
    sources.push({ name: "vector", results: vectorResults });

  _stats.totalSourcesUsed += sources.length;

  // Coletar todos os resultados normalizados
  const allEntries = [];
  for (const src of sources) {
    for (const r of src.results) {
      const normalized = _normalizeResult(r, src.name);
      if (normalized) allEntries.push(normalized);
    }
  }

  // Eliminar duplicatas (mesmo memoryId E mesma revisão → manter o de maior score)
  // Registros com mesma memoryId mas revisões diferentes são mantidos — o filtro
  // de revisão (abaixo) decide qual é a última.
  const byKey = {};
  let duplicatesRemoved = 0;
  for (const entry of allEntries) {
    const key = `${entry.memoryId}::rev${entry.revision}`;
    if (byKey[key]) {
      duplicatesRemoved++;
      if (entry.score > byKey[key].score) {
        byKey[key] = entry;
      }
    } else {
      byKey[key] = entry;
    }
  }
  _stats.duplicatesRemoved += duplicatesRemoved;

  let merged = Object.values(byKey);

  // Descartar expiradas
  const beforeExpired = merged.length;
  merged = merged.filter((e) => !_isExpired(e.record));
  const expiredDiscarded = beforeExpired - merged.length;
  _stats.expiredDiscarded += expiredDiscarded;

  // Descartar revisões antigas (manter apenas a última revisão de cada memoryId)
  const allRecords = merged.map((e) => e.record);
  const beforeOldRev = merged.length;
  merged = merged.filter((e) => _isLatestRevision(e.record, allRecords));
  const oldRevisionsDiscarded = beforeOldRev - merged.length;
  _stats.oldRevisionsDiscarded += oldRevisionsDiscarded;

  _stats.resultsMerged += merged.length;
  _log("resultsMerged", {
    merged: merged.length,
    duplicatesRemoved,
    expiredDiscarded,
    oldRevisionsDiscarded,
  });
  _decisionLog.push({
    event: "resultsMerged",
    merged: merged.length,
    duplicatesRemoved,
    expiredDiscarded,
    oldRevisionsDiscarded,
  });

  return { merged, duplicatesRemoved, expiredDiscarded, oldRevisionsDiscarded };
}

/**
 * Calcula o score híbrido de um resultado.
 * Combina o score da fonte com o peso configurado.
 *
 * @param {Object} entry - { record, score, source }
 * @returns {Object} { hybridScore, sources, weights }
 */
export function calculateHybridScore(entry) {
  if (!entry || !entry.source) {
    return { hybridScore: 0, sourceWeights: {} };
  }

  const weight = _weights[entry.source] || 0;
  const hybridScore = entry.score * weight;

  return {
    hybridScore,
    sourceWeight: weight,
    originalScore: entry.score,
  };
}

/**
 * Ordena resultados por score híbrido (decrescente).
 * Desempate por importance.
 */
export function rankHybridResults(scored) {
  _stats.hybridRanked++;
  const importanceOrder = { high: 3, medium: 2, low: 1 };
  return [...scored].sort((a, b) => {
    if (b.hybridScore !== a.hybridScore)
      return b.hybridScore - a.hybridScore;
    const impA = importanceOrder[a.record?.importance] || 0;
    const impB = importanceOrder[b.record?.importance] || 0;
    return impB - impA;
  });
}

/**
 * Executa busca híbrida completa.
 *
 * @param {Object} params
 * @param {Array} [params.retrievalResults]
 * @param {Array} [params.semanticResults]
 * @param {Array} [params.vectorResults]
 * @param {Object} [params.options] - { maxResults, minScore }
 * @returns {Object} { results, stats, merged, duplicatesRemoved }
 */
export function hybridSearch({
  retrievalResults,
  semanticResults,
  vectorResults,
  options = {},
} = {}) {
  const startTime = Date.now();
  _stats.hybridStarted++;
  _stats.operations++;

  const opts = {
    maxResults: options.maxResults || 50,
    minScore: options.minScore ?? -Infinity,
  };

  // 1. Fundir
  const mergeData = mergeResults({
    retrievalResults,
    semanticResults,
    vectorResults,
  });

  // 2. Calcular scores híbridos
  const scored = mergeData.merged.map((entry) => {
    const scoreData = calculateHybridScore(entry);
    _stats.totalRankingScore += scoreData.hybridScore;
    _stats.rankedCount++;
    return {
      record: entry.record,
      memoryId: entry.memoryId,
      source: entry.source,
      originalScore: entry.score,
      hybridScore: scoreData.hybridScore,
      sourceWeight: scoreData.sourceWeight,
    };
  });

  // 3. Ordenar
  const ranked = rankHybridResults(scored);

  // 4. Filtrar e limitar
  const filtered = ranked
    .filter((r) => r.hybridScore >= opts.minScore)
    .slice(0, opts.maxResults);

  const elapsed = Date.now() - startTime;
  _stats.totalProcessingTimeMs += elapsed;
  _stats.hybridCompleted++;
  _log("hybridCompleted", {
    results: filtered.length,
    elapsed,
  });
  _decisionLog.push({
    event: "hybridCompleted",
    results: filtered.length,
    processingTimeMs: elapsed,
  });

  return {
    results: filtered,
    stats: {
      total: filtered.length,
      merged: mergeData.merged.length,
      duplicatesRemoved: mergeData.duplicatesRemoved,
      expiredDiscarded: mergeData.expiredDiscarded,
      oldRevisionsDiscarded: mergeData.oldRevisionsDiscarded,
      sourcesUsed:
        (Array.isArray(retrievalResults) && retrievalResults.length > 0 ? 1 : 0) +
        (Array.isArray(semanticResults) && semanticResults.length > 0 ? 1 : 0) +
        (Array.isArray(vectorResults) && vectorResults.length > 0 ? 1 : 0),
    },
    merged: mergeData.merged,
    duplicatesRemoved: mergeData.duplicatesRemoved,
    weights: getWeights(),
  };
}

// === Observabilidade ===

export function getStats() {
  return {
    ..._stats,
    averageProcessingTimeMs:
      _stats.operations > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.operations)
        : 0,
    averageRankingScore:
      _stats.rankedCount > 0
        ? Math.round(_stats.totalRankingScore / _stats.rankedCount)
        : 0,
    weightDistribution: { ..._weights },
    decisionLog: [..._decisionLog],
  };
}

export function getDecisionLog() {
  return [..._decisionLog];
}

export function _resetForTests() {
  _stats.hybridStarted = 0;
  _stats.resultsMerged = 0;
  _stats.duplicatesRemoved = 0;
  _stats.hybridRanked = 0;
  _stats.hybridCompleted = 0;
  _stats.totalSourcesUsed = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.totalRankingScore = 0;
  _stats.rankedCount = 0;
  _stats.expiredDiscarded = 0;
  _stats.oldRevisionsDiscarded = 0;
  _stats.operations = 0;
  _decisionLog.length = 0;
  _weights = { ...DEFAULT_WEIGHTS };
}

export default {
  hybridSearch,
  mergeResults,
  calculateHybridScore,
  rankHybridResults,
  setWeights,
  getWeights,
  resetWeights,
  getStats,
  getDecisionLog,
  _resetForTests,
  DEFAULT_WEIGHTS,
};