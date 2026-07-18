/**
 * DocumentLoaderFactory.ts — Sprint EF-7.2.2
 *
 * Factory that provides the correct DocumentLoader strategy based on the
 * current runtime environment.
 *
 * Consumers depend only on the IDocumentLoader interface.
 * The factory decides which implementation to use.
 *
 * Factory priority:
 *   Vite → Node → Base44 → Future providers
 *
 * Extending: register a new loader via DocumentLoaderFactory.register().
 */

import type { DocumentSource, LoadedDocument } from "./DocumentLoader";

// ── IDocumentLoader interface ─────────────────────────────────────────────────

export interface IDocumentLoader {
  readonly loaderId:   string;
  readonly loaderName: string;
  readonly isAvailable: boolean;

  load(source: DocumentSource): Promise<LoadedDocument>;
  loadAll(sources: DocumentSource[]): Promise<LoadedDocument[]>;
  successful(docs: LoadedDocument[]): LoadedDocument[];
  errors(docs: LoadedDocument[]): { id: string; name: string; error: string }[];
}

// ── Default implementation: wraps the existing DocumentLoader ─────────────────

import { DocumentLoader } from "./DocumentLoader";

class DefaultDocumentLoaderImpl implements IDocumentLoader {
  readonly loaderId    = "default-v1";
  readonly loaderName  = "Default (async fetch)";
  readonly isAvailable = true;

  load(source: DocumentSource): Promise<LoadedDocument>     { return DocumentLoader.load(source); }
  loadAll(sources: DocumentSource[]): Promise<LoadedDocument[]> { return DocumentLoader.loadAll(sources); }
  successful(docs: LoadedDocument[]): LoadedDocument[]          { return DocumentLoader.successful(docs); }
  errors(docs: LoadedDocument[]): { id: string; name: string; error: string }[] { return DocumentLoader.errors(docs); }
}

// ── Factory ───────────────────────────────────────────────────────────────────

class DocumentLoaderFactoryImpl {
  private readonly _loaders = new Map<string, IDocumentLoader>();
  private _active: IDocumentLoader | null = null;

  constructor() {
    // Register the default loader
    const def = new DefaultDocumentLoaderImpl();
    this._loaders.set(def.loaderId, def);
    this._active = def;
  }

  /** Register a loader implementation. */
  register(loader: IDocumentLoader): void {
    this._loaders.set(loader.loaderId, loader);
  }

  /** Explicitly set the active loader (DI). */
  setActive(loader: IDocumentLoader): void {
    if (!this._loaders.has(loader.loaderId)) this._loaders.set(loader.loaderId, loader);
    this._active = loader;
  }

  /** Get the active loader. Auto-selects if none set. */
  getActive(): IDocumentLoader {
    if (this._active) return this._active;
    for (const loader of this._loaders.values()) {
      if (loader.isAvailable) { this._active = loader; return loader; }
    }
    throw new Error("DocumentLoaderFactory: no loader available");
  }

  /** Get a loader by id. */
  get(loaderId: string): IDocumentLoader | undefined {
    return this._loaders.get(loaderId);
  }

  listIds(): string[]  { return [...this._loaders.keys()]; }
  get size(): number   { return this._loaders.size; }

  _reset(): void {
    this._loaders.clear();
    this._active = null;
    const def = new DefaultDocumentLoaderImpl();
    this._loaders.set(def.loaderId, def);
    this._active = def;
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_LOADER_FACTORY__?: DocumentLoaderFactoryImpl };
if (!G.__OL_LOADER_FACTORY__) G.__OL_LOADER_FACTORY__ = new DocumentLoaderFactoryImpl();
export const DocumentLoaderFactory: DocumentLoaderFactoryImpl = G.__OL_LOADER_FACTORY__;