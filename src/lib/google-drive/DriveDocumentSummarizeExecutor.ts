/**
 * DriveDocumentSummarizeExecutor.ts — Sprint read-03
 *
 * Orquestra o fluxo completo de resumo de documento:
 *   1. Resolve fileId (explícito, busca, ou contexto)
 *   2. Download via GoogleDriveConnector (GWS Foundation)
 *   3. Parse via DocumentProcessingEngine
 *   4. Resumo via LLMSummarizer
 *   5. Retorna SummarizeResult estruturado
 *
 * v1.0: suporta PDF, DOCX, TXT.
 *       Futuro: cache de resumos, streaming, multi-idioma.
 *
 * Contrato:
 *   Input: SummarizeParameters (fileId?, fileName?, maxTokens?, style?)
 *   Output: SummarizeResult (success, summary, metadata, error)
 *
 * Padrão: espelha DriveDownloadExecutor em estrutura.
 */

import type { RawDocument, ProcessingResult } from "../document-processing/DocumentProcessingTypes";
import { DocumentProcessingEngine } from "../document-processing/DocumentProcessingEngine";
import { LLMSummarizer } from "../llm/LLMSummarizer";
import type { GoogleDriveConnector as GWSFoundation } from "../google-drive/GoogleDriveConnector";

// ── Input/Output types ────────────────────────────────────────────────────────

export interface SummarizeParameters {
  readonly fileId?: string;
  readonly fileName?: string;
  readonly query?: string;
  readonly maxTokens?: number;
  readonly style?: "bullet-points" | "paragraph" | "executive";
  readonly _debugExecutionId?: string;
}

export interface SummarizeSuccess {
  readonly ok: true;
  readonly summary: string;
  readonly fileId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly style: string;
  readonly tokens?: {
    readonly input: number;
    readonly output: number;
    readonly total: number;
  };
  readonly model: string;
  readonly durationMs: number;
  readonly message?: string;
}

export interface SummarizeFailure {
  readonly ok: false;
  readonly error: string;
  readonly code?: string;
  readonly durationMs: number;
  readonly message?: string;
}

export type SummarizeResult = SummarizeSuccess | SummarizeFailure;

// ── Executor ──────────────────────────────────────────────────────────────────

/**
 * Executa o fluxo completo de resumo.
 * Função pura (sem dependências de contexto de runtime).
 */
export async function executeDriveDocumentSummarize(
  parameters: SummarizeParameters,
  _token: string, // compat with old signature; unused in v1.0
  options?: { timeout?: number },
): Promise<SummarizeResult> {
  const t0 = Date.now();
  const timeout = options?.timeout ?? 30000;

  // ── STEP 1: Validação ────────────────────────────────────────────────────

  const fileId = parameters.fileId;
  const fileName = parameters.fileName;
  const maxTokens = parameters.maxTokens ?? 500;
  const style = parameters.style ?? "bullet-points";

  if (!fileId && !fileName) {
    return {
      ok: false,
      error: 'Must provide either "fileId" or "fileName"',
      code: "MISSING_PARAMS",
      durationMs: Date.now() - t0,
    };
  }

  // ── STEP 2: Import GWS Foundation (lazy load) ────────────────────────────

  let gws: GWSFoundation;
  try {
    const mod = await import("../google-drive/GoogleDriveConnector");
    gws = mod.GoogleDriveConnector;
  } catch (e) {
    return {
      ok: false,
      error: `Failed to load GWS Foundation: ${(e as Error).message}`,
      code: "LOAD_ERROR",
      durationMs: Date.now() - t0,
    };
  }

  // ── STEP 3: Resolve fileId ──────────────────────────────────────────────

  let resolvedFileId: string | null = fileId ?? null;

  if (!resolvedFileId && fileName) {
    try {
      const metadata = await gws.readFileMetadata(fileName);
      if (metadata && metadata.id) {
        resolvedFileId = metadata.id;
      }
    } catch {
      // Fallback: trata como search term
      // (futuro: usar Drive search API)
    }
  }

  if (!resolvedFileId) {
    return {
      ok: false,
      error: `Could not resolve fileId from fileName: "${fileName}"`,
      code: "FILE_NOT_FOUND",
      durationMs: Date.now() - t0,
    };
  }

  // ── STEP 4: Download file ───────────────────────────────────────────────

  let rawDocument: RawDocument;
  try {
    const downloadResult = await Promise.race([
      (async () => {
        const content = await gws.downloadMedia(resolvedFileId);
        return {
          fileId: resolvedFileId,
          fileName: fileName ?? "downloaded-file",
          mimeType: content.contentType ?? "application/octet-stream",
          encoding: content.encoding,
          content: content.content,
          sizeBytes: content.sizeBytes,
        };
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Download timeout")), timeout),
      ),
    ]);

    rawDocument = {
      fileId: downloadResult.fileId,
      fileName: downloadResult.fileName,
      mimeType: downloadResult.mimeType,
      encoding: downloadResult.encoding,
      content: downloadResult.content,
      sizeBytes: downloadResult.sizeBytes,
    };
  } catch (e) {
    const msg = (e as Error).message;
    return {
      ok: false,
      error: `Download failed: ${msg}`,
      code: msg.includes("timeout") ? "DOWNLOAD_TIMEOUT" : "DOWNLOAD_ERROR",
      durationMs: Date.now() - t0,
    };
  }

  // ── STEP 5: Parse document ──────────────────────────────────────────────

  let processingResult: ProcessingResult;
  try {
    processingResult = await DocumentProcessingEngine.process(rawDocument);

    if (!processingResult.success) {
      return {
        ok: false,
        error: `Parsing failed: ${processingResult.error ?? "Unknown error"}`,
        code: "PARSING_ERROR",
        durationMs: Date.now() - t0,
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: `Parsing exception: ${(e as Error).message}`,
      code: "PARSING_EXCEPTION",
      durationMs: Date.now() - t0,
    };
  }

  // ── STEP 6: Summarize via LLM ───────────────────────────────────────────

  let llmResult;
  try {
    const text = processingResult.text ?? "";
    if (text.length === 0) {
      return {
        ok: false,
        error: "Document has no extractable text",
        code: "EMPTY_TEXT",
        durationMs: Date.now() - t0,
      };
    }

    llmResult = await LLMSummarizer.summarize({
      text,
      maxTokens,
      style,
      language: "pt-BR",
    });

    if (!llmResult.success) {
      return {
        ok: false,
        error: `LLM summarization failed: ${llmResult.error ?? "Unknown error"}`,
        code: "SUMMARIZATION_ERROR",
        durationMs: Date.now() - t0,
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: `LLM exception: ${(e as Error).message}`,
      code: "LLM_EXCEPTION",
      durationMs: Date.now() - t0,
    };
  }

  // ── STEP 7: Success ──────────────────────────────────────────────────────

  return {
    ok: true,
    summary: llmResult.summary ?? "No summary generated",
    fileId: resolvedFileId,
    fileName: rawDocument.fileName,
    mimeType: rawDocument.mimeType,
    style,
    tokens: llmResult.tokens,
    model: llmResult.model ?? "unknown",
    durationMs: Date.now() - t0,
    message: `Document summarized successfully in ${Date.now() - t0}ms`,
  };
}
