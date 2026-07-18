/**
 * OfficialLibraryCatalog.ts — Sprint EF-7.2.3
 *
 * Thin async facade over DocumentDiscoveryRegistry.
 * No discover()/discoverAsync() split — everything is async (discover() IS async).
 *
 * EF-7.2.3 changes:
 * - discover() is now async (returns Promise<DocumentSource[]>)
 * - Removed sync discover() to eliminate the fire-and-forget anti-pattern
 * - Bootstrap calls await catalog.discover() — clean, no surprises
 *
 * Breaking change from EF-7.2.2: discover() is now async.
 * All callers (Bootstrap) already await it. No consumer used the sync version.
 */

import type { DocumentSource } from "./DocumentLoader";
import type { DiscoveredDocument } from "./DocumentDiscovery";
import { DocumentDiscoveryRegistry } from "./DocumentDiscoveryRegistry";

function toDocumentSource(doc: DiscoveredDocument): DocumentSource {
  return { id: doc.id, name: doc.name, path: doc.path, load: doc.load };
}

class OfficialLibraryCatalogImpl {
  private _sources:     DocumentSource[] | null = null;
  private _errors:      string[]                = [];
  private _discoveryMs: number                  = 0;
  private _runtimeId:   string                  = "unknown";

  /** Discover all documents via the active IDocumentDiscovery. Cached after first call. */
  async discover(): Promise<DocumentSource[]> {
    if (this._sources !== null) return this._sources;

    try {
      const discovery  = DocumentDiscoveryRegistry.getActive();
      this._runtimeId  = discovery.runtimeId;
      const t0         = Date.now();
      const result     = await discovery.discover();

      this._sources     = result.documents.map(toDocumentSource);
      this._errors      = [...result.diagnostics];
      this._discoveryMs = Date.now() - t0;
      this._runtimeId   = result.runtimeId;
    } catch (e) {
      this._errors.push(`OfficialLibraryCatalog: discovery failed — ${(e as Error).message}`);
      this._sources = [];
    }

    return this._sources!;
  }

  get diagnostics(): string[]  { return [...this._errors]; }
  get count(): number          { return this._sources?.length ?? 0; }
  get hasDocuments(): boolean  { return (this._sources?.length ?? 0) > 0; }
  get runtimeId(): string      { return this._runtimeId; }
  get discoveryMs(): number    { return this._discoveryMs; }

  reset(): void {
    this._sources     = null;
    this._errors      = [];
    this._discoveryMs = 0;
  }
}

const G = globalThis as typeof globalThis & { __OL_CATALOG__?: OfficialLibraryCatalogImpl };
if (!G.__OL_CATALOG__) G.__OL_CATALOG__ = new OfficialLibraryCatalogImpl();
export const OfficialLibraryCatalog: OfficialLibraryCatalogImpl = G.__OL_CATALOG__;