/**
 * GoogleDriveTypes.ts — Engineering Sprint 7.1
 * Shared types for the Google Drive Connector.
 * Zero dependencies on Core layers.
 */

// ── Drive file types ──────────────────────────────────────────────────────────

export type DriveFileType =
  | "document"
  | "spreadsheet"
  | "presentation"
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "folder"
  | "form"
  | "drawing"
  | "shortcut"
  | "unknown";

export interface DriveFile {
  id:           string;
  name:         string;
  mimeType:     string;
  fileType:     DriveFileType;
  size:         number | null;   // bytes — null for Google Workspace files
  webViewLink:  string | null;
  iconLink:     string | null;
  createdTime:  string | null;   // ISO 8601
  modifiedTime: string | null;
  owners:       string[];        // email addresses
  shared:       boolean;
  starred:      boolean;
  trashed:      boolean;
  parents:      string[];        // folder ids
  description:  string | null;
  thumbnailLink:string | null;
}

export interface DriveFolder {
  id:          string;
  name:        string;
  parents:     string[];
  createdTime: string | null;
  modifiedTime:string | null;
  shared:      boolean;
}

export interface DriveListResult {
  files:          DriveFile[];
  nextPageToken:  string | null;
  totalCount:     number | null;
  searchQuery:    string;
  durationMs:     number;
}

export interface DriveFileContent {
  fileId:      string;
  name:        string;
  mimeType:    string;
  content:     string;   // text content or base64 for binary
  encoding:    "text" | "base64";
  sizeBytes:   number;
}

// ── MIME type constants ───────────────────────────────────────────────────────

export const DRIVE_MIME = Object.freeze({
  FOLDER:        "application/vnd.google-apps.folder",
  DOCUMENT:      "application/vnd.google-apps.document",
  SPREADSHEET:   "application/vnd.google-apps.spreadsheet",
  PRESENTATION:  "application/vnd.google-apps.presentation",
  FORM:          "application/vnd.google-apps.form",
  DRAWING:       "application/vnd.google-apps.drawing",
  SHORTCUT:      "application/vnd.google-apps.shortcut",
  PDF:           "application/pdf",
});

export function detectFileType(mimeType: string): DriveFileType {
  if (mimeType === DRIVE_MIME.FOLDER)       return "folder";
  if (mimeType === DRIVE_MIME.DOCUMENT)     return "document";
  if (mimeType === DRIVE_MIME.SPREADSHEET)  return "spreadsheet";
  if (mimeType === DRIVE_MIME.PRESENTATION) return "presentation";
  if (mimeType === DRIVE_MIME.FORM)         return "form";
  if (mimeType === DRIVE_MIME.DRAWING)      return "drawing";
  if (mimeType === DRIVE_MIME.SHORTCUT)     return "shortcut";
  if (mimeType === DRIVE_MIME.PDF)          return "pdf";
  if (mimeType.startsWith("image/"))        return "image";
  if (mimeType.startsWith("video/"))        return "video";
  if (mimeType.startsWith("audio/"))        return "audio";
  return "unknown";
}

// ── Natural language query intent ─────────────────────────────────────────────

export interface DriveQueryIntent {
  rawQuery:    string;
  nameHint:    string | null;   // file name hint extracted
  fileType:    string | null;   // "pdf", "spreadsheet", etc.
  timeRange:   "today" | "week" | "month" | null;
  inFolders:   boolean;
  fullText:    string | null;   // for full-text search
}