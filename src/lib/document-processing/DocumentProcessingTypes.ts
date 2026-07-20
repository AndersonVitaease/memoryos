/**
 * DocumentProcessingTypes.ts — Sprint M1.4
 *
 * Contratos públicos do Document Processing Engine.
 * Sem dependências de connectors, HTTP ou LLM.
 */

// ── Tipos de documento suportados ─────────────────────────────────────────────

export type DocumentType =
  | "pdf"
  | "docx"
  | "xlsx"
  | "pptx"
  | "txt"
  | "csv"
  | "markdown"
  | "html"
  | "image"
  | "unknown";

// ── Entrada do Engine ─────────────────────────────────────────────────────────

export interface RawDocument {
  /** Nome original do arquivo (ex: "NAC + GLICINA.pdf") */
  fileName:    string;
  /** MIME type declarado pelo connector (ex: "application/pdf") */
  mimeType:    string;
  /** Conteúdo bruto — string UTF-8 de res.text() ou Base64 real */
  rawContent:  string;
  /** Como o conteúdo está codificado */
  encoding:    "text" | "base64";
  /** Origem para observabilidade */
  sourceConnector: string;
}

// ── Resultado de sucesso ──────────────────────────────────────────────────────

export interface DocumentProcessingResult {
  ok:            true;
  fileName:      string;
  mimeType:      string;
  documentType:  DocumentType;
  /** Texto legível extraído do documento */
  extractedText: string;
  charCount:     number;
  parserUsed:    string;
  durationMs:    number;
  /** Metadados opcionais do parser (ex: nPages para PDF) */
  meta:          Record<string, unknown>;
}

// ── Resultado de falha ────────────────────────────────────────────────────────

export interface DocumentProcessingError {
  ok:           false;
  fileName:     string;
  mimeType:     string;
  documentType: DocumentType;
  errorCode:    DocumentErrorCode;
  message:      string;
  parserUsed:   string | null;
  durationMs:   number;
}

export type DocumentErrorCode =
  | "UNSUPPORTED_TYPE"
  | "PARSE_FAILED"
  | "EMPTY_CONTENT"
  | "OCR_REQUIRED"      // PDF sem camada de texto — OCR necessário (não implementado)
  | "UNKNOWN";

export type ProcessingResult = DocumentProcessingResult | DocumentProcessingError;

// ── Interface do Parser ───────────────────────────────────────────────────────

export interface DocumentParser {
  /** Nome único do parser (ex: "PdfDocumentParser") */
  readonly name: string;
  /** MIME types que este parser suporta */
  readonly supportedMimeTypes: readonly string[];
  /** DocumentTypes que este parser suporta */
  readonly supportedTypes: readonly DocumentType[];
  /** Processa o documento e retorna texto extraído */
  parse(doc: RawDocument): Promise<ProcessingResult>;
}