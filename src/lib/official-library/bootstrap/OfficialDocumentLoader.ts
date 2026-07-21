/**
 * OfficialDocumentLoader.ts — Sprint EF-42.6
 *
 * SRP: load raw content from discovered document entries.
 * Never parses, never generates chunks, never indexes.
 */

import type { DiscoveredEntry } from "./OfficialDocumentDiscovery";
import type { RawDocumentInput } from "../content/OfficialDocumentParser";

export interface LoadResult {
  readonly documentId: string;
  readonly name:       string;
  readonly path:       string;
  readonly raw:        RawDocumentInput | null;
  readonly error:      string | null;
  readonly durationMs: number;
}

class OfficialDocumentLoaderImpl {

  /** Load a single discovered entry into a RawDocumentInput. */
  async load(entry: DiscoveredEntry): Promise<LoadResult> {
    const t0 = Date.now();
    try {
      const content = await entry.load();
      if (!content || content.trim().length < 10) {
        return Object.freeze({
          documentId: entry.id, name: entry.name, path: entry.path,
          raw:   null,
          error: `Content of "${entry.name}" is empty or too short`,
          durationMs: Date.now() - t0,
        });
      }
      return Object.freeze({
        documentId: entry.id, name: entry.name, path: entry.path,
        raw: Object.freeze({ documentId: entry.id, title: entry.name, content }),
        error:      null,
        durationMs: Date.now() - t0,
      });
    } catch (e) {
      return Object.freeze({
        documentId: entry.id, name: entry.name, path: entry.path,
        raw:        null,
        error:      `Load failed for "${entry.name}": ${(e as Error).message}`,
        durationMs: Date.now() - t0,
      });
    }
  }

  /** Load all entries in parallel. Never throws. */
  async loadAll(entries: readonly DiscoveredEntry[]): Promise<LoadResult[]> {
    return Promise.all(entries.map(e => this.load(e)));
  }

  successful(results: LoadResult[]): RawDocumentInput[] {
    return results.filter(r => r.raw !== null).map(r => r.raw!);
  }

  errors(results: LoadResult[]): { id: string; name: string; error: string }[] {
    return results
      .filter(r => r.error !== null)
      .map(r => ({ id: r.documentId, name: r.name, error: r.error! }));
  }
}

const G = globalThis as typeof globalThis & { __EF426_LOADER__?: OfficialDocumentLoaderImpl };
if (!G.__EF426_LOADER__) G.__EF426_LOADER__ = new OfficialDocumentLoaderImpl();
export const OfficialDocumentLoader: OfficialDocumentLoaderImpl = G.__EF426_LOADER__;