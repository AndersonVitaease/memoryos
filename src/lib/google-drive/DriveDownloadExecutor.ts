/**
 * DriveDownloadExecutor.ts — Sprint EF-6.3.1
 *
 * Responsabilidade única: executar o download completo de um arquivo do Drive.
 *
 * Fluxo:
 *   goal.parameters.fileId  → usar diretamente
 *   goal.parameters.fileName → searchFiles → rankear → fileId → download
 *
 * Estratégia de exportação:
 *   Google Docs   → text/plain (legível pelo MemoryOS)
 *   Google Sheets → text/csv
 *   Google Slides → text/plain
 *   Binários      → media (base64)
 *
 * NÃO altera:
 *   - Semantic Providers
 *   - Planner
 *   - GoalRegistry
 *   - GoalCapabilityRegistry
 *   - ConversationPlanningEngine
 */

import { DRIVE_MIME } from "./GoogleDriveTypes";

// ── Public result types ───────────────────────────────────────────────────────

export type DownloadErrorCode =
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "NO_PERMISSION"
  | "API_UNAVAILABLE"
  | "TIMEOUT"
  | "QUOTA_EXCEEDED"
  | "NO_PARAMS"
  | "UNKNOWN";

export interface DownloadSuccess {
  ok: true;
  fileId: string;
  fileName: string;
  mimeType: string;
  exportMime: string;
  strategy: "export" | "media";
  content: string;
  encoding: "text" | "base64";
  sizeBytes: number;
  apiUsed: "files.get" | "files.export";
  resolvedBy: "fileId" | "search";
  candidates?: CandidateFile[];  // when resolved by search
  durationMs: number;
  audit: DownloadAudit;
}

export interface DownloadFailure {
  ok: false;
  code: DownloadErrorCode;
  message: string;
  fileId: string | null;
  fileName: string | null;
  candidates?: CandidateFile[];  // when AMBIGUOUS
  durationMs: number;
  audit: DownloadAudit;
}

export type DownloadResult = DownloadSuccess | DownloadFailure;

// ── Audit record ──────────────────────────────────────────────────────────────

export interface DownloadAudit {
  goalType:    string;
  fileName:    string | null;
  fileId:      string | null;
  mimeType:    string | null;
  apiUsed:     string | null;
  durationMs:  number;
  result:      "success" | "failure";
  error:       string | null;
  timestamp:   string;
}

// ── Candidate (internal ranking) ─────────────────────────────────────────────

export interface CandidateFile {
  id:           string;
  name:         string;
  mimeType:     string;
  modifiedTime: string | null;
  score:        number;
}

// ── Google Workspace MIME → export MIME ──────────────────────────────────────

const GWS_EXPORT: Record<string, { exportMime: string; strategy: "export" | "media" }> = {
  [DRIVE_MIME.DOCUMENT]:     { exportMime: "text/plain",       strategy: "export" },
  [DRIVE_MIME.SPREADSHEET]:  { exportMime: "text/csv",         strategy: "export" },
  [DRIVE_MIME.PRESENTATION]: { exportMime: "text/plain",       strategy: "export" },
  [DRIVE_MIME.DRAWING]:      { exportMime: "image/svg+xml",    strategy: "export" },
  [DRIVE_MIME.FORM]:         { exportMime: "application/zip",  strategy: "export" },
};

export function resolveExportConfig(mimeType: string): { exportMime: string; strategy: "export" | "media" } {
  return GWS_EXPORT[mimeType] ?? { exportMime: mimeType, strategy: "media" };
}

export function isGoogleWorkspaceMime(mimeType: string): boolean {
  return mimeType.startsWith("application/vnd.google-apps.");
}

// ── Candidate ranking ─────────────────────────────────────────────────────────
// Critérios: nome exato > mesma extensão > mais recente > score total

export function rankCandidates(files: Array<{ id: string; name: string; mimeType: string; modifiedTime: string | null }>, query: string): CandidateFile[] {
  const qLower = query.toLowerCase().trim();
  const qExt   = extractExtension(qLower);

  return files
    .map(f => {
      let score = 0;
      const nameLower = f.name.toLowerCase();

      // Exact name match (highest weight)
      if (nameLower === qLower) score += 100;
      // Contains full query
      else if (nameLower.includes(qLower)) score += 60;
      // Query words in name
      else {
        const words = qLower.split(/\s+/).filter(w => w.length > 2);
        const matched = words.filter(w => nameLower.includes(w));
        score += (matched.length / Math.max(words.length, 1)) * 40;
      }

      // Extension match
      if (qExt && nameLower.endsWith(`.${qExt}`)) score += 20;

      // Recency bonus (more recent = higher score, max +10)
      if (f.modifiedTime) {
        const ageMs = Date.now() - new Date(f.modifiedTime).getTime();
        const ageDays = ageMs / 86400000;
        score += Math.max(0, 10 - Math.floor(ageDays / 30));
      }

      return { ...f, score };
    })
    .sort((a, b) => b.score - a.score);
}

function extractExtension(name: string): string | null {
  const m = name.match(/\.([a-z0-9]{1,6})$/i);
  return m ? m[1].toLowerCase() : null;
}

// ── HTTP helpers (Drive API) ──────────────────────────────────────────────────

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DEFAULT_TIMEOUT_MS = 15000;

async function driveRequest(
  path: string,
  token: string,
  opts: { alt?: "json" | "media"; timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; body: string; contentType: string | null; durationMs: number }> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${DRIVE_API}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "*/*" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await res.text();
    return {
      ok:          res.ok,
      status:      res.status,
      body,
      contentType: res.headers.get("content-type"),
      durationMs:  Date.now() - t0,
    };
  } catch (e) {
    clearTimeout(timer);
    const isTimeout = (e as Error).name === "AbortError";
    return { ok: false, status: 0, body: isTimeout ? "TIMEOUT" : String(e), contentType: null, durationMs: Date.now() - t0 };
  }
}

// ── Search by file name (internal helper) ─────────────────────────────────────

async function searchByFileName(
  fileName: string,
  token: string,
): Promise<Array<{ id: string; name: string; mimeType: string; modifiedTime: string | null }>> {
  // Try two strategies: name-contains search + full-text
  const q = `name contains '${fileName.replace(/'/g, "\\'")}' and trashed=false`;
  const fields = "files(id,name,mimeType,modifiedTime)";
  const path = `/files?q=${encodeURIComponent(q)}&pageSize=20&fields=${encodeURIComponent(fields)}&orderBy=modifiedTime+desc`;

  const res = await driveRequest(path, token);
  if (!res.ok) return [];

  try {
    const data = JSON.parse(res.body) as { files?: Array<{ id: string; name: string; mimeType: string; modifiedTime: string | null }> };
    return data.files ?? [];
  } catch {
    return [];
  }
}

// ── Get file metadata ─────────────────────────────────────────────────────────

async function getFileMetadata(
  fileId: string,
  token: string,
): Promise<{ id: string; name: string; mimeType: string; modifiedTime: string | null } | null> {
  const fields = "id,name,mimeType,modifiedTime";
  const res = await driveRequest(`/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`, token);
  if (!res.ok) return null;
  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}

// ── Download binary content ───────────────────────────────────────────────────

async function downloadMedia(fileId: string, token: string): Promise<{ content: string; encoding: "text" | "base64"; sizeBytes: number; ok: boolean; status: number; durationMs: number }> {
  const res = await driveRequest(`/files/${encodeURIComponent(fileId)}?alt=media`, token);
  const sizeBytes = res.body.length;
  // Try to detect if it's text
  const isText = res.contentType?.startsWith("text/") ||
    res.contentType?.includes("json") ||
    res.contentType?.includes("xml");

  return {
    content:   res.body,
    encoding:  isText ? "text" : "base64",
    sizeBytes,
    ok:        res.ok,
    status:    res.status,
    durationMs: res.durationMs,
  };
}

// ── Export Google Workspace file ──────────────────────────────────────────────

async function exportWorkspaceFile(fileId: string, exportMime: string, token: string): Promise<{ content: string; encoding: "text" | "base64"; sizeBytes: number; ok: boolean; status: number; durationMs: number }> {
  const path = `/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`;
  const res = await driveRequest(path, token);
  const isText = exportMime.startsWith("text/") || exportMime.includes("json") || exportMime.includes("xml");
  return {
    content:   res.body,
    encoding:  isText ? "text" : "base64",
    sizeBytes: res.body.length,
    ok:        res.ok,
    status:    res.status,
    durationMs: res.durationMs,
  };
}

// ── Error code mapper ─────────────────────────────────────────────────────────

function mapStatusToCode(status: number, body: string): DownloadErrorCode {
  if (body === "TIMEOUT") return "TIMEOUT";
  if (status === 403) {
    if (body.includes("quotaExceeded") || body.includes("userRateLimitExceeded")) return "QUOTA_EXCEEDED";
    return "NO_PERMISSION";
  }
  if (status === 404) return "NOT_FOUND";
  if (status === 0)   return "API_UNAVAILABLE";
  return "UNKNOWN";
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeDriveDownload(
  parameters: Record<string, unknown>,
  token: string,
): Promise<DownloadResult> {
  const t0 = Date.now();

  const explicitFileId = typeof parameters.fileId   === "string" ? parameters.fileId.trim()   : null;
  const fileName       = typeof parameters.fileName  === "string" ? parameters.fileName.trim()  : null;
  const intentAction   = typeof parameters.intentAction === "string" ? parameters.intentAction : null;

  // Use fileName as fallback query when neither fileId nor fileName provided
  const queryFallback  = typeof parameters.query === "string" ? parameters.query.trim() : null;
  const rawText        = typeof parameters.rawText === "string" ? parameters.rawText.trim() : null;

  function audit(result: "success" | "failure", fileId: string | null, meta: { name?: string | null; mimeType?: string | null; apiUsed?: string | null; error?: string | null }): DownloadAudit {
    return {
      goalType:   "drive.downloadFile",
      fileName:   meta.name ?? fileName,
      fileId,
      mimeType:   meta.mimeType ?? null,
      apiUsed:    meta.apiUsed ?? null,
      durationMs: Date.now() - t0,
      result,
      error:      meta.error ?? null,
      timestamp:  new Date().toISOString(),
    };
  }

  function fail(code: DownloadErrorCode, message: string, fileId: string | null, extra: Partial<DownloadFailure> = {}): DownloadFailure {
    return {
      ok:        false,
      code,
      message,
      fileId,
      fileName,
      durationMs: Date.now() - t0,
      audit:     audit("failure", fileId, { error: message }),
      ...extra,
    };
  }

  // ── Step 1: Resolve fileId ────────────────────────────────────────────────

  let resolvedFileId: string;
  let resolvedBy: "fileId" | "search" = "fileId";
  let resolvedCandidates: CandidateFile[] | undefined;

  if (explicitFileId) {
    resolvedFileId = explicitFileId;
  } else {
    // Determine search query: prefer fileName, then query, then rawText
    const searchQuery = fileName ?? queryFallback ?? rawText;

    if (!searchQuery) {
      return fail("NO_PARAMS", "Nenhum fileId ou fileName fornecido. Especifique o nome do arquivo para download.", null);
    }

    // Search Drive
    const searchResults = await searchByFileName(searchQuery, token);

    if (searchResults.length === 0) {
      return fail("NOT_FOUND", `Arquivo não encontrado: "${searchQuery}". Verifique o nome ou o acesso ao Google Drive.`, null);
    }

    const ranked = rankCandidates(searchResults, searchQuery);
    resolvedCandidates = ranked;

    if (ranked.length === 1) {
      resolvedFileId = ranked[0].id;
      resolvedBy = "search";
    } else {
      // Multiple candidates — check if top score is unambiguously higher
      const top   = ranked[0];
      const second = ranked[1];
      const scoreDiff = top.score - second.score;

      if (scoreDiff >= 30) {
        // Clear winner — auto-select
        resolvedFileId = top.id;
        resolvedBy = "search";
      } else {
        // Ambiguous — request clarification
        const list = ranked.slice(0, 10).map((f, i) => `${i + 1}. ${f.name}`).join("\n");
        return {
          ok:         false,
          code:       "AMBIGUOUS",
          message:    `Encontrei ${ranked.length} arquivo(s) com nome similar a "${searchQuery}". Qual deseja baixar?\n\n${list}`,
          fileId:     null,
          fileName,
          candidates: ranked.slice(0, 10),
          durationMs: Date.now() - t0,
          audit:      audit("failure", null, { error: "AMBIGUOUS" }),
        };
      }
    }
  }

  // ── Step 2: Get metadata (to determine MIME type) ─────────────────────────

  const meta = await getFileMetadata(resolvedFileId, token);
  if (!meta) {
    return fail("NOT_FOUND", `Arquivo não encontrado: fileId="${resolvedFileId}"`, resolvedFileId);
  }

  // ── Step 3: Determine export strategy ────────────────────────────────────

  const { exportMime, strategy } = resolveExportConfig(meta.mimeType);

  // ── Step 4: Download / export ─────────────────────────────────────────────

  let downloadResult: { content: string; encoding: "text" | "base64"; sizeBytes: number; ok: boolean; status: number; durationMs: number };
  let apiUsed: "files.get" | "files.export";

  if (strategy === "export") {
    downloadResult = await exportWorkspaceFile(resolvedFileId, exportMime, token);
    apiUsed = "files.export";
  } else {
    downloadResult = await downloadMedia(resolvedFileId, token);
    apiUsed = "files.get";
  }

  // ── Step 5: Handle download errors ────────────────────────────────────────

  if (!downloadResult.ok) {
    const code = mapStatusToCode(downloadResult.status, downloadResult.content);
    const messages: Record<DownloadErrorCode, string> = {
      NOT_FOUND:       `Arquivo não encontrado no Drive: "${meta.name}"`,
      NO_PERMISSION:   `Sem permissão para baixar: "${meta.name}". Verifique se o arquivo está compartilhado com você.`,
      API_UNAVAILABLE: `Google Drive API indisponível. Tente novamente em alguns instantes.`,
      TIMEOUT:         `Timeout ao baixar "${meta.name}". O arquivo pode ser muito grande ou a conexão está lenta.`,
      QUOTA_EXCEEDED:  `Quota da Google Drive API excedida. Aguarde alguns minutos e tente novamente.`,
      AMBIGUOUS:       `Ambiguidade na seleção do arquivo.`,
      NO_PARAMS:       `Parâmetros insuficientes.`,
      UNKNOWN:         `Erro desconhecido ao baixar "${meta.name}" (HTTP ${downloadResult.status}).`,
    };
    return fail(code, messages[code], resolvedFileId, {
      audit: audit("failure", resolvedFileId, { name: meta.name, mimeType: meta.mimeType, apiUsed, error: messages[code] }),
    });
  }

  // ── Step 6: Return success ────────────────────────────────────────────────

  return {
    ok:           true,
    fileId:       resolvedFileId,
    fileName:     meta.name,
    mimeType:     meta.mimeType,
    exportMime,
    strategy,
    content:      downloadResult.content,
    encoding:     downloadResult.encoding,
    sizeBytes:    downloadResult.sizeBytes,
    apiUsed,
    resolvedBy,
    candidates:   resolvedCandidates,
    durationMs:   Date.now() - t0,
    audit:        audit("success", resolvedFileId, { name: meta.name, mimeType: meta.mimeType, apiUsed }),
  };
}