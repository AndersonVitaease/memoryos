// Foundation Knowledge API — Camada publica de consulta do KnowledgeModel
// Foundation v1.0 · Engineering First · Sprint FKM-2
//
// Responsabilidade UNICA: prover API somente-leitura sobre FoundationKnowledgeModel.
// Nenhum componente deve interpretar Markdown diretamente.
// Toda consulta ocorre atraves desta API.

import type { FoundationKnowledgeModel, KnowledgeAtom, KnowledgeDocument } from "./FoundationKnowledgeModel";
import type { ElementType } from "./FoundationDocumentParser";
import { loadFoundationRules } from "./FoundationRuleLoader";

// ── Query Types ───────────────────────────────────────────────────────────────

export type QueryType =
  | "getAllAtoms"
  | "getAtom"
  | "getByDocument"
  | "getByType"
  | "getByCategory"
  | "getBySection"
  | "search"
  | "count"
  | "statistics";

// ── Query Result ──────────────────────────────────────────────────────────────

export interface QueryResult<T> {
  readonly queryId: string;
  readonly queryType: QueryType;
  readonly executionTimeMs: number;
  readonly resultsFound: number;
  readonly cacheHit: boolean;
  readonly cacheMiss: boolean;
  readonly data: T;
}

// ── Query Log Entry ───────────────────────────────────────────────────────────

export interface QueryLogEntry {
  readonly queryId: string;
  readonly queryType: QueryType;
  readonly executionTimeMs: number;
  readonly resultsFound: number;
  readonly cacheHit: boolean;
  readonly cacheMiss: boolean;
  readonly timestamp: number;
  readonly param?: string;
}

// ── Statistics ────────────────────────────────────────────────────────────────

export interface KnowledgeAPIStatistics {
  readonly totalQueries: number;
  readonly avgExecutionTimeMs: number;
  readonly queriesByType: Readonly<Record<QueryType, number>>;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly documentsConsulted: Set<string>;
  readonly totalAtomsReturned: number;
}

// ── Count Result ──────────────────────────────────────────────────────────────

export interface CountResult {
  readonly total: number;
  readonly byType: Readonly<Record<ElementType, number>>;
  readonly byDocument: Readonly<Record<string, number>>;
  readonly byCategory: Readonly<Record<string, number>>;
}

// ── Statistics Result ─────────────────────────────────────────────────────────

export interface StatisticsResult {
  readonly totalAtoms: number;
  readonly totalDocuments: number;
  readonly buildTimeMs: number;
  readonly countByType: Readonly<Record<ElementType, number>>;
  readonly countByDocument: Readonly<Record<string, number>>;
  readonly countByCategory: Readonly<Record<string, number>>;
  readonly queryStats: KnowledgeAPIStatistics;
}

// ── ID generator ──────────────────────────────────────────────────────────────

let _querySeq = 0;
function nextQueryId(type: QueryType): string {
  return `Q-${type.toUpperCase().slice(0, 6)}-${String(++_querySeq).padStart(5, "0")}`;
}

// ── Query cache (key → frozen result) ────────────────────────────────────────

const _cache = new Map<string, readonly KnowledgeAtom[]>();

function cacheKey(type: QueryType, param = ""): string {
  return `${type}::${param}`;
}

// ── Metrics accumulator ───────────────────────────────────────────────────────

const _metrics = {
  totalQueries:     0,
  totalTimeMs:      0,
  hits:             0,
  misses:           0,
  totalAtoms:       0,
  byType:           {} as Record<QueryType, number>,
  docsConsulted:    new Set<string>(),
  logs:             [] as QueryLogEntry[],
};

function recordMetric(entry: QueryLogEntry): void {
  _metrics.totalQueries++;
  _metrics.totalTimeMs    += entry.executionTimeMs;
  _metrics.totalAtoms     += entry.resultsFound;
  _metrics.byType[entry.queryType] = (_metrics.byType[entry.queryType] ?? 0) + 1;
  if (entry.cacheHit)  _metrics.hits++;
  else                 _metrics.misses++;
  if (entry.param) _metrics.docsConsulted.add(entry.param);
  _metrics.logs.push(entry);
}

function makeResult<T>(
  queryId: string,
  queryType: QueryType,
  startMs: number,
  data: T,
  count: number,
  cacheHit: boolean,
  param?: string,
): QueryResult<T> {
  const executionTimeMs = Date.now() - startMs;
  const entry: QueryLogEntry = {
    queryId, queryType, executionTimeMs, resultsFound: count,
    cacheHit, cacheMiss: !cacheHit, timestamp: Date.now(), param,
  };
  recordMetric(entry);
  return Object.freeze({ queryId, queryType, executionTimeMs, resultsFound: count, cacheHit, cacheMiss: !cacheHit, data });
}

// ── KnowledgeModel loader (lazy, shared) ─────────────────────────────────────

let _modelPromise: Promise<FoundationKnowledgeModel> | null = null;

async function getModel(): Promise<FoundationKnowledgeModel> {
  if (!_modelPromise) {
    _modelPromise = loadFoundationRules().then(r => r.knowledgeModel);
  }
  return _modelPromise;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const FoundationKnowledgeAPI = {

  /** Returns all atoms — immutable. */
  async getAllAtoms(): Promise<QueryResult<readonly KnowledgeAtom[]>> {
    const t = Date.now();
    const qId = nextQueryId("getAllAtoms");
    const ck = cacheKey("getAllAtoms");
    if (_cache.has(ck)) {
      const cached = _cache.get(ck)!;
      return makeResult(qId, "getAllAtoms", t, cached, cached.length, true);
    }
    try {
      const model = await getModel();
      _cache.set(ck, model.allAtoms);
      return makeResult(qId, "getAllAtoms", t, model.allAtoms, model.allAtoms.length, false);
    } catch {
      return makeResult(qId, "getAllAtoms", t, Object.freeze([]) as readonly KnowledgeAtom[], 0, false);
    }
  },

  /** Returns a single atom by id, or null. */
  async getAtom(atomId: string): Promise<QueryResult<KnowledgeAtom | null>> {
    const t = Date.now();
    const qId = nextQueryId("getAtom");
    if (!atomId || typeof atomId !== "string") {
      return makeResult(qId, "getAtom", t, null, 0, false, atomId);
    }
    try {
      const model = await getModel();
      const found = model.allAtoms.find(a => a.atomId === atomId) ?? null;
      return makeResult(qId, "getAtom", t, found, found ? 1 : 0, false, atomId);
    } catch {
      return makeResult(qId, "getAtom", t, null, 0, false, atomId);
    }
  },

  /** Returns all atoms for a given document shortId. */
  async getByDocument(documentId: string): Promise<QueryResult<readonly KnowledgeAtom[]>> {
    const t = Date.now();
    const qId = nextQueryId("getByDocument");
    if (!documentId || typeof documentId !== "string") {
      return makeResult(qId, "getByDocument", t, Object.freeze([]) as readonly KnowledgeAtom[], 0, false, documentId);
    }
    const ck = cacheKey("getByDocument", documentId);
    if (_cache.has(ck)) {
      const cached = _cache.get(ck)!;
      return makeResult(qId, "getByDocument", t, cached, cached.length, true, documentId);
    }
    try {
      const model = await getModel();
      const atoms = model.byDocument[documentId] ?? Object.freeze([]) as readonly KnowledgeAtom[];
      _cache.set(ck, atoms);
      return makeResult(qId, "getByDocument", t, atoms, atoms.length, false, documentId);
    } catch {
      return makeResult(qId, "getByDocument", t, Object.freeze([]) as readonly KnowledgeAtom[], 0, false, documentId);
    }
  },

  /** Returns all atoms of a given ElementType. */
  async getByType(elementType: ElementType): Promise<QueryResult<readonly KnowledgeAtom[]>> {
    const t = Date.now();
    const qId = nextQueryId("getByType");
    const ck = cacheKey("getByType", elementType);
    if (_cache.has(ck)) {
      const cached = _cache.get(ck)!;
      return makeResult(qId, "getByType", t, cached, cached.length, true, elementType);
    }
    try {
      const model  = await getModel();
      const atoms  = model.byType[elementType] ?? Object.freeze([]) as readonly KnowledgeAtom[];
      _cache.set(ck, atoms);
      return makeResult(qId, "getByType", t, atoms, atoms.length, false, elementType);
    } catch {
      return makeResult(qId, "getByType", t, Object.freeze([]) as readonly KnowledgeAtom[], 0, false, elementType);
    }
  },

  /** Returns all atoms matching a categoryHint. */
  async getByCategory(categoryHint: string): Promise<QueryResult<readonly KnowledgeAtom[]>> {
    const t = Date.now();
    const qId = nextQueryId("getByCategory");
    if (!categoryHint || typeof categoryHint !== "string") {
      return makeResult(qId, "getByCategory", t, Object.freeze([]) as readonly KnowledgeAtom[], 0, false, categoryHint);
    }
    const ck = cacheKey("getByCategory", categoryHint);
    if (_cache.has(ck)) {
      const cached = _cache.get(ck)!;
      return makeResult(qId, "getByCategory", t, cached, cached.length, true, categoryHint);
    }
    try {
      const model = await getModel();
      const atoms = Object.freeze(model.allAtoms.filter(a => a.categoryHint === categoryHint));
      _cache.set(ck, atoms);
      return makeResult(qId, "getByCategory", t, atoms, atoms.length, false, categoryHint);
    } catch {
      return makeResult(qId, "getByCategory", t, Object.freeze([]) as readonly KnowledgeAtom[], 0, false, categoryHint);
    }
  },

  /** Returns all atoms from a specific document section. */
  async getBySection(documentId: string, sectionId: string): Promise<QueryResult<readonly KnowledgeAtom[]>> {
    const t = Date.now();
    const qId = nextQueryId("getBySection");
    const param = `${documentId}::${sectionId}`;
    if (!documentId || !sectionId) {
      return makeResult(qId, "getBySection", t, Object.freeze([]) as readonly KnowledgeAtom[], 0, false, param);
    }
    const ck = cacheKey("getBySection", param);
    if (_cache.has(ck)) {
      const cached = _cache.get(ck)!;
      return makeResult(qId, "getBySection", t, cached, cached.length, true, param);
    }
    try {
      const model = await getModel();
      const docAtoms = model.byDocument[documentId] ?? [];
      const atoms = Object.freeze(docAtoms.filter(a => a.sourceSection.includes(sectionId) || a.sourceLocation.includes(sectionId)));
      _cache.set(ck, atoms);
      return makeResult(qId, "getBySection", t, atoms, atoms.length, false, param);
    } catch {
      return makeResult(qId, "getBySection", t, Object.freeze([]) as readonly KnowledgeAtom[], 0, false, param);
    }
  },

  /** Full-text search across all atom texts (case-insensitive). */
  async search(text: string): Promise<QueryResult<readonly KnowledgeAtom[]>> {
    const t = Date.now();
    const qId = nextQueryId("search");
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return makeResult(qId, "search", t, Object.freeze([]) as readonly KnowledgeAtom[], 0, false, text);
    }
    const normalised = text.trim().toLowerCase();
    const ck = cacheKey("search", normalised);
    if (_cache.has(ck)) {
      const cached = _cache.get(ck)!;
      return makeResult(qId, "search", t, cached, cached.length, true, text);
    }
    try {
      const model = await getModel();
      const atoms = Object.freeze(model.allAtoms.filter(a => a.text.toLowerCase().includes(normalised)));
      _cache.set(ck, atoms);
      return makeResult(qId, "search", t, atoms, atoms.length, false, text);
    } catch {
      return makeResult(qId, "search", t, Object.freeze([]) as readonly KnowledgeAtom[], 0, false, text);
    }
  },

  /** Returns count breakdown — no atoms transferred. */
  async count(): Promise<QueryResult<CountResult>> {
    const t = Date.now();
    const qId = nextQueryId("count");
    try {
      const model = await getModel();
      const byType: Record<string, number> = {};
      const byDoc: Record<string, number>  = {};
      const byCat: Record<string, number>  = {};
      for (const a of model.allAtoms) {
        byType[a.elementType]   = (byType[a.elementType]   ?? 0) + 1;
        byDoc[a.sourceDocument] = (byDoc[a.sourceDocument] ?? 0) + 1;
        byCat[a.categoryHint]   = (byCat[a.categoryHint]   ?? 0) + 1;
      }
      const result: CountResult = Object.freeze({
        total: model.totalAtoms,
        byType: Object.freeze(byType) as Record<ElementType, number>,
        byDocument: Object.freeze(byDoc),
        byCategory: Object.freeze(byCat),
      });
      return makeResult(qId, "count", t, result, model.totalAtoms, false);
    } catch {
      const empty: CountResult = Object.freeze({ total: 0, byType: Object.freeze({}) as Record<ElementType, number>, byDocument: Object.freeze({}), byCategory: Object.freeze({}) });
      return makeResult(qId, "count", t, empty, 0, false);
    }
  },

  /** Returns full statistics of the Knowledge Model + API usage. */
  async statistics(): Promise<QueryResult<StatisticsResult>> {
    const t = Date.now();
    const qId = nextQueryId("statistics");
    try {
      const model = await getModel();
      const countByType: Record<string, number>     = {};
      const countByDoc: Record<string, number>      = {};
      const countByCat: Record<string, number>      = {};
      for (const a of model.allAtoms) {
        countByType[a.elementType]   = (countByType[a.elementType]   ?? 0) + 1;
        countByDoc[a.sourceDocument] = (countByDoc[a.sourceDocument] ?? 0) + 1;
        countByCat[a.categoryHint]   = (countByCat[a.categoryHint]   ?? 0) + 1;
      }
      const queryStats: KnowledgeAPIStatistics = Object.freeze({
        totalQueries:       _metrics.totalQueries,
        avgExecutionTimeMs: _metrics.totalQueries > 0 ? Math.round(_metrics.totalTimeMs / _metrics.totalQueries) : 0,
        queriesByType:      Object.freeze({ ..._metrics.byType }) as Record<QueryType, number>,
        cacheHits:          _metrics.hits,
        cacheMisses:        _metrics.misses,
        documentsConsulted: _metrics.docsConsulted,
        totalAtomsReturned: _metrics.totalAtoms,
      });
      const result: StatisticsResult = Object.freeze({
        totalAtoms:     model.totalAtoms,
        totalDocuments: model.documents.length,
        buildTimeMs:    model.buildTimeMs,
        countByType:    Object.freeze(countByType) as Record<ElementType, number>,
        countByDocument: Object.freeze(countByDoc),
        countByCategory: Object.freeze(countByCat),
        queryStats,
      });
      return makeResult(qId, "statistics", t, result, model.totalAtoms, false);
    } catch {
      const empty: StatisticsResult = Object.freeze({
        totalAtoms: 0, totalDocuments: 0, buildTimeMs: 0,
        countByType: Object.freeze({}) as Record<ElementType, number>,
        countByDocument: Object.freeze({}), countByCategory: Object.freeze({}),
        queryStats: Object.freeze({
          totalQueries: 0, avgExecutionTimeMs: 0, queriesByType: Object.freeze({}) as Record<QueryType, number>,
          cacheHits: 0, cacheMisses: 0, documentsConsulted: new Set(), totalAtomsReturned: 0,
        }),
      });
      return makeResult(qId, "statistics", t, empty, 0, false);
    }
  },

  /** Returns all query logs (read-only). */
  getLogs(): readonly QueryLogEntry[] {
    return Object.freeze([..._metrics.logs]);
  },

  /** Invalidates internal query cache. Does NOT reload the KnowledgeModel. */
  invalidateQueryCache(): void {
    _cache.clear();
    _modelPromise = null;
  },

  /** Resets metrics (for test isolation). */
  resetMetrics(): void {
    _metrics.totalQueries  = 0;
    _metrics.totalTimeMs   = 0;
    _metrics.hits          = 0;
    _metrics.misses        = 0;
    _metrics.totalAtoms    = 0;
    _metrics.byType        = {};
    _metrics.docsConsulted = new Set();
    _metrics.logs          = [];
  },
} as const;