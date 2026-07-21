/**
 * OfficialLibraryIndex.ts — Sprint EF-41
 *
 * The consolidated, in-memory index of all Official Library documents.
 * This is the single source of truth used by the future Retrieval Engine.
 *
 * Responsibilities:
 *   - Store all indexed OfficialDocumentMetadata records
 *   - Provide fast lookup by id, category, version, status, tag, keyword
 *   - Detect and flag duplicates
 *   - Track index integrity
 *
 * This class does NOT load or parse documents.
 * It only stores what OfficialLibraryIndexer produces.
 */

import type { OfficialDocumentMetadata, OfficialDocumentCategory, OfficialDocumentStatus } from "./OfficialDocumentMetadata";

// ── Index integrity report ────────────────────────────────────────────────────

export interface IndexIntegrityReport {
  readonly isIntact:          boolean;
  readonly totalDocuments:    number;
  readonly activeDocuments:   number;
  readonly deprecatedDocuments: number;
  readonly duplicateIds:      readonly string[];
  readonly missingChecksums:  readonly string[];
  readonly checksumMismatches: readonly { id: string; expected: string; actual: string }[];
  readonly orphanRelationships: readonly string[];   // relationship targets that don't exist in index
  readonly checkedAt:         string;
}

// ── Index query filters ───────────────────────────────────────────────────────

export interface IndexQuery {
  category?:  OfficialDocumentCategory;
  status?:    OfficialDocumentStatus;
  version?:   string;
  tag?:       string;
  keyword?:   string;
  type?:      string;
  limit?:     number;
}

// ── Index stats ───────────────────────────────────────────────────────────────

export interface OfficialIndexStats {
  readonly totalDocuments:       number;
  readonly byCategory:           Readonly<Record<string, number>>;
  readonly byStatus:             Readonly<Record<string, number>>;
  readonly byVersion:            Readonly<Record<string, number>>;
  readonly totalKeywords:        number;
  readonly totalRelationships:   number;
  readonly totalChunks:          number;
  readonly estimatedTotalTokens: number;
  readonly builtAt:              string | null;
  readonly lastUpdatedAt:        string | null;
}

// ── Index implementation ──────────────────────────────────────────────────────

class OfficialLibraryIndexImpl {
  private _docs:      Map<string, OfficialDocumentMetadata> = new Map();
  private _builtAt:   string | null = null;
  private _updatedAt: string | null = null;

  get size(): number         { return this._docs.size; }
  get isBuilt(): boolean     { return this._docs.size > 0; }
  get builtAt(): string|null { return this._builtAt; }

  // ── Write operations ───────────────────────────────────────────────────────

  /** Replace entire index. Called by OfficialLibraryIndexer on full rebuild. */
  replaceAll(docs: OfficialDocumentMetadata[]): void {
    this._docs.clear();
    for (const doc of docs) {
      this._docs.set(doc.id, doc);
    }
    const now = new Date().toISOString();
    if (!this._builtAt) this._builtAt = now;
    this._updatedAt = now;
  }

  /** Upsert a single document. Called on incremental updates. */
  upsert(doc: OfficialDocumentMetadata): void {
    this._docs.set(doc.id, doc);
    this._updatedAt = new Date().toISOString();
  }

  /** Remove a document by id. */
  remove(id: string): boolean {
    const existed = this._docs.has(id);
    this._docs.delete(id);
    if (existed) this._updatedAt = new Date().toISOString();
    return existed;
  }

  /** Clear entire index. */
  clear(): void {
    this._docs.clear();
    this._builtAt   = null;
    this._updatedAt = null;
  }

  // ── Read operations ────────────────────────────────────────────────────────

  /** Lookup by id. */
  get(id: string): OfficialDocumentMetadata | null {
    return this._docs.get(id) ?? null;
  }

  /** All documents as an array. */
  getAll(): OfficialDocumentMetadata[] {
    return [...this._docs.values()];
  }

  /** Filter by structured query. */
  query(q: IndexQuery): OfficialDocumentMetadata[] {
    let results = [...this._docs.values()];

    if (q.category)  results = results.filter(d => d.category === q.category);
    if (q.status)    results = results.filter(d => d.status === q.status);
    if (q.version)   results = results.filter(d => d.version === q.version);
    if (q.type)      results = results.filter(d => d.type === q.type);
    if (q.tag)       results = results.filter(d => d.tags.includes(q.tag!));
    if (q.keyword) {
      const kw = q.keyword.toLowerCase();
      results = results.filter(d => d.keywords.some(k => k.includes(kw)));
    }
    if (q.limit && q.limit > 0) results = results.slice(0, q.limit);

    return results;
  }

  /** Get all documents related to a given doc id. */
  getRelated(id: string): OfficialDocumentMetadata[] {
    const doc = this._docs.get(id);
    if (!doc) return [];
    const relatedIds = new Set(doc.relatedDocuments.map(r => r.targetId));
    return [...this._docs.values()].filter(d => relatedIds.has(d.id));
  }

  /** Get all documents that reference the given id. */
  getReferencedBy(id: string): OfficialDocumentMetadata[] {
    return [...this._docs.values()].filter(d =>
      d.relatedDocuments.some(r => r.targetId === id)
    );
  }

  /** Get all unique versions in the index. */
  getVersions(): string[] {
    return [...new Set([...this._docs.values()].map(d => d.version))].sort();
  }

  /** Get all unique categories in the index. */
  getCategories(): string[] {
    return [...new Set([...this._docs.values()].map(d => d.category))];
  }

  // ── Integrity check ────────────────────────────────────────────────────────

  checkIntegrity(): IndexIntegrityReport {
    const all = [...this._docs.values()];
    const seenIds = new Set<string>();
    const duplicateIds: string[] = [];
    const missingChecksums: string[] = [];
    const orphanRelationships: string[] = [];

    for (const doc of all) {
      if (seenIds.has(doc.id)) duplicateIds.push(doc.id);
      seenIds.add(doc.id);

      if (!doc.checksum || doc.checksum.length === 0) missingChecksums.push(doc.id);

      for (const rel of doc.relatedDocuments) {
        if (!this._docs.has(rel.targetId)) {
          orphanRelationships.push(`${doc.id} → ${rel.targetId} (${rel.relationshipType})`);
        }
      }
    }

    const activeDocuments = all.filter(d => d.status === "active").length;
    const deprecatedDocuments = all.filter(d => d.status === "deprecated").length;

    return Object.freeze({
      isIntact: duplicateIds.length === 0 && missingChecksums.length === 0,
      totalDocuments:      all.length,
      activeDocuments,
      deprecatedDocuments,
      duplicateIds:        Object.freeze(duplicateIds),
      missingChecksums:    Object.freeze(missingChecksums),
      checksumMismatches:  Object.freeze([]),
      orphanRelationships: Object.freeze(orphanRelationships),
      checkedAt: new Date().toISOString(),
    });
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  stats(): OfficialIndexStats {
    const all = [...this._docs.values()];
    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number>   = {};
    const byVersion: Record<string, number>  = {};
    let totalRelationships = 0;
    let totalChunks = 0;
    let estimatedTotalTokens = 0;
    const allKeywords = new Set<string>();

    for (const doc of all) {
      byCategory[doc.category] = (byCategory[doc.category] ?? 0) + 1;
      byStatus[doc.status]     = (byStatus[doc.status]     ?? 0) + 1;
      byVersion[doc.version]   = (byVersion[doc.version]   ?? 0) + 1;
      totalRelationships += doc.relatedDocuments.length;
      totalChunks        += doc.chunkCount;
      estimatedTotalTokens += doc.tokenEstimate;
      for (const kw of doc.keywords) allKeywords.add(kw);
    }

    return Object.freeze({
      totalDocuments:       all.length,
      byCategory:           Object.freeze(byCategory),
      byStatus:             Object.freeze(byStatus),
      byVersion:            Object.freeze(byVersion),
      totalKeywords:        allKeywords.size,
      totalRelationships,
      totalChunks,
      estimatedTotalTokens,
      builtAt:              this._builtAt,
      lastUpdatedAt:        this._updatedAt,
    });
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_INDEX__?: OfficialLibraryIndexImpl };
if (!G.__OL_INDEX__) G.__OL_INDEX__ = new OfficialLibraryIndexImpl();
export const OfficialLibraryIndex: OfficialLibraryIndexImpl = G.__OL_INDEX__;