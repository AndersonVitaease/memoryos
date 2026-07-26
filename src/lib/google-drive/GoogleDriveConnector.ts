/**
 * GoogleDriveConnector.ts — Engineering Sprint 7.1
 * Google Drive Connector — built 100% on GWS Foundation.
 *
 * Reuses (zero duplication):
 *   GoogleWorkspaceAuth      — OAuth headers
 *   GoogleWorkspaceRateLimiter — quota / backoff
 *   GoogleWorkspaceAuditLogger — all calls logged
 *   GoogleWorkspaceErrorHandler — HTTP error normalization
 *   GoogleWorkspaceScopes    — scope constants
 *
 * Drive-specific code only: URL construction + response parsing.
 */

import { getConnection, isConnected, getAccessToken, ensureValidToken }
  from "@/lib/google-auth/GoogleAuthSession";
import { GoogleWorkspaceAuditLogger } from "@/lib/google-workspace/GoogleWorkspaceAuditLogger";
import { GoogleWorkspaceRateLimiter }  from "@/lib/google-workspace/GoogleWorkspaceRateLimiter";
import { RuntimeDebug } from "@/lib/debug/RuntimeDebug";
// Sprint EF-6.4.0: UCR adapter registered on import
import "@/lib/ucr/adapters/GoogleDriveAdapter";

import type { DriveFile, DriveListResult, DriveFileContent, DriveFolder } from "./GoogleDriveTypes";
import { detectFileType } from "./GoogleDriveTypes";
import { bootstrapDriveCapabilities } from "./GoogleDriveCapabilityRegistry";

const WS  = "default";
const SVC = "drive" as const;

// ── Request ID ────────────────────────────────────────────────────────────────

let _seq = 1;
function _rid() { return `drv-${Date.now()}-${(_seq++).toString().padStart(4, "0")}`; }

// ── Auth header ───────────────────────────────────────────────────────────────

// [DIAG-TEMP] Get or reuse the shared TOKEN-PROBE execution from GoogleAuthSession
function _getProbeExecId(): string | null {
  const open = RuntimeDebug.getExecutions("google-drive")
    .find((e) => !e.endedAt && e.label?.startsWith("TOKEN-PROBE"));
  if (open) return open.executionId;
  // Fallback: create one here if GoogleAuthSession didn't run first
  return RuntimeDebug.startExecution("google-drive", "TOKEN-PROBE — Auth Session Diagnostics");
}

function _emitProbe(step: string, payload: Record<string, unknown>): void {
  try {
    const execId = _getProbeExecId();
    if (execId) {
      RuntimeDebug.emit({ executionId: execId, connector: "google-drive", source: "GoogleDriveConnector", event: step, payload });
    }
  } catch (_) { /* non-blocking */ }
}

function _authHeader(): string | null {
  console.group("[TRACE-GWSF-08]");
  const token = getAccessToken(WS);
  console.log({ tokenPresent: !!token, tokenPrefix: token?.slice(0, 12) + "..." });
  const payload = {
    step:        "7-_authHeader",
    ts:          new Date().toISOString(),
    workspaceId: WS,
    tokenPrefix: token ? token.slice(0, 12) : "NULL",
    result:      token ? `Bearer ${token.slice(0, 12)}...` : "NULL — Authorization header will be missing",
  };
  // [DIAG-TEMP] Point 7 — value produced by _authHeader()
  console.log("%c[TOKEN-PROBE][7-_authHeader]", "color:#f59e0b;font-weight:bold;font-size:11px", payload);
  _emitProbe("7-_authHeader", payload);
  console.groupEnd();
  return token ? `Bearer ${token}` : null;
}

// ── Raw HTTP fetch with audit + rate limit ─────────────────────────────────────

async function _driveRequest<T>(capability: string, url: string, opts: RequestInit = {}): Promise<T> {
  console.group("[TRACE-GWSF-09]");
  console.log({ capability, url, method: opts.method ?? "GET" });
  await GoogleWorkspaceRateLimiter.check(SVC);
  const rid = _rid();
  return GoogleWorkspaceAuditLogger.wrap(SVC, capability, "user", rid, async () => {
    GoogleWorkspaceRateLimiter.consume(SVC);
    const auth = _authHeader();
    if (!auth) {
      console.log({ error: "NOT_AUTHENTICATED" });
      console.groupEnd();
      throw Object.assign(new Error("Not authenticated"), { code: "NOT_AUTHENTICATED" });
    }
    const p8 = {
      step:       "8-fetch-Authorization",
      ts:         new Date().toISOString(),
      capability,
      authPrefix: auth.slice(0, 19) + "...",
      urlPath:    url.replace("https://www.googleapis.com", ""),
    };
    // [DIAG-TEMP] Point 8 — Authorization header sent to fetch()
    console.log("%c[TOKEN-PROBE][8-fetch-Authorization]", "color:#34d399;font-weight:bold;font-size:11px", p8);
    _emitProbe("8-fetch-Authorization", p8);
    const res = await fetch(url, { ...opts, headers: { Authorization: auth, ...opts.headers } });
    const resBody = await res.text().catch(() => "");

    // [DIAG-TEMP] Probe 9 — Google Drive HTTP response
    const p9: Record<string, unknown> = {
      step:        "9-drive-response",
      ts:          new Date().toISOString(),
      capability,
      status:      res.status,
      statusText:  res.statusText,
      url:         url.replace("https://www.googleapis.com", ""),
      body:        resBody.slice(0, 2000), // cap at 2 KB to avoid oversized payloads
      headers: {
        "content-type":     res.headers.get("content-type")     ?? null,
        "www-authenticate": res.headers.get("www-authenticate") ?? null,
        "x-goog-request-params": res.headers.get("x-goog-request-params") ?? null,
      },
    };
    console.log("[TRACE-GWSF-09]", { httpStatus: res.status, statusText: res.statusText });
    console.log("%c[TOKEN-PROBE][9-drive-response]", "color:#22d3ee;font-weight:bold;font-size:11px", p9);
    _emitProbe("9-drive-response", p9);

    if (!res.ok) {
      // [DIAG-TEMP] Probe 10 — Drive error detail
      const err = Object.assign(new Error(`Drive API ${res.status}: ${resBody}`), { code: `HTTP_${res.status}` });
      const p10: Record<string, unknown> = {
        step:       "10-drive-error",
        ts:         new Date().toISOString(),
        capability,
        status:     res.status,
        statusText: res.statusText,
        body:       resBody.slice(0, 2000),
        stack:      err.stack?.split("\n").slice(0, 6).join(" | ") ?? null,
      };
      console.log("[TRACE-GWSF-09] HTTP_ERROR", { status: res.status, body: resBody.slice(0, 500) });
      console.error("%c[TOKEN-PROBE][10-drive-error]", "color:#f87171;font-weight:bold;font-size:11px", p10);
      _emitProbe("10-drive-error", p10);
      console.groupEnd();
      throw err;
    }

    console.log("[TRACE-GWSF-09]", { result: "OK" });
    console.groupEnd();
    return JSON.parse(resBody) as T;
  });
}

// ── Field mask (consistent minimal fields) ────────────────────────────────────

const FILE_FIELDS = "id,name,mimeType,size,webViewLink,iconLink,createdTime,modifiedTime,owners(emailAddress),shared,starred,trashed,parents,description,thumbnailLink";

// ── Response normalizer ───────────────────────────────────────────────────────

function _normalizeFile(f: Record<string, unknown>): DriveFile {
  return {
    id:           f.id as string,
    name:         f.name as string,
    mimeType:     f.mimeType as string,
    fileType:     detectFileType(f.mimeType as string),
    size:         f.size ? Number(f.size) : null,
    webViewLink:  (f.webViewLink as string) ?? null,
    iconLink:     (f.iconLink as string) ?? null,
    createdTime:  (f.createdTime as string) ?? null,
    modifiedTime: (f.modifiedTime as string) ?? null,
    owners:       ((f.owners as Array<{ emailAddress: string }>) ?? []).map((o) => o.emailAddress),
    shared:       Boolean(f.shared),
    starred:      Boolean(f.starred),
    trashed:      Boolean(f.trashed),
    parents:      (f.parents as string[]) ?? [],
    description:  (f.description as string) ?? null,
    thumbnailLink:(f.thumbnailLink as string) ?? null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Connection health check */
export function getDriveHealth(): { ok: boolean; reason: string } {
  const conn = getConnection(WS);
  if (!conn || conn.state !== "CONNECTED") return { ok: false, reason: "Google Workspace nao conectado" };
  const token = getAccessToken(WS);
  // token can be null after page reload — that is normal and will be fixed by ensureValidToken()
  if (token) return { ok: true, reason: `Conectado como ${conn.email ?? "usuario"}` };
  return { ok: true, reason: `Conectado como ${conn.email ?? "usuario"} (token sera renovado automaticamente)` };
}

/** List files — supports optional folder, page size, page token */
export async function listFiles(opts: {
  pageSize?:    number;
  pageToken?:   string;
  orderBy?:     string;
  folderId?:    string;
} = {}): Promise<DriveListResult> {
  await ensureValidToken(WS);
  const t0 = Date.now();
  const q  = opts.folderId ? `'${opts.folderId}' in parents and trashed=false` : "trashed=false";
  const params = new URLSearchParams({
    q,
    pageSize:  String(opts.pageSize ?? 20),
    fields:    `nextPageToken,files(${FILE_FIELDS})`,
    orderBy:   opts.orderBy ?? "modifiedTime desc",
    ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
  });
  const raw = await _driveRequest<{ files: Record<string, unknown>[]; nextPageToken?: string }>(
    "drive.listFiles",
    `https://www.googleapis.com/drive/v3/files?${params}`,
  );
  return {
    files:         (raw.files ?? []).map(_normalizeFile),
    nextPageToken: raw.nextPageToken ?? null,
    totalCount:    null,
    searchQuery:   q,
    durationMs:    Date.now() - t0,
  };
}

/** Search files — natural language query converted to Drive query syntax */
export async function searchFiles(query: string, opts: {
  pageSize?: number;
  pageToken?: string;
} = {}): Promise<DriveListResult> {
  await ensureValidToken(WS);
  const t0 = Date.now();
  const { buildDriveQuery } = await import("./GoogleDriveCapabilityExecutor");
  const driveQ = buildDriveQuery(query);
  // LOG 2 — entering Drive API call
  console.log("%c[DRIVE][2-SEARCH-CALL]", "color:#a78bfa;font-weight:bold", { naturalQuery: query, driveQuery: driveQ, pageSize: opts.pageSize ?? 20 });
  const params = new URLSearchParams({
    q:        driveQ,
    pageSize: String(opts.pageSize ?? 20),
    fields:   `nextPageToken,files(${FILE_FIELDS})`,
    orderBy:  "modifiedTime desc",
    ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
  });
  const raw = await _driveRequest<{ files: Record<string, unknown>[]; nextPageToken?: string }>(
    "drive.searchFiles",
    `https://www.googleapis.com/drive/v3/files?${params}`,
  );
  return {
    files:         (raw.files ?? []).map(_normalizeFile),
    nextPageToken: raw.nextPageToken ?? null,
    totalCount:    null,
    searchQuery:   driveQ,
    durationMs:    Date.now() - t0,
  };
}

/** Read file metadata */
export async function readFileMetadata(fileId: string): Promise<{ ok: boolean; data: DriveFile | null; error: string | null }> {
  await ensureValidToken(WS);
  try {
    const params = new URLSearchParams({ fields: FILE_FIELDS });
    const raw = await _driveRequest<Record<string, unknown>>(
      "drive.readFileMetadata",
      `https://www.googleapis.com/drive/v3/files/${fileId}?${params}`,
    );
    return { ok: true, data: _normalizeFile(raw), error: null };
  } catch (e) {
    return { ok: false, data: null, error: (e as Error).message };
  }
}

/** Read file content (exported as plain text for Google Workspace files) */
export async function readFile(fileId: string, mimeType?: string): Promise<{ ok: boolean; data: DriveFileContent | null; error: string | null }> {
  await ensureValidToken(WS);
  try {
    const meta = await readFileMetadata(fileId);
    if (!meta.ok || !meta.data) return { ok: false, data: null, error: "File not found" };
    const f = meta.data;
    // For Google Workspace files, export as text/plain
    const isGWS = f.mimeType.startsWith("application/vnd.google-apps");
    const exportMime = mimeType ?? (isGWS ? "text/plain" : f.mimeType);
    const urlBase = isGWS
      ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`
      : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const auth = _authHeader();
    if (!auth) return { ok: false, data: null, error: "Not authenticated" };
    const res = await fetch(urlBase, { headers: { Authorization: auth } });
    if (!res.ok) return { ok: false, data: null, error: `HTTP ${res.status}` };
    const content = await res.text();
    return { ok: true, data: { fileId, name: f.name, mimeType: f.mimeType, content, encoding: "text", sizeBytes: content.length }, error: null };
  } catch (e) {
    return { ok: false, data: null, error: (e as Error).message };
  }
}

/** List folders */
export async function listFolders(opts: {
  pageSize?:  number;
  pageToken?: string;
  parentId?:  string;
} = {}): Promise<{ ok: boolean; data: DriveFolder[]; error: string | null }> {
  await ensureValidToken(WS);
  try {
    const parentQ = opts.parentId ? ` and '${opts.parentId}' in parents` : "";
    const q = `mimeType='application/vnd.google-apps.folder' and trashed=false${parentQ}`;
    const params = new URLSearchParams({
      q,
      pageSize: String(opts.pageSize ?? 30),
      fields:   "files(id,name,parents,createdTime,modifiedTime,shared)",
      orderBy:  "name",
      ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
    });
    const raw = await _driveRequest<{ files: Record<string, unknown>[] }>(
      "drive.listFolders",
      `https://www.googleapis.com/drive/v3/files?${params}`,
    );
    const folders: DriveFolder[] = (raw.files ?? []).map((f) => ({
      id:          f.id as string,
      name:        f.name as string,
      parents:     (f.parents as string[]) ?? [],
      createdTime: (f.createdTime as string) ?? null,
      modifiedTime:(f.modifiedTime as string) ?? null,
      shared:      Boolean(f.shared),
    }));
    return { ok: true, data: folders, error: null };
  } catch (e) {
    return { ok: false, data: [], error: (e as Error).message };
  }
}

/** Create a folder in Google Drive. */
export async function createFolder(
  folderName: string,
  parentId?: string,
): Promise<{ id: string; name: string; mimeType: string; parents: string[]; webViewLink: string | null; createdTime: string | null; modifiedTime: string | null }> {
  await ensureValidToken(WS);

  const body: Record<string, unknown> = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId && parentId.trim().length > 0) {
    body.parents = [parentId.trim()];
  }

  const params = new URLSearchParams({ fields: "id,name,mimeType,parents,webViewLink,createdTime,modifiedTime" });
  const raw = await _driveRequest<Record<string, unknown>>(
    "drive.createFolder",
    `https://www.googleapis.com/drive/v3/files?${params}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  return {
    id: raw.id as string,
    name: raw.name as string,
    mimeType: raw.mimeType as string,
    parents: (raw.parents as string[]) ?? [],
    webViewLink: (raw.webViewLink as string) ?? null,
    createdTime: (raw.createdTime as string) ?? null,
    modifiedTime: (raw.modifiedTime as string) ?? null,
  };
}

// ── Sprint EF-6.3.2: Connector Facade methods ─────────────────────────────────
// These are the ONLY methods that know about the Google Drive API URLs, tokens,
// and HTTP semantics. DriveDownloadExecutor calls these — it never calls fetch().

/**
 * Search Drive files by name fragment — direct `name contains` filter, no
 * natural-language parsing. Returns full DriveFile records (same shape as
 * listFiles/searchFiles) so callers can use it as the general "search by
 * name" primitive, not just for download-resolution ranking.
 *
 * Errors propagate (no swallow-to-[]) — callers must handle them, same as
 * every other Foundation method.
 */
export async function searchByName(
  name: string,
  opts: { pageSize?: number } = {},
): Promise<DriveFile[]> {
  await ensureValidToken(WS);
  const q = `name contains '${name.replace(/'/g, "\\'")}' and trashed=false`;
  const params = new URLSearchParams({
    q,
    pageSize: String(opts.pageSize ?? 20),
    fields:   `files(${FILE_FIELDS})`,
    orderBy:  "modifiedTime desc",
  });
  const raw = await _driveRequest<{ files: Record<string, unknown>[] }>(
    "drive.searchByName",
    `https://www.googleapis.com/drive/v3/files?${params}`,
  );
  return (raw.files ?? []).map(_normalizeFile);
}

/** Get minimal metadata for a fileId (id, name, mimeType, modifiedTime). */
export async function getFileMetadata(
  fileId: string,
): Promise<{ id: string; name: string; mimeType: string; modifiedTime: string | null } | null> {
  await ensureValidToken(WS);
  const params = new URLSearchParams({ fields: "id,name,mimeType,modifiedTime" });
  try {
    const raw = await _driveRequest<{ id: string; name: string; mimeType: string; modifiedTime: string | null }>(
      "drive.getFileMetadata",
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`,
    );
    return raw;
  } catch {
    return null;
  }
}

/** Download binary/text file content via media download. */
export async function downloadMedia(
  fileId: string,
): Promise<{ content: string; encoding: "text" | "base64"; sizeBytes: number; ok: boolean; status: number; durationMs: number; contentType: string }> {
  await ensureValidToken(WS);
  const t0   = Date.now();
  const auth = _authHeader();
  if (!auth) return { content: "", encoding: "text", sizeBytes: 0, ok: false, status: 401, durationMs: 0, contentType: "" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      { headers: { Authorization: auth }, signal: controller.signal },
    );
    clearTimeout(timer);
    const contentType = res.headers.get("content-type") ?? "";
    const isBinary = !contentType.startsWith("text/") && !contentType.includes("json") && !contentType.includes("xml");

    let body: string;
    let sizeBytes: number;

    if (isBinary) {
      // Para conteúdo binário (PDF, DOCX, imagens), preserva bytes via arrayBuffer → string binária
      const buffer = await res.arrayBuffer();
      const bytes  = new Uint8Array(buffer);
      body      = Array.from(bytes).map(b => String.fromCharCode(b)).join("");
      sizeBytes = bytes.byteLength;
    } else {
      body      = await res.text();
      sizeBytes = body.length;
    }

    return {
      content:     body,
      encoding:    isBinary ? "base64" : "text",
      sizeBytes,
      ok:          res.ok,
      status:      res.status,
      durationMs:  Date.now() - t0,
      contentType,
    };
  } catch (e) {
    clearTimeout(timer);
    const isAbort = (e as Error).name === "AbortError";
    return { content: isAbort ? "TIMEOUT" : String(e), encoding: "text", sizeBytes: 0, ok: false, status: 0, durationMs: Date.now() - t0, contentType: "" };
  }
}

/** Export a Google Workspace file to the given MIME type. */
export async function exportFile(
  fileId: string,
  exportMime: string,
): Promise<{ content: string; encoding: "text" | "base64"; sizeBytes: number; ok: boolean; status: number; durationMs: number }> {
  await ensureValidToken(WS);
  const t0   = Date.now();
  const auth = _authHeader();
  if (!auth) return { content: "", encoding: "text", sizeBytes: 0, ok: false, status: 401, durationMs: 0 };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`;
    const res = await fetch(url, { headers: { Authorization: auth }, signal: controller.signal });
    clearTimeout(timer);
    const body   = await res.text();
    const isText = exportMime.startsWith("text/") || exportMime.includes("json") || exportMime.includes("xml");
    return { content: body, encoding: isText ? "text" : "base64", sizeBytes: body.length, ok: res.ok, status: res.status, durationMs: Date.now() - t0 };
  } catch (e) {
    clearTimeout(timer);
    const isAbort = (e as Error).name === "AbortError";
    return { content: isAbort ? "TIMEOUT" : String(e), encoding: "text", sizeBytes: 0, ok: false, status: 0, durationMs: Date.now() - t0 };
  }
}

/** Move a file to a different folder (org-02) */
export async function moveFile(
  fileId: string,
  newParentId: string,
  previousParentId?: string,
): Promise<DriveFile> {
  await ensureValidToken(WS);
  const params = new URLSearchParams({ fields: FILE_FIELDS });
  if (newParentId) params.append("addParents", newParentId);
  if (previousParentId) params.append("removeParents", previousParentId);

  const raw = await _driveRequest<Record<string, unknown>>(
    "drive.moveFile",
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );

  return _normalizeFile(raw);
}

/** Upload a file to Google Drive (upload-01) */
export async function uploadFile(
  fileName: string,
  mimeType: string,
  fileContent: ArrayBuffer | Uint8Array | string,
  folderId: string = "root",
): Promise<DriveFile> {
  await ensureValidToken(WS);
  const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=" + FILE_FIELDS;

  // Build multipart body
  const boundary = "memoryos_upload_boundary_" + Date.now();
  const metadata = { name: fileName, mimeType, parents: [folderId] };
  
  // Convert fileContent to Uint8Array if needed
  let contentBytes: Uint8Array;
  if (typeof fileContent === "string") {
    contentBytes = new TextEncoder().encode(fileContent);
  } else if (fileContent instanceof ArrayBuffer) {
    contentBytes = new Uint8Array(fileContent);
  } else {
    contentBytes = fileContent;
  }

  // Build multipart body
  const metadataStr = JSON.stringify(metadata);
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataStr}\r\n`;
  const contentHeaderPart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const endPart = `\r\n--${boundary}--\r\n`;

  // Combine parts
  const metadataBytes = new TextEncoder().encode(metadataPart);
  const contentHeaderBytes = new TextEncoder().encode(contentHeaderPart);
  const endBytes = new TextEncoder().encode(endPart);
  
  const totalLength = metadataBytes.length + contentHeaderBytes.length + contentBytes.length + endBytes.length;
  const body = new Uint8Array(totalLength);
  let offset = 0;
  
  body.set(metadataBytes, offset);
  offset += metadataBytes.length;
  body.set(contentHeaderBytes, offset);
  offset += contentHeaderBytes.length;
  body.set(contentBytes, offset);
  offset += contentBytes.length;
  body.set(endBytes, offset);

  const raw = await _driveRequest<Record<string, unknown>>(
    "drive.uploadFile",
    url,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: body,
    },
  );

  return _normalizeFile(raw);
}

/** Delete a file from Google Drive (delete-01) */
export async function deleteFile(
  fileId: string,
): Promise<void> {
  await ensureValidToken(WS);
  
  await _driveRequest<void>(
    "drive.deleteFile",
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: "DELETE",
    },
  );
}

/** Rename a file or folder in Google Drive (rename-01) */
export async function renameFile(
  fileId: string,
  newName: string,
): Promise<DriveFile> {
  await ensureValidToken(WS);
  const raw = await _driveRequest<Record<string, unknown>>(
    "drive.renameFile",
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    },
  );

  return _normalizeFile(raw);
}

/** Copy a file or folder in Google Drive (copy-01) */
export async function copyFile(
  fileId: string,
  newName?: string,
  parentFolderId?: string,
): Promise<DriveFile> {
  await ensureValidToken(WS);
  const copyBody: Record<string, unknown> = {};
  if (newName) {
    copyBody.name = newName;
  }
  if (parentFolderId) {
    copyBody.parents = [parentFolderId];
  }

  const raw = await _driveRequest<Record<string, unknown>>(
    "drive.copyFile",
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy?fields=${FILE_FIELDS}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: Object.keys(copyBody).length > 0 ? JSON.stringify(copyBody) : undefined,
    },
  );

  return _normalizeFile(raw);
}

// ── Bootstrap on first import ─────────────────────────────────────────────────
bootstrapDriveCapabilities().catch(() => {});