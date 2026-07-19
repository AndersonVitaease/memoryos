/**
 * GoogleDriveContextBuilder.ts
 *
 * Google Drive implementation of IConnectorContextBuilder.
 *
 * Responsibilities:
 *   - Define DriveFileEntry and DriveConnectorContext types (Drive-specific).
 *   - Implement build(output) to extract files from any Drive step output
 *     (list, search, get, downloadFile).
 *   - Register itself in ConnectorContextBuilderRegistry on import.
 *
 * Consumers:
 *   - ConnectorResultSynthesizer triggers this via the registry (no direct import).
 *   - DriveDownloadExecutor imports readDriveContext() to read its own slot.
 *   - updateDriveSelection() lets callers change the active selection before download.
 *
 * SRP: sole responsibility is Drive context building and reading.
 * Zero platform-core imports beyond the two registry contracts.
 */

import type { BaseConnectorContext }   from "../ConnectorContextStore";
import type { IConnectorContextBuilder } from "../ConnectorContextBuilderRegistry";
import { registerContextBuilder }       from "../ConnectorContextBuilderRegistry";

// ── Drive-specific types ──────────────────────────────────────────────────────

/**
 * A file entry from any Drive list/search/get operation.
 * mimeType is metadata only — never used as a search predicate.
 * The connector always searches across all file types.
 */
export interface DriveFileEntry {
  id:       string;
  name:     string;
  mimeType: string;
}

/**
 * Drive connector context stored in ConversationState.connectorContexts["google-drive"].
 *
 * selectedIndex is the user's current selection within files[].
 * Defaults to 0 (first file presented) and can be updated via updateDriveSelection()
 * when the user says "o terceiro", "esse", "o contrato", "aquele", etc.
 */
export interface DriveConnectorContext extends BaseConnectorContext {
  connectorId:      "google-drive";
  files:            DriveFileEntry[];
  selectedIndex:    number;
  selectedFileId:   string;
  selectedFileName: string;
}

// ── Pure factory helpers ──────────────────────────────────────────────────────

function _makeContext(files: DriveFileEntry[], selectedIndex: number): DriveConnectorContext {
  const idx  = Math.max(0, Math.min(selectedIndex, files.length - 1));
  const file = files[idx] ?? files[0];
  return Object.freeze<DriveConnectorContext>({
    connectorId:      "google-drive",
    files:            Object.freeze([...files]) as DriveFileEntry[],
    selectedIndex:    idx,
    selectedFileId:   file?.id   ?? "",
    selectedFileName: file?.name ?? "",
    updatedAt:        Date.now(),
  });
}

/**
 * Return an updated DriveConnectorContext reflecting a new user selection.
 * Call this when the user refers to a specific file by ordinal or name
 * ("o terceiro", "o contrato", "aquele") before executing the download.
 */
export function updateDriveSelection(
  ctx: DriveConnectorContext,
  newIndex: number,
): DriveConnectorContext {
  return _makeContext([...ctx.files], newIndex);
}

/**
 * Safely narrow a BaseConnectorContext to DriveConnectorContext.
 * Returns null when the context is absent or belongs to a different connector.
 */
export function readDriveContext(
  ctx: BaseConnectorContext | undefined | null,
): DriveConnectorContext | null {
  if (!ctx || ctx.connectorId !== "google-drive") return null;
  return ctx as DriveConnectorContext;
}

// ── Builder implementation ────────────────────────────────────────────────────

const GoogleDriveContextBuilder: IConnectorContextBuilder = {
  connectorId: "google-drive",

  build(output: Record<string, unknown>): DriveConnectorContext | null {
    // Case 1: list / search result — output.files is an array
    const rawFiles = output.files;
    if (Array.isArray(rawFiles) && rawFiles.length > 0) {
      const files: DriveFileEntry[] = (rawFiles as Record<string, unknown>[])
        .map((f) => ({
          id:       String(f.id       ?? ""),
          name:     String(f.name     ?? ""),
          mimeType: String(f.mimeType ?? ""),
        }))
        .filter((f) => f.id.length > 0);

      if (files.length > 0) return _makeContext(files, 0);
    }

    // Case 2: single-file result — drive.files.get / drive.downloadFile
    const singleId   = String(output.fileId ?? output.id   ?? "");
    const singleName = String(output.fileName ?? output.name ?? "");
    const singleMime = String(output.mimeType ?? "");
    if (singleId) {
      return _makeContext([{ id: singleId, name: singleName, mimeType: singleMime }], 0);
    }

    return null;
  },
};

// ── Auto-register on import ───────────────────────────────────────────────────

registerContextBuilder(GoogleDriveContextBuilder);

export { GoogleDriveContextBuilder };