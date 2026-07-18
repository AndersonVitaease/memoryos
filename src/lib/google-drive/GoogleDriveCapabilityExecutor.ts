/**
 * GoogleDriveCapabilityExecutor.ts — Sprint P-01.2 (Bug Fix)
 *
 * Responsibilities:
 *   1. buildDriveQuery() — convert natural language intent to Drive API query
 *   2. executeDriveCapability() — IConnector-compatible capability dispatcher
 *
 * Sprint P-01.2 fix: fileId is now resolved from search results via private
 * helper functions. The Google Drive API is NEVER called with an empty fileId.
 */

import type { DriveQueryIntent, DriveListResult } from "./GoogleDriveTypes";
import { DRIVE_MIME } from "./GoogleDriveTypes";

// ── Private types ─────────────────────────────────────────────────────────────

type CapResult = { ok: boolean; data: unknown; error: string | null };

interface ResolvedFile {
  id:       string;
  name:     string;
  mimeType: string;
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Guard: never allow empty/null/undefined fileId to reach the Drive API. */
function validateFileId(fileId: string | null | undefined): CapResult | null {
  if (!fileId || fileId.trim() === "") {
    return { ok: false, data: { code: "NO_FILE_SELECTED" }, error: "NO_FILE_SELECTED — fileId is required" };
  }
  return null; // valid — no error
}

/**
 * Resolve a single file from search results.
 * - 0 results  → { status: "NOT_FOUND" }
 * - 1 result   → { status: "RESOLVED", file }
 * - 2+ results → { status: "AMBIGUOUS", requiresSelection, files }
 */
function resolveSingleSearchResult(
  searchResult: DriveListResult,
  intent: string,
): { status: "RESOLVED"; file: ResolvedFile }
 | { status: "NOT_FOUND"; error: string }
 | { status: "AMBIGUOUS"; requiresSelection: true; files: ResolvedFile[]; clarification: string } {
  const files = searchResult.files ?? [];

  if (files.length === 0) {
    return { status: "NOT_FOUND", error: `No file found for: "${intent}"` };
  }

  if (files.length === 1) {
    const f = files[0];
    return { status: "RESOLVED", file: { id: f.id, name: f.name, mimeType: f.mimeType } };
  }

  // 2+ results — cannot auto-select
  const candidates = files.slice(0, 10).map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType }));
  const list = candidates.map((f, i) => `${i + 1}. ${f.name}`).join("\n");
  return {
    status: "AMBIGUOUS",
    requiresSelection: true,
    files: candidates,
    clarification: `Found ${files.length} file(s). Which do you want to open?\n\n${list}`,
  };
}

/** Google Workspace MIME types that require export rather than direct media download. */
const GWS_EXPORT: Record<string, string> = {
  [DRIVE_MIME.DOCUMENT]:     "text/plain",
  [DRIVE_MIME.SPREADSHEET]:  "text/csv",
  [DRIVE_MIME.PRESENTATION]: "text/plain",
  [DRIVE_MIME.DRAWING]:      "image/svg+xml",
  [DRIVE_MIME.FORM]:         "application/zip",
};

function resolveExportMime(mimeType: string): string {
  return GWS_EXPORT[mimeType] ?? mimeType;
}

// ── Natural Language → Drive Query ────────────────────────────────────────────

const FILE_TYPE_MAP: Array<[RegExp, string]> = [
  [/\b(pdf|pdfs)\b/i,                    `mimeType='${DRIVE_MIME.PDF}'`],
  [/\b(doc|docs|documentos?|word)\b/i,   `mimeType='${DRIVE_MIME.DOCUMENT}'`],
  [/\b(planilha|sheets?|excel)\b/i,      `mimeType='${DRIVE_MIME.SPREADSHEET}'`],
  [/\b(apresenta|slides?|ppt)\b/i,       `mimeType='${DRIVE_MIME.PRESENTATION}'`],
  [/\b(form|formulari)\b/i,              `mimeType='${DRIVE_MIME.FORM}'`],
  [/\b(pasta|pastas|folders?)\b/i,       `mimeType='${DRIVE_MIME.FOLDER}'`],
  [/\b(imagens?|fotos?|photos?)\b/i,     "mimeType contains 'image/'"],
];

export function parseIntent(rawQuery: string): DriveQueryIntent {
  let nameHint:  string | null = null;
  let fileType:  string | null = null;
  let timeRange: "today" | "week" | "month" | null = null;
  const inFolders = /\b(pasta|folder)\b/i.test(rawQuery);

  if (/\bhoje|today\b/i.test(rawQuery))               timeRange = "today";
  else if (/\bsemana|week|esta semana\b/i.test(rawQuery)) timeRange = "week";
  else if (/\bm[eê]s|month\b/i.test(rawQuery))       timeRange = "month";

  for (const [re, mime] of FILE_TYPE_MAP) {
    if (re.test(rawQuery)) { fileType = mime; break; }
  }

  const nameMatch = rawQuery.match(
    /(?:procure|encontre|abra|mostre|pesquise|busque|arquivo|documento|planilha|contrato|or[cç]amento)\s+(.+)/i,
  );
  if (nameMatch) nameHint = nameMatch[1].trim().replace(/['"]/g, "");

  const fullMatch = rawQuery.match(/\bcontendo\s+(.+)/i);
  const fullText  = fullMatch ? fullMatch[1].trim() : null;

  return { rawQuery, nameHint, fileType, timeRange, inFolders, fullText };
}

export function buildDriveQuery(rawQuery: string): string {
  const intent = parseIntent(rawQuery);
  const parts: string[] = ["trashed=false"];

  if (intent.fileType) parts.push(intent.fileType);
  if (intent.nameHint) parts.push(`name contains '${intent.nameHint.replace(/'/g, "\\'")}'`);
  if (intent.fullText) parts.push(`fullText contains '${intent.fullText.replace(/'/g, "\\'")}'`);

  if (intent.timeRange === "today") {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    parts.push(`modifiedTime >= '${d.toISOString()}'`);
  } else if (intent.timeRange === "week") {
    parts.push(`modifiedTime >= '${new Date(Date.now() - 7 * 86400_000).toISOString()}'`);
  } else if (intent.timeRange === "month") {
    parts.push(`modifiedTime >= '${new Date(Date.now() - 30 * 86400_000).toISOString()}'`);
  }

  return parts.join(" and ");
}

// ── Capability dispatcher ─────────────────────────────────────────────────────

export async function executeDriveCapability(
  capabilityId: string,
  parameters: Record<string, unknown>,
): Promise<CapResult> {
  const { listFiles, searchFiles, readFileMetadata, readFile, listFolders } =
    await import("./GoogleDriveConnector");

  switch (capabilityId) {

    // ── List / search (no fileId needed) ──────────────────────────────────────

    case "drive.listFiles": {
      const r = await listFiles({ pageSize: (parameters.pageSize as number) ?? 20, folderId: parameters.folderId as string });
      return { ok: true, data: r, error: null };
    }

    case "drive.searchFiles": {
      const r = await searchFiles((parameters.query as string) ?? "", { pageSize: (parameters.pageSize as number) ?? 20 });
      return { ok: true, data: r, error: null };
    }

    case "drive.listFolders": {
      const r = await listFolders({ pageSize: (parameters.pageSize as number) ?? 30, parentId: parameters.parentId as string });
      return { ok: r.ok, data: r.data, error: r.error };
    }

    // ── Open / read metadata ───────────────────────────────────────────────────

    case "drive.openFile":
    case "drive.readFileMetadata": {
      // Explicit fileId path
      const explicitId = (parameters.fileId as string | undefined)?.trim();
      if (explicitId) {
        const guard = validateFileId(explicitId);
        if (guard) return guard;
        return readFileMetadata(explicitId);
      }

      // Search → resolve
      const query = ((parameters.query as string) ?? (parameters.name as string) ?? "").trim();
      if (!query) return { ok: false, data: { code: "NO_FILE_SELECTED" }, error: "NO_FILE_SELECTED — provide fileId or query" };

      const sr  = await searchFiles(query, { pageSize: 20 });
      const res = resolveSingleSearchResult(sr, query);

      if (res.status === "NOT_FOUND") return { ok: false, data: null, error: res.error };
      if (res.status === "AMBIGUOUS") return { ok: true,  data: { requiresSelection: true, clarification: res.clarification, files: res.files }, error: null };

      // RESOLVED — file.id is guaranteed non-empty by resolveSingleSearchResult
      return readFileMetadata(res.file.id);
    }

    // ── Download / read file content ───────────────────────────────────────────

    case "drive.readFile":
    case "drive.downloadFile":
    case "drive.readDocument":
    case "drive.exportFile": {
      // Resolve fileId — explicit takes priority
      let fileId = (parameters.fileId as string | undefined)?.trim() ?? "";

      if (!fileId) {
        // Search → resolve
        const query = ((parameters.query as string) ?? (parameters.name as string) ?? "").trim();
        if (!query) return { ok: false, data: { code: "NO_FILE_SELECTED" }, error: "NO_FILE_SELECTED — provide fileId or query" };

        const sr  = await searchFiles(query, { pageSize: 20 });
        const res = resolveSingleSearchResult(sr, query);

        if (res.status === "NOT_FOUND") return { ok: false, data: null, error: res.error };
        if (res.status === "AMBIGUOUS") return { ok: true,  data: { requiresSelection: true, clarification: res.clarification, files: res.files }, error: null };

        fileId = res.file.id;
      }

      // Guard — never call Drive API with empty fileId
      const guard = validateFileId(fileId);
      if (guard) return guard;

      // Determine export MIME — use metadata if not provided
      const mimeType = (parameters.mimeType as string | undefined)?.trim();
      if (mimeType) {
        return readFile(fileId, resolveExportMime(mimeType));
      }

      const meta = await readFileMetadata(fileId);
      if (!meta.ok || !meta.data) return { ok: false, data: null, error: `File not found: ${fileId}` };

      return readFile(fileId, resolveExportMime(meta.data.mimeType));
    }

    default:
      return { ok: false, data: null, error: `Unknown capability: ${capabilityId}` };
  }
}