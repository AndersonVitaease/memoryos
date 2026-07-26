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
  /** IA-028: link de download direto */
  webContentLink: string | null;
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
  console.log(`[DriveActionResolver][${phase}]`,
