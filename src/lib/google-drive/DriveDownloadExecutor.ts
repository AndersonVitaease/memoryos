/**
 * DriveDownloadExecutor.ts — Sprint EF-6.3.2 (Architecture Refinement)
 *
 * RESPONSABILIDADE ÚNICA: orquestrar o download de um arquivo do Drive.
 *
 * ALTERAÇÃO 1/3 (EF-6.3.2):
 *   Este módulo NÃO executa:
 *     - fetch()
 *     - requests HTTP
 *     - URLs da API
 *     - headers / tokens / OAuth
 *     - timeouts / retry
 *
 *   Toda comunicação HTTP fica em GoogleDriveConnector.ts.
 *   Este executor APENAS orquestra:
 *
 *     1. Resolver fileId      → connector.searchByName()   → rankCandidates()
 *     2. Obter metadata       → connector.getFileMetadata()
 *     3. Determinar strategy  → resolveExportConfig()  [ExportPolicy]
 *     4. Executar download    → connector.exportFile() | connector.downloadMedia()
 *     5. Retornar resultado   → DownloadResult
 *
 * ALTERAÇÃO 5 (EF-6.3.2): RankingPolicy configurável (sem magic numbers).
 * ALTERAÇÃO 6 (EF-6.3.2): ExportPolicy configurável (respeita outputFormat).
 *
 * NÃO altera: Semantic Providers · Planner · GoalRegistry
 *             GoalCapabilityRegistry · ConversationPlanningEngine
 */

import {
  rankCandidates,
  resolveExportConfig,
  isGoogleWorkspaceMime,
  DEFAULT_RANKING_POLICY,
  DEFAULT_EXPORT_POLICY,
} from "./DriveDownloadPolicies";
import { RuntimeDebug }             from "@/lib/debug/RuntimeDebug";
import { DocumentProcessingEngine } from "@/lib/document-processing/DocumentProcessingEngine";
import type { RankingPolicy, ExportPolicy, RankCandidate } from "./DriveDownloadPolicies";
import { httpStatusToErrorCode } from "./DriveConnectorContract";
import type { ConnectorAudit } from "./DriveConnectorContract";

// ── Public result types ───────────────────────────────────────────────────────

export type DownloadErrorCode =
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "NO_PERMISSION"
  | "API_UNAVAILABLE"
  | "TIMEOUT"
  | "QUOTA_EXCEEDED"
  | "NO_PARAMS"
  | "NOT_CONFIGURED"
  | "UNKNOWN";

export interface DownloadSuccess {
  ok:          true;
  fileId:      string;
  fileName:    string;
  mimeType:    string;
  exportMime:  string;
  strategy:    "export" | "media";
  content:     string;
  encoding:    "text" | "base64";
  sizeBytes:   number;
  apiUsed:     "files.get" | "files.export";
  resolvedBy:  "fileId" | "search";
  candidates?: RankCandidate[];
  durationMs:  number;
  audit:       ConnectorAudit;
}

export interface DownloadFailure {
  ok:          false;
  code:        DownloadErrorCode;
  message:     string;
  fileId:      string | null;
  fileName:    string | null;
  candidates?: RankCandidate[];
  durationMs:  number;
  audit:       ConnectorAudit;
}

export type DownloadResult = DownloadSuccess | DownloadFailure;

// ── Execution options ─────────────────────────────────────────────────────────

export interface DownloadOptions {
  rankingPolicy?: RankingPolicy;
  exportPolicy?:  ExportPolicy;
}

// ── Audit builder ─────────────────────────────────────────────────────────────

let _seq = 1;
function makeAudit(
  result: "success" | "failure",
  startedAt: string,
  durationMs: number,
  errorCode: string | null,
): ConnectorAudit {
  return Object.freeze({
    connectorId: "google-drive",
    capability:  "drive.downloadFile",
    traceId:     `dl-${Date.now()}-${(_seq++).toString().padStart(4, "0")}`,
    startedAt,
    durationMs,
    result,
    errorCode,
  });
}

// ── Main executor ─────────────────────────────────────────────────────────────
// ZERO HTTP HERE. All network calls delegated to GoogleDriveConnector.

export async function executeDriveDownload(
  parameters: Record<string, unknown>,
  _token: string,  // kept for interface compatibility — connector manages auth internally
  options: DownloadOptions = {},
): Promise<DownloadResult> {
  const t0        = Date.now();
  const startedAt = new Date().toISOString();

  const rankPolicy   = options.rankingPolicy ?? DEFAULT_RANKING_POLICY;
  const exportPolicy = options.exportPolicy  ?? DEFAULT_EXPORT_POLICY;

  const explicitFileId = typeof parameters.fileId      === "string" ? parameters.fileId.trim()      : null;
  const fileName       = typeof parameters.fileName    === "string" ? parameters.fileName.trim()    : null;
  const outputFormat   = typeof parameters.outputFormat === "string" ? parameters.outputFormat.trim() : null;
  const queryFallback  = typeof parameters.query       === "string" ? parameters.query.trim()       : null;
  const rawText        = typeof parameters.rawText     === "string" ? parameters.rawText.trim()     : null;

  // executionId is propagated from ConversationRuntimeEngine via parameters._debugExecutionId.
  // It is NEVER generated here. If missing, it means the Runtime did not inject it —
  // events will be dropped by RuntimeDebug with a CORRELATION LOSS warning.
  const _execId = typeof parameters._debugExecutionId === "string"
    ? parameters._debugExecutionId
    : ""; // intentionally empty — correlation loss will be signalled by RuntimeDebug

  RuntimeDebug.emit({
    executionId: _execId,
    connector:   "google-drive",
    source:      "DriveDownloadExecutor",
    event:       "received parameters",
    payload: {
      "parameters.fileId":       parameters.fileId       ?? null,
      "parameters.fileName":     parameters.fileName     ?? null,
      "parameters.filePath":     parameters.filePath     ?? null,
      "parameters.query":        parameters.query        ?? null,
      "parameters.outputFormat": parameters.outputFormat ?? null,
      "parameters.rawText":      parameters.rawText      ?? null,
      allParameterKeys: Object.keys(parameters),
    },
  });

  function fail(code: DownloadErrorCode, message: string, fileId: string | null, extra: Partial<DownloadFailure> = {}): DownloadFailure {
    const dur = Date.now() - t0;
    return { ok: false, code, message, fileId, fileName, durationMs: dur, audit: makeAudit("failure", startedAt, dur, code), ...extra };
  }

  // ── Import connector (lazy — no circular dep at module level) ─────────────
  const connector = await import("./GoogleDriveConnector");

  // ── Step 1: Resolve fileId ────────────────────────────────────────────────

  let resolvedFileId: string;
  let resolvedBy: "fileId" | "search" = "fileId";
  let resolvedCandidates: RankCandidate[] | undefined;

  RuntimeDebug.emit({
    executionId: _execId,
    connector:   "google-drive",
    source:      "DriveDownloadExecutor",
    event:       "strategy selection",
    payload: {
      hasExplicitFileId: !!explicitFileId,
      hasFileName:       !!fileName,
      hasQueryFallback:  !!queryFallback,
      hasRawText:        !!rawText,
      explicitFileId,
      fileName,
      queryFallback,
      rawText,
      strategy: explicitFileId
        ? "explicit fileId"
        : !fileName && !queryFallback && !rawText
          ? "conversation context"
          : "search by name",
    },
  });

  if (explicitFileId) {
    RuntimeDebug.emit({ executionId: _execId, connector: "google-drive", source: "DriveDownloadExecutor", event: "using strategy: explicit fileId", payload: { explicitFileId } });
    resolvedFileId = explicitFileId;
  } else if (!fileName && !queryFallback && !rawText) {
    // No explicit identifier — attempt recovery from session-scoped ConversationStore.
    // Uses the generic connector context API: no Drive-specific types in the store.
    // Covers "Esse mesmo" / "faz o download" / "o terceiro" cross-turn references.
    try {
      const { conversationStore } = await import("@/lib/conversation-platform/ConversationStore");
      const { readDriveContext }  = await import("@/lib/connector-context/providers/GoogleDriveContextBuilder");
      const raw      = conversationStore.getConnectorContext("google-drive");
      const driveCtx = readDriveContext(raw);
      RuntimeDebug.emit({
        executionId: _execId,
        connector:   "google-drive",
        source:      "DriveDownloadExecutor",
        event:       "using strategy: conversation context",
        payload: {
          rawContextFound:  raw !== null,
          driveCtxFound:    driveCtx !== null,
          selectedFileId:   driveCtx?.selectedFileId   ?? null,
          selectedFileName: driveCtx?.selectedFileName ?? null,
        },
      });
      if (driveCtx && driveCtx.selectedFileId) {
        resolvedFileId = driveCtx.selectedFileId;
        resolvedBy     = "fileId";
      } else {
        return fail("NO_PARAMS", "Nenhum arquivo selecionado. Por favor, especifique o nome do arquivo para download.", null);
      }
    } catch {
      return fail("NO_PARAMS", "Nenhum fileId ou fileName fornecido. Especifique o nome do arquivo para download.", null);
    }
  } else {
    const searchQuery = fileName ?? queryFallback ?? rawText;
    if (!searchQuery) {
      return fail("NO_PARAMS", "Nenhum fileId ou fileName fornecido. Especifique o nome do arquivo para download.", null);
    }

    RuntimeDebug.emit({ executionId: _execId, connector: "google-drive", source: "DriveDownloadExecutor", event: "using strategy: search by name", payload: { searchQuery, fileName, queryFallback, rawText } });

    // Delegate search to connector — no HTTP here
    const _searchT0 = Date.now();
    const searchResults = await connector.searchByName(searchQuery, { pageSize: 20 });

    // ── [M1.11 AUDIT PROBE — DRIVE SEARCH] ────────────────────────────────
    try {
      const { driveAuditStore, AUDIT_MODE } = await import("@/lib/audit/DriveAuditStore");
      if (AUDIT_MODE) {
        driveAuditStore.record("drive_search", searchResults.length > 0 ? "ok" : "error", {
          searchQuery,
          fileName,
          queryFallback,
          rawText,
          resultCount:   searchResults.length,
          results:       searchResults.slice(0, 10).map((f: Record<string, unknown>) => ({
            id:          f.id,
            name:        f.name,
            mimeType:    f.mimeType,
            modifiedTime: f.modifiedTime,
          })),
          durationMs: Date.now() - _searchT0,
        }, _searchT0);
      }
    } catch { /* non-blocking */ }
    // ── [END M1.11 AUDIT PROBE] ───────────────────────────────────────────

    if (searchResults.length === 0) {
      return fail("NOT_FOUND", `Arquivo não encontrado: "${searchQuery}". Verifique o nome ou o acesso ao Google Drive.`, null);
    }

    const ranked = rankCandidates(searchResults, searchQuery, rankPolicy);
    resolvedCandidates = ranked;

    if (ranked.length === 1) {
      resolvedFileId = ranked[0].id;
      resolvedBy     = "search";
    } else if (ranked.length === 0) {
      // IA-037: guarda defensiva — não deveria acontecer (searchResults.length > 0
      // já foi checado acima, e rankCandidates preserva o tamanho do array),
      // mas evita o crash "Cannot read properties of undefined (reading 'score')"
      // observado em produção caso isso ocorra por qualquer motivo inesperado.
      return fail("NOT_FOUND", `Arquivo não encontrado: "${searchQuery}". Verifique o nome ou o acesso ao Google Drive.`, null);
    } else {
      const scoreDiff = ranked[0].score - (ranked[1]?.score ?? 0);
      if (scoreDiff >= rankPolicy.ambiguityThreshold) {
        resolvedFileId = ranked[0].id;
        resolvedBy     = "search";
      } else {
        const list = ranked.slice(0, 10).map((f, i) => `${i + 1}. ${f.name}`).join("\n");
        return {
          ok:         false,
          code:       "AMBIGUOUS",
          message:    `Encontrei ${ranked.length} arquivo(s) com nome similar a "${searchQuery}". Qual deseja baixar?\n\n${list}`,
          fileId:     null,
          fileName,
          candidates: ranked.slice(0, 10),
          durationMs: Date.now() - t0,
          audit:      makeAudit("failure", startedAt, Date.now() - t0, "AMBIGUOUS"),
        };
      }
    }
  }

  // ── Step 2: Get metadata — delegate to connector ──────────────────────────

  const meta = await connector.getFileMetadata(resolvedFileId);

  // ── [M1.11 AUDIT PROBE — METADATA] ────────────────────────────────────
  try {
    const { driveAuditStore, AUDIT_MODE } = await import("@/lib/audit/DriveAuditStore");
    if (AUDIT_MODE) {
      driveAuditStore.record("metadata", meta ? "ok" : "error", {
        resolvedFileId,
        resolvedBy,
        fileName:    meta?.name ?? null,
        mimeType:    meta?.mimeType ?? null,
        modifiedTime: (meta as Record<string, unknown>)?.modifiedTime ?? null,
        found:       !!meta,
      });
    }
  } catch { /* non-blocking */ }
  // ── [END M1.11 AUDIT PROBE] ─────────────────────────────────────────────

  if (!meta) {
    return fail("NOT_FOUND", `Arquivo não encontrado: fileId="${resolvedFileId}"`, resolvedFileId);
  }

  // ── Step 3: Determine export strategy — pure policy logic, no HTTP ────────

  const { exportMime, strategy } = resolveExportConfig(meta.mimeType, outputFormat, exportPolicy);

  // ── Step 4: Download — delegate entirely to connector ────────────────────

  const _dlT0 = Date.now();
  const downloadRaw = strategy === "export"
    ? await connector.exportFile(resolvedFileId, exportMime)
    : await connector.downloadMedia(resolvedFileId);

  // ── [M1.11 AUDIT PROBE — DOWNLOAD] ────────────────────────────────────
  try {
    const { driveAuditStore, AUDIT_MODE } = await import("@/lib/audit/DriveAuditStore");
    if (AUDIT_MODE) {
      const _content = downloadRaw.content ?? "";
      // Hex preview of first 32 bytes for binary detection
      const _hexBytes = _content.split("").slice(0, 32).map((c: string) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(" ");
      driveAuditStore.record("download", downloadRaw.ok ? "ok" : "error", {
        fileId:         resolvedFileId,
        fileName:       meta.name,
        mimeType:       meta.mimeType,
        strategy,
        exportMime,
        ok:             downloadRaw.ok,
        status:         downloadRaw.status,
        encoding:       downloadRaw.encoding,
        sizeBytes:      downloadRaw.sizeBytes,
        contentLength:  _content.length,
        contentPreview: _content.slice(0, 300),
        hexPreview:     _hexBytes,
        durationMs:     Date.now() - _dlT0,
      }, _dlT0);
    }
  } catch { /* non-blocking */ }
  // ── [END M1.11 AUDIT PROBE] ─────────────────────────────────────────────

  const apiUsed: "files.get" | "files.export" = strategy === "export" ? "files.export" : "files.get";

  // ── Step 5: Handle errors ─────────────────────────────────────────────────

  if (!downloadRaw.ok) {
    const code    = httpStatusToErrorCode(downloadRaw.status, downloadRaw.content) as DownloadErrorCode;
    const dur     = Date.now() - t0;
    const messages: Record<string, string> = {
      NOT_FOUND:       `Arquivo não encontrado no Drive: "${meta.name}"`,
      NO_PERMISSION:   `Sem permissão para baixar: "${meta.name}".`,
      API_UNAVAILABLE: `Google Drive API indisponível. Tente novamente.`,
      TIMEOUT:         `Timeout ao baixar "${meta.name}".`,
      QUOTA_EXCEEDED:  `Quota excedida. Aguarde e tente novamente.`,
      UNKNOWN:         `Erro ao baixar "${meta.name}" (HTTP ${downloadRaw.status}).`,
    };
    return {
      ok: false,
      code: code as DownloadErrorCode,
      message: messages[code] ?? messages.UNKNOWN,
      fileId: resolvedFileId,
      fileName: meta.name,
      durationMs: dur,
      audit: makeAudit("failure", startedAt, dur, code),
    };
  }

  // ── Step 6: Document Processing Engine ───────────────────────────────────
  // Passa o conteúdo bruto para a camada de processamento de documentos.
  // O DriveDownloadExecutor NÃO conhece regras de parsing de PDF, DOCX, etc.
  // A responsabilidade de extrair texto pertence ao DocumentProcessingEngine.

  const processingResult = await DocumentProcessingEngine.process({
    fileName:        meta.name,
    mimeType:        meta.mimeType,
    rawContent:      downloadRaw.content,
    encoding:        downloadRaw.encoding,
    sourceConnector: "google-drive",
  });

  // Texto extraído (ou conteúdo bruto como fallback se o parser falhar)
  const extractedText = processingResult.ok
    ? processingResult.extractedText
    : downloadRaw.content;

  const processingMeta = processingResult.ok
    ? {
        parserUsed:    processingResult.parserUsed,
        charCount:     processingResult.charCount,
        documentType:  processingResult.documentType,
        parsingMeta:   processingResult.meta,
      }
    : {
        parserUsed:    processingResult.parserUsed ?? null,
        parsingError:  processingResult.errorCode,
        parsingMessage: processingResult.message,
      };

  RuntimeDebug.emit({
    executionId: _execId,
    connector:   "google-drive",
    source:      "DriveDownloadExecutor",
    event:       "document-processing-complete",
    payload: {
      fileName:       meta.name,
      mimeType:       meta.mimeType,
      processingOk:   processingResult.ok,
      charCount:      processingResult.ok ? processingResult.charCount : 0,
      parserUsed:     processingResult.parserUsed ?? null,
      errorCode:      processingResult.ok ? null : processingResult.errorCode,
    },
  });

  // ── Step 7: Return success ────────────────────────────────────────────────

  const dur = Date.now() - t0;
  const _finalResult = {
    ok:          true as const,
    fileId:      resolvedFileId,
    fileName:    meta.name,
    mimeType:    meta.mimeType,
    exportMime,
    strategy,
    content:     extractedText,
    encoding:    "text" as const,
    sizeBytes:   extractedText.length,
    apiUsed,
    resolvedBy,
    candidates:  resolvedCandidates,
    durationMs:  dur,
    audit:       makeAudit("success", startedAt, dur, null),
    processing:  processingMeta,
  };

  // ── [M1.11 AUDIT PROBE — DOWNLOAD RESULT] ────────────────────────────
  try {
    const { driveAuditStore, AUDIT_MODE } = await import("@/lib/audit/DriveAuditStore");
    if (AUDIT_MODE) {
      driveAuditStore.record("download_result", "ok", {
        ok:             true,
        fileId:         _finalResult.fileId,
        fileName:       _finalResult.fileName,
        mimeType:       _finalResult.mimeType,
        strategy:       _finalResult.strategy,
        exportMime:     _finalResult.exportMime,
        encoding:       _finalResult.encoding,
        sizeBytes:      _finalResult.sizeBytes,
        resolvedBy:     _finalResult.resolvedBy,
        apiUsed:        _finalResult.apiUsed,
        durationMs:     _finalResult.durationMs,
        processing:     processingMeta,
        contentLength:  extractedText.length,
        contentPreview: extractedText.slice(0, 300),
        contentIsEmpty: extractedText.length === 0,
      });
    }
  } catch { /* non-blocking */ }
  // ── [END M1.11 AUDIT PROBE] ─────────────────────────────────────────────

  return _finalResult;
}

// Re-export for backward compat with tests
export { rankCandidates, resolveExportConfig, isGoogleWorkspaceMime };
export type { RankCandidate as CandidateFile };
