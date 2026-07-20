/**
 * DocumentTypeDetector.ts — Sprint M1.4
 *
 * SRP: detectar o DocumentType a partir de mimeType e nome do arquivo.
 * Sem dependências de rede, conectores ou parsers.
 */

import type { DocumentType } from "./DocumentProcessingTypes";

// ── MIME → DocumentType ───────────────────────────────────────────────────────

const MIME_MAP: Readonly<Record<string, DocumentType>> = Object.freeze({
  "application/pdf": "pdf",

  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "docx",

  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xlsx",
  "text/csv": "csv",

  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-powerpoint": "pptx",

  "text/plain": "txt",
  "text/markdown": "markdown",
  "text/html": "html",
  "application/html": "html",
  "application/json": "txt",
  "application/xml": "txt",
  "text/xml": "txt",

  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/tiff": "image",
  "image/bmp": "image",
});

// ── Extension → DocumentType (fallback) ───────────────────────────────────────

const EXT_MAP: Readonly<Record<string, DocumentType>> = Object.freeze({
  pdf:      "pdf",
  docx:     "docx",
  doc:      "docx",
  xlsx:     "xlsx",
  xls:      "xlsx",
  csv:      "csv",
  pptx:     "pptx",
  ppt:      "pptx",
  txt:      "txt",
  md:       "markdown",
  markdown: "markdown",
  html:     "html",
  htm:      "html",
  json:     "txt",
  xml:      "txt",
  jpg:      "image",
  jpeg:     "image",
  png:      "image",
  gif:      "image",
  webp:     "image",
  tiff:     "image",
  bmp:      "image",
});

// ── Public API ────────────────────────────────────────────────────────────────

export class DocumentTypeDetector {
  /**
   * Detecta o DocumentType a partir de mimeType e fileName.
   * mimeType tem prioridade; extensão é fallback.
   */
  detect(mimeType: string, fileName: string): DocumentType {
    // 1. Exact MIME match
    const fromMime = MIME_MAP[mimeType.toLowerCase().trim()];
    if (fromMime) return fromMime;

    // 2. MIME prefix match (text/* → txt)
    if (mimeType.startsWith("text/")) return "txt";
    if (mimeType.startsWith("image/")) return "image";

    // 3. Extension fallback
    const ext = fileName.split(".").pop()?.toLowerCase().trim() ?? "";
    const fromExt = EXT_MAP[ext];
    if (fromExt) return fromExt;

    return "unknown";
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const documentTypeDetector = new DocumentTypeDetector();