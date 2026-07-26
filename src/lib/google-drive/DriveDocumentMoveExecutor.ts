/**
 * DriveDocumentMoveExecutor.ts — Sprint org-02
 *
 * Orquestração 7-passos: Mover arquivo de uma pasta para outra
 *
 * Flow:
 *   [1] Validação de parâmetros
 *   [2] Resolução de fileId (buscar metadados)
 *   [3] Validação de pasta destino
 *   [4] Obtenção de parent atual
 *   [5] Execução: drive.files.update com addParents/removeParents
 *   [6] Confirmação: Verificar nova localização
 *   [7] Formatação: Retornar resultado estruturado
 */

import type { ConnectorRuntime } from "../connector-runtime/ConnectorRuntime";

// ── Types ──────────────────────────────────────────────────────────────────

export interface MoveParameters {
  fileId?: string;
  fileName?: string;
  newParentId?: string;
  newFolderName?: string;
  _debugExecutionId?: string;
}

export interface MovedFile {
  fileId: string;
  fileName: string;
  previousParentId: string | null;
  newParentId: string;
  mimeType: string;
  modifiedTime: string | null;
  durationMs: number;
}

export type MoveSuccess = {
  ok: true;
  fileId: string;
  fileName: string;
  previousParentId: string | null;
  newParentId: string;
  mimeType: string;
  modifiedTime: string | null;
  durationMs: number;
};

export type MoveFailure = {
  ok: false;
  error: string;
  code: string;
  durationMs: number;
};

export type MoveResult = MoveSuccess | MoveFailure;

// ── Error codes ────────────────────────────────────────────────────────────

const ERROR_CODES = {
  MISSING_PARAMS:       "MISSING_PARAMS",
  FILE_ID_REQUIRED:     "FILE_ID_REQUIRED",
  PARENT_ID_REQUIRED:   "PARENT_ID_REQUIRED",
  FILE_NOT_FOUND:       "FILE_NOT_FOUND",
  FOLDER_NOT_FOUND:     "FOLDER_NOT_FOUND",
  SAME_LOCATION:        "SAME_LOCATION",
  MOVE_ERROR:           "MOVE_ERROR",
  MOVE_EXCEPTION:       "MOVE_EXCEPTION",
  VERIFICATION_ERROR:   "VERIFICATION_ERROR",
} as const;

// ── Main executor ──────────────────────────────────────────────────────────

export async function executeDriveDocumentMove(
  payload: Record<string, unknown>,
  _authToken: string,
): Promise<MoveResult> {
  const t0 = Date.now();

  // [STEP 1] Validação de parâmetros
  const fileId = typeof payload.fileId === "string" ? payload.fileId.trim() : null;
  const fileName = typeof payload.fileName === "string" ? payload.fileName.trim() : null;
  const newParentId = typeof payload.newParentId === "string" ? payload.newParentId.trim() : null;
  const debugExecId = typeof payload._debugExecutionId === "string" ? payload._debugExecutionId : "unknown";

  console.log(`[org-02][STEP-1] Validação`, { fileId, fileName, newParentId, debugExecId });

  if (!fileId) {
    return {
      ok: false,
      error: "fileId is required to move a file",
      code: ERROR_CODES.FILE_ID_REQUIRED,
      durationMs: Date.now() - t0,
    };
  }

  if (!newParentId) {
    return {
      ok: false,
      error: "newParentId is required to specify destination folder",
      code: ERROR_CODES.PARENT_ID_REQUIRED,
      durationMs: Date.now() - t0,
    };
  }

  // [STEP 2] Resolução: Obter metadados do arquivo
  console.log(`[org-02][STEP-2] Resolução: Carregando metadados do arquivo`);

  let fileMetadata: any;
  try {
    const { readFileMetadata } = await import("./GoogleDriveConnector");
    const result = await readFileMetadata(fileId);

    if (!result.ok || !result.data) {
      return {
        ok: false,
        error: `File "${fileId}" not found in Google Drive`,
        code: ERROR_CODES.FILE_NOT_FOUND,
        durationMs: Date.now() - t0,
      };
    }

    fileMetadata = result.data;
    console.log(`[org-02][STEP-2] Arquivo encontrado:`, {
      name: fileMetadata.name,
      mimeType: fileMetadata.mimeType,
      currentParents: fileMetadata.parents,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Failed to load file metadata: ${msg}`,
      code: ERROR_CODES.FILE_NOT_FOUND,
      durationMs: Date.now() - t0,
    };
  }

  // [STEP 3] Validação: Verificar se pasta destino existe
  console.log(`[org-02][STEP-3] Validação: Verificando pasta destino`);

  try {
    const { readFileMetadata } = await import("./GoogleDriveConnector");
    const folderResult = await readFileMetadata(newParentId);

    if (!folderResult.ok || !folderResult.data) {
      return {
        ok: false,
        error: `Destination folder "${newParentId}" not found`,
        code: ERROR_CODES.FOLDER_NOT_FOUND,
        durationMs: Date.now() - t0,
      };
    }

    const folderData = folderResult.data;
    if (folderData.mimeType !== "application/vnd.google-apps.folder") {
      return {
        ok: false,
        error: `Target "${newParentId}" is not a folder (mimeType: ${folderData.mimeType})`,
        code: ERROR_CODES.FOLDER_NOT_FOUND,
        durationMs: Date.now() - t0,
      };
    }

    console.log(`[org-02][STEP-3] Pasta destino verificada:`, folderData.name);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Failed to verify destination folder: ${msg}`,
      code: ERROR_CODES.FOLDER_NOT_FOUND,
      durationMs: Date.now() - t0,
    };
  }

  // [STEP 4] Obtenção de parent atual
  console.log(`[org-02][STEP-4] Obtenção: Parent atual`);

  const previousParentId = fileMetadata.parents && fileMetadata.parents.length > 0
    ? fileMetadata.parents[0]
    : null;

  // Validar se arquivo já está nessa pasta
  if (previousParentId === newParentId) {
    return {
      ok: false,
      error: `File is already in folder "${newParentId}"`,
      code: ERROR_CODES.SAME_LOCATION,
      durationMs: Date.now() - t0,
    };
  }

  console.log(`[org-02][STEP-4] Parent atual:`, previousParentId);

  // [STEP 5] Execução: drive.files.update com addParents/removeParents
  console.log(`[org-02][STEP-5] Execução: Movendo arquivo`);

  let updatedFile: any;
  try {
    const { moveFile } = await import("./GoogleDriveConnector");
    updatedFile = await moveFile(fileId, newParentId, previousParentId ?? undefined);
    console.log(`[org-02][STEP-5] Arquivo movido com sucesso`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[org-02][STEP-5] Erro ao mover:`, msg);
    return {
      ok: false,
      error: `Failed to move file: ${msg}`,
      code: ERROR_CODES.MOVE_ERROR,
      durationMs: Date.now() - t0,
    };
  }

  // [STEP 6] Confirmação: Verificar nova localização
  console.log(`[org-02][STEP-6] Confirmação: Verificando nova localização`);

  try {
    const { readFileMetadata } = await import("./GoogleDriveConnector");
    const confirmResult = await readFileMetadata(fileId);

    if (!confirmResult.ok || !confirmResult.data) {
      return {
        ok: false,
        error: `Failed to verify file after move`,
        code: ERROR_CODES.VERIFICATION_ERROR,
        durationMs: Date.now() - t0,
      };
    }

    const confirmedFile = confirmResult.data;

    // Validar que arquivo está na pasta correta
    if (!confirmedFile.parents.includes(newParentId)) {
      return {
        ok: false,
        error: `File was not found in destination folder after move (parents: ${confirmedFile.parents.join(",")})`,
        code: ERROR_CODES.VERIFICATION_ERROR,
        durationMs: Date.now() - t0,
      };
    }

    // Validar que fileId permaneceu o mesmo
    if (confirmedFile.id !== fileId) {
      return {
        ok: false,
        error: `File ID mismatch after move`,
        code: ERROR_CODES.VERIFICATION_ERROR,
        durationMs: Date.now() - t0,
      };
    }

    console.log(`[org-02][STEP-6] Confirmação bem-sucedida:`, {
      fileId: confirmedFile.id,
      newParents: confirmedFile.parents,
    });

    updatedFile = confirmedFile;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Verification failed: ${msg}`,
      code: ERROR_CODES.VERIFICATION_ERROR,
      durationMs: Date.now() - t0,
    };
  }

  // [STEP 7] Formatação: Retornar resultado estruturado
  console.log(`[org-02][STEP-7] Formatação: Resultado final`);

  return {
    ok: true,
    fileId: updatedFile.id,
    fileName: updatedFile.name,
    previousParentId,
    newParentId,
    mimeType: updatedFile.mimeType,
    modifiedTime: updatedFile.modifiedTime ?? null,
    durationMs: Date.now() - t0,
  };
}
