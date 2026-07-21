/**
 * OfficialLibraryRegistry.ts — Sprint EF-41
 *
 * Maintains a structured, queryable registry of all official documents.
 * While OfficialLibraryIndex stores flat metadata records,
 * the Registry organizes them into:
 *   - Category buckets
 *   - Version timelines
 *   - Relationship maps
 *
 * The Registry is built FROM the Index after each indexing cycle.
 * It is the layer that will be consumed by the Retrieval Engine.
 *
 * SRP: organizes and cross-references — never loads, parses or chunks.
 */

import type { OfficialDocumentMetadata, OfficialDocumentCategory } from "./OfficialDocumentMetadata";
import { OfficialLibraryIndex } from "./OfficialLibraryIndex";

// ── Version entry ─────────────────────────────────────────────────────────────

export interface VersionEntry {
  readonly version:  string;
  readonly docId:    string;
  readonly docTitle: string;
  readonly status:   string;
  readonly updatedAt: string;
}

// ── Category entry ────────────────────────────────────────────────────────────

export interface CategoryEntry {
  readonly category:  OfficialDocumentCategory;
  readonly documents: readonly OfficialDocumentMetadata[];
  readonly count:     number;
}

// ── Registry snapshot ─────────────────────────────────────────────────────────

export interface RegistrySnapshot {
  readonly totalDocuments:     number;
  readonly categories:         readonly CategoryEntry[];
  readonly versionTimeline:    readonly VersionEntry[];
  readonly relationshipEdges:  number;
  readonly builtAt:            string;
}

// ── Registry implementation ───────────────────────────────────────────────────

class OfficialLibraryRegistryImpl {
  private _categories:  Map<string, OfficialDocumentMetadata[]> = new Map();
  private _versions:    VersionEntry[]                          = [];
  private _relMap:      Map<string, string[]>                   = new Map(); // docId → related docIds
  private _builtAt:     string | null                           = null;

  get isBuilt(): boolean { return this._builtAt !== null; }

  /**
   * Rebuild the entire registry from the current OfficialLibraryIndex state.
   * Called by OfficialLibraryIndexer after every full rebuild or incremental update.
   */
  rebuild(): void {
    this._categories.clear();
    this._versions = [];
    this._relMap.clear();

    const all = OfficialLibraryIndex.getAll();

    for (const doc of all) {
      // Category buckets
      if (!this._categories.has(doc.category)) this._categories.set(doc.category, []);
      this._categories.get(doc.category)!.push(doc);

      // Version timeline
      this._versions.push({
        version:  doc.version,
        docId:    doc.id,
        docTitle: doc.title,
        status:   doc.status,
        updatedAt: doc.updatedAt,
      });

      // Relationship map
      if (doc.relatedDocuments.length > 0) {
        this._relMap.set(doc.id, doc.relatedDocuments.map(r => r.targetId));
      }
    }

    // Sort version timeline (most recent first)
    this._versions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    this._builtAt = new Date().toISOString();
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /** Get all documents in a category. */
  getByCategory(category: OfficialDocumentCategory): OfficialDocumentMetadata[] {
    return [...(this._categories.get(category) ?? [])];
  }

  /** Get all known categories (only those with at least one document). */
  getCategories(): OfficialDocumentCategory[] {
    return [...this._categories.keys()] as OfficialDocumentCategory[];
  }

  /** Get version timeline entries for a specific document or all. */
  getVersionTimeline(docId?: string): VersionEntry[] {
    if (docId) return this._versions.filter(v => v.docId === docId);
    return [...this._versions];
  }

  /** Get all document IDs related to a given document. */
  getRelationships(docId: string): string[] {
    return [...(this._relMap.get(docId) ?? [])];
  }

  /** Count all relationship edges. */
  get relationshipEdgeCount(): number {
    let count = 0;
    for (const targets of this._relMap.values()) count += targets.length;
    return count;
  }

  /** Snapshot of current registry state. */
  snapshot(): RegistrySnapshot {
    const categories: CategoryEntry[] = [];
    for (const [category, docs] of this._categories.entries()) {
      categories.push({
        category: category as OfficialDocumentCategory,
        documents: Object.freeze([...docs]),
        count: docs.length,
      });
    }
    categories.sort((a, b) => b.count - a.count);

    return Object.freeze({
      totalDocuments:    OfficialLibraryIndex.size,
      categories:        Object.freeze(categories),
      versionTimeline:   Object.freeze([...this._versions]),
      relationshipEdges: this.relationshipEdgeCount,
      builtAt:           this._builtAt ?? new Date().toISOString(),
    });
  }

  clear(): void {
    this._categories.clear();
    this._versions = [];
    this._relMap.clear();
    this._builtAt = null;
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_REGISTRY__?: OfficialLibraryRegistryImpl };
if (!G.__OL_REGISTRY__) G.__OL_REGISTRY__ = new OfficialLibraryRegistryImpl();
export const OfficialLibraryRegistry: OfficialLibraryRegistryImpl = G.__OL_REGISTRY__;