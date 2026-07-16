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

import type { DriveFile, DriveListResult, DriveFileContent, DriveFolder } from "./GoogleDriveTypes";
import { detectFileType } from "./GoogleDriveTypes";
import { bootstrapDriveCapabilities } from "./GoogleDriveCapabilityRegistry";

const WS  = "default";
const SVC = "drive" as const;

// ── Request ID ────────────────────────────────────────────────────────────────

let _seq = 1;
function _rid() { return `drv-${Date.now()}-${(_seq++).toString().padStart(4, "0")}`; }

// ── Auth header ───────────────────────────────────────────────────────────────

function _authHeader(): string | null {
  const token = getAccessToken(WS);
  return token ? `Bearer ${token}` : null;
}

// ── Raw HTTP fetch with audit + rate limit ─────────────────────────────────────

async function _driveRequest<T>(capability: string, url: string, opts: RequestInit = {}): Promise<T> {
  await GoogleWorkspaceRateLimiter.check(SVC);
  const rid = _rid();
  return GoogleWorkspaceAuditLogger.wrap(SVC, capability, "user", rid, async () => {
    GoogleWorkspaceRateLimiter.consume(SVC);
    const auth = _authHeader();
    if (!auth) throw Object.assign(new Error("Not authenticated"), { code: "NOT_AUTHENTICATED" });
    const res = await fetch(url, { ...opts, headers: { Authorization: auth, ...opts.headers } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw Object.assign(new Error(`Drive API ${res.status}: ${body}`), { code: `HTTP_${res.status}` });
    }
    return res.json() as T;
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
  const conn      = getConnection(WS);
  const connected = isConnected(WS);
  if (!conn)      return { ok: false, reason: "Google Workspace nao conectado" };
  if (!connected) return { ok: false, reason: "Token expirado — necesita refresh" };
  return { ok: true, reason: `Conectado como ${conn.email ?? "usuario"}` };
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

// ── Bootstrap on first import ─────────────────────────────────────────────────
bootstrapDriveCapabilities().catch(() => {});