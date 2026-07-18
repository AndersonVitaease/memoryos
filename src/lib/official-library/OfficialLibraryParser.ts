/**
 * OfficialLibraryParser.ts — Sprint EF-7.2.0
 *
 * Converts official documents to internal ParsedDocument structure.
 * No regex scattered across the codebase — all parsing logic lives here.
 * Prepared for: Markdown, TXT, JSON. Interface ready for: PDF (future).
 */

import { MemoryAuthority, MemorySourceType } from "./OfficialLibraryTypes";
import { OfficialAuthority } from "./OfficialAuthority";

// ── Internal representation ───────────────────────────────────────────────────

export interface ParsedSection {
  readonly title:   string;
  readonly level:   number;       // heading depth 1–6
  readonly content: string;
  readonly chapter: string;
  readonly section: string;
  readonly lineStart: number;
}

export interface ParsedDocument {
  readonly documentId:  string;
  readonly documentName: string;
  readonly path:        string;
  readonly rawContent:  string;
  readonly sections:    ParsedSection[];
  readonly version:     string;
  readonly authority:   MemoryAuthority;
  readonly sourceType:  MemorySourceType;
  readonly detectedAt:  string;
  readonly tags:        string[];
}

// ── Markdown Heading Parser ───────────────────────────────────────────────────

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const VERSION_RE = /v(\d+\.\d+(?:\.\d+)?)/i;
const TAG_RE     = /^(?:Sprint|Phase|ADR|RFC|EF|MV|MPS|MAS|MDS|MES|MCS|MRS|UCME|MRE|Sprint\s[\w-]+)/i;

function extractVersion(text: string): string {
  const m = text.match(VERSION_RE);
  return m ? m[1] : "1.0";
}

function extractTags(path: string, title: string): string[] {
  const tags: string[] = [];
  if (path.includes("00-official-library")) tags.push("official");
  if (path.includes("foundation"))          tags.push("foundation");
  if (path.includes("adr"))                 tags.push("adr");
  if (path.includes("rfc"))                 tags.push("rfc");
  const titleMatch = title.match(TAG_RE);
  if (titleMatch) tags.push(titleMatch[0].toLowerCase().replace(/\s+/g, "-"));
  return [...new Set(tags)];
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── Core Parsers ──────────────────────────────────────────────────────────────

function parseMarkdown(raw: string, documentId: string, path: string, documentName: string): ParsedSection[] {
  const lines    = raw.split("\n");
  const sections: ParsedSection[] = [];

  let currentTitle   = documentName;
  let currentLevel   = 1;
  let currentLines:  string[] = [];
  let currentStart   = 0;
  let chapterCounter = 0;
  let sectionCounter = 0;
  let currentChapter = "Introduction";

  function flushSection(lineEnd: number) {
    const content = currentLines.join("\n").trim();
    if (content.length < 10) return;
    sections.push({
      title:     currentTitle,
      level:     currentLevel,
      content,
      chapter:   currentLevel === 1 ? currentTitle : currentChapter,
      section:   currentTitle,
      lineStart: currentStart,
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hm   = line.match(HEADING_RE);

    if (hm) {
      flushSection(i);
      const level   = hm[1].length;
      const title   = hm[2].trim();

      if (level === 1) { chapterCounter++; sectionCounter = 0; currentChapter = title; }
      else if (level === 2) { sectionCounter++; }

      currentTitle  = title;
      currentLevel  = level;
      currentLines  = [];
      currentStart  = i;
    } else {
      currentLines.push(line);
    }
  }
  flushSection(lines.length);

  return sections;
}

function parseTxt(raw: string, documentId: string, documentName: string): ParsedSection[] {
  // Split by double newlines for TXT
  const paragraphs = raw.split(/\n{2,}/).filter(p => p.trim().length > 20);
  return paragraphs.map((content, i) => ({
    title:     `${documentName} — Part ${i + 1}`,
    level:     2,
    content:   content.trim(),
    chapter:   documentName,
    section:   `Part ${i + 1}`,
    lineStart: i,
  }));
}

function parseJson(raw: string, documentId: string, documentName: string): ParsedSection[] {
  try {
    const obj = JSON.parse(raw);
    const content = JSON.stringify(obj, null, 2);
    return [{
      title:     documentName,
      level:     1,
      content,
      chapter:   documentName,
      section:   "Root",
      lineStart: 0,
    }];
  } catch {
    return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const OfficialLibraryParser = {

  /** Detect format from path extension or content. */
  detectFormat(path: string, _content?: string): "markdown" | "txt" | "json" {
    if (path.endsWith(".md"))   return "markdown";
    if (path.endsWith(".json")) return "json";
    return "txt";
  },

  /** Parse a raw document string into a structured ParsedDocument. */
  parse(
    raw:          string,
    path:         string,
    documentName?: string,
  ): ParsedDocument {
    const name    = documentName ?? path.split("/").pop() ?? "Unknown";
    const docId   = `doc-${slugify(name)}`;
    const fmt     = OfficialLibraryParser.detectFormat(path);
    const version = extractVersion(raw) || extractVersion(name);
    const auth    = OfficialAuthority.fromPath(path);
    const tags    = extractTags(path, name);

    let sections: ParsedSection[];
    switch (fmt) {
      case "markdown": sections = parseMarkdown(raw, docId, path, name); break;
      case "json":     sections = parseJson(raw, docId, name); break;
      default:         sections = parseTxt(raw, docId, name); break;
    }

    return Object.freeze({
      documentId:  docId,
      documentName: name,
      path,
      rawContent:  raw,
      sections,
      version,
      authority:   auth,
      sourceType:  MemorySourceType.OFFICIAL_LIBRARY,
      detectedAt:  new Date().toISOString(),
      tags,
    });
  },

  /** Extract a human-readable summary from the first non-trivial section. */
  summarize(doc: ParsedDocument, maxChars = 200): string {
    const first = doc.sections.find(s => s.content.length > 30);
    if (!first) return doc.documentName;
    return first.content.replace(/\n/g, " ").trim().slice(0, maxChars);
  },
};