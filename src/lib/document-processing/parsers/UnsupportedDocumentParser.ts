/**
 * UnsupportedDocumentParser.ts — Sprint M1.4
 *
 * Parser de fallback para tipos ainda não suportados (DOCX, XLSX, PPTX, imagens).
 * Retorna UNSUPPORTED_TYPE com mensagem clara.
 * Arquitetura preparada para futuros parsers substituírem este.
 */

import type {
  DocumentParser,
  DocumentType,
  RawDocument,
  ProcessingResult,
} from "../DocumentProcessingTypes";

const ROADMAP_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  docx:    "DOCX (Word) — suporte planejado para Sprint M2.x.",
  xlsx:    "XLSX (Excel) — suporte planejado para Sprint M2.x.",
  pptx:    "PPTX (PowerPoint) — suporte planejado para Sprint M2.x.",
  image:   "Imagens — extração via OCR planejada para Sprint M2.x.",
  unknown: "Tipo de documento não reconhecido.",
});

export class UnsupportedDocumentParser implements DocumentParser {
  readonly name = "UnsupportedDocumentParser";
  readonly supportedMimeTypes = [] as const;
  readonly supportedTypes: readonly DocumentType[] = ["docx", "xlsx", "pptx", "image", "unknown"];

  async parse(doc: RawDocument): Promise<ProcessingResult> {
    const docType = (doc as any)._detectedType as DocumentType ?? "unknown";
    const msg = ROADMAP_MESSAGES[docType] ?? ROADMAP_MESSAGES["unknown"];

    return {
      ok:           false,
      fileName:     doc.fileName,
      mimeType:     doc.mimeType,
      documentType: docType,
      errorCode:    "UNSUPPORTED_TYPE",
      message:      `Tipo de documento ainda não suportado: ${msg} Arquivo: "${doc.fileName}".`,
      parserUsed:   this.name,
      durationMs:   0,
    };
  }
}