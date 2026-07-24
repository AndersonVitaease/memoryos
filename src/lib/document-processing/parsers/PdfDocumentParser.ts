/**
 * PdfDocumentParser.ts — Sprint M1.4 (+ IA-027)
 *
 * Parser para PDFs textuais.
 *
 * Estratégia:
 *   1. Se o rawContent contém "%PDF-" → é um PDF binário lido como string UTF-8
 *      (via res.text() do GoogleDriveConnector).
 *      Extrai texto usando regex sobre a estrutura interna do PDF.
 *   2. Se o encoding é "text" e o content parece texto legível → retorna diretamente.
 *   3. IA-027: se não consegue extrair texto (PDF escaneado/sem camada de texto),
 *      tenta OCR via IA antes de desistir — sobe o arquivo pro Base44 e usa
 *      InvokeLLM com file_urls (mesmo padrão já usado para imagens anexadas
 *      em knowledgeIngestionPipeline.js). Se o OCR também falhar, retorna
 *      DocumentErrorCode "OCR_REQUIRED".
 *
 * NÃO importa GoogleDriveConnector.
 * NÃO conhece OAuth do Drive.
 * Recebe apenas RawDocument e retorna ProcessingResult.
 * IA-027: chama base44.integrations.Core (UploadFile/InvokeLLM) como fallback —
 * é um serviço genérico de IA, não específico de nenhum connector.
 */

import type {
  DocumentParser,
  RawDocument,
  ProcessingResult,
} from "../DocumentProcessingTypes";

export class PdfDocumentParser implements DocumentParser {
  readonly name = "PdfDocumentParser";
  readonly supportedMimeTypes = ["application/pdf"] as const;
  readonly supportedTypes     = ["pdf"] as const;

  async parse(doc: RawDocument): Promise<ProcessingResult> {
    const t0 = Date.now();

    if (!doc.rawContent || doc.rawContent.trim().length === 0) {
      return {
        ok:           false,
        fileName:     doc.fileName,
        mimeType:     doc.mimeType,
        documentType: "pdf",
        errorCode:    "EMPTY_CONTENT",
        message:      `Conteúdo vazio para o arquivo "${doc.fileName}".`,
        parserUsed:   this.name,
        durationMs:   Date.now() - t0,
      };
    }

    // ── Detecção de PDF binário lido como string UTF-8 ────────────────────────
    // GoogleDriveConnector.downloadMedia() usa res.text() para PDFs binários.
    // O resultado começa com "%PDF-" (bytes 0x25 0x50 0x44 0x46 0x2D).
    const isBinaryPdf = doc.rawContent.includes("%PDF-");

    if (isBinaryPdf) {
      const extracted = this._extractTextFromPdfString(doc.rawContent);

      if (extracted.length < 20) {
        // IA-027: sem camada de texto — antes de desistir, tenta OCR via IA.
        const ocrText = await this._tryAiOcr(doc);
        if (ocrText) {
          return {
            ok:            true,
            fileName:      doc.fileName,
            mimeType:      doc.mimeType,
            documentType:  "pdf",
            extractedText: ocrText,
            charCount:     ocrText.length,
            parserUsed:    this.name,
            durationMs:    Date.now() - t0,
            meta:          { method: "ai-ocr-fallback" },
          };
        }

        // OCR também não conseguiu (arquivo protegido, corrompido, ou IA indisponível)
        return {
          ok:           false,
          fileName:     doc.fileName,
          mimeType:     doc.mimeType,
          documentType: "pdf",
          errorCode:    "OCR_REQUIRED",
          message:      `Não foi possível extrair o conteúdo de "${doc.fileName}", mesmo com OCR. O arquivo pode estar protegido ou corrompido.`,
          parserUsed:   this.name,
          durationMs:   Date.now() - t0,
        };
      }

      return {
        ok:            true,
        fileName:      doc.fileName,
        mimeType:      doc.mimeType,
        documentType:  "pdf",
        extractedText: extracted,
        charCount:     extracted.length,
        parserUsed:    this.name,
        durationMs:    Date.now() - t0,
        meta:          { method: "pdf-binary-string-extraction", rawContentLength: doc.rawContent.length },
      };
    }

    // ── Conteúdo já é texto legível (ex: PDF exportado como text/plain) ────────
    const cleaned = this._cleanText(doc.rawContent);
    if (cleaned.length > 0) {
      return {
        ok:            true,
        fileName:      doc.fileName,
        mimeType:      doc.mimeType,
        documentType:  "pdf",
        extractedText: cleaned,
        charCount:     cleaned.length,
        parserUsed:    this.name,
        durationMs:    Date.now() - t0,
        meta:          { method: "plain-text-passthrough" },
      };
    }

    return {
      ok:           false,
      fileName:     doc.fileName,
      mimeType:     doc.mimeType,
      documentType: "pdf",
      errorCode:    "PARSE_FAILED",
      message:      `Não foi possível extrair texto de "${doc.fileName}".`,
      parserUsed:   this.name,
      durationMs:   Date.now() - t0,
    };
  }
