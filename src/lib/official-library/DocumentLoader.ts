/**
 * DocumentLoader.ts — Sprint EF-7.2.1
 *
 * Single responsibility: load raw document content.
 * Does NOT parse. Does NOT chunk. Does NOT index.
 *
 * Pipeline position:
 *   DocumentLoader → Parser → Chunker → Indexer
 */

export interface LoadedDocument {
  readonly id:          string;
  readonly name:        string;
  readonly path:        string;
  readonly raw:         string;
  readonly loadedAt:    string;
  readonly error:       string | null;
}

export interface DocumentSource {
  readonly id:   string;
  readonly name: string;
  readonly path: string;
  load(): Promise<string>;
}

export const DocumentLoader = {

  /** Load a single DocumentSource. Never throws — returns error in result. */
  async load(source: DocumentSource): Promise<LoadedDocument> {
    try {
      const raw = await source.load();
      if (!raw || raw.trim().length < 10) {
        return {
          id: source.id, name: source.name, path: source.path,
          raw: "", loadedAt: new Date().toISOString(),
          error: `Document "${source.name}" loaded but content is empty`,
        };
      }
      return {
        id: source.id, name: source.name, path: source.path,
        raw, loadedAt: new Date().toISOString(), error: null,
      };
    } catch (e) {
      return {
        id: source.id, name: source.name, path: source.path,
        raw: "", loadedAt: new Date().toISOString(),
        error: `Failed to load "${source.name}": ${(e as Error).message}`,
      };
    }
  },

  /** Load all sources in parallel. Never throws. */
  async loadAll(sources: DocumentSource[]): Promise<LoadedDocument[]> {
    return Promise.all(sources.map(s => DocumentLoader.load(s)));
  },

  /** Filter to only successfully loaded documents. */
  successful(docs: LoadedDocument[]): LoadedDocument[] {
    return docs.filter(d => d.error === null && d.raw.length > 0);
  },

  /** Collect load errors for diagnostics. */
  errors(docs: LoadedDocument[]): { id: string; name: string; error: string }[] {
    return docs
      .filter(d => d.error !== null)
      .map(d => ({ id: d.id, name: d.name, error: d.error! }));
  },
};