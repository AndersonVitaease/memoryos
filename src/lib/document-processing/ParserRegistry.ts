/**
 * ParserRegistry.ts — Sprint M1.4
 *
 * SRP: registrar e resolver DocumentParsers por MIME type e DocumentType.
 * Open/Closed: novos parsers registram-se sem alterar este arquivo.
 * Sem dependências de rede ou connectors.
 */

import type { DocumentParser, DocumentType } from "./DocumentProcessingTypes";

class ParserRegistryClass {
  private readonly _parsers: DocumentParser[] = [];

  /** Registra um parser. Idempotente por name. */
  register(parser: DocumentParser): void {
    if (this._parsers.some(p => p.name === parser.name)) return;
    this._parsers.push(parser);
  }

  /**
   * Resolve o parser mais adequado para mimeType + documentType.
   * Prioridade: MIME type exact match > documentType match.
   * Retorna null se nenhum parser suportar.
   */
  resolve(mimeType: string, documentType: DocumentType): DocumentParser | null {
    const mime = mimeType.toLowerCase().trim();

    // 1. Exact MIME match
    for (const p of this._parsers) {
      if (p.supportedMimeTypes.includes(mime)) return p;
    }

    // 2. DocumentType match
    for (const p of this._parsers) {
      if (p.supportedTypes.includes(documentType)) return p;
    }

    return null;
  }

  listAll(): readonly DocumentParser[] {
    return [...this._parsers];
  }

  get size(): number {
    return this._parsers.length;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__PARSER_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ParserRegistryClass();
}

export const ParserRegistry: ParserRegistryClass = (
  globalThis as unknown as Record<string, ParserRegistryClass>
)[_KEY];