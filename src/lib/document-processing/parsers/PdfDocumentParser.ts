/**
 * PdfDocumentParser.ts — Sprint M1.4
 *
 * Parser para PDFs textuais.
 *
 * Estratégia:
 *   1. Se o rawContent contém "%PDF-" → é um PDF binário lido como string UTF-8
 *      (via res.text() do GoogleDriveConnector).
 *      Extrai texto usando regex sobre a estrutura interna do PDF.
 *   2. Se o encoding é "text" e o content parece texto legível → retorna diretamente.
 *   3. Se não consegue extrair texto → retorna DocumentErrorCode "OCR_REQUIRED"
 *      (sinaliza que o PDF não tem camada de texto — OCR necessário no futuro).
 *
 * NÃO importa GoogleDriveConnector.
 * NÃO faz fetch().
 * NÃO conhece OAuth.
 * Recebe apenas RawDocument e retorna ProcessingResult.
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
        // Sem camada de texto — PDF escaneado ou protegido
        return {
          ok:           false,
          fileName:     doc.fileName,
          mimeType:     doc.mimeType,
          documentType: "pdf",
          errorCode:    "OCR_REQUIRED",
          message:      `O arquivo "${doc.fileName}" parece ser um PDF escaneado (sem camada de texto). OCR será suportado em Sprint futura.`,
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

  // ── Extração de texto de PDF binário lido como string UTF-8 ──────────────────
  // Técnica: PDFs textuais contêm streams de texto em operadores BT/ET.
  // Os textos ficam entre parênteses: (texto aqui) Tj / TJ
  // Também extrai strings em formato hexadecimal: <4865782068657265> Tj

  private _extractTextFromPdfString(raw: string): string {
    const parts: string[] = [];

    // 1. Extrair texto de operadores Tj/TJ (formato string entre parênteses)
    const btEtRegex = /BT[\s\S]*?ET/g;
    let block: RegExpExecArray | null;
    while ((block = btEtRegex.exec(raw)) !== null) {
      const content = block[0];

      // (texto) Tj ou [(texto)] TJ
      const parenRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*(?:Tj|TJ)/g;
      let m: RegExpExecArray | null;
      while ((m = parenRegex.exec(content)) !== null) {
        const decoded = this._decodePdfString(m[1]);
        if (decoded.trim()) parts.push(decoded);
      }

      // <hex> Tj
      const hexRegex = /<([0-9a-fA-F]+)>\s*(?:Tj|TJ)/g;
      while ((m = hexRegex.exec(content)) !== null) {
        const decoded = this._hexToString(m[1]);
        if (decoded.trim()) parts.push(decoded);
      }
    }

    // 2. Fallback: extrair qualquer string entre parênteses fora de BT/ET
    if (parts.length === 0) {
      const fallbackRegex = /\(([^\n\r()]{3,200})\)/g;
      let m: RegExpExecArray | null;
      while ((m = fallbackRegex.exec(raw)) !== null) {
        const s = this._decodePdfString(m[1]);
        if (this._isReadableText(s)) parts.push(s);
      }
    }

    return this._cleanText(parts.join(" "));
  }

  private _decodePdfString(s: string): string {
    return s
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\")
      .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
  }

  private _hexToString(hex: string): string {
    let result = "";
    for (let i = 0; i < hex.length - 1; i += 2) {
      const code = parseInt(hex.slice(i, i + 2), 16);
      if (code > 31 && code < 127) result += String.fromCharCode(code);
    }
    return result;
  }

  private _isReadableText(s: string): boolean {
    if (s.length < 3) return false;
    const printable = s.split("").filter(c => c.charCodeAt(0) > 31 && c.charCodeAt(0) < 127).length;
    return printable / s.length > 0.7;
  }

  private _cleanText(text: string): string {
    return text
      .replace(/\s{3,}/g, "  ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}