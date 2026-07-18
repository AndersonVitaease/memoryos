/**
 * GoogleDriveAdapter.ts — Universal Connector Runtime v1.0
 * Sprint EF-6.4.0
 *
 * Google Drive is now just an Adapter over the UCR.
 * It knows: Drive API endpoints, query params, response shapes.
 * It does NOT know: auth, retry, circuit breaker, rate limiting, metrics.
 *
 * Self-registers with UCRRegistry on import (Plugin Model).
 */

import type { ConnectorAdapter, UCRRequest, UCRResponse } from "../UCRTypes";
import { UCRRuntime } from "../UCRRuntime";

const BASE = "https://www.googleapis.com/drive/v3";
const FILE_FIELDS = "id,name,mimeType,size,webViewLink,iconLink,createdTime,modifiedTime,owners(emailAddress),shared,starred,trashed,parents,description,thumbnailLink";

// ── Operations ────────────────────────────────────────────────────────────────

const OPS = {
  LIST:          "drive.files.list",
  SEARCH:        "drive.files.search",
  SEARCH_BY_NAME:"drive.files.searchByName",
  METADATA:      "drive.files.metadata",
  MEDIA:         "drive.files.media",
  EXPORT:        "drive.files.export",
  LIST_FOLDERS:  "drive.folders.list",
} as const;

// ── Adapter implementation ────────────────────────────────────────────────────

export const GoogleDriveAdapter: ConnectorAdapter = {
  id:   "google-drive",
  name: "Google Drive",
  capabilities: [
    OPS.LIST,
    OPS.SEARCH,
    OPS.SEARCH_BY_NAME,
    OPS.METADATA,
    OPS.MEDIA,
    OPS.EXPORT,
    OPS.LIST_FOLDERS,
  ],

  buildRequest(operation: string, params: Record<string, unknown>, token: string): UCRRequest {
    const auth = { Authorization: `Bearer ${token}` };

    switch (operation) {

      case OPS.LIST: {
        const folderId = params.folderId as string | undefined;
        const q        = folderId ? `'${folderId}' in parents and trashed=false` : "trashed=false";
        const sp = new URLSearchParams({
          q,
          pageSize: String((params.pageSize as number) ?? 20),
          fields:   `nextPageToken,files(${FILE_FIELDS})`,
          orderBy:  (params.orderBy as string) ?? "modifiedTime desc",
          ...(params.pageToken ? { pageToken: params.pageToken as string } : {}),
        });
        return { operation, url: `${BASE}/files?${sp}`, headers: auth };
      }

      case OPS.SEARCH:
      case OPS.SEARCH_BY_NAME: {
        const q = (params.q as string) ?? `name contains '${String(params.name ?? "").replace(/'/g, "\\'")}' and trashed=false`;
        const sp = new URLSearchParams({
          q,
          pageSize: String((params.pageSize as number) ?? 20),
          fields:   `nextPageToken,files(${operation === OPS.SEARCH_BY_NAME ? "id,name,mimeType,modifiedTime" : `${FILE_FIELDS}`})`,
          orderBy:  "modifiedTime desc",
          ...(params.pageToken ? { pageToken: params.pageToken as string } : {}),
        });
        return { operation, url: `${BASE}/files?${sp}`, headers: auth };
      }

      case OPS.METADATA: {
        const fileId = encodeURIComponent(params.fileId as string);
        const fields = (params.fields as string) ?? FILE_FIELDS;
        const sp = new URLSearchParams({ fields });
        return { operation, url: `${BASE}/files/${fileId}?${sp}`, headers: auth };
      }

      case OPS.MEDIA: {
        const fileId = encodeURIComponent(params.fileId as string);
        return { operation, url: `${BASE}/files/${fileId}?alt=media`, headers: auth };
      }

      case OPS.EXPORT: {
        const fileId = encodeURIComponent(params.fileId as string);
        const mime   = encodeURIComponent(params.mimeType as string);
        return { operation, url: `${BASE}/files/${fileId}/export?mimeType=${mime}`, headers: auth };
      }

      case OPS.LIST_FOLDERS: {
        const parentQ = params.parentId ? ` and '${params.parentId}' in parents` : "";
        const q = `mimeType='application/vnd.google-apps.folder' and trashed=false${parentQ}`;
        const sp = new URLSearchParams({
          q,
          pageSize: String((params.pageSize as number) ?? 30),
          fields:   "files(id,name,parents,createdTime,modifiedTime,shared)",
          orderBy:  "name",
        });
        return { operation, url: `${BASE}/files?${sp}`, headers: auth };
      }

      default:
        throw new Error(`GoogleDriveAdapter: unknown operation "${operation}"`);
    }
  },

  parseResponse<T>(operation: string, response: UCRResponse): T {
    // For media/export, data is already the raw text; return as-is
    if (operation === OPS.MEDIA || operation === OPS.EXPORT) {
      return response.rawText as unknown as T;
    }
    // For JSON responses, data was already parsed by the pipeline
    return (response.data ?? response.rawText) as T;
  },
};

// ── Self-register (Plugin Model) ──────────────────────────────────────────────
// Importing this module automatically registers the adapter.
UCRRuntime.register(GoogleDriveAdapter);

// ── Convenience facade (used by GoogleDriveConnector) ─────────────────────────
// These replace the internal _driveRequest() calls.

export async function ucrDriveRequest<T>(
  operation: string,
  params: Record<string, unknown>,
  token: string,
): Promise<{ ok: boolean; data: T | null; rawText: string; durationMs: number }> {
  const res = await UCRRuntime.execute<T>("google-drive", operation, params, token);
  return { ok: res.ok, data: res.data, rawText: res.rawText, durationMs: res.durationMs };
}