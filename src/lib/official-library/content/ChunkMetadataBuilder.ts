/**
 * ChunkMetadataBuilder.ts — Sprint EF-42.5
 *
 * SRP: extract chapter, section, hierarchy, title, keywords, token estimate,
 *      depth from a parsed content block.
 * Never accesses Retrieval, never accesses Index.
 */

export interface ChunkMeta {
  readonly chapter:        string;
  readonly section:        string;
  readonly hierarchy:      readonly string[];
  readonly title:          string;
  readonly keywords:       readonly string[];
  readonly tokenEstimate:  number;
  readonly depth:          number;
}

/** Heading line matcher: # Title, ## Title, ### Title, etc. */
const HEADING_RE = /^(#{1,6})\s+(.+)$/;

/** ~4 chars per token (rough GPT-style estimate) */
const CHARS_PER_TOKEN = 4;

class ChunkMetadataBuilderImpl {

  build(lines: readonly string[], docTitle: string): ChunkMeta {
    const firstHeading = this._firstHeading(lines);
    const chapter      = this._chapterFromLines(lines, docTitle);
    const section      = this._sectionFromLines(lines);
    const hierarchy    = this._hierarchy(lines);
    const title        = firstHeading ?? chapter;
    const keywords     = this._extractKeywords(lines);
    const tokenEstimate = this._estimateTokens(lines.join("\n"));
    const depth        = hierarchy.length;

    return Object.freeze({
      chapter:       chapter,
      section:       section,
      hierarchy:     Object.freeze(hierarchy),
      title:         title,
      keywords:      Object.freeze(keywords),
      tokenEstimate: tokenEstimate,
      depth:         depth,
    });
  }

  estimateTokens(text: string): number {
    return this._estimateTokens(text);
  }

  private _estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  private _firstHeading(lines: readonly string[]): string | null {
    for (const line of lines) {
      const m = HEADING_RE.exec(line);
      if (m) return m[2].trim();
    }
    return null;
  }

  private _chapterFromLines(lines: readonly string[], docTitle: string): string {
    // Chapter = first h1 or h2
    for (const line of lines) {
      const m = HEADING_RE.exec(line);
      if (m && m[1].length <= 2) return m[2].trim();
    }
    return docTitle;
  }

  private _sectionFromLines(lines: readonly string[]): string {
    // Section = first h3 or deeper heading
    for (const line of lines) {
      const m = HEADING_RE.exec(line);
      if (m && m[1].length >= 3) return m[2].trim();
    }
    // Fallback: first h1/h2 after initial
    let found = 0;
    for (const line of lines) {
      const m = HEADING_RE.exec(line);
      if (m) {
        found++;
        if (found > 1) return m[2].trim();
      }
    }
    return "content";
  }

  private _hierarchy(lines: readonly string[]): string[] {
    const hier: string[] = [];
    for (const line of lines) {
      const m = HEADING_RE.exec(line);
      if (m) hier.push(m[2].trim());
      if (hier.length >= 4) break;
    }
    return hier;
  }

  private _extractKeywords(lines: readonly string[]): string[] {
    const text  = lines.join(" ").toLowerCase();
    const words = text.split(/\W+/).filter(w => w.length > 4);
    const freq  = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
    const STOP = new Set(["that","this","with","from","have","been","will","they","their","which","when","then","than","into","also","about","should","would","could","after","before","these","those","other","where","there","every","some","what","does","more","such","each","only","even","over","same","both","most","much","very","just","your","here","like","all","and","but","for","not","are","was","the","has","can","its","any","our","may","one","two","three"]);
    return [...freq.entries()]
      .filter(([w]) => !STOP.has(w))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([w]) => w);
  }
}

const G = globalThis as typeof globalThis & { __OL_CHUNK_META_BUILDER__?: ChunkMetadataBuilderImpl };
if (!G.__OL_CHUNK_META_BUILDER__) G.__OL_CHUNK_META_BUILDER__ = new ChunkMetadataBuilderImpl();
export const ChunkMetadataBuilder: ChunkMetadataBuilderImpl = G.__OL_CHUNK_META_BUILDER__;