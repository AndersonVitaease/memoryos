/**
 * PlainTextParser.ts — Sprint M1.4
 *
 * Parser para texto plano, CSV, Markdown, HTML, JSON, XML.
 * Conteúdo já é texto legível — passa diretamente após limpeza mínima.
 */

import type {
  DocumentParser,
  RawDocument,
  ProcessingResult,
} from "../DocumentProcessingTypes";

export class PlainTextParser implements DocumentParser {
  readonly name = "PlainTextParser";
  readonly supportedMimeTypes = [
    "text/plain",
    "text/csv",
    "text/markdown",
    "text/html",
    "application/html",
    "application/json",
    "application/xml",
    "text/xml",
  ] as const;
  readonly supportedTypes = ["txt", "csv", "markdown", "html"] as const;

  async parse(doc: RawDocument): Promise<ProcessingResult> {
    const t0 = Date.now();

    if (!doc.rawContent || doc.rawContent.trim().length === 0) {
      return {
        ok:           false,
        fileName:     doc.fileName,
        mimeType:     doc.mimeType,
        documentType: "txt",
        errorCode:    "EMPTY_CONTENT",
        message:      `Conteúdo vazio para "${doc.fileName}".`,
        parserUsed:   this.name,
        durationMs:   Date.now() - t0,
      };
    }

    // Strip HTML tags se for HTML
    let text = doc.rawContent;
    if (doc.mimeType.includes("html") || doc.mimeType.includes("xml")) {
      text = text.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    }

    const cleaned = text.replace(/\n{3,}/g, "\n\n").replace(/\s{3,}/g, "  ").trim();

    return {
      ok:            true,
      fileName:      doc.fileName,
      mimeType:      doc.mimeType,
      documentType:  "txt",
      extractedText: cleaned,
      charCount:     cleaned.length,
      parserUsed:    this.name,
      durationMs:    Date.now() - t0,
      meta:          {},
    };
  }
}