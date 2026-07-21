/**
 * ChunkBuilder.ts — Sprint EF-42.5
 *
 * SRP: transform a ParsedDocument into structured OfficialContentChunks.
 *      Each chunk: 300–800 tokens. Never splits mid-paragraph.
 *      Always preserves titles, subtitles, hierarchy, context.
 * Never indexes, never retrieves.
 */

import type { ParsedDocument } from "./OfficialDocumentParser";
import { ChunkMetadataBuilder } from "./ChunkMetadataBuilder";

// ── Chunk contract ─────────────────────────────────────────────────────────────

export interface OfficialContentChunk {
  readonly id:            string;
  readonly documentId:    string;
  readonly chapter:       string;
  readonly section:       string;
  readonly title:         string;
  readonly summary:       string;
  readonly content:       string;
  readonly tags:          readonly string[];
  readonly order:         number;
  readonly tokenEstimate: number;
}

// ── Config ─────────────────────────────────────────────────────────────────────

const TARGET_TOKENS_MIN = 300;
const TARGET_TOKENS_MAX = 800;
const CHARS_PER_TOKEN   = 4;

const MIN_CHARS = TARGET_TOKENS_MIN * CHARS_PER_TOKEN; // ~1200
const MAX_CHARS = TARGET_TOKENS_MAX * CHARS_PER_TOKEN; // ~3200

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

// ── Builder implementation ─────────────────────────────────────────────────────

class ChunkBuilderImpl {

  build(doc: ParsedDocument): OfficialContentChunk[] {
    const sections = this._splitIntoSections(doc.lines);
    const chunks: OfficialContentChunk[] = [];
    let order = 0;

    for (const section of sections) {
      const subChunks = this._chunkSection(section, doc.documentId, order);
      for (const c of subChunks) {
        chunks.push(c);
        order++;
      }
    }

    // If document was empty or too short, create a single minimal chunk
    if (chunks.length === 0 && doc.rawContent.trim().length > 0) {
      chunks.push(this._makeChunk(doc.documentId, doc.lines, doc.title, 0));
    }

    return chunks;
  }

  private _splitIntoSections(lines: readonly string[]): Array<string[]> {
    // Split at any heading (h1–h3), keeping the heading with its section
    const sections: string[][] = [];
    let current: string[] = [];

    for (const line of lines) {
      const m = HEADING_RE.exec(line);
      if (m && m[1].length <= 3 && current.length > 0) {
        sections.push(current);
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.length > 0) sections.push(current);
    return sections;
  }

  private _chunkSection(
    sectionLines: string[],
    documentId: string,
    startOrder: number,
  ): OfficialContentChunk[] {
    const fullText = sectionLines.join("\n");
    const tokenEst = Math.ceil(fullText.length / CHARS_PER_TOKEN);

    // Section fits in one chunk
    if (tokenEst <= TARGET_TOKENS_MAX) {
      return [this._makeChunk(documentId, sectionLines, this._headingOf(sectionLines), startOrder)];
    }

    // Section too large — split at paragraph boundaries
    const paragraphs = this._splitParagraphs(sectionLines);
    const chunks: OfficialContentChunk[] = [];
    let buffer: string[] = [];
    let bufferChars = 0;
    let order = startOrder;
    const heading = this._headingOf(sectionLines);

    for (const para of paragraphs) {
      const paraText = para.join("\n");
      const paraChars = paraText.length;

      if (bufferChars + paraChars > MAX_CHARS && bufferChars >= MIN_CHARS) {
        chunks.push(this._makeChunk(documentId, buffer, heading, order));
        order++;
        buffer = [...(heading ? [heading] : []), ...para]; // carry heading for context
        bufferChars = buffer.join("\n").length;
      } else {
        buffer.push(...para);
        bufferChars += paraChars;
      }
    }

    if (buffer.length > 0) {
      chunks.push(this._makeChunk(documentId, buffer, heading, order));
    }

    return chunks;
  }

  private _splitParagraphs(lines: string[]): string[][] {
    const paragraphs: string[][] = [];
    let current: string[] = [];

    for (const line of lines) {
      if (line.trim() === "" && current.length > 0) {
        paragraphs.push(current);
        current = [];
      } else {
        current.push(line);
      }
    }
    if (current.length > 0) paragraphs.push(current);
    return paragraphs;
  }

  private _headingOf(lines: string[]): string {
    for (const line of lines) {
      const m = HEADING_RE.exec(line);
      if (m) return m[2].trim();
    }
    return "";
  }

  private _makeChunk(
    documentId: string,
    lines: readonly string[],
    titleHint: string,
    order: number,
  ): OfficialContentChunk {
    const content = lines.join("\n").trim();
    const meta    = ChunkMetadataBuilder.build(lines, titleHint || documentId);
    const id      = `${documentId}::chunk::${order}`;
    const summary = this._summarize(content);

    return Object.freeze({
      id,
      documentId,
      chapter:       meta.chapter,
      section:       meta.section,
      title:         meta.title || titleHint || `Chunk ${order}`,
      summary,
      content,
      tags:          meta.keywords,
      order,
      tokenEstimate: meta.tokenEstimate,
    });
  }

  private _summarize(content: string): string {
    // First non-empty, non-heading line — max 120 chars
    const lines = content.split("\n");
    for (const line of lines) {
      const l = line.trim();
      if (l && !HEADING_RE.test(l)) {
        return l.length > 120 ? l.slice(0, 117) + "..." : l;
      }
    }
    return content.slice(0, 80).trim();
  }
}

const G = globalThis as typeof globalThis & { __OL_CHUNK_BUILDER__?: ChunkBuilderImpl };
if (!G.__OL_CHUNK_BUILDER__) G.__OL_CHUNK_BUILDER__ = new ChunkBuilderImpl();
export const ChunkBuilder: ChunkBuilderImpl = G.__OL_CHUNK_BUILDER__;