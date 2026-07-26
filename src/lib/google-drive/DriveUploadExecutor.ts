/**
 * DriveUploadExecutor.ts — Sprint upload-01
 *
 * Orquestração 6-passos: Upload de arquivo para Google Drive
 *
 * Flow:
 *   [1] Validação de parâmetros (arquivo, tipo MIME, pasta destino)
 *   [2] Validação de pasta destino
 *   [3] Preparação: Encode multipart ou simple upload
 *   [4] Execução: drive.files.create com conteúdo
 *   [5] Confirmação: Verificar arquivo criado
 *   [6] Formatação: Retornar resultado estruturado
 */

import type { ConnectorRuntime } from "../connector-runtime/ConnectorRuntime";

// ── Types ──────────────────────────────────────────────────────────────────

export interface UploadParameters {
  fileName?: string;
  mimeType?: string;
  fileContent?: ArrayBuffer | Uint8Array | string;
  folderId?: string;
  description?: string;
  _debugExecutionId?: string;
}

export interface UploadedFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  folderId: string;
  webViewLink: string;
  modifiedTime: string;
  contentHash?: string;
  durationMs: number;
}

export type UploadSuccess = {
  ok: true;
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  folderId: string;
  webViewLink: string;
  modifiedTime: string;
  contentHash?: string;
  durationMs: number;
};

export type UploadFailure = {
  ok: false;
  error: string;
  code: string;
  durationMs: number;
};

export type UploadResult = UploadSuccess | UploadFailure;

// ── Error codes ────────────────────────────────────────────────────────────

const ERROR_CODES = {
  MISSING_PARAMS:       "MISSING_PARAMS",
  FILE_NAME_REQUIRED:   "FILE_NAME_REQUIRED",
  FILE_CONTENT_REQUIRED:"FILE_CONTENT_REQUIRED",
  MIME_TYPE_REQUIRED:   "MIME_TYPE_REQUIRED",
  FOLDER_NOT_FOUND:     "FOLDER_NOT_FOUND",
  UPLOAD_ERROR:         "UPLOAD_ERROR",
  UPLOAD_EXCEPTION:     "UPLOAD_EXCEPTION",
  VERIFICATION_ERROR:   "VERIFICATION_ERROR",
  FILE_TOO_LARGE:       "FILE_TOO_LARGE",
  INVALID_MIME_TYPE:    "INVALID_MIME_TYPE",
} as const;

// ── Main executor ──────────────────────────────────────────────────────────

export async function executeDriveUpload(
  payload: Record<string, unknown>,
  _authToken: string,
): Promise<UploadResult> {
  const t0 = Date.now();

  // [STEP 1] Validação de parâmetros
  const fileName = typeof payload.fileName === "string" ? payload.fileName.trim() : null;
  const mimeType = typeof payload.mimeType === "string" ? payload.mimeType.trim() : null;
  const fileContent = payload.fileContent;
  const folderId = typeof payload.folderId === "string" ? payload.folderId.trim() : "root";
  const debugExecId = typeof payload._debugExecutionId === "string" ? payload._debugExecutionId : "unknown";

  console.log(`[upload-01][STEP-1] Validação`, { fileName, mimeType, folderId, debugExecId });

  if (!fileName) {
    return {
      ok: false,
      error: "fileName is required to upload a file",
      code: ERROR_CODES.FILE_NAME_REQUIRED,
      durationMs: Date.now() - t0,
    };
  }

  if (!fileContent) {
    return {
      ok: false,
      error: "fileContent is required to upload a file",
      code: ERROR_CODES.FILE_CONTENT_REQUIRED,
      durationMs: Date.now() - t0,
    };
  }

  if (!mimeType) {
    return {
      ok: false,
      error: "mimeType is required to specify file type",
      code: ERROR_CODES.MIME_TYPE_REQUIRED,
      durationMs: Date.now() - t0,
    };
  }

  // Validate file size (max 500MB for v1.0)
  const sizeBytes = typeof fileContent === "string"
    ? new Blob([fileContent]).size
    : fileContent instanceof ArrayBuffer || fileContent instanceof Uint8Array
      ? fileContent.byteLength
      : 0;

  if (sizeBytes > 500 * 1024 * 1024) {
    return {
      ok: false,
      error: `File size ${sizeBytes} bytes exceeds 500MB limit`,
      code: ERROR_CODES.FILE_TOO_LARGE,
      durationMs: Date.now() - t0,
    };
  }

  // [STEP 2] Validação: Verificar se pasta destino existe (se não for root)
  console.log(`[upload-01][STEP-2] Validação: Verificando pasta destino`);

  if (folderId !== "root") {
    try {
      const { readFileMetadata } = await import("./GoogleDriveConnector");
      const folderResult = await readFileMetadata(folderId);

      if (!folderResult.ok || !folderResult.data) {
        return {
          ok: false,
          error: `Destination folder "${folderId}" not found`,
          code: ERROR_CODES.FOLDER_NOT_FOUND,
          durationMs: Date.now() - t0,
        };
      }

      const folderData = folderResult.data;
      if (folderData.mimeType !== "application/vnd.google-apps.folder") {
        return {
          ok: false,
          error: `Target "${folderId}" is not a folder (mimeType: ${folderData.mimeType})`,
          code: ERROR_CODES.FOLDER_NOT_FOUND,
          durationMs: Date.now() - t0,
        };
      }

      console.log(`[upload-01][STEP-2] Pasta destino verificada:`, folderData.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Failed to verify destination folder: ${msg}`,
        code: ERROR_CODES.FOLDER_NOT_FOUND,
        durationMs: Date.now() - t0,
      };
    }
  }

  // [STEP 3] Preparação: Encode multipart upload
  console.log(`[upload-01][STEP-3] Preparação: Codificando multipart upload`);

  let uploadedFile: any;
  try {
    const { uploadFile } = await import("./GoogleDriveConnector");
    
    uploadedFile = await uploadFile(
      fileName,
      mimeType,
      fileContent,
      folderId,
    );

    console.log(`[upload-01][STEP-3] Arquivo preparado para upload`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Failed to prepare upload: ${msg}`,
      code: ERROR_CODES.UPLOAD_ERROR,
      durationMs: Date.now() - t0,
    };
  }

  // [STEP 4] Execução: drive.files.create
  console.log(`[upload-01][STEP-4] Execução: Enviando arquivo para Google Drive`);

  if (!uploadedFile || !uploadedFile.id) {
    return {
      ok: false,
      error: "Upload succeeded but no fileId was returned",
      code: ERROR_CODES.UPLOAD_ERROR,
      durationMs: Date.now() - t0,
    };
  }

  // [STEP 5] Confirmação: Verificar arquivo criado
  console.log(`[upload-01][STEP-5] Confirmação: Verificando arquivo na pasta`);

  try {
    const { readFileMetadata } = await import("./GoogleDriveConnector");
    const verifyResult = await readFileMetadata(uploadedFile.id);

    if (!verifyResult.ok || !verifyResult.data) {
      return {
        ok: false,
        error: `Upload succeeded but file verification failed`,
        code: ERROR_CODES.VERIFICATION_ERROR,
        durationMs: Date.now() - t0,
      };
    }

    const verifiedFile = verifyResult.data;

    // Validate file is in correct folder
    if (folderId !== "root") {
      const isInFolder = verifiedFile.parents && verifiedFile.parents.includes(folderId);
      if (!isInFolder) {
        return {
          ok: false,
          error: `File created but not in destination folder`,
          code: ERROR_CODES.VERIFICATION_ERROR,
          durationMs: Date.now() - t0,
        };
      }
    }

    console.log(`[upload-01][STEP-5] Arquivo verificado:`, {
      fileId: verifiedFile.id,
      name: verifiedFile.name,
      size: verifiedFile.size,
      parents: verifiedFile.parents,
    });

    // [STEP 6] Formatação: Retornar resultado estruturado
    console.log(`[upload-01][STEP-6] Formatação: Preparando resposta`);

    return {
      ok: true,
      fileId: verifiedFile.id,
      fileName: verifiedFile.name,
      mimeType: verifiedFile.mimeType,
      size: verifiedFile.size,
      folderId: folderId,
      webViewLink: verifiedFile.webViewLink || `https://drive.google.com/file/d/${verifiedFile.id}/view`,
      modifiedTime: verifiedFile.modifiedTime || new Date().toISOString(),
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Failed to verify uploaded file: ${msg}`,
      code: ERROR_CODES.VERIFICATION_ERROR,
      durationMs: Date.now() - t0,
    };
  }
}
