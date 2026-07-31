/**
 * DocxDocumentParser.ts — Sprint M2.x
 *
 * Parser para documentos Word (.docx). Preenche o gap ja documentado em
 * UnsupportedDocumentParser.ts ("DOCX — suporte planejado pra Sprint M2.x").
 *
 * Delega a extracao pesada (parsing de ZIP/XML interno do .docx, via
 * mammoth) pra uma function de backend (documentParser) — mesmo padrao
 * ja usado hoje pra Serper, OpenRouter e o cliente MCP: trabalho pesado
 * no servidor, essa classe so traduz o contrato RawDocument <-> chamada
 * de backend.
 *
 * NAO importa GoogleDriveConnector. Recebe apenas RawDocument.
 */
import type { DocumentParser, RawDocument, ProcessingResult } from "../DocumentProcessingTypes";
import { base44 } from "@/api/base44Client";

/** Converte uma string binaria (bytes 0-255 por char, ex: de res.text() em
 * conteudo binario) pra base64 — mesma logica conceitual do isBinaryPdf do
 * PdfDocumentParser, so que gerando base64 em vez de tentar regex. */
function binaryStringToBase64(binaryStr: string): string {
  let result = "";
  const chunkSize = 8192;
  for (let i = 0; i < binaryStr.length; i += chunkSize) {
    result += String.fromCharCode(...Array.from(binaryStr.slice(i, i + chunkSize), (c) => c.charCodeAt(0)));
  }
  return btoa(result);
}

export class DocxDocumentParser implements DocumentParser {
  readonly name = "DocxDocumentParser";
  readonly supportedMimeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ] as const;
  readonly supportedTypes = ["docx"] as const;

  async parse(doc: RawDocument): Promise<ProcessingResult> {
    const t0 = Date.now();

    if (!doc.rawContent || doc.rawContent.trim().length === 0) {
      return {
        ok: false, fileName: doc.fileName, mimeType: doc.mimeType, documentType: "docx",
        errorCode: "EMPTY_CONTENT", message: `Conteúdo vazio para o arquivo "${doc.fileName}".`,
        parserUsed: this.name, durationMs: Date.now() - t0,
      };
    }

    try {
      const base64Content = doc.encoding === "base64" ? doc.rawContent : binaryStringToBase64(doc.rawContent);

      const res = await base44.functions.invoke("documentParser", {
        documentType: "docx",
        base64Content,
        fileName: doc.fileName,
      });
      const d = (res as any)?.data ?? res;

      if (d?.error) {
        return {
          ok: false, fileName: doc.fileName, mimeType: doc.mimeType, documentType: "docx",
          errorCode: "PARSE_FAILED", message: `Falha ao extrair "${doc.fileName}": ${d.error}`,
          parserUsed: this.name, durationMs: Date.now() - t0,
        };
      }

      const text = d?.text ?? "";
      if (text.trim().length === 0) {
        return {
          ok: false, fileName: doc.fileName, mimeType: doc.mimeType, documentType: "docx",
          errorCode: "EMPTY_CONTENT", message: `"${doc.fileName}" não contém texto extraível.`,
          parserUsed: this.name, durationMs: Date.now() - t0,
        };
      }

      return {
        ok: true, fileName: doc.fileName, mimeType: doc.mimeType, documentType: "docx",
        extractedText: text, charCount: text.length,
        parserUsed: this.name, durationMs: Date.now() - t0,
        meta: d?.meta ?? {},
      };
    } catch (err) {
      return {
        ok: false, fileName: doc.fileName, mimeType: doc.mimeType, documentType: "docx",
        errorCode: "PARSE_FAILED",
        message: `Erro inesperado ao processar "${doc.fileName}": ${err instanceof Error ? err.message : String(err)}`,
        parserUsed: this.name, durationMs: Date.now() - t0,
      };
    }
  }
}
