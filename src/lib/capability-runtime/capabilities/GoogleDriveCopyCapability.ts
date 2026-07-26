/**
 * GoogleDriveCopyCapability.ts
 *
 * ICapability adapter for copy-01 (copy/duplicate files in Google Drive).
 *
 * Implements the capability interface and delegates to connectorRuntime._dispatch().
 */

import type { ICapability, CapabilityMetadata } from "./ICapability";
import type { ConnectorRuntime } from "../connector-runtime/types/ConnectorRuntime";

export class GoogleDriveCopyCapability implements ICapability {
  metadata(): CapabilityMetadata {
    return {
      id: "copy-01",
      name: "Google Drive Copy",
      description: "Copy/duplicate files and folders in Google Drive. Content and permissions are preserved.",
      category: "storage",
      operations: [
        {
          id: "drive.copyFile",
          name: "Copy File/Folder",
          description: "Create a copy of a file or folder by fileId",
          inputSchema: {
            fileId: { type: "string", required: true, description: "The file/folder ID to copy" },
            newName: { type: "string", required: false, description: "Name for the copy" },
            parentFolderId: { type: "string", required: false, description: "Target folder for the copy" },
          },
        },
      ],
      namespace: "google-drive",
      supportedLanguages: ["pt-BR", "en"],
      version: "1.0.0",
      tags: ["google-drive", "copy", "duplicate", "file-management"],
    };
  }

  validate(operation: string, payload: any): boolean {
    if (operation !== "drive.copyFile") return false;
    return payload && typeof payload.fileId === "string";
  }

  async initialize(): Promise<void> {
    // No initialization needed for copy capability
  }

  async shutdown(): Promise<void> {
    // No shutdown needed for copy capability
  }

  async execute(
    operation: string,
    payload: any,
    context: any,
    connectorRuntime: ConnectorRuntime,
  ): Promise<any> {
    if (operation !== "drive.copyFile") {
      return { ok: false, error: "Unknown operation", errorCode: "UNKNOWN_OPERATION" };
    }

    return connectorRuntime._dispatch("drive.copyFile", payload);
  }
}
