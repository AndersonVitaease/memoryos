/**
 * DriveRenameExecutor.ts
 *
 * 4-step orchestration for renaming files/folders in Google Drive.
 *
 * STEP-1: Validate parameters (fileId, newName)
 * STEP-2: Resolve resource (GET to verify file exists)
 * STEP-3: Execute PATCH to rename
 * STEP-4: Confirm state (verify name changed, other fields preserved)
 *
 * Error codes:
 * - FILE_ID_REQUIRED
 * - NEW_NAME_REQUIRED
 * - NEW_NAME_INVALID
 * - FILE_NOT_FOUND
 * - RENAME_ERROR
 * - RENAME_EXCEPTION
 * - VERIFICATION_ERROR
 */

import { ensureValidToken, getAccessToken } from "../google-auth/GoogleAuthSession";

const FILE_FIELDS = "id,name,mimeType,size,webViewLink,iconLink,createdTime,modifiedTime,owners(emailAddress),shared,starred,trashed,parents,description,thumbnailLink";

export interface RenameParameters {
  fileId?: string;
  fileName?: string;
  newName: string;
  _debugExecutionId?: string;
}

export interface RenamedFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  parents: string[];
  webViewLink: string | null;
}

export interface RenameResult {
  ok: boolean;
  file?: RenamedFile;
  durationMs: number;
  error?: string;
  errorCode?: string;
}

export async function executeDriveRename(
  payload: RenameParameters,
  _authToken?: string,
): Promise<RenameResult> {
  const start = Date.now();

  // STEP-0: Resolução: nome → ID (correção — nunca existia antes)
  let fileId = payload.fileId?.trim() || null;
  const fileName = payload.fileName?.trim() || null;

  if (!fileId && fileName) {
    try {
      const { searchByName } = await import("./GoogleDriveConnector");
      const results = await searchByName(fileName, { pageSize: 5 });
      const nonFolders = results.filter((f) => f.mimeType !== "application/vnd.google-apps.folder");
      if (nonFolders.length === 0) {
        return {
          ok: false,
          error: `File "${fileName}" not found in Google Drive`,
          errorCode: "FILE_NOT_FOUND",
          durationMs: Date.now() - start,
        };
      }
      fileId = nonFolders[0].id;
      console.log(`[rename][STEP-0] fileName "${fileName}" resolvido para fileId="${fileId}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Failed to resolve fileName "${fileName}": ${msg}`,
        errorCode: "FILE_NOT_FOUND",
        durationMs: Date.now() - start,
      };
    }
  }

  // STEP-1: Validate parameters
  if (!fileId) {
    return {
      ok: false,
      error: "fileId is required",
      errorCode: "FILE_ID_REQUIRED",
      durationMs: Date.now() - start,
    };
  }

  if (!payload.newName || payload.newName.trim().length === 0) {
    return {
      ok: false,
      error: "newName is required",
      errorCode: "NEW_NAME_REQUIRED",
      durationMs: Date.now() - start,
    };
  }

  const trimmedName = payload.newName.trim();

  if (trimmedName.length > 255) {
    return {
      ok: false,
      error: `File name exceeds 255 characters (got ${trimmedName.length})`,
      errorCode: "NEW_NAME_INVALID",
      durationMs: Date.now() - start,
    };
  }

  // STEP-2: Verify file exists
  try {
    await ensureValidToken("default");
    const token = getAccessToken("default");
    if (!token) {
      return {
        ok: false,
        error: "Authentication token invalid",
        errorCode: "AUTH_REQUIRED",
        durationMs: Date.now() - start,
      };
    }

    const verifyResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (verifyResponse.status === 404) {
      return {
        ok: false,
        error: `File "${payload.fileId}" not found`,
        errorCode: "FILE_NOT_FOUND",
        durationMs: Date.now() - start,
      };
    }

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      return {
        ok: false,
        error: `Failed to verify file: ${verifyResponse.status} - ${errorText}`,
        errorCode: "VERIFICATION_ERROR",
        durationMs: Date.now() - start,
      };
    }

    // STEP-3: Execute PATCH to rename
    const patchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: trimmedName }),
      },
    );

    if (!patchResponse.ok) {
      const errorText = await patchResponse.text();
      return {
        ok: false,
        error: `Rename failed: ${patchResponse.status} - ${errorText}`,
        errorCode: "RENAME_ERROR",
        durationMs: Date.now() - start,
      };
    }

    const patchData = await patchResponse.json();

    // STEP-4: Confirm state (verify name changed, other fields preserved)
    const confirmResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!confirmResponse.ok) {
      return {
        ok: false,
        error: `Confirmation check failed: ${confirmResponse.status}`,
        errorCode: "VERIFICATION_ERROR",
        durationMs: Date.now() - start,
      };
    }

    const finalData = await confirmResponse.json();

    // Verify name was actually changed
    if (finalData.name !== trimmedName) {
      return {
        ok: false,
        error: `Name verification failed: expected "${trimmedName}", got "${finalData.name}"`,
        errorCode: "VERIFICATION_ERROR",
        durationMs: Date.now() - start,
      };
    }

    return {
      ok: true,
      file: {
        id: finalData.id as string,
        name: finalData.name as string,
        mimeType: finalData.mimeType as string,
        modifiedTime: (finalData.modifiedTime as string) ?? null,
        parents: (finalData.parents as string[]) ?? [],
        webViewLink: (finalData.webViewLink as string) ?? null,
      },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message,
      errorCode: "RENAME_EXCEPTION",
      durationMs: Date.now() - start,
    };
  }
}
