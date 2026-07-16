/**
 * GoogleDriveCapabilityExecutor.ts — Engineering Sprint 7.1
 *
 * Two responsibilities (SRP):
 *   1. buildDriveQuery() — convert natural language intent to Drive API query
 *   2. executeDriveCapability() — IConnector-compatible capability dispatcher
 *
 * Imported by UniversalConnectorRouter (no changes needed in router/registry).
 */

import type { DriveQueryIntent } from "./GoogleDriveTypes";
import { DRIVE_MIME } from "./GoogleDriveTypes";

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

  switch (capabilityId) {
    case "drive.listFiles":
      try {
        const r = await listFiles({ pageSize: (parameters.pageSize as number) ?? 20, folderId: parameters.folderId as string });
        return { ok: true, data: r, error: null };
      } catch (e) { return { ok: false, data: null, error: (e as Error).message }; }

    case "drive.searchFiles":
      try {
        const r = await searchFiles((parameters.query as string) ?? "", { pageSize: (parameters.pageSize as number) ?? 20 });
        return { ok: true, data: r, error: null };
      } catch (e) { return { ok: false, data: null, error: (e as Error).message }; }

    case "drive.readFileMetadata":
      return readFileMetadata((parameters.fileId as string) ?? "");

    case "drive.readFile":
      return readFile((parameters.fileId as string) ?? "", parameters.mimeType as string);

    case "drive.listFolders":
      try {
        const r = await listFolders({ pageSize: (parameters.pageSize as number) ?? 30, parentId: parameters.parentId as string });
        return { ok: r.ok, data: r.data, error: r.error };
      } catch (e) { return { ok: false, data: null, error: (e as Error).message }; }

    default:
      return { ok: false, data: null, error: `Unknown capability: ${capabilityId}` };
  }
}