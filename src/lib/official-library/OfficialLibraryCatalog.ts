/**
 * OfficialLibraryCatalog.ts — Sprint EF-7.2.2
 *
 * The catalog is now fully decoupled from Vite, Node, and Base44.
 * It depends exclusively on IDocumentDiscovery via DocumentDiscoveryRegistry.
 *
 * No import.meta.glob. No assetsInclude. No runtime-specific code.
 *
 * OCP: new document sources are added by registering a new IDocumentDiscovery
 *      implementation. This file never changes.
 *
 * DIP: depends on the abstraction (IDocumentDiscovery), never the concretion.
 */

import type { DocumentSource } from "./DocumentLoader";
import type { DiscoveredDocument } from "./DocumentDiscovery";
import { DocumentDiscoveryRegistry } from "./DocumentDiscoveryRegistry";

// ── Adapter: DiscoveredDocument → DocumentSource (backward compat) ────────────

function toDocumentSource(doc: DiscoveredDocument): DocumentSource {
  return {
    id:   doc.id,
    name: doc.name,
    path: doc.path,
    load: doc.load,
  };
}

// ── Catalog implementation ────────────────────────────────────────────────────

class OfficialLibraryCatalogImpl {
  private _sources:     DocumentSource[] | null = null;
  private _errors:      string[]                = [];
  private _discoveryMs: number                  = 0;
  private _runtimeId:   string                  = "unknown";

  /** Discover all official documents via the registered IDocumentDiscovery. */
  discover(): DocumentSource[] {
    if (this._sources !== null) return this._sources;

    this._sources = [];
    this._errors  = [];

    try {
      const discovery = DocumentDiscoveryRegistry.getActive();
      this._runtimeId = discovery.runtimeId;

      // discover() is async, but we need to support sync callers (backward compat).
      // We store a pending promise and return empty on first sync call.
      // Bootstrap (which is async) should call discoverAsync() instead.
      const t0 = Date.now();

      // Kick off async discovery — result available on next discoverAsync() call
      discovery.discover().then(result => {
        this._sources     = result.documents.map(toDocumentSource);
        this._errors      = [...result.diagnostics];
        this._discoveryMs = result.durationMs;
        this._runtimeId   = result.runtimeId;
      }).catch(e => {
        this._errors.push(`Discovery failed: ${(e as Error).message}`);
        this._sources = [];
      });

      this._discoveryMs = Date.now() - t0;
    } catch (e) {
      this._errors.push(`OfficialLibraryCatalog: no discovery implementation registered — ${(e as Error).message}`);
      this._sources = [];
    }

    return this._sources;
  }

  /** Async version — awaits full discovery. Use this in async contexts (Bootstrap). */
  async discoverAsync(): Promise<DocumentSource[]> {
    this._sources = null; // force re-discovery

    try {
      const discovery = DocumentDiscoveryRegistry.getActive();
      this._runtimeId = discovery.runtimeId;
      const t0        = Date.now();
      const result    = await discovery.discover();

      this._sources     = result.documents.map(toDocumentSource);
      this._errors      = [...result.diagnostics];
      this._discoveryMs = Date.now() - t0;
      this._runtimeId   = result.runtimeId;
    } catch (e) {
      this._errors.push(`OfficialLibraryCatalog: discovery failed — ${(e as Error).message}`);
      this._sources = [];
    }

    return this._sources;
  }

  /** All discovery errors/diagnostics. */
  get diagnostics(): string[] { return [...this._errors]; }

  /** Document count discovered. */
  get count(): number { return this._sources?.length ?? 0; }

  /** True if at least one document was discovered. */
  get hasDocuments(): boolean { return (this._sources?.length ?? 0) > 0; }

  /** Which runtime performed the discovery. */
  get runtimeId(): string { return this._runtimeId; }

  /** How long discovery took in ms. */
  get discoveryMs(): number { return this._discoveryMs; }

  /** Force rediscovery on next call. */
  reset(): void {
    this._sources     = null;
    this._errors      = [];
    this._discoveryMs = 0;
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_CATALOG__?: OfficialLibraryCatalogImpl };
if (!G.__OL_CATALOG__) G.__OL_CATALOG__ = new OfficialLibraryCatalogImpl();
export const OfficialLibraryCatalog: OfficialLibraryCatalogImpl = G.__OL_CATALOG__;