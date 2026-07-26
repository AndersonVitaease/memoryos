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

  // ── IA-027: OCR via IA (fallback quando não há camada de texto) ─────────────
  // doc.rawContent, quando vem de um PDF binário, é uma "string binária"
  // (1 caractere por byte — ver GoogleDriveConnector.downloadMedia()), não
  // texto legível nem base64 verdadeiro. Reconstruímos os bytes reais antes
  // de montar o arquivo para upload.
  private async _tryAiOcr(doc: RawDocument): Promise<string | null> {
    try {
      const { base44 } = await import("@/api/base44Client");

      const bytes = Uint8Array.from(doc.rawContent, (c) => c.charCodeAt(0) & 0xff);

      // IA-036: se os bytes forem pequenos demais pra ser um documento
      // digitalizado de verdade (ex: download falhou parcialmente e sobrou
      // só um fragmento), não manda pra IA "adivinhar" — isso é exatamente
      // o cenário onde a IA tende a inventar um documento plausível em vez
      // de admitir que não recebeu nada de útil. Provamos hoje, com CPF e
      // PIS mudando a cada tentativa, que isso acontece de verdade.
      if (bytes.byteLength < 5000) {
        return null;
      }

      const blob  = new Blob([bytes], { type: doc.mimeType || "application/pdf" });
      const file  = new File([blob], doc.fileName || "documento.pdf", { type: blob.type });

      const uploadResult = await base44.integrations.Core.UploadFile({ file });
      if (!uploadResult?.file_url) return null;

      const ocrResponse = await base44.integrations.Core.InvokeLLM({
        prompt:
          "Analise esta imagem/documento e extraia o texto visível (OCR). Seja preciso, mas " +
          "lembre-se que erros pontuais de leitura (ex: confundir um dígito de um número) são " +
          "normais e aceitáveis — o importante é NUNCA inventar um documento inteiro do zero " +
          "quando a imagem não carregou ou está genuinamente ilegível. Se um campo específico " +
          "estiver difícil de ler com certeza (ex: um dígito borrado), marque esse campo com " +
          "[incerto] em vez de simplesmente inventar um valor plausível ou omitir o campo. " +
          "Se a imagem inteira não carregou ou está completamente ilegível, responda apenas VAZIO.",
        file_urls: [uploadResult.file_url],
      });

      const text = typeof ocrResponse === "string"
        ? ocrResponse
        : (ocrResponse as { text?: string })?.text ?? "";

      const trimmed = text.trim();
      if (!trimmed || trimmed.toUpperCase() === "VAZIO" || trimmed.length < 10) return null;

      // IA-036: como uma única chamada de IA não pode ser verificada com
      // certeza absoluta, todo resultado de OCR carrega um aviso explícito
      // — transparência é a proteção que resta quando não dá pra garantir
      // 100% que não houve invenção.
      return `${trimmed}\n\n⚠️ *Texto extraído automaticamente por IA (OCR) — pode conter erros de leitura. Confira os dados originais antes de usar para qualquer finalidade oficial.*`;
    } catch {
      // OCR é best-effort — qualquer falha (rede, upload, IA indisponível)
      // apenas faz o parser cair no OCR_REQUIRED normal, sem quebrar o fluxo.
      return null;
    }
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
