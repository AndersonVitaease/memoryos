/**
 * MemoryScorer.js — Memory Intelligence Platform (MIP)
 * Sprint 7.1.1A: Score composto para cada memória recuperada.
 *
 * Critérios com pesos configuráveis:
 *   - Relevância semântica (keyword overlap)
 *   - Recência (decay exponencial)
 *   - Frequência de uso (estimada por mention count)
 *   - Importância histórica (tipo de entidade, categoria documento)
 *   - Comprimento / riqueza do conteúdo
 */

// Pesos padrão (soma = 1.0)
const DEFAULT_WEIGHTS = {
  semantic:   0.40,
  recency:    0.25,
  richness:   0.15,
  importance: 0.12,
  frequency:  0.08,
};

/**
 * Recência normalizada [0..1] com decaimento exponencial.
 * Metade do score em 30 dias.
 */
function recencyScore(dateStr) {
  if (!dateStr) return 0.3;
  const ageMs = Date.now() - new Date(dateStr).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.exp(-ageDays / 30);
}

/**
 * Relevância semântica: proporção de keywords da query presentes no conteúdo.
 */
function semanticScore(record, keywords, fields) {
  if (!keywords || keywords.length === 0) return 0.5; // sem query, neutro
  const content = fields
    .map((f) => String(record[f] || "").toLowerCase())
    .join(" ");
  if (!content.trim()) return 0;
  const matches = keywords.filter((kw) => content.includes(kw.toLowerCase())).length;
  return Math.min(matches / keywords.length, 1);
}

/**
 * Riqueza: normaliza comprimento do conteúdo principal [0..1].
 * Teto em 1000 chars.
 */
function richnessScore(record, primaryField) {
  const val = String(record[primaryField] || "");
  return Math.min(val.length / 1000, 1);
}

/**
 * Importância histórica por tipo de registro.
 */
const IMPORTANCE_MAP = {
  // Decisions têm alta importância histórica
  decision: 0.9,
  // Tarefas pendentes são mais relevantes
  task_pending: 0.8,
  task_done: 0.4,
  // Documentos com categoria específica
  doc_contrato: 0.95,
  doc_financeiro: 0.85,
  doc_juridico: 0.90,
  doc_produto: 0.75,
  doc_reuniao: 0.70,
  doc_other: 0.55,
  // Entidades
  entity_empresa: 0.85,
  entity_pessoa: 0.80,
  entity_valor_monetario: 0.90,
  entity_produto: 0.75,
  entity_other: 0.50,
  // Sessão / tópico
  session: 0.60,
  topic: 0.65,
  keyword: 0.40,
  message: 0.45,
};

function importanceScore(record, kind) {
  return IMPORTANCE_MAP[kind] ?? 0.5;
}

/**
 * Calcula o score final composto para um registro.
 *
 * @param {Object} record  - Registro da entidade
 * @param {Object} opts
 *   @param {string[]} opts.keywords     - Keywords extraídas da query
 *   @param {string[]} opts.fields       - Campos do record para busca semântica
 *   @param {string}   opts.primaryField - Campo principal para riqueza
 *   @param {string}   opts.dateField    - Campo de data para recência
 *   @param {string}   opts.kind         - Tipo lógico (ex: "decision", "entity_empresa")
 *   @param {Object}   [opts.weights]    - Pesos customizados (opcional)
 * @returns {{ score: number, breakdown: Object }}
 */
export function scoreRecord(record, opts = {}) {
  const {
    keywords = [],
    fields = [],
    primaryField = "content",
    dateField = "created_date",
    kind = "other",
    weights = DEFAULT_WEIGHTS,
  } = opts;

  const w = { ...DEFAULT_WEIGHTS, ...weights };

  const s = semanticScore(record, keywords, fields);
  const r = recencyScore(record[dateField]);
  const ri = richnessScore(record, primaryField);
  const im = importanceScore(record, kind);
  const fr = 0.5; // frequência não temos dados diretos — neutro

  const score =
    w.semantic * s +
    w.recency * r +
    w.richness * ri +
    w.importance * im +
    w.frequency * fr;

  return {
    score: Math.round(score * 1000) / 1000,
    breakdown: { semantic: s, recency: r, richness: ri, importance: im, frequency: fr },
  };
}

/**
 * Pontua e ordena um array de registros.
 * @param {Object[]} records
 * @param {Object} opts - Mesmos opts de scoreRecord
 * @param {number} [limit] - Máximo de resultados
 * @returns {Array<{ record, score, breakdown }>}
 */
export function rankRecords(records, opts = {}, limit = 50) {
  return records
    .map((record) => ({ record, ...scoreRecord(record, opts) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}