/**
 * DriveCreateFolderExecutor.ts — Sprint create-folder-01
 *
 * 3-step orchestration for creating a folder in Google Drive.
 *
 * Pattern:
 *   execute() → GoogleDriveConnector._dispatch("drive.createFolder", payload)
 *     → DriveCreateFolderExecutor (3-step orchestration)
 *       → GWS Foundation createFolder()
 *         → Google Drive API POST /files
 */

import { ensureValidToken } from "../google-auth/GoogleAuthSession";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateFolderParameters {
  folderName: string;
  parentFolderId?: string;
  _debugExecutionId?: string;
}

export interface CreatedFolder {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  webViewLink: string;
  createdTime: string;
}

export interface CreateFolderResult {
  ok: boolean;
  folder?: CreatedFolder;
  durationMs?: number;
  error?: string;
  errorCode?: string;
}

// ── 3-Step Orchestration ───────────────────────────────────────────────────────

export async function executeDriveCreateFolder(
  payload: Record<string, unknown>,
  _authToken: string,
): Promise<CreateFolderResult> {
  const start = Date.now();
  const folderName = typeof payload.folderName === "string" ? payload.folderName : null;
  const parentFolderId = typeof payload.parentFolderId === "string" ? payload.parentFolderId : "root";
  const debugExecId = typeof payload._debugExecutionId === "string" ? payload._debugExecutionId : "";

  // ─── STEP-1: Validação de parâmetros ────────────────────────────────────────
  console.log(`[create-folder-01][STEP-1] Validação`, { folderName, parentFolderId, debugExecId });

  if (!folderName) {
    console.error(`[create-folder-01][STEP-1] Erro: folderName ausente`);
    return {
      ok: false,
      error: "Folder name is required",
      errorCode: "FOLDER_NAME_REQUIRED",
      durationMs: Date.now() - start,
    };
  }

  if (folderName.length === 0 || folderName.length > 255) {
    console.error(`[create-folder-01][STEP-1] Erro: folderName inválido`);
    return {
      ok: false,
      error: "Folder name must be 1-255 characters",
      errorCode: "FOLDER_NAME_INVALID",
      durationMs: Date.now() - start,
    };
  }

  // Google Drive restricts these characters
  if (/[<>:"|?*]/.test(folderName)) {
    console.error(`[create-folder-01][STEP-1] Erro: folderName contém caracteres inválidos`);
    return {
      ok: false,
      error: "Folder name contains invalid characters: < > : \" | ? *",
      errorCode: "FOLDER_NAME_INVALID",
      durationMs: Date.now() - start,
    };
  }

  console.log(`[create-folder-01][STEP-1] ✓ Validação concluída`);

  // ─── STEP-2: Validação da pasta pai (se especificada) ───────────────────────
  console.log(`[create-folder-01][STEP-2] Resolução: Verificando pasta pai`);

  if (parentFolderId !== "root") {
    try {
      const token = await ensureValidToken("drive");
      if (!token) {
        console.error(`[create-folder-01][STEP-2] Erro: Token inválido`);
        return {
          ok: false,
          error: "Authentication token invalid or expired",
          errorCode: "AUTH_REQUIRED",
          durationMs: Date.now() - start,
        };
      }

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${parentFolderId}?fields=id,mimeType`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.status === 404) {
        console.error(`[create-folder-01][STEP-2] Erro: Pasta pai não encontrada`);
        return {
          ok: false,
          error: `Parent folder "${parentFolderId}" not found`,
          errorCode: "PARENT_FOLDER_NOT_FOUND",
          durationMs: Date.now() - start,
        };
      }

      if (!response.ok) {
        const errorMsg = await response.text();
        console.error(`[create-folder-01][STEP-2] Erro HTTP ${response.status}: ${errorMsg}`);
        return {
          ok: false,
          error: `Failed to verify parent folder: ${response.statusText}`,
          errorCode: "VERIFICATION_ERROR",
          durationMs: Date.now() - start,
        };
      }

      const parentData = (await response.json()) as Record<string, unknown>;
      console.log(`[create-folder-01][STEP-2] ✓ Pasta pai verificada:`, {
        id: parentData.id,
        mimeType: parentData.mimeType,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[create-folder-01][STEP-2] Exceção:`, msg);
      return {
        ok: false,
        error: `Failed to verify parent folder: ${msg}`,
        errorCode: "VERIFICATION_ERROR",
        durationMs: Date.now() - start,
      };
    }
  } else {
    console.log(`[create-folder-01][STEP-2] ✓ Usando raiz como pasta pai`);
  }

  // ─── STEP-3: Criação da pasta ───────────────────────────────────────────────
  console.log(`[create-folder-01][STEP-3] Execução: Criando pasta`);

  let createdFolder: CreatedFolder;
  try {
    const token = await ensureValidToken("drive");
    if (!token) {
      console.error(`[create-folder-01][STEP-3] Erro: Token inválido`);
      return {
        ok: false,
        error: "Authentication token invalid or expired",
        errorCode: "AUTH_REQUIRED",
        durationMs: Date.now() - start,
      };
    }

    const metadata = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    };

    const fields = "id,name,mimeType,parents,webViewLink,createdTime";
    const url = `https://www.googleapis.com/drive/v3/files?fields=${fields}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metadata),
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      console.error(`[create-folder-01][STEP-3] Erro HTTP ${response.status}: ${errorMsg}`);
      return {
        ok: false,
        error: `Create folder operation failed: ${response.statusText}`,
        errorCode: "CREATE_ERROR",
        durationMs: Date.now() - start,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    createdFolder = {
      id: String(data.id ?? ""),
      name: String(data.name ?? ""),
      mimeType: String(data.mimeType ?? ""),
      parents: Array.isArray(data.parents) ? (data.parents as string[]) : [],
      webViewLink: String(data.webViewLink ?? ""),
      createdTime: String(data.createdTime ?? ""),
    };

    console.log(`[create-folder-01][STEP-3] ✓ Pasta criada com sucesso`, {
      id: createdFolder.id,
      name: createdFolder.name,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[create-folder-01][STEP-3] Exceção:`, msg);
    return {
      ok: false,
      error: `Create folder operation exception: ${msg}`,
      errorCode: "CREATE_EXCEPTION",
      durationMs: Date.now() - start,
    };
  }

  // ─── Confirmação final ──────────────────────────────────────────────────────
  console.log(`[create-folder-01][STEP-3] ✓ Confirmação: Pasta criada com ID ${createdFolder.id}`);

  return {
    ok: true,
    folder: createdFolder,
    durationMs: Date.now() - start,
  };
}
