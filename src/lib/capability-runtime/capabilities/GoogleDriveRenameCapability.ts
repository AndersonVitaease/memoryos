/**
 * GoogleDriveRenameCapability.ts
 *
 * ICapability adapter for rename-01 (rename files/folders in Google Drive).
 *
 * Implements the capability interface and delegates to connectorRuntime._dispatch().
 */

import type { ICapability, CapabilityMetadata } from "./ICapability";
import type { ConnectorRuntime } from "../connector-runtime/types/ConnectorRuntime";

export class GoogleDriveRenameCapability implements ICapability {
  metadata(): CapabilityMetadata {
    return {
      id: "rename-01",
      name: "Google Drive Rename",
      description: "Rename files and folders in Google Drive. Only the name field is modified.",
      category: "storage",
      operations: [
        {
          id: "drive.renameFile",
          name: "Rename File/Folder",
          description: "Rename a file or folder by fileId",
          inputSchema: {
            fileId: { type: "string", required: true, description: "The file/folder ID" },
            newName: { type: "string", required: true, description: "New name (1-255 chars)" },
          },
        },
      ],
      namespace: "google-drive",
      supportedLanguages: ["pt-BR", "en"],
      version: "1.0.0",
      tags: ["google-drive", "rename", "file-management"],
    };
  }

  validate(operation: string, payload: any): boolean {
    if (operation !== "drive.renameFile") return false;
    return payload && typeof payload.fileId === "string" && typeof payload.newName === "string";
  }

  async initialize(): Promise<void> {
    // No initialization needed for rename capability
  }

  async shutdown(): Promise<void> {
    // No shutdown needed for rename capability
  }

  async execute(
    operation: string,
    payload: any,
    context: any,
    connectorRuntime: ConnectorRuntime,
  ): Promise<any> {
    if (operation !== "drive.renameFile") {
      return { ok: false, error: "Unknown operation", errorCode: "UNKNOWN_OPERATION" };
    }

    return connectorRuntime._dispatch("drive.renameFile", payload);
  }
}
