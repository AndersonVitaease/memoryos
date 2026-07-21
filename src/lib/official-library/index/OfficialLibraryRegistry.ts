/**
 * OfficialLibraryRegistry.ts — Sprint EF-41A (Refinement 2)
 *
 * Maintains a structured, queryable registry of all official documents.
 *
 * What changed in EF-41A:
 *   - Registry no longer reads OfficialLibraryIndex directly (decoupled).
 *   - rebuild() now requires the caller (OfficialLibraryIndexOrchestrator)
 *     to pass the indexed documents explicitly.
 *   - This eliminates the Registry → Index singleton coupling.
 *
 * The new data flow is strictly one-directional:
 *   OfficialLibraryIndexOrchestrator
 *     → OfficialLibraryIndex (write)
 *     → OfficialLibraryRegistry.rebuild(docs) (pass docs explicitly)
 *
 * SRP: organize and cross-reference indexed documents.
 *      Never reads from Index. Never loads, parses, or chunks.
 */

import type { OfficialDocumentMetadata, OfficialDocumentCategory } from "./OfficialDocumentMetadata";

// ── Version entry ─────────────────────────────────────────────────────────────

export interface VersionEntry {
  readonly version:   string;
  readonly docId:     string;
  readonly docTitle:  string;
  readonly status:    string;
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
  readonly totalDocuments:    number;
  readonly categories:        readonly CategoryEntry[];
  readonly versionTimeline:   readonly VersionEntry[];
  readonly relationshipEdges: number;
  readonly builtAt:           string;
}

// ── Registry implementation ───────────────────────────────────────────────────

class OfficialLibraryRegistryImpl {
  private _categories: Map<string, OfficialDocumentMetadata[]> = new Map();
  private _versions:   VersionEntry[]                          = [];
  private _relMap:     Map<string, string[]>                   = new Map();
  private _total:      number                                  = 0;
  private _builtAt:    string | null                           = null;

  get isBuilt(): boolean { return this._builtAt !== null; }

  /**
   * Rebuild registry from an explicit document list.
   * Called by OfficialLibraryIndexOrchestrator — NOT reading from Index singleton.
   * This removes the Registry → Index coupling (Refinement 2).
   */
  rebuild(docs: readonly OfficialDocumentMetadata[]): void {
    this._categories.clear();
    this._versions = [];
    this._relMap.clear();
    this._total = docs.length;

    for (const doc of docs) {
      if (!this._categories.has(doc.category)) this._categories.set(doc.category, []);
      this._categories.get(doc.category)!.push(doc);

      this._versions.push({
        version:  doc.version,
        docId:    doc.id,
        docTitle: doc.title,
        status:   doc.status,
        updatedAt: doc.updatedAt,
      });

      if (doc.relatedDocuments.length > 0) {
        this._relMap.set(doc.id, doc.relatedDocuments.map(r => r.targetId));
      }
    }

    this._versions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    this._builtAt = new Date().toISOString();
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getByCategory(category: OfficialDocumentCategory): OfficialDocumentMetadata[] {
    return [...(this._categories.get(category) ?? [])];
  }

  getCategories(): OfficialDocumentCategory[] {
    return [...this._categories.keys()] as OfficialDocumentCategory[];
  }

  getVersionTimeline(docId?: string): VersionEntry[] {
    if (docId) return this._versions.filter(v => v.docId === docId);
    return [...this._versions];
  }

  getRelationships(docId: string): string[] {
    return [...(this._relMap.get(docId) ?? [])];
  }

  get relationshipEdgeCount(): number {
    let count = 0;
    for (const targets of this._relMap.values()) count += targets.length;
    return count;
  }

  snapshot(): RegistrySnapshot {
    const categories: CategoryEntry[] = [];
    for (const [category, docs] of this._categories.entries()) {
      categories.push({
        category:  category as OfficialDocumentCategory,
        documents: Object.freeze([...docs]),
        count:     docs.length,
      });
    }
    categories.sort((a, b) => b.count - a.count);

    return Object.freeze({
      totalDocuments:    this._total,
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
    this._total   = 0;
    this._builtAt = null;
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_REGISTRY__?: OfficialLibraryRegistryImpl };
if (!G.__OL_REGISTRY__) G.__OL_REGISTRY__ = new OfficialLibraryRegistryImpl();
export const OfficialLibraryRegistry: OfficialLibraryRegistryImpl = G.__OL_REGISTRY__;