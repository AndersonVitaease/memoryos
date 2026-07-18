/**
 * OfficialLibraryCatalog.ts — Sprint EF-7.2.1
 *
 * Discovers all official documents automatically.
 * NO hardcoded document lists.
 * Adding a new document to src/docs/00-official-library/ requires ZERO code changes here.
 *
 * Strategy: Vite's import.meta.glob() discovers all .md files at build time.
 * At runtime, the catalog iterates the discovered modules.
 * Fallback for environments without glob: empty catalog with diagnostic error.
 */

import type { DocumentSource } from "./DocumentLoader";

// ── Glob-based auto-discovery ─────────────────────────────────────────────────
// { as: 'raw' } loads file content as a plain string — avoids Vite trying to
// parse .md files as JS modules, which causes build errors.

type RawGlobRecord = Record<string, () => Promise<string>>;

function makeGlobSources(glob: RawGlobRecord, _authorityPath: string): DocumentSource[] {
  return Object.entries(glob).map(([path, importer]) => {
    const fileName = path.split("/").pop() ?? path;
    const name     = fileName.replace(/\.md$/i, "");
    const id       = `doc-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    return {
      id,
      name,
      path: path.replace(/^\//, "src/"),
      load: async () => {
        const content = await importer();
        return typeof content === "string" ? content : (content as any).default ?? "";
      },
    } satisfies DocumentSource;
  });
}

// ── Catalog implementation ────────────────────────────────────────────────────

class OfficialLibraryCatalogImpl {
  private _sources: DocumentSource[] | null = null;
  private _errors:  string[]                = [];

  /** Discover all official documents. Returns DocumentSource[]. */
  discover(): DocumentSource[] {
    if (this._sources !== null) return this._sources;

    this._sources = [];
    this._errors  = [];

    try {
      // { as: 'raw' } — load .md as plain string, never parsed as JS
      const officialGlob = import.meta.glob(
        "/src/docs/00-official-library/*.md",
        { eager: false, as: "raw" }
      ) as RawGlobRecord;
      this._sources.push(...makeGlobSources(officialGlob, "00-official-library"));
    } catch (e) {
      this._errors.push(`official-library glob failed: ${(e as Error).message}`);
    }

    try {
      const foundationGlob = import.meta.glob(
        "/src/docs/foundation/*.md",
        { eager: false, as: "raw" }
      ) as RawGlobRecord;
      this._sources.push(...makeGlobSources(foundationGlob, "foundation"));
    } catch (e) {
      this._errors.push(`foundation glob failed: ${(e as Error).message}`);
    }

    try {
      const adrGlob = import.meta.glob(
        "/src/docs/foundation/adr/*.md",
        { eager: false, as: "raw" }
      ) as RawGlobRecord;
      this._sources.push(...makeGlobSources(adrGlob, "adr"));
    } catch { /* ADRs are optional */ }

    try {
      const rfcGlob = import.meta.glob(
        "/src/docs/foundation/rfc/*.md",
        { eager: false, as: "raw" }
      ) as RawGlobRecord;
      this._sources.push(...makeGlobSources(rfcGlob, "rfc"));
    } catch { /* RFCs are optional */ }

    if (this._sources.length === 0) {
      this._errors.push("No official documents discovered. Vite glob may not be available.");
    }

    return this._sources;
  }

  /** All discovery errors (diagnostics — never throws). */
  get diagnostics(): string[] { return [...this._errors]; }

  /** Document count discovered. */
  get count(): number { return this._sources?.length ?? 0; }

  /** True if at least one document was discovered. */
  get hasDocuments(): boolean { return (this._sources?.length ?? 0) > 0; }

  /** Force rediscovery (used by Watcher on reindex). */
  reset(): void { this._sources = null; this._errors = []; }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_CATALOG__?: OfficialLibraryCatalogImpl };
if (!G.__OL_CATALOG__) G.__OL_CATALOG__ = new OfficialLibraryCatalogImpl();
export const OfficialLibraryCatalog: OfficialLibraryCatalogImpl = G.__OL_CATALOG__;