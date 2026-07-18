/**
 * GoogleDriveCapabilityExecutor.ts — Sprint P-01.2 (extends Sprint 7.1)
 *
 * Responsibilities:
 *   1. buildDriveQuery() — convert natural language intent to Drive API query
 *   2. executeDriveCapability() — IConnector-compatible capability dispatcher
 *      with fileId resolution via DriveActionResolver (EF-1..EF-10)
 */

import type { DriveQueryIntent } from "./GoogleDriveTypes";
import { DRIVE_MIME } from "./GoogleDriveTypes";
import {
  resolveFromSearchResult,
  assertFileId,
  getDownloadConfig,
  driveLog,
  type SelectedFile,
} from "./DriveActionResolver";

// ── Natural Language → Drive Query ────────────────────────────────────────────

const FILE_TYPE_MAP: Array<[RegExp, string]> = [
  [/\b(pdf|pdfs)\b/i,              `mimeType='${DRIVE_MIME.PDF}'`],
  [/\b(doc|docs|documentos?|word)\b/i,    `mimeType='${DRIVE_MIME.DOCUMENT}'`],
  [/\b(planilha|sheets?|excel)\b/i, `mimeType='${DRIVE_MIME.SPREADSHEET}'`],
  [/\b(apresenta|slides?|ppt)\b/i, `mimeType='${DRIVE_MIME.PRESENTATION}'`],
  [/\b(form|formulari)\b/i,        `mimeType='${DRIVE_MIME.FORM}'`],
  [/\b(pasta|pastas|folders?)\b/i, `mimeType='${DRIVE_MIME.FOLDER}'`],
  [/\b(imagens?|fotos?|photos?)\b/i, "mimeType contains 'image/'"],
];

const TIME_MAP: Array<[RegExp, string]> = [
  [/\b(hoje|today)\b/i,            () => { const d = new Date(); d.setHours(0,0,0,0); return `modifiedTime >= '${d.toISOString()}'`; }],
  [/\b(semana|week|esta semana)\b/i, () => { const d = new Date(Date.now() - 7*86400_000); return `modifiedTime >= '${d.toISOString()}'`; }],
  [/\b(m[eê]s|month|este m[eê]s)\b/i, () => { const d = new Date(Date.now() - 30*86400_000); return `modifiedTime >= '${d.toISOString()}'`; }],
] as Array<[RegExp, string | (() => string)]>;

export function parseIntent(rawQuery: string): DriveQueryIntent {
  let nameHint:  string | null = null;
  let fileType:  string | null = null;
  let timeRange: "today" | "week" | "month" | null = null;
  const inFolders = /\b(pasta|folder)\b/i.test(rawQuery);

  // Check time intent
  if (/\bhoje|today\b/i.test(rawQuery))              timeRange = "today";
  else if (/\bsemana|week|esta semana\b/i.test(rawQuery)) timeRange = "week";
  else if (/\bm[eê]s|month\b/i.test(rawQuery))      timeRange = "month";

  // Check file type
  for (const [re, mime] of FILE_TYPE_MAP) {
    if (re.test(rawQuery)) { fileType = mime; break; }
  }

  // Extract name hint — words after "procure|encontre|abra|mostre|arquivo|documento"
  const nameMatch = rawQuery.match(
    /(?:procure|encontre|abra|mostre|pesquise|busque|arquivo|documento|planilha|contrato|or[cç]amento)\s+(.+)/i
  );
  if (nameMatch) {
    nameHint = nameMatch[1].trim().replace(/['"]/g, "");
  }

  // Full-text hint for "contendo"
  const fullMatch = rawQuery.match(/\bcontendo\s+(.+)/i);
  const fullText  = fullMatch ? fullMatch[1].trim() : null;

  return { rawQuery, nameHint, fileType, timeRange, inFolders, fullText };
}

export function buildDriveQuery(rawQuery: string): string {
  const intent = parseIntent(rawQuery);
  const parts: string[] = ["trashed=false"];

  if (intent.fileType) {
    // e.g. mimeType='...' or mimeType contains '...'
    parts.push(intent.fileType);
  }

  if (intent.nameHint) {
    parts.push(`name contains '${intent.nameHint.replace(/'/g, "\\'")}'`);
  }

  if (intent.fullText) {
    parts.push(`fullText contains '${intent.fullText.replace(/'/g, "\\'")}'`);
  }

  // Time range
  if (intent.timeRange === "today") {
    const d = new Date(); d.setHours(0,0,0,0);
    parts.push(`modifiedTime >= '${d.toISOString()}'`);
  } else if (intent.timeRange === "week") {
    parts.push(`modifiedTime >= '${new Date(Date.now() - 7*86400_000).toISOString()}'`);
  } else if (intent.timeRange === "month") {
    parts.push(`modifiedTime >= '${new Date(Date.now() - 30*86400_000).toISOString()}'`);
  }

  return parts.join(" and ");
}

// ── Capability dispatcher ─────────────────────────────────────────────────────

export async function executeDriveCapability(
  capabilityId: string,
  parameters: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown; error: string | null }> {
  const { listFiles, searchFiles, readFileMetadata, readFile, listFolders } =
    await import("./GoogleDriveConnector");

  driveLog("INTENT", { capabilityId, parameters });

  switch (capabilityId) {
    // ── Read-only list / search ──────────────────────────────────────────────

    case "drive.listFiles":
      try {
        const r = await listFiles({ pageSize: (parameters.pageSize as number) ?? 20, folderId: parameters.folderId as string });
        driveLog("SEARCH", { capabilityId, resultCount: r.files.length });
        return { ok: true, data: r, error: null };
      } catch (e) { return { ok: false, data: null, error: (e as Error).message }; }

    case "drive.searchFiles":
      try {
        const r = await searchFiles((parameters.query as string) ?? "", { pageSize: (parameters.pageSize as number) ?? 20 });
        driveLog("SEARCH", { capabilityId, resultCount: r.files.length });
        return { ok: true, data: r, error: null };
      } catch (e) { return { ok: false, data: null, error: (e as Error).message }; }

    case "drive.listFolders":
      try {
        const r = await listFolders({ pageSize: (parameters.pageSize as number) ?? 30, parentId: parameters.parentId as string });
        return { ok: r.ok, data: r.data, error: r.error };
      } catch (e) { return { ok: false, data: null, error: (e as Error).message }; }

    // ── Search + resolve + action (EF-1..EF-5) ──────────────────────────────

    case "drive.openFile":
    case "drive.readFileMetadata": {
      // If fileId explicitly provided — use it directly
      const explicitId = (parameters.fileId as string | undefined)?.trim();
      if (explicitId) {
        assertFileId(explicitId, capabilityId);
        driveLog("SELECTED", { source: "explicit", fileId: explicitId });
        return readFileMetadata(explicitId);
      }

      // Otherwise: search → resolve → get metadata (EF-3, EF-4, EF-5)
      const query = (parameters.query as string) ?? (parameters.name as string) ?? "";
      if (!query) {
        return { ok: false, data: { code: "NO_FILE_SELECTED" }, error: "NO_FILE_SELECTED — fileId or query is required for openFile" };
      }
      const searchResult = await searchFiles(query, { pageSize: 20 });
      const resolution   = resolveFromSearchResult(searchResult, query);

      if (resolution.status === "NOT_FOUND") return { ok: false, data: null, error: resolution.error };
      if (resolution.status === "AMBIGUOUS") return { ok: true, data: { ambiguous: true, clarification: resolution.clarification, candidates: resolution.candidates }, error: null };

      assertFileId(resolution.selectedFile!.id, capabilityId);
      driveLog("OPERATION", { operation: capabilityId, fileId: resolution.selectedFile!.id, name: resolution.selectedFile!.name });
      return readFileMetadata(resolution.selectedFile!.id);
    }

    case "drive.readFile":
    case "drive.downloadFile":
    case "drive.readDocument":
    case "drive.exportFile": {
      // If fileId explicitly provided — use it directly (EF-10: guard)
      const explicitId = (parameters.fileId as string | undefined)?.trim();
      if (explicitId) {
        assertFileId(explicitId, capabilityId);
      }

      const fileId = explicitId ?? await (async () => {
        // Search → resolve → get fileId (EF-3, EF-4, EF-5)
        const query = (parameters.query as string) ?? (parameters.name as string) ?? "";
        if (!query) return null;
        const sr         = await searchFiles(query, { pageSize: 20 });
        const resolution = resolveFromSearchResult(sr, query);
        if (resolution.status !== "RESOLVED") return null;
        return resolution.selectedFile!.id;
      })();

      // EF-10: guard — never call API without fileId
      if (!fileId || fileId.trim() === "") {
        driveLog("GUARD_VIOLATION", { operation: capabilityId, fileId: null });
        return { ok: false, data: { code: "NO_FILE_SELECTED" }, error: "NO_FILE_SELECTED — could not resolve fileId. Provide fileId or a search query." };
      }

      driveLog("OPERATION", { operation: capabilityId, fileId });

      // EF-6: determine download strategy by MIME type
      // First get metadata to know the mimeType if not provided
      const mimeType = (parameters.mimeType as string | undefined);
      if (mimeType) {
        const dlConfig = getDownloadConfig(mimeType);
        driveLog("DOWNLOAD", { fileId, mimeType, strategy: dlConfig.strategy, exportMime: dlConfig.exportMime });
        // EF-7: delegate to existing readFile which already handles GWS export vs media
        const result = await readFile(fileId, dlConfig.exportMime);
        driveLog("PARSER", { fileId, ok: result.ok, sizeBytes: result.data?.sizeBytes ?? 0 });
        return result;
      }

      // No mimeType provided — fetch metadata first, then read with correct strategy
      const meta = await readFileMetadata(fileId);
      if (!meta.ok || !meta.data) return { ok: false, data: null, error: `File not found: ${fileId}` };

      const dlConfig = getDownloadConfig(meta.data.mimeType);
      driveLog("DOWNLOAD", { fileId, mimeType: meta.data.mimeType, strategy: dlConfig.strategy, exportMime: dlConfig.exportMime });
      const result = await readFile(fileId, dlConfig.exportMime);
      driveLog("PARSER", { fileId, name: meta.data.name, ok: result.ok, sizeBytes: result.data?.sizeBytes ?? 0 });
      driveLog("RESPONSE", { fileId, name: meta.data.name, ok: result.ok });
      return result;
    }

    default:
      return { ok: false, data: null, error: `Unknown capability: ${capabilityId}` };
  }
}