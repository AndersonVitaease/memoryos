/**
 * DriveActionResolver.ts — Sprint P-01.2
 *
 * Resolves the fileId for any Drive action operation.
 * Lives ONLY during a single intent execution — no persistent state.
 *
 * Responsibilities:
 *   1. Hold the selectedFile context for the current execution
 *   2. Resolve fileId from search results (EF-2)
 *   3. Guard against empty fileId calls (EF-10)
 *   4. Select automatically when 1 result (EF-4)
 *   5. Request clarification when >1 result (EF-5)
 *   6. Determine download strategy by MIME type (EF-6)
 *   7. Structured logging (EF-9)
 */

import type { DriveFile, DriveListResult } from "./GoogleDriveTypes";
import { DRIVE_MIME } from "./GoogleDriveTypes";

// ── Selected file context (execution-scoped, not persisted) ───────────────────

export interface SelectedFile {
  id:           string;
  name:         string;
  mimeType:     string;
  parents:      string[];
  webViewLink:  string | null;
  createdTime:  string | null;
  modifiedTime: string | null;
  owners:       string[];
}

// ── Resolution result ─────────────────────────────────────────────────────────

export type ResolveStatus =
  | "RESOLVED"          // single unambiguous file selected
  | "AMBIGUOUS"         // multiple results — needs clarification
  | "NOT_FOUND"         // search returned 0 results
  | "NO_FILE_SELECTED"; // fileId guard triggered

export interface ResolveResult {
  status:         ResolveStatus;
  selectedFile:   SelectedFile | null;
  candidates:     SelectedFile[];  // populated when AMBIGUOUS
  clarification:  string | null;   // human-readable question when AMBIGUOUS
  error:          string | null;
}

// ── Download strategy by MIME type (EF-6) ────────────────────────────────────

export type DownloadStrategy = "export_text" | "export_docx" | "media";

export interface DownloadConfig {
  strategy:   DownloadStrategy;
  exportMime: string;  // target MIME for export
}

const GOOGLE_WORKSPACE_EXPORT: Record<string, string> = {
  [DRIVE_MIME.DOCUMENT]:     "text/plain",
  [DRIVE_MIME.SPREADSHEET]:  "text/csv",
  [DRIVE_MIME.PRESENTATION]: "text/plain",
  [DRIVE_MIME.DRAWING]:      "image/svg+xml",
  [DRIVE_MIME.FORM]:         "application/zip",
};

export function getDownloadConfig(mimeType: string): DownloadConfig {
  if (GOOGLE_WORKSPACE_EXPORT[mimeType]) {
    return { strategy: "export_text", exportMime: GOOGLE_WORKSPACE_EXPORT[mimeType] };
  }
  // All other files (PDF, images, ZIP, binary) — direct media download
  return { strategy: "media", exportMime: mimeType };
}

// ── Logger (EF-9) ─────────────────────────────────────────────────────────────

export function driveLog(phase: string, data: Record<string, unknown>): void {
  console.log(`[DriveActionResolver][${phase}]`, JSON.stringify(data, null, 2));
}

// ── Guards (EF-10) ────────────────────────────────────────────────────────────

export function assertFileId(fileId: string | null | undefined, operation: string): void {
  if (!fileId || fileId.trim() === "") {
    const err = Object.assign(
      new Error(`NO_FILE_SELECTED — ${operation} requires a fileId. Run a search first.`),
      { code: "NO_FILE_SELECTED", operation },
    );
    driveLog("GUARD_VIOLATION", { operation, fileId: fileId ?? null });
    throw err;
  }
}

// ── Core resolver ─────────────────────────────────────────────────────────────

export function resolveFromSearchResult(
  searchResult: DriveListResult,
  intent: string,
): ResolveResult {
  const files = searchResult.files ?? [];

  driveLog("SEARCH", { intent, resultCount: files.length, query: searchResult.searchQuery });

  if (files.length === 0) {
    driveLog("NOT_FOUND", { intent });
    return {
      status: "NOT_FOUND",
      selectedFile: null,
      candidates: [],
      clarification: null,
      error: `Nenhum arquivo encontrado para: "${intent}"`,
    };
  }

  // EF-4: single result — auto-select
  if (files.length === 1) {
    const f = toSelectedFile(files[0]);
    driveLog("SELECTED", { intent, fileId: f.id, name: f.name, mimeType: f.mimeType });
    return {
      status: "RESOLVED",
      selectedFile: f,
      candidates: [f],
      clarification: null,
      error: null,
    };
  }

  // EF-5: multiple results — request clarification
  const candidates = files.slice(0, 10).map(toSelectedFile);
  const list = candidates.map((c, i) => `${i + 1}. ${c.name} (${describeType(c.mimeType)})`).join("\n");
  const clarification = `Encontrei ${files.length} arquivo(s). Qual deseja abrir?\n\n${list}`;

  driveLog("AMBIGUOUS", { intent, count: files.length, candidates: candidates.map(c => c.name) });

  return {
    status: "AMBIGUOUS",
    selectedFile: null,
    candidates,
    clarification,
    error: null,
  };
}

// ── Select by index from candidates ──────────────────────────────────────────

export function selectCandidate(candidates: SelectedFile[], index: number): ResolveResult {
  if (index < 0 || index >= candidates.length) {
    return {
      status: "NOT_FOUND",
      selectedFile: null,
      candidates,
      clarification: null,
      error: `Opção ${index + 1} inválida — escolha entre 1 e ${candidates.length}`,
    };
  }
  const f = candidates[index];
  driveLog("CANDIDATE_SELECTED", { fileId: f.id, name: f.name, index });
  return {
    status: "RESOLVED",
    selectedFile: f,
    candidates,
    clarification: null,
    error: null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toSelectedFile(f: DriveFile): SelectedFile {
  return {
    id:           f.id,
    name:         f.name,
    mimeType:     f.mimeType,
    parents:      f.parents,
    webViewLink:  f.webViewLink,
    createdTime:  f.createdTime,
    modifiedTime: f.modifiedTime,
    owners:       f.owners,
  };
}

function describeType(mimeType: string): string {
  const map: Record<string, string> = {
    [DRIVE_MIME.DOCUMENT]:     "Google Docs",
    [DRIVE_MIME.SPREADSHEET]:  "Google Sheets",
    [DRIVE_MIME.PRESENTATION]: "Google Slides",
    [DRIVE_MIME.PDF]:          "PDF",
    [DRIVE_MIME.FOLDER]:       "Pasta",
  };
  if (map[mimeType]) return map[mimeType];
  if (mimeType.startsWith("image/")) return "Imagem";
  return mimeType;
}