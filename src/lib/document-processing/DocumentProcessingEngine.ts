/**
 * DocumentProcessingEngine.ts — Sprint M1.4
 *
 * Ponto de entrada único para processamento de documentos.
 *
 * Responsabilidades:
 *   1. Receber RawDocument de qualquer connector.
 *   2. Detectar o tipo do documento (DocumentTypeDetector).
 *   3. Resolver o parser adequado (ParserRegistry).
 *   4. Executar o parser e retornar ProcessingResult.
 *
 * NÃO conhece: Google Drive, Gmail, HTTP, OAuth, LLM.
 * Reutilizável por qualquer connector atual ou futuro.
 */

import type { RawDocument, ProcessingResult } from "./DocumentProcessingTypes";
import { documentTypeDetector } from "./DocumentTypeDetector";
import { ParserRegistry }       from "./ParserRegistry";
import { PdfDocumentParser }    from "./parsers/PdfDocumentParser";
import { PlainTextParser }      from "./parsers/PlainTextParser";
import { UnsupportedDocumentParser } from "./parsers/UnsupportedDocumentParser";

// ── Bootstrap — registra parsers built-in uma vez ─────────────────────────────

let _bootstrapped = false;
function _ensureBootstrapped(): void {
  if (_bootstrapped) return;
  _bootstrapped = true;
  ParserRegistry.register(new PdfDocumentParser());
  ParserRegistry.register(new PlainTextParser());
  ParserRegistry.register(new UnsupportedDocumentParser());
}

// ── DocumentProcessingEngine ──────────────────────────────────────────────────

class DocumentProcessingEngineClass {

  /**
   * Processa um RawDocument e retorna texto estruturado.
   *
   * Fluxo:
   *   RawDocument → detect type → resolve parser → parse → ProcessingResult
   */
  async process(doc: RawDocument): Promise<ProcessingResult> {
    _ensureBootstrapped();
    const t0 = Date.now();

    // 1. Detectar tipo
    const documentType = documentTypeDetector.detect(doc.mimeType, doc.fileName);

    // 2. Resolver parser
    const parser = ParserRegistry.resolve(doc.mimeType, documentType) ?? new UnsupportedDocumentParser();

    // Injeta _detectedType para UnsupportedDocumentParser saber qual tipo foi detectado
    const enrichedDoc = { ...doc, _detectedType: documentType };

    console.log("[DPE] processing", {
      fileName:      doc.fileName,
      mimeType:      doc.mimeType,
      documentType,
      parserName:    parser.name,
      rawLength:     doc.rawContent.length,
      sourceConnector: doc.sourceConnector,
    });

    // 3. Executar parser
    const result = await parser.parse(enrichedDoc);

    console.log("[DPE] result", {
      ok:          result.ok,
      parserUsed:  result.parserUsed,
      charCount:   result.ok ? result.charCount : 0,
      errorCode:   result.ok ? null : result.errorCode,
      durationMs:  result.durationMs,
    });

    return result;
  }

  /** Verifica se um MIME type tem parser disponível (exceto UnsupportedDocumentParser). */
  isSupported(mimeType: string, fileName: string): boolean {
    _ensureBootstrapped();
    const documentType = documentTypeDetector.detect(mimeType, fileName);
    const parser = ParserRegistry.resolve(mimeType, documentType);
    return parser !== null && parser.name !== "UnsupportedDocumentParser";
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__DOCUMENT_PROCESSING_ENGINE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new DocumentProcessingEngineClass();
}

export const DocumentProcessingEngine: DocumentProcessingEngineClass = (
  globalThis as unknown as Record<string, DocumentProcessingEngineClass>
)[_KEY];