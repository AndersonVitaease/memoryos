/**
 * XlsxDocumentParser.ts — Sprint M2.x
 *
 * Parser para planilhas Excel (.xlsx). Mesmo padrao do DocxDocumentParser
 * — delega a extracao pesada pra function de backend (documentParser).
 */
import type { DocumentParser, RawDocument, ProcessingResult } from "../DocumentProcessingTypes";
import { base44 } from "@/api/base44Client";

function binaryStringToBase64(binaryStr: string): string {
  let result = "";
  const chunkSize = 8192;
  for (let i = 0; i < binaryStr.length; i += chunkSize) {
    result += String.fromCharCode(...Array.from(binaryStr.slice(i, i + chunkSize), (c) => c.charCodeAt(0)));
  }
  return btoa(result);
}

export class XlsxDocumentParser implements DocumentParser {
  readonly name = "XlsxDocumentParser";
  readonly supportedMimeTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ] as const;
  readonly supportedTypes = ["xlsx"] as const;

  async parse(doc: RawDocument): Promise<ProcessingResult> {
    const t0 = Date.now();

    if (!doc.rawContent || doc.rawContent.trim().length === 0) {
      return {
        ok: false, fileName: doc.fileName, mimeType: doc.mimeType, documentType: "xlsx",
        errorCode: "EMPTY_CONTENT", message: `Conteúdo vazio para o arquivo "${doc.fileName}".`,
        parserUsed: this.name, durationMs: Date.now() - t0,
      };
    }

    try {
      const base64Content = doc.encoding === "base64" ? doc.rawContent : binaryStringToBase64(doc.rawContent);

      const res = await base44.functions.invoke("documentParser", {
        documentType: "xlsx",
        base64Content,
        fileName: doc.fileName,
      });
      const d = (res as any)?.data ?? res;

      if (d?.error) {
        return {
          ok: false, fileName: doc.fileName, mimeType: doc.mimeType, documentType: "xlsx",
          errorCode: "PARSE_FAILED", message: `Falha ao extrair "${doc.fileName}": ${d.error}`,
          parserUsed: this.name, durationMs: Date.now() - t0,
        };
      }

      const text = d?.text ?? "";
      if (text.trim().length === 0) {
        return {
          ok: false, fileName: doc.fileName, mimeType: doc.mimeType, documentType: "xlsx",
          errorCode: "EMPTY_CONTENT", message: `"${doc.fileName}" não contém dados extraíveis.`,
          parserUsed: this.name, durationMs: Date.now() - t0,
        };
      }

      return {
        ok: true, fileName: doc.fileName, mimeType: doc.mimeType, documentType: "xlsx",
        extractedText: text, charCount: text.length,
        parserUsed: this.name, durationMs: Date.now() - t0,
        meta: d?.meta ?? {},
      };
    } catch (err) {
      return {
        ok: false, fileName: doc.fileName, mimeType: doc.mimeType, documentType: "xlsx",
        errorCode: "PARSE_FAILED",
        message: `Erro inesperado ao processar "${doc.fileName}": ${err instanceof Error ? err.message : String(err)}`,
        parserUsed: this.name, durationMs: Date.now() - t0,
      };
    }
  }
}
