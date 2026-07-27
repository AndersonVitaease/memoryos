/**
 * DriveCopyExecutor.ts
 *
 * 4-step orchestration for copying files/folders in Google Drive.
 *
 * STEP-1: Validate parameters (fileId required)
 * STEP-2: Resolve resource (GET to verify source file exists)
 * STEP-3: Execute POST to copy
 * STEP-4: Confirm copy created (verify new fileId, content preserved)
 *
 * Error codes:
 * - FILE_ID_REQUIRED
 * - FILE_NOT_FOUND
 * - COPY_ERROR
 * - COPY_EXCEPTION
 * - VERIFICATION_ERROR
 * - AUTH_REQUIRED
 */

import { ensureValidToken } from "../google-auth/GoogleAuthSession";

const FILE_FIELDS = "id,name,mimeType,size,webViewLink,iconLink,createdTime,modifiedTime,owners(emailAddress),shared,starred,trashed,parents,description,thumbnailLink";

export interface CopyParameters {
  fileId?: string;
  fileName?: string;
  newName?: string;
  parentFolderId?: string;
  _debugExecutionId?: string;
}

export interface CopiedFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  createdTime: string | null;
  modifiedTime: string | null;
  webViewLink: string | null;
}

export interface CopyResult {
  ok: boolean;
  file?: CopiedFile;
  durationMs: number;
  error?: string;
  errorCode?: string;
}

export async function executeDriveCopy(
  payload: CopyParameters,
  _authToken?: string,
): Promise<CopyResult> {
  const start = Date.now();

  // STEP-0: Resolução: nome → ID (correção — nunca existia antes)
  let fileId = payload.fileId?.trim() || null;
  const sourceFileName = payload.fileName?.trim() || null;

  if (!fileId && sourceFileName) {
    try {
      const { searchByName } = await import("./GoogleDriveConnector");
      const results = await searchByName(sourceFileName, { pageSize: 5 });
      const nonFolders = results.filter((f) => f.mimeType !== "application/vnd.google-apps.folder");
      if (nonFolders.length === 0) {
        return {
          ok: false,
          error: `File "${sourceFileName}" not found in Google Drive`,
          errorCode: "FILE_NOT_FOUND",
          durationMs: Date.now() - start,
        };
      }
      fileId = nonFolders[0].id;
      console.log(`[copy][STEP-0] fileName "${sourceFileName}" resolvido para fileId="${fileId}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Failed to resolve fileName "${sourceFileName}": ${msg}`,
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

  const newName = payload.newName?.trim();
  const parentFolderId = payload.parentFolderId?.trim();

  try {
    const token = await ensureValidToken("drive");
    if (!token) {
      return {
        ok: false,
        error: "Authentication token invalid",
        errorCode: "AUTH_REQUIRED",
        durationMs: Date.now() - start,
      };
    }

    // STEP-2: Verify source file exists
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
        error: `Source file "${fileId}" not found`,
        errorCode: "FILE_NOT_FOUND",
        durationMs: Date.now() - start,
      };
    }

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      return {
        ok: false,
        error: `Failed to verify source file: ${verifyResponse.status} - ${errorText}`,
        errorCode: "VERIFICATION_ERROR",
        durationMs: Date.now() - start,
      };
    }

    // STEP-3: Execute POST to copy
    const copyBody: Record<string, unknown> = {};
    if (newName) {
      copyBody.name = newName;
    }
    if (parentFolderId) {
      copyBody.parents = [parentFolderId];
    }

    const copyResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy?fields=${FILE_FIELDS}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: Object.keys(copyBody).length > 0 ? JSON.stringify(copyBody) : undefined,
      },
    );

    if (!copyResponse.ok) {
      const errorText = await copyResponse.text();
      return {
        ok: false,
        error: `Copy failed: ${copyResponse.status} - ${errorText}`,
        errorCode: "COPY_ERROR",
        durationMs: Date.now() - start,
      };
    }

    const copyData = await copyResponse.json();

    // STEP-4: Confirm copy created
    const confirmResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(copyData.id)}?fields=${FILE_FIELDS}`,
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

    // Verify copy has new fileId
    if (finalData.id === fileId) {
      return {
        ok: false,
        error: "Copy verification failed: new fileId same as source",
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
        parents: (finalData.parents as string[]) ?? [],
        createdTime: (finalData.createdTime as string) ?? null,
        modifiedTime: (finalData.modifiedTime as string) ?? null,
        webViewLink: (finalData.webViewLink as string) ?? null,
      },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message,
      errorCode: "COPY_EXCEPTION",
      durationMs: Date.now() - start,
    };
  }
}
