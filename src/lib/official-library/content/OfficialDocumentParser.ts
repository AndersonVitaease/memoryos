/**
 * OfficialDocumentParser.ts — Sprint EF-42.5
 *
 * SRP: receive raw document content, extract and clean it.
 * Never indexes, never chunks, never retrieves.
 */

export interface ParsedDocument {
  readonly documentId: string;
  readonly title:      string;
  readonly rawContent: string;
  readonly lines:      readonly string[];
  readonly wordCount:  number;
  readonly parsedAt:   string;
}

export interface RawDocumentInput {
  readonly documentId: string;
  readonly title:      string;
  readonly content:    string;
}

class OfficialDocumentParserImpl {

  parse(raw: RawDocumentInput): ParsedDocument {
    const cleaned = this._clean(raw.content);
    const lines   = cleaned.split("\n").map(l => l.trimEnd());
    const words   = cleaned.split(/\s+/).filter(w => w.length > 0);

    return Object.freeze({
      documentId: raw.documentId,
      title:      raw.title,
      rawContent: cleaned,
      lines:      Object.freeze(lines),
      wordCount:  words.length,
      parsedAt:   new Date().toISOString(),
    });
  }

  private _clean(content: string): string {
    return content
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\t/g, "  ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}

const G = globalThis as typeof globalThis & { __OL_DOC_PARSER__?: OfficialDocumentParserImpl };
if (!G.__OL_DOC_PARSER__) G.__OL_DOC_PARSER__ = new OfficialDocumentParserImpl();
export const OfficialDocumentParser: OfficialDocumentParserImpl = G.__OL_DOC_PARSER__;