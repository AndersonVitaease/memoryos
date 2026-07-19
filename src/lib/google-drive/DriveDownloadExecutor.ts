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

  // [DIAG] DriveDownloadExecutor — received parameters
  console.log("[DIAG][DriveDownloadExecutor] received parameters", {
    "parameters.fileId":       parameters.fileId       ?? null,
    "parameters.fileName":     parameters.fileName     ?? null,
    "parameters.filePath":     parameters.filePath     ?? null,
    "parameters.query":        parameters.query        ?? null,
    "parameters.outputFormat": parameters.outputFormat ?? null,
    "parameters.rawText":      parameters.rawText      ?? null,
    allParameterKeys: Object.keys(parameters),
    allParameterValues: parameters,
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

  // [DIAG] DriveDownloadExecutor — resolution strategy selection
  console.log("[DIAG][DriveDownloadExecutor] strategy selection", {
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
  });

  if (explicitFileId) {
    // [DIAG]
    console.log("[DIAG][DriveDownloadExecutor] using strategy: explicit fileId →", explicitFileId);
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
      // [DIAG]
      console.log("[DIAG][DriveDownloadExecutor] using strategy: conversation context", {
        rawContextFound:  raw !== null,
        driveCtxFound:    driveCtx !== null,
        selectedFileId:   driveCtx?.selectedFileId   ?? null,
        selectedFileName: driveCtx?.selectedFileName ?? null,
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

    // [DIAG]
    console.log("[DIAG][DriveDownloadExecutor] using strategy: search by name →", { searchQuery });

    // Delegate search to connector — no HTTP here
    const searchResults = await connector.searchByName(searchQuery, { pageSize: 20 });

    if (searchResults.length === 0) {
      return fail("NOT_FOUND", `Arquivo não encontrado: "${searchQuery}". Verifique o nome ou o acesso ao Google Drive.`, null);
    }

    const ranked = rankCandidates(searchResults, searchQuery, rankPolicy);
    resolvedCandidates = ranked;

    if (ranked.length === 1) {
      resolvedFileId = ranked[0].id;
      resolvedBy     = "search";
    } else {
      const scoreDiff = ranked[0].score - ranked[1].score;
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
  if (!meta) {
    return fail("NOT_FOUND", `Arquivo não encontrado: fileId="${resolvedFileId}"`, resolvedFileId);
  }

  // ── Step 3: Determine export strategy — pure policy logic, no HTTP ────────

  const { exportMime, strategy } = resolveExportConfig(meta.mimeType, outputFormat, exportPolicy);

  // ── Step 4: Download — delegate entirely to connector ────────────────────

  const downloadRaw = strategy === "export"
    ? await connector.exportFile(resolvedFileId, exportMime)
    : await connector.downloadMedia(resolvedFileId);

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

  // ── Step 6: Return success ────────────────────────────────────────────────

  const dur = Date.now() - t0;
  return {
    ok:          true,
    fileId:      resolvedFileId,
    fileName:    meta.name,
    mimeType:    meta.mimeType,
    exportMime,
    strategy,
    content:     downloadRaw.content,
    encoding:    downloadRaw.encoding,
    sizeBytes:   downloadRaw.sizeBytes,
    apiUsed,
    resolvedBy,
    candidates:  resolvedCandidates,
    durationMs:  dur,
    audit:       makeAudit("success", startedAt, dur, null),
  };
}

// Re-export for backward compat with tests
export { rankCandidates, resolveExportConfig, isGoogleWorkspaceMime };
export type { RankCandidate as CandidateFile };