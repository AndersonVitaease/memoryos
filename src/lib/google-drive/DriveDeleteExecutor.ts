/**
 * DriveDeleteExecutor.ts — Sprint delete-01
 *
 * 4-step orchestration for deleting a file from Google Drive.
 *
 * Pattern:
 *   execute() → GoogleDriveConnector._dispatch("drive.deleteFile", payload)
 *     → DriveDeleteExecutor (4-step orchestration)
 *       → GWS Foundation deleteFile()
 *         → Google Drive API DELETE /files/{fileId}
 */

import { ensureValidToken } from "../google-auth/GoogleAuthSession";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeleteParameters {
  fileId?: string;
  fileName?: string;
  _debugExecutionId?: string;
}

export interface DeleteResult {
  ok: boolean;
  fileId?: string;
  fileName?: string;
  durationMs?: number;
  error?: string;
  errorCode?: string;
}

// ── 4-Step Orchestration ───────────────────────────────────────────────────────

export async function executeDriveDelete(
  payload: Record<string, unknown>,
  _authToken: string,
): Promise<DeleteResult> {
  const start = Date.now();
  let fileId = typeof payload.fileId === "string" ? payload.fileId : null;
  const fileName = typeof payload.fileName === "string" ? payload.fileName.trim() : null;
  const debugExecId = typeof payload._debugExecutionId === "string" ? payload._debugExecutionId : "";

  // ─── STEP-0: Resolução: nome → ID (correção — nunca existia antes) ─────────
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
      console.log(`[delete-01][STEP-0] fileName "${fileName}" resolvido para fileId="${fileId}"`);
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

  // ─── STEP-1: Validação de parâmetros ────────────────────────────────────────
  console.log(`[delete-01][STEP-1] Validação`, { fileId, fileName, debugExecId });

  if (!fileId) {
    console.error(`[delete-01][STEP-1] Erro: fileId ausente`);
    return {
      ok: false,
      error: "File ID is required",
      errorCode: "FILE_ID_REQUIRED",
      durationMs: Date.now() - start,
    };
  }

  if (fileId.length === 0) {
    console.error(`[delete-01][STEP-1] Erro: fileId vazio`);
    return {
      ok: false,
      error: "File ID cannot be empty",
      errorCode: "FILE_ID_REQUIRED",
      durationMs: Date.now() - start,
    };
  }

  console.log(`[delete-01][STEP-1] ✓ Validação concluída: fileId=${fileId}`);

  // ─── STEP-2: Validação do arquivo (metadados) ─────────────────────────────────
  console.log(`[delete-01][STEP-2] Resolução: Carregando metadados do arquivo`);

  let fileData: Record<string, unknown>;
  try {
    const token = await ensureValidToken("default");
    if (!token) {
      console.error(`[delete-01][STEP-2] Erro: Token inválido`);
      return {
        ok: false,
        error: "Authentication token invalid or expired",
        errorCode: "AUTH_REQUIRED",
        durationMs: Date.now() - start,
      };
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (response.status === 404) {
      console.error(`[delete-01][STEP-2] Erro: Arquivo não encontrado`);
      return {
        ok: false,
        error: `File "${fileId}" not found`,
        errorCode: "FILE_NOT_FOUND",
        durationMs: Date.now() - start,
      };
    }

    if (!response.ok) {
      const errorMsg = await response.text();
      console.error(`[delete-01][STEP-2] Erro HTTP ${response.status}: ${errorMsg}`);
      return {
        ok: false,
        error: `Failed to retrieve file metadata: ${response.statusText}`,
        errorCode: "VERIFICATION_ERROR",
        durationMs: Date.now() - start,
      };
    }

    fileData = (await response.json()) as Record<string, unknown>;
    const fileName = fileData.name ?? "unknown";

    console.log(`[delete-01][STEP-2] ✓ Arquivo encontrado:`, {
      id: fileData.id,
      name: fileName,
      size: fileData.size,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[delete-01][STEP-2] Exceção:`, msg);
    return {
      ok: false,
      error: `Failed to verify file: ${msg}`,
      errorCode: "VERIFICATION_ERROR",
      durationMs: Date.now() - start,
    };
  }

  const fileName = String(fileData.name ?? "");

  // ─── STEP-3: Execução da deleção ────────────────────────────────────────────
  console.log(`[delete-01][STEP-3] Execução: Deletando arquivo`);

  try {
    const token = await ensureValidToken("default");
    if (!token) {
      console.error(`[delete-01][STEP-3] Erro: Token inválido`);
      return {
        ok: false,
        error: "Authentication token invalid or expired",
        errorCode: "AUTH_REQUIRED",
        durationMs: Date.now() - start,
      };
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok && response.status !== 204) {
      const errorMsg = await response.text();
      console.error(`[delete-01][STEP-3] Erro HTTP ${response.status}: ${errorMsg}`);
      return {
        ok: false,
        error: `Delete operation failed: ${response.statusText}`,
        errorCode: "DELETE_ERROR",
        durationMs: Date.now() - start,
      };
    }

    console.log(`[delete-01][STEP-3] ✓ Arquivo deletado com sucesso`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[delete-01][STEP-3] Exceção:`, msg);
    return {
      ok: false,
      error: `Delete operation exception: ${msg}`,
      errorCode: "DELETE_EXCEPTION",
      durationMs: Date.now() - start,
    };
  }

  // ─── STEP-4: Confirmação final ──────────────────────────────────────────────
  console.log(`[delete-01][STEP-4] Confirmação: Verificando deleção`);

  try {
    const token = await ensureValidToken("default");
    if (!token) {
      // Token issue, but file was likely deleted
      console.log(`[delete-01][STEP-4] ⚠ Não pude confirmar (token inválido), mas arquivo provavelmente deletado`);
      return {
        ok: true,
        fileId,
        fileName,
        durationMs: Date.now() - start,
      };
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (response.status === 404) {
      // Perfect: file is confirmed deleted
      console.log(`[delete-01][STEP-4] ✓ Confirmação bem-sucedida: Arquivo deletado permanentemente`);
      return {
        ok: true,
        fileId,
        fileName,
        durationMs: Date.now() - start,
      };
    }

    if (response.ok) {
      // File still exists - unexpected
      console.error(`[delete-01][STEP-4] ⚠ Arquivo ainda existe após DELETE`);
      return {
        ok: false,
        error: "File still exists after delete operation",
        errorCode: "DELETE_VERIFICATION_FAILED",
        durationMs: Date.now() - start,
      };
    }

    // Other HTTP error
    console.log(`[delete-01][STEP-4] ⚠ Não pude confirmar (HTTP ${response.status}), mas DELETE foi chamado`);
    return {
      ok: true,
      fileId,
      fileName,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    // Exception during verification, but DELETE was likely successful
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[delete-01][STEP-4] ⚠ Exceção ao confirmar (${msg}), mas DELETE foi executado`);
    return {
      ok: true,
      fileId,
      fileName,
      durationMs: Date.now() - start,
    };
  }
}
