/**
 * GoogleDriveContextBuilder.ts
 *
 * Google Drive implementation of IConnectorContextBuilder.
 *
 * Responsibilities:
 *   - Define DriveFileEntry and DriveConnectorContext (Drive-specific types).
 *   - Implement build(request) to extract file context from any Drive step output.
 *   - Export readDriveContext() for DriveDownloadExecutor to read its own slot.
 *   - Export updateDriveSelection() for future Selection Resolution Engine.
 *
 * Registration:
 *   - NOT self-registering. Registered explicitly in ConnectorContextBootstrap.
 *
 * Search policy:
 *   - Drive ALWAYS searches across ALL file types.
 *   - mimeType is treated as metadata only — never used as a search predicate.
 *   - The user expresses intent ("meu contrato", "a planilha") and the engine resolves.
 *
 * SRP: sole responsibility is Drive context building and reading.
 */

import type { BaseConnectorContext }           from "../ConnectorContextStore";
import type {
  IConnectorContextBuilder,
  ConnectorContextBuildRequest,
}                                              from "../ConnectorContextBuilderRegistry";
import { RuntimeDebug }                       from "@/lib/debug/RuntimeDebug";

// ── Drive-specific types ──────────────────────────────────────────────────────

/**
 * A file entry from any Drive list / search / get / download operation.
 * mimeType is metadata only — never a search predicate.
 */
export interface DriveFileEntry {
  id:       string;
  name:     string;
  mimeType: string;
}

/**
 * Drive connector context stored in ConversationState.connectorContexts["google-drive"].
 *
 * selectedIndex: current user selection within files[]. Defaults to 0.
 *   Updated via updateDriveSelection() when the Selection Resolution Engine
 *   resolves phrases like "o terceiro", "esse", "aquele", "o contrato", etc.
 *
 * The context is immutable after construction (Object.freeze).
 * Mutations produce a new frozen object via updateDriveSelection().
 */
export interface DriveConnectorContext extends BaseConnectorContext {
  connectorId:      "google-drive";
  files:            readonly DriveFileEntry[];
  selectedIndex:    number;
  selectedFileId:   string;
  selectedFileName: string;
  /** Capability that produced this context (e.g. "drive.files.list") */
  capability:       string;
  /** Execution metadata carried through for observability */
  executionId?:     string;
  durationMs?:      number;
}

// ── Pure factory ──────────────────────────────────────────────────────────────

function _makeContext(
  files:     DriveFileEntry[],
  index:     number,
  capability: string,
  meta:      ConnectorContextBuildRequest["executionMetadata"],
): DriveConnectorContext {
  const idx  = Math.max(0, Math.min(index, files.length - 1));
  const file = files[idx] ?? files[0];
  return Object.freeze<DriveConnectorContext>({
    connectorId:      "google-drive",
    files:            Object.freeze([...files]),
    selectedIndex:    idx,
    selectedFileId:   file?.id   ?? "",
    selectedFileName: file?.name ?? "",
    capability,
    executionId:      meta.executionId,
    durationMs:       meta.durationMs,
    updatedAt:        meta.timestamp ?? Date.now(),
  });
}

// ── Selection API — prepared for Selection Resolution Engine ──────────────────

/**
 * Return an updated DriveConnectorContext reflecting a new user selection.
 * Call this when the Selection Resolution Engine resolves a reference
 * ("o terceiro", "o contrato", "aquele", "esse mesmo") to a specific index.
 *
 * Does not mutate — always returns a new frozen object.
 */
export function updateDriveSelection(
  ctx:      DriveConnectorContext,
  newIndex: number,
): DriveConnectorContext {
  return _makeContext(
    [...ctx.files],
    newIndex,
    ctx.capability,
    { executionId: ctx.executionId, durationMs: ctx.durationMs, timestamp: Date.now() },
  );
}

/**
 * Safely narrow a BaseConnectorContext to DriveConnectorContext.
 * Returns null when context is absent or belongs to a different connector.
 * Used by DriveDownloadExecutor to read its own session slot.
 */
export function readDriveContext(
  ctx: BaseConnectorContext | undefined | null,
): DriveConnectorContext | null {
  if (!ctx || ctx.connectorId !== "google-drive") return null;
  return ctx as DriveConnectorContext;
}

// ── Builder implementation ────────────────────────────────────────────────────

export const GoogleDriveContextBuilder: IConnectorContextBuilder = {
  connectorId: "google-drive",

  build(request: ConnectorContextBuildRequest): DriveConnectorContext | null {
    const { capability, output, executionMetadata } = request;

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

      if (files.length > 0) {
        const ctx = _makeContext(files, 0, capability, executionMetadata);
        RuntimeDebug.emit({
          executionId: executionMetadata.executionId ?? "unknown",
          connector:   "google-drive",
          source:      "DriveContextBuilder",
          event:       "built context from file list",
          payload: {
            capability,
            fileCount:        files.length,
            selectedFileId:   ctx.selectedFileId,
            selectedFileName: ctx.selectedFileName,
            fileNames:        files.slice(0, 5).map((f) => f.name),
          },
        });
        return ctx;
      }
    }

    // Case 2: single-file result — drive.files.get / drive.downloadFile
    const singleId   = String(output.fileId ?? output.id   ?? "");
    const singleName = String(output.fileName ?? output.name ?? "");
    const singleMime = String(output.mimeType ?? "");
    if (singleId) {
      const ctx = _makeContext(
        [{ id: singleId, name: singleName, mimeType: singleMime }],
        0,
        capability,
        executionMetadata,
      );
      RuntimeDebug.emit({
        executionId: executionMetadata.executionId ?? "unknown",
        connector:   "google-drive",
        source:      "DriveContextBuilder",
        event:       "built context from single file",
        payload: {
          capability,
          selectedFileId:   ctx.selectedFileId,
          selectedFileName: ctx.selectedFileName,
        },
      });
      return ctx;
    }

    RuntimeDebug.emit({
      executionId: executionMetadata.executionId ?? "unknown",
      connector:   "google-drive",
      source:      "DriveContextBuilder",
      event:       "could not build context — no files and no singleId",
      payload: {
        capability,
        outputKeys: Object.keys(output),
      },
    });
    return null;
  },
};