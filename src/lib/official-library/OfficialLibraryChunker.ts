/**
 * OfficialLibraryChunker.ts — Sprint EF-7.2.0
 *
 * Converts large official documents into small semantic chunks.
 * Each chunk is independently searchable and citable.
 *
 * Strategy:
 *   1. Use ParsedSections as natural boundaries.
 *   2. If a section is too large, split into overlapping windows.
 *   3. Generate summary from first sentence or title.
 */

import type { ParsedDocument, ParsedSection } from "./OfficialLibraryParser";
import type { OfficialChunk } from "./OfficialLibraryTypes";
import { MemoryAuthority, MemorySourceType } from "./OfficialLibraryTypes";

const MAX_CHUNK_CHARS  = 1200;
const OVERLAP_CHARS    = 150;
const MIN_CHUNK_CHARS  = 40;

let _seq = 1;
function chunkId(docId: string, i: number): string {
  return `chunk-${docId}-${i}-${(_seq++).toString(36)}`;
}

function firstSentence(text: string, maxLen = 120): string {
  const m = text.match(/^[^.!?\n]{10,}/);
  if (m) return m[0].trim().slice(0, maxLen);
  return text.trim().slice(0, maxLen);
}

function splitLargeSection(content: string): string[] {
  if (content.length <= MAX_CHUNK_CHARS) return [content];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < content.length) {
    const end = Math.min(offset + MAX_CHUNK_CHARS, content.length);
    chunks.push(content.slice(offset, end));
    offset += MAX_CHUNK_CHARS - OVERLAP_CHARS;
  }
  return chunks;
}

export const OfficialLibraryChunker = {

  /** Chunk a single parsed document into OfficialChunk[]. */
  chunk(doc: ParsedDocument): OfficialChunk[] {
    const chunks: OfficialChunk[] = [];
    let   idx   = 0;

    for (const section of doc.sections) {
      if (section.content.length < MIN_CHUNK_CHARS) continue;

      const subParts = splitLargeSection(section.content);
      for (let pi = 0; pi < subParts.length; pi++) {
        const part    = subParts[pi];
        const title   = subParts.length > 1
          ? `${section.title} (part ${pi + 1}/${subParts.length})`
          : section.title;

        chunks.push(Object.freeze({
          id:           chunkId(doc.documentId, idx++),
          documentId:   doc.documentId,
          documentName: doc.documentName,
          version:      doc.version,
          chapter:      section.chapter,
          section:      section.section,
          title,
          content:      part.trim(),
          summary:      firstSentence(part),
          authority:    doc.authority,
          sourceType:   MemorySourceType.OFFICIAL_LIBRARY,
          createdAt:    doc.detectedAt,
          updatedAt:    doc.detectedAt,
          tags:         [...doc.tags, `chapter:${section.chapter}`.toLowerCase().replace(/\s+/g, "-")],
          metadata:     {
            path:      doc.path,
            level:     section.level,
            lineStart: section.lineStart,
            partIndex: pi,
            partTotal: subParts.length,
          },
        } satisfies OfficialChunk));
      }
    }

    return chunks;
  },

  /** Chunk multiple documents. */
  chunkAll(docs: ParsedDocument[]): OfficialChunk[] {
    return docs.flatMap(d => OfficialLibraryChunker.chunk(d));
  },

  /** Stats for a chunk set. */
  stats(chunks: OfficialChunk[]): { count: number; avgLen: number; totalChars: number } {
    if (chunks.length === 0) return { count: 0, avgLen: 0, totalChars: 0 };
    const totalChars = chunks.reduce((s, c) => s + c.content.length, 0);
    return { count: chunks.length, avgLen: Math.round(totalChars / chunks.length), totalChars };
  },
};