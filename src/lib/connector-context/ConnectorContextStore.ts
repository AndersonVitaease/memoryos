/**
 * ConnectorContextStore.ts
 *
 * Generic, session-scoped context store for any connector.
 *
 * Design principles:
 *   - SRP: sole responsibility is storing/retrieving per-connector contexts.
 *   - No global singletons: state lives inside ConversationState via
 *     connectorContexts[connectorId].
 *   - Immutable snapshots: every write produces a new frozen object.
 *   - Zero connector-specific knowledge: the store is purely structural.
 *   - Scalable: supports N connectors (google-drive, gmail, calendar, github,
 *     notion, dropbox, ...) without any schema changes.
 *
 * Usage (writer — e.g. ConnectorResultSynthesizer):
 *   import { buildDriveContext } from "@/lib/connector-context/ConnectorContextStore";
 *   store.setConnectorContext("google-drive", buildDriveContext(files));
 *
 * Usage (reader — e.g. DriveDownloadExecutor):
 *   import { readDriveContext } from "@/lib/connector-context/ConnectorContextStore";
 *   const ctx = readDriveContext(store.getConnectorContext("google-drive"));
 */

// ── Generic base ──────────────────────────────────────────────────────────────

/**
 * Every connector context must carry these mandatory fields.
 * The rest is connector-specific and typed via the generic parameter.
 */
export interface BaseConnectorContext {
  /** Connector identifier matching ConnectorRegistry IDs */
  connectorId: string;
  /** ms timestamp of last write */
  updatedAt: number;
}

/**
 * Map of connectorId → opaque context blob.
 * The ConversationState holds one of these per session.
 */
export type ConnectorContextMap = Record<string, BaseConnectorContext>;

// ── Google Drive context ──────────────────────────────────────────────────────

/**
 * A file entry as returned by any Drive list/search/get operation.
 * mimeType is metadata only — never used as a search filter.
 */
export interface DriveFileEntry {
  id:       string;
  name:     string;
  mimeType: string;
}

/**
 * Drive-specific connector context.
 * Tracks the full result set from the last Drive operation plus
 * the user's current selection within that set.
 *
 * selectedIndex defaults to 0 (first presented file) but can be updated
 * when the user says "o terceiro", "esse", "o contrato", etc.
 */
export interface DriveConnectorContext extends BaseConnectorContext {
  connectorId:      "google-drive";
  files:            DriveFileEntry[];
  selectedIndex:    number;
  selectedFileId:   string;
  selectedFileName: string;
}

// ── Builder helpers ───────────────────────────────────────────────────────────

/**
 * Build an immutable DriveConnectorContext from a list of files.
 * selectedIndex defaults to 0 (first file presented to the user).
 * Call updateDriveSelection() to change the selection later.
 */
export function buildDriveContext(
  files: DriveFileEntry[],
  selectedIndex = 0,
): DriveConnectorContext {
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
 * Return an updated DriveConnectorContext with a new selection.
 * Use this when the user refers to a specific file by position or name
 * ("o terceiro", "o contrato", "aquele", etc.) before executing download.
 */
export function updateDriveSelection(
  ctx: DriveConnectorContext,
  newIndex: number,
): DriveConnectorContext {
  const idx  = Math.max(0, Math.min(newIndex, ctx.files.length - 1));
  const file = ctx.files[idx];
  return Object.freeze<DriveConnectorContext>({
    ...ctx,
    selectedIndex:    idx,
    selectedFileId:   file?.id   ?? ctx.selectedFileId,
    selectedFileName: file?.name ?? ctx.selectedFileName,
    updatedAt:        Date.now(),
  });
}

/**
 * Safely cast a BaseConnectorContext to DriveConnectorContext.
 * Returns null if the context is missing or belongs to a different connector.
 */
export function readDriveContext(
  ctx: BaseConnectorContext | undefined | null,
): DriveConnectorContext | null {
  if (!ctx || ctx.connectorId !== "google-drive") return null;
  return ctx as DriveConnectorContext;
}